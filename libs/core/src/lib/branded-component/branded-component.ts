import type { InputSignal, InputSignalWithTransform } from '@angular/core';
import type {
  ExtractServiceHelperDependencyMap,
  SERVICE_HELPER_DEPENDENCIES,
} from '../craft-service';
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
  ...args: unknown[]
) => infer Instance
  ? Instance
  : Component;

type ToPublicSignalType<T> =
  T extends InputSignalWithTransform<infer ReadT, unknown> ? () => ReadT : T;

type InputSignalPropertyKeys<Instance> = Extract<
  {
    [K in keyof Instance]: Instance[K] extends InputSignalWithTransform<
      unknown,
      unknown
    >
      ? K
      : never;
  }[keyof Instance],
  string
>;

export type GetPublicComponentProperties<Component> = {
  [Property in keyof Component as `${Component[Property] extends InputSignal<any> ? Property & string : never}`]: Component[Property];
};

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

type GetPropertiesDepsMap<Input> = Input extends {
  propertiesDeps: infer PropertiesDeps extends object;
}
  ? PropertiesDeps
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

type IsTrackedDependencyNode<Dependency> = Dependency extends {
  scope: infer _Scope;
  dependencies: infer _Dependencies extends object;
}
  ? true
  : false;

type ExtractHelperMetadata<Value> = Value extends {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: infer Metadata;
}
  ? Metadata
  : never;

type NormalizeExtractedDeps<Value> = [
  ExtractServiceHelperDependencyMap<Value>,
] extends [never]
  ? Value extends object
    ? [ExtractHelperMetadata<Value>] extends [never]
      ? IsComponentGenDepsDependency<Value> extends true
        ? GetDepsMap<Value>
        : IsTrackedDependencyNode<Value> extends true
          ? {}
          : {}
      : ExtractHelperMetadata<Value> extends object
        ? ExtractHelperMetadata<Value>
        : {}
    : {}
  : ExtractServiceHelperDependencyMap<Value>;

export type ExtractDeps<Value> = Simplify<NormalizeExtractedDeps<Value>>;

type ComponentMissingProviderRecord<Dependency> =
  IsComponentGenDepsDependency<Dependency> extends true
    ? Dependency extends {
        missingProvider: infer MissingProvider extends object;
      }
      ? MissingProvider
      : {}
    : {};

type DependencyMapValue<Dependency> = Dependency extends object
  ? Dependency[Extract<keyof Dependency, string>]
  : never;

type ContainsNestedDependencyEntries<Dependency> = [
  Extract<
    DependencyMapValue<Dependency>,
    | {
        scope: unknown;
        dependencies: object;
      }
    | {
        deps: object;
        provided: object;
      }
  >,
] extends [never]
  ? false
  : true;

type NestedMissingProviderRecord<Dependency> = Dependency extends object
  ? IsComponentGenDepsDependency<Dependency> extends true
    ? {}
    : IsTrackedDependencyNode<Dependency> extends true
      ? {}
      : ContainsNestedDependencyEntries<Dependency> extends true
        ? MissingProvidersFromDepsMap<Dependency>
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
  | NestedMissingProviderRecord<Dependency>
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

type MissingProvidersFromPropertiesDeps<Input> = Simplify<
  MergeObjectUnion<
    {
      [PropertyName in Extract<
        keyof GetPropertiesDepsMap<Input>,
        string
      >]: GetPropertiesDepsMap<Input>[PropertyName] extends object
        ? MissingProvidersFromDepsMap<GetPropertiesDepsMap<Input>[PropertyName]>
        : {};
    }[Extract<keyof GetPropertiesDepsMap<Input>, string>]
  >
>;

type ComputedMissingProviders<Input> = Simplify<
  Omit<
    Simplify<
      MissingProvidersFromDepsMap<GetDepsMap<Input>> &
        MissingProvidersFromPropertiesDeps<Input> &
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
