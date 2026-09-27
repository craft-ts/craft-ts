import { describe, expect, expectTypeOf, it } from 'vitest';
import { TestBed } from './host/craft-test-bed';
import { craftService } from './craft-service';
import { craftComputed } from './craft-computed';
import { craftMethod } from './craft-method';
import { craftEffect } from './craft-effect';
import { craftExpose, craftPrivate } from './craft-primitive-gen';
import { craftGen } from './craft-gen';
import { craftUse } from './craft-use';
import { state } from './state';

describe('craftService auto-exposure', () => {
  it('exposes every named primitive the factory yields, under its name', () => {
    const { Todos } = craftService(
      { name: 'Todos', providedIn: 'global' },
      function* () {
        const items = yield* state('items', ['a'], ({ set }) => ({
          reset: () => set([]),
        }));
        yield* craftComputed('count', function* () {
          return (yield* items()).length;
        });
        yield* craftMethod('clear', function* () {
          items.reset();
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const todos = craftUse(Todos());
      expect(Object.keys(todos).sort()).toEqual(['clear', 'count', 'items']);
      expect(craftUse(todos.count())).toBe(1);
      todos.clear();
      expect(craftUse(todos.count())).toBe(0);
    });
  });

  it('keeps a primitive wrapped in craftPrivate internal', () => {
    const { Draft } = craftService(
      { name: 'Draft', providedIn: 'global' },
      function* () {
        const draft = yield* craftPrivate(state('draft', 'hello'));
        yield* craftComputed('length', function* () {
          return (yield* draft()).length;
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const api = craftUse(Draft());
      expect('draft' in api).toBe(false);
      expect(craftUse(api.length())).toBe(5);
    });
  });

  it('keeps every primitive of a helper internal through craftPrivate', () => {
    const createPair = craftGen(function* () {
      const left = yield* state('left', 1);
      const right = yield* state('right', 2);
      return { left, right };
    });

    const { Pair } = craftService(
      { name: 'Pair', providedIn: 'global' },
      function* () {
        const { left, right } = yield* craftPrivate(createPair());
        yield* craftComputed('sum', function* () {
          return (yield* left()) + (yield* right());
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const api = craftUse(Pair());
      expect(Object.keys(api)).toEqual(['sum']);
      expect(craftUse(api.sum())).toBe(3);
    });
  });

  it('exposes the primitives a helper creates when it is not private', () => {
    const createPair = craftGen(function* () {
      yield* state('left', 1);
      yield* state('right', 2);
    });

    const { OpenPair } = craftService(
      { name: 'OpenPair', providedIn: 'global' },
      function* () {
        yield* createPair();
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(Object.keys(craftUse(OpenPair())).sort()).toEqual([
        'left',
        'right',
      ]);
    });
  });

  it('exposes any value through craftExpose, as is', () => {
    const format = (value: number) => `#${value}`;

    const { Formatter } = craftService(
      { name: 'Formatter', providedIn: 'global' },
      function* () {
        const counter = yield* craftPrivate(
          state('counter', 1, ({ update }) => ({
            increment: () => update((value) => value + 1),
          })),
        );
        yield* craftExpose('format', format);
        yield* craftExpose('increment', counter.increment);
        yield* craftExpose('prefix', '#');
      },
    );

    TestBed.runInInjectionContext(() => {
      const api = craftUse(Formatter());
      expect(api.format).toBe(format);
      expect(api.prefix).toBe('#');
      expectTypeOf(api.prefix).toEqualTypeOf<string>();
      expect(typeof api.increment).toBe('function');
    });
  });

  it('does not expose the services it injects', () => {
    const { Source } = craftService(
      { name: 'Source', providedIn: 'global' },
      function* () {
        yield* state('value', 1);
      },
    );
    const { Consumer } = craftService(
      { name: 'Consumer', providedIn: 'global' },
      function* () {
        const source = yield* Source();
        yield* craftComputed('double', function* () {
          return (yield* source.value()) * 2;
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(Object.keys(craftUse(Consumer()))).toEqual(['double']);
    });
  });

  it('exposes an effect ref unless it is private', () => {
    const { Effects } = craftService(
      { name: 'Effects', providedIn: 'global' },
      function* () {
        yield* craftEffect('visible', () => undefined);
        yield* craftPrivate(craftEffect('hidden', () => undefined));
      },
    );

    TestBed.runInInjectionContext(() => {
      const api = craftUse(Effects());
      expect(Object.keys(api)).toEqual(['visible']);
      expect(typeof api.visible.destroy).toBe('function');
    });
  });

  it('throws when two exposed primitives share a name', () => {
    const { Duplicated } = craftService(
      { name: 'Duplicated', providedIn: 'global' },
      function* () {
        yield* state('value', 1);
        yield* state('value', 2);
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => craftUse(Duplicated())).toThrow(
        'craftService("Duplicated") exposes "value" twice.',
      );
    });
  });

  it('allows the same name twice when one of them is private', () => {
    const { Shadowed } = craftService(
      { name: 'Shadowed', providedIn: 'global' },
      function* () {
        yield* craftPrivate(state('value', 1));
        yield* state('value', 2);
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(craftUse(craftUse(Shadowed()).value())).toBe(2);
    });
  });

  it('throws when the factory returns a value', () => {
    const { Returning } = craftService(
      { name: 'Returning', providedIn: 'global' },
      // @ts-expect-error a craftService factory cannot return a value
      function* () {
        yield* state('value', 1);
        return { value: 1 };
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => craftUse(Returning())).toThrow(
        'craftService("Returning") returned a value, but a craftService cannot return',
      );
    });
  });

  it('throws when the factory is not a generator', () => {
    const { Plain } = craftService(
      { name: 'Plain', providedIn: 'global' },
      // @ts-expect-error a craftService factory must be a generator
      () => ({ value: 1 }),
    );

    TestBed.runInInjectionContext(() => {
      expect(() => craftUse(Plain())).toThrow(
        'craftService("Plain") needs a generator factory',
      );
    });
  });

  it('types the exposed API from the yielded primitives', () => {
    const { Typed } = craftService(
      { name: 'Typed', providedIn: 'global' },
      function* () {
        yield* state('visible', 1);
        yield* craftPrivate(state('hidden', 'secret'));
        yield* craftExpose('label', 'x' as string);
      },
    );

    const read = craftGen(function* () {
      const api = yield* Typed();
      expectTypeOf(api).toHaveProperty('visible');
      expectTypeOf(api).toHaveProperty('label');
      expectTypeOf(api.label).toEqualTypeOf<string>();
      expectTypeOf(api).not.toHaveProperty('hidden');
      return api;
    });
    expect(read).toBeTypeOf('function');
  });
});
