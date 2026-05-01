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
  modelOverride?: string;
}
