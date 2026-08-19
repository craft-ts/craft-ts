import {
  assertInInjectionContext,
  inject,
  Injector,
  isSignal,
  runInInjectionContext,
} from './host/craft-compat';
import {
  craftComputed as createCraftComputed,
  craftSignal,
} from './host/craft-signal';
import { injectFnWrapper } from './fn-wrapper';
import { ɵcreateHostTaggedInjector } from './craft-service';
import type {
  CompleteServiceDependencyMapFromYielded,
  SERVICE_HELPER_DEPENDENCIES,
} from './craft-service';
import {
  createNamedPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';
import { isSource } from './util/util';
import {
  createYieldableInsertionMethod,
  isNonYieldableInsertionMethod,
  isYieldableMethod,
  type BrandReactiveProperties,
  type YieldableInsertionMethods,
} from './yieldable';
import {
  createYieldableReactiveValue,
  isYieldableReactiveValue,
  nameInsertedReactiveValue,
  type YieldableReactiveValue,
} from './reactive-read';
import type { MergeObject } from './util/types/util.type';
import {
  ɵdriveMachineGenerator,
  ɵregisterMachineInit,
  ɵrunTransition,
  ɵwithMachineScope,
  ɵrequireMachineScope,
  type MachineRuntime,
  type RuntimeTransitionGuard,
} from './craft-state-machine-runtime';

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

const TRANSITION_STEP_MARKER = Symbol('craft-transition-step');
const TRANSITIONS_SETUP_MARKER = Symbol('craft-transitions-setup');
const TRANSITION_GUARD_MARKER = Symbol('craft-transition-guard');

/** Type-only carriers. None of these exist at runtime. */
declare const TRANSITION_STEP_YIELDED: unique symbol;
declare const TRANSITIONS_SETUP_CONTEXT: unique symbol;
declare const TRANSITIONS_SETUP_STEPS: unique symbol;
declare const TRANSITIONS_SETUP_YIELDED: unique symbol;
declare const MISSING_INIT_STATE_MACHINE: unique symbol;

/**
 * Phantom request advertised by `initStateMachine(...)`. It is never yielded at
 * runtime; `craftStateMachine` reads it off the transitions' `Yielded` to reject
 * a machine that declares no way to reach its first step.
 */
export declare const CRAFT_MACHINE_INIT_REQUEST: unique symbol;

export interface CraftMachineInitRequest {
  readonly [CRAFT_MACHINE_INIT_REQUEST]: true;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * What a guard sees. `from` is `undefined` for the very first transition — the
 * one that gives the machine its initial step.
 */
export type CraftTransition<
  Context = unknown,
  Steps extends string = string,
  Event = unknown,
> = {
  readonly from: Steps | undefined;
  readonly to: Steps;
  readonly context: Context;
  readonly event: Event;
};

/**
 * A guard, built by {@link transitionGuard}. It answers a single transition
 * attempt; a generator guard may `yield*` craft dependencies, which the machine
 * folds into its own dependency graph.
 */
export type CraftTransitionGuard<
  Transition = CraftTransition<any, string, any>,
  Yielded = never,
> = ((
  transition: Transition,
) => boolean | Generator<Yielded, boolean, unknown>) & {
  readonly [TRANSITION_GUARD_MARKER]: true;
};

/** A transition attempt: `yield*` it to run it, `.pipe(...)` to guard it. */
export type CraftTransitionAttempt<
  Context,
  Event,
  Yielded = never,
> = Generator<Yielded, boolean, unknown> & {
  readonly pipe: CraftTransitionAttemptPipe<Context, Event, Yielded>;
};

type AttemptGuard<Context, Event, Yielded> = CraftTransitionGuard<
  CraftTransition<Context, string, Event>,
  Yielded
>;

export interface CraftTransitionAttemptPipe<Context, Event, Yielded> {
  <Y1>(
    guard1: AttemptGuard<Context, Event, Y1>,
  ): CraftTransitionAttempt<Context, Event, Yielded | Y1>;
  <Y1, Y2>(
    guard1: AttemptGuard<Context, Event, Y1>,
    guard2: AttemptGuard<Context, Event, Y2>,
  ): CraftTransitionAttempt<Context, Event, Yielded | Y1 | Y2>;
  <Y1, Y2, Y3>(
    guard1: AttemptGuard<Context, Event, Y1>,
    guard2: AttemptGuard<Context, Event, Y2>,
    guard3: AttemptGuard<Context, Event, Y3>,
  ): CraftTransitionAttempt<Context, Event, Yielded | Y1 | Y2 | Y3>;
  <Y1, Y2, Y3, Y4>(
    guard1: AttemptGuard<Context, Event, Y1>,
    guard2: AttemptGuard<Context, Event, Y2>,
    guard3: AttemptGuard<Context, Event, Y3>,
    guard4: AttemptGuard<Context, Event, Y4>,
  ): CraftTransitionAttempt<Context, Event, Yielded | Y1 | Y2 | Y3 | Y4>;
}

/**
 * The `transit` handed to the transitions setup. Called inside a
 * `transitionStep('x', ...)` registration, it targets that very step: the step
 * a machine can move to is the step whose block declared the attempt.
 */
export interface CraftTransit<Context> {
  (): CraftTransitionAttempt<Context, void>;
  <Event>(event: Event): CraftTransitionAttempt<Context, Event>;
}

type StepGuard<Yielded> = CraftTransitionGuard<
  CraftTransition<any, string, any>,
  Yielded
>;

export interface CraftTransitionStepPipe<Yielded> {
  <Y1>(guard1: StepGuard<Y1>): CraftTransitionStep<Yielded | Y1>;
  <Y1, Y2>(
    guard1: StepGuard<Y1>,
    guard2: StepGuard<Y2>,
  ): CraftTransitionStep<Yielded | Y1 | Y2>;
  <Y1, Y2, Y3>(
    guard1: StepGuard<Y1>,
    guard2: StepGuard<Y2>,
    guard3: StepGuard<Y3>,
  ): CraftTransitionStep<Yielded | Y1 | Y2 | Y3>;
  <Y1, Y2, Y3, Y4>(
    guard1: StepGuard<Y1>,
    guard2: StepGuard<Y2>,
    guard3: StepGuard<Y3>,
    guard4: StepGuard<Y4>,
  ): CraftTransitionStep<Yielded | Y1 | Y2 | Y3 | Y4>;
}

/** One entry of the transitions record: how the machine enters that step. */
export interface CraftTransitionStep<Yielded = never> {
  readonly [TRANSITION_STEP_MARKER]: true;
  readonly [TRANSITION_STEP_YIELDED]?: Yielded;
  readonly pipe: CraftTransitionStepPipe<Yielded>;
}

type AnyStepsRecord = Record<string, CraftTransitionStep<any>>;

type StepYielded<Step> = typeof TRANSITION_STEP_YIELDED extends keyof Step
  ? Step extends { readonly [TRANSITION_STEP_YIELDED]?: infer Yielded }
    ? Yielded
    : never
  : never;

type StepsRecordYielded<Steps extends AnyStepsRecord> = {
  [Key in keyof Steps]: StepYielded<Steps[Key]>;
}[keyof Steps];

type SetupGuard<Context, Steps extends string, Yielded> = CraftTransitionGuard<
  CraftTransition<Context, Steps, unknown>,
  Yielded
>;

export interface CraftTransitionsSetupPipe<
  Context,
  Steps extends string,
  Yielded,
> {
  <Y1>(
    guard1: SetupGuard<Context, Steps, Y1>,
  ): CraftTransitionsSetup<Context, Steps, Yielded | Y1>;
  <Y1, Y2>(
    guard1: SetupGuard<Context, Steps, Y1>,
    guard2: SetupGuard<Context, Steps, Y2>,
  ): CraftTransitionsSetup<Context, Steps, Yielded | Y1 | Y2>;
  <Y1, Y2, Y3>(
    guard1: SetupGuard<Context, Steps, Y1>,
    guard2: SetupGuard<Context, Steps, Y2>,
    guard3: SetupGuard<Context, Steps, Y3>,
  ): CraftTransitionsSetup<Context, Steps, Yielded | Y1 | Y2 | Y3>;
  <Y1, Y2, Y3, Y4>(
    guard1: SetupGuard<Context, Steps, Y1>,
    guard2: SetupGuard<Context, Steps, Y2>,
    guard3: SetupGuard<Context, Steps, Y3>,
    guard4: SetupGuard<Context, Steps, Y4>,
  ): CraftTransitionsSetup<Context, Steps, Yielded | Y1 | Y2 | Y3 | Y4>;
}

/**
 * The installed transitions of a machine. `Context` travels contravariantly so
 * `craftStateMachine` accepts a setup whose annotated context is satisfied by
 * the machine's actual context, and refuses one that asks for more.
 */
export interface CraftTransitionsSetup<
  Context,
  Steps extends string,
  Yielded = never,
> {
  readonly [TRANSITIONS_SETUP_MARKER]: true;
  readonly [TRANSITIONS_SETUP_CONTEXT]?: (context: Context) => void;
  readonly [TRANSITIONS_SETUP_STEPS]?: Steps;
  readonly [TRANSITIONS_SETUP_YIELDED]?: Yielded;
  readonly pipe: CraftTransitionsSetupPipe<Context, Steps, Yielded>;
}

/**
 * `yield* initStateMachine(...)` is not optional: without it nothing would ever
 * give the machine its first step. The obligation is enforced here, by making
 * the transitions argument unassignable until the marker shows up.
 */
export type CraftMachineInitRequirement<Yielded> = [
  Extract<Yielded, CraftMachineInitRequest>,
] extends [never]
  ? {
      readonly [MISSING_INIT_STATE_MACHINE]: 'This state machine never initialises: add `yield* initStateMachine(() => transit())` to one of its transitionStep(...) blocks.';
    }
  : unknown;

/** The registration value the machine-scoped helpers resolve to. */
export type CraftMachineRegistration<Yielded = never> = Generator<
  Yielded,
  void,
  unknown
>;

/** Reads the context type a `craftStateMachine` context factory produces. */
export type CraftMachineContext<ContextFactory> = ContextFactory extends (
  ...args: any[]
) => Generator<any, infer Context, any>
  ? Context
  : ContextFactory extends (...args: any[]) => infer Context
    ? Context
    : never;

type StepContextValue<StepContexts, Steps extends string> = Steps extends
  keyof StepContexts
  ? StepContexts[Steps]
  : never;

export type CraftMachineInsertionContext<
  Context,
  Steps extends string,
  StepContexts,
> = {
  readonly context: Context;
  readonly currentStep: YieldableReactiveValue<Steps | undefined, 'currentStep'>;
  readonly stepContext: YieldableReactiveValue<
    StepContextValue<StepContexts, Steps> | undefined,
    'stepContext'
  >;
};

export type CraftStateMachineOutput<
  Context,
  Steps extends string,
  StepContexts,
  Insertions,
  Dependencies = {},
> = MergeObject<
  {
    readonly currentStep: YieldableReactiveValue<
      Steps | undefined,
      'currentStep'
    >;
    readonly stepContext: YieldableReactiveValue<
      StepContextValue<StepContexts, Steps> | undefined,
      'stepContext'
    >;
    readonly context: Context;
  },
  MergeObject<
    BrandReactiveProperties<YieldableInsertionMethods<Insertions>>,
    { readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies }
  >
>;

// ---------------------------------------------------------------------------
// Authoring surface
// ---------------------------------------------------------------------------

/**
 * Wraps a predicate into a transition guard. Accepts a plain lambda or a
 * generator; a generator guard resolves craft dependencies with `yield*`, and
 * those dependencies join the machine's dependency graph.
 *
 * ```ts
 * transitionGuard(({ context }) => context.form.isValid());
 *
 * transitionGuard(function* ({ context, from, to, event }) {
 *   const policy = yield* PolicyService();
 *   return policy.canTransition({ from, to, event });
 * });
 * ```
 */
export function transitionGuard<
  Transition extends CraftTransition<any, any, any>,
  Yielded = never,
>(
  guard: (
    transition: Transition,
  ) => boolean | Generator<Yielded, boolean, unknown>,
): CraftTransitionGuard<Transition, Yielded> {
  return Object.assign(guard, {
    [TRANSITION_GUARD_MARKER]: true as const,
  }) as CraftTransitionGuard<Transition, Yielded>;
}

/**
 * Declares how a machine enters one step. The generator runs once, at machine
 * creation, and registers the reactions that may move the machine here
 * (`on$`, `afterRecomputation`, `initStateMachine`).
 *
 * `transitionStep(...).pipe(transitionGuard(...))` guards every transition
 * declared in that step.
 */
export function transitionStep<Yielded = never>(
  setup: () => Generator<Yielded, unknown, unknown> | void,
): CraftTransitionStep<Yielded> {
  return createTransitionStep(setup as () => unknown, []);
}

/**
 * Builds every transition of a machine. The setup generator receives the
 * machine `context` and `transit`, and returns one {@link transitionStep} per
 * step; the record's keys ARE the machine's steps.
 *
 * `transiteSetup(...).pipe(transitionGuard(...))` guards every transition of
 * every step.
 *
 * Declared standalone, the setup's `context` parameter has to be annotated —
 * typically with `CraftMachineContext<typeof contextFactory>`; `craftStateMachine`
 * then checks the machine's real context against that annotation.
 */
export function transiteSetup<
  Context,
  StepsRecord extends AnyStepsRecord,
  SetupYielded = never,
>(
  setup: (
    context: Context,
    transit: CraftTransit<Context>,
  ) => Generator<SetupYielded, StepsRecord, unknown>,
): CraftTransitionsSetup<
  Context,
  Extract<keyof StepsRecord, string>,
  SetupYielded | StepsRecordYielded<StepsRecord>
> {
  return createTransitionsSetup(
    setup as unknown as (context: unknown, transit: unknown) => unknown,
    [],
  ) as unknown as CraftTransitionsSetup<
    Context,
    Extract<keyof StepsRecord, string>,
    SetupYielded | StepsRecordYielded<StepsRecord>
  >;
}

/**
 * Registers the callback that gives the machine its initial step. Registrations
 * run after every step has been installed, in declaration order, and the first
 * accepted `transit()` wins — later init registrations are skipped.
 *
 * ```ts
 * yield* initStateMachine(() => transit());
 * ```
 */
export function initStateMachine<Yielded = never>(
  callback: () => Generator<Yielded, unknown, unknown> | void,
): CraftMachineRegistration<Yielded | CraftMachineInitRequest> {
  return ɵregisterMachineInit(callback as () => unknown) as CraftMachineRegistration<
    Yielded | CraftMachineInitRequest
  >;
}

// ---------------------------------------------------------------------------
// craftStateMachine
// ---------------------------------------------------------------------------

type ContextFactory<Yielded, Context> = () => Generator<
  Yielded,
  Context,
  unknown
>;

type StepContextFactory<Context, Yielded, StepContexts> = (
  context: Context,
) => Generator<Yielded, StepContexts, unknown>;

type MachineInsertion<Context, Steps extends string, StepContexts, Yielded, Insertions> =
  (
    context: CraftMachineInsertionContext<Context, Steps, StepContexts>,
  ) => Generator<Yielded, Insertions, unknown> | Insertions;

type MachineDependencies<
  ContextYielded,
  TransitionsYielded,
  StepContextYielded,
  InsertionYielded,
> = CompleteServiceDependencyMapFromYielded<
  ContextYielded | TransitionsYielded | StepContextYielded | InsertionYielded
>;

export function craftStateMachine<
  Name extends string,
  ContextYielded,
  Context extends object,
  Steps extends string,
  TransitionsYielded,
  StepContextYielded,
  StepContexts extends Record<Steps, unknown>,
  InsertionYielded,
  Insertions,
>(
  name: Name,
  contextFactory: ContextFactory<ContextYielded, Context>,
  transitions: CraftTransitionsSetup<
    NoInfer<Context>,
    Steps,
    TransitionsYielded
  > &
    CraftMachineInitRequirement<TransitionsYielded>,
  stepContextFactory: StepContextFactory<
    NoInfer<Context>,
    StepContextYielded,
    StepContexts
  >,
  insertion: MachineInsertion<
    NoInfer<Context>,
    NoInfer<Steps>,
    NoInfer<StepContexts>,
    InsertionYielded,
    Insertions
  >,
): NamedCraftPrimitiveGen<
  Name,
  CraftStateMachineOutput<
    Context,
    Steps,
    StepContexts,
    Insertions,
    MachineDependencies<
      ContextYielded,
      TransitionsYielded,
      StepContextYielded,
      InsertionYielded
    >
  >
>;
export function craftStateMachine<
  Name extends string,
  ContextYielded,
  Context extends object,
  Steps extends string,
  TransitionsYielded,
  StepContextYielded,
  StepContexts extends Record<Steps, unknown>,
>(
  name: Name,
  contextFactory: ContextFactory<ContextYielded, Context>,
  transitions: CraftTransitionsSetup<
    NoInfer<Context>,
    Steps,
    TransitionsYielded
  > &
    CraftMachineInitRequirement<TransitionsYielded>,
  stepContextFactory: StepContextFactory<
    NoInfer<Context>,
    StepContextYielded,
    StepContexts
  >,
): NamedCraftPrimitiveGen<
  Name,
  CraftStateMachineOutput<
    Context,
    Steps,
    StepContexts,
    {},
    MachineDependencies<
      ContextYielded,
      TransitionsYielded,
      StepContextYielded,
      never
    >
  >
>;
export function craftStateMachine<
  ContextYielded,
  Context extends object,
  Steps extends string,
  TransitionsYielded,
  StepContextYielded,
  StepContexts extends Record<Steps, unknown>,
  InsertionYielded,
  Insertions,
>(
  contextFactory: ContextFactory<ContextYielded, Context>,
  transitions: CraftTransitionsSetup<
    NoInfer<Context>,
    Steps,
    TransitionsYielded
  > &
    CraftMachineInitRequirement<TransitionsYielded>,
  stepContextFactory: StepContextFactory<
    NoInfer<Context>,
    StepContextYielded,
    StepContexts
  >,
  insertion: MachineInsertion<
    NoInfer<Context>,
    NoInfer<Steps>,
    NoInfer<StepContexts>,
    InsertionYielded,
    Insertions
  >,
): NamedCraftPrimitiveGen<
  'stateMachine',
  CraftStateMachineOutput<
    Context,
    Steps,
    StepContexts,
    Insertions,
    MachineDependencies<
      ContextYielded,
      TransitionsYielded,
      StepContextYielded,
      InsertionYielded
    >
  >
>;
export function craftStateMachine<
  ContextYielded,
  Context extends object,
  Steps extends string,
  TransitionsYielded,
  StepContextYielded,
  StepContexts extends Record<Steps, unknown>,
>(
  contextFactory: ContextFactory<ContextYielded, Context>,
  transitions: CraftTransitionsSetup<
    NoInfer<Context>,
    Steps,
    TransitionsYielded
  > &
    CraftMachineInitRequirement<TransitionsYielded>,
  stepContextFactory: StepContextFactory<
    NoInfer<Context>,
    StepContextYielded,
    StepContexts
  >,
): NamedCraftPrimitiveGen<
  'stateMachine',
  CraftStateMachineOutput<
    Context,
    Steps,
    StepContexts,
    {},
    MachineDependencies<
      ContextYielded,
      TransitionsYielded,
      StepContextYielded,
      never
    >
  >
>;
export function craftStateMachine(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nameOrContextFactory: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contextFactoryOrTransitions?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transitionsOrStepContextFactory?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stepContextFactoryOrInsertion?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeInsertion?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const isNamed = typeof nameOrContextFactory === 'string';
  const name = isNamed ? nameOrContextFactory : 'stateMachine';
  const contextFactory = isNamed
    ? contextFactoryOrTransitions
    : nameOrContextFactory;
  const transitions = isNamed
    ? transitionsOrStepContextFactory
    : contextFactoryOrTransitions;
  const stepContextFactory = isNamed
    ? stepContextFactoryOrInsertion
    : transitionsOrStepContextFactory;
  const insertion = isNamed ? maybeInsertion : stepContextFactoryOrInsertion;

  const ref = createStateMachineRef(
    name,
    contextFactory,
    transitions,
    stepContextFactory,
    insertion,
  );

  return createNamedPrimitiveGen(name, ref);
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

type RuntimeTransitionStep = {
  readonly [TRANSITION_STEP_MARKER]: true;
  readonly setup: () => unknown;
  readonly guards: readonly RuntimeTransitionGuard[];
  readonly pipe: (...guards: RuntimeTransitionGuard[]) => RuntimeTransitionStep;
};

type RuntimeTransitionsSetup = {
  readonly [TRANSITIONS_SETUP_MARKER]: true;
  readonly setup: (context: unknown, transit: unknown) => unknown;
  readonly guards: readonly RuntimeTransitionGuard[];
  readonly pipe: (
    ...guards: RuntimeTransitionGuard[]
  ) => RuntimeTransitionsSetup;
};

function createTransitionStep(
  setup: () => unknown,
  guards: readonly RuntimeTransitionGuard[],
): RuntimeTransitionStep & CraftTransitionStep<any> {
  const step = {
    [TRANSITION_STEP_MARKER]: true as const,
    setup,
    guards,
    pipe: (...extraGuards: RuntimeTransitionGuard[]) =>
      createTransitionStep(setup, [...guards, ...extraGuards]),
  };

  return step as RuntimeTransitionStep & CraftTransitionStep<any>;
}

function createTransitionsSetup(
  setup: (context: unknown, transit: unknown) => unknown,
  guards: readonly RuntimeTransitionGuard[],
): RuntimeTransitionsSetup {
  return {
    [TRANSITIONS_SETUP_MARKER]: true as const,
    setup,
    guards,
    pipe: (...extraGuards: RuntimeTransitionGuard[]) =>
      createTransitionsSetup(setup, [...guards, ...extraGuards]),
  };
}

function createTransitionAttempt(
  event: unknown,
  localGuards: readonly RuntimeTransitionGuard[],
): Generator<unknown, boolean, unknown> {
  // The scope is captured at CREATION time: `transit(...)` is called from inside
  // a registration callback, which the machine runs with its declaring step
  // restored. Reading it lazily would resolve the wrong target.
  const scope = ɵrequireMachineScope('transit(...)');
  const attempt = ɵrunTransition(scope, event, localGuards);

  return Object.assign(attempt, {
    pipe: (...guards: RuntimeTransitionGuard[]) =>
      ɵwithMachineScope(scope, () =>
        createTransitionAttempt(event, [...localGuards, ...guards]),
      ),
  });
}

function createTransit(): (event?: unknown) => unknown {
  return (event?: unknown) => createTransitionAttempt(event, []);
}

function isStepsRecord(value: unknown): value is Record<string, RuntimeTransitionStep> {
  return typeof value === 'object' && value !== null;
}

function driveFactory(
  factory: (...args: never[]) => unknown,
  injector: Injector,
  ...args: unknown[]
): unknown {
  const wrapped = runInInjectionContext(injector, () =>
    injectFnWrapper()(factory as (...values: unknown[]) => unknown),
  );

  return runInInjectionContext(injector, () =>
    ɵdriveMachineGenerator(wrapped(...args), injector),
  );
}

function exposeInsertionOutput(
  output: Record<string, unknown>,
  injector: Injector,
): Record<string, unknown> {
  return Object.entries(output).reduce(
    (exposed, [key, value]) => {
      if (isYieldableReactiveValue(value)) {
        exposed[key] = nameInsertedReactiveValue(
          value,
          key,
          'craftStateMachine',
          `craftStateMachine.${key}`,
        );
        return exposed;
      }

      if (isSource(value) || isSignal(value) || isYieldableMethod(value)) {
        exposed[key] = value;
        return exposed;
      }

      if (typeof value === 'function' && !isNonYieldableInsertionMethod(value)) {
        const methodInjector = ɵcreateHostTaggedInjector(
          injector,
          `method:${key}`,
        );
        const wrappedFn = runInInjectionContext(methodInjector, () =>
          injectFnWrapper()(value as (...args: unknown[]) => unknown),
        );
        exposed[key] = createYieldableInsertionMethod(wrappedFn, {
          injector: methodInjector,
          invalidYieldErrorMessage:
            'craftStateMachine insertion method generators can only yield craftService dependencies or exposed dependency helpers.',
          multipleAppStartErrorMessage:
            'craftStateMachine insertion methods do not support multiple onAppStart(...) declarations.',
          onAppStartNotSupportedErrorMessage:
            'craftStateMachine insertion methods do not support onAppStart(...).',
        });
        return exposed;
      }

      exposed[key] = value;
      return exposed;
    },
    {} as Record<string, unknown>,
  );
}

function createStateMachineRef(
  name: string,
  contextFactory: () => unknown,
  transitions: RuntimeTransitionsSetup,
  stepContextFactory?: (context: unknown) => unknown,
  insertion?: (context: unknown) => unknown,
): Record<string, unknown> {
  assertInInjectionContext(craftStateMachine);
  const injector = ɵcreateHostTaggedInjector(
    inject(Injector),
    `stateMachine:${name}`,
  );

  return runInInjectionContext(injector, () => {
    const context = driveFactory(contextFactory, injector) as Record<
      string,
      unknown
    >;

    const stepContexts = (
      stepContextFactory
        ? driveFactory(
            stepContextFactory as (...args: never[]) => unknown,
            injector,
            context,
          )
        : {}
    ) as Record<string, unknown>;

    const currentStep = craftSignal<string | undefined>(undefined);
    const runtime: MachineRuntime = {
      context,
      currentStep,
      globalGuards: transitions.guards,
      stepGuards: new Map(),
      injector,
      initRegistrations: [],
    };

    const stepsRecord = driveFactory(
      transitions.setup as (...args: never[]) => unknown,
      injector,
      context,
      createTransit(),
    );

    if (!isStepsRecord(stepsRecord)) {
      throw new Error(
        'transiteSetup(...) must return a record of transitionStep(...) entries.',
      );
    }

    for (const [step, definition] of Object.entries(stepsRecord)) {
      runtime.stepGuards.set(step, definition.guards ?? []);
    }

    for (const [step, definition] of Object.entries(stepsRecord)) {
      ɵwithMachineScope({ runtime, target: step }, () =>
        runInInjectionContext(injector, () =>
          ɵdriveMachineGenerator(definition.setup(), injector),
        ),
      );
    }

    // Installation is over: the machine can now take its initial step. The
    // first accepted transit wins, so a later registration is not even run.
    for (const registration of runtime.initRegistrations) {
      if (currentStep() !== undefined) {
        break;
      }
      registration();
    }

    const currentStepReader = createYieldableReactiveValue(
      currentStep.asReadonly(),
      'currentStep',
    );
    const stepContextReader = createYieldableReactiveValue(
      createCraftComputed(() => {
        const step = currentStep();
        return step === undefined ? undefined : stepContexts[step];
      }),
      'stepContext',
    );

    const ref: Record<string, unknown> = {
      currentStep: currentStepReader,
      stepContext: stepContextReader,
      context,
    };

    if (insertion) {
      const output = driveFactory(
        insertion as (...args: never[]) => unknown,
        injector,
        {
          context,
          currentStep: currentStepReader,
          stepContext: stepContextReader,
        },
      );

      Object.assign(
        ref,
        exposeInsertionOutput(
          (output ?? {}) as Record<string, unknown>,
          injector,
        ),
      );
    }

    return ref;
  });
}
