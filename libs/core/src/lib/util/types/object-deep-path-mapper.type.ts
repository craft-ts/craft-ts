import {
  HasChild,
  MakeOptionalPropertiesRequired,
  UnionToTuple,
} from './util.type';

/**
 * Does not work with number/symbole keys
 * Does not go into arrays
 * Does not handle optional path
 */
export type ObjectDeepPath<State extends object> = Exclude<
  GetAllStatePath<MakeOptionalPropertiesRequired<State>>,
  DefaultUnion
>;

type GetAllStatePath<State extends object> = UnionToTuple<
  keyof State
> extends string[]
  ? __ObjectDeepPath<UnionToTuple<keyof State>, State>
  : never;

type DefaultUnion = '__ROOT';

// todo on the continue pas dans la tail si on tombe sur un objet
// return an union type of all the paths in the state
type __ObjectDeepPath<
  keys extends string[],
  State,
  Acc extends string = DefaultUnion,
  RootPath extends string = ''
> = keys extends [infer Head, ...infer Tail]
  ? Head extends keyof State
    ? HasChild<State[Head]> extends true
      ? keyof State[Head] extends string
        ? UnionToTuple<keyof State[Head]> extends string[]
          ? Tail extends string[]
            ? __ObjectDeepPath<
                Tail,
                MakeOptionalPropertiesRequired<State>,
                __ObjectDeepPath<
                  UnionToTuple<keyof State[Head]>,
                  MakeOptionalPropertiesRequired<State[Head]>,
                  MergeStatePaths<Acc, `${RootPath}${Head & string}`>,
                  `${RootPath}${Head & string}.`
                >,
                RootPath
              >
            : __ObjectDeepPath<
                UnionToTuple<keyof State[Head]>,
                State[Head],
                MergeStatePaths<Acc, `${RootPath}${Head & string}`>,
                `${RootPath}${Head & string}.`
              >
          : Acc
        : Acc
      : Tail extends string[]
      ? __ObjectDeepPath<
          Tail,
          State,
          MergeStatePaths<Acc, `${RootPath}${Head & string}`>,
          RootPath
        >
      : Acc
    : Acc
  : Acc;

type MergeStatePaths<A, B> = A | B;
