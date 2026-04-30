import { provideAppInitializer, type ApplicationConfig } from '@angular/core';
import type { MissingProvidersFromDepsMap } from './branded-component/branded-component';
import {
  getRegisteredAppStartServices,
  getServiceMetaData,
  runServiceAppStart,
  type BrandedServiceProvider,
  type GetServiceReferenceMeta,
  type ServiceReference,
} from './craft-service';
import {
  CRAFT_SERVICE_PROVIDER_BRAND,
  type Simplify,
} from './craft-service.shared';

type AngularApplicationProvider = ApplicationConfig['providers'][number];
type AngularApplicationProviders = readonly AngularApplicationProvider[];

export interface CraftAppStartRegistry {}

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

type AppProvidedServiceNamesFromEntry<Entry> =
  Entry extends BrandedServiceProvider<infer Name, any>
    ? Name
    : Entry extends readonly unknown[]
      ? AppProvidedServiceNames<Entry>
      : never;

type AppProvidedServiceNames<Providers> = Providers extends readonly unknown[]
  ? AppProvidedServiceNamesFromEntry<Providers[number]>
  : never;

type CraftAppStartRegistryKeys = Extract<keyof CraftAppStartRegistry, string>;

type InvalidCraftAppStartRegistryEntries = Extract<
  {
    [Tag in CraftAppStartRegistryKeys]:
      CraftAppStartRegistry[Tag] extends ServiceReference
        ? GetServiceReferenceMeta<CraftAppStartRegistry[Tag]> extends {
            appStart: true;
          }
          ? never
          : Tag
        : Tag;
  }[CraftAppStartRegistryKeys],
  string
>;

type AssertValidCraftAppStartRegistry =
  [InvalidCraftAppStartRegistryEntries] extends [never]
    ? {}
    : {
        ERROR_invalid_craft_app_start_registry:
          InvalidCraftAppStartRegistryEntries;
      };

type RegisteredAppStartServiceNames = {
  [Tag in CraftAppStartRegistryKeys]:
    CraftAppStartRegistry[Tag] extends ServiceReference
      ? Extract<
          GetServiceReferenceMeta<CraftAppStartRegistry[Tag]>['name'],
          string
        >
      : never;
}[CraftAppStartRegistryKeys];

type ConfigProvidedServiceNames<Providers> =
  | AppProvidedServiceNames<Providers>
  | RegisteredAppStartServiceNames;

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
  ConfigProvidedServiceNames<Providers>
>;

type ResolvedRouteMissingProviders<RouteMetaData, Providers> = Simplify<
  Omit<
    Simplify<
      MissingProvidersFromDepsMap<ResolvedRouteDepsMap<RouteMetaData, Providers>> &
        ExplicitMissingProviderMap<RouteMetaData>
    >,
    keyof ProvidedMap<RouteMetaData> | ConfigProvidedServiceNames<Providers>
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
  readonly providers: readonly AngularApplicationProvider[];
  readonly APP_CONFIG_META_DATA: CraftAppConfigMetaData<RoutingDeps, Providers>;
};

export function craftAppConfig<const RoutingDeps extends readonly unknown[]>(
  config: {
    routingDeps: RoutingDeps;
  } & AssertValidCraftAppStartRegistry,
): CraftAppConfigResult<RoutingDeps, readonly []>;
export function craftAppConfig<
  const RoutingDeps extends readonly unknown[],
  const Providers extends AngularApplicationProviders,
>(
  config: {
    routingDeps: RoutingDeps;
    providers: Providers;
  } & AssertValidCraftAppStartRegistry,
): CraftAppConfigResult<RoutingDeps, Providers>;
export function craftAppConfig<
  const RoutingDeps extends readonly unknown[],
  const Providers extends AngularApplicationProviders,
>(
  config: {
    routingDeps: RoutingDeps;
    providers?: Providers;
  } & AssertValidCraftAppStartRegistry,
): CraftAppConfigResult<RoutingDeps, Providers | readonly []> {
  const providers = [...(config.providers ?? [])] as AngularApplicationProvider[];
  const providerNames = collectProvidedServiceNames(providers);

  for (const reference of getRegisteredAppStartServices()) {
    const metaData = getServiceMetaData(reference);

    if (metaData.appStart !== true) {
      throw new Error(
        `craftAppConfig found craftService "${metaData.name}" registered as appStart without appStart: true.`,
      );
    }

    if (
      Reflect.get(metaData, 'usesProvidedInput') === true &&
      (metaData.scope === 'toProvide' ||
        metaData.scope === 'manuallyProvidedAtRoot')
    ) {
      throw new Error(
        `craftAppConfig cannot auto-provide appStart service "${metaData.name}" because provide${metaData.name}(...) requires arguments.`,
      );
    }

    if (
      (metaData.scope === 'toProvide' ||
        metaData.scope === 'manuallyProvidedAtRoot') &&
      typeof metaData.provide === 'function' &&
      !providerNames.has(metaData.name)
    ) {
      providers.push(metaData.provide());
      providerNames.add(metaData.name);
    }

    providers.push(
      provideAppInitializer(() => {
        const serviceValue = metaData.inject();
        return runServiceAppStart(reference, serviceValue);
      }),
    );
  }

  return {
    providers,
    APP_CONFIG_META_DATA:
      config.routingDeps as CraftAppConfigMetaData<RoutingDeps, Providers | readonly []>,
  };
}

export function toApplicationConfig(config: {
  providers: readonly AngularApplicationProvider[];
}): ApplicationConfig {
  return {
    providers: [...config.providers],
  };
}

function collectProvidedServiceNames(
  values: readonly unknown[],
  names: Set<string> = new Set(),
): Set<string> {
  for (const value of values) {
    collectProvidedServiceNamesFromValue(value, names);
  }

  return names;
}

function collectProvidedServiceNamesFromValue(
  value: unknown,
  names: Set<string>,
) {
  if (
    typeof value === 'object' &&
    value !== null &&
    CRAFT_SERVICE_PROVIDER_BRAND in value
  ) {
    const metaData = Reflect.get(value, CRAFT_SERVICE_PROVIDER_BRAND) as
      | { name: string }
      | undefined;

    if (metaData?.name) {
      names.add(metaData.name);
    }
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectProvidedServiceNamesFromValue(entry, names);
    }
  }
}
