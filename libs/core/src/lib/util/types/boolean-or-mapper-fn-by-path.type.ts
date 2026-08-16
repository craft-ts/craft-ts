import { ResourceRef } from '../../host/craft-compat';
import {
  HasChild,
  MakeOptionalPropertiesRequired,
  MergeObject,
  UnionToTuple,
} from './util.type';
import { Prettify } from '../util.type';

/**
 * Does not work with number/symbole keys
 * Does not go into arrays
 * Does not handle optional path
 */
export type BooleanOrMapperFnByPath<
  State extends object,
  QueryState,
  QueryParams
> = Prettify<
  FlatAllObjectDeepPath<
    MakeOptionalPropertiesRequired<State>,
    QueryState,
    QueryParams
  >
>;

type FlatAllObjectDeepPath<
  State extends object,
  QueryState,
  QueryParams
> = UnionToTuple<keyof State> extends string[]
  ? __ObjectDeep<UnionToTuple<keyof State>, State, QueryState, QueryParams>
  : never;

type DefaultObject = {};

// return an union type of all the paths in the state
type __ObjectDeep<
  keys extends string[],
  State,
  QueryState,
  QueryParams,
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
                __ObjectDeep<
                  UnionToTuple<keyof State[Head]>,
                  MakeOptionalPropertiesRequired<State[Head]>,
                  QueryState,
                  QueryParams,
                  MergeObject<
                    Acc,
                    {
                      [key in `${RootPath}${Head & string}`]: NonNullable<
                        State[Head]
                      > extends NonNullable<QueryState>
                        ?
                            | boolean
                            | AssociatedStateMapperFn<
                                QueryState,
                                QueryParams,
                                State[Head]
                              >
                        : AssociatedStateMapperFn<
                            QueryState,
                            QueryParams,
                            State[Head]
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
                MergeObject<
                  Acc,
                  {
                    [key in `${RootPath}${Head & string}`]: NonNullable<
                      State[Head]
                    > extends NonNullable<QueryState>
                      ?
                          | boolean
                          | AssociatedStateMapperFn<
                              QueryState,
                              QueryParams,
                              State[Head]
                            >
                      : AssociatedStateMapperFn<
                          QueryState,
                          QueryParams,
                          State[Head]
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
          MergeObject<
            Acc,
            {
              [key in `${RootPath}${Head & string}`]: NonNullable<
                State[Head]
              > extends NonNullable<QueryState>
                ?
                    | boolean
                    | AssociatedStateMapperFn<
                        QueryState,
                        QueryParams,
                        State[Head]
                      >
                : AssociatedStateMapperFn<QueryState, QueryParams, State[Head]>;
            }
          >,
          RootPath
        >
      : Acc
    : Acc
  : Acc;

export type AssociatedStateMapperFn<QueryState, QueryParams, ResultState> =
  (data: {
    queryResource: ResourceRef<QueryState>;
    queryParams: QueryParams;
  }) => ResultState;
