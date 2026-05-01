# ObsidianAI Unified Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** clauder + codexian을 하나의 플러그인 ObsidianAI로 통합 — Segmented Control 탭으로 Claude(#F97316) ↔ Codex(#8B5CF6) 전환, 독립 히스토리, 이미지 생성 + MemoryMapService 포함.

**Architecture:** clauder 코드베이스를 베이스로 `AIProvider` 인터페이스로 provider를 추상화. `ProviderManager`가 활성 탭 상태를 관리하고, CSS Custom Properties(`data-provider` 속성)로 테마 전환. 세션 저장소는 provider별 서브디렉토리로 분리.

**Tech Stack:** TypeScript, Obsidian Plugin API, `@anthropic-ai/claude-agent-sdk`, Codex CLI (subprocess), Jest

---

## File Map

### 신규 생성
- `src/core/agent/types.ts` — AIProvider 인터페이스, ProviderId 타입
- `src/core/agent/ProviderManager.ts` — 활성 provider 상태 관리
- `src/core/agent/ClaudeProvider.ts` — ObsidianCodeService를 AIProvider로 래핑
- `src/core/agent/CodexProvider.ts` — codexian에서 포팅
- `src/core/codex/CodexCliResolver.ts` — codexian에서 포팅
- `src/core/memory/MemoryMapService.ts` — codexian에서 포팅
- `src/core/images/VisualAssetService.ts` — codexian에서 포팅
- `src/ui/components/ProviderSegmentedControl.ts` — 탭 UI
- `src/ui/modals/ImageGenerationModal.ts` — codexian에서 포팅
- `src/style/theme/claude.css` — Claude 테마 CSS variables
- `src/style/theme/codex.css` — Codex 테마 CSS variables
- `tests/unit/core/agent/ProviderManager.test.ts`
- `tests/unit/core/memory/MemoryMapService.test.ts`

### 수정
- `manifest.json` — id, name 변경
- `package.json` — name 변경
- `src/core/types/settings.ts` — Codex 관련 필드 추가
- `src/core/storage/SessionStorage.ts` — provider별 서브디렉토리 지원
- `src/style/index.css` — 신규 CSS 모듈 import
- `src/features/chat/ObsidianCodeView.ts` — SegmentedControl 마운트, provider 연결
- `src/main.ts` — ProviderManager 초기화

---

## Task 1: 플러그인 메타데이터 리네임

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`

- [ ] **Step 1: manifest.json 수정**

```json
{
  "id": "obsidian-ai",
  "name": "ObsidianAI",
  "version": "2.0.0",
  "minAppVersion": "1.0.0",
  "description": "Claude & Codex unified AI assistant with tab switching, image generation, and memory map.",
  "author": "reallygood83",
  "authorUrl": "https://github.com/reallygood83",
  "isDesktopOnly": true
}
```

- [ ] **Step 2: package.json name 수정**

`"name"` 필드를 `"cc-obsidian"`에서 `"obsidian-ai"`로 변경.

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/eunsu/Documents/career/.obsidian/plugins/clauder
npm run build
```

Expected: `Built styles.css` + `main.js` 생성, 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add manifest.json package.json
git commit -m "feat: rename plugin to ObsidianAI (obsidian-ai)"
```

---

## Task 2: AIProvider 인터페이스 + 타입 정의

**Files:**
- Create: `src/core/agent/types.ts`

- [ ] **Step 1: 타입 파일 생성**

```typescript
// src/core/agent/types.ts

export type ProviderId = 'claude' | 'codex';

export interface ProviderTheme {
  primary: string;       // e.g. '#F97316'
  primaryLight: string;  // e.g. '#FB923C'
  label: string;         // e.g. 'Claude'
  icon: string;          // e.g. '🤖'
}

export const PROVIDER_THEMES: Record<ProviderId, ProviderTheme> = {
  claude: {
    primary: '#F97316',
    primaryLight: '#FB923C',
    label: 'Claude',
    icon: '🤖',
  },
  codex: {
    primary: '#8B5CF6',
    primaryLight: '#A78BFA',
    label: 'Codex',
    icon: '⚡',
  },
};

