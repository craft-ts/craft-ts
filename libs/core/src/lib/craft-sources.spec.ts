import { craft } from './craft';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftSources } from './craft-sources';
import { signalSource } from './signal-source';
import { craftState } from './craft-state';
import { afterRecomputation } from './after-recomputation';
import { state } from './state';
import { source$ } from './source$';
import { on$ } from './on$';
import { of, Subject } from 'rxjs';

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
      craftSources(() => ({
        increment: signalSource<{}>(),
      })),
      craftState('test', ({ increment }) =>
        state(signal(0), ({ state, set }) => ({
          increment: afterRecomputation(increment, () => set(state() + 1)),
        })),
      ),
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

  it('3- Should expose a way to use local source$', async () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: source$<void>(),
        to: source$<number>(),
      })),
      craftState('counter', ({ increment, to }) =>
        state(signal(0), ({ state, set }) => ({
          increment: on$(increment, () => set(state() + 1)),
          setTo: on$(to, (count) => set(count)),
        })),
      ),
    );
    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft();
      await vi.runAllTimersAsync();

      expect(store.counter()).toEqual(0);

      store.emitIncrement();
      store.emitIncrement();
      store.emitIncrement();
      expect(store.counter()).toEqual(3);

      store.emitTo(10);
      expect(store.counter()).toEqual(10);
    });
  });

  it('5- Should expose a way to use local Observables', async () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftSources(() => ({
        increment: new Subject<void>(),
        to: new Subject<number>(),
      })),
      craftState('counter', ({ increment, to }) =>
        state(signal(0), ({ state, set }) => ({
          increment: on$(increment, () => set(state() + 1)),
          setTo: on$(to, (count) => set(count)),
        })),
      ),
    );
    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft();
      await vi.runAllTimersAsync();

      expect(store.counter()).toEqual(0);

      store.nextIncrement();
      store.nextIncrement();
      store.nextIncrement();
      expect(store.counter()).toEqual(3);

      store.nextTo(10);
      expect(store.counter()).toEqual(10);
    });
  });

  it('5- Should not expose a nextX source when using a readonly Observable', async () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftSources(() => ({
        to: of(10),
      })),
      craftState('counter', ({ to }) =>
        state(signal(0), ({ set }) => ({
          setTo: on$(to, (count) => set(count)),
        })),
      ),
    );
    await TestBed.runInInjectionContext(async () => {
      const store = injectCraft();
      await vi.runAllTimersAsync();

      expect(store.counter()).toEqual(10);

      expectTypeOf<keyof typeof store>().toEqualTypeOf<'counter'>();
    });
  });
});
