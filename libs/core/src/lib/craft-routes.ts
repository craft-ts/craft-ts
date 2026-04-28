import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, type Data, type Route } from '@angular/router';
import {
  craftService,
  type BrandedServiceProvider,
  type CraftServiceApi,
} from './craft-service';
import type { MergeObjectUnion, Simplify } from './craft-service.shared';

type AngularRouteBase = Omit<Route, 'children' | 'data' | 'path' | 'providers'>;
type AngularRouteProviders = NonNullable<Route['providers']>;
type ComponentDepsMap<RouteDefinition> = RouteDefinition extends {
  componentDeps: infer ComponentDeps extends object;
}
  ? ComponentDeps
  : {};
type DepsMap<ComponentDeps> = ComponentDeps extends {
  deps: infer Deps extends object;
}
  ? Deps
  : {};
type ProvidedMap<ComponentDeps> = ComponentDeps extends {
  provided: infer Provided extends object;
}
  ? Provided
  : {};
type MissingProviderMap<ComponentDeps> = ComponentDeps extends {
  missingProvider: infer MissingProvider extends object;
}
  ? MissingProvider
  : {};

type PublicPropertiesMap<ComponentDeps> = ComponentDeps extends {
  publicProperties: infer PublicProperties extends object;
}
  ? PublicProperties
  : {};
type PublicPropertyValue<Property> = Property extends (
  ...args: any[]
) => infer Value
  ? Value
  : Property;

type RemoveOptionalMarker<Value extends string> = Value extends `${infer Name}?`
  ? Name
  : Value;

type SegmentParamName<Segment extends string> =
  Segment extends `:${infer Param}` ? RemoveOptionalMarker<Param> : never;

type PathParamNames<Path extends string> =
  Path extends `${infer Segment}/${infer Rest}`
    ? SegmentParamName<Segment> | PathParamNames<Rest>
    : SegmentParamName<Path>;

type RouteParamMap<Path extends string> = Simplify<{
  [Key in PathParamNames<Path>]: string;
}>;

type PascalCaseToken<Value extends string> =
  Value extends `${infer Head}-${infer Tail}`
    ? `${Capitalize<Head>}${PascalCaseToken<Tail>}`
    : Value extends `${infer Head}_${infer Tail}`
      ? `${Capitalize<Head>}${PascalCaseToken<Tail>}`
      : Capitalize<Value>;

type SegmentServiceName<Segment extends string> = Segment extends ''
  ? ''
  : Segment extends '**'
    ? 'Wildcard'
    : Segment extends `:${infer Param}`
      ? PascalCaseToken<RemoveOptionalMarker<Param>>
      : PascalCaseToken<Segment>;

type PathServiceName<Path extends string> =
  Path extends `${infer Segment}/${infer Rest}`
    ? `${SegmentServiceName<Segment>}${PathServiceName<Rest>}`
    : SegmentServiceName<Path>;

type RouteBaseServiceName<Path extends string> =
  PathServiceName<Path> extends '' ? 'Root' : PathServiceName<Path>;

type ParamServiceName<ParamName extends string> = PascalCaseToken<ParamName>;

type InjectHelperName<Name extends string> = `inject${Capitalize<Name>}`;
type ProvideHelperName<Name extends string> = `provide${Capitalize<Name>}`;

type RouteParamsProvider<Path extends string> = (
  params: Signal<RouteParamMap<Path>>,
) => Partial<Record<PathParamNames<Path>, unknown>>;

type ParamsProviderOutput<RouteDefinition> = RouteDefinition extends {
  paramsProvider: (...args: any[]) => infer Output extends object;
}
  ? Output
  : {};

type ParamOutputForRoute<RouteDefinition, ParamName extends string> =
  ParamName extends PathParamNames<RoutePath<RouteDefinition>>
    ? ParamName extends keyof ParamsProviderOutput<RouteDefinition>
      ? ParamsProviderOutput<RouteDefinition>[ParamName]
      : Signal<RouteParamMap<RoutePath<RouteDefinition>>[ParamName]>
    : never;

type ParamOutputForRoutes<
  Routes extends readonly AnyCraftRouteDefinition[],
  ParamName extends string,
> = Routes[number] extends infer RouteDefinition
  ? ParamOutputForRoute<RouteDefinition, ParamName>
  : never;

type RouteDataServiceName<Path extends string> =
  `${RouteBaseServiceName<Path>}Data`;