/** Event emitted by a provider during streaming. */
export interface ProviderEvent {
  type: 'text' | 'progress' | 'error' | 'done';
  content?: string;
}

/** Input passed to a provider query. */
export interface ProviderQuery {
  prompt: string;
  cwd: string;
  activeNotePath?: string;
  activeNoteContent?: string;
  selectedText?: string;
}
```

- [ ] **Step 2: 타입체크**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/core/agent/types.ts
git commit -m "feat: add AIProvider interface and provider theme types"
```

---

## Task 3: ProviderManager 구현 + 테스트

**Files:**
- Create: `src/core/agent/ProviderManager.ts`
- Create: `tests/unit/core/agent/ProviderManager.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/unit/core/agent/ProviderManager.test.ts
import { ProviderManager } from '../../../../src/core/agent/ProviderManager';

describe('ProviderManager', () => {
  it('defaults to claude provider', () => {
    const pm = new ProviderManager();
    expect(pm.activeProvider).toBe('claude');
  });

  it('switches provider and notifies listeners', () => {
    const pm = new ProviderManager();
    const changes: string[] = [];
    pm.onProviderChange((id) => changes.push(id));
    pm.setProvider('codex');
    expect(pm.activeProvider).toBe('codex');
    expect(changes).toEqual(['codex']);
  });

  it('unsubscribes listener', () => {
    const pm = new ProviderManager();
    const changes: string[] = [];
    const unsub = pm.onProviderChange((id) => changes.push(id));
    unsub();
    pm.setProvider('codex');
    expect(changes).toHaveLength(0);
  });

  it('does not notify if provider unchanged', () => {
    const pm = new ProviderManager();
    const changes: string[] = [];
    pm.onProviderChange((id) => changes.push(id));
    pm.setProvider('claude');
    expect(changes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npm run test -- --selectProjects unit --testPathPattern="ProviderManager" 2>&1 | tail -10
```

Expected: `Cannot find module '../../../../src/core/agent/ProviderManager'`

- [ ] **Step 3: ProviderManager 구현**

```typescript
// src/core/agent/ProviderManager.ts
import type { ProviderId } from './types';

type ProviderChangeCallback = (id: ProviderId) => void;

export class ProviderManager {
  private _activeProvider: ProviderId = 'claude';
  private listeners = new Set<ProviderChangeCallback>();

  get activeProvider(): ProviderId {
    return this._activeProvider;
  }

  setProvider(id: ProviderId): void {
    if (this._activeProvider === id) return;
    this._activeProvider = id;
    for (const cb of this.listeners) cb(id);
  }

  onProviderChange(callback: ProviderChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- --selectProjects unit --testPathPattern="ProviderManager" 2>&1 | tail -10
```

Expected: `Tests: 4 passed`

- [ ] **Step 5: 커밋**

```bash
git add src/core/agent/ProviderManager.ts tests/unit/core/agent/ProviderManager.test.ts
git commit -m "feat: add ProviderManager with listener pattern"
```

---

## Task 4: CSS 테마 시스템

**Files:**
- Create: `src/style/theme/claude.css`
- Create: `src/style/theme/codex.css`
- Modify: `src/style/index.css`

- [ ] **Step 1: claude.css 생성**

```css
/* src/style/theme/claude.css */
.oc-container[data-provider="claude"] {
  --ai-primary: #F97316;
  --ai-primary-light: #FB923C;
  --ai-msg-bg: rgba(249, 115, 22, 0.06);
  --ai-msg-border: rgba(249, 115, 22, 0.18);
  --ai-tab-shadow: 0 2px 8px rgba(249, 115, 22, 0.25);
  --ai-divider: linear-gradient(90deg, #F97316, #FB923C, transparent);
}
```

- [ ] **Step 2: codex.css 생성**

