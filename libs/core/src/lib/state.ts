import {
  computed,
  effect,
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
import { FilterSource, IsEmptyObject } from './util/util.type';

export type StateOutput<StateType, Insertions> = MergeObject<
  Signal<StateType>,
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>
>;

type ParallelStateConfigShape = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: (...args: any[]) => unknown;
} & ({ method: unknown } | { params: unknown } | { from: unknown });

type NonParallelState<State> = State extends ParallelStateConfigShape
  ? never
  : State;

type StateConfig<State> = NonParallelState<State> | Signal<State>;

type ParallelStateId = string | number | symbol;

export type ParallelStateItemOutput<StateType, Insertions> = MergeObject<
  StateType,
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>
>;

export type InsertOnEachStateFactory<
  StateType,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs>,
) => InsertionsOutputs;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParallelStateById<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
> = {
  create: (params: Params) => WritableSignal<StateType>;
  select: (id: GroupIdentifier) => WritableSignal<StateType> | undefined;
  state: Signal<Partial<Record<GroupIdentifier, StateType>>>;
};

export type InsertionParallelStateFactoryContext<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  PreviousInsertionsOutputs,
> = {
  stateById: ParallelStateById<StateType, Params, GroupIdentifier>;
  insertions: keyof PreviousInsertionsOutputs extends string
    ? PreviousInsertionsOutputs
    : never;
};

export type InsertionsParallelStateFactory<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionParallelStateFactoryContext<
    StateType,
    Params,
    GroupIdentifier,
    PreviousInsertionsOutputs
  >,
) => InsertionsOutputs;

type ParallelStateBaseConfig<StateType, Params> = {
  state: (context: { params: Params }) => StateType;
};

type ParallelStateMethodConfig<StateType, Params, MethodArgs> =
  ParallelStateBaseConfig<StateType, Params> &
    Record<string, unknown> & {
      method: (args: MethodArgs) => Params;
      identifier?: (
        params: NoInfer<NonNullable<NoInfer<Params>>>,
      ) => ParallelStateId;
    };

type ParallelStateParamsConfig<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
> = ParallelStateBaseConfig<StateType, Params> &
  Record<string, unknown> & {
    params: Signal<Params>;
    identifier: (
      params: NoInfer<NonNullable<NoInfer<Params>>>,
    ) => GroupIdentifier;
  };

type ParallelStateListItem<T> = { item: T; index: number };
type ParallelStateObjectEntry<T extends object> = {
  key: string | number;
  value: T[keyof T];
};

type ParallelStateFromParams<From extends readonly unknown[] | object> =
  From extends readonly (infer T)[]
    ? ParallelStateListItem<T>
    : From extends object
      ? ParallelStateObjectEntry<From>
      : never;

type ParallelStateFromConfig<
  StateType,
  From extends readonly unknown[] | object,
  GroupIdentifier extends ParallelStateId,
> = ParallelStateBaseConfig<StateType, ParallelStateFromParams<From>> & {
  from: Signal<From>;
  identifier: (
    params: ParallelStateFromParams<NoInfer<From>>,
  ) => GroupIdentifier;
} & Record<string, unknown>;

type ParallelStateConfig<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId,
  From extends readonly unknown[] | object,
> =
  | ParallelStateMethodConfig<StateType, Params, MethodArgs>
  | ParallelStateParamsConfig<StateType, Params, GroupIdentifier>
  | ParallelStateFromConfig<StateType, From, GroupIdentifier>;

type ParallelStateOutputWithCreate<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId,
  Insertions,
> = MergeObject<
  {
    create: (args: MethodArgs) => StateType;
    select: (id: GroupIdentifier) => StateType | undefined;
  },
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>
>;

type ParallelStateOutputCallable<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  Insertions,
> = MergeObject<
  {
    (id: GroupIdentifier): StateType | undefined;
    select: (id: GroupIdentifier) => StateType | undefined;
  },
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>
>;

export function insertSelectItem<
  StateType extends object,
  Params = unknown,
  GroupIdentifier extends ParallelStateId = ParallelStateId,
  Insertions1 = {},
>(
  insertion1: InsertOnEachStateFactory<StateType, Insertions1>,
): InsertionsParallelStateFactory<
  StateType,
  Params,
  GroupIdentifier,
  {
    selectItem: (
      id: GroupIdentifier,
    ) => ParallelStateItemOutput<StateType, Insertions1> | undefined;
  }