type RouteDataOutput<RouteDefinition> = RouteDefinition extends {
  data: infer RouteData extends Data;
}
  ? Signal<RouteData>
  : never;

type RouteDataPublicPropertyNames<RouteDefinition> = RouteDefinition extends {
  data: infer RouteData extends Data;
}
  ? Extract<keyof RouteData, string>
  : never;

type RouteParamPublicPropertyValues<Path extends string> = Simplify<{
  [Key in PathParamNames<Path>]: string;
}>;

type RoutePath<RouteDefinition> = RouteDefinition extends {
  path: infer Path extends string;
}
  ? Path
  : never;

type RouteProvidedPublicPropertyNames<RouteDefinition> =
  | PathParamNames<RoutePath<RouteDefinition>>
  | RouteDataPublicPropertyNames<RouteDefinition>;

type RouteProvidedPublicPropertyValues<RouteDefinition> = Simplify<
  RouteParamPublicPropertyValues<RoutePath<RouteDefinition>> &
    (RouteDefinition extends { data: infer RouteData extends Data }
      ? RouteData
      : {})
>;

type RouteSatisfiedPublicPropertyNames<RouteDefinition> = {
  [Key in Extract<
    keyof PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>,
    string
  >]: Key extends keyof RouteProvidedPublicPropertyValues<RouteDefinition>
    ? RouteProvidedPublicPropertyValues<RouteDefinition>[Key] extends PublicPropertyValue<
        PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>[Key]
      >
      ? Key
      : never
    : never;
}[Extract<
  keyof PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>,
  string
>];

type RemainingRoutePublicProperties<RouteDefinition> = Simplify<
  Omit<
    PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>,
    RouteSatisfiedPublicPropertyNames<RouteDefinition>
  >
>;

type RouteProvidedServiceNamesFromEntry<Entry> =
  Entry extends BrandedServiceProvider<infer Name, any>
    ? Name
    : Entry extends readonly unknown[]
      ? RouteProvidedServiceNames<Entry>
      : never;

type RouteProvidedServiceNames<Providers> = Providers extends readonly unknown[]
  ? RouteProvidedServiceNamesFromEntry<Providers[number]>
  : never;

type StripRouteProvidedDependency<
  Dependency,
  ProvidedNames extends string,
> = Dependency extends {
  dependencies: infer Dependencies extends object;
}
  ? Simplify<
      Omit<Dependency, 'dependencies'> & {
        dependencies: StripRouteProvidedDepsMap<Dependencies, ProvidedNames>;
      }
    >
  : Dependency;

type StripRouteProvidedDepsMap<
  Deps extends object,
  ProvidedNames extends string,
> = Simplify<
  Omit<
    {
      [Name in Extract<keyof Deps, string>]: StripRouteProvidedDependency<
        Deps[Name],
        ProvidedNames
      >;
    },
    ProvidedNames
  >
>;

export type ResolveCraftRouteComponentDeps<RouteDefinition> = Simplify<
  Omit<
    ComponentDepsMap<RouteDefinition>,
    'deps' | 'missingProvider' | 'publicProperties'
  > &
    (ComponentDepsMap<RouteDefinition> extends { deps: object }
      ? {
          deps: Simplify<
            StripRouteProvidedDepsMap<
              DepsMap<ComponentDepsMap<RouteDefinition>>,
              RouteProvidedServiceNames<
                RouteDefinition extends { providers: infer Providers }
                  ? Providers
                  : never
              >
            >
          >;
        }
      : {}) &
    ([keyof RemainingRoutePublicProperties<RouteDefinition>] extends [never]
      ? {}
      : {
          publicProperties: RemainingRoutePublicProperties<RouteDefinition>;
        })
>;

type ResolveCraftRouteMetaDataComponentDeps<RouteDefinition> = Simplify<
  Omit<
    ComponentDepsMap<RouteDefinition>,
    'deps' | 'missingProvider' | 'publicProperties'
  > &
    (ComponentDepsMap<RouteDefinition> extends { deps: object }
      ? {
          deps: Simplify<
            StripRouteProvidedDepsMap<
              DepsMap<ComponentDepsMap<RouteDefinition>>,
              RouteProvidedServiceNames<
                RouteDefinition extends { providers: infer Providers }
                  ? Providers
                  : never
              >
            >
          >;
        }
      : {}) &
    (ComponentDepsMap<RouteDefinition> extends { publicProperties: object }
      ? {
          publicProperties: RemainingRoutePublicProperties<RouteDefinition>;
        }
      : {})
