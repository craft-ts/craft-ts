import {
  assertInInjectionContext,
  inject,
  Injector,
  isSignal,
  isWritableSignal,
  linkedSignal,
  runInInjectionContext,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  InsertionsStateFactory,
  InsertionStateFactoryContext,
} from './query.core';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import { APP_SNAPSHOT_REGISTRY, readInsertionsSnapshot } from './take-app-snapshot';
import { Source$ as SourceDollarType } from './source$';
import { MergeObject } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { isSource } from './util/util';

type ResolveGeneratorResult<Result> = Result extends Generator<
  any,
  infer Output,
  unknown
>
  ? Output
  : Result;

type Source$Method<SourceType> = [SourceType] extends [void]
  ? () => void
  : (value: SourceType) => void;

type AnyGeneratorFunction = (...args: never[]) => Generator<
  unknown,
  unknown,
  unknown
>;

export type ExposedStateInsertions<Insertions> = MergeObject<
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>,
  {
    [K in keyof FilterSource<Insertions> as FilterSource<Insertions>[K] extends SourceDollarType<any>
      ? K
      : never]: FilterSource<Insertions>[K] extends SourceDollarType<
      infer SourceType
    >
      ? Source$Method<SourceType>
      : never;
  }
>;

export type StateOutput<StateType, Insertions, Dependencies = {}> = MergeObject<
  Signal<StateType>,
  MergeObject<
    ExposedStateInsertions<Insertions>,
    {
      readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
    }
  >
>;

type StateConfig<State> = State | Signal<State>;
type StateGeneratorFactory<State, Yielded = never> = () => Generator<
  Yielded,
  StateConfig<State>,
  unknown
>;
type ResolvedStateType<StateInput> = StateInput extends Signal<infer State>
  ? State
  : StateInput extends (...args: any[]) => Generator<any, infer Output, unknown>
    ? ResolvedStateType<Output>
    : StateInput;
type StateConfigYielded<StateInput> = StateInput extends (
  ...args: any[]
) => Generator<infer Yielded, any, unknown>
  ? Yielded
  : never;
type StateTrackedDependencies<
  StateYielded = never,
  InsertionsYielded = never,
> = ServiceDependencyMapFromYielded<StateYielded | InsertionsYielded>;

const STATE_INVALID_YIELD_ERROR_MESSAGE =
  'state generators can only yield craftService dependencies or exposed dependency helpers.';
const STATE_APP_START_ERROR_MESSAGE =
  'state generators do not support onAppStart(...).';

function isSource$(value: unknown): value is SourceDollarType<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'emit' in value &&
    typeof (value as SourceDollarType<unknown>).emit === 'function' &&
    'subscribe' in value &&
    typeof (value as SourceDollarType<unknown>).subscribe === 'function'
  );
}

function isGeneratorFunction(value: unknown): value is AnyGeneratorFunction {
  return (
    typeof value === 'function' &&
    (value.constructor?.name === 'GeneratorFunction' ||
      Object.prototype.toString.call(value) === '[object GeneratorFunction]')
  );
}

function executeStateFactory<This, Args extends unknown[], Result>(
  factory: (this: This, ...args: Args) => Result,
  thisArg: This,
  getInjector: () => Injector,
  ...args: Args
): ResolveGeneratorResult<Result> {
  const injector = getInjector();
  const wrappedFactory = runInInjectionContext(injector, () =>
    injectFnWrapper()(factory),
  );
  const result = wrappedFactory.apply(thisArg, args);

  if (!isGenerator(result)) {
    return result as ResolveGeneratorResult<Result>;
  }

  return runInInjectionContext(injector, () => {
    return runCraftGenerator({
      iterator: result,
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: STATE_INVALID_YIELD_ERROR_MESSAGE,
      multipleAppStartErrorMessage: STATE_APP_START_ERROR_MESSAGE,
      onAppStartNotSupportedErrorMessage: STATE_APP_START_ERROR_MESSAGE,
    }).value as ResolveGeneratorResult<Result>;
  });
}

