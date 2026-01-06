import { computed, linkedSignal, Signal, signal } from '@angular/core';
import { state, StateOutput } from './state';
import { source } from './source';
import { afterRecomputation } from './after-recomputation';
describe('state', () => {
  it('should create a simple state', () => {
    const myState = state(0);

    expect(myState).toBeDefined();
    expectTypeOf(myState).toEqualTypeOf<Signal<number>>();
    expect(myState()).toBe(0);
  });
  it('should create a signal state', () => {
    const origin = signal(5);
    const myState = state(linkedSignal(() => origin() * 2));

    expect(myState).toBeDefined();
    expectTypeOf(myState).toEqualTypeOf<Signal<number>>();
    expect(myState()).toBe(10);
  });

  it('should accept insertion, use to add methods and properties', () => {
    const origin = signal(5);
    const myState = state(
      linkedSignal(() => origin() * 2),
      ({ update, set }) => ({
        increment: () => update((current) => current + 1),
        reset: () => set(0),
      }),
      ({ state }) => ({
        isOdd: computed(() => state() % 2 === 1),
      })
    );

    expect(myState).toBeDefined();
    expectTypeOf(myState).toEqualTypeOf<
      StateOutput<
        number,
        {
          increment: () => number;
          reset: () => number;
        } & {
          isOdd: Signal<boolean>;
        }
      >
    >();
    expect(myState()).toBe(10);
    expect(myState.isOdd()).toBe(false);
    myState.increment();
    expect(myState()).toBe(11);
    expect(myState.isOdd()).toBe(true);
    myState.reset();
    expect(myState()).toBe(0);
    expect(myState.isOdd()).toBe(false);
  });

  it('methods can be bind to a source, but not exposed', () => {
    const sourceSignal = source<number>();
    const myState = state(0, ({ set }) => ({
      setValue: afterRecomputation(sourceSignal, (value) => set(value)),
      reset: () => set(0),
    }));

    expect(myState).toBeDefined();
    expectTypeOf(myState()).toEqualTypeOf<number>();
    expect(myState()).toBe(0);

    //@ts-expect-error setValue should not be exposed
    type ShouldNotBeExposed = (typeof myState)['setValue'];

    sourceSignal.set(34);
    expect(myState()).toBe(34);

    myState.reset();
    expect(myState()).toBe(0);
  });
});
