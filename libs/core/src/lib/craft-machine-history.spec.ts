import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from './host/craft-test-bed';
import { craftUse } from './craft-use';
import { state } from './state';
import { query } from './query';
import { source$ } from './source$';
import { on$ } from './on$';
import {
  craftStateMachine,
  initStateMachine,
  transitionStep,
} from './craft-state-machine';
import { withBackNavigation, withHistory } from './craft-machine-history';

const contextFactory = function* () {
  const draft = yield* state('draft', 'initial', ({ set }) => ({
    to: (value: string) => set(value),
  }));
  const edit$ = yield* source$<void>('edit$');
  const submit$ = yield* source$<void>('submit$');
  const cancel$ = yield* source$<void>('cancel$');

  return { draft, edit$, submit$, cancel$ };
};

function createMachine() {
  return craftUse(
    craftStateMachine(
      'editor',
      contextFactory,

      function* (context, transit) {
        return {
          reading: transitionStep(function* () {
            yield* initStateMachine(() => transit());
            yield* on$(context.cancel$, () => transit());
          }),
          editing: transitionStep(function* () {
            yield* on$(context.edit$, () => transit());
          }),
          saving: transitionStep(function* () {
            yield* on$(context.submit$, () => transit());
          }),
        };
      },

      function* (context) {
        return {
          reading: { draft: context.draft },
          editing: { draft: context.draft },
          saving: { draft: context.draft },
        };
      },

      withHistory(withBackNavigation()),
    ),
  );
}

describe('machine history', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('records the initial step as its first entry', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    const history = craftUse(machine.history());
    expect(history).toHaveLength(1);
    expect(history[0]?.step).toBe('reading');
    expect(craftUse(machine.historyCursor())).toBe(0);
  });

  it('appends an entry per accepted transition, with the values of the moment', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.edit$.emit();
    craftUse(machine.context.draft.to('edited'));
    machine.context.submit$.emit();

    const history = craftUse(machine.history());
    expect(history.map((entry) => entry.step)).toEqual([
      'reading',
      'editing',
      'saving',
    ]);
    expect(Object.values(history[2]!.snapshot)).toContain('edited');
    expect(Object.values(history[1]!.snapshot)).toContain('initial');
  });

  it('does not record a refused transition', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    // `reading` is the current step, so this attempt goes nowhere.
    machine.context.cancel$.emit();

    expect(craftUse(machine.history())).toHaveLength(1);
  });

  it('walks back to a recorded moment, restoring step and values', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.edit$.emit();
    craftUse(machine.context.draft.to('edited'));
    machine.context.submit$.emit();

    expect(craftUse(machine.currentStep())).toBe('saving');
    expect(craftUse(machine.context.draft())).toBe('edited');
    expect(craftUse(machine.canGoBack())).toBe(true);

    machine.back();

    expect(craftUse(machine.currentStep())).toBe('editing');
    expect(craftUse(machine.context.draft())).toBe('initial');
    expect(craftUse(machine.historyCursor())).toBe(1);
  });

  it('walks forward again after a rewind', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.edit$.emit();
    craftUse(machine.context.draft.to('edited'));
    machine.context.submit$.emit();

    machine.back();
    expect(craftUse(machine.canGoForward())).toBe(true);

    machine.forward();

    expect(craftUse(machine.currentStep())).toBe('saving');
    expect(craftUse(machine.context.draft())).toBe('edited');
  });

  it('stops at the ends of the recorded range', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    expect(craftUse(machine.canGoBack())).toBe(false);
    expect(craftUse(machine.canGoForward())).toBe(false);
    // `back`/`forward` are insertion methods, so their answer is yieldable.
    expect(craftUse(machine.back())).toBe(false);
    expect(craftUse(machine.forward())).toBe(false);
  });

  it('drops the forward entries when the machine takes another branch', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.edit$.emit();
    machine.context.submit$.emit();
    expect(craftUse(machine.history())).toHaveLength(3);

    machine.back();
    machine.back();
    expect(craftUse(machine.currentStep())).toBe('reading');

    // A new transition from here invalidates the future that was recorded.
    machine.context.edit$.emit();

    const history = craftUse(machine.history());
    expect(history.map((entry) => entry.step)).toEqual([
      'reading',
      'editing',
    ]);
    expect(craftUse(machine.canGoForward())).toBe(false);
  });
});

