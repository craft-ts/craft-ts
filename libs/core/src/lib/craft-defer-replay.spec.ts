import { afterEach, describe, expect, it } from 'vitest';
import {
  ɵregisterCraftDeferReplayTarget,
  ɵresolveCraftDeferReplayTarget,
} from './craft-defer-replay';

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function register(
  path: readonly string[],
  activate: () => Promise<'loaded' | 'error'>,
  stable = true,
) {
  const registered = ɵregisterCraftDeferReplayTarget(path, activate, stable);
  cleanups.push(registered.unregister);
  return registered.id;
}

describe('craft defer replay targets', () => {
  it('resolves a remounted node from the same render path', async () => {
    const first = register(['Page', 'defer:details'], async () => 'loaded');
    cleanups.splice(0).forEach((cleanup) => cleanup());
    const expected = vi.fn(async () => 'loaded' as const);
    const remounted = register(['Page', 'defer:details'], expected);

    const resolution = ɵresolveCraftDeferReplayTarget(first);
    expect(remounted).toBe(first);
    expect(resolution.status).toBe('resolved');
    if (resolution.status === 'resolved')
      await expect(resolution.activate()).resolves.toBe('loaded');
    expect(expected).toHaveBeenCalledOnce();
  });

  it('rejects unstable and ambiguous identities', () => {
    const unstable = register(
      ['List', 'item:2', 'defer:details'],
      async () => 'loaded',
      false,
    );
    expect(ɵresolveCraftDeferReplayTarget(unstable)).toEqual({
      status: 'unstable-identity',
    });

    const first = register(['Page', 'defer:details'], async () => 'loaded');
    register(['Page', 'defer:details'], async () => 'loaded');
    expect(ɵresolveCraftDeferReplayTarget(first)).toEqual({
      status: 'ambiguous',
    });
    expect(ɵresolveCraftDeferReplayTarget('missing')).toEqual({
      status: 'missing',
    });
  });
});
