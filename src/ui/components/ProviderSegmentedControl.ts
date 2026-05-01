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
      btn.addEventListener('click', () => {
        void this.providerManager.setProvider(id);
      });
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
