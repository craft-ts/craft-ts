import type { REACTIVE_VALUE_TYPE } from './reactive-read';

export const SERVICE_ROOT_EXPOSURE_KEY = '$self' as const;
export const SERVICE_PROVIDED_INPUT_KEY = '$provided' as const;
export const CRAFT_SERVICE_PROVIDER_BRAND = Symbol(
  'craft-service-provider-brand',
);
/** Type-only brand; it is carried by Craft provider return types, not emitted. */
export declare const CRAFT_SERVICE_PROVIDER_TYPE_BRAND: unique symbol;

export type Simplify<ObjectType> = {
  [Key in keyof ObjectType]: ObjectType[Key];
} & {};

export type ConcreteServiceScope =
  | 'global'
  | 'toProvide'
  | 'manuallyProvidedAtRoot'
  | 'function';

export type RealCapableScope = 'toProvide' | 'manuallyProvidedAtRoot';

export type RequirementScope =
  | 'toProvide'
  | 'manuallyProvidedAtRoot'
  | 'abstract';

/**
 * The callable shape a mock has to provide for a service's root value.
 *
 * A yieldable reader carries two call signatures — the `yield*` generator and
 * the raw signal read — and `infer` picks the LAST one. Consumers read a reader
 * either way (`craftUse(counter())` or `yield* counter()`), so a reader mock is
 * allowed to be either; keeping only the signal form left `yield*` consumers
 * iterating the returned value instead of driving a generator.
 */
export type CallableShell<Value> =
  typeof REACTIVE_VALUE_TYPE extends keyof Value
    ? Value extends { readonly [REACTIVE_VALUE_TYPE]: infer State }
      ? (() => State) | (() => Generator<unknown, State, unknown>)
      : never
    : Value extends (...args: infer Args) => infer Result
      ? (...args: Args) => Result
      : never;

export type RootExposureKey = typeof SERVICE_ROOT_EXPOSURE_KEY;
export type ProvidedInputKey = typeof SERVICE_PROVIDED_INPUT_KEY;

export type UnionToIntersection<Union> = (
  Union extends any ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

export type GetUnionLast<Union> =
  UnionToIntersection<
    Union extends any ? () => Union : never
  > extends () => infer Last
    ? Last
    : never;

export type UnionToTuple<Union, Tuple extends unknown[] = []> = [
  Union,
] extends [never]
  ? Tuple
  : UnionToTuple<
      Exclude<Union, GetUnionLast<Union>>,
      [GetUnionLast<Union>, ...Tuple]
    >;

export type MergeObjectUnion<Union> = [Union] extends [never]
  ? {}
  : Simplify<UnionToIntersection<Union>>;

export type DependencyTreeChildren<Node> = Node extends {
  dependencies: infer Dependencies extends object;
}
  ? Dependencies
  : {};

export type DependencyNodeScope<Node> = Node extends { providedIn: infer Scope }
  ? Scope
  : never;

export type FlattenDependencyTree<Tree extends object> = Simplify<
  MergeObjectUnion<
    {
      [Name in Extract<keyof Tree, string>]:
        | { [Key in Name]: Tree[Name] }
        | FlattenDependencyTree<DependencyTreeChildren<Tree[Name]>>;
    }[Extract<keyof Tree, string>]
  >
>;
