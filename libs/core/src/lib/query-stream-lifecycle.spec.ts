import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from './host/craft-compat';
import { craftSignal } from './host/craft-signal';
import { craftUse } from './craft-use';
import { query } from './query';
import { setupCraftServiceTest } from './setup-craft-service-test';

describe('query stream lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([true, false])(
    'stops a disabled stream and can activate a new stream (preservePreviousValue: %s)',
    async (preservePreviousValue) => {
      const { injector } = setupCraftServiceTest();
      const params = craftSignal<number | undefined>(1);
      const first = signal({ value: { label: 'first' } });
      const second = signal({ value: { label: 'second' } });
      const live = injector.run(() =>
        craftUse(
          query('live', {
            params: () => params(),
            preservePreviousValue: () => preservePreviousValue,
            stream: ({ params }) => (params === 1 ? first : second),
          }),
        ),
      );
      try {
        await vi.runAllTimersAsync();
        expect(craftUse(live.value())).toEqual({ label: 'first' });

        params.set(undefined);
        first.set({ value: { label: 'stale' } });
        expect(craftUse(live.status())).toBe('idle');
        expect(craftUse(live.value())).toBeUndefined();

        params.set(2);
        await vi.runAllTimersAsync();
        first.set({ value: { label: 'still stale' } });
        second.set({ value: { label: 'updated' } });
        expect(craftUse(live.status())).toBe('resolved');
        expect(craftUse(live.value())).toEqual({ label: 'updated' });

        injector.destroy();
        second.set({ value: { label: 'after destroy' } });
        expect(craftUse(live.status())).toBe('idle');
        expect(craftUse(live.value())).toBeUndefined();
      } finally {
        injector.destroy();
      }
    },
  );

  it('ignores a stream that becomes available after its query is disabled', async () => {
    const { injector } = setupCraftServiceTest();
    const params = signal<number | undefined>(1);
    const updates = signal({ value: { label: 'late' } });
    let resolve!: (stream: typeof updates) => void;
    const live = injector.run(() =>
      craftUse(
        query('delayedStream', {
          params: () => params(),
          stream: () =>
            new Promise<typeof updates>((done) => {
              resolve = done;
            }),
        }),
      ),
    );
    try {
      params.set(undefined);
      resolve(updates);
      await vi.runAllTimersAsync();
      updates.set({ value: { label: 'later' } });
      expect(craftUse(live.status())).toBe('idle');
      expect(craftUse(live.value())).toBeUndefined();
    } finally {
      injector.destroy();
    }
  });
});
