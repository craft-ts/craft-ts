import type { InputSignalWithTransform } from '@angular/core';
import type {
  BrandedServiceProvider,
  CompleteServiceDependencyMapFromYielded,
  ExtractServiceHelperDependencyMap,
  SERVICE_HELPER_DEPENDENCIES,
} from '../craft-service';
import type {
  CRAFT_SERVICE_PROVIDER_BRAND,
  MergeObjectUnion,
  RequirementScope,
  Simplify,
} from '../craft-service.shared';

export type AngularBrandDeps = {
  injected?: readonly unknown[];
  importDeps?: readonly unknown[];
  providers?: readonly unknown[];
};

/**
 * Type-only dependency metadata carried by functional Craft components and
 * route fragments. The optional property never needs to exist at runtime.
 */
export declare const CRAFT_COMPONENT_DEPS: unique symbol;

export type ComponentDepsCarrier<ComponentDeps extends object = object> = {
  readonly [CRAFT_COMPONENT_DEPS]?: ComponentDeps;
};

export type ComponentDepsOf<Value> = Value extends object
  ? typeof CRAFT_COMPONENT_DEPS extends keyof Value
    ? Value extends ComponentDepsCarrier<infer ComponentDeps extends object>
      ? ComponentDeps
      : {}
    : {}
  : {};

type ExtractPublicInstance<Component> = Component extends abstract new (
  ...args: unknown[]
) => infer Instance
  ? Instance
  : Component;

// The `WriteT` side of `InputSignalWithTransform` is contravariant, so the
// checks below must use `any` (not `unknown`) or no input property matches.
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

// Accepts either a component class (`typeof MyComponent`) or an instance type,
// keeps only `input()` properties, and exposes each one as a plain callable
// (`() => T`) with the internal `InputSignal` brand symbols stripped.
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

type ComponentProviderNames<Providers> =
  Providers extends readonly (infer Provider)[]
    ? ComponentProviderNames<Provider>
    : Providers extends {
          readonly [CRAFT_SERVICE_PROVIDER_BRAND]?: infer Metadata;
        }
      ? Metadata extends { name: infer Name extends string }
        ? Name
        : never
      : never;

type ComponentProvidedMap<Providers> = {
  [Name in ComponentProviderNames<Providers>]: true;
};

type ComponentTrackedContextValue<Context extends object> = {
  [Key in keyof Context]: Context[Key] extends object
    ? typeof SERVICE_HELPER_DEPENDENCIES extends keyof Context[Key]
      ? Context[Key]
      : never
    : never;
}[keyof Context];

type ComponentContextDeps<Context> = Context extends object
  ? MergeObjectUnion<
      ExtractDeps<ComponentTrackedContextValue<Context>>
    > extends infer Dependencies extends object
    ? string extends keyof Dependencies
      ? {}
      : Dependencies
    : {}
  : {};

/**
 * Builds the complete dependency contract of a functional component from its
 * yielded requests, the tracked helpers returned in its context, its local
 * providers, and its public input/output properties.
 */
export type CraftComponentDependencies<
  Yielded,
  Context,
  Providers,
  PublicProperties extends object,
  TemplateDependencies extends object = never,
> = GetDeps<{
  deps: Simplify<
    CompleteServiceDependencyMapFromYielded<Yielded> &
      Omit<
        ComponentContextDeps<Context>,
        keyof CompleteServiceDependencyMapFromYielded<Yielded>
      >
  >;
  propertiesDeps: {};
  provided: ComponentProvidedMap<Providers>;
  publicProperties: PublicProperties;
  missingProvider: [TemplateDependencies] extends [never]
    ? {}
    : MissingProvidersFromDepsMap<{
        readonly __craft_template_dependencies__: TemplateDependencies;
      }>;
}>;

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
  | (IsTrackedDependencyNode<Dependency> extends true
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
