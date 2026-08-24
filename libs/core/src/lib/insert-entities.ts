import { InsertionStateFactoryContext } from './query.core';
import { EntitiesUtilBrand, IdSelector } from './util/entities-util';
import {
  AccessTypeObjectPropertyByDottedPath,
  DottedPathPathToTuple,
} from './util/types/access-type-object-property-by-dotted-path.type';
import {
  createNestedStateUpdate,
  getNestedStateValue,
} from './util/update-state.util';
import { ObjectDeepPath } from './util/types/object-deep-path-mapper.type';
import { MergeObject, Prettify } from './util/util.type';

type ArrayObjectDeepPath<State extends object> =
  ObjectDeepPath<State> extends infer Path
    ? Path extends string
      ? AccessTypeObjectPropertyByDottedPath<
          State,
          DottedPathPathToTuple<Path>
        > extends Array<any>
        ? Path
        : never
      : never
    : never;

type DottedPathToCamel<Path extends string> =
  Path extends `${infer Head}.${infer Tail}`
    ? `${Head}${Capitalize<DottedPathToCamel<Tail>>}`
    : Path;

type EntitiesUtilsToMap<
  EntityHelperFns,
  Entity,
  K,
  HasStateIdentifier,
  StateIdentifier,
  HasPath,
  Path,
  Acc = {},
> = EntityHelperFns extends [infer First, ...infer Rest]
  ? First extends (data: infer Payload) => infer R
    ? R extends EntitiesUtilBrand<infer Name>
      ? EntitiesUtilsToMap<
          Rest,
          Entity,
          K,
          HasStateIdentifier,
          StateIdentifier,
          HasPath,
          Path,
          Acc & {
            [key in Name as `${HasPath extends true ? `${DottedPathToCamel<Path & string>}${Capitalize<string & key>}` : key & string}`]: (
              payload: MergeObject<
                {
                  [key in Exclude<
                    keyof Payload,
                    'identifier'
                  > as `${key extends 'entities' ? never : key & string}`]: key extends 'entity'
                    ? Entity
                    : key extends 'ids'
                      ? K[]
                      : key extends 'newEntities'
                        ? Entity[]
                        : `Not implemented mapping for ${key & string}`;
                },
                HasStateIdentifier extends true
                  ? {
                      select: StateIdentifier extends (...args: any) => infer R
                        ? R
                        : never;
                    }
                  : {}
              >,
            ) => void;
          }
        >
      : 'No EntitiesBranded Name Detected'
    : false
  : Acc;

/**
 * Creates an insertion that adds entity collection management methods to state, query, or queryParams primitives.
 *
 * Provides type-safe manipulation of arrays of entities with operations like add, remove, update, and upsert.
 * Supports nested properties via dot notation paths and custom entity identifiers.
 *
 * @template State - The state type (array or object containing arrays)
 * @template K - The type of entity identifiers (string or number)
 * @template PreviousInsertionsOutputs - Combined outputs from previous insertions
 * @template EntityHelperFns - Tuple type of entity utility functions to expose
 * @template StateIdentifier - Type of identifier function for parallel queries
 * @template Path - Dot-notation path to nested array (inferred from state structure)
 *
 * @param config - Configuration object
 * @param config.methods - Array of entity utility functions (addOne, removeOne, updateOne, etc.) to expose as methods
 * @param config.identifier - Optional custom function to extract unique ID from entities.
 *                            Defaults to `entity.id` for objects or `entity` for primitives
 * @param config.path - Optional dot-notation path to nested array property (e.g., 'catalog.products').
 *                      Method names are prefixed with camelCase path when provided
 *
 * @returns Insertion function that adds entity management methods to the primitive
 *
 * @example
 * // Basic usage with primitives
 * const tags = yield* state(
 *   [] as string[],
 *   insertEntities({
 *     methods: [addOne, addMany, removeOne],
 *   })
 * ));
 * yield* tags.addOne({ entity: 'typescript' });
 * yield* tags.addMany({ newEntities: ['angular', 'signals'] });
 *
 * @example
 * // With objects having default id property
 * interface Product {
 *   id: string;
 *   name: string;
 *   price: number;
 * }
 * const products = yield* state(
 *   [] as Product[],
 *   insertEntities({
 *     methods: [addOne, setOne, removeOne],
 *   })
 * ));
 * yield* products.addOne({ entity: { id: '1', name: 'Laptop', price: 999 } });
 *
 * @example
 * // With custom identifier
 * interface User {
 *   uuid: string;
 *   name: string;
 * }
 * const users = yield* state(
 *   [] as User[],
 *   insertEntities({
 *     methods: [setOne, removeOne],
 *     identifier: (user) => user.uuid,
 *   })
 * ));
 *
 * @example
 * // With nested path
 * interface Catalog {
 *   total: number;
 *   products: Array<{ id: string; name: string }>;
 * }
 * const catalog = yield* state(
 *   { total: 0, products: [] } as Catalog,
 *   insertEntities({
 *     methods: [addMany, removeOne],
 *     path: 'products',
 *   })
 * ));
 * yield* catalog.productsAddMany({ newEntities: [{ id: '1', name: 'Item' }] });
 *
 * @example
 * // With parallel queries
 * const userQuery = yield* query(
 *   {
 *     params: () => 'userId',
 *     identifier: (params) => params,
 *     loader: async ({ params }) => fetchUserPosts(params),
 *   },
 *   insertEntities({
 *     methods: [addOne],
 *   })
 * ));
 * yield* userQuery.addOne({
 *   select: 'user-123', // Target specific query instance
 *   entity: { id: 'post-1', title: 'New Post' },
 * });
 *
 * @see {@link https://github.com/craft-ts/craft-ts/blob/main/apps/docs/insertions/insert-entities.md | insertEntities Documentation}
 */
