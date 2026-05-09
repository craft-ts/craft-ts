import {
  computed,
  inject,
  Injector,
  isSignal,
  runInInjectionContext,
  type Signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type CanMatchFn,
  type Data,
  type GuardResult,
  type MaybeAsync,
  type PartialMatchRouteSnapshot,
  type Route,
  type RouterStateSnapshot,
  type UrlSegment,
} from '@angular/router';
import { Observable, filter, isObservable, take, throwIfEmpty } from 'rxjs';
import type { ExtractDeps } from './branded-component/branded-component';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import type { CraftHttpRequest } from './craft-http-client';
import { craftService } from './craft-service';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  BrandedServiceProvider,
  CraftServiceApi,
  GetInjectedServiceDependencies,
  ServiceDependencyMapFromYielded,
  ServiceTrackingMetadata,
} from './craft-service';
import type { MergeObjectUnion, Simplify } from './craft-service.shared';

type AngularRouteBase = Omit<
  Route,
  | 'canActivate'
  | 'canMatch'
  | 'children'
  | 'component'
  | 'data'
  | 'loadChildren'
  | 'loadComponent'
  | 'path'
  | 'providers'
>;
type AngularRouteProviders = NonNullable<Route['providers']>;
type AngularRouteComponent = NonNullable<Route['component']>;
type AngularLoadComponent = NonNullable<Route['loadComponent']>;
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
type PropertiesDepsMap<ComponentDeps> = ComponentDeps extends {
  propertiesDeps: infer PropertiesDeps extends object;
}
  ? PropertiesDeps
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
type RouteCollectionServiceName<Name extends string> = PascalCaseToken<Name>;
type RouteParamServiceName<
  Name extends string,
  ParamName extends string,
> = `${RouteCollectionServiceName<Name>}${ParamServiceName<ParamName>}Params`;
type RouteCollectionDataServiceName<
  Name extends string,
  Path extends string,
> = `${RouteCollectionServiceName<Name>}${RouteDataServiceName<Path>}`;
type RouteQueryParamsServiceName<Path extends string> =
  `${RouteBaseServiceName<Path>}QueryParams`;
type RouteCollectionQueryParamsServiceName<
  Name extends string,
  Path extends string,
> = `${RouteCollectionServiceName<Name>}${RouteQueryParamsServiceName<Path>}`;
type RouteCollectionExportName<Name extends string> = Uncapitalize<
  RouteCollectionServiceName<Name>
>;
type RoutesExportKey<Name extends string> =
  `${RouteCollectionExportName<Name>}Routes`;
type RouteParamInjectHelperName<
  Name extends string,
  ParamName extends string,
> = InjectHelperName<RouteParamServiceName<Name, ParamName>>;
type RouteDataInjectHelperName<
  Name extends string,
  Path extends string,
> = InjectHelperName<RouteCollectionDataServiceName<Name, Path>>;
type RouteQueryParamsInjectHelperName<
  Name extends string,
  Path extends string,
> = InjectHelperName<RouteCollectionQueryParamsServiceName<Name, Path>>;

type InjectHelperName<Name extends string> = `inject${Capitalize<Name>}`;
type ProvideHelperName<Name extends string> = `provide${Capitalize<Name>}`;

type ResolveGeneratorResult<Result> =
  Result extends Generator<any, infer Output, unknown> ? Output : Result;

type RouteQueryParamsFactory<Output = unknown, Yielded = never> = () =>
  | Output
  | Generator<Yielded, Output, unknown>;

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
  Routes extends readonly AnyCraftRouteHelperDefinition[],
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

type RouteQueryParamsOutput<RouteDefinition> = RouteDefinition extends {
  queryParams: (...args: any[]) => infer Result;
}
  ? ResolveGeneratorResult<Result>
  : never;

type RouteQueryParamsStateConfig<RouteDefinition> =
  RouteQueryParamsOutput<RouteDefinition> extends {
    _config: {
      state: infer QueryParamsStateConfig extends object;
    };
  }
    ? QueryParamsStateConfig
    : RouteQueryParamsOutput<RouteDefinition> extends {
          _config: infer QueryParamsStateConfig extends object;
        }
      ? QueryParamsStateConfig
      : {};

type RouteQueryParamsMetaData<RouteDefinition> = Simplify<{
  [Key in Extract<
    keyof RouteQueryParamsStateConfig<RouteDefinition>,
    string
  >]: string;
}>;

type RouteQueryParamsMetaDataField<RouteDefinition> = RouteDefinition extends {
  queryParams: RouteQueryParamsFactory;
}
  ? {
      queryParams: RouteQueryParamsMetaData<RouteDefinition>;
    }
  : {};

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

type JoinRoutePaths<
  ParentPath extends string,
  ChildPath extends string,
> = ParentPath extends ''
  ? ChildPath
  : ChildPath extends ''
    ? ParentPath
    : `${ParentPath}/${ChildPath}`;

type MergeRoutePublicPropertyValues<
  ParentPublicProperties extends object,
  CurrentPublicProperties extends object,
> = Simplify<
  Omit<ParentPublicProperties, keyof CurrentPublicProperties> &
    CurrentPublicProperties
>;

type MergeRouteMissingProviderValues<
  ParentMissingProviders extends object,
  CurrentMissingProviders extends object,
> = Simplify<
  Omit<ParentMissingProviders, keyof CurrentMissingProviders> &
    CurrentMissingProviders
>;

type MergeRouteHttpDepValues<
  ParentHttpDeps extends object,
  CurrentHttpDeps extends object,
> = Simplify<Omit<ParentHttpDeps, keyof CurrentHttpDeps> & CurrentHttpDeps>;

type AnyTrackedCraftHttpRequest = CraftHttpRequest<
  string,
  string,
  unknown,
  unknown,
  unknown,
  any
>;

type HttpRequestKey<Request> = Request extends {
  method: infer Method extends string;
  url: infer Url extends string;
}
  ? `${Method} ${Url}`
  : never;

type HttpRequestsFromDerivedProperties<Properties> = Properties extends object
  ? {
      [Key in Extract<
        keyof Properties,
        string
      >]: Properties[Key] extends AnyTrackedCraftHttpRequest
        ? Properties[Key]
        : never;
    }[Extract<keyof Properties, string>]
  : never;

