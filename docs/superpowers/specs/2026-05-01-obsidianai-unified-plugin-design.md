# ObsidianAI — Unified Plugin Design Spec

**Date:** 2026-05-01  
**Status:** Approved  
**Scope:** clauder + codexian 통합 → ObsidianAI 단일 플러그인

---

## 1. 목표

clauder(Claude Agent SDK 기반)와 codexian(OpenAI Codex CLI 기반)을 하나의 플러그인 **ObsidianAI**로 통합한다. 사용자는 상단 Segmented Control로 Claude ↔ Codex를 즉시 전환할 수 있으며, 각 모드는 독립적인 대화 히스토리를 유지한다.

---

## 2. 접근 방식

**clauder 코드베이스를 베이스**로 사용하고 codexian의 고유 기능을 포팅한다.

- clauder는 이미 풍부한 기능(MCP, Slash Commands, Subagents, Skills, Plan Approval 등)을 보유
- 두 플러그인이 같은 개발자가 만든 동일한 CSS/컴포넌트 구조를 공유하여 이식 비용 최소화
- clauder의 `settings.json`이 이미 `agentProvider: "codex"` 필드를 포함하여 Codex 지원 준비됨

---

## 3. UI 디자인

### 3.1 Segmented Control (탭)

뷰 상단에 고정된 세그먼트 컨트롤로 provider를 전환한다.

```
┌─────────────────────────────────┐
│  [ 🤖 Claude ] [  ⚡ Codex  ]  │  ← 활성 탭이 강조색으로 채워짐
└─────────────────────────────────┘
```

- 활성 탭: 배경색 채움 + 흰색 텍스트 + 그림자
- 비활성 탭: 회색 텍스트
- 탭 아래 2px 그라디언트 구분선 (활성 모드 색상)

### 3.2 색상 테마

| 모드   | 주색상    | 강조색    | 메시지 배경          |
|--------|-----------|-----------|----------------------|
| Claude | `#F97316` | `#FB923C` | `#F9731610` border `#F9731630` |
| Codex  | `#8B5CF6` | `#A78BFA` | `#8B5CF610` border `#8B5CF630` |

전환 시 변경되는 요소:
- Segmented Control 활성 탭 배경색
- 구분선 그라디언트
- 전송 버튼 색상
- AI 메시지 배경/border
- 모델 배지 색상
- 이미지 생성 버튼 강조 색상

### 3.3 레이아웃 구조

```
┌─────────────────────────────────────┐
│ Segmented Control (Claude / Codex)  │
├─────────────────────────────────────┤
│ 2px gradient divider (mode color)   │
├─────────────────────────────────────┤
│ Toolbar: [모델배지] [MCP] [컨텍스트] │
├─────────────────────────────────────┤
│                                     │
│         대화 메시지 영역              │
│                                     │
├─────────────────────────────────────┤
│ [🎨 이미지생성] [🗺 메모리맵]         │
├─────────────────────────────────────┤
│ [입력창 / 로 파일, @ 로 명령어...]  [↑]│
└─────────────────────────────────────┘
```

---

## 4. Provider 추상화

### 4.1 인터페이스

두 provider를 동일한 인터페이스로 추상화한다.

```typescript
interface AIProvider {
  id: 'claude' | 'codex';
  label: string;
  color: string;
  sendMessage(input: ProviderInput): AsyncIterable<ProviderEvent>;
  abortCurrentRequest(): void;
  getDefaultModel(): string;
  getSupportedModels(): string[];
}
```

### 4.2 구현체

- `ClaudeProvider` — 기존 `ObsidianCodeService` 래핑 (`@anthropic-ai/claude-agent-sdk`)
- `CodexProvider` — codexian의 `CodexProvider` 포팅 (Codex CLI subprocess)

### 4.3 Provider 선택

- `ProviderManager` 싱글턴이 현재 활성 provider를 관리
- 전환 시 진행 중인 스트림 abort → 새 provider로 전환
- 설정에 마지막 선택 provider 저장 (세션 간 유지)

---

## 5. 대화 히스토리

각 provider는 **독립적인 히스토리**를 유지한다.

- `SessionStorage`를 provider별로 분리: `sessions/claude/`, `sessions/codex/`
- 탭 전환 시 해당 provider의 마지막 세션을 복원
- 히스토리 브라우저에서 두 provider의 대화를 각각 확인 가능

---

