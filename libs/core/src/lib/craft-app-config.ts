import type { ApplicationConfig } from '@angular/core';
import type { BrandedServiceProvider } from './craft-service';
import type {
  MergeObjectUnion,
  RequirementScope,
  Simplify,
} from './craft-service.shared';

type AngularApplicationProvider = ApplicationConfig['providers'][number];
type AngularApplicationProviders = readonly AngularApplicationProvider[];

type DepsMap<Input> = Input extends { deps: infer Deps extends object }
  ? Deps
  : {};

type ProvidedMap<Input> = Input extends {
  provided: infer Provided extends object;
}
  ? Provided
  : {};

type ExplicitMissingProviderMap<Input> = Input extends {
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

type AppProvidedServiceNamesFromEntry<Entry> =
  Entry extends BrandedServiceProvider<infer Name, any>
    ? Name
    : Entry extends readonly unknown[]
      ? AppProvidedServiceNames<Entry>
      : never;

type AppProvidedServiceNames<Providers> = Providers extends readonly unknown[]
  ? AppProvidedServiceNamesFromEntry<Providers[number]>
  : never;

type StripProvidedDependency<
  Dependency,
  ProvidedNames extends string,
> = Dependency extends {
  dependencies: infer Dependencies extends object;
}
  ? Simplify<
      Omit<Dependency, 'dependencies'> & {
        dependencies: StripProvidedDepsMap<Dependencies, ProvidedNames>;
      }
    >
  : Dependency;

type StripProvidedDepsMap<
  Deps extends object,
  ProvidedNames extends string,
> = Simplify<
  Omit<
    {
      [Name in Extract<keyof Deps, string>]: StripProvidedDependency<
        Deps[Name],
        ProvidedNames
      >;
    },
    ProvidedNames
  >
>;

type ResolvedRouteDepsMap<RouteMetaData, Providers> = StripProvidedDepsMap<
  DepsMap<RouteMetaData>,
  AppProvidedServiceNames<Providers>
>;

type ResolvedRouteMissingProviders<RouteMetaData, Providers> = Simplify<
  Omit<
    Simplify<
      MissingProvidersFromDepsMap<
        ResolvedRouteDepsMap<RouteMetaData, Providers>
      > &
        ExplicitMissingProviderMap<RouteMetaData>
    >,
    keyof ProvidedMap<RouteMetaData> | AppProvidedServiceNames<Providers>
  >
>;

type ResolveCraftAppRouteMetaData<RouteMetaData, Providers> = Simplify<
  Omit<RouteMetaData, 'deps' | 'missingProvider'> &
    (RouteMetaData extends { deps: object }
      ? {
          deps: ResolvedRouteDepsMap<RouteMetaData, Providers>;
        }
      : {}) &
    ([keyof ResolvedRouteMissingProviders<RouteMetaData, Providers>] extends [
      never,
    ]
      ? {}
      : {
          missingProvider: ResolvedRouteMissingProviders<
            RouteMetaData,
            Providers
          >;
        })
>;

export type CraftAppConfigMetaData<
  RoutingDeps extends readonly unknown[],
  Providers extends
    AngularApplicationProviders = readonly AngularApplicationProvider[],
> = {
  [Index in keyof RoutingDeps]: ResolveCraftAppRouteMetaData<
    RoutingDeps[Index],
    Providers
  >;
};

export type CraftAppConfigResult<
  RoutingDeps extends readonly unknown[],
  Providers extends
    AngularApplicationProviders = readonly AngularApplicationProvider[],
> = {
  readonly providers: Providers;
  readonly APP_CONFIG_META_DATA: CraftAppConfigMetaData<RoutingDeps, Providers>;
};

export function craftAppConfig<
  const RoutingDeps extends readonly unknown[],
>(config: {
  routingDeps: RoutingDeps;
}): CraftAppConfigResult<RoutingDeps, readonly []>;
export function craftAppConfig<
  const RoutingDeps extends readonly unknown[],
  const Providers extends AngularApplicationProviders,
>(config: {
  routingDeps: RoutingDeps;
  providers: Providers;
}): CraftAppConfigResult<RoutingDeps, Providers>;
export function craftAppConfig<
  const RoutingDeps extends readonly unknown[],
  const Providers extends AngularApplicationProviders,
>(config: {
  routingDeps: RoutingDeps;
  providers?: Providers;
}): CraftAppConfigResult<RoutingDeps, Providers | readonly []> {
  return {
    providers: (config.providers ?? []) as Providers | readonly [],
    APP_CONFIG_META_DATA: config.routingDeps as CraftAppConfigMetaData<
      RoutingDeps,
      Providers
    >,
  };
}

export function toApplicationConfig(
  config: Pick<
    CraftAppConfigResult<readonly unknown[], AngularApplicationProviders>,
    'providers'
  >,
): ApplicationConfig {
  return {
    providers: [...config.providers],
  };
}