type HttpRequestsFromDependencyValue<Value> = Value extends {
  scope: unknown;
  dependencies: infer Dependencies extends object;
}
  ?
      | HttpRequestsFromDerivedProperties<
          Value extends {
            derivedPropertiesUsed: infer Used extends object;
          }
            ? Used
            : {}
        >
      | HttpRequestsFromDerivedProperties<
          Value extends {
            derivedPropertiesExposed: infer Exposed extends object;
          }
            ? Exposed
            : {}
        >
      | HttpRequestsFromDepsMap<Dependencies>
  : Value extends { deps: object } | { propertiesDeps: object }
    ? HttpRequestsFromComponentDeps<Value>
    : never;

type HttpRequestsFromDepsMap<Deps extends object> = {
  [Key in Extract<keyof Deps, string>]: HttpRequestsFromDependencyValue<
    Deps[Key]
  >;
}[Extract<keyof Deps, string>];

type HttpRequestsFromPropertiesDepsMap<PropertiesDeps extends object> = {
  [Key in Extract<
    keyof PropertiesDeps,
    string
  >]: PropertiesDeps[Key] extends object
    ? HttpRequestsFromDepsMap<PropertiesDeps[Key]>
    : never;
}[Extract<keyof PropertiesDeps, string>];

type HttpRequestsFromComponentDeps<ComponentDeps> =
  | HttpRequestsFromDepsMap<DepsMap<ComponentDeps>>
  | HttpRequestsFromPropertiesDepsMap<PropertiesDepsMap<ComponentDeps>>;

type HttpDepsMapFromRequests<Requests> = [Requests] extends [never]
  ? {}
  : Simplify<
      MergeObjectUnion<
        Requests extends AnyTrackedCraftHttpRequest
          ? {
              [Key in HttpRequestKey<Requests>]: Requests;
            }
          : never
      >
    >;

type RouteProvidedPublicPropertyValues<RouteDefinition> = Simplify<
  RouteParamPublicPropertyValues<RoutePath<RouteDefinition>> &
    (RouteDefinition extends { data: infer RouteData extends Data }
      ? RouteData
      : {})
>;

type RouteProvidedPublicPropertyValuesWithInherited<
  RouteDefinition,
  InheritedPublicProperties extends object,
> = MergeRoutePublicPropertyValues<
  InheritedPublicProperties,
  RouteProvidedPublicPropertyValues<RouteDefinition>
>;

type RouteSatisfiedPublicPropertyNames<
  RouteDefinition,
  InheritedPublicProperties extends object = {},
> = {
  [Key in Extract<
    keyof PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>,
    string
  >]: Key extends keyof RouteProvidedPublicPropertyValuesWithInherited<
    RouteDefinition,
    InheritedPublicProperties
  >
    ? RouteProvidedPublicPropertyValuesWithInherited<
        RouteDefinition,
        InheritedPublicProperties
      >[Key] extends PublicPropertyValue<
        PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>[Key]
      >
      ? Key
      : never
    : never;
}[Extract<
  keyof PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>,
  string
>];

type UnmatchedRoutePublicProperties<
  RouteDefinition,
  InheritedPublicProperties extends object = {},
> = Simplify<
  Omit<
    PublicPropertiesMap<ComponentDepsMap<RouteDefinition>>,
    RouteSatisfiedPublicPropertyNames<
      RouteDefinition,
      InheritedPublicProperties
    >
  >
>;

type RemainingRoutePublicProperties<
  RouteDefinition,
  InheritedPublicProperties extends object = {},
> = UnmatchedRoutePublicProperties<RouteDefinition, InheritedPublicProperties>;

type RoutePublicPropertyErrorMessage<InputName extends string> =
  `The input ${InputName} is not matching any route param or data property`;

type MapRoutePublicPropertiesToErrors<
  RouteDefinition,
  InheritedPublicProperties extends object = {},
> = [
  keyof UnmatchedRoutePublicProperties<
    RouteDefinition,
    InheritedPublicProperties
  >,
] extends [never]
  ? {}
  : {
      [Path in RoutePath<RouteDefinition>]: {
        [InputName in Extract<
          keyof UnmatchedRoutePublicProperties<
            RouteDefinition,
            InheritedPublicProperties
          >,
          string
        >]: RoutePublicPropertyErrorMessage<InputName>;
      };
    };

type RouteProvidedServiceNamesFromEntry<Entry> =
  Entry extends BrandedServiceProvider<infer Name, any>
    ? Name
    : Entry extends readonly unknown[]
      ? RouteProvidedServiceNames<Entry>
      : never;

type RouteProvidedServiceNames<Providers> = Providers extends readonly unknown[]
  ? RouteProvidedServiceNamesFromEntry<Providers[number]>
  : never;

type RouteParamServiceNames<Name extends string, Path extends string> =
  PathParamNames<Path> extends infer ParamName extends string
    ? RouteParamServiceName<Name, ParamName>
    : never;

type RouteAutoProvidedServiceNames<
  RouteDefinition,
  RouteCollectionName extends string,
> =
  | RouteParamServiceNames<RouteCollectionName, RoutePath<RouteDefinition>>
  | (RouteDefinition extends { data: Data }
      ? RouteCollectionDataServiceName<
          RouteCollectionName,
          RoutePath<RouteDefinition>
        >
      : never)
  | (RouteDefinition extends { queryParams: RouteQueryParamsFactory }
      ? RouteCollectionQueryParamsServiceName<
          RouteCollectionName,
          RoutePath<RouteDefinition>
        >
      : never);

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

type CraftRouteCanActivateResult =
  | GuardResult
  | Promise<GuardResult>
  | Observable<GuardResult | undefined>
  | Signal<GuardResult | undefined>;

type CraftRouteCanActivateGuard = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) =>
  | CraftRouteCanActivateResult
  | Generator<unknown, CraftRouteCanActivateResult, unknown>;

type CraftRouteCanMatchGuard = (
  route: Route,
  segments: UrlSegment[],
  currentSnapshot?: PartialMatchRouteSnapshot,
) => GuardResult | Generator<unknown, GuardResult, unknown>;

type GuardOf<
  RouteDefinition,
  GuardName extends 'canActivate' | 'canMatch',
> = RouteDefinition extends {
  [Key in GuardName]?: infer Guard;
}
  ? Guard
  : never;

type GuardReturn<Guard> = Guard extends (...args: any[]) => infer Result
  ? Result
  : never;

