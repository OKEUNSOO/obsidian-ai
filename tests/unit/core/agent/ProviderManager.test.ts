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
