import { TestBed } from './host/craft-test-bed';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  craftService,
  craftUse,
  GetServiceDependencies,
  on$,
  source$,
  state,
} from '../index';

describe('yieldable source services', () => {
  it('keeps the direct source API while resolving through yield*', () => {
    TestBed.runInInjectionContext(() => {
      const reset$ = source$<void>('reset$');
      const resolved = craftUse(reset$);

      expect(resolved).not.toBe(reset$);
      expect(resolved).toHaveProperty('emit');

      let called = 0;
      resolved.subscribe(() => called++);
      resolved.emit();

      expect(called).toBe(1);
    });
  });

  it('resolves a source-returning craft service from on$', () => {
    const { Reset } = craftService(
      { name: 'Reset', scope: 'global' },
      function* () {
        const reset$ = yield* source$<void>('reset$');
        return reset$;
      },
    );

    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        const counter = yield* state('counter', 0, ({ set, state }) => ({
          increment: function* () {
                const _state = yield* state(); return set(_state + 1); },
          reset: on$(Reset, (value) => {
            expectTypeOf(value).toEqualTypeOf<void>();
            return set(0);
          }),
        }));

        const reset = yield* Reset();

        return { counter, reset };
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = craftUse(Counter());

      counter.counter.increment();
      counter.reset.emit();

      expect(craftUse(counter.counter())).toBe(0);
    });

    type CounterDependencies = GetServiceDependencies<typeof Counter>;
    type ResetDependency = CounterDependencies['dependencies']['Reset'];

    expectTypeOf<ResetDependency['scope']>().toEqualTypeOf<'global'>();
    expectTypeOf<ResetDependency['dependencies']>().toMatchTypeOf<{
      [key: string]: {
        scope: 'function';
        dependencies: {};
      };
    }>();
  });
});