>;
export function insertSelectItem<
  StateType extends object,
  Params = unknown,
  GroupIdentifier extends ParallelStateId = ParallelStateId,
  Insertions1 = {},
  Insertions2 = {},
>(
  insertion1: InsertOnEachStateFactory<StateType, Insertions1>,
  insertion2: InsertOnEachStateFactory<StateType, Insertions2, Insertions1>,
): InsertionsParallelStateFactory<
  StateType,
  Params,
  GroupIdentifier,
  {
    selectItem: (
      id: GroupIdentifier,
    ) =>
      | ParallelStateItemOutput<StateType, Insertions1 & Insertions2>
      | undefined;
  }
>;
export function insertSelectItem<
  StateType extends object,
  Params = unknown,
  GroupIdentifier extends ParallelStateId = ParallelStateId,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: InsertOnEachStateFactory<StateType, any, any>[]
): InsertionsParallelStateFactory<
  StateType,
  Params,
  GroupIdentifier,
  {
    selectItem: (id: GroupIdentifier) => unknown;
  }
> {
  return ({ stateById }) => {
    const selectedStateById = new Map<GroupIdentifier, unknown>();

    const selectItem = (id: GroupIdentifier) => {
      const selectedState = selectedStateById.get(id);
      if (selectedState) {
        return selectedState;
      }

      const selectedStateSignal = stateById.select(id);
      if (!selectedStateSignal) {
        return undefined;
      }

      const readonlyStateSignal =
        'asReadonly' in selectedStateSignal &&
        typeof selectedStateSignal.asReadonly === 'function'
          ? selectedStateSignal.asReadonly()
          : (selectedStateSignal as Signal<StateType>);

      const insertionsOutput = insertions.reduce(
        (acc, insertion) => ({
          ...acc,
          ...insertion({
            state: readonlyStateSignal,
            set: (newState: StateType) => {
              selectedStateSignal.set(newState);
              return newState;
            },
            update: (updateFn: (currentState: StateType) => StateType) => {
              selectedStateSignal.update(updateFn);
              return selectedStateSignal();
            },
            insertions: acc as never,
          }),
        }),
        {} as Record<string, unknown>,
      );

      const stateProxy = new Proxy(insertionsOutput, {
        get(target, property, receiver) {
          if (Reflect.has(target, property)) {
            return Reflect.get(target, property, receiver);
          }

          const stateValue = selectedStateSignal();
          if (!stateValue || typeof stateValue !== 'object') {
            return undefined;
          }

          return Reflect.get(stateValue as object, property);
        },
      });

      selectedStateById.set(id, stateProxy);
      return stateProxy;
    };

    return { selectItem };
  };
}

/**
 * Creates a signal state with optional insertions for adding methods and computed properties.
 *
 * The `state` function allows you to create a Signal-based state that can be extended with custom
 * methods and properties through insertions. Each insertion receives a context object with
 * `state`, `set`, `update` methods and previous insertions.
 *
 * Parallel states are also supported using one of these configs:
 * - `{ method, state }`: expose `create(args)` and `select(id)`
 * - `{ params, identifier, state }`: auto-create state from params signal
 * - `{ from, identifier, state }`: auto-create states from a list/object signal
 *
 * @remarks
 * For the best TypeScript inference, pass Angular `Signal` values (e.g. `signal`, `linkedSignal`)
 * rather than manually widening to `WritableSignal`. This avoids some overload inference limits.
 *
 * @param stateConfig - The initial state value, a Signal (e.g., linkedSignal), or a parallel state config
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
 *
 * @example
 * // Parallel states from args
 * const todosById = state(
 *   {
 *     method: (id: number) => id,
 *     state: ({ params: id }) => ({ id, done: false }),
 *   },
 *   ({ stateById }) => ({
 *     toggle: (id: number) =>
 *       stateById.select(id)?.update((todo) => ({ ...todo, done: !todo.done })),
 *   }),
 * );
 * todosById.create(1);
 * todosById.toggle(1);
 */
export function state<StateType>(
  stateConfig: StateConfig<StateType>,
): StateOutput<StateType, {}>;
export function state<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId = Params & ParallelStateId,
>(
  stateConfig: ParallelStateMethodConfig<StateType, Params, MethodArgs>,
): ParallelStateOutputWithCreate<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier,
  {}