describe('machine history with an external primitive', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('captures and restores a state declared outside the machine', () => {
    const built = TestBed.runInInjectionContext(() => {
      // Declared outside the machine: the machine's host chain does not cover
      // it, so it has to be named explicitly.
      const shared = craftUse(
        state('shared', 'before', ({ set }) => ({
          to: (value: string) => set(value),
        })),
      );

      const machine = craftUse(
        craftStateMachine(
          'external',
          contextFactory,
          function* (context, transit) {
            return {
              reading: transitionStep(function* () {
                yield* initStateMachine(() => transit());
              }),
              editing: transitionStep(function* () {
                yield* on$(context.edit$, () => transit());
              }),
            };
          },
          function* () {
            return { reading: {}, editing: {} };
          },
          withHistory({ include: [shared] }, withBackNavigation()),
        ),
      );

      return { shared, machine };
    });

    built.machine.context.edit$.emit();
    craftUse(built.shared.to('after'));

    const history = craftUse(built.machine.history());
    expect(Object.values(history[1]!.snapshot)).toContain('before');

    built.machine.back();

    expect(craftUse(built.machine.currentStep())).toBe('reading');
    expect(craftUse(built.shared())).toBe('before');
  });

  it('ignores an unregistered ref instead of failing the capture', () => {
    const machine = TestBed.runInInjectionContext(() =>
      craftUse(
        craftStateMachine(
          'unlinked',
          contextFactory,
          function* (context, transit) {
            return {
              reading: transitionStep(function* () {
                yield* initStateMachine(() => transit());
              }),
              editing: transitionStep(function* () {
                yield* on$(context.edit$, () => transit());
              }),
            };
          },
          function* () {
            return { reading: {}, editing: {} };
          },
          withHistory({ include: [{ not: 'a primitive' }] }),
        ),
      ),
    );

    machine.context.edit$.emit();

    expect(craftUse(machine.history())).toHaveLength(2);
  });
});

describe('persisted machine history', () => {
  function createStorage() {
    const items = new Map<string, string>();
    return {
      items,
      storage: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
      },
    };
  }

  function createPersistedMachine(
    storage: ReturnType<typeof createStorage>['storage'],
    key: string,
  ) {
    return craftUse(
      craftStateMachine(
        'persisted',
        contextFactory,
        function* (context, transit) {
          return {
            reading: transitionStep(function* () {
              yield* initStateMachine(() => transit());
            }),
            editing: transitionStep(function* () {
              yield* on$(context.edit$, () => transit());
            }),
          };
        },
        function* () {
          return { reading: {}, editing: {} };
        },
        withHistory(
          { persist: { storeName: 'spec', key, storage } },
          withBackNavigation(),
        ),
      ),
    );
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('writes the history under the declared anchor', () => {
    const { items, storage } = createStorage();

    const machine = TestBed.runInInjectionContext(() =>
      createPersistedMachine(storage, 'book-1'),
    );
    machine.context.edit$.emit();

    expect([...items.keys()]).toEqual(['craft-ts-spec-history-book-1']);
  });

  it('restores a pre-reload value into primitives created after the reload', () => {
    const { storage } = createStorage();

    const before = TestBed.runInInjectionContext(() =>
      createPersistedMachine(storage, 'book-1'),
    );
    // The value is set BEFORE the transition, so the recorded moment holds it.
    craftUse(before.context.draft.to('edited'));
    before.context.edit$.emit();

    expect(craftUse(before.history()).map((entry) => entry.step)).toEqual([
      'reading',
      'editing',
    ]);

    // A reload: a brand new machine, brand new primitives, and none of them
    // ever saw the value 'edited'.
    TestBed.resetTestingModule();
    const after = TestBed.runInInjectionContext(() =>
      createPersistedMachine(storage, 'book-1'),
    );

    expect(craftUse(after.history()).map((entry) => entry.step)).toEqual([
      'reading',
      'editing',
      'reading',
    ]);
    expect(craftUse(after.context.draft())).toBe('initial');

    craftUse(after.back());

    // The relative address re-anchored onto the fresh instance.
    expect(craftUse(after.currentStep())).toBe('editing');
    expect(craftUse(after.context.draft())).toBe('edited');
  });

  it('does not stack an identical moment when a machine is rebuilt', () => {
    const { storage } = createStorage();

    const before = TestBed.runInInjectionContext(() =>
      createPersistedMachine(storage, 'book-1'),
    );
    expect(craftUse(before.history())).toHaveLength(1);

    // Remounting the component — or reloading the page — builds a machine that
    // starts exactly where the recorded one stood. Recording that again would
    // stack duplicates a rewind then has to walk through.
    TestBed.resetTestingModule();
    const after = TestBed.runInInjectionContext(() =>
      createPersistedMachine(storage, 'book-1'),
    );

    expect(craftUse(after.history())).toHaveLength(1);
    expect(craftUse(after.canGoBack())).toBe(false);
  });

  it('keeps two anchors of the same machine apart', () => {
    const { items, storage } = createStorage();

    TestBed.runInInjectionContext(() => {
      const first = createPersistedMachine(storage, 'book-1');
      const second = createPersistedMachine(storage, 'book-2');
      first.context.edit$.emit();
      second.context.edit$.emit();
    });

    expect([...items.keys()].sort()).toEqual([
      'craft-ts-spec-history-book-1',
      'craft-ts-spec-history-book-2',
    ]);
  });

  it('survives an event that cannot be serialised', () => {
    const { items, storage } = createStorage();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const machine = TestBed.runInInjectionContext(() =>
      craftUse(
        craftStateMachine(
          'circular',
          contextFactory,
          function* (context, transit) {
            return {
              reading: transitionStep(function* () {
                yield* initStateMachine(() => transit());
              }),
              editing: transitionStep(function* () {
                yield* on$(context.edit$, function* () {
                  yield* transit(circular);
                });
              }),
            };
          },
          function* () {
            return { reading: {}, editing: {} };
          },
          withHistory({ persist: { storeName: 'spec', key: 'circular', storage } }),
        ),
      ),
    );

    machine.context.edit$.emit();

    // The moment is kept in memory, and persisted with its event dropped.
    expect(craftUse(machine.history())).toHaveLength(2);
    const persisted = JSON.parse(items.get('craft-ts-spec-history-circular')!);
    expect(persisted.entries).toHaveLength(2);
  });
});