```css
/* src/style/theme/codex.css */
.oc-container[data-provider="codex"] {
  --ai-primary: #8B5CF6;
  --ai-primary-light: #A78BFA;
  --ai-msg-bg: rgba(139, 92, 246, 0.06);
  --ai-msg-border: rgba(139, 92, 246, 0.18);
  --ai-tab-shadow: 0 2px 8px rgba(139, 92, 246, 0.25);
  --ai-divider: linear-gradient(90deg, transparent, #8B5CF6, #A78BFA);
}
```

- [ ] **Step 3: 기존 하드코딩된 색상을 CSS variables로 교체**

`src/style/components/messages.css`에서 assistant 메시지 배경에 `--ai-msg-bg`, `--ai-msg-border` 적용.

`src/style/components/input.css`에서 전송 버튼 배경에 `--ai-primary` 적용.

- [ ] **Step 4: index.css에 import 추가**

`src/style/index.css` 최상단에 추가:

```css
@import './theme/claude.css';
@import './theme/codex.css';
```

- [ ] **Step 5: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```

Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/style/theme/ src/style/index.css src/style/components/
git commit -m "feat: add CSS theme variables for Claude/Codex provider switching"
```

---

## Task 5: ProviderSegmentedControl UI 컴포넌트

**Files:**
- Create: `src/ui/components/ProviderSegmentedControl.ts`
- Create: `src/style/components/provider-tabs.css`

- [ ] **Step 1: CSS 작성**

```css
/* src/style/components/provider-tabs.css */
.oc-provider-tabs {
  display: flex;
  padding: 6px 8px;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
  gap: 4px;
}

.oc-provider-tabs__control {
  display: flex;
  background: var(--background-primary);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
  flex: 1;
}

.oc-provider-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 0;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s ease;
  border: none;
  background: transparent;
}

.oc-provider-tab[data-active="true"] {
  background: var(--ai-primary);
  color: #fff;
  box-shadow: var(--ai-tab-shadow);
}

.oc-provider-divider {
  height: 2px;
  background: var(--ai-divider);
}
```

- [ ] **Step 2: 컴포넌트 구현**

```typescript
// src/ui/components/ProviderSegmentedControl.ts
import type { ProviderManager } from '../../core/agent/ProviderManager';
import type { ProviderId } from '../../core/agent/types';
import { PROVIDER_THEMES } from '../../core/agent/types';

export class ProviderSegmentedControl {
  private container: HTMLElement;
  private divider: HTMLElement;
  private tabs: Map<ProviderId, HTMLButtonElement> = new Map();
  private unsub: (() => void) | null = null;

  constructor(
    private readonly parentEl: HTMLElement,
    private readonly providerManager: ProviderManager,
  ) {
    this.container = parentEl.createDiv({ cls: 'oc-provider-tabs' });
    const control = this.container.createDiv({ cls: 'oc-provider-tabs__control' });

    for (const [id, theme] of Object.entries(PROVIDER_THEMES) as [ProviderId, typeof PROVIDER_THEMES[ProviderId]][]) {
      const btn = control.createEl('button', { cls: 'oc-provider-tab' });
      btn.dataset.active = String(id === providerManager.activeProvider);
      btn.createSpan({ text: theme.icon });
      btn.createSpan({ text: theme.label });
      btn.addEventListener('click', () => this.providerManager.setProvider(id));
      this.tabs.set(id, btn);
    }

    this.divider = parentEl.createDiv({ cls: 'oc-provider-divider' });

    this.unsub = providerManager.onProviderChange((id) => this.updateActive(id));
  }

  private updateActive(activeId: ProviderId): void {
    for (const [id, btn] of this.tabs) {
      btn.dataset.active = String(id === activeId);
    }
  }

  destroy(): void {
    this.unsub?.();
    this.container.remove();
    this.divider.remove();
  }
}
```

- [ ] **Step 3: index.css에 import 추가**

