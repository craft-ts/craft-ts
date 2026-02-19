import {
  isSignal,
  isWritableSignal,
  linkedSignal,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  InsertionsStateFactory,
  InsertionStateFactoryContext,
} from './query.core';
import { MergeObject } from './util/types/util.type';
import { IsEmptyObject } from './util/util.type';
import {
  BusinessExceptionScope,
  createBusinessExceptionStore,
  ExtractBusinessExceptionsFromObject,
  ExtractStateExceptions,
  getStateExceptionDefinitions,
  GroupedBusinessExceptions,
  wrapExceptionAwareMethods,
} from './business-exception';
import { Source$ } from './source$';
import { isSource, SourceBranded } from './util/util';

type FilterExceptionsByScope<
  Exceptions,
  Scope extends BusinessExceptionScope,
> = Extract<Exceptions, { scope: Scope }>;

type StateOutputExceptions<StateType, Insertions> =
  GroupedBusinessExceptions<
    FilterExceptionsByScope<
      | ExtractStateExceptions<StateType>
      | ExtractBusinessExceptionsFromObject<Insertions>,
      'state'
    >,
    FilterExceptionsByScope<
      | ExtractStateExceptions<StateType>
      | ExtractBusinessExceptionsFromObject<Insertions>,
      'method'
    >,
    FilterExceptionsByScope<
      | ExtractStateExceptions<StateType>
      | ExtractBusinessExceptionsFromObject<Insertions>,
      'derived'
    >,
    FilterExceptionsByScope<
      | ExtractStateExceptions<StateType>
      | ExtractBusinessExceptionsFromObject<Insertions>,
      'reaction'
    >
  >;

type Source$Method<SourceType> = [SourceType] extends [void]
  ? () => void
  : (value: SourceType) => void;

export type ExposedStateInsertions<Insertions> = {
  [K in keyof Insertions as Insertions[K] extends SourceBranded
    ? never
    : K]: Insertions[K] extends Source$<infer SourceType>
    ? Source$Method<SourceType>
    : Insertions[K];
};

export type StateOutput<StateType, Insertions> = MergeObject<
  Signal<StateType>,
  MergeObject<
    IsEmptyObject<Insertions> extends true
      ? {}
      : ExposedStateInsertions<Insertions>,
    {
      readonly exceptions?: Signal<StateOutputExceptions<StateType, Insertions>>;
    }
  >
>;

type StateConfig<State> = State | Signal<State>;

function isSource$(value: unknown): value is Source$<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'emit' in value &&
    typeof (value as Source$<unknown>).emit === 'function' &&
    'subscribe' in value &&
    typeof (value as Source$<unknown>).subscribe === 'function' &&
    'asReadonly' in value &&
    typeof (value as Source$<unknown>).asReadonly === 'function'
  );
}

function toExposedStateInsertions(
  insertions: Record<string, unknown>,
): Record<string, unknown> {
  return Object.entries(insertions).reduce((acc, [key, value]) => {
    if (isSource(value)) {
      return acc;
    }

    if (isSource$(value)) {
      acc[key] = (payload: unknown) => {
        value.emit(payload as never);
      };
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {} as Record<string, unknown>);
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
 * // State with a linkedSignal
 * const origin = signal(5);
 * const doubled = state(linkedSignal(() => origin() * 2));
 * console.log(doubled()); // 10
 *
 * @example
 * // State with insertions to add methods
 * const origin = signal(5);
 * const counter = state(
 *   linkedSignal(() => origin() * 2),
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
 * const counter = state(
 *   linkedSignal(() => origin() * 2),
 *   ({ update, set }) => ({
 *     increment: () => update((current) => current + 1),
 *     reset: () => set(0),
 *   }),
 *   ({ state }) => ({
 *     isOdd: computed(() => state() % 2 === 1),
 *   })
 * );
 * console.log(counter()); // 10
 * console.log(counter.isOdd()); // false
 * counter.increment();
 * console.log(counter()); // 11
 * console.log(counter.isOdd()); // true
 *
 * @example
 * // State with source binding (methods bound to sources are not exposed)
 * const sourceSignal = source<number>();
 * const myState = state(0, ({ set }) => ({
 *   setValue: afterRecomputation(sourceSignal, (value) => set(value)),
 *   reset: () => set(0),
 * }));
 * console.log(myState()); // 0
 * // Note: setValue is not exposed on myState, only used internally
 * sourceSignal.set(34);
 * console.log(myState()); // 34
 * myState.reset();
 * console.log(myState()); // 0
 */
export function state<StateType>(
  stateConfig: StateConfig<StateType>,
): StateOutput<StateType, {}>;
export function state<StateType, Insertion1>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
): StateOutput<StateType, Insertion1>;
export function state<StateType, Insertion1, Insertion2>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
  insertion2: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion2,
    Insertion1
  >,
): StateOutput<StateType, Insertion1 & Insertion2>;
export function state<StateType, Insertion1, Insertion2, Insertion3>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
  insertion2: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): StateOutput<StateType, Insertion1 & Insertion2 & Insertion3>;
export function state<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
  insertion2: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): StateOutput<StateType, Insertion1 & Insertion2 & Insertion3 & Insertion4>;
export function state<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
  insertion2: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): StateOutput<
  StateType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function state<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
  insertion2: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
): StateOutput<
  StateType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
>;
export function state<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
  insertion2: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsStateFactory<
    NoInfer<StateType>,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
): StateOutput<
  StateType,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function state<StateType>(stateConfig: any, ...insertions: any[]): any {
  const isSignalState = isSignal(stateConfig);
  const stateSignal = isSignalState
    ? isWritableSignal(stateConfig)
      ? (stateConfig as WritableSignal<StateType>)
      : linkedSignal(() => (stateConfig as Signal<StateType>)())
    : signal(stateConfig as StateType);
  const readonlyStateSignal =
    'asReadonly' in stateSignal && typeof stateSignal.asReadonly === 'function'
      ? stateSignal.asReadonly()
      : (stateSignal as Signal<StateType>);
  const exceptionStore = createBusinessExceptionStore({
    state: getStateExceptionDefinitions(
      isSignalState ? stateSignal() : stateConfig,
    ),
  });
  const resolvedInsertions = (insertions as InsertionsStateFactory<
    StateType,
    {}
  >[])?.reduce(
    (acc, insert) => {
      const newInsertions = wrapExceptionAwareMethods(
        insert({
          state: readonlyStateSignal,
          set: (newState: StateType) => stateSignal.set(newState),
          update: (updateFn: (currentState: StateType) => StateType) =>
            stateSignal.update(updateFn),
          insertions: acc as {},
          exceptions: exceptionStore.exceptions,
          raiseException: exceptionStore.raiseException,
          clearException: exceptionStore.clearException,
          clearExceptionScope: exceptionStore.clearScope,
          clearExceptions: exceptionStore.clearAll,
        } as InsertionStateFactoryContext<StateType, {}>) as Record<
          string,
          unknown
        >,
        exceptionStore.raiseException,
      );
      return {
        ...acc,
        ...newInsertions,
      };
    },
    {} as Record<string, unknown>,
  );

  return Object.assign(
    stateSignal,
    {
      exceptions: exceptionStore.exceptions,
    },
    toExposedStateInsertions(resolvedInsertions),
  ) as unknown as StateOutput<StateType, {}>;
}
