import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Equal, Expect } from 'test-type';
import { TestBed } from './host/craft-test-bed';
import { craftUse } from './craft-use';
import { craftService, type GetServiceDependencies } from './craft-service';
import { craftComputed } from './craft-computed';
import { state } from './state';
import { source$ } from './source$';
import { on$ } from './on$';
import { afterRecomputation } from './after-recomputation';
import {
  craftStateMachine,
  initStateMachine,
  transitionSetup,
  transitionGuard,
  transitionStep,
  type CraftMachineContext,
} from './craft-state-machine';

type ChildrenOf<Deps> = Deps extends { dependencies: infer Children }
  ? Children
  : never;
type HasDependency<Deps, Name extends string> = Name extends keyof ChildrenOf<
  Deps
>
  ? true
  : false;

type TouchEvent = { readonly type: 'touch' | 'blur' };
type ValidateEvent = { readonly reason: string };
type SaveStatus = 'idle' | 'loading' | 'resolved';

const { SessionService } = craftService(
  { name: 'SessionService', providedIn: 'global' },
  () => ({ isAuthenticated: () => authenticated }),
);

const { PermissionsService } = craftService(
  { name: 'PermissionsService', providedIn: 'global' },
  () => ({ canEdit: () => editable }),
);

let authenticated = true;
let editable = true;

const contextFactory = function* () {
  const formValid = yield* state('formValid', true, ({ set }) => ({
    deny: () => set(false),
  }));
  const locked = yield* state('locked', false);
  const saveStatus = yield* state(
    'saveStatus',
    'idle' as SaveStatus,
    ({ set }) => ({ to: (status: SaveStatus) => set(status) }),
  );
  const touchEvent = yield* source$<TouchEvent>('touchEvent');
  const validateEvent = yield* source$<ValidateEvent>('validateEvent');

  return { formValid, locked, saveStatus, touchEvent, validateEvent };
};

type MachineContext = CraftMachineContext<typeof contextFactory>;

const transitions = transitionSetup(function* (
  context: MachineContext,
  transit,
) {
  return {
    reading: transitionStep(function* () {
      yield* initStateMachine(() => transit());

      yield* afterRecomputation(
        context.saveStatus,
        function* (status) {
          if (status === 'resolved') {
            yield* transit();
          }
        },
      );
    }),

    editing: transitionStep(function* () {
      yield* on$(context.touchEvent, function* (event) {
        yield* transit(event).pipe(
          transitionGuard(function* ({ context: machineContext, event: touch }) {
            const permissions = yield* PermissionsService();

            return (
              (yield* machineContext.formValid()) &&
              touch.type === 'touch' &&
              permissions.canEdit()
            );
          }),
        );
      });
    }),

    saving: transitionStep(function* () {
      yield* on$(context.validateEvent, () => transit());
    }),
  };
}).pipe(
  transitionGuard(function* ({ context, to }) {
    const session = yield* SessionService();
    lastGlobalGuardTarget = to;

    return session.isAuthenticated() && !(yield* context.locked());
  }),
);

let lastGlobalGuardTarget: string | undefined;

function createMachine() {
  return craftUse(
    craftStateMachine(
      contextFactory,

      transitions,

      function* (context) {
        return {
          reading: { formValid: context.formValid },
          editing: { formValid: context.formValid },
          saving: { status: context.saveStatus },
        };
      },

      function* ({ currentStep, stepContext }) {
        return {
          isReading: craftComputed('isReading', function* () {
            return (yield* currentStep()) === 'reading';
          }),
          isSaving: craftComputed('isSaving', function* () {
            return (yield* currentStep()) === 'saving';
          }),
          currentContext: craftComputed('currentContext', function* () {
            return yield* stepContext();
          }),
        };
      },
    ),
  );
}

