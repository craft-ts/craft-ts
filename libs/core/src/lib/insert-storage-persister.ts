import { ResourceRef } from '@angular/core';
import { StoragePersister } from './storage-persister.service';
import {
  InsertionByIdParams,
  InsertionParams,
  InsertionResourceFactoryContext,
  InsertionStateFactoryContext,
  ResourceExceptionConstraints,
} from './query.core';
import { ResourceByIdRef } from './resource-by-id';
import type { QueriesPersister } from './util/persister.type';

type StoragePersisterServiceYield = ReturnType<
  typeof StoragePersister
> extends Generator<infer Yielded, any, any>
  ? Yielded
  : never;

/**
 * Persists query, mutation, async-process, or state data through the
 * StoragePersister selected by the current Angular/Craft injector.
 */
export function insertStoragePersister<
  GroupIdentifier extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  PreviousInsertionsOutputs,
  StateType,
  QueryExceptions extends ResourceExceptionConstraints,
  const CacheTime = 300000,
>(config: {
  storeName: string;
  key: string;
  waitForParamsSrcToBeEqualToPreviousValue?: boolean;
  cacheTime?: CacheTime;
  staleTime?: number;
  validate?: (value: unknown) => value is ResourceState;
}): (
  context: unknown,
) => Generator<
  StoragePersisterServiceYield,
  { persister: QueriesPersister },
  unknown
> {
  return function* (_context: unknown) {
    type ResourceByIdContext = InsertionByIdParams<
      GroupIdentifier,
      ResourceState,
      ResourceParams,
      QueryExceptions,
      PreviousInsertionsOutputs
    >;
    type ResourceContext = InsertionParams<
      ResourceState,
      ResourceParams,
      QueryExceptions,
      PreviousInsertionsOutputs
    >;
    const context = _context as
      | InsertionResourceFactoryContext<
          GroupIdentifier,
          ResourceState,
          ResourceParams,
          QueryExceptions,
          PreviousInsertionsOutputs
        >
      | InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs>;
    const persister = yield* StoragePersister();
    const hasResourceById = 'resourceById' in context;
    const hasState = 'state' in context && !('resource' in context);
    const isUsingIdentifier =
      hasResourceById ||
      ('identifier' in context &&
        typeof (context as unknown as ResourceByIdContext).identifier ===
          'function');
    const stateContext = hasState
      ? (context as InsertionStateFactoryContext<
          StateType,
          PreviousInsertionsOutputs
        >)
      : undefined;
    const resourceTarget = hasResourceById
      ? context.resourceById
      : hasState
        ? ({
            status: () => 'local',
            value: () => stateContext!.state(),
            set: (value: unknown) => stateContext!.set(value as StateType),
          } as unknown as ResourceRef<unknown>)
        : (context as unknown as ResourceContext).resource;
    const resourceParamsSrc: () => unknown = hasState
      ? () => undefined
      : (context as unknown as ResourceByIdContext | ResourceContext)
          .resourceParamsSrc;

    if (isUsingIdentifier) {
      persister.addQueryByIdToPersist({
        key: config.key,
        storeName: config.storeName,
        cacheTime: (config.cacheTime as number | undefined) ?? 300000,
        queryByIdResource: resourceTarget as unknown as ResourceByIdRef<
          string,
          unknown,
          unknown
        >,
        queryResourceParamsSrc: resourceParamsSrc as any,
        staleTime: config.staleTime,
        validate: config.validate,
      });
    } else {
      persister.addQueryToPersist({
        key: config.key,
        storeName: config.storeName,
        cacheTime: (config.cacheTime as number | undefined) ?? 300000,
        queryResource: resourceTarget as unknown as ResourceRef<unknown>,
        queryResourceParamsSrc: resourceParamsSrc as any,
        waitForParamsSrcToBeEqualToPreviousValue: hasState
          ? false
          : (config.waitForParamsSrcToBeEqualToPreviousValue ?? true),
        staleTime: config.staleTime,
        validate: config.validate,
      });
    }

    return { persister };
  };
}
