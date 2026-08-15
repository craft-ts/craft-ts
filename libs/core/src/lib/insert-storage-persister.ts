import { ResourceRef } from '@angular/core';
import type { CraftUnique } from './craft-unique';
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
import { rawReactiveFacade } from './reactive-read';

type StoragePersisterServiceYield = ReturnType<
  typeof StoragePersister
> extends Generator<infer Yielded, any, any>
  ? Yielded
  : never;

export type StoragePersisterIdentity = {
  storeName: string;
  key: string;
};

export type StoragePersisterOptions<
  ResourceState extends object | undefined = object | undefined,
  CacheTime = 300000,
> = {
  waitForParamsSrcToBeEqualToPreviousValue?: boolean;
  cacheTime?: CacheTime;
  staleTime?: number;
  validate?: (value: unknown) => value is ResourceState;
};

/**
 * Persists query, mutation, async-process, or state data through the
 * StoragePersister selected by the current Angular/Craft injector.
 *
 * The identity (`key` + `storeName`) must be wrapped with `craftUnique` so the
 * static graph can guarantee it appears only once in the project.
 */
export function insertStoragePersister<
  GroupIdentifier extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  PreviousInsertionsOutputs,
  StateType,
  QueryExceptions extends ResourceExceptionConstraints,
  const CacheTime = 300000,
>(
  identity: CraftUnique<StoragePersisterIdentity>,
  options?: StoragePersisterOptions<ResourceState, CacheTime>,
): (
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
    const rawContext = rawReactiveFacade(context) as typeof context;
    const persister = yield* StoragePersister();
    const hasResourceById = 'resourceById' in context;
    const hasState = 'state' in context && !('resource' in context);
    const isUsingIdentifier =
      hasResourceById ||
      ('identifier' in context &&
        typeof (context as unknown as ResourceByIdContext).identifier ===
          'function');
    const stateContext = hasState
      ? (rawContext as InsertionStateFactoryContext<
          StateType,
          PreviousInsertionsOutputs
        >)
      : undefined;
    const resourceTarget = hasResourceById
      ? (rawContext as unknown as ResourceByIdContext).resourceById
      : hasState
        ? ({
            status: () => 'local',
            value: () => stateContext!.state(),
            set: (value: unknown) => stateContext!.set(value as StateType),
          } as unknown as ResourceRef<unknown>)
        : (rawContext as unknown as ResourceContext).resource;
    const resourceParamsSrc: () => unknown = hasState
      ? () => undefined
      : (rawContext as unknown as ResourceByIdContext | ResourceContext)
          .resourceParamsSrc;

    if (isUsingIdentifier) {
      persister.addQueryByIdToPersist({
        key: identity.key,
        storeName: identity.storeName,
        cacheTime: (options?.cacheTime as number | undefined) ?? 300000,
        queryByIdResource: resourceTarget as unknown as ResourceByIdRef<
          string,
          unknown,
          unknown
        >,
        queryResourceParamsSrc: resourceParamsSrc as any,
        staleTime: options?.staleTime,
        validate: options?.validate,
      });
    } else {
      persister.addQueryToPersist({
        key: identity.key,
        storeName: identity.storeName,
        cacheTime: (options?.cacheTime as number | undefined) ?? 300000,
        queryResource: resourceTarget as unknown as ResourceRef<unknown>,
        queryResourceParamsSrc: resourceParamsSrc as any,
        waitForParamsSrcToBeEqualToPreviousValue: hasState
          ? false
          : (options?.waitForParamsSrcToBeEqualToPreviousValue ?? true),
        staleTime: options?.staleTime,
        validate: options?.validate,
      });
    }

    return { persister };
  };
}