type IsGeneratorReturn<Result> = [Result] extends [never]
  ? false
  : [Result] extends [Generator<any, any, any>]
    ? true
    : false;

type HasGeneratorGuard<RouteDefinition> = true extends
  | IsGeneratorReturn<GuardReturn<GuardOf<RouteDefinition, 'canActivate'>>>
  | IsGeneratorReturn<GuardReturn<GuardOf<RouteDefinition, 'canMatch'>>>
  ? true
  : false;

type GuardServiceDependencies<Output, Yielded> = GetInjectedServiceDependencies<
  CraftServiceApi<
    'craftRouteGuard',
    'function',
    {},
    Output,
    ServiceTrackingMetadata<'craftRouteGuard', 'function', Output, Yielded>
  >['injectCraftRouteGuard']
>;

type GuardDependenciesFromReturn<Result> = [Result] extends [never]
  ? {}
  : [Result] extends [Generator<infer Yielded, infer Output, any>]
    ? GuardServiceDependencies<Output, Yielded> extends {
        dependencies: infer Dependencies extends object;
      }
      ? Dependencies
      : {}
    : {};

type RouteGuardDepsMap<RouteDefinition> = Simplify<
  MergeObjectUnion<
    | GuardDependenciesFromReturn<
        GuardReturn<GuardOf<RouteDefinition, 'canActivate'>>
      >
    | GuardDependenciesFromReturn<
        GuardReturn<GuardOf<RouteDefinition, 'canMatch'>>
      >
  >
>;

type QueryParamsDependenciesFromOutput<Output> = Output extends object
  ? ExtractDeps<Output>
  : {};

type QueryParamsDependenciesFromReturn<Result> = [Result] extends [never]
  ? {}
  : Simplify<
      MergeObjectUnion<
        | QueryParamsDependenciesFromOutput<ResolveGeneratorResult<Result>>
        | (Result extends Generator<infer Yielded, any, unknown>
            ? ServiceDependencyMapFromYielded<Yielded>
            : {})
      >
    >;

type RouteQueryParamsDepsMap<RouteDefinition> = RouteDefinition extends {
  queryParams: (...args: any[]) => infer Result;
}
  ? QueryParamsDependenciesFromReturn<Result>
  : {};

type RouteDepsMap<RouteDefinition> = Simplify<
  MergeObjectUnion<
    | DepsMap<ComponentDepsMap<RouteDefinition>>
    | RouteGuardDepsMap<RouteDefinition>
    | RouteQueryParamsDepsMap<RouteDefinition>
  >
>;

type RouteSelfProvidedServiceNames<
  RouteDefinition,
  RouteCollectionName extends string,
> =
  | RouteAutoProvidedServiceNames<RouteDefinition, RouteCollectionName>
  | RouteProvidedServiceNames<
      RouteDefinition extends { providers: infer Providers } ? Providers : never
    >;

type RouteResolvedDepsMap<
  RouteDefinition,
  RouteCollectionName extends string,
  InheritedServiceNames extends string = never,
> = Simplify<
  StripRouteProvidedDepsMap<
    RouteDepsMap<RouteDefinition>,
    | InheritedServiceNames
    | RouteSelfProvidedServiceNames<RouteDefinition, RouteCollectionName>
  >
>;

type RouteResolvedMissingProviderMap<
  RouteDefinition,
  RouteCollectionName extends string,
  InheritedServiceNames extends string = never,
> = Simplify<
  StripRouteProvidedDepsMap<
    MissingProviderMap<ComponentDepsMap<RouteDefinition>>,
    | InheritedServiceNames
    | RouteSelfProvidedServiceNames<RouteDefinition, RouteCollectionName>
  >
>;

type RouteHttpDepsMap<RouteDefinition> = HttpDepsMapFromRequests<
  | HttpRequestsFromComponentDeps<ComponentDepsMap<RouteDefinition>>
  | HttpRequestsFromDepsMap<RouteGuardDepsMap<RouteDefinition>>
  | HttpRequestsFromDepsMap<RouteQueryParamsDepsMap<RouteDefinition>>
>;

type ShouldExposeRouteDeps<RouteDefinition> =
  ComponentDepsMap<RouteDefinition> extends { deps: object }
    ? true
    : HasGeneratorGuard<RouteDefinition> extends true
      ? true
      : RouteDefinition extends { queryParams: RouteQueryParamsFactory }
        ? true
        : false;

export type ResolveCraftRouteComponentDeps<RouteDefinition> = Simplify<
  Omit<
    ComponentDepsMap<RouteDefinition>,
    'deps' | 'propertiesDeps' | 'missingProvider' | 'publicProperties'
  > &
    (ShouldExposeRouteDeps<RouteDefinition> extends true
      ? {
          deps: RouteResolvedDepsMap<RouteDefinition, string>;
        }
      : {}) &
    ([keyof RouteHttpDepsMap<RouteDefinition>] extends [never]
      ? {}
      : {
          httpDeps: RouteHttpDepsMap<RouteDefinition>;
        }) &
    ([keyof RemainingRoutePublicProperties<RouteDefinition>] extends [never]
      ? {}
      : {
          publicProperties: RemainingRoutePublicProperties<RouteDefinition>;
        })
>;

type ResolveCraftRouteMetaDataComponentDeps<
  RouteDefinition,
  RouteCollectionName extends string,
  InheritedServiceNames extends string = never,
  InheritedPublicProperties extends object = {},
  InheritedMissingProviders extends object = {},
  InheritedHttpDeps extends object = {},
> = Simplify<
  Omit<
    ComponentDepsMap<RouteDefinition>,
    'deps' | 'propertiesDeps' | 'missingProvider' | 'publicProperties'
  > &
    (ShouldExposeRouteDeps<RouteDefinition> extends true
      ? {
          deps: RouteResolvedDepsMap<
            RouteDefinition,
            RouteCollectionName,
            InheritedServiceNames
          >;
        }
      : {}) &
    ([
      keyof MergeRouteMissingProviderValues<
        InheritedMissingProviders,
        RouteResolvedMissingProviderMap<
          RouteDefinition,
          RouteCollectionName,
          InheritedServiceNames
        >
      >,
    ] extends [never]
      ? {}
      : {
          missingProvider: MergeRouteMissingProviderValues<
            InheritedMissingProviders,
            RouteResolvedMissingProviderMap<
              RouteDefinition,
              RouteCollectionName,
              InheritedServiceNames
            >
          >;
        }) &
    ([
      keyof MergeRouteHttpDepValues<
        InheritedHttpDeps,
        RouteHttpDepsMap<RouteDefinition>
      >,
    ] extends [never]
      ? {}
      : {
          httpDeps: MergeRouteHttpDepValues<
            InheritedHttpDeps,
            RouteHttpDepsMap<RouteDefinition>
          >;
        }) &
    (ComponentDepsMap<RouteDefinition> extends { publicProperties: object }
      ? {
          publicProperties: RemainingRoutePublicProperties<
            RouteDefinition,
            InheritedPublicProperties
          >;
        }
      : {})