/**
 * Creates a signal state with optional insertions for adding methods and computed properties.
 *
 * The `state` function allows you to create a Signal-based state that can be extended with custom
 * methods and properties through insertions. Each insertion receives a context object with
 * `state`, `set`, `update` methods and previous insertions.
 *
 * @remarks
 * For the best TypeScript inference, pass Angular `Signal` values (e.g. `signal`, `linkedSignal`)
 * rather than manually widening to `WritableSignal`. This avoids some overload inference limits.
 *
 * @param stateConfig - The initial state value or a Signal (e.g., linkedSignal)
 * @param insertions - Optional insertion functions to extend the state with methods and properties
 * @returns A Signal representing the state, merged with all insertion properties and methods
 *
 * @example
 * // Simple state with a primitive value
 * const counter = state(0);
 * console.log(counter()); // 0
 *
 * @example
 * // State with a computed
 * const origin = signal(5);
 * const doubled = state(computed(() => origin() * 2));
 * console.log(doubled()); // 10
 *
 * @example
 * // State with insertions to add methods (Method-based)
 * const origin = signal(5);
 * const counter = state(
 *   computed(() => origin() * 2),
 *   ({ update, set }) => ({
 *     increment: () => update((current) => current + 1),
 *     reset: () => set(0),
 *   })
 * );
 * console.log(counter()); // 10
 * counter.increment();
 * console.log(counter()); // 11
 * counter.reset();
 * console.log(counter()); // 0
 *
 * @example
 * // State with multiple insertions (methods and computed properties)
 * const origin = signal(5);
 * const counterDouble = state(
 *   computed(() => origin() * 2),
 *   ({ update, set }) => ({
 *     increment: () => update((current) => current + 1),
 *     reset: () => set(0),
 *   }),
 *   ({ state }) => ({
 *     isOdd: computed(() => state() % 2 === 1),
 *   })
 * );
 * console.log(counterDouble()); // 10
 * console.log(counterDouble.isOdd()); // false
 * counterDouble.increment();
 * console.log(counterDouble()); // 11
 * console.log(counterDouble.isOdd()); // true
 *
 * @example
 * // State with source binding (Event-based)
 * const increment = source$<void>();
 * const reset = source$<void>();
 * const myState = state(0, ({ update, set }) => ({
 *   setValue: on$(increment, () => update(value => value + 1)),
 *   reset: () => on$(reset, () => set(0)),
 * }));
 * console.log(myState()); // 0
 * // Note: setValue is not exposed on myState, only used internally
 * increment.emit();
 * console.log(myState()); // 34
 * reset.emit();
 * console.log(myState()); // 0
 */
export function state<StateInput>(
  stateConfig: StateInput,
): StateOutput<
  ResolvedStateType<StateInput>,
  {},
  StateTrackedDependencies<StateConfigYielded<StateInput>>
>;
export function state<
  StateInput,
  Insertion1,
  Insertion1Yielded = never,
>(
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): StateOutput<
  ResolvedStateType<StateInput>,
  Insertion1,
  StateTrackedDependencies<StateConfigYielded<StateInput>, Insertion1Yielded>
>;
export function state<
  StateInput,
  Insertion1,
  Insertion2,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
>(
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
): StateOutput<
  ResolvedStateType<StateInput>,
  Insertion1 & Insertion2,
  StateTrackedDependencies<
    StateConfigYielded<StateInput>,
    Insertion1Yielded | Insertion2Yielded
  >
>;
export function state<
  StateInput,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
>(
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
): StateOutput<
  ResolvedStateType<StateInput>,
  Insertion1 & Insertion2 & Insertion3,
  StateTrackedDependencies<
    StateConfigYielded<StateInput>,
    Insertion1Yielded | Insertion2Yielded | Insertion3Yielded
  >
>;
export function state<
  StateInput,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
>(
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
): StateOutput<
  ResolvedStateType<StateInput>,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  StateTrackedDependencies<
    StateConfigYielded<StateInput>,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded
  >
>;
export function state<
  StateInput,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
>(
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
): StateOutput<
  ResolvedStateType<StateInput>,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  StateTrackedDependencies<
    StateConfigYielded<StateInput>,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded
    | Insertion5Yielded
  >
>;
export function state<
  StateInput,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
>(
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
): StateOutput<
  ResolvedStateType<StateInput>,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  StateTrackedDependencies<
    StateConfigYielded<StateInput>,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded
    | Insertion5Yielded
    | Insertion6Yielded
  >
>;
export function state<
  StateInput,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
