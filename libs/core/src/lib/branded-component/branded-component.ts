import type { InputSignalWithTransform } from '../host/craft-compat';
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

/**
 * Type-only dependency metadata carried by functional Craft components and
 * route fragments. The optional property never needs to exist at runtime.
 */
export declare const CRAFT_COMPONENT_DEPS: unique symbol;

export type ComponentDepsCarrier<ComponentDeps extends object = object> = {
  readonly [CRAFT_COMPONENT_DEPS]?: ComponentDeps;
};

/** Type-only exception contract carried by functional components and routes. */
export declare const CRAFT_COMPONENT_EXCEPTIONS: unique symbol;

export type ComponentExceptionsCarrier<Exceptions extends string = string> = {
  readonly [CRAFT_COMPONENT_EXCEPTIONS]?: Exceptions;
};

type NarrowComponentExceptions<Exceptions> = [Exceptions] extends [string]
  ? string extends Exceptions
    ? never
    : Exceptions
  : never;

export type ComponentExceptionsOf<Value> = Value extends object
  ? typeof CRAFT_COMPONENT_EXCEPTIONS extends keyof Value
    ? Value extends ComponentExceptionsCarrier<infer Exceptions>
      ? NarrowComponentExceptions<Exceptions>
      : never
    : never
  : never;

/**
 * The `missingProvider` entry that stands for a dependency contract nobody can
 * read any more.
 *
 * It is spelled as a sentence because it ends up in DI error lists, and it is a
 * string key on purpose: like any other missing provider it travels from a
 * child to every parent that renders it, through the same merge, so one erased
 * child is enough to keep the whole tree from being proven. No provider is ever
 * registered under that name, so nothing can discharge it by accident.
 */
export type UnknownComponentContractKey =
  'unknown component dependency contract (not a component, or a component typed by hand; seal it with sealComponent(Component) instead)';

/** What the {@link UnknownComponentContractKey} entry holds. */
export interface UnknownComponentContractRequirement {
  readonly unknownComponentContract: true;
}

/**
 * The dependency contract of a component whose real contract was lost.
 *
 * It is what `CraftComponent<Props>` (no contract argument) carries, and what
 * `ComponentDepsOf` answers for a value that is not a component. Every real
 * contract is assignable to it — the key is optional — so annotating a
 * component this way still compiles, but the DI proof of that component and of
 * every component rendering it fails closed instead of answering `true`.
 */
export type UnknownComponentDependencies = {
  deps: {};
  propertiesDeps: {};
  provided: {};
  publicProperties: {};
  missingProvider: UnknownComponentContractMissingProviders;
};

type UnknownComponentContractMissingProviders = {
  readonly [Key in UnknownComponentContractKey]?: UnknownComponentContractRequirement;
} & {
  // Keeps this map from being a "weak" type (all properties optional), which
  // TypeScript would refuse to receive a map with no key in common — that is,
  // every real missing-provider map. A symbol index is invisible to the string
  // keys the DI checks read.
  readonly [unknownContractTag: symbol]: unknown;
};

/**
 * The dependency contract of a component that depends on nothing, for a
 * component typed by hand on purpose (the router outlet, whose routes are
 * checked on their own). Unlike `{}`, it is a contract `RouteCheckedDI` can
 * prove.
 */
export type EmptyComponentDependencies = {
  deps: {};
  propertiesDeps: {};
  provided: {};
  publicProperties: {};
  missingProvider: {};
};

export type ComponentDepsOf<Value> = Value extends {
  readonly [CRAFT_COMPONENT_DEPS]?: infer ComponentDeps extends object;
}
  ? typeof CRAFT_COMPONENT_DEPS extends keyof Value
    ? ComponentDeps
    : // Not a component (`typeof import('./page')` instead of its `default`,
      // a loader, a widened value): nothing to prove, so nothing is proven.
      UnknownComponentDependencies
  : UnknownComponentDependencies;

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

type DependencyScope<Node> = Node extends { providedIn: infer Scope }
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
  providedIn: infer _Scope;
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
 * One key/value pair of a sealed dependency map.
 *
 * Declared as an interface on purpose: once its arguments are resolved, a
 * reference to it carries nothing but those arguments, so instantiating it
 * never walks back into the types the pair was read from.
 */
interface SealedDependencyEntry<Key, Value> {
  readonly key: Key;
  readonly value: Value;
}

type SealedDependencyEntries<Map> = {
  [Key in keyof Map]: SealedDependencyEntry<Key, Map[Key]>;
}[keyof Map];

type DependencyMapFromSealedEntries<Entries> = {
  [Entry in Entries as Entry extends SealedDependencyEntry<
    infer Key extends PropertyKey,
    unknown
  >
    ? Key
    : never]: Entry extends SealedDependencyEntry<PropertyKey, infer Value>
    ? Value
    : never;
};

type IsAnyDependencyMap<Value> = 0 extends 1 & Value ? true : false;

