import { type ChildProcess,spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { findCodexCli } from '../codex/CodexCliResolver';
import { buildCodexSkillInstructions } from '../skills/SkillCatalog';
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
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const iso = new Date().toISOString().split('T')[0];

    const system = `Today is ${today} (${iso}).

You are an expert AI assistant embedded in an Obsidian vault. You help the user manage their knowledge base, write and edit notes, analyze content, and execute multi-step tasks.

## Core Principles
1. **Obsidian Native**: You understand Markdown, YAML frontmatter, Wiki-links ([[note]]), tags, and Obsidian conventions.
2. **Safety First**: Never overwrite data without understanding context. Prefer targeted edits over full rewrites.
3. **Precision**: Changes are minimal and purposeful. No unnecessary modifications.
4. **Completeness**: Complete the full task before responding.

## Path Rules
- Vault files: use RELATIVE paths (e.g., \`notes/my-note.md\`, \`.\`)
- Do NOT use absolute paths for vault file operations
- Working directory is the vault root: ${input.cwd}

## Obsidian Conventions
- Files are Markdown (.md) with optional YAML frontmatter at the top
- Internal links: \`[[note-name]]\` or \`[[folder/note-name]]\`
- Tags: \`#tag-name\`
- When referencing vault files in responses, use wiki-link format so users can click them: \`[[folder/note.md]]\`

## Output Rules
- Be concise and direct. No filler phrases like "Sure!", "Of course!", "Certainly!".
- Format responses in Markdown.
- For multi-step tasks, show progress clearly.
- Confirm what was created or changed after completing file operations.`;

    const parts: string[] = [system];
    const skillInstructions = buildCodexSkillInstructions(input.cwd);
    if (skillInstructions) {
      parts.push(`\n\n${skillInstructions}`);
    }

    if (input.activeNotePath && input.activeNoteContent) {
      parts.push(`\n\n<active_obsidian_note path="${input.activeNotePath}">\n${input.activeNoteContent}\n</active_obsidian_note>`);
    } else if (input.activeNotePath) {
      parts.push(`\n\nThe user is currently viewing: ${input.activeNotePath}`);
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
    if (!cleaned) return '';
    // Skip pure UI chrome (box-drawing chars, bare role labels)
    if (/^[┌└├│─╭╰╮╯┤┬┴┼]/.test(cleaned)) return '';
    if (/^(user|codex)$/i.test(cleaned)) return '';
    // Skip low-value metadata
    if (/^(session id:|workdir:)\s/i.test(cleaned)) return '';
    // Pass everything else through
    return cleaned.slice(0, 300);
  }
}