describe('craftStateMachine', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    authenticated = true;
    editable = true;
    lastGlobalGuardTarget = undefined;
  });

  it('takes its initial step from the first accepted initStateMachine transit', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    expect(craftUse(machine.currentStep())).toBe('reading');
    expect(craftUse(machine.isReading())).toBe(true);
    expect(craftUse(machine.isSaving())).toBe(false);
  });

  it('transitions when a registered source emits', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.touchEvent.emit({ type: 'touch' });
    expect(craftUse(machine.currentStep())).toBe('editing');

    machine.context.validateEvent.emit({ reason: 'submit' });
    expect(craftUse(machine.currentStep())).toBe('saving');
  });

  it('reacts to a recomputation registered with afterRecomputation', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.validateEvent.emit({ reason: 'submit' });
    expect(craftUse(machine.currentStep())).toBe('saving');

    craftUse(machine.context.saveStatus.to('resolved'));

    expect(craftUse(machine.currentStep())).toBe('reading');
  });

  it('refuses a transition rejected by a local guard', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.touchEvent.emit({ type: 'blur' });

    expect(craftUse(machine.currentStep())).toBe('reading');
  });

  it('refuses every transition rejected by the global guard', () => {
    authenticated = false;
    const machine = TestBed.runInInjectionContext(createMachine);

    expect(craftUse(machine.currentStep())).toBeUndefined();

    machine.context.validateEvent.emit({ reason: 'submit' });
    expect(craftUse(machine.currentStep())).toBeUndefined();

    authenticated = true;
    machine.context.validateEvent.emit({ reason: 'submit' });
    expect(craftUse(machine.currentStep())).toBe('saving');
  });

  it('exposes the current step context', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    expect(craftUse(machine.stepContext())).toEqual({
      formValid: machine.context.formValid,
    });

    machine.context.validateEvent.emit({ reason: 'submit' });

    expect(craftUse(machine.stepContext())).toEqual({
      status: machine.context.saveStatus,
    });
  });

  it('treats a transition to the current step as a no-op', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    machine.context.validateEvent.emit({ reason: 'submit' });
    expect(craftUse(machine.currentStep())).toBe('saving');

    lastGlobalGuardTarget = undefined;
    machine.context.validateEvent.emit({ reason: 'submit' });

    // The global guard never even runs for a transition that goes nowhere.
    expect(lastGlobalGuardTarget).toBeUndefined();
    expect(craftUse(machine.currentStep())).toBe('saving');
  });
});

describe('craftStateMachine typing', () => {
  it('folds every guard, source and primitive dependency into the machine graph', () => {
    const { EditorMachine } = craftService(
      { name: 'EditorMachine', providedIn: 'function' },
      function* () {
        const machine = yield* craftStateMachine(
          contextFactory,
          transitions,
          function* (context) {
            return {
              reading: { formValid: context.formValid },
              editing: { formValid: context.formValid },
              saving: { status: context.saveStatus },
            };
          },
        );

        return { machine };
      },
    );

    type Deps = GetServiceDependencies<typeof EditorMachine>;

    // A guard yielded on the setup pipe…
    type _Session = Expect<HasDependency<Deps, 'SessionService'>>;
    // …one yielded through `transit(event).pipe(transitionGuard(...))`, four
    // levels down (step → on$ → attempt → guard)…
    type _Permissions = Expect<HasDependency<Deps, 'PermissionsService'>>;
    // …and the sources the steps subscribe to.
    type _Touch = Expect<HasDependency<Deps, 'touchEvent'>>;
    type _Validate = Expect<HasDependency<Deps, 'validateEvent'>>;

    expect(typeof EditorMachine).toBe('function');
  });

  it('types currentStep and stepContext from the transitions record', () => {
    const machine = TestBed.runInInjectionContext(createMachine);

    type Step = ReturnType<typeof machine.currentStep>;
    type _Step = Expect<
      Equal<Step, 'reading' | 'editing' | 'saving' | undefined>
    >;

    type StepContext = ReturnType<typeof machine.stepContext>;
    type _StepContext = Expect<
      Equal<
        StepContext,
        | { formValid: MachineContext['formValid'] }
        | { status: MachineContext['saveStatus'] }
        | undefined
      >
    >;

    expect(craftUse(machine.currentStep())).toBe('reading');
  });

  it('rejects a machine whose transitions never initialise', () => {
    const uninitialised = transitionSetup(function* (
      context: MachineContext,
      transit,
    ) {
      return {
        idle: transitionStep(function* () {
          yield* on$(context.validateEvent, () => transit());
        }),
      };
    });

    TestBed.runInInjectionContext(() => {
      craftStateMachine(
        contextFactory,
        // @ts-expect-error `yield* initStateMachine(...)` is missing.
        uninitialised,
        function* () {
          return { idle: {} };
        },
      );
    });

    expect(true).toBe(true);
  });
});