/**
 * Rebuilds a dependency map from its resolved entries.
 *
 * The result has the same keys and values as `Map`, but it no longer remembers
 * how `Map` was computed. That matters at component boundaries: a contract
 * computed from a template keeps, as type arguments, the whole tree the
 * template returned — every nested child component, its own template and so
 * on. Each time a parent instantiates a type that contains that contract,
 * TypeScript walks those arguments again, one level deeper per nested
 * component, until it reports TS2589 (issue #40). A sealed map only refers to
 * its resolved keys and values, so the walk stops at the component boundary.
 */
export type SealDependencyMap<Map> =
  IsAnyDependencyMap<Map> extends true
    ? Map
    : [Map] extends [never]
      ? never
      : UnknownComponentContractKey extends keyof Map
        ? // The unknown-contract entry stays optional through the seal: every
          // real contract must remain assignable to the contract it marks,
          // including after `.pipe(...)` recomputed both.
          SealDependencyMapOf<Omit<Map, UnknownComponentContractKey>> &
            UnknownComponentDependencies['missingProvider']
        : SealDependencyMapOf<Map>;

// The entries are built by an inline conditional, not through
// `SealedDependencyEntries<Map>`: a union produced by a type alias keeps that
// alias and its arguments, and here the argument is the template's whole
// dependency tree. The sealed map would then remember exactly what it is meant
// to forget, and every instantiation of a type containing it would walk the
// tree again. A union built inline carries nothing but its members.
type SealDependencyMapOf<Map> =
  DependencyMapFromSealedEntries<
    keyof Map extends infer Key
      ? Key extends keyof Map
        ? SealedDependencyEntry<Key, Map[Key]>
        : never
      : never
  > extends infer Sealed extends object
    ? Sealed
    : never;

type ComponentDependencyContract<
  Deps,
  PropertiesDeps,
  Provided,
  PublicProperties,
  MissingProvider,
> = {
  deps: Deps;
  propertiesDeps: PropertiesDeps;
  provided: Provided;
  publicProperties: PublicProperties;
  missingProvider: MissingProvider;
};

/**
 * Stores a component dependency contract in a flat form.
 *
 * The contract keeps its public shape (`deps`, `propertiesDeps`, `provided`,
 * `publicProperties`, `missingProvider`); only the provenance of
 * `missingProvider` — the part read from the template's children — is dropped
 * through {@link SealDependencyMap}. A parent then reads the missing providers
 * its child already flattened instead of re-expanding the child's template.
 */
export type SealComponentDependencies<Contract> =
  IsAnyDependencyMap<Contract> extends true
    ? Contract
    : Contract extends {
          deps: infer Deps;
          propertiesDeps: infer PropertiesDeps;
          provided: infer Provided;
          publicProperties: infer PublicProperties;
          missingProvider: infer MissingProvider;
        }
      ? ComponentDependencyContract<
          Deps,
          PropertiesDeps,
          Provided,
          PublicProperties,
          SealDependencyMap<MissingProvider>
        > extends infer Sealed extends object
        ? Sealed
        : never
      : Contract;

/**
 * Builds the complete dependency contract of a functional component from its
 * yielded requests, the tracked helpers returned in its context, its local
 * providers, and its public input/output properties.
 *
 * The contract is computed once per component and sealed (see
 * {@link SealComponentDependencies}), so its size does not depend on how deep
 * the tree under the component is.
 */
export type CraftComponentDependencies<
  Yielded,
  Context,
  Providers,
  PublicProperties extends object,
  TemplateDependencies extends object = never,
> =
  // The check stays deferred while any parameter is generic, and the contract
  // reaches the seal through `infer`. Both matter: the contract's keys are
  // known even while its parameters are generic, so a bare
  // `SealComponentDependencies<UnsealedCraftComponentDependencies<…>>` would
  // be resolved on the generic declaration. Every reference would then be an
  // object aliased with its own (unsealed) arguments, and instantiating it
  // would unroll the generic missing-provider recursion. Sealing an `infer`
  // parameter only ever happens on the concrete contract.
  [
    Yielded,
    Context,
    Providers,
    PublicProperties,
    TemplateDependencies,
    UnsealedCraftComponentDependencies<
      Yielded,
      Context,
      Providers,
      PublicProperties,
      TemplateDependencies
    >,
  ] extends [
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    infer Contract extends object,
  ]
    ? SealComponentDependencies<Contract>
    : never;

type UnsealedCraftComponentDependencies<
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
    : // Two shapes reach this point: a map of service dependencies (a reader
      // carrying its own contract) and a map whose entries are themselves
      // dependency records (projected content, a piped directive). The first
      // shape needs the map read directly, the second needs it read as a
      // nested entry — collecting both is what keeps either from vanishing.
      MergeObjectUnion<
        | MissingProvidersFromDepsMap<TemplateDependencies>
        | MissingProvidersFromDepsMap<{
            readonly __craft_template_dependencies__: TemplateDependencies;
          }>
      >;
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