>;

type CraftRouteMetaDataEntry<
  RouteDefinition,
  RouteCollectionName extends string,
  ResolvedPath extends string = RoutePath<RouteDefinition>,
  InheritedServiceNames extends string = never,
  InheritedPublicProperties extends object = {},
  InheritedMissingProviders extends object = {},
  InheritedHttpDeps extends object = {},
> = Simplify<
  {
    path: ResolvedPath;
  } & RouteQueryParamsMetaDataField<RouteDefinition> &
    ResolveCraftRouteMetaDataComponentDeps<
      RouteDefinition,
      RouteCollectionName,
      InheritedServiceNames,
      InheritedPublicProperties,
      InheritedMissingProviders,
      InheritedHttpDeps
    >
>;

type CraftRouteSharedFields<
  Path extends string = string,
  RouteData extends Data = Data,
  Providers extends AngularRouteProviders = AngularRouteProviders,
> = Simplify<
  AngularRouteBase & {
    canActivate?: CraftRouteCanActivateGuard;
    canMatch?: CraftRouteCanMatchGuard;
    path: Path;
    providers?: Providers;
    data?: RouteData;
    queryParams?: RouteQueryParamsFactory;
    paramsProvider?: [PathParamNames<Path>] extends [never]
      ? never
      : RouteParamsProvider<Path>;
  }
>;

type AnyCraftRouteSharedFields = Simplify<
  AngularRouteBase & {
    canActivate?: CraftRouteCanActivateGuard;
    canMatch?: CraftRouteCanMatchGuard;
    path: string;
    providers?: AngularRouteProviders;
    data?: Data;
    queryParams?: RouteQueryParamsFactory;
    paramsProvider?: (
      params: Signal<Record<string, string>>,
    ) => Record<string, unknown>;
  }
>;

type AnyCraftRouteHelperDefinition = {
  path: string;
  data?: Data;
  paramsProvider?: (...args: any[]) => Record<string, unknown>;
  queryParams?: RouteQueryParamsFactory;
};

type RouteHelperShape<RouteDefinition> = RouteDefinition extends {
  path: infer Path extends string;
}
  ? Simplify<
      {
        path: Path;
      } & (RouteDefinition extends {
        paramsProvider: infer ParamsProvider extends (
          ...args: any[]
        ) => Record<string, unknown>;
      }
        ? {
            paramsProvider: ParamsProvider;
          }
        : {}) &
        (RouteDefinition extends { data: infer RouteData extends Data }
          ? {
              data: RouteData;
            }
          : {}) &
        (RouteDefinition extends {
          queryParams: infer QueryParams extends RouteQueryParamsFactory;
        }
          ? {
              queryParams: QueryParams;
            }
          : {})
    >
  : never;

type RoutesHelperShape<Routes extends readonly AnyCraftRouteDefinition[]> = {
  [Index in keyof Routes]: RouteHelperShape<Routes[Index]>;
};

type CraftRouteComponentTarget =
  | {
      component: AngularRouteComponent;
      loadComponent?: never;
    }
  | {
      component?: never;
      loadComponent: AngularLoadComponent;
    };

type CraftRouteLoadChildrenCallback<
  Routes extends readonly AnyCraftRouteDefinition[],
  Name extends string = string,
> = () => CraftRoutesApp<Routes, Name> | Promise<CraftRoutesApp<Routes, Name>>;

type CraftRouteOptionalLoadChildrenTarget<
  ChildRoutes extends
    readonly AnyCraftRouteDefinition[] = readonly AnyCraftRouteDefinition[],
> =
  | {
      loadChildren?: never;
    }
  | {
      loadChildren: CraftRouteLoadChildrenCallback<ChildRoutes>;
    };

export type CraftRouteDefinition<
  Path extends string = string,
  ComponentDeps = unknown,
  RouteData extends Data = Data,
  Providers extends AngularRouteProviders = AngularRouteProviders,
  ChildRoutes extends
    readonly AnyCraftRouteDefinition[] = readonly AnyCraftRouteDefinition[],
> = Simplify<
  CraftRouteSharedFields<Path, RouteData, Providers> &
    CraftRouteComponentTarget &
    CraftRouteOptionalLoadChildrenTarget<ChildRoutes> & {
      componentDeps: ComponentDeps;
    }
>;

export type CraftLazyRouteDefinition<
  Path extends string = string,
  ChildRoutes extends
    readonly AnyCraftRouteDefinition[] = readonly AnyCraftRouteDefinition[],
  RouteData extends Data = Data,
  Providers extends AngularRouteProviders = AngularRouteProviders,
> = Simplify<
  CraftRouteSharedFields<Path, RouteData, Providers> & {
    component?: never;
    componentDeps?: never;
    loadChildren: CraftRouteLoadChildrenCallback<ChildRoutes>;
    loadComponent?: never;
  }
>;

type AnyCraftComponentRouteDefinition = Simplify<
  AnyCraftRouteSharedFields &
    CraftRouteComponentTarget &
    (
      | {
          loadChildren?: never;
        }
      | {
          loadChildren: (...args: any[]) => unknown;
        }
    ) & {
      componentDeps: unknown;
    }
>;

type AnyCraftLazyRouteDefinition = Simplify<
  AnyCraftRouteSharedFields & {
    component?: never;
    componentDeps?: never;
    loadChildren: (...args: any[]) => unknown;
    loadComponent?: never;
  }
>;

type AnyCraftRouteDefinition =
  | AnyCraftComponentRouteDefinition
  | AnyCraftLazyRouteDefinition;

