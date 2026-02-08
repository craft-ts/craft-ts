import { ResourceRef, Signal } from '@angular/core';
import { ResourceByIdRef } from '../resource-by-id';

export interface PersistedQuery {
  key: string;
  queryResource: ResourceRef<any>;
  queryResourceParamsSrc: Signal<unknown>;
  waitForParamsSrcToBeEqualToPreviousValue: boolean;
  cacheTime: number;
}

export interface PersistedQueryById {
  key: string;
  queryByIdResource: ResourceByIdRef<string, unknown, unknown>;
  queryResourceParamsSrc: Signal<unknown>;
  cacheTime: number;
}

export interface QueriesPersister {
  addQueryToPersist(data: PersistedQuery): void;
  addQueryByIdToPersist(data: PersistedQueryById): void;
  clearQuery(queryKey: string): void;
  clearQueryBy(queryKey: string): void;
  clearAllQueries(): void;
  clearAllQueriesById(): void;
  clearAllCache(): void;
}

export type StateWithParamsByIdentifier<
  State,
  Params,
  Identifier extends string,
> = Record<Identifier, { state: State | undefined; params: Params }>;

export type StateWithParams<State, Params> = {
  state: State | undefined;
  params: Params;
};

export type AsyncStateWithParams<
  Identifier extends string | unknown,
  State,
  Params,
> = [Identifier] extends [string]
  ? StateWithParamsByIdentifier<State, Params, Identifier>
  : StateWithParams<State, Params>;

export type AsyncStateManager<
  Identifier extends string | unknown,
  State,
  Params,
> = {
  stateWithParams: Signal<AsyncStateWithParams<Identifier, State, Params>>;
  /**
   * When the async state is loading or invalidated: `true`
   */
  isStable: Signal<boolean>;
  hasIdentifier: boolean;
  setAsyncState: (
    state: AsyncStateWithParams<Identifier, State, Params>,
  ) => void;
};

export interface PersistedState<
  State,
  Params,
  Identifier extends string | unknown,
> {
  prefix: string;
  key: string;
  state: Signal<State>;
  asyncStateManager?: AsyncStateManager<Identifier, State, Params>;
  set: (state: State) => void;
  waitForParamsSrcToBeEqualToPreviousValue: boolean;
  cacheTime: number;
}

export interface StatePersister {
  clear(): void;
}
