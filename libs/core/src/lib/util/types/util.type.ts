import { Type } from '@angular/core';
import { Prettify } from '../util.type';

// It is not possible to get all the properties key of an optional object, so make the optional properties required
export type MakeOptionalPropertiesRequired<
  T,
  K extends keyof T = keyof T,
> = T & {
  [P in K]-?: T[P];
};

export type MergeObject<A, B> = A & B;

export type MergeObjects<F extends unknown[], Acc = {}> = F extends [
  infer First,
  ...infer Rest,
]
  ? First extends object
    ? MergeObjects<Rest, MergeObject<Acc, First>>
    : Prettify<Acc>
  : Prettify<Acc>;

export type InternalType<
  State,
  Params,
  Args,
  IsGroupedResource,
  IsMethod,
  Insertions,
  GroupIdentifier,
  SourceParams,
> = {
  state: State;
  params: Params;
  args: Args;
  isGroupedResource: IsGroupedResource;
  groupIdentifier: GroupIdentifier;
  isMethod?: IsMethod;
  insertions?: Insertions;
  sourceParams?: SourceParams;
};

// from https://github.com/ecyrbe/zodios/blob/main/src/utils.types.ts
/**
 * trick to combine multiple unions of objects into a single object
 * only works with objects not primitives
 * @param union - Union of objects
 * @returns Intersection of objects
 */
export type UnionToIntersection<union> = (
  union extends any ? (k: union) => void : never
) extends (k: infer intersection) => void
  ? intersection
  : never;

/**
 * get last element of union
 * @param Union - Union of any types
 * @returns Last element of union
 */
type GetUnionLast<Union> =
  UnionToIntersection<
    Union extends any ? () => Union : never
  > extends () => infer Last
    ? Last
    : never;

/**
 * Convert union to tuple
 * @param Union - Union of any types, can be union of complex, composed or primitive types
 * @returns Tuple of each elements in the union
 */
export type UnionToTuple<Union, Tuple extends unknown[] = []> = [
  Union,
] extends [never]
  ? Tuple
  : UnionToTuple<
      Exclude<Union, GetUnionLast<Union>>,
      [GetUnionLast<Union>, ...Tuple]
    >;

export type HasChild<T> = T extends any[]
  ? false
  : T extends object
    ? true
    : false;

/**
 * Negates a boolean type.
 */
export type Not<T extends boolean> = T extends true ? false : true;

/**
 * @internal
 */
const secret = Symbol('secret');

/**
 * @internal
 */
type Secret = typeof secret;

/**
 * Checks if the given type is `never`.
 */
export type IsNever<T> = [T] extends [never] ? true : false;

export type IsAny<T> = [T] extends [Secret] ? Not<IsNever<T>> : false;

export type InferInjectedType<T extends Type<unknown>> =
  T extends Type<infer U> ? U : never;