type LoadChildrenRoutes<RouteDefinition> = RouteDefinition extends {
  loadChildren: (...args: any[]) => infer Output;
}
  ? Awaited<Output> extends CraftRoutesApp<infer Routes>
    ? Routes
    : never
  : never;

type LoadChildrenRouteCollectionName<RouteDefinition> =
  RouteDefinition extends {
    loadChildren: (...args: any[]) => infer Output;
  }
    ? Awaited<Output> extends CraftRoutesApp<any, infer Name extends string>
      ? Name
      : never
    : never;

type RouteInheritedServiceNames<
  RouteDefinition,
  RouteCollectionName extends string,
  InheritedServiceNames extends string,
> =
  | InheritedServiceNames
  | RouteSelfProvidedServiceNames<RouteDefinition, RouteCollectionName>;

type RouteInheritedPublicProperties<
  RouteDefinition,
  InheritedPublicProperties extends object,
> = MergeRoutePublicPropertyValues<
  InheritedPublicProperties,
  RouteProvidedPublicPropertyValues<RouteDefinition>
>;

type RouteInheritedMissingProviders<
  RouteDefinition,
  RouteCollectionName extends string,
  InheritedServiceNames extends string,
  InheritedMissingProviders extends object,
> = MergeRouteMissingProviderValues<
  InheritedMissingProviders,
  RouteResolvedMissingProviderMap<
    RouteDefinition,
    RouteCollectionName,
    InheritedServiceNames
  >
>;

type RouteInheritedHttpDeps<
  RouteDefinition,
  InheritedHttpDeps extends object,
> = MergeRouteHttpDepValues<
  InheritedHttpDeps,
  RouteHttpDepsMap<RouteDefinition>
>;

type FlattenLoadChildrenRouteMetaData<
  RouteDefinition extends AnyCraftRouteDefinition,
  ParentPath extends string,
  RouteCollectionName extends string,
  InheritedServiceNames extends string,
  InheritedPublicProperties extends object,
  InheritedMissingProviders extends object,
  InheritedHttpDeps extends object,
> = [LoadChildrenRoutes<RouteDefinition>] extends [never]
  ? readonly []
  : CraftRoutesMetaDataWithContext<
      LoadChildrenRoutes<RouteDefinition>,
      LoadChildrenRouteCollectionName<RouteDefinition>,
      ParentPath,
      RouteInheritedServiceNames<
        RouteDefinition,
        RouteCollectionName,
        InheritedServiceNames
      >,
      RouteInheritedPublicProperties<
        RouteDefinition,
        InheritedPublicProperties
      >,
      RouteInheritedMissingProviders<
        RouteDefinition,
        RouteCollectionName,
        InheritedServiceNames,
        InheritedMissingProviders
      >,
      RouteInheritedHttpDeps<RouteDefinition, InheritedHttpDeps>
    >;

type FlattenCraftRouteMetaDataEntry<
  RouteDefinition extends AnyCraftRouteDefinition,
  RouteCollectionName extends string,
  ParentPath extends string = '',
  InheritedServiceNames extends string = never,
  InheritedPublicProperties extends object = {},
  InheritedMissingProviders extends object = {},
  InheritedHttpDeps extends object = {},
> = readonly [
  CraftRouteMetaDataEntry<
    RouteDefinition,
    RouteCollectionName,
    JoinRoutePaths<ParentPath, RoutePath<RouteDefinition>>,
    InheritedServiceNames,
    InheritedPublicProperties,
    InheritedMissingProviders,
    InheritedHttpDeps
  >,
  ...FlattenLoadChildrenRouteMetaData<
    RouteDefinition,
    JoinRoutePaths<ParentPath, RoutePath<RouteDefinition>>,
    RouteCollectionName,
    InheritedServiceNames,
    InheritedPublicProperties,
    InheritedMissingProviders,
    InheritedHttpDeps
  >,
];

type CraftRoutesMetaDataWithContext<
  Routes extends readonly AnyCraftRouteDefinition[],
  RouteCollectionName extends string,
  ParentPath extends string,
  InheritedServiceNames extends string,
  InheritedPublicProperties extends object,
  InheritedMissingProviders extends object,
  InheritedHttpDeps extends object,
> = number extends Routes['length']
  ? readonly CraftRouteMetaDataEntry<
      Routes[number],
      RouteCollectionName,
      string,
      InheritedServiceNames,
      InheritedPublicProperties,
      InheritedMissingProviders,
      InheritedHttpDeps
    >[]
  : Routes extends readonly [
        infer Head extends AnyCraftRouteDefinition,
        ...infer Tail extends readonly AnyCraftRouteDefinition[],
      ]
    ? readonly [
        ...FlattenCraftRouteMetaDataEntry<
          Head,
          RouteCollectionName,
          ParentPath,
          InheritedServiceNames,
          InheritedPublicProperties,
          InheritedMissingProviders,
          InheritedHttpDeps
        >,
        ...CraftRoutesMetaDataWithContext<
          Tail,
          RouteCollectionName,
          ParentPath,
          InheritedServiceNames,
          InheritedPublicProperties,
          InheritedMissingProviders,
          InheritedHttpDeps
        >,
      ]
    : readonly [];

export type CraftRoutesMetaData<
  Routes extends readonly AnyCraftRouteDefinition[],
  Name extends string = string,
> = CraftRoutesMetaDataWithContext<Routes, Name, '', never, {}, {}, {}>;

type StripHelperDependencies<Output> = Output extends {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: unknown;
}
  ? Output extends (...args: infer Args) => infer Result
    ? ((...args: Args) => Result) &
        Omit<Output, typeof SERVICE_HELPER_DEPENDENCIES>
    : Omit<Output, typeof SERVICE_HELPER_DEPENDENCIES>
  : Output;

export type CraftRouteInjectHelper<Name extends string, Output> = {
  (): StripHelperDependencies<Output>;
  readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceTrackingMetadata<
    Name,
    'toProvide',
    StripHelperDependencies<Output>,
    never,
    undefined,
    { resolve: () => StripHelperDependencies<Output> },
    false
  >;
};

type CraftRouteProvideHelper<Name extends string, Output> = (provided: {
  resolve: () => Output;
}) => BrandedServiceProvider<Name, 'toProvide', Output>;

type CraftRouteValueServiceApi<Name extends string, Output> = {
  [Key in InjectHelperName<Name>]: CraftRouteInjectHelper<Name, Output>;
} & {
  [Key in ProvideHelperName<Name>]: CraftRouteProvideHelper<Name, Output>;
};

