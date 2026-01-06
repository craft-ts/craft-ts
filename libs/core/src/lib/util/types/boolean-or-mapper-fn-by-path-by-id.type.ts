import { ResourceRef } from '@angular/core';
import {
  HasChild,
  MakeOptionalPropertiesRequired,
  MergeObject,
  UnionToTuple,
} from './util.type';
import { ResourceByIdRef } from '../../resource-by-id';
import { Prettify } from '../util.type';

/**
 * Does not work with number/symbole keys
 * Does not go into arrays
 * Does not handle optional path
 */
export type BooleanOrMapperFnByPathById<
  State extends object,
  QueryState,
  QueryParams,
  QueryIdentifier extends string
> = Prettify<
  FlatAllObjectDeepPath<
    MakeOptionalPropertiesRequired<State>,
    QueryState,
    QueryParams,
    QueryIdentifier
  >
>;

type FlatAllObjectDeepPath<
  State extends object,
  QueryState,
  QueryParams,
  QueryIdentifier extends string
> = UnionToTuple<keyof State> extends string[]
  ? __ObjectDeep<
      UnionToTuple<keyof State>,
      State,
      QueryState,
      QueryParams,
      QueryIdentifier
    >
  : never;

type DefaultObject = {};

// return an union type of all the paths in the state
type __ObjectDeep<
  keys extends string[],
  State,
  QueryState,
  QueryParams,
  QueryIdentifier extends string,
  Acc extends {} = DefaultObject,
  RootPath extends string = ''
> = keys extends [infer Head, ...infer Tail]
  ? Head extends keyof State
    ? HasChild<State[Head]> extends true
      ? keyof State[Head] extends string
        ? UnionToTuple<keyof State[Head]> extends string[]
          ? Tail extends string[]
            ? __ObjectDeep<
                Tail,
                MakeOptionalPropertiesRequired<State>,
                QueryState,
                QueryParams,
                QueryIdentifier,
                __ObjectDeep<
                  UnionToTuple<keyof State[Head]>,
                  MakeOptionalPropertiesRequired<State[Head]>,
                  QueryState,
                  QueryParams,
                  QueryIdentifier,
                  MergeObject<
                    Acc,
                    {
                      [key in `${RootPath}${Head & string}`]: NonNullable<
                        State[Head]
                      > extends NonNullable<QueryState>
                        ?
                            | boolean
                            | AssociatedStateMapperFnById<
                                QueryState,
                                QueryParams,
                                State[Head],
                                QueryIdentifier
                              >
                        : AssociatedStateMapperFnById<
                            QueryState,
                            QueryParams,
                            State[Head],
                            QueryIdentifier
                          >;
                    }
                  >,
                  `${RootPath}${Head & string}.`
                >,
                RootPath
              >
            : __ObjectDeep<
                UnionToTuple<keyof State[Head]>,
                State[Head],
                QueryState,
                QueryParams,
                QueryIdentifier,
                MergeObject<
                  Acc,
                  {
                    [key in `${RootPath}${Head & string}`]: NonNullable<
                      State[Head]
                    > extends NonNullable<QueryState>
                      ?
                          | boolean
                          | AssociatedStateMapperFnById<
                              QueryState,
                              QueryParams,
                              State[Head],
                              QueryIdentifier
                            >
                      : AssociatedStateMapperFnById<
                          QueryState,
                          QueryParams,
                          State[Head],
                          QueryIdentifier
                        >;
                  }
                >,
                `${RootPath}${Head & string}.`
              >
          : Acc
        : Acc
      : Tail extends string[]
      ? __ObjectDeep<
          Tail,
          State,
          QueryState,
          QueryParams,
          QueryIdentifier,
          MergeObject<
            Acc,
            {
              [key in `${RootPath}${Head & string}`]: NonNullable<
                State[Head]
              > extends NonNullable<QueryState>
                ?
                    | boolean
                    | AssociatedStateMapperFnById<
                        QueryState,
                        QueryParams,
                        State[Head],
                        QueryIdentifier
                      >
                : AssociatedStateMapperFnById<
                    QueryState,
                    QueryParams,
                    State[Head],
                    QueryIdentifier
                  >;
            }
          >,
          RootPath
        >
      : Acc
    : Acc
  : Acc;

export type AssociatedStateMapperFnById<
  QueryState,
  QueryParams,
  ResultState,
  QueryIdentifier extends string
> = (data: {
  queryResource: ResourceRef<QueryState>;
  queryParams: QueryParams;
  queryIdentifier: QueryIdentifier;
  queryResources: ResourceByIdRef<QueryIdentifier, QueryState, QueryParams>;
}) => ResultState;
