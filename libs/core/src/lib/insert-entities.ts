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
  // todo make IsEntityIdentifierOptional mandatory after the path id defined ?
  IsEntityIdentifierOptional = StateType extends { id: NoInfer<K> }
    ? true
    : StateType extends string | number
      ? true
      : false,
>(
  config: {
    methods: EntityHelperFns;
  } & MergeObject<
    // todo identifier should be optional if their is a path and not
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
    // todo if path map output name
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