export function insertEntities<
  State,
  K extends string | number,
  PreviousInsertionsOutputs,
  const EntityHelperFns extends unknown[],
  StateIdentifier,
  const Path = State extends Array<infer Entity>
    ? never
    : State extends object
      ? ArrayObjectDeepPath<State>
      : never,
  StateType = State extends Array<infer R>
    ? R
    : State extends object
      ? Path extends string
        ? AccessTypeObjectPropertyByDottedPath<
            State,
            DottedPathPathToTuple<Path>
          > extends Array<infer Entity>
          ? Entity
          : never
        : never
      : never,
  HasStateIdentifier = [unknown] extends [StateIdentifier]
    ? false
    : StateIdentifier extends (...args: any) => infer R
      ? [unknown] extends [R]
        ? false
        : true
      : false,
  IsEntityIdentifierOptional = StateType extends { id: NoInfer<K> }
    ? true
    : StateType extends string | number
      ? true
      : false,
>(
  config: {
    methods: EntityHelperFns;
  } & MergeObject<
    IsEntityIdentifierOptional extends true
      ? {
          identifier?: IdSelector<NoInfer<StateType>, NoInfer<K>>;
        }
      : {
          identifier: IdSelector<NoInfer<StateType>, NoInfer<K>>;
        },
    [Path] extends [never]
      ? {}
      : {
          path: Path;
        }
  >,
) {
  return (
    context: InsertionStateFactoryContext<State, PreviousInsertionsOutputs> & {
      identifier?: StateIdentifier;
    },
  ) => {
    const methods: Record<string, (payload: unknown) => void> = {};
    const hasPath = 'path' in config;
    const path = hasPath ? (config as { path: string }).path : undefined;
    const pathKeys = path ? path.split('.') : undefined;
    const pathMethodPrefix = pathKeys
      ? pathKeys.reduce(
          (acc, key, index) =>
            index === 0 ? key : `${acc}${key[0].toUpperCase()}${key.slice(1)}`,
          '',
        )
      : undefined;

    for (const helperFn of config.methods as Array<
      ((data: Record<string, unknown>) => StateType[]) & { name: string }
    >) {
      const helperName = helperFn.name;
      if (!helperName) {
        continue;
      }
      const methodName = hasPath
        ? `${pathMethodPrefix}${helperName[0].toUpperCase()}${helperName.slice(1)}`
        : helperName;

      methods[methodName] = (payload: any) => {
        context.update((state) => {
          const hasSelect = 'select' in payload && payload.select;
          const targetState = hasSelect
            ? (state as any)[payload.select as number]
            : state;
          const entities = pathKeys
            ? getNestedStateValue({
                state: targetState,
                keysPath: pathKeys,
              })
            : targetState;
          const updatedEntities = helperFn({
            ...(payload as Record<string, unknown>),
            entities,
            identifier: config.identifier,
          });

          if (hasSelect) {
            const updatedTargetState = pathKeys
              ? createNestedStateUpdate({
                  state: targetState,
                  keysPath: pathKeys,
                  value: updatedEntities,
                })
              : updatedEntities;
            return {
              ...(state as any),
              [payload.select as number]: updatedTargetState,
            } as any;
          }

          if (pathKeys) {
            return createNestedStateUpdate({
              state,
              keysPath: pathKeys,
              value: updatedEntities,
            });
          }

          return updatedEntities;
        });
      };
    }
    return methods as Prettify<
      EntitiesUtilsToMap<
        EntityHelperFns,
        StateType,
        K,
        HasStateIdentifier,
        StateIdentifier,
        'path' extends keyof typeof config ? true : false,
        Path
      >
    > & {
      testState: State;
      testPath: Path;
      testHasPath: 'path' extends keyof typeof config ? true : false;
    };
  };
}
