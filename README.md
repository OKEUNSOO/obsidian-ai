# ObsidianAI

옵시디언(Obsidian) 사이드바에서 **Claude**와 **Codex**를 탭으로 자유롭게 넘나드는 통합 AI 어시스턴트.  
각 AI는 독립적인 대화 히스토리를 유지하며, 파일 읽기/쓰기/터미널 실행까지 직접 처리합니다.

단순한 챗봇이 아닙니다. 여러분의 볼트(Vault)를 관리하는 강력한 AI 비서입니다.

---

## 🌟 ObsidianAI만의 특별한 기능

### 🔀 Claude ↔ Codex 탭 전환
상단 Segmented Control로 두 AI를 즉시 전환합니다.

- **🤖 Claude** (주황색) — Claude Agent SDK, MCP, 슬래시 커맨드, Plan 모드
- **⚡ Codex** (보라색) — OpenAI Codex CLI, Reasoning Effort 설정
- 탭 전환 시 색상 테마 자동 변경
- 각 AI의 대화 히스토리 독립 유지

### 🎨 이미지 생성 + 🗺 메모리맵
- **이미지 생성**: AI로 이미지를 생성하여 볼트 `assets/` 폴더에 저장
- **메모리맵**: 볼트 전체 노트를 인덱싱하여 관련 노트를 빠르게 검색

### 📌 스마트 노트 핀 기능
여러 노트를 참고하면서 작업할 때 불편하셨나요? 이제 노트를 **핀(고정)**하면 다른 노트를 열어봐도 첨부된 노트가 바뀌지 않습니다!

- 파일 칩의 **📌 핀 버튼** 클릭 → 노트 고정
- 여러 노트를 열어 확인하면서도 컨텍스트 유지
- `Cmd/Ctrl + P` → "Attach current note to chat"으로 빠르게 노트 추가

### 🎯 직관적인 권한 모드
- **AUTO 모드**: Claude가 자동으로 파일 수정 및 명령 실행 (빠른 작업용)
- **Safe 모드**: 모든 작업에 승인 필요 (신중한 작업용)
- **Plan 모드**: 실행 없이 계획만 세우기

### 🧠 Obsidian Skills 자동 설치
Claude가 Obsidian 문법을 완벽히 이해하도록 도와주는 **Skills**를 원클릭으로 설치할 수 있습니다!

**설치 방법:**
1. 플러그인 설정 열기 (설정 → Obsidian Code)
2. **Obsidian Skills** 섹션으로 스크롤
3. **Install Skills** 버튼 클릭

**설치되는 Skills:**
- **Obsidian Markdown**: `[[wikilinks]]`, `![[embeds]]`, `> [!callout]`, YAML frontmatter 등
- **JSON Canvas**: `.canvas` 파일 생성 및 편집 지원

Skills가 설치되면 Claude가 다음을 더 잘 이해합니다:
- 내부 링크 및 임베드
- 콜아웃 문법
- 프로퍼티(frontmatter)
- Mermaid 다이어그램
- 수학 수식 (LaTeX)

### 🌐 GitHub에서 Community Skills 설치
전 세계 사용자들이 만든 다양한 Claude Code Skills를 설치하여 기능을 확장하세요!

1. **설정 → Obsidian Code → Install Skill from GitHub**
2. GitHub 저장소 URL 또는 `SKILL.md` 파일 URL 입력
   - 예: `https://github.com/username/awesome-skill`
3. **Install** 버튼 클릭

### 📎 다중 파일 컨텍스트
- `@`를 입력하여 여러 파일을 한 번에 첨부
- 첨부된 모든 파일이 **칩 형태**로 표시되어 한눈에 확인
- 각 칩에서 바로 열기, 핀, 삭제 가능

---

## ✨ 주요 기능 (Features)

*   **⚡️ 진짜 일하는 AI**: 클로드가 단순히 조언만 하는 게 아니라, 파일을 직접 생성하고 수정합니다. 터미널 명령어까지 실행할 수 있습니다.
*   **👀 눈치 빠른 비서**: 현재 여러분이 보고 있는 노트를 자동으로 참고합니다. `@`를 입력해서 특정 파일이나 폴더를 콕 집어 참고하라고 할 수도 있습니다.
*   **🖼️ 이미지 분석**: 이미지를 복사해서 붙여넣기(`Cmd/Ctrl+V`)하면 클로드가 내용을 분석해줍니다.
*   **✏️ 바로 수정하기**: 텍스트를 선택하고 단축키를 누르면, 그 부분만 쏙 골라 클로드가 수정해줍니다. (워드프로세서의 '변경 내용 추적'처럼 수정된 부분을 보여줍니다.)
*   **🧠 나만의 비서 교육**: `#`을 입력하면 클로드에게 "항상 이렇게 답변해"라고 지시사항(System Prompt)을 추가할 수 있습니다.
*   **🛠️ 도구 확장 (MCP)**: 외부 도구들과도 연결하여 기능을 무한히 확장할 수 있습니다.

---

## 🚀 필수 선행 작업 (Prerequisites)

이 플러그인은 Anthropic의 **Claude Code CLI**를 기반으로 작동합니다. 사용 전 다음 단계를 반드시 완료해주세요.

1.  **Claude Code 설치**: 터미널(또는 CMD/PowerShell)을 열고 아래 명령어를 입력하여 설치합니다.
    ```bash
    npm install -g @anthropic-ai/claude-code
    ```