```css
@import './components/provider-tabs.css';
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/ui/components/ProviderSegmentedControl.ts src/style/components/provider-tabs.css src/style/index.css
git commit -m "feat: add ProviderSegmentedControl tab UI component"
```

---

## Task 6: CodexProvider 포팅

**Files:**
- Create: `src/core/codex/CodexCliResolver.ts`
- Create: `src/core/agent/CodexProvider.ts`

- [ ] **Step 1: CodexCliResolver 포팅**

codexian의 `src/core/codex/CodexCliResolver.ts`를 `src/core/codex/CodexCliResolver.ts`로 복사. import 경로 수정 불필요 (독립 파일).

```bash
cp /Users/eunsu/Documents/career/.obsidian/plugins/codexian/src/core/codex/CodexCliResolver.ts \
   /Users/eunsu/Documents/career/.obsidian/plugins/clauder/src/core/codex/CodexCliResolver.ts
```

- [ ] **Step 2: CodexProvider 생성**

```typescript
// src/core/agent/CodexProvider.ts
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ProviderEvent, ProviderQuery } from './types';
import { findCodexCli } from '../codex/CodexCliResolver';
import type { ObsidianCodeSettings } from '../types/settings';

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
      '--model', settings.codexModel ?? 'gpt-5.5',
      '--config', `model_reasoning_effort="${settings.codexReasoningEffort ?? 'medium'}"`,
    ];

    const permMode = (settings as any).permissionMode;
    if (permMode === 'yolo') {
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
    command: string, args: string[], env: NodeJS.ProcessEnv,
    stdin: string, outputPath: string, shell: boolean,
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
    const cleaned = line.replace(/\[[0-9;?]*[ -/]*[@-~]/g, '').trim();
    if (!cleaned || /^(user|codex)$/i.test(cleaned) || /^[┌└├│─╭╰]/.test(cleaned)) return '';
    if (/^(•|-) /i.test(cleaned)) return cleaned.slice(0, 240);
    if (/^(tokens used|OpenAI Codex|workdir:|model:|approval:|sandbox:|session id:)\b/i.test(cleaned)) return cleaned;
    if (/\bERROR\b/.test(cleaned)) return cleaned;
    if (/^(read|write|edit|run|exec|search|create|delete|build|test|commit)\b/i.test(cleaned)) return cleaned.slice(0, 240);
    return '';
  }
}
```

- [ ] **Step 3: settings.ts에 Codex 필드 추가**

`src/core/types/settings.ts`의 `ObsidianCodeSettings` 인터페이스에 추가:

```typescript
// Codex provider settings
codexCliPath?: string;
codexModel?: string;
codexReasoningEffort?: 'low' | 'medium' | 'high';
activeProvider?: 'claude' | 'codex';
```

`DEFAULT_SETTINGS`에도 추가:

```typescript
codexCliPath: '',
codexModel: 'gpt-5.5',
codexReasoningEffort: 'medium',
activeProvider: 'claude',
```

- [ ] **Step 4: 타입체크 + 빌드**

```bash
npm run typecheck 2>&1 | head -20
npm run build 2>&1 | tail -5
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/core/codex/ src/core/agent/CodexProvider.ts src/core/types/settings.ts
git commit -m "feat: port CodexProvider and CodexCliResolver from codexian"
```

---

## Task 7: ObsidianCodeView에 탭 UI 연결

**Files:**
- Modify: `src/features/chat/ObsidianCodeView.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: main.ts에 ProviderManager 추가**

`src/main.ts`에서 `ObsidianCodePlugin` 클래스에 추가:

```typescript
// main.ts 상단 import 추가
import { ProviderManager } from './core/agent/ProviderManager';
import { CodexProvider } from './core/agent/CodexProvider';

