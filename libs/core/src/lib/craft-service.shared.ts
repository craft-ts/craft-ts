export const SERVICE_ROOT_EXPOSURE_KEY = '$self' as const;

export type Simplify<ObjectType> = {
  [Key in keyof ObjectType]: ObjectType[Key];
} & {};

export type ConcreteServiceScope =
  | 'global'
  | 'toProvide'
  | 'manuallyProvidedAtRoot'
  | 'function';

export type RealCapableScope = 'toProvide' | 'manuallyProvidedAtRoot';

export type RequirementScope = 'toProvide' | 'manuallyProvidedAtRoot';

export type CallableShell<Value> = Value extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;

export type RootExposureKey = typeof SERVICE_ROOT_EXPOSURE_KEY;

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

export type UnionToTuple<
  Union,
  Tuple extends unknown[] = [],
> = [Union] extends [never]
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

export type DependencyNodeScope<Node> = Node extends { scope: infer Scope }
  ? Scope
  : never;

export type FlattenDependencyTree<
  Tree extends object,
> = Simplify<
  MergeObjectUnion<
    {
      [Name in Extract<keyof Tree, string>]:
        | { [Key in Name]: Tree[Name] }
        | FlattenDependencyTree<DependencyTreeChildren<Tree[Name]>>;
    }[Extract<keyof Tree, string>]
  >
>;