>(
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): StateOutput<
  ResolvedStateType<StateInput>,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  StateTrackedDependencies<
    StateConfigYielded<StateInput>,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded
    | Insertion5Yielded
    | Insertion6Yielded
    | Insertion7Yielded
  >
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function state<StateType>(stateConfig: any, ...insertions: any[]): any {
  let injector: Injector | undefined;
  const getInjector = () => {
    assertInInjectionContext(state);
    injector ??= ɵcreateHostTaggedInjector(inject(Injector), 'state');
    return injector;
  };
  const resolvedStateConfig = isGeneratorFunction(stateConfig)
    ? executeStateFactory(stateConfig, undefined, getInjector)
    : stateConfig;
  const isSignalState = isSignal(resolvedStateConfig);
  const stateSignal = isSignalState
    ? isWritableSignal(resolvedStateConfig)
      ? (resolvedStateConfig as WritableSignal<StateType>)
      : linkedSignal(() => (resolvedStateConfig as Signal<StateType>)())
    : signal(resolvedStateConfig as StateType);
  const readonlyStateSignal =
    'asReadonly' in stateSignal && typeof stateSignal.asReadonly === 'function'
      ? stateSignal.asReadonly()
      : (stateSignal as Signal<StateType>);
  const originalSet = stateSignal.set.bind(stateSignal);
  const originalUpdate = stateSignal.update.bind(stateSignal);
  const insertionsOutput = (
    insertions as InsertionsStateFactory<StateType, {}>[]
  ).reduce(
    (acc, insert) => {
      const nextRawInsertions = executeStateFactory(
        insert,
        undefined,
        getInjector,
        {
          state: readonlyStateSignal,
          set: (newState: StateType) => originalSet(newState),
          update: (updateFn: (currentState: StateType) => StateType) =>
            originalUpdate(updateFn),
          patch: (patchFn: (currentState: StateType) => Partial<StateType>) =>
            originalUpdate((current) => ({
              ...current,
              ...patchFn(current),
            })),
          insertions: acc.rawInsertionsOutput as {},
        } as InsertionStateFactoryContext<StateType, {}>,
      ) as Record<string, unknown>;

      const nextExposedInsertions = Object.entries(nextRawInsertions).reduce(
        (exposedAcc, [key, value]) => {
          if (isSource(value)) {
            return exposedAcc;
          }

          if (isSource$(value)) {
            const localSource = value;
            exposedAcc[key] = (payload: unknown) => {
              localSource.emit(payload as never);
            };
            return exposedAcc;
          }

          exposedAcc[key] = value;
          return exposedAcc;
        },
        {} as Record<string, unknown>,
      );

      return {
        rawInsertionsOutput: {
          ...acc.rawInsertionsOutput,
          ...nextRawInsertions,
        },
        exposedInsertionsOutput: {
          ...acc.exposedInsertionsOutput,
          ...nextExposedInsertions,
        },
      };
    },
    {
      rawInsertionsOutput: {} as Record<string, unknown>,
      exposedInsertionsOutput: {} as Record<string, unknown>,
    },
  );

  const stateOutput = Object.assign(
    stateSignal,
    insertionsOutput.exposedInsertionsOutput,
  ) as unknown as StateOutput<StateType, {}>;

  const snapshotRegistry = injector
    ? injector.get(APP_SNAPSHOT_REGISTRY, null)
    : (() => {
        try {
          return inject(APP_SNAPSHOT_REGISTRY, { optional: true });
        } catch {
          return null;
        }
      })();

  const hostTagList: readonly string[] = injector
    ? (injector.get(ɵHOST_TAG_LIST, null) ?? [])
    : (() => {
        try {
          return inject(ɵHOST_TAG_LIST, { optional: true }) ?? [];
        } catch {
          return [];
        }
      })();

  if (snapshotRegistry) {
    snapshotRegistry.push(() => {
      let state: unknown;
      try {
        const insertionSnapshot = readInsertionsSnapshot(
          insertionsOutput.exposedInsertionsOutput,
        );
        state = {
          value: stateSignal(),
          ...(insertionSnapshot ? { insertions: insertionSnapshot } : {}),
        };
      } catch (error) {
        state = { error: error instanceof Error ? error.message : String(error) };
      }
      return { source: 'state', from: hostTagList, state };
    });
  }

  return stateOutput;
}
