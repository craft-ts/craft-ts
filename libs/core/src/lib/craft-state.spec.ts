import { computed, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craft } from './craft';
import { craftSources } from './craft-sources';
import { source } from './source';
import { craftState } from './craft-state';
import { afterRecomputation } from './after-recomputation';
import { state } from './state';

describe('craftState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should enable to defined  craft state', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftState('numberList', () => state([1]))
      );
      const store = injectCraft();
      await vi.runAllTimersAsync();

      expectTypeOf(store.numberList).toEqualTypeOf<Signal<number[]>>();

      expect(store.numberList()).toEqual([1]);
    });
  });
  it('should enable to defined craft state with a method', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftState('numberList', () =>
          state([1], ({ set, state }) => ({
            addNumber: (numberValue: number) => {
              console.log('addNumber numberValue', numberValue);
              const stateValue = state();
              set([...stateValue, numberValue]);
            },
          }))
        )
      );
      const store = injectCraft();
      await vi.runAllTimersAsync();
      store.numberListAddNumber(2);

      expectTypeOf(store.numberList).toEqualTypeOf<Signal<number[]>>();

      expect(store.numberList()).toEqual([1, 2]);
    });
  });

  it('should enable to defined craft state with a computed values', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftState('numberList', () =>
          state([1], ({ set, state }) => ({
            addNumber: (numberValue: number) => {
              console.log('addNumber numberValue', numberValue);
              const stateValue = state();
              set([...stateValue, numberValue]);
            },
            count: computed(() => state().length),
          }))
        )
      );
      const store = injectCraft();
      await vi.runAllTimersAsync();
      store.numberListAddNumber(2);

      expectTypeOf(store.numberList).toEqualTypeOf<Signal<number[]>>();

      expect(store.numberList()).toEqual([1, 2]);

      expectTypeOf(store.numberListCount).toEqualTypeOf<Signal<number>>();

      expect(store.numberListCount()).toEqual(2);
    });
  });

  it('should enable to defined a state that react on sources and inputs and other states', async () => {
    await TestBed.runInInjectionContext(async () => {
      const globalReset = source<{}>();

      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftSources({
          reset: source<string>(),
        }),
        craftState('numberList', ({ reset }) =>
          state([1], ({ set, state }) => ({
            addNumber: (numberValue: number) => {
              console.log('addNumber numberValue', numberValue);
              const stateValue = state();
              set([...stateValue, numberValue]);
            },
            reset: afterRecomputation(reset, (resetValue) => {
              expectTypeOf(resetValue).toEqualTypeOf<string>();
              set([]);
            }),
            globalReset: afterRecomputation(globalReset, (resetValue) => {
              expectTypeOf(resetValue).toEqualTypeOf<{}>();
              set([42]);
            }),
          }))
        )
      );
      const store = injectCraft();
      await vi.runAllTimersAsync();
      store.numberListAddNumber(2);

      expectTypeOf(store.numberList).toEqualTypeOf<Signal<number[]>>();

      expect(store.numberList()).toEqual([1, 2]);

      store.numberListAddNumber(3);
      expect(store.numberList()).toEqual([1, 2, 3]);

      store.setReset('localReset');
      await vi.runAllTimersAsync();
      expect(store.numberList()).toEqual([]);
      globalReset.set({});
      await vi.runAllTimersAsync();
      expect(store.numberList()).toEqual([42]);
    });
  });
});