## 6. codexian 포팅 기능

### 6.1 CodexProvider
- Codex CLI subprocess 관리 (spawn/kill/restart)
- 스트리밍 출력 파싱
- `codexCliPath`, `codexModel`, `codexReasoningEffort` 설정 항목 유지

### 6.2 MemoryMapService
- 볼트 내 메모리 맵 파일 읽기/쓰기
- 툴바 하단 "🗺 메모리맵" 버튼으로 접근

### 6.3 VisualAssetService (이미지 생성)
- `ImageGenerationModal` UI 포팅
- `ImagePromptBuilder`로 프롬프트 구성
- "🎨 이미지 생성" 버튼으로 모달 진입
- 생성된 이미지를 볼트 `assets/` 폴더에 저장

### 6.4 OmxInstaller / EnvironmentProbe
- Codex CLI 미설치 시 자동 감지 및 설치 안내
- Claude CLI 경로 검증 기존 로직과 통합

---

## 7. 플러그인 메타데이터 변경

| 항목 | 기존 (clauder) | 변경 (ObsidianAI) |
|------|----------------|-------------------|
| `id` | `cc-obsidian` | `obsidian-ai` |
| `name` | `Obsidian Code` | `ObsidianAI` |
| `description` | Claude Code embedded | Claude & Codex unified AI |
| 디렉토리명 | `clauder/` | `obsidian-ai/` |
| `package.json` name | `cc-obsidian` | `obsidian-ai` |

---

## 8. 파일 구조 변경

```
clauder/src/
├── core/
│   ├── agent/
│   │   ├── ObsidianCodeService.ts     (ClaudeProvider로 리팩터)
│   │   ├── CodexProvider.ts           (codexian에서 포팅)
│   │   ├── ProviderManager.ts         (신규: 탭 상태 + provider 선택)
│   │   └── types.ts                   (AIProvider 인터페이스)
│   ├── images/
│   │   ├── VisualAssetService.ts      (codexian에서 포팅)
│   │   └── ImagePromptBuilder.ts      (codexian에서 포팅)
│   ├── memory/
│   │   └── MemoryMapService.ts        (codexian에서 포팅)
│   └── installer/
│       ├── EnvironmentProbe.ts        (codexian에서 포팅)
│       └── OmxInstaller.ts            (codexian에서 포팅)
├── ui/
│   ├── components/
│   │   ├── ProviderSegmentedControl.ts (신규: 탭 UI)
│   │   └── ...existing
│   └── modals/
│       ├── ImageGenerationModal.ts    (codexian에서 포팅)
│       └── ...existing
└── style/
    ├── theme/
    │   ├── claude.css                 (신규: --color-primary: #F97316)
    │   └── codex.css                 (신규: --color-primary: #8B5CF6)
    └── ...existing
```

---

## 9. CSS 테마 전략

CSS Custom Properties로 테마를 관리한다.

```css
/* claude.css */
.obsidian-ai[data-provider="claude"] {
  --ai-primary: #F97316;
  --ai-primary-light: #FB923C;
  --ai-msg-bg: #F9731610;
  --ai-msg-border: #F9731630;
}

/* codex.css */
.obsidian-ai[data-provider="codex"] {
  --ai-primary: #8B5CF6;
  --ai-primary-light: #A78BFA;
  --ai-msg-bg: #8B5CF610;
  --ai-msg-border: #8B5CF630;
}
```

`data-provider` 속성을 루트 요소에 설정하면 모든 색상이 자동으로 전환된다.

---

## 10. 구현 단계

1. **메타데이터 리네임** — manifest.json, package.json, 디렉토리명 변경
2. **Provider 추상화** — AIProvider 인터페이스 + ProviderManager 구현
3. **ClaudeProvider** — 기존 ObsidianCodeService를 인터페이스로 래핑
4. **CodexProvider** — codexian에서 포팅
5. **ProviderSegmentedControl** — 탭 UI 컴포넌트 구현
6. **CSS 테마** — CSS variables 기반 theme/claude.css, theme/codex.css
7. **히스토리 분리** — SessionStorage를 provider별로 분리
8. **codexian 기능 포팅** — MemoryMapService, VisualAssetService, ImageGenerationModal
9. **통합 테스트** — 탭 전환, 히스토리 독립성, 테마 전환 검증
10. **codexian 제거** — 플러그인 폴더 삭제, manifest에서 제외
