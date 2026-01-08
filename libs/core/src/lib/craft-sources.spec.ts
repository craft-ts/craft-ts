import { craft } from './craft';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftSources } from './craft-sources';
import { source } from './source';
import { craftState } from './craft-state';
import { afterRecomputation } from './after-recomputation';
import { state } from './state';

describe('craftSources', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('1- Should expose a way to use local sources', async () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftSources({
        increment: source<{}>(),
      }),
      craftState('test', ({ increment }) =>
        state(signal(0), ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
        }))
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft();
      await vi.runAllTimersAsync();

      expect(store.test()).toEqual(0);

      store.setIncrement({});

      await vi.runAllTimersAsync();
      expect(store.test()).toEqual(1);
    });
  });

  it('2- Should expose a way to call setXSource outside injection context', async () => {
    const appRef = TestBed.inject(ApplicationRef);
    const { injectCraft, setIncrement } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftSources({
        increment: source<{}>(),
      }),
      craftState('test', ({ increment }) =>
        state(signal(0), ({ state, set }) => ({
          increment: afterRecomputation(increment, () => {
            return set(state() + 1);
          }),
        }))
      )
    );

    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft({});

      expect(store.test()).toEqual(0);

      appRef.tick();
      setIncrement({});

      appRef.tick();

      expect(store.test()).toEqual(1);
    });
  });
});