type ParamInjectHelpers<
  Name extends string,
  Routes extends readonly AnyCraftRouteHelperDefinition[],
> = Simplify<
  MergeObjectUnion<
    PathParamNames<Routes[number]['path']> extends infer ParamName extends
      string
      ? {
          [Key in RouteParamInjectHelperName<
            Name,
            ParamName
          >]: CraftRouteValueServiceApi<
            RouteParamServiceName<Name, ParamName>,
            ParamOutputForRoutes<Routes, ParamName>
          >[RouteParamInjectHelperName<Name, ParamName>];
        }
      : never
  >
>;

type DataInjectHelpers<
  Name extends string,
  Routes extends readonly AnyCraftRouteHelperDefinition[],
> = Simplify<
  MergeObjectUnion<
    Routes[number] extends infer RouteDefinition
      ? RouteDefinition extends { data: Data }
        ? {
            [Key in RouteDataInjectHelperName<
              Name,
              RoutePath<RouteDefinition>
            >]: CraftRouteValueServiceApi<
              RouteCollectionDataServiceName<Name, RoutePath<RouteDefinition>>,
              RouteDataOutput<RouteDefinition>
            >[RouteDataInjectHelperName<Name, RoutePath<RouteDefinition>>];
          }
        : never
      : never
  >
>;

type QueryParamsInjectHelpers<
  Name extends string,
  Routes extends readonly AnyCraftRouteHelperDefinition[],
> = Simplify<
  MergeObjectUnion<
    Routes[number] extends infer RouteDefinition
      ? RouteDefinition extends { queryParams: RouteQueryParamsFactory }
        ? {
            [Key in RouteQueryParamsInjectHelperName<
              Name,
              RoutePath<RouteDefinition>
            >]: CraftRouteValueServiceApi<
              RouteCollectionQueryParamsServiceName<
                Name,
                RoutePath<RouteDefinition>
              >,
              RouteQueryParamsOutput<RouteDefinition>
            >[RouteQueryParamsInjectHelperName<
              Name,
              RoutePath<RouteDefinition>
            >];
          }
        : never
      : never
  >
>;

export type CraftRoutesApp<
  Routes extends
    readonly AnyCraftRouteDefinition[] = readonly AnyCraftRouteDefinition[],
  Name extends string = string,
> = {
  readonly name: Name;
  toRoutes(): Route[];
  META_DATA: CraftRoutesMetaData<Routes, Name>;
};

export type CraftRoutesPublicPropertiesErrors<
  Routes extends readonly AnyCraftRouteDefinition[],
> = Simplify<
  MergeObjectUnion<
    Routes[number] extends infer RouteDefinition
      ? RouteDefinition extends AnyCraftRouteDefinition
        ? MapRoutePublicPropertiesToErrors<RouteDefinition>
        : never
      : never
  >
>;

type CraftRoutesSuccessResult<
  Routes extends readonly AnyCraftRouteDefinition[],
  Name extends string = string,
> = Simplify<
  {
    [Key in RoutesExportKey<Name>]: CraftRoutesApp<Routes, Name>;
  } & ParamInjectHelpers<Name, RoutesHelperShape<Routes>> &
    DataInjectHelpers<Name, RoutesHelperShape<Routes>> &
    QueryParamsInjectHelpers<Name, RoutesHelperShape<Routes>>
>;

export type CraftRoutesResult<
  Routes extends readonly AnyCraftRouteDefinition[],
  Name extends string = string,
> = CraftRoutesSuccessResult<Routes, Name>;

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

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function uncapitalize(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function toParamServiceName(paramName: string): string {
  return toPascalCase(paramName);
}

function toRouteParamServiceName(
  routeCollectionName: string,
  paramName: string,
): string {
  return `${toRouteCollectionServiceName(routeCollectionName)}${toParamServiceName(paramName)}Params`;
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

function toRouteQueryParamsServiceName(path: string): string {
  return `${toRouteBaseServiceName(path)}QueryParams`;
}

function toRouteCollectionDataServiceName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `${toRouteCollectionServiceName(routeCollectionName)}${toRouteDataServiceName(routePath)}`;
}

function toRouteCollectionQueryParamsServiceName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `${toRouteCollectionServiceName(routeCollectionName)}${toRouteQueryParamsServiceName(routePath)}`;
}

function toRouteCollectionExportName(name: string): string {
  return `${uncapitalize(toRouteCollectionServiceName(name))}Routes`;
}

function toParamInjectHelperName(
  routeCollectionName: string,
  paramName: string,
): string {
  return `inject${toRouteParamServiceName(routeCollectionName, paramName)}`;
}

function toDataInjectHelperName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `inject${toRouteCollectionDataServiceName(routeCollectionName, routePath)}`;
}

function toQueryParamsInjectHelperName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `inject${toRouteCollectionQueryParamsServiceName(routeCollectionName, routePath)}`;
}

function toRouteCollectionServiceName(name: string): string {
  const normalizedName = toPascalCase(name);

  return normalizedName || 'Routes';
}

function toGuardServiceName(
  routeCollectionName: string,
  routeIndex: number,
  guardKind: string,
): string {
  return `craftRoutes${toRouteCollectionServiceName(routeCollectionName)}${routeIndex}${guardKind}`;
}

function findActivatedRouteByPath(
  route: ActivatedRoute,
  routePath: string,
): ActivatedRoute | null {
  if (route.routeConfig?.path === routePath) {
    return route;
  }

  for (const child of route.children ?? []) {
    const match = findActivatedRouteByPath(child, routePath);

    if (match) {
      return match;
    }
  }

  return null;
}

function getRootActivatedRoute(route: ActivatedRoute): ActivatedRoute {
  let currentRoute = route;

  while (currentRoute.parent) {
    currentRoute = currentRoute.parent;
  }

  return currentRoute;
}

function resolveActivatedRouteByPath(routePath: string): ActivatedRoute {
  const activatedRoute = inject(ActivatedRoute);
  const rootActivatedRoute = getRootActivatedRoute(activatedRoute);

  return (
    findActivatedRouteByPath(rootActivatedRoute, routePath) ?? activatedRoute
  );
}

