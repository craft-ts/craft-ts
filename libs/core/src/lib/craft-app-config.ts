import { getCraftRootDefaultProviders, provideAppInitializer, type ApplicationConfig } from './host/craft-compat';
import {
  getRegisteredAppStartServices,
  getServiceMetaData,
  runServiceAppStart,
  type NamedBrandedServiceProvider,
  type GetServiceReferenceMeta,
  type ServiceReference,
} from './craft-service';
import { CRAFT_SERVICE_PROVIDER_BRAND } from './craft-service.shared';

type AngularApplicationProvider = ApplicationConfig['providers'][number] | object;
type AngularApplicationProviders = readonly AngularApplicationProvider[];
export type AppConfigProvidedServiceNamesKey =
  '__craftAppProvidedServiceNames__';
export type AppConfigProvidedDependencyValuesKey =
  '__craftAppProvidedDependencyValues__';

export interface CraftAppStartRegistry {}

type IsAny<Input> = 0 extends 1 & Input ? true : false;

type AppProvidedServiceNamesFromEntry<Entry> =
  IsAny<Entry> extends true
    ? never
    : Entry extends NamedBrandedServiceProvider<infer Name, any, any>
      ? Name
      : Entry extends readonly unknown[]
        ? AppProvidedServiceNames<Entry>
        : never;

type KnownProvidedDependencyValue<Value> = [unknown] extends [Value]
  ? never
  : Value;

type AppProvidedDependencyValuesFromEntry<Entry> =
  IsAny<Entry> extends true
    ? never
    : Entry extends NamedBrandedServiceProvider<any, any, infer Output>
      ? KnownProvidedDependencyValue<Output>
      : Entry extends readonly unknown[]
        ? AppProvidedDependencyValues<Entry>
        : never;

type AppProvidedServiceNames<Providers> = Providers extends readonly unknown[]
  ? AppProvidedServiceNamesFromEntry<Providers[number]>
  : never;

type AppProvidedDependencyValues<Providers> =
  Providers extends readonly unknown[]
    ? AppProvidedDependencyValuesFromEntry<Providers[number]>
    : never;

type CraftAppStartRegistryKeys = Extract<keyof CraftAppStartRegistry, string>;

type RequireCraftAppStartConfig = [CraftAppStartRegistryKeys] extends [never]
  ? {}
  : {
      appStart: CraftAppStartRegistry;
    };

type InvalidCraftAppStartRegistryEntries = Extract<
  {
    [Tag in CraftAppStartRegistryKeys]: CraftAppStartRegistry[Tag] extends ServiceReference
      ? GetServiceReferenceMeta<CraftAppStartRegistry[Tag]> extends {
          appStart: true;
        }
        ? never
        : Tag
      : Tag;
  }[CraftAppStartRegistryKeys],
  string
>;

type AssertValidCraftAppStartRegistry = [
  InvalidCraftAppStartRegistryEntries,
] extends [never]
  ? {}
  : {
      ERROR_invalid_craft_app_start_registry: InvalidCraftAppStartRegistryEntries;
    };

type RegisteredAppStartServiceNames = {
  [Tag in CraftAppStartRegistryKeys]: CraftAppStartRegistry[Tag] extends ServiceReference
    ? Extract<
        GetServiceReferenceMeta<CraftAppStartRegistry[Tag]>['name'],
        string
      >
    : never;
}[CraftAppStartRegistryKeys];

type ConfigProvidedServiceNames<Providers> =
  | AppProvidedServiceNames<Providers>
  | RegisteredAppStartServiceNames;

export type CraftAppConfigResult<
  Providers extends
    AngularApplicationProviders = readonly AngularApplicationProvider[],
> = {
  readonly providers: readonly AngularApplicationProvider[];
  /** @internal phantom — compile-time app provider registry */
  readonly __craftAppProvidedServiceNames__?: ConfigProvidedServiceNames<Providers>;
  /** @internal phantom — compile-time app provider values */
  readonly __craftAppProvidedDependencyValues__?: AppProvidedDependencyValues<Providers>;
};

export function craftAppConfig<
  const Providers extends AngularApplicationProviders = readonly [],
>(
  config: {
    providers?: Providers;
  } & AssertValidCraftAppStartRegistry &
    RequireCraftAppStartConfig,
): CraftAppConfigResult<Providers> {
  const providers = [
    ...getCraftRootDefaultProviders(),
    ...(config.providers ?? []),
  ] as AngularApplicationProvider[];
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
      (metaData.providedIn === 'toProvide' ||
        metaData.providedIn === 'manuallyProvidedAtRoot')
    ) {
      throw new Error(
        `craftAppConfig cannot auto-provide appStart service "${metaData.name}" because provide${metaData.name}(...) requires arguments.`,
      );
    }

    if (
      (metaData.providedIn === 'toProvide' ||
        metaData.providedIn === 'manuallyProvidedAtRoot') &&
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
  };
}

/** Returns a fresh host application config containing the Craft providers. */
export function toApplicationConfig(
  config: Pick<CraftAppConfigResult, 'providers'>,
): ApplicationConfig {
  return {
    providers: [...config.providers] as ApplicationConfig['providers'],
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
