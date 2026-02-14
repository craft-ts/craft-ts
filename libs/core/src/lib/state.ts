import {
  isSignal,
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

type StateConfig<State> = State | WritableSignal<State>;

type ParallelStateContext<Params> = {
  params: Params;
};

type ParallelStateValue<State, Insertions> = any;

type ParallelStateSelect<Identifier, State, Insertions> = (
  id: Identifier,
) => ParallelStateValue<State, Insertions> | undefined;

export type ParallelStateOutput<
  Identifier,
  State,
  CreateArgs,
  Insertions = {},
> = {
  (id: Identifier): ParallelStateValue<State, Insertions> | undefined;
  select: ParallelStateSelect<Identifier, State, Insertions>;
  create: (args: CreateArgs) => ParallelStateValue<State, Insertions>;
};

type ParallelStateWithMethodConfig<State, Params, Args, Identifier> = {
  method: (args: Args) => Params;
  identifier?: (params: Params) => Identifier;
  state: (context: ParallelStateContext<Params>) => State;
  params?: never;
  from?: never;
};

type ParallelStateWithParamsConfig<State, Params, Identifier> = {
  params: Signal<Params>;
  identifier?: (params: Params) => Identifier;
  state: (context: ParallelStateContext<Params>) => State;
  method?: never;
  from?: never;
};

type ParallelStateFromArrayParams<Item> = {
  item: Item;
  index: number;
};

type ParallelStateFromObjectParams<Value> = {
  key: string | number;
  value: Value;
};

type ParallelStateWithFromConfig<State, Item, Identifier> = {
  from: Signal<ReadonlyArray<Item> | Record<string, Item>>;
  identifier?: (
    params: ParallelStateFromArrayParams<Item> | ParallelStateFromObjectParams<Item>
  ) => Identifier;
  state: (
    context: ParallelStateContext<
      ParallelStateFromArrayParams<Item> | ParallelStateFromObjectParams<Item>
    >,
  ) => State;
  method?: never;
  params?: never;
};

type ParallelStateConfig<State, Params, Args, Identifier, Item> =
  | ParallelStateWithMethodConfig<State, Params, Args, Identifier>
  | ParallelStateWithParamsConfig<State, Params, Identifier>
  | ParallelStateWithFromConfig<State, Item, Identifier>;

/**
 * Creates a signal state with optional insertions for adding methods and computed properties.
 *
 * The `state` function allows you to create a Signal-based state that can be extended with custom
 * methods and properties through insertions. Each insertion receives a context object with
 * `state`, `set`, `update` methods and previous insertions.
 *
 * @param stateConfig - The initial state value or a WritableSignal (e.g., linkedSignal)
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
export function state<StateType, Params, Args, Identifier>(
  stateConfig: ParallelStateWithMethodConfig<
    StateType,
    Params,
    Args,
    Identifier
  > &
    Required<Pick<ParallelStateWithMethodConfig<StateType, Params, Args, Identifier>, 'identifier'>>,
): ParallelStateOutput<Identifier, StateType, Args>;
export function state<StateType, Params, Args>(
  stateConfig: ParallelStateWithMethodConfig<StateType, Params, Args, Params>,
): ParallelStateOutput<Params, StateType, Args>;
export function state<StateType, Params, Identifier>(
  stateConfig: ParallelStateWithParamsConfig<StateType, Params, Identifier> &
    Required<Pick<ParallelStateWithParamsConfig<StateType, Params, Identifier>, 'identifier'>>,
): ParallelStateOutput<Identifier, StateType, Params>;
export function state<StateType, Params>(
  stateConfig: ParallelStateWithParamsConfig<StateType, Params, Params>,
): ParallelStateOutput<Params, StateType, Params>;
export function state<StateType, Item, Identifier>(
  stateConfig: {
    from: Signal<ReadonlyArray<Item>>;
    identifier: (params: ParallelStateFromArrayParams<Item>) => Identifier;
    state: (context: ParallelStateContext<ParallelStateFromArrayParams<Item>>) => StateType;
    method?: never;
    params?: never;
  },
): ParallelStateOutput<Identifier, StateType, ParallelStateFromArrayParams<Item>>;
export function state<StateType, Item, Identifier>(
  stateConfig: {
    from: Signal<Record<string | number, Item>>;
    identifier: (params: ParallelStateFromObjectParams<Item>) => Identifier;
    state: (context: ParallelStateContext<ParallelStateFromObjectParams<Item>>) => StateType;
    method?: never;
    params?: never;
  },
): ParallelStateOutput<Identifier, StateType, ParallelStateFromObjectParams<Item>>;
export function state<StateType, Item>(
  stateConfig: ParallelStateWithFromConfig<StateType, Item, number> & {
    from: Signal<ReadonlyArray<Item>>;
    identifier?: undefined;
  },
): ParallelStateOutput<number, StateType, ParallelStateFromArrayParams<Item>>;
export function state<StateType, Item>(
  stateConfig: ParallelStateWithFromConfig<StateType, Item, string | number> & {
    from: Signal<Record<string | number, Item>>;
    identifier?: undefined;
  },
): ParallelStateOutput<string | number, StateType, ParallelStateFromObjectParams<Item>>;
export function state<StateType, Params, Args, Identifier, Item>(
  stateConfig: ParallelStateConfig<StateType, Params, Args, Identifier, Item>,
  insertion1: any,
  ...parallelInsertions: any[]
): ParallelStateOutput<Identifier, StateType, Args | Params, any>;
export function state<StateType, Item, Identifier>(
  stateConfig: {
    from: Signal<ReadonlyArray<Item>>;
    identifier: (params: ParallelStateFromArrayParams<Item>) => Identifier;
    state: (context: ParallelStateContext<ParallelStateFromArrayParams<Item>>) => StateType;
    method?: never;
    params?: never;
  },
  insertion1: any,
  ...parallelInsertions: any[]
): ParallelStateOutput<
  Identifier,
  StateType,
  ParallelStateFromArrayParams<Item>,
  any
>;
export function state<StateType, Item, Identifier>(
  stateConfig: {
    from: Signal<Record<string | number, Item>>;
    identifier: (params: ParallelStateFromObjectParams<Item>) => Identifier;
    state: (context: ParallelStateContext<ParallelStateFromObjectParams<Item>>) => StateType;
    method?: never;
    params?: never;
  },
  insertion1: any,
  ...parallelInsertions: any[]
): ParallelStateOutput<
  Identifier,
  StateType,
  ParallelStateFromObjectParams<Item>,
  any
>;
export function state<StateType>(
  stateConfig: StateConfig<StateType>
): StateOutput<StateType, {}>;
export function state<StateType, Insertion1>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>
): StateOutput<StateType, Insertion1>;
export function state<StateType, Insertion1, Insertion2>(
  stateConfig: StateConfig<StateType>,
  insertion1: InsertionsStateFactory<NoInfer<StateType>, Insertion1>,
  insertion2: InsertionsStateFactory<NoInfer<StateType>, Insertion2, Insertion1>
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
  >
): StateOutput<StateType, Insertion1 & Insertion2 & Insertion3>;
export function state<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4
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
  >
): StateOutput<StateType, Insertion1 & Insertion2 & Insertion3 & Insertion4>;
export function state<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5
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
  >
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
  Insertion6
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
  >
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
  Insertion7
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
  >
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
export function state(
  stateConfig: any,
  ...insertions: any[]
): any {
  if (isParallelStateConfig(stateConfig)) {
    return createParallelState(stateConfig, insertions) as any;
  }

  const isSignalState = isSignal(stateConfig);
  const stateSignal = isSignalState
    ? (stateConfig as WritableSignal<any>)
    : signal(stateConfig as any);

  return Object.assign(
    stateSignal,
    (insertions as InsertionsStateFactory<any, {}>[])?.reduce(
      (acc, insert) => {
        return {
          ...acc,
          ...insert({
            state: stateSignal.asReadonly(),
            set: (newState: any) => stateSignal.set(newState),
            update: (updateFn: (currentState: any) => any) =>
              stateSignal.update(updateFn),
            insertions: acc as {},
          } as InsertionStateFactoryContext<any, {}>),
        };
      },
      {} as Record<string, unknown>
    )
  ) as unknown as StateOutput<any, {}>;
}

function isParallelStateConfig(
  stateConfig: unknown,
): stateConfig is ParallelStateConfig<unknown, unknown, unknown, unknown, unknown> {
  if (!stateConfig || typeof stateConfig !== 'object') {
    return false;
  }

  const maybeConfig = stateConfig as { state?: unknown };
  if (typeof maybeConfig.state !== 'function') {
    return false;
  }

  return (
    'method' in maybeConfig ||
    'params' in maybeConfig ||
    'from' in maybeConfig
  );
}

function createParallelState<
  State,
  Params,
  Args,
  Identifier,
  Item,
>(
  config: ParallelStateConfig<State, Params, Args, Identifier, Item>,
  insertions: InsertionsStateFactory<State, any>[] = [],
): ParallelStateOutput<Identifier, State, Args | Params, any> {
  const statesById = new Map<
    Identifier,
    {
      stateSignal: WritableSignal<State>;
      insertions: Record<string, unknown>;
    }
  >();

  const getIdentifier = (params: unknown): Identifier => {
    if ('identifier' in config && typeof config.identifier === 'function') {
      return config.identifier(params as any);
    }

    if (params && typeof params === 'object') {
      if ('key' in params) {
        return (params as { key: Identifier }).key;
      }
      if ('index' in params) {
        return (params as { index: Identifier }).index;
      }
    }

    return params as Identifier;
  };

  const getStateResult = ({
    stateSignal,
    insertions: stateInsertions,
  }: {
    stateSignal: WritableSignal<State>;
    insertions: Record<string, unknown>;
  }) => {
    const currentState = stateSignal();
    if (Object.keys(stateInsertions).length === 0) {
      return currentState;
    }
    if (currentState && typeof currentState === 'object') {
      return Object.assign(currentState as object, stateInsertions);
    }
    return Object.assign({ value: currentState } as object, stateInsertions);
  };

  const getOrCreateState = (params: any): any => {
    const id = getIdentifier(params);
    let stateData = statesById.get(id);
    if (!stateData) {
      const stateSignal = signal(config.state({ params }));
      const stateInsertions = insertions.reduce((acc, insert) => {
        return {
          ...acc,
          ...insert({
            state: stateSignal.asReadonly(),
            set: (newState: State) => stateSignal.set(newState),
            update: (updateFn: (currentState: State) => State) =>
              stateSignal.update(updateFn),
            insertions: acc as any,
          } as InsertionStateFactoryContext<State, any>),
        };
      }, {} as Record<string, unknown>);
      stateData = { stateSignal, insertions: stateInsertions };
      statesById.set(id, stateData);
    }
    return getStateResult(stateData);
  };

  const select = (id: Identifier) => {
    const stateData = statesById.get(id);
    if (!stateData) {
      return undefined;
    }
    return getStateResult(stateData);
  };

  const create = (args: Args | Params): any => {
    const params =
      'method' in config && typeof config.method === 'function'
        ? config.method(args as Args)
        : args;
    return getOrCreateState(params);
  };

  const syncSources = () => {
    if ('params' in config && config.params && isSignal(config.params)) {
      const params = config.params();
      if (params !== undefined && params !== null) {
        getOrCreateState(params);
      }
    }

    if ('from' in config && config.from && isSignal(config.from)) {
      const source = config.from();
      if (!source) {
        return;
      }

      if (Array.isArray(source)) {
        for (let index = 0; index < source.length; index += 1) {
          getOrCreateState({ item: source[index], index });
        }
        return;
      }

      for (const key of Object.keys(source)) {
        const sourceRecord = source as Record<string, Item>;
        const objectKey = Number.isNaN(Number(key)) ? key : Number(key);
        getOrCreateState({ key: objectKey, value: sourceRecord[key] });
      }
    }
  };

  const stateGetter = ((id: Identifier) => {
    syncSources();
    return select(id);
  }) as ParallelStateOutput<Identifier, State, Args | Params, any>;

  stateGetter.select = (id: Identifier) => {
    syncSources();
    return select(id);
  };
  stateGetter.create = (args: Args | Params) => {
    syncSources();
    return create(args);
  };

  return stateGetter;
}
