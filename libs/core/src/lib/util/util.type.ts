import { Type } from '@angular/core';
import { StoreConfigConstraints } from '../craft';
import { Source } from '../source';
import { ExtractSignalPropsAndMethods } from './extract-signal-props-and-methods';
import { ReadonlySource } from './source.type';
import { SourceBranded } from './util';

export type FilterPrivateFields<T> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K];
};

export type ToConnectableSourceFromInject<Sources> = {
  [K in keyof Sources]: Sources[K] extends Source<infer SourceType>
    ? ReadonlySource<SourceType>
    : never;
};

export type ToConnectableMethodFromInject<Methods> = RemoveIndexSignature<{
  [K in keyof Methods]?: Methods[K] extends (payload: infer Payload) => any
    ? ReadonlySource<Payload>
    : never;
}>;

export type IsUnknown<T> = unknown extends T
  ? [T] extends [unknown]
    ? true
    : false
  : false;

export type RemoveIndexSignature<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K]: T[K];
};

export type IsEmptyObject<T> = keyof T extends never ? true : false;

export type ExcludeCommonKeys<Origin, Target> = {
  [key in keyof Origin as key extends keyof Target ? never : key]: Origin[key];
};

export const STORE_CONFIG_TOKEN = {
  NAME: '_STORE_NAME_',
  PROVIDED_IN: '_STORE_PROVIDED_IN_',
} as const;
export type StoreConfigToken = typeof STORE_CONFIG_TOKEN;

export type ReplaceStoreConfigToken<
  StandaloneOutputName extends string,
  StoreConfig extends StoreConfigConstraints,
> = StandaloneOutputName extends `${infer StoreNamePrefix}${typeof STORE_CONFIG_TOKEN.NAME}${infer StoreNameSuffix}`
  ? ReplaceStoreConfigToken<
      `${StoreNamePrefix}${Capitalize<StoreConfig['name']>}${StoreNameSuffix}`,
      StoreConfig
    >
  : StandaloneOutputName extends `${infer StoreProvidedInPrefix}${typeof STORE_CONFIG_TOKEN.PROVIDED_IN}${infer StoreProvidedInSuffix}`
    ? ReplaceStoreConfigToken<
        `${StoreProvidedInPrefix}${Capitalize<
          StoreConfig['providedIn']
        >}${StoreProvidedInSuffix}`,
        StoreConfig
      >
    : StandaloneOutputName;

export type FilterMethodsBoundToSources<
  Methods extends {},
  Rest,
  MethodPrefix extends string,
  MethodName extends string,
  Acc = {},
> = Rest extends [infer First, ...infer Next]
  ? First extends keyof Methods
    ? Methods[First] extends {
        [Key in MethodName]: infer Method;
      }
      ? [Method] extends [ReadonlySource<infer SourceState>]
        ? FilterMethodsBoundToSources<
            Methods,
            Next,
            MethodPrefix,
            MethodName,
            Acc
          >
        : FilterMethodsBoundToSources<
            Methods,
            Next,
            MethodPrefix,
            MethodName,
            Acc & {
              [K in First as `${MethodPrefix}${Capitalize<string & K>}`]: [
                Method,
              ] extends [Function]
                ? Method
                : never;
            }
          >
      : FilterMethodsBoundToSources<
          Methods,
          Next,
          MethodPrefix,
          MethodName,
          Acc
        >
    : FilterMethodsBoundToSources<Methods, Next, MethodPrefix, MethodName, Acc>
  : Acc;

export type FilterSource<Insertions> = {
  [K in keyof Insertions as Insertions[K] extends SourceBranded
    ? never
    : K]: Insertions[K];
};

// Helper type to defer evaluation and avoid infinite recursion
export type DeferredExtract<Insertions> =
  UnionToTuple<keyof Insertions> extends infer Keys
    ? ExtractSignalPropsAndMethods<
        Insertions,
        Keys,
        { props: {}; methods: Record<string, Function> }
      >
    : never;

export type HasKeys<T> = T extends object
  ? keyof T extends never
    ? false
    : true
  : false;
type _FlatRecord<T> = T[keyof T] extends infer U
  ? { [K in keyof U]: U[K] }
  : never;

export type FlatRecord<T> = Prettify<UnionToIntersection<_FlatRecord<T>>>;

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

export type OmitStrict<T, K extends keyof T> = T extends any
  ? Pick<T, Exclude<keyof T, K>>
  : never;

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

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