// ObsidianCodePlugin 클래스에 필드 추가
providerManager: ProviderManager;
codexProvider: CodexProvider;
```

`onload()` 내 `this.agentService = new ObsidianCodeService(...)` 직후 추가:

```typescript
this.providerManager = new ProviderManager();
this.codexProvider = new CodexProvider(() => this.settings);
// Restore last active provider
if (this.settings.activeProvider) {
  this.providerManager.setProvider(this.settings.activeProvider);
}
// Persist provider changes
this.providerManager.onProviderChange(async (id) => {
  this.settings.activeProvider = id;
  await this.saveSettings();
});
```

- [ ] **Step 2: ObsidianCodeView에 SegmentedControl 마운트**

`src/features/chat/ObsidianCodeView.ts`에서:

상단 import 추가:
```typescript
import { ProviderSegmentedControl } from '../../ui/components/ProviderSegmentedControl';
```

`ObsidianCodeView` 클래스에 필드 추가:
```typescript
private providerControl: ProviderSegmentedControl | null = null;
```

`onOpen()` 내 컨테이너 생성 직후 (`this.contentEl.createDiv(...)` 전) 추가:

```typescript
const pm = (this.plugin as any).providerManager;
if (pm) {
  this.providerControl = new ProviderSegmentedControl(this.contentEl, pm);
  // Apply data-provider attribute for CSS theming
  const container = this.contentEl.querySelector('.oc-container') as HTMLElement;
  if (container) {
    container.dataset.provider = pm.activeProvider;
    pm.onProviderChange((id: string) => { container.dataset.provider = id; });
  }
}
```

`onClose()` 내 추가:
```typescript
this.providerControl?.destroy();
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/main.ts src/features/chat/ObsidianCodeView.ts
git commit -m "feat: wire ProviderManager and SegmentedControl into main view"
```

---

## Task 8: 세션 저장소 provider별 분리

**Files:**
- Modify: `src/core/storage/SessionStorage.ts`

- [ ] **Step 1: SessionStorage에 provider prefix 지원 추가**

`SessionStorage.ts`에서 세션 저장 경로를 `sessions/{provider}/` 서브디렉토리로 변경.

```typescript
// SessionStorage.ts 내 경로 생성 부분 수정
// 기존: `sessions/${id}.jsonl`
// 변경: `sessions/${provider}/${id}.jsonl`
```

`SessionStorage` 클래스의 `saveConversation`, `loadConversation`, `listConversations` 메서드가 `provider: 'claude' | 'codex'` 파라미터를 추가로 받도록 수정.

기존 `sessions/` 디렉토리의 파일은 `sessions/claude/`로 마이그레이션:

```typescript
// onload 시 마이그레이션 로직 추가
async migrateSessionsToProvider(): Promise<void> {
  const adapter = this.app.vault.adapter;
  if (!await adapter.exists('sessions/claude') && await adapter.exists('.claude/sessions')) {
    await adapter.mkdir('.claude/sessions/claude');
    // 기존 파일 이동
    const files = await adapter.list('.claude/sessions');
    for (const file of files.files.filter(f => f.endsWith('.jsonl'))) {
      const content = await adapter.read(file);
      const newPath = file.replace('.claude/sessions/', '.claude/sessions/claude/');
      await adapter.write(newPath, content);
    }
  }
}
```

- [ ] **Step 2: 빌드 + 타입체크**

```bash
npm run typecheck 2>&1 | head -20
npm run build 2>&1 | tail -5
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/core/storage/SessionStorage.ts
git commit -m "feat: separate session storage by provider (sessions/claude/, sessions/codex/)"
```

---

## Task 9: MemoryMapService 포팅 + 테스트

**Files:**
- Create: `src/core/memory/MemoryMapService.ts`
- Create: `tests/unit/core/memory/MemoryMapService.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/unit/core/memory/MemoryMapService.test.ts
import { MemoryMapService } from '../../../../src/core/memory/MemoryMapService';

const mockApp = {
  vault: {
    getMarkdownFiles: () => [],
    cachedRead: jest.fn(),
    adapter: {
      exists: jest.fn().mockResolvedValue(false),
      read: jest.fn(),
      write: jest.fn(),
      mkdir: jest.fn(),
    },
  },
} as any;

