import * as fs from 'fs';
import type { App, TFile } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import type { ImageMode, VisualOutputType } from './ImagePromptBuilder';
import { buildImagePrompt, buildPromptDraftRequest } from './ImagePromptBuilder';

/** Minimal agent interface required by VisualAssetService. */
export interface VisualAgentProvider {
  query(input: {
    prompt: string;
    cwd: string;
    activeNotePath?: string;
    activeNoteContent?: string;
    selectedText?: string;
  }): AsyncGenerator<{ type: 'text' | 'progress' | 'error' | 'done'; content?: string }>;
}

function sanitizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'codexian-visual';
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = folder.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.createFolder(current);
    }
  }
}

export interface GenerateVisualAssetRequest {
  app: App;
  agent: VisualAgentProvider;
  vaultPath: string;
  file: TFile;
  mediaFolder: string;
  mode: ImageMode;
  outputType: VisualOutputType;
  userPrompt: string;
  generatedPrompt?: string;
  noteContent: string;
  selection?: string;
  onProgress?: (message: string) => void;
}

export interface GeneratedVisualAsset {
  path: string;
  transcript: string;
}

/** Finds the most recently modified file with a given extension in a directory tree after a given timestamp. */
function findLatestFileInDir(dir: string, ext: string, afterMs: number): string | null {
  const SKIP = new Set(['.obsidian', 'node_modules', '.git', '.oc-cache']);
  let bestFile: string | null = null;
  let bestMtime = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.toLowerCase().endsWith(ext)) continue;
      try {
        const { mtimeMs } = fs.statSync(full);
        if (mtimeMs > afterMs && mtimeMs > bestMtime) { bestFile = full; bestMtime = mtimeMs; }
      } catch { /* skip */ }
    }
  };
  walk(dir);
  return bestFile;
}

/** Finds the most recently created PNG in ~/.codex/generated_images/ after a given timestamp. */
function findLatestCodexImage(afterMs: number): string | null {
  const dir = path.join(os.homedir(), '.codex', 'generated_images');
  try {
    let bestFile: string | null = null;
    let bestMtime = 0;
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.toLowerCase().endsWith('.png')) continue;
        const { mtimeMs } = fs.statSync(full);
        if (mtimeMs > afterMs && mtimeMs > bestMtime) {
          bestFile = full;
          bestMtime = mtimeMs;
        }
      }
    };
    walk(dir);
    return bestFile;
  } catch {
    return null;
  }
}

export async function generateVisualAsset(request: GenerateVisualAssetRequest): Promise<GeneratedVisualAsset> {
  if (request.file.extension.toLowerCase() !== 'md') {
    throw new Error('이미지 생성 결과는 Markdown 노트에만 삽입할 수 있습니다.');
  }

  request.onProgress?.('Preparing attachment folder...');
  const folder = request.mediaFolder.trim() || 'attachments/codexian';
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
  await ensureFolder(request.app, normalizedFolder);

  const extension = request.outputType === 'png' ? 'png' : 'svg';
  const filename = `${sanitizeName(`${request.file.basename}-${request.mode}`)}-${Date.now()}.${extension}`;
  const vaultRelativePath = path.posix.join(normalizedFolder, filename);
  const vaultAbsolutePath = path.join(request.vaultPath, ...vaultRelativePath.split('/'));

  const fallbackPrompt = buildImagePrompt({
    mode: request.mode,
    outputType: request.outputType,
    userPrompt: request.userPrompt,
    noteTitle: request.file.basename,
    noteContent: request.noteContent,
    selection: request.selection,
  });
  const visualPrompt = request.generatedPrompt?.trim() || fallbackPrompt;

  const prompt = request.outputType === 'png'
    ? buildPngGenerationPrompt(vaultRelativePath, visualPrompt)
    : buildSvgGenerationPrompt(vaultRelativePath, visualPrompt);

  const startedAt = Date.now();
  let transcript = '';
  request.onProgress?.(`Asking Codex CLI to create the ${extension.toUpperCase()}...`);
  for await (const event of request.agent.query({
    prompt,
    cwd: request.vaultPath,
    activeNotePath: request.file.path,
    activeNoteContent: request.noteContent,
    selectedText: request.selection,
  })) {
    if (event.type === 'text') transcript += event.content;
    if (event.type === 'progress') request.onProgress?.(`Codex: ${event.content}`);
    if (event.type === 'error') transcript += `\nERROR: ${event.content}`;
  }

  // If PNG not at expected path: try to find and copy it from known locations
  if (request.outputType === 'png' && !(await request.app.vault.adapter.exists(vaultRelativePath))) {
    request.onProgress?.('이미지를 vault로 복사 중...');
    // 1. Check ~/.codex/generated_images/
    const codexImage = findLatestCodexImage(startedAt - 5000);
    if (codexImage) {
      fs.copyFileSync(codexImage, vaultAbsolutePath);
    } else {
      // 2. Codex may have saved it directly in the vault (e.g. assets/) — find newest PNG in vault
      const vaultImage = findLatestFileInDir(request.vaultPath, '.png', startedAt - 5000);
      if (vaultImage && vaultImage !== vaultAbsolutePath) {
        // Already in vault, just use its relative path
        const rel = path.relative(request.vaultPath, vaultImage).split(path.sep).join('/');
        request.onProgress?.(`Embedding generated PNG at the top of the note...`);
        await request.app.vault.process(request.file, (content) => embedAtTop(content, rel));
        request.onProgress?.(`Visual embedded: ${rel}`);
        return { path: rel, transcript: `Generated prompt:\n${visualPrompt}\n\n${transcript}` };
      }
    }
  }

  if (!(await request.app.vault.adapter.exists(vaultRelativePath))) {
    request.onProgress?.(`${extension.toUpperCase()} file was not created at the expected path.`);
    throw new Error(`Codex did not create the expected ${extension.toUpperCase()} file: ${vaultRelativePath}\n\n${transcript.trim()}`);
  }

  request.onProgress?.(`Embedding generated ${extension.toUpperCase()} at the top of the note...`);
  await request.app.vault.process(request.file, (content) => embedAtTop(content, vaultRelativePath));
  request.onProgress?.(`Visual embedded: ${vaultRelativePath}`);
  return { path: vaultRelativePath, transcript: `Generated prompt:\n${visualPrompt}\n\n${transcript}` };
}

