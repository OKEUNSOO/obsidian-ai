import { ProviderManager } from '../../../../src/core/agent/ProviderManager';

describe('ProviderManager', () => {
  it('defaults to claude provider', () => {
    const pm = new ProviderManager();
    expect(pm.activeProvider).toBe('claude');
  });

  it('switches provider and notifies listeners', async () => {
    const pm = new ProviderManager();
    const changes: string[] = [];
    pm.onProviderChange((id) => {
      changes.push(id);
    });
    await pm.setProvider('codex');
    expect(pm.activeProvider).toBe('codex');
    expect(changes).toEqual(['codex']);
  });

  it('unsubscribes listener', async () => {
    const pm = new ProviderManager();
    const changes: string[] = [];
    const unsub = pm.onProviderChange((id) => {
      changes.push(id);
    });
    unsub();
    await pm.setProvider('codex');
    expect(changes).toHaveLength(0);
  });

  it('does not notify if provider unchanged', async () => {
    const pm = new ProviderManager();
    const changes: string[] = [];
    pm.onProviderChange((id) => {
      changes.push(id);
    });
    await pm.setProvider('claude');
    expect(changes).toHaveLength(0);
  });

  it('awaits async listeners in registration order before resolving', async () => {
    const pm = new ProviderManager();
    const events: string[] = [];

    pm.onProviderChange(async (id, previousId) => {
      events.push(`first-start:${previousId}->${id}`);
      await Promise.resolve();
      events.push('first-end');
    });
    pm.onProviderChange(() => {
      events.push('second');
    });

    const switching = pm.setProvider('codex');
    events.push('after-call');
    await switching;

    expect(events).toEqual([
      'first-start:claude->codex',
      'after-call',
      'first-end',
      'second',
    ]);
  });
});