describe('MemoryMapService', () => {
  it('returns null when no index exists', async () => {
    const svc = new MemoryMapService(mockApp);
    const result = await svc.load();
    expect(result).toBeNull();
  });

  it('returns empty results when no files', async () => {
    const svc = new MemoryMapService(mockApp);
    const index = await svc.build();
    expect(index.entries).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm run test -- --selectProjects unit --testPathPattern="MemoryMapService" 2>&1 | tail -10
```

- [ ] **Step 3: MemoryMapService 포팅**

codexian의 `src/core/memory/MemoryMapService.ts`를 복사 후 index 경로를 `.codexian/memory/index.json` → `.obsidianai/memory/index.json`으로 변경.

```bash
cp /Users/eunsu/Documents/career/.obsidian/plugins/codexian/src/core/memory/MemoryMapService.ts \
   /Users/eunsu/Documents/career/.obsidian/plugins/clauder/src/core/memory/MemoryMapService.ts
```

복사 후 파일 내 `INDEX_PATH` 수정:
```typescript
const INDEX_PATH = '.obsidianai/memory/index.json';
```

codexian `types.ts`의 `MemoryMapEntry`, `MemoryMapIndex`, `MemoryMapResult` 타입을 `src/core/memory/MemoryMapService.ts` 상단에 인라인으로 추가:

```typescript
interface MemoryMapEntry {
  path: string; title: string; folder: string;
  tags: string[]; links: string[]; headings: string[];
  keywords: string[]; terms: Record<string, number>;
  length: number; mtime: number;
}
interface MemoryMapIndex { version: number; builtAt: number; entries: MemoryMapEntry[]; }
interface MemoryMapResult { path: string; title: string; score: number; reasons: string[]; }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test -- --selectProjects unit --testPathPattern="MemoryMapService" 2>&1 | tail -10
```

Expected: `Tests: 2 passed`

- [ ] **Step 5: 커밋**

```bash
git add src/core/memory/ tests/unit/core/memory/
git commit -m "feat: port MemoryMapService from codexian"
```

---

## Task 10: VisualAssetService + ImageGenerationModal 포팅

**Files:**
- Create: `src/core/images/VisualAssetService.ts`
- Create: `src/ui/modals/ImageGenerationModal.ts`

- [ ] **Step 1: VisualAssetService 포팅**

```bash
cp /Users/eunsu/Documents/career/.obsidian/plugins/codexian/src/core/images/VisualAssetService.ts \
   /Users/eunsu/Documents/career/.obsidian/plugins/clauder/src/core/images/VisualAssetService.ts
cp /Users/eunsu/Documents/career/.obsidian/plugins/codexian/src/core/images/ImagePromptBuilder.ts \
   /Users/eunsu/Documents/career/.obsidian/plugins/clauder/src/core/images/ImagePromptBuilder.ts
```

import 경로 수정 필요 시 `src/core/types` 참조로 변경.

- [ ] **Step 2: ImageGenerationModal 포팅**

```bash
cp /Users/eunsu/Documents/career/.obsidian/plugins/codexian/src/ui/modals/ImageGenerationModal.ts \
   /Users/eunsu/Documents/career/.obsidian/plugins/clauder/src/ui/modals/ImageGenerationModal.ts
```

import 경로 수정: codexian 내부 타입 참조를 `../../core/images/VisualAssetService`로 변경.

- [ ] **Step 3: 타입체크**

```bash
npm run typecheck 2>&1 | grep -c "error TS"
```

Expected: `0` (에러 없음). 에러가 있으면 import 경로 수정.

- [ ] **Step 4: 빌드**

```bash
npm run build 2>&1 | tail -5
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/core/images/VisualAssetService.ts src/core/images/ImagePromptBuilder.ts \
        src/ui/modals/ImageGenerationModal.ts
git commit -m "feat: port VisualAssetService and ImageGenerationModal from codexian"
```

---

## Task 11: 이미지 생성 + 메모리맵 버튼 UI 연결

**Files:**
- Modify: `src/ui/components/InputToolbar.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: main.ts에 MemoryMapService 초기화**

```typescript
import { MemoryMapService } from './core/memory/MemoryMapService';

// ObsidianCodePlugin 클래스 필드 추가
memoryMapService: MemoryMapService;

// onload() 내 추가
this.memoryMapService = new MemoryMapService(this.app);
```

- [ ] **Step 2: 입력 툴바 하단에 버튼 추가**

`src/ui/components/InputToolbar.ts`에서 툴바 아래 버튼 행 추가:

```typescript
// InputToolbar 내 보조 버튼 행 생성
private createAuxButtons(container: HTMLElement): void {
  const row = container.createDiv({ cls: 'oc-aux-buttons' });

  const imgBtn = row.createEl('button', { cls: 'oc-aux-btn', text: '🎨 이미지 생성' });
  imgBtn.addEventListener('click', () => {
    const modal = new ImageGenerationModal(this.app, this.plugin);
    modal.open();
  });

  const memBtn = row.createEl('button', { cls: 'oc-aux-btn', text: '🗺 메모리맵' });
  memBtn.addEventListener('click', async () => {
    const status = await this.plugin.memoryMapService.getStatus();
    new Notice(status.built
      ? `메모리맵: ${status.count}개 노트, ${new Date(status.builtAt!).toLocaleDateString()} 빌드`
      : '메모리맵 없음. 빌드 중...');
    if (!status.built) await this.plugin.memoryMapService.build();
  });
}
```

보조 버튼 CSS를 `src/style/components/input.css`에 추가:

```css
.oc-aux-buttons {
  display: flex;
  gap: 4px;
  padding: 2px 8px 4px;
}
.oc-aux-btn {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
}
.oc-aux-btn:hover {
  color: var(--ai-primary);
  border-color: var(--ai-primary);
}
```

- [ ] **Step 3: 빌드 + 타입체크**

```bash
npm run typecheck 2>&1 | head -10
npm run build 2>&1 | tail -5
```

Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/ui/components/InputToolbar.ts src/main.ts src/style/components/input.css
git commit -m "feat: add image generation and memory map buttons to input toolbar"
```

---

## Task 12: 전체 테스트 + 빌드 검증

- [ ] **Step 1: 전체 테스트 실행**

```bash
npm run test -- --selectProjects unit 2>&1 | tail -20
```

Expected: 기존 테스트 + 신규 테스트 모두 PASS. 실패 시 실패한 테스트 수정 후 재실행.

- [ ] **Step 2: 타입체크**

```bash
npm run typecheck 2>&1
```

Expected: 출력 없음 (에러 0).

- [ ] **Step 3: 린트**

```bash
npm run lint 2>&1 | tail -10
```

Expected: 에러 없음 (경고는 허용).

- [ ] **Step 4: 프로덕션 빌드**

```bash
npm run build 2>&1
```

Expected: `Built styles.css` + `main.js` 정상 생성.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore: verify all tests pass for ObsidianAI unified plugin"
```

---

## Task 13: codexian 플러그인 제거

- [ ] **Step 1: Obsidian에서 codexian 비활성화 확인**

Obsidian 설정 > 커뮤니티 플러그인에서 Codexian이 비활성화되어 있는지 확인.

- [ ] **Step 2: codexian 디렉토리 아카이브**

```bash
mv /Users/eunsu/Documents/career/.obsidian/plugins/codexian \
   /Users/eunsu/Documents/career/.obsidian/plugins/_archived_codexian
```

- [ ] **Step 3: ObsidianAI 플러그인 활성화 확인**

Obsidian 재시작 → ObsidianAI 플러그인 활성화 → 탭 전환, 색상 테마, 이미지 버튼 동작 확인.

- [ ] **Step 4: 최종 커밋**

```bash
git commit -m "feat: ObsidianAI v2.0.0 — Claude + Codex unified with tab switching, image gen, memory map"
```