>;

type CraftRouteMetaDataEntry<RouteDefinition> = Simplify<
  {
    path: RoutePath<RouteDefinition>;
  } & ResolveCraftRouteMetaDataComponentDeps<RouteDefinition>
>;

export type CraftRoutesMetaData<
  Routes extends readonly AnyCraftRouteDefinition[],
> = {
  [Index in keyof Routes]: CraftRouteMetaDataEntry<Routes[Index]>;
};

type AnyCraftRouteDefinition = Simplify<
  AngularRouteBase & {
    path: string;
    providers?: AngularRouteProviders;
    data?: Data;
    componentDeps: unknown;
    paramsProvider?: (
      params: Signal<Record<string, string>>,
    ) => Record<string, unknown>;
  }
>;

export type CraftRouteDefinition<
  Path extends string = string,
  ComponentDeps = unknown,
  RouteData extends Data = Data,
  Providers extends AngularRouteProviders = AngularRouteProviders,
> = Simplify<
  AngularRouteBase & {
    path: Path;
    providers?: Providers;
    data?: RouteData;
    componentDeps: ComponentDeps;
    paramsProvider?: [PathParamNames<Path>] extends [never]
      ? never
      : RouteParamsProvider<Path>;
  }
>;

type CraftRouteValueServiceApi<Name extends string, Output> = CraftServiceApi<
  Name,
  'toProvide',
  { $provided: { resolve: () => Output } },
  Output
>;

type ParamInjectHelpers<Routes extends readonly AnyCraftRouteDefinition[]> =
  Simplify<
    MergeObjectUnion<
      PathParamNames<Routes[number]['path']> extends infer ParamName extends
        string
        ? Pick<
            CraftRouteValueServiceApi<
              ParamServiceName<ParamName>,
              ParamOutputForRoutes<Routes, ParamName>
            >,
            InjectHelperName<ParamServiceName<ParamName>>
          >
        : never
    >
  >;

type DataInjectHelpers<Routes extends readonly AnyCraftRouteDefinition[]> =
  Simplify<
    MergeObjectUnion<
      Routes[number] extends infer RouteDefinition
        ? RouteDefinition extends { data: Data }
          ? Pick<
              CraftRouteValueServiceApi<
                RouteDataServiceName<RoutePath<RouteDefinition>>,
                RouteDataOutput<RouteDefinition>
              >,
              InjectHelperName<RouteDataServiceName<RoutePath<RouteDefinition>>>
            >
          : never
        : never
    >
  >;

export type CraftRoutesApp<
  Routes extends
    readonly AnyCraftRouteDefinition[] = readonly AnyCraftRouteDefinition[],
> = {
  toRoutes(): Route[];
  META_DATA: CraftRoutesMetaData<Routes>;
};

export type CraftRoutesResult<
  Routes extends readonly AnyCraftRouteDefinition[],
> = Simplify<
  {
    appRoutes: CraftRoutesApp<Routes>;
  } & ParamInjectHelpers<Routes> &
    DataInjectHelpers<Routes>
>;

type AnyRouteValueServiceApi = CraftRouteValueServiceApi<string, unknown>;

function createRouteValueService<Name extends string, Output>(
  name: Name,
): CraftRouteValueServiceApi<Name, Output> {
  return craftService(
    { name, scope: 'toProvide' },
    (inputs: { $provided: { resolve: () => Output } }) =>
      inputs.$provided.resolve(),
  ) as CraftRouteValueServiceApi<Name, Output>;
}

function extractRouteParamNames(path: string): string[] {
  return path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1).replace(/\?$/, ''));
}

function toPascalCase(value: string): string {
  return value
    .replace(/^:/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join('');
}

function toParamServiceName(paramName: string): string {
  return toPascalCase(paramName);
}

function toRouteBaseServiceName(path: string): string {
  const name = path
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment === '**' ? 'Wildcard' : toPascalCase(segment)))
    .join('');

  return name || 'Root';
}

function toRouteDataServiceName(path: string): string {
  return `${toRouteBaseServiceName(path)}Data`;
}

function injectRouteParamsSignal(): Signal<Record<string, string>> {
  const activatedRoute = inject(ActivatedRoute);
  return toSignal(activatedRoute.params, {
    initialValue: activatedRoute.snapshot.params,
  }) as Signal<Record<string, string>>;
}