function injectRouteParamsSignal(
  routePath: string,
): Signal<Record<string, string>> {
  const resolvedRoute = resolveActivatedRouteByPath(routePath);

  return toSignal(resolvedRoute.params, {
    initialValue: resolvedRoute.snapshot.params,
  }) as Signal<Record<string, string>>;
}

function injectRouteDataSignal<RouteData extends Data>(
  routePath: string,
): Signal<RouteData> {
  const resolvedRoute = resolveActivatedRouteByPath(routePath);

  return toSignal(resolvedRoute.data, {
    initialValue: resolvedRoute.snapshot.data,
  }) as Signal<RouteData>;
}

const ROUTE_QUERY_PARAMS_INVALID_YIELD_ERROR_MESSAGE =
  'route queryParams generators can only yield craftService dependencies or exposed dependency helpers.';
const ROUTE_QUERY_PARAMS_APP_START_ERROR_MESSAGE =
  'route queryParams generators do not support onAppStart(...).';

function executeRouteQueryParamsFactory<Output>(
  routePath: string,
  factory: RouteQueryParamsFactory<Output>,
): Output {
  const parentInjector = inject(Injector);
  const resolvedRoute = resolveActivatedRouteByPath(routePath);
  const routeScopedInjector = Injector.create({
    parent: parentInjector,
    providers: [
      {
        provide: ActivatedRoute,
        useValue: resolvedRoute,
      },
    ],
  });

  return runInInjectionContext(routeScopedInjector, () => {
    const result = factory();

    if (!isGenerator(result)) {
      return result as Output;
    }

    return runCraftGenerator({
      iterator: result,
      injector: routeScopedInjector,
      hostScope: 'function',
      invalidYieldErrorMessage: ROUTE_QUERY_PARAMS_INVALID_YIELD_ERROR_MESSAGE,
      multipleAppStartErrorMessage: ROUTE_QUERY_PARAMS_APP_START_ERROR_MESSAGE,
      onAppStartNotSupportedErrorMessage:
        ROUTE_QUERY_PARAMS_APP_START_ERROR_MESSAGE,
    }).value as Output;
  });
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
  route: AnyCraftComponentRouteDefinition,
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

function hasRouteComponentTarget(
  route: AnyCraftRouteDefinition,
): route is AnyCraftComponentRouteDefinition {
  return (
    ('component' in route && route.component !== undefined) ||
    ('loadComponent' in route && route.loadComponent !== undefined)
  );
}

function hasRouteLoadChildren(
  route: AnyCraftRouteDefinition,
): route is AnyCraftRouteDefinition & {
  loadChildren: (...args: any[]) => unknown;
} {
  return 'loadChildren' in route && typeof route.loadChildren === 'function';
}

function isCraftRoutesApp(value: unknown): value is CraftRoutesApp {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toRoutes' in value &&
    typeof value.toRoutes === 'function' &&
    'META_DATA' in value
  );
}

function createLoadChildren(
  routePath: string,
  loadChildren: AnyCraftLazyRouteDefinition['loadChildren'],
): NonNullable<Route['loadChildren']> {
  return () =>
    Promise.resolve(loadChildren()).then((childRoutes) => {
      if (!isCraftRoutesApp(childRoutes)) {
        throw new Error(
          `Route "${routePath}" loadChildren must return a craftRoutes routes object.`,
        );
      }

      return childRoutes.toRoutes();
    });
}

function createGuardExecutor<Inputs extends object, Output>(
  serviceName: string,
  factory: (inputs: Inputs) => Output | Generator<unknown, Output, unknown>,
): (inputs: Inputs) => Output {
  const serviceApi = craftService(
    { name: serviceName, scope: 'function' },
    factory as never,
  ) as unknown as CraftServiceApi<string, 'function', Inputs, Output>;
  const injectKey = `inject${capitalize(serviceName)}`;
  const injectGuard = (serviceApi as Record<string, unknown>)[injectKey];

  if (typeof injectGuard !== 'function') {
    throw new Error(`Route guard "${serviceName}" is missing its injector.`);
  }

  return injectGuard as (inputs: Inputs) => Output;
}

function createPendingGuardResult(
  source: Observable<GuardResult | undefined>,
  routePath: string,
): Observable<GuardResult> {
  return source.pipe(
    filter((value): value is GuardResult => value !== undefined),
    take(1),
    throwIfEmpty(
      () =>
        new Error(
          `Route "${routePath}" canActivate guard completed before emitting a defined result.`,
        ),
    ),
  );
}

function assertCanActivateResult(
  result: GuardResult | undefined,
  routePath: string,
): GuardResult {
  if (result === undefined) {
    throw new Error(
      `Route "${routePath}" canActivate guard must not synchronously return undefined. Return false to reject or use a Signal/Observable that stays undefined while waiting.`,
    );
  }

  return result;
}

function normalizeCanActivateResult(
  result: unknown,
  routePath: string,
): MaybeAsync<GuardResult> {
  if (isSignal(result)) {
    return createPendingGuardResult(
      toObservable(result as Signal<GuardResult | undefined>),
      routePath,
    );
  }

  if (isObservable(result)) {
    return createPendingGuardResult(
      result as Observable<GuardResult | undefined>,
      routePath,
    );
  }

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((value) =>
      assertCanActivateResult(value as GuardResult | undefined, routePath),
    );
  }

  return assertCanActivateResult(result as GuardResult | undefined, routePath);
}

function normalizeCanMatchResult(
  result: unknown,
  routePath: string,
): GuardResult {
  if (
    result === undefined ||
    isSignal(result) ||
    isObservable(result) ||
    isPromiseLike(result)
  ) {
    throw new Error(
      `Route "${routePath}" canMatch guard must return a synchronous GuardResult. Promise, Observable, Signal and undefined are not supported.`,
    );
  }

  return result as GuardResult;
}

function isPromiseLike(
  value: unknown,
): value is PromiseLike<GuardResult | undefined> {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return false;
  }

  return 'then' in value && typeof value.then === 'function';
}

function createCanActivateGuard(
  routeCollectionName: string,
  routePath: string,
  routeIndex: number,
  guard: CraftRouteCanActivateGuard,
): CanActivateFn {
  const executeGuard = createGuardExecutor(
    toGuardServiceName(routeCollectionName, routeIndex, 'CanActivateGuard'),
    (inputs: { route: ActivatedRouteSnapshot; state: RouterStateSnapshot }) =>
      guard(inputs.route, inputs.state),
  );

  return (route, state) =>
    normalizeCanActivateResult(executeGuard({ route, state }), routePath);
}