describe('craftStateMachine guards', () => {
  const stepGuarded = transitionSetup(function* (
    context: MachineContext,
    transit,
  ) {
    return {
      reading: transitionStep(function* () {
        yield* initStateMachine(() => transit());
      }),

      editing: transitionStep(function* () {
        yield* on$(context.touchEvent, () => transit());
      }).pipe(
        // A step guard only answers for the transitions declared in its own
        // block; a plain lambda is enough when nothing has to be resolved.
        transitionGuard(({ context: machineContext }) =>
          craftUse(machineContext.formValid()),
        ),
      ),

      saving: transitionStep(function* () {
        yield* on$(context.validateEvent, () => transit());
      }),
    };
  });

  function createStepGuardedMachine() {
    return craftUse(
      craftStateMachine(contextFactory, stepGuarded, function* (context) {
        return {
          reading: context.formValid,
          editing: context.formValid,
          saving: context.saveStatus,
        };
      }),
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('applies a step guard only to the transitions of that step', () => {
    const machine = TestBed.runInInjectionContext(createStepGuardedMachine);

    craftUse(machine.context.formValid.deny());
    machine.context.touchEvent.emit({ type: 'touch' });
    expect(craftUse(machine.currentStep())).toBe('reading');

    // `saving` carries no step guard, so the same denied form does not block it.
    machine.context.validateEvent.emit({ reason: 'submit' });
    expect(craftUse(machine.currentStep())).toBe('saving');
  });

  it('lets the transition through once the step guard accepts', () => {
    const machine = TestBed.runInInjectionContext(createStepGuardedMachine);

    machine.context.touchEvent.emit({ type: 'touch' });

    expect(craftUse(machine.currentStep())).toBe('editing');
  });
});

describe('craftStateMachine naming', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    authenticated = true;
  });

  it('accepts a leading name, like every other craft primitive', () => {
    const machine = TestBed.runInInjectionContext(() =>
      craftUse(
        craftStateMachine(
          'editorMachine',
          contextFactory,
          transitions,
          function* (context) {
            return {
              reading: context.formValid,
              editing: context.formValid,
              saving: context.saveStatus,
            };
          },
        ),
      ),
    );

    expect(craftUse(machine.currentStep())).toBe('reading');
  });
});

describe('craftStateMachine bare transitions', () => {
  // No machine-wide guard here, so the setup generator is passed as-is:
  // `transitionSetup(...)` is only needed to hang a `.pipe(...)` off it.
  function createBareMachine() {
    return craftUse(
      craftStateMachine(
        contextFactory,

        function* (context, transit) {
          return {
            reading: transitionStep(function* () {
              yield* initStateMachine(() => transit());
            }),

            saving: transitionStep(function* () {
              yield* on$(context.validateEvent, function* () {
                yield* transit().pipe(
                  transitionGuard(function* () {
                    const permissions = yield* PermissionsService();
                    return permissions.canEdit();
                  }),
                );
              });
            }),
          };
        },

        function* (context) {
          return {
            reading: { formValid: context.formValid },
            saving: { status: context.saveStatus },
          };
        },
      ),
    );
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    editable = true;
  });

  it('accepts the setup generator without transitionSetup', () => {
    const machine = TestBed.runInInjectionContext(createBareMachine);

    expect(craftUse(machine.currentStep())).toBe('reading');

    machine.context.validateEvent.emit({ reason: 'submit' });
    expect(craftUse(machine.currentStep())).toBe('saving');
  });

  it('types the setup context without an annotation', () => {
    const machine = TestBed.runInInjectionContext(createBareMachine);

    type Step = ReturnType<typeof machine.currentStep>;
    type _Step = Expect<Equal<Step, 'reading' | 'saving' | undefined>>;

    expect(craftUse(machine.currentStep())).toBe('reading');
  });

  it('still folds a guard dependency into the machine graph', () => {
    const { BareMachine } = craftService(
      { name: 'BareMachine', providedIn: 'function' },
      function* () {
        const machine = yield* craftStateMachine(
          contextFactory,
          function* (context, transit) {
            return {
              reading: transitionStep(function* () {
                yield* initStateMachine(() => transit());
              }),
              saving: transitionStep(function* () {
                yield* on$(context.validateEvent, function* () {
                  yield* transit().pipe(
                    transitionGuard(function* () {
                      const permissions = yield* PermissionsService();
                      return permissions.canEdit();
                    }),
                  );
                });
              }),
            };
          },
          function* (context) {
            return {
              reading: { formValid: context.formValid },
              saving: { status: context.saveStatus },
            };
          },
        );

        return { machine };
      },
    );

    type Deps = GetServiceDependencies<typeof BareMachine>;
    type _Permissions = Expect<HasDependency<Deps, 'PermissionsService'>>;
    type _Validate = Expect<HasDependency<Deps, 'validateEvent'>>;

    expect(typeof BareMachine).toBe('function');
  });

  it('still rejects bare transitions that never initialise', () => {
    TestBed.runInInjectionContext(() => {
      craftStateMachine(
        contextFactory,
        // @ts-expect-error `yield* initStateMachine(...)` is missing.
        function* (context, transit) {
          return {
            idle: transitionStep(function* () {
              yield* on$(context.validateEvent, () => transit());
            }),
          };
        },
        function* () {
          return { idle: {} };
        },
      );
    });

    expect(true).toBe(true);
  });
});