function injectRouteDataSignal<RouteData extends Data>(): Signal<RouteData> {
  const activatedRoute = inject(ActivatedRoute);
  return toSignal(activatedRoute.data, {
    initialValue: activatedRoute.snapshot.data,
  }) as Signal<RouteData>;
}

function provideRouteValueService(
  serviceName: string,
  serviceApi: AnyRouteValueServiceApi,
  resolve: () => unknown,
): BrandedServiceProvider<string, 'toProvide'> {
  const provideKey = `provide${serviceName}` as ProvideHelperName<string>;
  const provideHelper = serviceApi[provideKey];

  if (typeof provideHelper !== 'function') {
    throw new Error(`Route service "${serviceName}" is missing its provider.`);
  }

  return (
    provideHelper as (provided: {
      resolve: () => unknown;
    }) => BrandedServiceProvider<string, 'toProvide'>
  )({ resolve });
}

function getRouteComponentDeps(
  route: AnyCraftRouteDefinition,
): Record<string, unknown> {
  if (
    !route.componentDeps ||
    typeof route.componentDeps !== 'object' ||
    Array.isArray(route.componentDeps)
  ) {
    throw new Error(
      `Route "${route.path}" must define "componentDeps" as an object.`,
    );
  }

  return route.componentDeps as Record<string, unknown>;
}

export function craftRoutes<
  const Routes extends readonly AnyCraftRouteDefinition[],
>(routes: {
  [Index in keyof Routes]: Routes[Index];
}): CraftRoutesResult<Routes> {
  const routeValueServices = new Map<string, AnyRouteValueServiceApi>();
  const helpers: Record<string, unknown> = {};

  for (const route of routes) {
    for (const paramName of extractRouteParamNames(route.path)) {
      const serviceName = toParamServiceName(paramName);
      registerRouteValueService(serviceName);
    }

    if (route.data !== undefined) {
      registerRouteValueService(toRouteDataServiceName(route.path));
    }
  }

  const META_DATA = routes.map((route) => {
    const componentDeps = getRouteComponentDeps(route);

    const { missingProvider: _missingProvider, ...restComponentDeps } =
      componentDeps;

    return {
      path: route.path,
      ...restComponentDeps,
    };
  }) as CraftRoutesMetaData<Routes>;

  const appRoutes: CraftRoutesApp<Routes> = {
    toRoutes: () => routes.map((route) => toAngularRoute(route)),
    META_DATA,
  };

  return {
    appRoutes,
    ...helpers,
  } as CraftRoutesResult<Routes>;

  function registerRouteValueService(serviceName: string): void {
    if (routeValueServices.has(serviceName)) {
      return;
    }

    const serviceApi = createRouteValueService(serviceName);
    routeValueServices.set(serviceName, serviceApi);

    const injectKey = `inject${serviceName}`;
    helpers[injectKey] = serviceApi[injectKey as InjectHelperName<string>];
  }

  function toAngularRoute(route: AnyCraftRouteDefinition): Route {
    const autoProviders: AngularRouteProviders = [];

    for (const paramName of extractRouteParamNames(route.path)) {
      const serviceName = toParamServiceName(paramName);
      const routeService = routeValueServices.get(serviceName);

      if (!routeService) {
        continue;
      }

      autoProviders.push(
        provideRouteValueService(serviceName, routeService, () => {
          const paramsSignal = injectRouteParamsSignal();
          const providedParams = route.paramsProvider?.(paramsSignal);

          if (providedParams && paramName in providedParams) {
            return providedParams[paramName];
          }

          return computed(() => paramsSignal()[paramName]);
        }),
      );
    }

    if (route.data !== undefined) {
      const serviceName = toRouteDataServiceName(route.path);
      const routeService = routeValueServices.get(serviceName);

      if (routeService) {
        autoProviders.push(
          provideRouteValueService(serviceName, routeService, () =>
            injectRouteDataSignal(),
          ),
        );
      }
    }

    const {
      componentDeps: _componentDeps,
      paramsProvider,
      ...angularRoute
    } = route;

    return {
      ...angularRoute,
      providers:
        autoProviders.length > 0 || route.providers?.length
          ? [...autoProviders, ...(route.providers ?? [])]
          : undefined,
    };
  }
}
