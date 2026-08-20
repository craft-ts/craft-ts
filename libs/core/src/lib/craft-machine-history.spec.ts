import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from './host/craft-test-bed';
import { craftUse } from './craft-use';
import { state } from './state';
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
