import { InsertionStateFactoryContext } from './query.core';
import { EntitiesUtilBrand, IdSelector } from './util/entities-util';
import {
  AccessTypeObjectPropertyByDottedPath,
  DottedPathPathToTuple,
} from './util/types/access-type-object-property-by-dotted-path.type';
import { ObjectDeepPath } from './util/types/object-deep-path-mapper.type';
import { MergeObject, Prettify } from './util/util.type';

type EntitiesUtilsToMap<
  EntityHelperFns,
  Entity,
  K,
  HasStateIdentifier,
  StateIdentifier,
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
          Acc & {
            [key in Name & string]: (
              payload: MergeObject<
                {
                  [key in keyof Payload as `${key extends 'entities' ? never : key & string}`]: key extends 'entity'
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
      ? ObjectDeepPath<State> // todo filter pass that are not array
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
    // todo handle the path feature
  return (
    context: InsertionStateFactoryContext<State, PreviousInsertionsOutputs> & {
      identifier?: StateIdentifier;
    },
  ) => {
    const methods: Record<string, (payload: unknown) => void> = {};

    for (const helperFn of config.methods as Array<
      ((data: Record<string, unknown>) => StateType[]) & { name: string }
    >) {
      const methodName = helperFn.name;

      if (methodName) {
        methods[methodName] = (payload: any) => {
          context.update((state) => {
            let entities = state;
            if ('select' in payload && payload.select) {
              entities = state[payload.select as number] as any[];
              return {
                ...state,
                [payload.select as number]: helperFn({
                  ...(payload as Record<string, unknown>),
                  entities,
                  identifier: config.identifier,
                }),
              } as any;
            }
            return helperFn({
              ...(payload as Record<string, unknown>),
              entities,
              identifier: config.identifier,
            });
          });
        };
      }
    }
 // todo if path map output name
    return methods as Prettify<
      EntitiesUtilsToMap<
        EntityHelperFns,
        StateType,
        K,
        HasStateIdentifier,
        StateIdentifier
      >
    > & {
      testState: State;
      testPath: Path;
    };
  };
}
