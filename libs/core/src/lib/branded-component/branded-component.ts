import type {
  MergeObjectUnion,
  RequirementScope,
  Simplify,
} from '../craft-service.shared';

export type AngularBrandDeps = {
  injected?: readonly unknown[];
  importDeps?: readonly unknown[];
  providers?: readonly unknown[];
};

type ExtractPublicInstance<Component> = Component extends abstract new (
  ...args: any[]
) => infer Instance
  ? Instance
  : Component;

export type GetPublicComponentProperties<Component> =
  ExtractPublicInstance<Component> extends object
    ? Simplify<
        Pick<
          ExtractPublicInstance<Component>,
          keyof ExtractPublicInstance<Component>
        >
      >
    : never;

export type DerivedService<Service, Tracking extends object> = Simplify<
  Omit<
    Service,
    'usesWholeService' | 'derivedPropertiesUsed' | 'derivedPropertiesExposed'
  > &
    Tracking
>;

type GetDepsMap<Input> = Input extends { deps: infer Deps extends object }
  ? Deps
  : {};

type GetProvidedMap<Input> = Input extends {
  provided: infer Provided extends object;
}
  ? Provided
  : {};

type GetExplicitMissingProviderMap<Input> = Input extends {
  missingProvider: infer MissingProvider extends object;
}
  ? MissingProvider
  : {};

type DependencyChildren<Node> = Node extends {
  dependencies: infer Dependencies extends object;
}
  ? Dependencies
  : {};

type DependencyScope<Node> = Node extends { scope: infer Scope }
  ? Scope
  : never;

type MissingProviderRecordFromDependency<
  Name extends string,
  Dependency,
> = MergeObjectUnion<
  | (DependencyScope<Dependency> extends RequirementScope
      ? {
          [Key in Name]: Dependency;
        }
      : {})
  | MissingProvidersFromDepsMap<DependencyChildren<Dependency>>
  | (Dependency extends {
      missingProvider: infer MissingProvider extends object;
    }
      ? MissingProvider
      : {})
>;

type MissingProvidersFromDepsMap<Deps extends object> = Simplify<
  MergeObjectUnion<
    {
      [Name in Extract<
        keyof Deps,
        string
      >]: MissingProviderRecordFromDependency<Name, Deps[Name]>;
    }[Extract<keyof Deps, string>]
  >
>;

type ComputedMissingProviders<Input> = Simplify<
  Omit<
    Simplify<
      MissingProvidersFromDepsMap<GetDepsMap<Input>> &
        GetExplicitMissingProviderMap<Input>
    >,
    keyof GetProvidedMap<Input>
  >
>;

export type GetDeps<Input extends object> = Simplify<
  Omit<Input, 'missingProvider'> &
    ([keyof ComputedMissingProviders<Input>] extends [never]
      ? {}
      : {
          missingProvider: ComputedMissingProviders<Input>;
        })
>;

export function deps(value: AngularBrandDeps = {}): AngularBrandDeps {
  return value;
}

export function brandAngularSymbol<T extends object>(
  angularSymbol: T,
  _dependencyGroups?: AngularBrandDeps,
): T {
  return angularSymbol;
}