>;
export function state<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
>(
  stateConfig: ParallelStateParamsConfig<StateType, Params, GroupIdentifier>,
): ParallelStateOutputCallable<StateType, Params, GroupIdentifier, {}>;
export function state<
  StateType,
  From extends readonly unknown[] | object,
  GroupIdentifier extends ParallelStateId,
>(
  stateConfig: ParallelStateFromConfig<StateType, From, GroupIdentifier>,
): ParallelStateOutputCallable<
  StateType,
  ParallelStateFromParams<From>,
  GroupIdentifier,
  {}
>;
export function state<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId = Params & ParallelStateId,
  Insertion1 = {},
>(
  stateConfig: ParallelStateMethodConfig<StateType, Params, MethodArgs>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
): ParallelStateOutputWithCreate<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier,
  Insertion1
>;
export function state<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
>(
  stateConfig: ParallelStateParamsConfig<StateType, Params, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
): ParallelStateOutputCallable<StateType, Params, GroupIdentifier, Insertion1>;
export function state<
  StateType,
  From extends readonly unknown[] | object,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
>(
  stateConfig: ParallelStateFromConfig<StateType, From, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
): ParallelStateOutputCallable<
  StateType,
  ParallelStateFromParams<From>,
  GroupIdentifier,
  Insertion1
>;
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
export function state<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId = Params & ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
>(
  stateConfig: ParallelStateMethodConfig<StateType, Params, MethodArgs>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
): ParallelStateOutputWithCreate<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier,
  Insertion1 & Insertion2
>;
export function state<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId = Params & ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
>(
  stateConfig: ParallelStateMethodConfig<StateType, Params, MethodArgs>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): ParallelStateOutputWithCreate<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
>;
export function state<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId = Params & ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
>(
  stateConfig: ParallelStateMethodConfig<StateType, Params, MethodArgs>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): ParallelStateOutputWithCreate<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function state<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier extends ParallelStateId = Params & ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
  Insertion5 = {},
>(
  stateConfig: ParallelStateMethodConfig<StateType, Params, MethodArgs>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): ParallelStateOutputWithCreate<
  StateType,
  Params,
  MethodArgs,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function state<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
>(
  stateConfig: ParallelStateParamsConfig<StateType, Params, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
): ParallelStateOutputCallable<
  StateType,
  Params,
  GroupIdentifier,
  Insertion1 & Insertion2
>;
export function state<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
>(
  stateConfig: ParallelStateParamsConfig<StateType, Params, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): ParallelStateOutputCallable<
  StateType,
  Params,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
>;
export function state<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
>(
  stateConfig: ParallelStateParamsConfig<StateType, Params, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): ParallelStateOutputCallable<
  StateType,
  Params,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function state<
  StateType,
  Params,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
  Insertion5 = {},
>(
  stateConfig: ParallelStateParamsConfig<StateType, Params, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<Params>,
    NoInfer<GroupIdentifier>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): ParallelStateOutputCallable<
  StateType,
  Params,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function state<
  StateType,
  From extends readonly unknown[] | object,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
>(
  stateConfig: ParallelStateFromConfig<StateType, From, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
): ParallelStateOutputCallable<
  StateType,
  ParallelStateFromParams<From>,
  GroupIdentifier,
  Insertion1 & Insertion2
>;
export function state<
  StateType,
  From extends readonly unknown[] | object,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
>(
  stateConfig: ParallelStateFromConfig<StateType, From, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): ParallelStateOutputCallable<
  StateType,
  ParallelStateFromParams<From>,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
>;
export function state<
  StateType,
  From extends readonly unknown[] | object,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
>(
  stateConfig: ParallelStateFromConfig<StateType, From, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): ParallelStateOutputCallable<
  StateType,
  ParallelStateFromParams<From>,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function state<
  StateType,
  From extends readonly unknown[] | object,
  GroupIdentifier extends ParallelStateId,
  Insertion1 = {},
  Insertion2 = {},
  Insertion3 = {},
  Insertion4 = {},
  Insertion5 = {},
