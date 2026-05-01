/**
 * ObsidianCode - Settings tab
 *
 * Plugin settings UI for hotkeys, customization, safety, and environment variables.
 */

import * as fs from 'fs';
import type { App } from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';

import { getCurrentPlatformKey } from '../../core/types';
import type ObsidianCodePlugin from '../../main';
import { EnvSnippetManager, McpSettingsManager, SlashCommandSettings } from '../../ui';
import { expandHomePath } from '../../utils/path';
import { getInstalledSkills, installObsidianSkills, installSkillFromUrl, isObsidianSkillsInstalled, removeSkill, uninstallObsidianSkills } from '../skills/ObsidianSkillsInstaller';
import { buildNavMappingText, parseNavMappings } from './keyboardNavigation';

/** Format a hotkey for display (e.g., "Cmd+Shift+E" on Mac, "Ctrl+Shift+E" on Windows). */
function formatHotkey(hotkey: { modifiers: string[]; key: string }): string {
  const isMac = navigator.platform.includes('Mac');
  const modMap: Record<string, string> = isMac
    ? { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }
    : { Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win' };

  const mods = hotkey.modifiers.map((m) => modMap[m] || m);
  const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;

  return isMac ? [...mods, key].join('') : [...mods, key].join('+');
}

/** Open Obsidian's hotkey settings filtered to ObsidianCode commands. */
function openHotkeySettings(app: App): void {
  const setting = (app as any).setting;
  setting.open();
  setting.openTabById('hotkeys');
  // Slight delay to ensure the tab is loaded
  setTimeout(() => {
    const tab = setting.activeTab;
    if (tab) {
      // Handle both old and new Obsidian versions
      const searchEl = tab.searchInputEl ?? tab.searchComponent?.inputEl;
      if (searchEl) {
        searchEl.value = 'Obsidian Code';
        tab.updateHotkeyVisibility?.();
      }
    }
  }, 100);
}

/** Get the current hotkey string for a command, or null if not set. */
function getHotkeyForCommand(app: App, commandId: string): string | null {
  // Access Obsidian's internal hotkey manager
  const hotkeyManager = (app as any).hotkeyManager;
  if (!hotkeyManager) return null;

  // Get custom hotkeys first, then fall back to defaults
  const customHotkeys = hotkeyManager.customKeys?.[commandId];
  const defaultHotkeys = hotkeyManager.defaultKeys?.[commandId];
  const hotkeys = customHotkeys?.length > 0 ? customHotkeys : defaultHotkeys;

  if (!hotkeys || hotkeys.length === 0) return null;

  return hotkeys.map(formatHotkey).join(', ');
}

/** Plugin settings tab displayed in Obsidian's settings pane. */
export class ObsidianCodeSettingTab extends PluginSettingTab {
  plugin: ObsidianCodePlugin;

  constructor(app: App, plugin: ObsidianCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('oc-settings');

    containerEl.createEl('h2', { text: '🌐 공통 설정', attr: { style: 'margin-top: 1em; margin-bottom: 0.5em; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 0.3em;' } });

    // 개인화 섹션
    new Setting(containerEl).setName('개인화').setHeading();

    new Setting(containerEl)
      .setName('이름')
      .setDesc('개인화된 인사말에 사용할 이름을 입력하세요 (비워두면 일반 인사말 사용)')
      .addText((text) =>
        text
          .setPlaceholder('이름 입력')
          .setValue(this.plugin.settings.userName)
          .onChange(async (value) => {
            this.plugin.settings.userName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('제외 태그')
      .setDesc('이 태그가 있는 노트는 자동으로 컨텍스트에 포함되지 않습니다 (한 줄에 하나씩, # 제외)')
      .addTextArea((text) => {
        text
          .setPlaceholder('system\nprivate\ndraft')
          .setValue(this.plugin.settings.excludedTags.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedTags = value
              .split(/\r?\n/)
              .map((s) => s.trim().replace(/^#/, ''))
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 30;
      });

    new Setting(containerEl)
      .setName('미디어 폴더')
      .setDesc('첨부 파일/이미지가 있는 폴더. ![[image.jpg]] 형식의 노트에서 Claude가 이 폴더를 참조합니다. 비워두면 볼트 루트 사용.')
      .addText((text) => {
        text
          .setPlaceholder('attachments')
          .setValue(this.plugin.settings.mediaFolder)
          .onChange(async (value) => {
            this.plugin.settings.mediaFolder = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('oc-settings-media-input');
      });

    new Setting(containerEl)
      .setName('커스텀 시스템 프롬프트')
      .setDesc('기본 시스템 프롬프트에 추가할 지시사항')
      .addTextArea((text) => {
        text
          .setPlaceholder('커스텀 지시사항을 입력하세요...')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
      });

    new Setting(containerEl)
      .setName('대화 제목 자동 생성')
      .setDesc('첫 번째 대화 후 자동으로 대화 제목을 생성합니다.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoTitleGeneration)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoTitleGeneration = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );


    new Setting(containerEl)
      .setName('Vim 스타일 탐색 키 매핑')
      .setDesc('한 줄에 하나씩 입력. 형식: "map <키> <동작>" (동작: scrollUp, scrollDown, focusInput)')
      .addTextArea((text) => {
        let pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
        let saveTimeout: number | null = null;

        const commitValue = async (showError: boolean): Promise<void> => {
          if (saveTimeout !== null) {
            window.clearTimeout(saveTimeout);
            saveTimeout = null;
          }

          const result = parseNavMappings(pendingValue);
          if (!result.settings) {
            if (showError) {
              new Notice(`잘못된 탐색 키 매핑: ${result.error}`);
              pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
              text.setValue(pendingValue);
            }
            return;
          }

          this.plugin.settings.keyboardNavigation.scrollUpKey = result.settings.scrollUp;
          this.plugin.settings.keyboardNavigation.scrollDownKey = result.settings.scrollDown;
          this.plugin.settings.keyboardNavigation.focusInputKey = result.settings.focusInput;
          await this.plugin.saveSettings();
          pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
          text.setValue(pendingValue);
        };

        const scheduleSave = (): void => {
          if (saveTimeout !== null) {
            window.clearTimeout(saveTimeout);
          }
          saveTimeout = window.setTimeout(() => {
            void commitValue(false);
          }, 500);
        };

        text
          .setPlaceholder('map w scrollUp\nmap s scrollDown\nmap i focusInput')
          .setValue(pendingValue)
          .onChange((value) => {
            pendingValue = value;
            scheduleSave();
          });

        text.inputEl.rows = 3;
        text.inputEl.addEventListener('blur', async () => {
          await commitValue(true);
        });
      });

    // Obsidian 스킬 섹션
    new Setting(containerEl).setName('Obsidian 스킬').setHeading();

    const skillsDesc = containerEl.createDiv({ cls: 'oc-skills-settings-desc' });
    skillsDesc.createEl('p', {
      text: 'Obsidian 전용 스킬을 설치하여 Claude가 Obsidian Flavored Markdown, 위키링크, 콜아웃, 프로퍼티, JSON Canvas 형식을 더 잘 이해하도록 도와줍니다.',
      cls: 'setting-item-description',
    });

    // 번들 Obsidian 스킬 (설치/재설치/제거)
    const skillsInstalled = isObsidianSkillsInstalled(this.app);
    new Setting(containerEl)
      .setName('Obsidian 스킬')
      .setDesc(skillsInstalled
        ? '✅ 설치됨 - Claude가 Obsidian 문법을 더 잘 이해합니다.'
        : '미설치 - 클릭하여 Obsidian 지원 스킬을 설치하세요.')
      .addButton((button) => {
        if (skillsInstalled) {
          button
            .setButtonText('재설치')
            .onClick(async () => {
              await installObsidianSkills(this.app);
              this.display();
            });
        } else {
          button
            .setButtonText('스킬 설치')
            .setCta()
            .onClick(async () => {
              await installObsidianSkills(this.app);
              this.display();
            });
        }
      })
      .addButton((button) => {
        if (skillsInstalled) {
          button
            .setButtonText('제거')
            .onClick(async () => {
              await uninstallObsidianSkills(this.app);
              this.display();
            });
        }
      });

    // GitHub에서 설치
    let skillUrl = '';
    let textInput: HTMLInputElement | null = null;
    new Setting(containerEl)
      .setName('GitHub에서 스킬 설치')
      .setDesc('GitHub URL(저장소 URL 또는 SKILL.md 링크)을 입력하여 커스텀 스킬을 설치하세요.')
      .addText(text => {
        textInput = text.inputEl;
        text
          .setPlaceholder('https://github.com/username/repo')
          .onChange(async (value) => {
            skillUrl = value;
          });
      })
      .addButton(btn => {
        btn.setButtonText('설치')
          .setCta()
          .onClick(async () => {
            if (!skillUrl) {
              new Notice('URL을 입력해주세요');
              return;
            }

            btn.setButtonText('설치 중...').setDisabled(true);

            try {
              const success = await installSkillFromUrl(this.app, skillUrl);
              if (success) {
                if (textInput) textInput.value = '';
                skillUrl = '';
                this.display();
              }
            } finally {
              btn.setButtonText('설치').setDisabled(false);
            }
          });
      });

    // 설치된 스킬 목록 표시
    const installedSkills = getInstalledSkills(this.app);

    if (installedSkills.length > 0) {
      const installedSkillsDesc = containerEl.createDiv({ cls: 'oc-skills-installed-desc' });
      installedSkillsDesc.createEl('p', {
        text: `설치된 스킬 (${installedSkills.length}개):`,
        cls: 'setting-item-description',
      });

      const skillsListEl = containerEl.createDiv({ cls: 'oc-skills-list' });

      for (const skill of installedSkills) {
        const skillItemEl = skillsListEl.createDiv({ cls: 'oc-skills-item' });

        const skillInfoEl = skillItemEl.createDiv({ cls: 'oc-skills-item-info' });

        const skillNameEl = skillInfoEl.createSpan({ cls: 'oc-skills-item-name' });
        skillNameEl.setText(skill.name);

        if (skill.isBuiltIn) {
          const builtInBadge = skillInfoEl.createSpan({ cls: 'oc-skills-builtin-badge' });
          builtInBadge.setText('기본 제공');
        }

        const skillDescEl = skillInfoEl.createDiv({ cls: 'oc-skills-item-desc' });
        skillDescEl.setText(skill.description.length > 100
          ? skill.description.substring(0, 100) + '...'
          : skill.description);

        // 커스텀 스킬만 개별 제거 버튼 표시
        if (!skill.isBuiltIn) {
          const removeBtn = skillItemEl.createEl('button', {
            text: '제거',
            cls: 'oc-skills-remove-btn',
          });
          removeBtn.addEventListener('click', async () => {
            await removeSkill(this.app, skill.name);
            this.display();
          });
        }
      }
    } else {
      const emptyEl = containerEl.createDiv({ cls: 'oc-skills-empty' });
      emptyEl.setText('설치된 스킬이 없습니다. 위에서 Obsidian 스킬을 설치하거나 GitHub에서 커스텀 스킬을 추가하세요.');
    }

    // 단축키 섹션
    new Setting(containerEl).setName('단축키').setHeading();

    const inlineEditCommandId = 'cc-obsidian:inline-edit';
    const inlineEditHotkey = getHotkeyForCommand(this.app, inlineEditCommandId);
    new Setting(containerEl)
      .setName('인라인 편집 단축키')
      .setDesc(inlineEditHotkey
        ? `현재: ${inlineEditHotkey}`
        : '단축키가 설정되지 않았습니다. 클릭하여 설정하세요.')
      .addButton((button) =>
        button
          .setButtonText(inlineEditHotkey ? '변경' : '단축키 설정')
          .onClick(() => openHotkeySettings(this.app))
      );

    const openChatCommandId = 'cc-obsidian:open-view';
    const openChatHotkey = getHotkeyForCommand(this.app, openChatCommandId);
    new Setting(containerEl)
      .setName('채팅 열기 단축키')
      .setDesc(openChatHotkey
        ? `현재: ${openChatHotkey}`
        : '단축키가 설정되지 않았습니다. 클릭하여 설정하세요.')
      .addButton((button) =>
        button
          .setButtonText(openChatHotkey ? '변경' : '단축키 설정')
          .onClick(() => openHotkeySettings(this.app))
      );

    // 슬래시 커맨드 섹션
    new Setting(containerEl).setName('슬래시 커맨드').setHeading();

    const slashCommandsDesc = containerEl.createDiv({ cls: 'oc-slash-settings-desc' });
    slashCommandsDesc.createEl('p', {
      text: '이 vault의 .claude/commands 안에 저장되는 프로젝트 전용 /command 프롬프트 템플릿을 만드세요. $ARGUMENTS(전체 인수), $1/$2(위치 인수), @file(파일 내용), !`bash`(명령 출력)를 사용할 수 있습니다.',
      cls: 'setting-item-description',
    });

    const slashCommandsContainer = containerEl.createDiv({ cls: 'oc-slash-commands-container' });
    new SlashCommandSettings(slashCommandsContainer, this.plugin);

    // MCP 서버 섹션
    new Setting(containerEl).setName('MCP 서버').setHeading();

    const mcpDesc = containerEl.createDiv({ cls: 'oc-mcp-settings-desc' });
    mcpDesc.createEl('p', {
      text: 'Model Context Protocol 서버를 설정하여 외부 도구 및 데이터 소스로 Claude의 기능을 확장하세요. 컨텍스트 절약 모드의 서버는 @멘션 시에만 활성화됩니다.',
      cls: 'setting-item-description',
    });

    const mcpContainer = containerEl.createDiv({ cls: 'oc-mcp-container' });
    new McpSettingsManager(mcpContainer, this.plugin);

    // 보안 섹션
    new Setting(containerEl).setName('보안').setHeading();

    new Setting(containerEl)
      .setName('명령어 차단 목록 사용')
      .setDesc('위험한 bash 명령어를 차단합니다')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableBlocklist)
          .onChange(async (value) => {
            this.plugin.settings.enableBlocklist = value;
            await this.plugin.saveSettings();
          })
      );

    const platformKey = getCurrentPlatformKey();
    const isWindows = platformKey === 'windows';
    const platformLabel = isWindows ? 'Windows' : 'Unix';

    new Setting(containerEl)
      .setName(`차단 명령어 (${platformLabel})`)
      .setDesc(`${platformLabel}에서 차단할 패턴 (한 줄에 하나씩). 정규식 지원.`)
      .addTextArea((text) => {
        const placeholder = isWindows
          ? 'del /s /q\nrd /s /q\nRemove-Item -Recurse -Force'
          : 'rm -rf\nchmod 777\nmkfs';
        text
          .setPlaceholder(placeholder)
          .setValue(this.plugin.settings.blockedCommands[platformKey].join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.blockedCommands[platformKey] = value
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 40;
      });

    // Windows에서는 Git Bash 때문에 Unix 차단 목록도 표시
    if (isWindows) {
      new Setting(containerEl)
        .setName('차단 명령어 (Unix/Git Bash)')
        .setDesc('Git Bash에서도 실행될 수 있으므로 Windows에서도 Unix 패턴을 차단합니다.')
        .addTextArea((text) => {
          text
            .setPlaceholder('rm -rf\nchmod 777\nmkfs')
            .setValue(this.plugin.settings.blockedCommands.unix.join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.blockedCommands.unix = value
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
          text.inputEl.cols = 40;
        });
    }

    new Setting(containerEl)
      .setName('허용 내보내기 경로')
      .setDesc('볼트 외부에서 파일을 내보낼 수 있는 경로 (한 줄에 하나씩). ~는 홈 디렉토리를 의미합니다.')
      .addTextArea((text) => {
        const placeholder = process.platform === 'win32'
          ? '~/Desktop\n~/Downloads\n%TEMP%'
          : '~/Desktop\n~/Downloads\n/tmp';
        text
          .setPlaceholder(placeholder)
          .setValue(this.plugin.settings.allowedExportPaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.allowedExportPaths = value
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 40;
      });

    const approvedDesc = containerEl.createDiv({ cls: 'oc-approved-desc' });
    approvedDesc.createEl('p', {
      text: '"항상 허용"으로 영구 승인된 작업들입니다. Safe 모드에서도 승인 없이 실행됩니다.',
      cls: 'setting-item-description',
    });

    const permissions = this.plugin.settings.permissions;

    if (permissions.length === 0) {
      const emptyEl = containerEl.createDiv({ cls: 'oc-approved-empty' });
      emptyEl.setText('승인된 작업이 없습니다. 승인 대화상자에서 "항상 허용"을 클릭하면 여기에 표시됩니다.');
    } else {
      const listEl = containerEl.createDiv({ cls: 'oc-approved-list' });

      for (const action of permissions) {
        const itemEl = listEl.createDiv({ cls: 'oc-approved-item' });

        const infoEl = itemEl.createDiv({ cls: 'oc-approved-item-info' });

        const toolEl = infoEl.createSpan({ cls: 'oc-approved-item-tool' });
        toolEl.setText(action.toolName);

        const patternEl = infoEl.createDiv({ cls: 'oc-approved-item-pattern' });
        patternEl.setText(action.pattern);

        const dateEl = infoEl.createSpan({ cls: 'oc-approved-item-date' });
        dateEl.setText(new Date(action.approvedAt).toLocaleDateString());

        const removeBtn = itemEl.createEl('button', {
          text: '제거',
          cls: 'oc-approved-remove-btn',
        });
        removeBtn.addEventListener('click', async () => {
          this.plugin.settings.permissions =
            this.plugin.settings.permissions.filter((a) => a !== action);
          await this.plugin.saveSettings();
          this.display();
        });
      }

      // 전체 삭제 버튼
      new Setting(containerEl)
        .setName('승인된 작업 전체 삭제')
        .setDesc('영구 승인된 모든 작업을 제거합니다')
        .addButton((button) =>
          button
            .setButtonText('전체 삭제')
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.permissions = [];
              await this.plugin.saveSettings();
              this.display();
            })
        );
    }

    // 환경 변수 섹션
    new Setting(containerEl).setName('환경 변수').setHeading();

    new Setting(containerEl)
      .setName('커스텀 변수')
      .setDesc('API 요청용 환경 변수 (KEY=VALUE 형식, 한 줄에 하나씩)')
      .addTextArea((text) => {
        text
          .setPlaceholder('ANTHROPIC_API_KEY=your-key\nANTHROPIC_BASE_URL=https://api.example.com\nANTHROPIC_MODEL=custom-model')
          .setValue(this.plugin.settings.environmentVariables)
          .onChange(async (value) => {
            await this.plugin.applyEnvironmentVariables(value);
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
        text.inputEl.addClass('oc-settings-env-textarea');
      });

    // 환경 변수 스니펫 섹션
    const envSnippetsContainer = containerEl.createDiv({ cls: 'oc-env-snippets-container' });
    new EnvSnippetManager(envSnippetsContainer, this.plugin);

    containerEl.createEl('h2', { text: '🤖 Codex 설정', attr: { style: 'margin-top: 2em; margin-bottom: 0.5em; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 0.3em;' } });

    // Codex 설정 섹션
    new Setting(containerEl).setName('일반').setHeading();

    new Setting(containerEl)
      .setName('Codex CLI 경로')
      .setDesc('Codex CLI 실행 파일 경로. 비워두면 자동 감지. 터미널에서 "which codex" 출력값을 입력하세요.')
      .addText((text) => {
        text
          .setPlaceholder('/usr/local/bin/codex')
          .setValue(this.plugin.settings.codexCliPath || '')
          .onChange(async (value) => {
            this.plugin.settings.codexCliPath = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
      });

    new Setting(containerEl)
      .setName('Codex 모델')
      .setDesc('사용할 Codex 모델. 비워두면 기본 모델 사용.')
      .addText((text) => {
        text
          .setPlaceholder('o4-mini')
          .setValue(this.plugin.settings.codexModel || '')
          .onChange(async (value) => {
            this.plugin.settings.codexModel = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Codex 추론 강도')
      .setDesc('Codex의 추론 노력 수준을 설정합니다.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('low', '낮음 (low) — 빠름')
          .addOption('medium', '보통 (medium) — 균형')
          .addOption('high', '높음 (high) — 정확')
          .setValue(this.plugin.settings.codexReasoningEffort || 'medium')
          .onChange(async (value) => {
            this.plugin.settings.codexReasoningEffort = value as 'low' | 'medium' | 'high';
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl('h2', { text: '🧠 Claude 설정', attr: { style: 'margin-top: 2em; margin-bottom: 0.5em; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 0.3em;' } });

    // Claude 설정 섹션
    new Setting(containerEl).setName('일반').setHeading();

    new Setting(containerEl)
      .setName('사용자 Claude 설정 불러오기')
      .setDesc('~/.claude/settings.json을 불러옵니다. 활성화 시 사용자의 Claude Code 권한 규칙이 Safe 모드를 우회할 수 있습니다.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.loadUserClaudeSettings)
          .onChange(async (value) => {
            this.plugin.settings.loadUserClaudeSettings = value;
            await this.plugin.saveSettings();
          })
      );

    const cliPathDescription = (process.platform === 'win32'
      ? 'Claude Code CLI 경로를 직접 지정합니다. 비워두면 자동 감지. 네이티브 설치의 경우 claude.exe 사용. npm/pnpm/yarn 등 패키지 매니저 설치의 경우 cli.js 경로 사용 (claude.cmd 아님).'
      : 'Claude Code CLI 경로를 직접 지정합니다. 비워두면 자동 감지. "which claude" 출력값을 붙여넣으세요 — 네이티브 및 npm/pnpm/yarn 설치 모두 지원.')
      + ' **참고: Claude Code CLI(`npm install -g @anthropic-ai/claude-code`)를 설치하고 터미널에서 한 번 실행하여 브라우저 인증을 완료해야 합니다.**';

    const cliPathSetting = new Setting(containerEl)
      .setName('Claude Code CLI 경로')
      .setDesc(cliPathDescription);

    // 유효성 검사 메시지 요소 생성
    const validationEl = containerEl.createDiv({ cls: 'oc-cli-path-validation' });
    validationEl.style.color = 'var(--text-error)';
    validationEl.style.fontSize = '0.85em';
    validationEl.style.marginTop = '-0.5em';
    validationEl.style.marginBottom = '0.5em';
    validationEl.style.display = 'none';

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed) return null; // 비어있으면 유효 (자동 감지)

      const expandedPath = expandHomePath(trimmed);

      if (!fs.existsSync(expandedPath)) {
        return '경로가 존재하지 않습니다';
      }
      const stat = fs.statSync(expandedPath);
      if (!stat.isFile()) {
        return '파일이 아닌 디렉토리입니다';
      }
      return null;
    };

    cliPathSetting.addText((text) => {
      const placeholder = process.platform === 'win32'
        ? 'D:\\nodejs\\node_global\\node_modules\\@anthropic-ai\\claude-code\\cli.js'
        : '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js';
      text
        .setPlaceholder(placeholder)
        .setValue(this.plugin.settings.claudeCliPath || '')
        .onChange(async (value) => {
          const error = validatePath(value);
          if (error) {
            validationEl.setText(error);
            validationEl.style.display = 'block';
            text.inputEl.style.borderColor = 'var(--text-error)';
          } else {
            validationEl.style.display = 'none';
            text.inputEl.style.borderColor = '';
          }

          this.plugin.settings.claudeCliPath = value.trim();
          await this.plugin.saveSettings();
          // 캐시된 경로 초기화 (다음 쿼리 시 새 경로 사용)
          this.plugin.cliResolver?.reset();
          this.plugin.agentService?.cleanup();
        });
      text.inputEl.addClass('oc-settings-cli-path-input');
      text.inputEl.style.width = '100%';

      // 초기 로드 시 유효성 검사
      const initialError = validatePath(this.plugin.settings.claudeCliPath || '');
      if (initialError) {
        validationEl.setText(initialError);
        validationEl.style.display = 'block';
        text.inputEl.style.borderColor = 'var(--text-error)';
      }
    });

  }
}
