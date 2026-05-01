import type { ProviderId } from './types';

type ProviderChangeCallback = (id: ProviderId, previousId: ProviderId) => void | Promise<void>;

export class ProviderManager {
  private _activeProvider: ProviderId = 'claude';
  private listeners = new Set<ProviderChangeCallback>();

  get activeProvider(): ProviderId {
    return this._activeProvider;
  }

  async setProvider(id: ProviderId): Promise<void> {
    if (this._activeProvider === id) return;
    const previousId = this._activeProvider;
    this._activeProvider = id;
    for (const cb of this.listeners) {
      await cb(id, previousId);
    }
  }

  onProviderChange(callback: ProviderChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