function buildSvgGenerationPrompt(vaultRelativePath: string, visualPrompt: string): string {
  return [
    'Create a single SVG visual asset from the generated image prompt below.',
    '',
    `Target file path, relative to the vault root: ${vaultRelativePath}`,
    '',
    'Hard requirements:',
    '- Use Codex CLI only. Do not call API keys or image APIs.',
    '- Write exactly one valid standalone SVG file to the target path.',
    '- The SVG must be viewBox-based, self-contained, and safe for Obsidian embedding.',
    '- Include <style> text rules with font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif.',
    '- Use real UTF-8 Korean text directly in <text> elements when Korean labels are needed.',
    '- Keep Korean labels short and large enough to read. Do not create mojibake, random glyphs, or placeholder Latin text.',
    '- Prefer visual hierarchy, shapes, layout, and concise labels over long paragraphs.',
    '- Do not modify the source note. Codexian will embed the SVG at the top after the file exists.',
    '',
    'Generated image prompt to apply:',
    '',
    visualPrompt,
  ].join('\n');
}

function buildPngGenerationPrompt(vaultRelativePath: string, visualPrompt: string): string {
  return [
    'Create a single PNG image from the generated image prompt below.',
    '',
    `Final target file path, relative to the vault root: ${vaultRelativePath}`,
    '',
    'Hard requirements:',
    '- Use Codex CLI built-in image generation tool only.',
    '- Do not use Python, Pillow, SVG, HTML, canvas, diagrams-as-code, or any code-drawn substitute.',
    '- Generate the image with the built-in image generation capability, then copy or move the resulting PNG from ~/.codex/generated_images/... to the final target file path.',
    '- The final file must be a real PNG image at the target path.',
    '- After saving, verify the file exists and is a PNG.',
    '- If exact size control is unavailable, prefer a square high-resolution image and do not fake dimensions with code.',
    '- Preserve the prompt structure: subject, composition, style, environment, lighting, typography, details, aspect_ratio.',
    '- Respect explicit aspect ratio intent such as landscape, portrait, or square when the image tool supports it.',
    '- For thumbnail/poster outputs, reserve a clear headline or title area instead of filling the whole image with objects.',
    '- For infographic outputs, use structured modules, callouts, iconography, and readable hierarchy rather than dense paragraphs.',
    '- For Korean text, keep labels very short, large, and high contrast. Avoid long paragraphs and tiny text.',
    '- Do not modify the source note. Codexian will embed the PNG at the top after the file exists.',
    '',
    'Generated image prompt to apply:',
    '',
    visualPrompt,
  ].join('\n');
}

export async function draftVisualPrompt(request: GenerateVisualAssetRequest): Promise<string> {
  const prompt = buildPromptDraftRequest({
    mode: request.mode,
    outputType: request.outputType,
    userPrompt: request.userPrompt,
    noteTitle: request.file.basename,
    noteContent: request.noteContent,
    selection: request.selection,
  });

  let drafted = '';
  for await (const event of request.agent.query({
    prompt,
    cwd: request.vaultPath,
    activeNotePath: request.file.path,
    activeNoteContent: request.noteContent,
    selectedText: request.selection,
  })) {
    if (event.type === 'text') drafted += event.content;
    if (event.type === 'progress') request.onProgress?.(`Codex: ${event.content}`);
    if (event.type === 'error') {
      request.onProgress?.(`Prompt draft warning: ${event.content}`);
      console.warn('[Codexian visual] Prompt draft warning:', event.content);
    }
  }

  return drafted.trim();
}

function embedAtTop(content: string, vaultRelativePath: string): string {
  const embed = `![[${vaultRelativePath}]]`;
  if (content.includes(embed)) return content;
  if (content.startsWith('---\n')) {
    const frontmatterEnd = content.indexOf('\n---', 4);
    if (frontmatterEnd !== -1) {
      const closingEnd = frontmatterEnd + '\n---'.length;
      const hasTrailingNewline = content.slice(closingEnd).startsWith('\n');
      const before = content.slice(0, closingEnd);
      const after = content.slice(closingEnd + (hasTrailingNewline ? 1 : 0));
      return `${before}\n\n${embed}\n\n${after}`;
    }
  }
  return `${embed}\n\n${content}`;
}