2.  **인증 완료**: 터미널에서 `claude`를 입력하여 실행한 후, **브라우저를 통해 Anthropic 계정 인증을 1회 완료**해야 합니다. 인증이 완료되어 터미널에서 Claude와 대화가 가능한 상태여야 플러그인이 정상 작동합니다.

---

## 🚀 설치 방법 (Installation)

### 방법 1: BRAT을 이용한 설치 (권장)

이 플러그인은 아직 옵시디언 커뮤니티 정식 목록에 등록되지 않았을 수 있습니다. BRAT을 이용하면 가장 편하게 설치하고 업데이트를 받을 수 있습니다.

1.  **BRAT 설치**: 옵시디언 설정 > 커뮤니티 플러그인 > '탐색'에서 `BRAT`을 검색하여 설치하고 활성화합니다.
2.  **플러그인 추가**: 
    *   명령어 팔레트(`Cmd/Ctrl + P`)를 엽니다.
    *   `BRAT: Add a beta plugin for testing`을 입력하고 선택합니다.
3.  **주소 입력**: 
    *   URL 입력창에 다음 주소를 복사해서 붙여넣습니다:
    *   `https://github.com/OKEUNSOO/obsidian-ai`
4.  **활성화**: 
    *   설치가 완료되면 알림이 뜹니다.
    *   **설정(Settings) → 커뮤니티 플러그인(Community plugins)** 목록으로 가서 "ObsidianAI"를 찾아 켜주세요(Enable).

### 방법 2: 개발자용 설치 (직접 빌드)

코드를 직접 수정하거나 최신 개발 버전을 쓰고 싶은 분들을 위한 방법입니다.

1.  터미널을 열고 플러그인 폴더로 이동합니다.
    ```bash
    cd /path/to/vault/.obsidian/plugins
    git clone https://github.com/OKEUNSOO/obsidian-ai.git
    cd obsidian-ai
    ```
2.  필요한 도구를 설치하고 빌드합니다.
    ```bash
    npm install
    npm run build
    ```
3.  옵시디언 설정에서 플러그인을 켭니다.

---

## 🎮 사용 방법 (Usage)

사용법은 아주 직관적입니다.

1.  **채팅 시작하기**: 왼쪽 리본 메뉴의 로봇 아이콘을 누르거나, 명령어 창(Command Palette)에서 채팅을 엽니다.
2.  **문맥 추가하기 (`@`)**:
    *   채팅창에 `@`를 입력해보세요. 내 저장소의 다른 파일이나 폴더를 선택해서 "이것 좀 봐줘"라고 할 수 있습니다.
    *   `@foler/`라고 쓰면 특정 폴더 안의 파일들만 보여줍니다.
3.  **노트 핀하기 (📌)**:
    *   파일 칩의 핀 아이콘을 클릭하면 해당 노트가 고정됩니다.
    *   다른 노트를 열어도 핀된 노트는 사라지지 않습니다!
4.  **명령어 템플릿 (`/`)**:
    *   `/`를 입력하면 자주 쓰는 명령어 모음이 나옵니다.
5.  **바로 고치기 (Inline Edit)**:
    *   노트에서 고치고 싶은 문장을 드래그해서 선택합니다.
    *   지정된 단축키를 누르면 클로드가 그 부분만 수정해줍니다.

---

## ⚙️ 설정 가이드 (Configuration)

설정 메뉴에서 클로드를 더 똑똑하게 만들 수 있습니다.

*   **사용자 이름**: 클로드가 여러분을 부를 이름을 정해주세요.
*   **Obsidian Skills**: Claude가 Obsidian 문법을 이해하도록 Skills를 설치하세요.
*   **미디어 폴더**: 이미지를 붙여넣을 때 저장될 위치를 정합니다.
*   **안전 모드 (Safety)**:
    *   클로드가 터미널 명령어를 쓸 때 위험한 명령(`rm -rf` 등)은 막습니다.
    *   파일을 수정하거나 명령을 내릴 때마다 허락을 받도록 설정할 수 있습니다(권장).
*   **Claude Code CLI 설정**: 만약 "Claude Code CLI not found" 오류가 뜬다면, 컴퓨터에 설치된 Claude의 위치를 직접 알려줘야 합니다. (터미널에서 `which claude` 또는 `where.exe claude`로 찾을 수 있습니다.)

---

## ❓ 자주 묻는 질문 (Troubleshooting)

**Q. "Claude Code CLI not found"라고 뜨면서 안 돼요!**  
A. 클로드 프로그램이 어디 있는지 플러그인이 못 찾아서 그렇습니다. 설정(Settings) → ObsidianAI 탭에 가서 `Claude Code CLI path`에 직접 경로를 입력해주세요.

**MacOS/Linux 예시:**
1. 터미널에 `which claude` 입력
2. 나온 경로(예: `/usr/local/bin/claude`)를 복사해서 붙여넣기

**Windows 예시:**
1. 파워쉘에 `where.exe claude` 입력
2. 나온 경로(예: `C:\Users\...\claude.exe`)를 복사해서 붙여넣기

---

## 📜 라이선스 (License)

이 프로젝트는 [MIT License](LICENSE)를 따릅니다.

## 🙏 감사의 말

이 플러그인은 Obsidian, Anthropic, OpenAI의 위대한 도구들 덕분에 만들어졌습니다.
