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