>(
  stateConfig: ParallelStateFromConfig<StateType, From, GroupIdentifier>,
  insertion1: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion1
  >,
  insertion2: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsParallelStateFactory<
    NoInfer<StateType>,
    NoInfer<ParallelStateFromParams<From>>,
    NoInfer<GroupIdentifier>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): ParallelStateOutputCallable<
  StateType,
  ParallelStateFromParams<From>,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function state<StateType>(stateConfig: any, ...insertions: any[]): any {
  const isParallelStateConfig =
    typeof stateConfig === 'object' &&
    stateConfig !== null &&
    'state' in stateConfig &&
    ('method' in stateConfig ||
      'params' in stateConfig ||
      'from' in stateConfig);

  if (isParallelStateConfig) {
    const parallelConfig = stateConfig as ParallelStateConfig<
      StateType,
      unknown,
      unknown,
      ParallelStateId,
      readonly unknown[] | object
    >;
    const statesById = signal<
      Partial<Record<ParallelStateId, WritableSignal<StateType>>>
    >({});

    const getIdFromParams = (params: unknown): ParallelStateId => {
      if ('identifier' in parallelConfig && parallelConfig.identifier) {
        return parallelConfig.identifier(params as never);
      }
      return params as ParallelStateId;
    };

    const createForParams = (params: unknown): WritableSignal<StateType> => {
      const id = getIdFromParams(params);
      const existingState = statesById()[id];
      if (existingState) {
        return existingState;
      }

      const createdState = signal(parallelConfig.state({ params } as never));
      statesById.update((current) => ({
        ...current,
        [id]: createdState,
      }));
      return createdState;
    };

    const stateById: ParallelStateById<StateType, unknown, ParallelStateId> = {
      create: (params) => createForParams(params),
      select: (id) => statesById()[id],
      state: signal({}) as Signal<Partial<Record<ParallelStateId, StateType>>>,
    };

    stateById.state = computed(() => {
      const allStates = statesById();
      const nextState: Partial<Record<ParallelStateId, StateType>> = {};
      for (const [key, stateSignal] of Object.entries(allStates)) {
        if (stateSignal) {
          nextState[key] = stateSignal();
        }
      }
      return nextState;
    });

    if ('params' in parallelConfig) {
      effect(() => {
        const params = (parallelConfig.params as Signal<unknown>)();
        if (params === undefined || params === null) {
          return;
        }
        createForParams(params);
      });
    }

    if ('from' in parallelConfig) {
      effect(() => {
        const sourceValue = (parallelConfig.from as Signal<unknown>)();

        if (Array.isArray(sourceValue)) {
          sourceValue.forEach((item, index) => {
            createForParams({ item, index });
          });
          return;
        }

        if (sourceValue && typeof sourceValue === 'object') {
          Object.entries(sourceValue).forEach(([key, value]) => {
            createForParams({
              key,
              value,
            });
          });
        }
      });
    }

    const insertionsOutput = (
      insertions as InsertionsParallelStateFactory<
        NoInfer<StateType>,
        unknown,
        ParallelStateId,
        {}
      >[]
    )?.reduce(
      (acc, insert) => ({
        ...acc,
        ...insert({
          stateById,
          insertions: acc as {},
        }),
      }),
      {} as Record<string, unknown>,
    );

    if ('method' in parallelConfig) {
      const parallelStateRef = {
        create: (args: unknown) => {
          const params = (parallelConfig.method as (args: unknown) => unknown)(
            args,
          );
          const createdState = createForParams(params);
          return createdState();
        },
        select: (id: ParallelStateId) => stateById.select(id)?.(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Object.assign(parallelStateRef, insertionsOutput) as any;
    }

    const parallelStateCallable = Object.assign(
      (id: ParallelStateId) => stateById.select(id)?.(),
      {
        select: (id: ParallelStateId) => stateById.select(id)?.(),
      },
      insertionsOutput,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return parallelStateCallable as any;
  }

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

  return Object.assign(
    stateSignal,
    (insertions as InsertionsStateFactory<StateType, {}>[])?.reduce(
      (acc, insert) => {
        return {
          ...acc,
          ...insert({
            state: readonlyStateSignal,
            set: (newState: StateType) => stateSignal.set(newState),
            update: (updateFn: (currentState: StateType) => StateType) =>
              stateSignal.update(updateFn),
            insertions: acc as {},
          } as InsertionStateFactoryContext<StateType, {}>),
        };
      },
      {} as Record<string, unknown>,
    ),
  ) as unknown as StateOutput<StateType, {}>;
}