describe('machine history with an async resource', () => {
  const loads: string[] = [];

  const asyncContext = function* () {
    const selectedId = yield* state('selectedId', 'a', ({ set }) => ({
      to: (value: string) => set(value),
    }));
    const details = yield* query('details', {
      params: function* () {
        return yield* selectedId();
      },
      loader: async ({ params }) => {
        loads.push(params as string);
        return { id: params as string };
      },
    });
    const go$ = yield* source$<void>('go$');
    const done$ = yield* source$<void>('done$');

    return { selectedId, details, go$, done$ };
  };

  function createAsyncMachine() {
    return craftUse(
      craftStateMachine(
        'async',
        asyncContext,
        function* (context, transit) {
          return {
            first: transitionStep(function* () {
              yield* initStateMachine(() => transit());
            }),
            second: transitionStep(function* () {
              yield* on$(context.go$, () => transit());
            }),
            third: transitionStep(function* () {
              yield* on$(context.done$, () => transit());
            }),
          };
        },
        function* () {
          return { first: {}, second: {}, third: {} };
        },
        withHistory(withBackNavigation()),
      ),
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    loads.length = 0;
  });

  it('restores a settled resource with its parameter, without reloading', async () => {
    const machine = TestBed.runInInjectionContext(createAsyncMachine);

    craftUse(machine.context.details.value());
    await vi.waitFor(() =>
      expect(craftUse(machine.context.details.value())).toEqual({ id: 'a' }),
    );

    // Recorded while the resource holds the value loaded for 'a'.
    machine.context.go$.emit();

    craftUse(machine.context.selectedId.to('b'));
    await vi.waitFor(() =>
      expect(craftUse(machine.context.details.value())).toEqual({ id: 'b' }),
    );
    machine.context.done$.emit();
    expect(loads).toEqual(['a', 'b']);

    craftUse(machine.back());
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The parameter and the value it belongs to come back together, so the
    // resource has nothing to fetch: it already holds the right answer.
    expect(craftUse(machine.currentStep())).toBe('second');
    expect(craftUse(machine.context.selectedId())).toBe('a');
    expect(craftUse(machine.context.details.value())).toEqual({ id: 'a' });
    expect(loads).toEqual(['a', 'b']);

    // The value came FROM the loader, so putting it back settles as resolved:
    // a `set` would mark the resource local and detach it from its loader.
    expect(craftUse(machine.context.details.status())).toBe('resolved');

    // And the resource is still attached: a later parameter change reloads.
    craftUse(machine.context.selectedId.to('c'));
    await vi.waitFor(() =>
      expect(craftUse(machine.context.details.value())).toEqual({ id: 'c' }),
    );
    expect(loads).toEqual(['a', 'b', 'c']);
  });

  it('reloads a resource the snapshot could not capture', async () => {
    const machine = TestBed.runInInjectionContext(createAsyncMachine);

    // The very first moment is recorded before the loader settles, so it holds
    // no value for the resource.
    craftUse(machine.context.details.value());
    await vi.waitFor(() =>
      expect(craftUse(machine.context.details.value())).toEqual({ id: 'a' }),
    );

    machine.context.go$.emit();
    craftUse(machine.context.selectedId.to('b'));
    await vi.waitFor(() =>
      expect(craftUse(machine.context.details.value())).toEqual({ id: 'b' }),
    );
    expect(loads).toEqual(['a', 'b']);

    craftUse(machine.back());
    craftUse(machine.back());

    expect(craftUse(machine.currentStep())).toBe('first');
    expect(craftUse(machine.context.selectedId())).toBe('a');

    // Nothing to restore means nothing to freeze: the resource reloads rather
    // than keeping data that belongs to the other parameter.
    await vi.waitFor(() =>
      expect(craftUse(machine.context.details.value())).toEqual({ id: 'a' }),
    );
    expect(loads).toEqual(['a', 'b', 'a']);
  });
});
