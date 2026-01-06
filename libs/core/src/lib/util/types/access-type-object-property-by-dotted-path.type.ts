import { MakeOptionalPropertiesRequired } from './util.type';

export type AccessTypeObjectPropertyByDottedPath<
  State extends object,
  DottedPathPathTuple extends string[]
> = DottedPathPathTuple extends [infer Head, ...infer Tail]
  ? Head extends keyof State
    ? Tail extends string[]
      ? Tail['length'] extends 0
        ? State[Head]
        : MakeOptionalPropertiesRequired<
            State[Head]
          > extends infer RequiredStateHead
        ? RequiredStateHead extends object
          ? AccessTypeObjectPropertyByDottedPath<RequiredStateHead, Tail>
          : 'lol'
        : 'Head'
      : State[Head]
    : 'ErrorTypeNotFound'
  : 'ErrorTypeNotFound';

export type DottedPathPathToTuple<
  DottedPath extends string,
  Tuple extends string[] = []
> = DottedPath extends `${infer Head}.${infer Tail}`
  ? DottedPathPathToTuple<Tail, [...Tuple, Head]>
  : [...Tuple, DottedPath];