function createCanMatchGuard(
  routeCollectionName: string,
  routePath: string,
  routeIndex: number,
  guard: CraftRouteCanMatchGuard,
): CanMatchFn {
  const executeGuard = createGuardExecutor(
    toGuardServiceName(routeCollectionName, routeIndex, 'CanMatchGuard'),
    (inputs: {
      route: Route;
      segments: UrlSegment[];
      currentSnapshot?: PartialMatchRouteSnapshot;
    }) => guard(inputs.route, inputs.segments, inputs.currentSnapshot),
  );

  return (route, segments, currentSnapshot) =>
    normalizeCanMatchResult(
      executeGuard({ route, segments, currentSnapshot }),
      routePath,
    );
}

export function craftRoutes<
  const Name extends string,
  const Routes extends readonly AnyCraftRouteDefinition[],
>(
  routeCollectionName: Name,
  routes: {
    [Index in keyof Routes]: Routes[Index];
  },
): CraftRoutesResult<Routes, Name> {
  const routeValueServices = new Map<string, AnyRouteValueServiceApi>();
  const helpers: Record<string, unknown> = {};
  const routesExportKey = toRouteCollectionExportName(routeCollectionName);

  for (const route of routes) {
    for (const paramName of extractRouteParamNames(route.path)) {
      const serviceName = toRouteParamServiceName(
        routeCollectionName,
        paramName,
      );
      registerRouteValueService(
        serviceName,
        toParamInjectHelperName(routeCollectionName, paramName),
      );
    }

    if (route.data !== undefined) {
      registerRouteValueService(
        toRouteCollectionDataServiceName(routeCollectionName, route.path),
        toDataInjectHelperName(routeCollectionName, route.path),
      );
    }

    if (route.queryParams !== undefined) {
      registerRouteValueService(
        toRouteCollectionQueryParamsServiceName(
          routeCollectionName,
          route.path,
        ),
        toQueryParamsInjectHelperName(routeCollectionName, route.path),
      );
    }
  }

  const META_DATA = routes.map((route) => {
    const restComponentDeps = hasRouteComponentTarget(route)
      ? (() => {
          const componentDeps = getRouteComponentDeps(route);
          const {
            propertiesDeps: _propertiesDeps,
            missingProvider: _missingProvider,
            ...restComponentDeps
          } = componentDeps;

          return restComponentDeps;
        })()
      : {};

    return {
      path: route.path,
      ...restComponentDeps,
    };
  }) as unknown as CraftRoutesMetaData<Routes, Name>;

  const craftedRoutes: CraftRoutesApp<Routes, Name> = {
    name: routeCollectionName,
    toRoutes: () => routes.map((route, index) => toAngularRoute(route, index)),
    META_DATA,
  };

  return {
    [routesExportKey]: craftedRoutes,
    ...helpers,
  } as CraftRoutesResult<Routes, Name>;

  function registerRouteValueService(
    serviceName: string,
    helperName: string,
  ): void {
    if (routeValueServices.has(serviceName)) {
      return;
    }

    const serviceApi = createRouteValueService(serviceName);
    routeValueServices.set(serviceName, serviceApi);

    const injectKey = `inject${serviceName}`;
    helpers[helperName] = serviceApi[injectKey as InjectHelperName<string>];
  }

  function toAngularRoute(
    route: AnyCraftRouteDefinition,
    routeIndex: number,
  ): Route {
    const autoProviders: AngularRouteProviders = [];

    for (const paramName of extractRouteParamNames(route.path)) {
      const serviceName = toRouteParamServiceName(
        routeCollectionName,
        paramName,
      );
      const routeService = routeValueServices.get(serviceName);

      if (!routeService) {
        continue;
      }

      autoProviders.push(
        provideRouteValueService(serviceName, routeService, () => {
          const paramsSignal = injectRouteParamsSignal(route.path);
          const paramsProvider = route.paramsProvider as
            | ((
                params: Signal<Record<string, string>>,
              ) => Record<string, unknown>)
            | undefined;
          const providedParams = paramsProvider?.(paramsSignal);

          if (providedParams && paramName in providedParams) {
            return providedParams[paramName];
          }

          return computed(() => paramsSignal()[paramName]);
        }),
      );
    }

    if (route.data !== undefined) {
      const serviceName = toRouteCollectionDataServiceName(
        routeCollectionName,
        route.path,
      );
      const routeService = routeValueServices.get(serviceName);

      if (routeService) {
        autoProviders.push(
          provideRouteValueService(serviceName, routeService, () =>
            injectRouteDataSignal(route.path),
          ),
        );
      }
    }

    if (route.queryParams !== undefined) {
      const queryParamsFactory = route.queryParams;
      const serviceName = toRouteCollectionQueryParamsServiceName(
        routeCollectionName,
        route.path,
      );
      const routeService = routeValueServices.get(serviceName);

      if (routeService) {
        autoProviders.push(
          provideRouteValueService(serviceName, routeService, () =>
            executeRouteQueryParamsFactory(route.path, queryParamsFactory),
          ),
        );
      }
    }

    const {
      canActivate,
      canMatch,
      componentDeps: _componentDeps,
      loadChildren,
      paramsProvider: _paramsProvider,
      queryParams: _queryParams,
      ...angularRoute
    } = route;
    const wrappedCanActivate = canActivate
      ? createCanActivateGuard(
          routeCollectionName,
          route.path,
          routeIndex,
          canActivate,
        )
      : undefined;
    const wrappedCanMatch = canMatch
      ? createCanMatchGuard(
          routeCollectionName,
          route.path,
          routeIndex,
          canMatch,
        )
      : undefined;
    const wrappedLoadChildren =
      loadChildren && hasRouteLoadChildren(route)
        ? createLoadChildren(route.path, loadChildren)
        : undefined;

    return {
      ...angularRoute,
      canActivate: wrappedCanActivate ? [wrappedCanActivate] : undefined,
      canMatch: wrappedCanMatch ? [wrappedCanMatch] : undefined,
      loadChildren: wrappedLoadChildren,
      providers:
        autoProviders.length > 0 || route.providers?.length
          ? [...autoProviders, ...(route.providers ?? [])]
          : undefined,
    };
  }
}
