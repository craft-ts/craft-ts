import type { InputSignalWithTransform } from '@angular/core';
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

type ToPublicSignalType<T> =
  T extends InputSignalWithTransform<infer ReadT, any> ? () => ReadT : T;

type InputSignalPropertyKeys<Instance> = Extract<
  {
    [K in keyof Instance]: Instance[K] extends InputSignalWithTransform<
      any,
      any
    >
      ? K
      : never;
  }[keyof Instance],
  string
>;

export type GetPublicComponentProperties<Component> =
  ExtractPublicInstance<Component> extends object
    ? Simplify<{
        [K in InputSignalPropertyKeys<
          ExtractPublicInstance<Component>
        >]: ToPublicSignalType<ExtractPublicInstance<Component>[K]>;
      }>
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

type IsRequirementScopedServiceDependency<Dependency> = [
  DependencyScope<Dependency>,
] extends [never]
  ? false
  : DependencyScope<Dependency> extends RequirementScope
    ? true
    : false;

type IsComponentGenDepsDependency<Dependency> = Dependency extends {
  deps: infer _Deps extends object;
  provided: infer _Provided extends object;
}
  ? true
  : false;

type ComponentMissingProviderRecord<Dependency> =
  IsComponentGenDepsDependency<Dependency> extends true
    ? Dependency extends {
        missingProvider: infer MissingProvider extends object;
      }
      ? MissingProvider
      : {}
    : {};

type DirectMissingProviderRecord<Name extends string, Dependency> =
  IsRequirementScopedServiceDependency<Dependency> extends true
    ? {
        [Key in Name]: Dependency;
      }
    : {};

type MissingProviderRecordFromDependency<
  Name extends string,
  Dependency,
> = MergeObjectUnion<
  | DirectMissingProviderRecord<Name, Dependency>
  | ComponentMissingProviderRecord<Dependency>
  | (IsRequirementScopedServiceDependency<Dependency> extends true
      ? MissingProvidersFromDepsMap<DependencyChildren<Dependency>>
      : {})
>;

export type MissingProvidersFromDepsMap<Deps extends object> = Simplify<
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
  Omit<Input, 'missingProvider'> & {
    missingProvider: ComputedMissingProviders<Input>;
  }
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
