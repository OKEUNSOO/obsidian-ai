import { type ChildProcess,spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { findCodexCli } from '../codex/CodexCliResolver';
import type { ObsidianCodeSettings } from '../types/settings';
import type { ProviderEvent, ProviderQuery } from './types';

export class CodexProvider {
  private currentProcess: ChildProcess | null = null;

  constructor(private readonly getSettings: () => ObsidianCodeSettings) {}

  async *query(input: ProviderQuery): AsyncGenerator<ProviderEvent> {
    const settings = this.getSettings();
    const env = this.buildEnv(settings.environmentVariables);
    const codexPath = findCodexCli(settings.codexCliPath ?? '', env.PATH);

    if (!codexPath) {
      yield { type: 'error', content: 'Codex CLI not found. Set the Codex CLI path in settings.' };
      yield { type: 'done' };
      return;
    }

    env.PATH = `${path.dirname(codexPath)}${path.delimiter}${env.PATH || ''}`;
    const prompt = this.buildPrompt(input);
    const outputPath = path.join(os.tmpdir(), `obsidianai-codex-${Date.now()}.md`);

    const args = [
      'exec',
      '--color', 'never',
      '--output-last-message', outputPath,
      '--skip-git-repo-check',
      '--cd', input.cwd,
      '--model', input.modelOverride ?? settings.codexModel ?? 'gpt-5.5',
      '--config', `model_reasoning_effort="${settings.codexReasoningEffort ?? 'medium'}"`,
    ];

    if (settings.permissionMode === 'yolo') {
      args.splice(1, 0, '--dangerously-bypass-approvals-and-sandbox');
    } else {
      args.splice(1, 0, '--sandbox', 'workspace-write');
    }

    const shell = process.platform === 'win32' && /codex\.cmd$/i.test(codexPath);
    yield* this.runProcess(codexPath, args, env, prompt, outputPath, shell);
    yield { type: 'done' };
  }

  cancel(): void {
    this.currentProcess?.kill();
    this.currentProcess = null;
  }

  private buildEnv(envVars: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const line of envVars.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return env;
  }

  private buildPrompt(input: ProviderQuery): string {
    const parts = ['You are running inside an Obsidian vault. Keep edits vault-scoped unless explicitly told otherwise.'];
    if (input.activeNotePath && input.activeNoteContent) {
      parts.push(`\n\n<active_obsidian_note path="${input.activeNotePath}">\n${input.activeNoteContent}\n</active_obsidian_note>`);
    }
    if (input.selectedText) {
      parts.push(`\n\n<selected_text>\n${input.selectedText}\n</selected_text>`);
    }
    parts.push(`\n\n<user_request>\n${input.prompt}\n</user_request>`);
    return parts.join('');
  }

  private async *runProcess(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    stdin: string,
    outputPath: string,
    shell: boolean,
  ): AsyncGenerator<ProviderEvent> {
    const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'], shell, windowsHide: true });
    this.currentProcess = child;
    child.stdin?.end(stdin);

    const queue: ProviderEvent[] = [];
    let stdoutBuf = '';
    let stderrBuf = '';
    let done = false;
    let exitCode: number | null = null;

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {
        const p = this.formatProgress(line);
        if (p) queue.push({ type: 'progress', content: p });
      }
    });
    child.stderr.on('data', (c: Buffer) => { stderrBuf += c.toString(); });
    child.on('error', (e) => { queue.push({ type: 'error', content: e.message }); done = true; });
    child.on('close', (code) => {
      exitCode = code;
      if (code && code !== 0) {
        queue.push({ type: 'error', content: `Codex exited with code ${code}.\n${stderrBuf.trim()}` });
      }
      done = true;
    });

    while (!done || queue.length > 0) {
      const event = queue.shift();
      if (event) yield event;
      else await new Promise((r) => setTimeout(r, 40));
    }

    if (exitCode === 0) {
      try {
        const msg = fs.readFileSync(outputPath, 'utf8').trim();
        if (msg) yield { type: 'text', content: msg };
      } catch { /* no output file */ }
      try { fs.unlinkSync(outputPath); } catch { /* best-effort */ }
    }
    this.currentProcess = null;
  }

  private formatProgress(line: string): string {
    const cleaned = line.replace(/\[[0-9;?]*[ -/]*[@-~]/g, '').trim();
    if (!cleaned || /^(user|codex)$/i.test(cleaned) || /^[┌└├│─╭╰]/.test(cleaned)) return '';
    if (/^(•|-) /i.test(cleaned)) return cleaned.slice(0, 240);
    if (/^(tokens used|OpenAI Codex|workdir:|model:|approval:|sandbox:|session id:)\b/i.test(cleaned)) return cleaned;
    if (/\bERROR\b/.test(cleaned)) return cleaned;
    if (/^(read|write|edit|run|exec|search|create|delete|build|test|commit)\b/i.test(cleaned)) return cleaned.slice(0, 240);
    return '';
  }
}
