import {
  computed,
  inject,
  Injector,
  isSignal,
  runInInjectionContext,
  signal,
  type Signal,
  type Type,
  type WritableSignal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  RedirectCommand,
  Router,
  UrlTree,
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
import { Observable, filter, isObservable, map, take, throwIfEmpty } from 'rxjs';
import type { ExtractDeps } from './branded-component/branded-component';
import {
  type AnyCraftException,
  type StripCraftException,
} from './craft-exception';
import { type ExtractCraftGenExceptions } from './craft-gen';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import type { CraftRouteExceptionHandlerMap } from './craft-guard-runtime';
import type { CraftHttpRequest } from './craft-http-client';
import type { CraftResolveResultFn } from './craft-resolve';
import { CRAFT_ROUTE_META, type CraftRouteMeta } from './craft-route-meta';
import { CRAFT_VIEW_TRANSITION } from './craft-view-transition';
import type { ViewTransitionPayloadDef } from './craft-view-transition';
import type {
  CraftExceptionComponentInput,
  CraftExceptionHandler,
  HandledExceptionsForUnion,
  RouteExceptionUnion,
} from './craft-route-exceptions';
import { craftService } from './craft-service';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  BrandedServiceProvider,
  CraftServiceApi,
  GetInjectedServiceDependencies,
  ServiceDependencyMapFromYielded,
  ServiceTrackingMetadata,
  ServiceYieldRequest,
} from './craft-service';
import type { MergeObjectUnion, Simplify } from './craft-service.shared';
import { provideHostName } from './host-tag';

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
  | 'redirectTo'
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
type RouteGuardedDataServiceName<Path extends string> =
  `${RouteBaseServiceName<Path>}GuardedData`;
type RouteCollectionGuardedDataServiceName<
  Name extends string,
  Path extends string,
> = `${RouteCollectionServiceName<Name>}${RouteGuardedDataServiceName<Path>}`;
type RouteGuardedDataInjectHelperName<
  Name extends string,
  Path extends string,
> = InjectHelperName<RouteCollectionGuardedDataServiceName<Name, Path>>;
type RouteResolvedDataServiceName<Path extends string> =
  `${RouteBaseServiceName<Path>}ResolvedData`;
type RouteCollectionResolvedDataServiceName<
  Name extends string,
  Path extends string,
> = `${RouteCollectionServiceName<Name>}${RouteResolvedDataServiceName<Path>}`;
type RouteResolvedDataInjectHelperName<
  Name extends string,
  Path extends string,
> = InjectHelperName<RouteCollectionResolvedDataServiceName<Name, Path>>;
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
type RouteViewTransitionServiceName<Path extends string> =
  `${RouteBaseServiceName<Path>}ViewTransition`;
type RouteCollectionViewTransitionServiceName<
  Name extends string,
  Path extends string,
> = `${RouteCollectionServiceName<Name>}${RouteViewTransitionServiceName<Path>}`;
type RouteViewTransitionInjectHelperName<
  Name extends string,
  Path extends string,
> = InjectHelperName<RouteCollectionViewTransitionServiceName<Name, Path>>;

type InjectHelperName<Name extends string> = `inject${Capitalize<Name>}`;
type ProvideHelperName<Name extends string> = `provide${Capitalize<Name>}`;

type ResolveGeneratorResult<Result> =
  Result extends Generator<any, infer Output, unknown> ? Output : Result;

type RouteQueryParamsFactory<Output = unknown, Yielded = never> = () =>
  | Output
  | Generator<Yielded, Output, unknown>;

type RouteRedirectToResult = string | UrlTree;

// A `redirectTo` that can be a plain string, a synchronous/async function (a
// plain Angular `RedirectFunction`), or a generator factory that `yield*`s
// craftService dependencies before returning the redirect target. The generator
// form is what makes the redirect's service usage trackable for type-safe DI.
type RouteRedirectToFactory<Yielded = never> = (
  redirectData: PartialMatchRouteSnapshot,
) =>
  | MaybeAsync<RouteRedirectToResult>
  | Generator<Yielded, RouteRedirectToResult, unknown>;

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

type UnwrapCanActivateReturn<T> = T extends Generator<any, infer Output, any>
  ? UnwrapCanActivateReturn<Output>
  : T extends Promise<infer Inner>
    ? UnwrapCanActivateReturn<Inner>
    : T extends Observable<infer Inner>
      ? UnwrapCanActivateReturn<Inner>
      : T extends Signal<infer Inner>
        ? UnwrapCanActivateReturn<Inner>
        : T;

type ExtractCanActivateGuardData<Guard> = Guard extends (
  ...args: any[]
) => infer Result
  ? Exclude<
      UnwrapCanActivateReturn<Result>,
      | boolean
      | UrlTree
      | RedirectCommand
      | AnyCraftException
      | undefined
      | null
    >
  : never;

type RouteGuardedDataOutput<RouteDefinition> =
  RouteDefinition extends { canActivate?: infer Guard }
    ? [Guard] extends [undefined]
      ? never
      : [ExtractCanActivateGuardData<Guard>] extends [never]
        ? never
        : Signal<ExtractCanActivateGuardData<Guard>>
    : never;

// The resolved data a route's `resolve` step produces (its success value with
// guard-results and exceptions stripped), mirroring `ExtractCanActivateGuardData`.
type ExtractResolveData<Resolve> = Resolve extends (...args: any[]) => infer Result
  ? Exclude<
      UnwrapCanActivateReturn<Result>,
      boolean | UrlTree | RedirectCommand | AnyCraftException | undefined | null
    >
  : never;

type RouteResolvedDataOutput<RouteDefinition> =
  RouteDefinition extends { resolve?: infer Resolve }
    ? [Resolve] extends [undefined]
      ? never
      : [ExtractResolveData<Resolve>] extends [never]
        ? never
        : Signal<ExtractResolveData<Resolve>>
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

// The output of the generated `injectXxxViewTransition()` helper: the declared
// payload narrowed to `T | null` (the `null` = explicit opt-out the nav carries).
// Single inline conditional — kept cheap, the path registry is depth-sensitive.
type RouteViewTransitionOutput<RouteDefinition> = RouteDefinition extends {
  withLoaderViewTransitionImage: ViewTransitionPayloadDef<infer T>;
}
  ? Signal<T | null>
  : never;

// Surfaced into the slim path registry (`META_PATHS`) so the navigation helpers
// can make `viewTransition` a REQUIRED field on links/navigations to a route
// that opted in via `viewTransitionPayload<T>()`. The registry stores the marker
// AS-IS — a cheap pass-through, no narrowing: the app's `app.routes` registry is
// at TypeScript's instantiation-depth ceiling, so this per-route entry must stay
// minimal. craft-router's `ViewTransitionInputForPath` unwraps the marker to the
// declared `T | null` lazily at each navigation call site, instead of for the
// whole registered collection up front.
type RouteViewTransitionMetaDataField<RouteDefinition> =
  RouteDefinition extends {
    withLoaderViewTransitionImage: infer ViewTransition extends object;
  }
    ? { viewTransition: ViewTransition }
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
  Entry extends BrandedServiceProvider<infer Name, any, any, any>
    ? Name
    : Entry extends readonly unknown[]
      ? RouteProvidedServiceNames<Entry>
      : never;

// Resolves the providers array for both the plain-array form and the callback
// form `(helpers) => Providers[]`.
type RouteProvidersArray<Providers> = Providers extends readonly unknown[]
  ? Providers
  : Providers extends (...args: any[]) => infer Result
    ? Result
    : never;

type RouteProvidedServiceNames<Providers> =
  RouteProvidersArray<Providers> extends infer Resolved
    ? Resolved extends readonly unknown[]
      ? RouteProvidedServiceNamesFromEntry<Resolved[number]>
      : never
    : never;

// The services yielded inside callback-form providers (read off each branded
// provider's tracked `Yielded`), surfaced as a dependency map for the cascade.
type RouteProvidersYielded<Providers> =
  RouteProvidersArray<Providers> extends readonly (infer Entry)[]
    ? Entry extends BrandedServiceProvider<any, any, any, infer Yielded>
      ? Yielded
      : never
    : never;

type RouteProvidersDepsMap<RouteDefinition> = RouteDefinition extends {
  providersFn: infer Providers;
}
  ? ServiceDependencyMapFromYielded<RouteProvidersYielded<Providers>>
  : {};

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
      : never)
  | ([RouteGuardedDataOutput<RouteDefinition>] extends [never]
      ? never
      : RouteCollectionGuardedDataServiceName<
          RouteCollectionName,
          RoutePath<RouteDefinition>
        >)
  | (RouteDefinition extends { resolve: CraftRouteResolve }
      ? RouteCollectionResolvedDataServiceName<
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
  | object
  | Promise<GuardResult | object>
  | Observable<GuardResult | object | undefined>
  | Signal<GuardResult | object | undefined>;

type CraftRouteCanActivateGuard = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) =>
  | CraftRouteCanActivateResult
  | Generator<unknown, CraftRouteCanActivateResult, unknown>;

// A composing guard generator handed to `craftCanActivate`. It `yield*`s reusable
// `craftGen` guards; their dependency yields surface here (so route DI tracking
// works) alongside the `CraftGenExceptionMarker`s that advertise the reachable
// exception codes.
type CraftCanActivateGuardFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => Generator<unknown, unknown, unknown>;

type CraftCanActivateGuardYielded<Guard> = Guard extends (
  ...args: any[]
) => Generator<infer Yielded, any, unknown>
  ? Yielded
  : never;

type CraftCanActivateGuardReturn<Guard> = Guard extends (
  ...args: any[]
) => Generator<any, infer Output, unknown>
  ? Output
  : never;

// The Angular-native redirect helpers (commands-array form) plus the resolved
// exception, handed to each resolver. Native `Router` methods are used so a
// resolver can `createUrlTree(['/auth/login'])` exactly like a plain Angular guard.
type CraftGuardExceptionResolverContext<Exception extends AnyCraftException> = {
  createUrlTree: Router['createUrlTree'];
  navigate: Router['navigate'];
  navigateByUrl: Router['navigateByUrl'];
  router: Router;
  exception: Exception;
  payload: Exception extends { payload: infer Payload } ? Payload : unknown;
};

// A resolver maps an exception to a `GuardResult`. It may be a plain function or
// a generator that `yield*`s craft services first (e.g. to read a redirect URL
// from a config service) — those yields are tracked just like the guards' own.
type CraftGuardExceptionResolver<Exception extends AnyCraftException> = (
  context: CraftGuardExceptionResolverContext<Exception>,
) => GuardResult | Generator<unknown, GuardResult, unknown>;

type CraftGuardExceptionForCode<Exception, Code extends string> = Extract<
  Exception,
  { code: Code }
>;

type CraftGuardExceptionCodes<Exception> = Exception extends {
  code: infer Code extends string;
}
  ? Code
  : never;

// Exhaustive resolver map: one resolver per reachable exception code. Used as the
// concrete left side of the `resolvers` parameter intersection — it requires
// every code (a missing key is a type error) and contextually types each
// resolver's `context` param (`createUrlTree`, `exception`, …).
type CraftGuardResolvers<Yielded> =
  ExtractCraftGenExceptions<Yielded> extends infer Exception
    ? {
        [Code in CraftGuardExceptionCodes<Exception>]: CraftGuardExceptionResolver<
          Extract<CraftGuardExceptionForCode<Exception, Code>, AnyCraftException>
        >;
      }
    : never;

// The full `resolvers` parameter type. `CraftGuardResolvers<Yielded>` (concrete)
// drives contextual typing + the missing-key check; `& Resolvers` captures the
// literal so generator resolvers' dependency yields can be extracted by
// `CraftGuardResolversYielded` and folded into the guard's tracked deps.
type CraftGuardResolversParam<Yielded, Resolvers> =
  CraftGuardResolvers<Yielded> & Resolvers;

// The craft dependency yields contributed by generator-returning resolvers,
// folded into the guard's `Yielded` so route DI tracking sees redirect-time
// dependencies (a resolver that yields an unprovided service surfaces as a
// missing provider on the route).
type CraftGuardResolversYielded<Resolvers> = {
  [Code in keyof Resolvers]: Resolvers[Code] extends (
    ...args: any[]
  ) => infer Result
    ? Result extends Generator<infer Yielded, any, unknown>
      ? Yielded
      : never
    : never;
}[keyof Resolvers];

// The precise guard returned by `craftCanActivate`. Its generator `Yielded`
// preserves the composing guard's dependency requests (so `RouteGuardDepsMap`
// tracks them) and its `CraftGenExceptionMarker`s (so `handleExceptions`
// exhaustiveness sees the reachable codes); its return surfaces the guard's
// success value (data) for `injectXxxGuardedData`.
type CraftCanActivateResultGuard<Guard> = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => Generator<
  CraftCanActivateGuardYielded<Guard>,
  StripCraftException<CraftCanActivateGuardReturn<Guard>> | GuardResult,
  unknown
>;

// The `craftCanMatch` counterparts. `canMatch` has no guarded-data path and must
// resolve to a synchronous `GuardResult`, so the success branch is just a
// `GuardResult` (no data passthrough).
type CraftCanMatchGuardFn = (
  route: Route,
  segments: UrlSegment[],
  currentSnapshot?: PartialMatchRouteSnapshot,
) => Generator<unknown, unknown, unknown>;

type CraftCanMatchGuardYielded<Guard> = Guard extends (
  ...args: any[]
) => Generator<infer Yielded, any, unknown>
  ? Yielded
  : never;

type CraftCanMatchResultGuard<Guard> = (
  route: Route,
  segments: UrlSegment[],
  currentSnapshot?: PartialMatchRouteSnapshot,
) => Generator<
  CraftCanMatchGuardYielded<Guard>,
  GuardResult,
  unknown
>;

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

// Services a generator `redirectTo` depends on, read off the generator's yields.
// A non-generator `redirectTo` (plain string or plain `RedirectFunction`)
// contributes nothing.
type RedirectToDependenciesFromReturn<Result> = [Result] extends [never]
  ? {}
  : Result extends Generator<infer Yielded, any, unknown>
    ? ServiceDependencyMapFromYielded<Yielded>
    : {};

type RouteRedirectToDepsMap<RouteDefinition> = RouteDefinition extends {
  redirectTo: (...args: any[]) => infer Result;
}
  ? RedirectToDependenciesFromReturn<Result>
  : {};

type RouteDepsMap<RouteDefinition> = Simplify<
  MergeObjectUnion<
    | DepsMap<ComponentDepsMap<RouteDefinition>>
    | RouteGuardDepsMap<RouteDefinition>
    | RouteQueryParamsDepsMap<RouteDefinition>
    | RouteRedirectToDepsMap<RouteDefinition>
    | RouteProvidersDepsMap<RouteDefinition>
  >
>;

type RouteSelfProvidedServiceNames<
  RouteDefinition,
  RouteCollectionName extends string,
> =
  | RouteAutoProvidedServiceNames<RouteDefinition, RouteCollectionName>
  | RouteSelfProvidedBaseNames<RouteDefinition>
  | RouteProvidedServiceNames<
      RouteDefinition extends { providers: infer Providers } ? Providers : never
    >
  | RouteProvidedServiceNames<
      RouteDefinition extends { providersFn: infer Providers }
        ? Providers
        : never
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
  | HttpRequestsFromDepsMap<RouteRedirectToDepsMap<RouteDefinition>>
>;

type HasRedirectToGenerator<RouteDefinition> = RouteDefinition extends {
  redirectTo: (...args: any[]) => infer Result;
}
  ? IsGeneratorReturn<Result>
  : false;

type ShouldExposeRouteDeps<RouteDefinition> =
  ComponentDepsMap<RouteDefinition> extends { deps: object }
    ? true
    : HasGeneratorGuard<RouteDefinition> extends true
      ? true
      : RouteDefinition extends { queryParams: RouteQueryParamsFactory }
        ? true
        : HasRedirectToGenerator<RouteDefinition> extends true
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

// The set of missing providers reported for a route's META entry: the inherited
// (parent) context merged with the route's own (target component / guards /
// resolve), later winning on key clash.
type ResolveCraftRouteMetaDataMissingProvider<
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
      keyof ResolveCraftRouteMetaDataMissingProvider<
        RouteDefinition,
        RouteCollectionName,
        InheritedServiceNames,
        InheritedMissingProviders
      >,
    ] extends [never]
      ? {}
      : {
          missingProvider: ResolveCraftRouteMetaDataMissingProvider<
            RouteDefinition,
            RouteCollectionName,
            InheritedServiceNames,
            InheritedMissingProviders
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

// The optional data step of a route (`craftResolve(...)`), shaped like a guard.
type CraftRouteResolve = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => Generator<unknown, unknown, unknown>;

// Loose runtime type for the merged `handleExceptions` map (the precise, exhaustive
// shape is enforced by `route()`'s 3-arg overload at the call site, and by
// `assertExhaustiveRouteExceptions` as a safety net for the 2-arg form).
type CraftRouteHandleExceptions = Record<string, CraftExceptionHandler<any>>;
// NOTE: `<any>` (not `<AnyCraftException>`) keeps a route whose handlers are typed
// for *specific* exceptions assignable to `AnyCraftRouteDefinition` (the handler
// param is contravariant), so `craftRoutes` still infers a precise `Routes`.

// Craft-only execution + UX fields shared by every route shape. They are stripped
// from the emitted Angular `Route` (stashed under `CRAFT_ROUTE_META`) and consumed
// by the non-blocking `CraftRouterOutlet`.
type CraftRouteUxFields = {
  resolve?: CraftRouteResolve;
  handleExceptions?: CraftRouteHandleExceptions;
  pendingComponent?: CraftExceptionComponentInput;
  errorComponent?: Type<unknown>;
  stayMs?: number;
  blankMs?: number;
  pendingMinMs?: number;
  reactiveGuards?: boolean;
  /**
   * Opt this route into the {@link CraftRouterOutlet}-driven view transition by
   * declaring the shared-element payload shape via `viewTransitionPayload<T>()`.
   * It makes a typed `viewTransition: T | null` payload REQUIRED on every
   * `craftRouterLink` / `navigate` targeting this route (surfaced via the slim
   * path registry), exposes a generated `injectXxxViewTransition(): Signal<T |
   * null>` helper, and tells the outlet to skip the `'blank'` phase so a slow
   * chain still morphs the shared element through the pending skeleton.
   */
  withLoaderViewTransitionImage?: ViewTransitionPayloadDef<any>;
};

type CraftRouteSharedFields<
  Path extends string = string,
  RouteData extends Data = Data,
  Providers extends AngularRouteProviders = AngularRouteProviders,
> = Simplify<
  AngularRouteBase &
    CraftRouteUxFields & {
      canActivate?: CraftRouteCanActivateGuard;
      canMatch?: CraftRouteCanMatchGuard;
      path: Path;
      providers?: Providers;
      providersFn?: (helpers: any) => Providers;
      data?: RouteData;
      queryParams?: RouteQueryParamsFactory;
      redirectTo?: string | RouteRedirectToFactory<any>;
      paramsProvider?: [PathParamNames<Path>] extends [never]
        ? never
        : RouteParamsProvider<Path>;
    }
>;

type AnyCraftRouteSharedFields = Simplify<
  AngularRouteBase &
    CraftRouteUxFields & {
    canActivate?: CraftRouteCanActivateGuard;
    canMatch?: CraftRouteCanMatchGuard;
    path: string;
    providers?: AngularRouteProviders;
    providersFn?: (helpers: any) => AngularRouteProviders;
    data?: Data;
    queryParams?: RouteQueryParamsFactory;
    redirectTo?: string | RouteRedirectToFactory<any>;
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
  canActivate?: CraftRouteCanActivateGuard;
  canMatch?: CraftRouteCanMatchGuard;
  resolve?: CraftRouteResolve;
  withLoaderViewTransitionImage?: ViewTransitionPayloadDef<any>;
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
          : {}) &
        (RouteDefinition extends {
          canActivate: infer Guard extends CraftRouteCanActivateGuard;
        }
          ? { canActivate: Guard }
          : {}) &
        (RouteDefinition extends {
          resolve: infer Resolve extends CraftRouteResolve;
        }
          ? { resolve: Resolve }
          : {}) &
        (RouteDefinition extends {
          withLoaderViewTransitionImage: infer ViewTransition extends ViewTransitionPayloadDef<any>;
        }
          ? { withLoaderViewTransitionImage: ViewTransition }
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
> = () =>
  | CraftRoutesApp<Routes, Name>
  | Promise<CraftRoutesApp<Routes, Name>>
  | Route[]
  | Promise<Route[]>;

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

// A redirect-only route: no component, no lazy children, just a `redirectTo`.
// The `redirectTo` may be a generator factory whose `yield*`ed services are
// tracked for type-safe DI.
type AnyCraftRedirectRouteDefinition = Simplify<
  AnyCraftRouteSharedFields & {
    component?: never;
    componentDeps?: never;
    loadChildren?: never;
    loadComponent?: never;
    redirectTo: string | RouteRedirectToFactory<any>;
  }
>;

export type AnyCraftRouteDefinition =
  | AnyCraftComponentRouteDefinition
  | AnyCraftLazyRouteDefinition
  | AnyCraftRedirectRouteDefinition;

type LoadChildrenRoutes<RouteDefinition> = RouteDefinition extends {
  loadChildren: (...args: any[]) => infer Output;
}
  ? Awaited<Output> extends { readonly _routes: infer Routes extends readonly AnyCraftRouteDefinition[] }
    ? Routes
    : never
  : never;

type LoadChildrenRouteCollectionName<RouteDefinition> =
  RouteDefinition extends {
    loadChildren: (...args: any[]) => infer Output;
  }
    ? Awaited<Output> extends { readonly name: infer Name extends string }
      ? Name
      : never
    : never;

// ---------------------------------------------------------------------------
// .withParent placement check — assertChildRouteMounts(parentRoutes)
// ---------------------------------------------------------------------------

/**
 * The error surfaced when a `.withParent`-pinned child collection is mounted
 * under the wrong route path. Rendered as a string-literal type so it reads
 * cleanly in the assert failure.
 */
type CraftParentMountMismatch<
  Mount extends string,
  Path extends string,
> = `craftRoutes(...).withParent<ParentRoutes<'${Mount}'>>() must be loadChildren-mounted under the route with path '${Mount}', not '${Path}'`;

/**
 * Per-route check, reading the **raw** `_routes` (not the flattened `META_DATA`,
 * so it never descends into a child already validated in its own file): if a
 * route's `loadChildren` yields a collection **pinned** (via `.withParent`) to a
 * mount path different from this route's own `path`, surface a mismatch error.
 * Unpinned children (`ParentMount` = `string`) and non-lazy routes → `never`.
 */
type ChildRouteMountError<RouteDefinition> = RouteDefinition extends {
  loadChildren: (...args: any[]) => infer Output;
  path: infer Path extends string;
}
  ? Awaited<Output> extends CraftRoutesApp<
      readonly AnyCraftRouteDefinition[],
      string,
      infer Mount
    >
    ? string extends Mount
      ? never // unpinned child → mountable anywhere
      : [Mount] extends [Path]
        ? never
        : CraftParentMountMismatch<Mount, Path>
    : never
  : never;

type CollectChildRouteMountErrors<Routes> = Routes extends readonly unknown[]
  ? { [Index in keyof Routes]: ChildRouteMountError<Routes[Index]> }[number]
  : never;

/**
 * `unknown` when every `.withParent`-pinned child is mounted under its declared
 * path; otherwise the mismatch message(s). Used by {@link assertChildRouteMounts}.
 */
export type AssertChildRouteMounts<RoutesApp> = RoutesApp extends {
  readonly _routes: infer Routes;
}
  ? [Exclude<CollectChildRouteMountErrors<Routes>, never>] extends [never]
    ? unknown
    : {
        ERROR_child_collection_mounted_under_wrong_path: Exclude<
          CollectChildRouteMountErrors<Routes>,
          never
        >;
      }
  : unknown;

/**
 * Asserts (at compile time, in the **parent** collection's file) that every
 * `loadChildren` route mounting a `.withParent`-pinned child uses the path the
 * child declared. A wrong mount makes `routes` un-assignable. Scoped to the
 * parent — child files pay nothing.
 *
 * ```ts
 * export const { demoRoutes } = craftRoutes('demo', [
 *   { path: 'view-transitions', loadChildren: () => import('./vt').then((m) => m.viewTransitionsRoutes) },
 * ]);
 * assertChildRouteMounts(demoRoutes);
 * ```
 */
export function assertChildRouteMounts<RoutesApp>(
  routes: RoutesApp & AssertChildRouteMounts<RoutesApp>,
): RoutesApp {
  return routes;
}

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

// Mirror of `QueryParamsInjectHelpers` for view transitions: generates
// `injectXxxViewTransition(): Signal<T | null>` for every route that declared a
// `viewTransitionPayload<T>()`.
type ViewTransitionInjectHelpers<
  Name extends string,
  Routes extends readonly AnyCraftRouteHelperDefinition[],
> = Simplify<
  MergeObjectUnion<
    Routes[number] extends infer RouteDefinition
      ? RouteDefinition extends {
          withLoaderViewTransitionImage: ViewTransitionPayloadDef<any>;
        }
        ? {
            [Key in RouteViewTransitionInjectHelperName<
              Name,
              RoutePath<RouteDefinition>
            >]: CraftRouteValueServiceApi<
              RouteCollectionViewTransitionServiceName<
                Name,
                RoutePath<RouteDefinition>
              >,
              RouteViewTransitionOutput<RouteDefinition>
            >[RouteViewTransitionInjectHelperName<
              Name,
              RoutePath<RouteDefinition>
            >];
          }
        : never
      : never
  >
>;

type GuardedDataInjectHelpers<
  Name extends string,
  Routes extends readonly AnyCraftRouteHelperDefinition[],
> = Simplify<
  MergeObjectUnion<
    Routes[number] extends infer RouteDefinition
      ? RouteDefinition extends { canActivate: CraftRouteCanActivateGuard }
        ? [RouteGuardedDataOutput<RouteDefinition>] extends [never]
          ? never
          : {
              [Key in RouteGuardedDataInjectHelperName<
                Name,
                RoutePath<RouteDefinition>
              >]: CraftRouteValueServiceApi<
                RouteCollectionGuardedDataServiceName<
                  Name,
                  RoutePath<RouteDefinition>
                >,
                RouteGuardedDataOutput<RouteDefinition>
              >[RouteGuardedDataInjectHelperName<
                Name,
                RoutePath<RouteDefinition>
              >];
            }
        : never
      : never
  >
>;

// Mirror of `GuardedDataInjectHelpers` for the `resolve` step: generates
// `injectXxxResolvedData(): Signal<ResolvedData>` for every route with a `resolve`.
type ResolvedDataInjectHelpers<
  Name extends string,
  Routes extends readonly AnyCraftRouteHelperDefinition[],
> = Simplify<
  MergeObjectUnion<
    Routes[number] extends infer RouteDefinition
      ? RouteDefinition extends { resolve: CraftRouteResolve }
        ? [RouteResolvedDataOutput<RouteDefinition>] extends [never]
          ? never
          : {
              [Key in RouteResolvedDataInjectHelperName<
                Name,
                RoutePath<RouteDefinition>
              >]: CraftRouteValueServiceApi<
                RouteCollectionResolvedDataServiceName<
                  Name,
                  RoutePath<RouteDefinition>
                >,
                RouteResolvedDataOutput<RouteDefinition>
              >[RouteResolvedDataInjectHelperName<
                Name,
                RoutePath<RouteDefinition>
              >];
            }
        : never
      : never
  >
>;

// A route-scoped `ToYield` generator handed to the `withProviders` callback. It
// yields the route value service identified by `Name`, the route-BASE service name
// (collection-less, e.g. `QueryUserIdGuardedData`), so the enclosing provider
// factory tracks it as a dependency. The cascade strips that base name per route
// via `RouteSelfProvidedBaseNames`; any non-route yield (e.g. a global service)
// keeps its own name and surfaces as a missing provider.
type CraftRouteToYieldHelper<Name extends string, Output> = () => Generator<
  ServiceYieldRequest<
    'toProvide',
    Output,
    ServiceTrackingMetadata<Name, 'toProvide', Output, never>
  >,
  Output,
  unknown
>;

// Route-base (collection-less) param service name, e.g. `UserIdParams`.
type RouteParamBaseServiceName<ParamName extends string> =
  `${ParamServiceName<ParamName>}Params`;

type RouteParamProviderHelpers<RouteDefinition> = {
  [ParamName in PathParamNames<
    RoutePath<RouteDefinition>
  > as `${ParamServiceName<ParamName>}ParamsToYield`]: CraftRouteToYieldHelper<
    RouteParamBaseServiceName<ParamName>,
    ParamOutputForRoute<RouteDefinition, ParamName>
  >;
};

type RouteGuardedDataProviderHelper<RouteDefinition> = [
  RouteGuardedDataOutput<RouteDefinition>,
] extends [never]
  ? {}
  : {
      GuardedDataToYield: CraftRouteToYieldHelper<
        RouteGuardedDataServiceName<RoutePath<RouteDefinition>>,
        RouteGuardedDataOutput<RouteDefinition>
      >;
    };

type RouteDataProviderHelper<RouteDefinition> = RouteDefinition extends {
  data: Data;
}
  ? {
      DataToYield: CraftRouteToYieldHelper<
        RouteDataServiceName<RoutePath<RouteDefinition>>,
        RouteDataOutput<RouteDefinition>
      >;
    }
  : {};

type RouteQueryParamsProviderHelper<RouteDefinition> = RouteDefinition extends {
  queryParams: RouteQueryParamsFactory;
}
  ? {
      QueryParamsToYield: CraftRouteToYieldHelper<
        RouteQueryParamsServiceName<RoutePath<RouteDefinition>>,
        RouteQueryParamsOutput<RouteDefinition>
      >;
    }
  : {};

// The object handed to a route's `withProviders` callback: route-local short-named
// `ToYield` helpers for every auto-provisioned token that exists on the route.
type RouteProviderHelpers<RouteDefinition> = Simplify<
  RouteParamProviderHelpers<RouteDefinition> &
    RouteGuardedDataProviderHelper<RouteDefinition> &
    RouteDataProviderHelper<RouteDefinition> &
    RouteQueryParamsProviderHelper<RouteDefinition>
>;

// The route-base service names a route auto-provides (collection-less). Added to
// the cascade strip set so base-named provider yields are recognised as satisfied.
type RouteSelfProvidedBaseNames<RouteDefinition> =
  | (PathParamNames<RoutePath<RouteDefinition>> extends infer ParamName extends
      string
      ? RouteParamBaseServiceName<ParamName>
      : never)
  | (RouteDefinition extends { data: Data }
      ? RouteDataServiceName<RoutePath<RouteDefinition>>
      : never)
  | (RouteDefinition extends { queryParams: RouteQueryParamsFactory }
      ? RouteQueryParamsServiceName<RoutePath<RouteDefinition>>
      : never)
  | ([RouteGuardedDataOutput<RouteDefinition>] extends [never]
      ? never
      : RouteGuardedDataServiceName<RoutePath<RouteDefinition>>);

// Builder returned by `route(path, def)`. `.withProviders(cb)` resolves the route
// type fully before contextually typing `cb`, so the route-scoped helpers are
// fully typed (this is impossible with an inline object-literal callback, where the
// callback parameter cannot depend on the same literal's inferred type).
type RouteWithProvidersBuilder<RouteDefinition> = RouteDefinition & {
  withProviders: <Providers extends AngularRouteProviders>(
    factory: (helpers: RouteProviderHelpers<RouteDefinition>) => Providers,
  ) => Simplify<
    RouteDefinition & {
      providersFn: (helpers: RouteProviderHelpers<RouteDefinition>) => Providers;
    }
  >;
};

type CraftRoutePathRegistryEntry<
  RouteDefinition,
  ResolvedPath extends string,
> = Simplify<
  { path: ResolvedPath } & RouteQueryParamsMetaDataField<RouteDefinition> &
    RouteViewTransitionMetaDataField<RouteDefinition>
>;

type FlattenLoadChildrenPathRegistry<
  RouteDefinition,
  ParentPath extends string,
> = [LoadChildrenRoutes<RouteDefinition>] extends [never]
  ? readonly []
  : CraftRoutesPathRegistryWithContext<
      LoadChildrenRoutes<RouteDefinition>,
      ParentPath
    >;

type FlattenCraftRoutePathRegistryEntry<
  RouteDefinition extends AnyCraftRouteDefinition,
  ParentPath extends string = '',
> = readonly [
  CraftRoutePathRegistryEntry<
    RouteDefinition,
    JoinRoutePaths<ParentPath, RoutePath<RouteDefinition>>
  >,
  ...FlattenLoadChildrenPathRegistry<
    RouteDefinition,
    JoinRoutePaths<ParentPath, RoutePath<RouteDefinition>>
  >,
];

type CraftRoutesPathRegistryWithContext<
  Routes extends readonly AnyCraftRouteDefinition[],
  ParentPath extends string,
  Acc extends readonly unknown[] = readonly [],
> = number extends Routes['length']
  ? readonly [...Acc, ...CraftRoutePathRegistryEntry<Routes[number], string>[]]
  : Routes extends readonly [
        infer Head extends AnyCraftRouteDefinition,
        ...infer Tail extends readonly AnyCraftRouteDefinition[],
      ]
    ? CraftRoutesPathRegistryWithContext<
        Tail,
        ParentPath,
        readonly [
          ...Acc,
          ...FlattenCraftRoutePathRegistryEntry<Head, ParentPath>,
        ]
      >
    : Acc;

/**
 * Slim view over a routes collection: only `path` (and `queryParams` when
 * declared). Excludes `componentDeps`-derived fields on purpose — that's what
 * `META_DATA` is for.
 *
 * Nested children loaded via `loadChildren` are flattened with their joined
 * parent path (e.g. `'craft/lazy-layout/:teamId/users/:userId'`), mirroring
 * how `CraftRoutesMetaData` resolves paths.
 *
 * Use this in the `CraftRouterRoutesRegistry` augmentation. The registry only
 * needs paths and queryParams to validate `navigate({to: ...})`. Including
 * `componentDeps` would create a self-referencing cycle whenever a registered
 * component's body calls back into the router (its `GenDeps_*` would feed
 * back into the type that resolves `NavigableRoutePath`).
 *
 * `META_DATA` stays available on the same `craftRoutes` result for use cases
 * that genuinely need the resolved component dependencies — e.g. e2e tests
 * that mock every endpoint declared on a route.
 */
export type CraftRoutesPathRegistry<
  Routes extends readonly AnyCraftRouteDefinition[],
> = CraftRoutesPathRegistryWithContext<Routes, ''>;

export type CraftRoutesApp<
  Routes extends
    readonly AnyCraftRouteDefinition[] = readonly AnyCraftRouteDefinition[],
  Name extends string = string,
  /**
   * The parent mount path this child collection is **pinned** to via
   * `.withParent<ParentRoutes<'path'>>()`. Defaults to `string` = *unpinned*
   * (assignable to any `loadChildren`, backward compatible). When set to a
   * literal, the `loadChildren` slot only accepts it under a route whose `path`
   * matches — see `ValidateRouteParentMount`.
   */
  ParentMount extends string = string,
> = {
  readonly name: Name;
  /**
   * @internal phantom carrying the pinned parent mount path (`.withParent`).
   * Do not use at runtime.
   */
  readonly __craftParentMount?: ParentMount;
  /** @internal phantom property for fast type inference — do not use at runtime */
  readonly _routes: Routes;
  toRoutes(): Route[];
  /**
   * Full per-route metadata — includes `path`, `queryParams`, and the
   * `componentDeps`-derived shape (`deps`, `missingProvider`, `httpDeps`,
   * `publicProperties`). Use it for tooling that needs the full picture, e.g.
   * an e2e test runner that wants to mock every endpoint reachable from a
   * route.
   *
   * **Do not register `typeof X.META_DATA` directly in
   * `CraftRouterRoutesRegistry`** — that creates a cycle in any tracked
   * component whose `GenDeps_*` references methods that call the router. Use
   * `META_PATHS` for the registry instead.
   */
  readonly META_DATA: CraftRoutesMetaData<Routes, Name>;
  /**
   * Slim per-route view (path + queryParams only) intended for the
   * `CraftRouterRoutesRegistry` augmentation. Same array as `META_DATA` at
   * runtime — only the type view differs.
   */
  readonly META_PATHS: CraftRoutesPathRegistry<Routes>;
};

/**
 * Type-only marker naming the parent mount path a child collection is pinned to,
 * passed to `.withParent<ParentRoutes<'admin'>>()`. Carries no runtime value —
 * it only threads the mount path into the collection's `ParentMount` brand so a
 * `loadChildren` slot can require the child be mounted under that exact route.
 */
export type ParentRoutes<Mount extends string> = {
  readonly __craftParentMount: Mount;
};

type ParentMountOf<P> = P extends ParentRoutes<infer Mount> ? Mount : string;

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
  ParentMount extends string = string,
> = Simplify<
  {
    [Key in RoutesExportKey<Name>]: CraftRoutesApp<Routes, Name, ParentMount>;
  } & ParamInjectHelpers<Name, RoutesHelperShape<Routes>> &
    DataInjectHelpers<Name, RoutesHelperShape<Routes>> &
    QueryParamsInjectHelpers<Name, RoutesHelperShape<Routes>> &
    ViewTransitionInjectHelpers<Name, RoutesHelperShape<Routes>> &
    GuardedDataInjectHelpers<Name, RoutesHelperShape<Routes>> &
    ResolvedDataInjectHelpers<Name, RoutesHelperShape<Routes>>
>;

export type CraftRoutesResult<
  Routes extends readonly AnyCraftRouteDefinition[],
  Name extends string = string,
> = CraftRoutesSuccessResult<Routes, Name> & {
  /**
   * Pin this collection to a parent mount path so its `loadChildren` slot only
   * accepts it under that exact route — type-only, returns the same object at
   * runtime. Pass the target via `ParentRoutes<'path'>`:
   *
   * ```ts
   * export const { fooRoutes } = craftRoutes('foo', [...])
   *   .withParent<ParentRoutes<'admin'>>();
   * ```
   */
  withParent<Parent extends ParentRoutes<string>>(): CraftRoutesSuccessResult<
    Routes,
    Name,
    ParentMountOf<Parent>
  >;
};

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

function toRouteViewTransitionServiceName(path: string): string {
  return `${toRouteBaseServiceName(path)}ViewTransition`;
}

function toRouteCollectionViewTransitionServiceName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `${toRouteCollectionServiceName(routeCollectionName)}${toRouteViewTransitionServiceName(routePath)}`;
}

function toViewTransitionInjectHelperName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `inject${toRouteCollectionViewTransitionServiceName(routeCollectionName, routePath)}`;
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

function toRouteGuardedDataServiceName(path: string): string {
  return `${toRouteBaseServiceName(path)}GuardedData`;
}

function toRouteCollectionGuardedDataServiceName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `${toRouteCollectionServiceName(routeCollectionName)}${toRouteGuardedDataServiceName(routePath)}`;
}

function toGuardedDataInjectHelperName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `inject${toRouteCollectionGuardedDataServiceName(routeCollectionName, routePath)}`;
}

function toRouteResolvedDataServiceName(path: string): string {
  return `${toRouteBaseServiceName(path)}ResolvedData`;
}

function toRouteCollectionResolvedDataServiceName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `${toRouteCollectionServiceName(routeCollectionName)}${toRouteResolvedDataServiceName(routePath)}`;
}

function toResolvedDataInjectHelperName(
  routeCollectionName: string,
  routePath: string,
): string {
  return `inject${toRouteCollectionResolvedDataServiceName(routeCollectionName, routePath)}`;
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

function findSnapshotRouteByPath(
  snapshot: ActivatedRouteSnapshot,
  routePath: string,
): ActivatedRouteSnapshot | null {
  if (snapshot.routeConfig?.path === routePath) {
    return snapshot;
  }

  for (const child of snapshot.children) {
    const match = findSnapshotRouteByPath(child, routePath);

    if (match) {
      return match;
    }
  }

  return null;
}

function injectRouteParamsSignal(
  routePath: string,
): Signal<Record<string, string>> {
  // Read the params off the LIVE router snapshot on each navigation, rather than
  // capturing one `ActivatedRoute` and subscribing to its `params`. The route's
  // value service is a singleton cached on the (reused) route-`providers`
  // injector, while Angular creates a fresh `ActivatedRoute` on every
  // (re)activation — so a captured `route.params` observable goes stale the
  // moment the route is left and re-entered (e.g. list → detail → list →
  // detail). Driving off `Router.events` keeps the signal correct across
  // activations.
  const router = inject(Router);

  const readSnapshot = (): ActivatedRouteSnapshot | null =>
    findSnapshotRouteByPath(router.routerState.snapshot.root, routePath);

  // Only emit while this route is part of the active tree. When it deactivates
  // we deliberately DON'T emit (so `toSignal` retains the last params): the
  // component is being torn down, and clearing to `{}` mid-teardown would drop
  // anything bound to the params — e.g. a leaving page's `view-transition-name`
  // would vanish before the browser snapshots the outgoing ("old") frame,
  // killing the shared-element morph.
  return toSignal(
    router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => readSnapshot()),
      filter(
        (snapshot): snapshot is ActivatedRouteSnapshot => snapshot !== null,
      ),
      map((snapshot) => snapshot.params),
    ),
    { initialValue: readSnapshot()?.params ?? {} },
  ) as Signal<Record<string, string>>;
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

const ROUTE_REDIRECT_TO_INVALID_YIELD_ERROR_MESSAGE =
  'route redirectTo generators can only yield craftService dependencies or exposed dependency helpers.';
const ROUTE_REDIRECT_TO_APP_START_ERROR_MESSAGE =
  'route redirectTo generators do not support onAppStart(...).';

// Wraps a craft `redirectTo` factory into a plain Angular `RedirectFunction`.
// Angular runs the result in an injection context, so a generator factory can
// `yield*` craftService dependencies; we drive it with `runCraftGenerator` and
// return the resolved redirect target. Plain (non-generator) factories pass
// their result straight through.
function createRedirectTo(
  factory: RouteRedirectToFactory<unknown>,
): (redirectData: PartialMatchRouteSnapshot) => MaybeAsync<RouteRedirectToResult> {
  return (redirectData) => {
    const result = factory(redirectData);

    if (!isGenerator(result)) {
      return result as MaybeAsync<RouteRedirectToResult>;
    }

    const injector = inject(Injector);

    return runCraftGenerator({
      iterator: result,
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: ROUTE_REDIRECT_TO_INVALID_YIELD_ERROR_MESSAGE,
      multipleAppStartErrorMessage: ROUTE_REDIRECT_TO_APP_START_ERROR_MESSAGE,
      onAppStartNotSupportedErrorMessage:
        ROUTE_REDIRECT_TO_APP_START_ERROR_MESSAGE,
    }).value as RouteRedirectToResult;
  };
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
      if (isCraftRoutesApp(childRoutes)) {
        return childRoutes.toRoutes();
      }

      if (Array.isArray(childRoutes)) {
        return childRoutes as Route[];
      }

      throw new Error(
        `Route "${routePath}" loadChildren must return a craftRoutes routes object or an Angular Route array.`,
      );
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

function resolveGuardData(
  value: unknown,
  dataHolder: WritableSignal<unknown> | null,
): GuardResult | undefined {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return undefined;
  if (value instanceof UrlTree) return value;
  if (value instanceof RedirectCommand) return value;
  dataHolder?.set(value);
  return true;
}

function createPendingGuardResult(
  source: Observable<unknown>,
  routePath: string,
  dataHolder: WritableSignal<unknown> | null,
): Observable<GuardResult> {
  return source.pipe(
    map((value) => resolveGuardData(value, dataHolder)),
    filter((value): value is GuardResult => value !== undefined),
    take(1),
    throwIfEmpty(
      () =>
        new Error(
          `Route "${routePath}" guard completed before emitting a defined result.`,
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
  dataHolder: WritableSignal<unknown> | null,
): MaybeAsync<GuardResult> {
  if (isSignal(result)) {
    return createPendingGuardResult(
      toObservable(result as Signal<unknown>),
      routePath,
      dataHolder,
    );
  }

  if (isObservable(result)) {
    return createPendingGuardResult(
      result as Observable<unknown>,
      routePath,
      dataHolder,
    );
  }

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((value) =>
      assertCanActivateResult(resolveGuardData(value, dataHolder), routePath),
    );
  }

  return assertCanActivateResult(resolveGuardData(result, dataHolder), routePath);
}

function normalizeCanMatchResult(
  result: unknown,
  routePath: string,
): MaybeAsync<GuardResult> {
  // `canMatch` carries no guarded data, so the data holder is always null. A
  // composing guard that suspends on `untilSettled`/`untilDefined` surfaces here
  // as a Signal/Observable/Promise — Angular's `CanMatchFn` accepts
  // `MaybeAsync<GuardResult>`, so it is normalized the same way as `canActivate`.
  if (isSignal(result)) {
    return createPendingGuardResult(
      toObservable(result as Signal<unknown>),
      routePath,
      null,
    );
  }

  if (isObservable(result)) {
    return createPendingGuardResult(result as Observable<unknown>, routePath, null);
  }

  if (isPromiseLike(result)) {
    return Promise.resolve(result).then((value) =>
      assertCanActivateResult(resolveGuardData(value, null), routePath),
    );
  }

  return assertCanActivateResult(resolveGuardData(result, null), routePath);
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
  guardDataSignal: WritableSignal<unknown> | null,
): CanActivateFn {
  const executeGuard = createGuardExecutor(
    toGuardServiceName(routeCollectionName, routeIndex, 'CanActivateGuard'),
    (inputs: { route: ActivatedRouteSnapshot; state: RouterStateSnapshot }) =>
      guard(inputs.route, inputs.state),
  );

  return (route, state) =>
    normalizeCanActivateResult(
      executeGuard({ route, state }),
      routePath,
      guardDataSignal,
    );
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

// Composes reusable `craftGen` guards into a single `canActivate` and resolves
// their failure cases through the route's `handleExceptions`.
//
// `craftCanActivate(guard)` packages a composing `canActivate` guard. The `guard`
// `yield*`s `craftGen` guards, which short-circuit by throwing
// `CraftGenShortCircuit` when one produces a `craftException`; the non-blocking
// `CraftRouterOutlet` drives the guard after the URL commits and routes those
// exceptions through the route's exhaustive `handleExceptions` map. Identity at
// runtime — the outlet (not Angular) executes it.
//
// ```ts
// route('admin', {
//   canActivate: craftCanActivate(function* () {
//     yield* roleGuard(ROLES.PIZZERIA_ADMIN);
//     yield* noPizzeriaGuard();
//     return true;
//   }),
// }, {
//   // Third argument — required & exhaustive over the guards' reachable codes.
//   NOT_AUTHENTICATED: ({ redirect }) => redirect('/auth/login'),
//   FORBIDDEN_ROLE: ({ redirect }) => redirect('/unauthorized'),
//   HAS_PIZZERIA: ({ redirect }) => redirect('/dashboard'),
// })
// ```
export function craftCanActivate<Guard extends CraftCanActivateGuardFn>(
  guard: Guard,
): CraftCanActivateResultGuard<Guard> {
  return guard as unknown as CraftCanActivateResultGuard<Guard>;
}

// The `canMatch` counterpart of {@link craftCanActivate}. Its `craftException`s
// also flow into the route's `handleExceptions` (driven by the outlet after
// commit). Unlike `canActivate`, a `canMatch` guard produces no guarded data.
// Identity at runtime.
//
// ```ts
// {
//   path: 'beta',
//   canMatch: craftCanMatch(function* () {
//     const ff = yield* FeatureFlagsToYield();
//     return ff.betaEnabled ? true : craftException({ code: 'FLAG_DISABLED' });
//   }),
//   handleExceptions: { FLAG_DISABLED: ({ redirect }) => redirect('/home') },
// }
// ```
export function craftCanMatch<Guard extends CraftCanMatchGuardFn>(
  guard: Guard,
): CraftCanMatchResultGuard<Guard> {
  return guard as unknown as CraftCanMatchResultGuard<Guard>;
}

// Authors a single route with fully-typed, route-scoped provider helpers.
// `route('query/:userId', { canActivate, ... }).withProviders(({ GuardedDataToYield }) => [...])`
// — the `.withProviders` callback receives `ToYield` generators for the route's
// auto-provisioned tokens (guarded data, path params, query params, data), so a
// route-level provider can be built from them with full dependency tracking.
//
// Exception handlers are passed as a SEPARATE third argument (not a `def` field) so
// `Def` — and thus the union of codes reachable from `canActivate` / `canMatch` /
// `resolve` — is inferred from `def` *before* the handlers are contextually typed.
// A self-referential `def` field, or a conditional rest parameter, both collapse the
// union to `never` (the contextual type is needed before inference completes, or — for
// the rest tuple — an inline `craftCanActivate(...)` defers `Def` past the arity check).
// Two fixed-arity overloads sidestep both: the 3-arg form types the handlers exhaustively
// (full key autocomplete, rejects missing/extra codes, per-code `exception`/`payload`),
// the 2-arg form is for routes that throw no `craftException`s. A route that DOES throw
// but is authored with the 2-arg form is still caught after inference by
// {@link assertExhaustiveRouteExceptions} (the 2-arg return type carries no
// `handleExceptions`, so the reachable codes show up as unhandled).

// 3-arg form: the route's guards/resolve can throw — handlers are exhaustive over the
// reachable codes.
export function route<const Path extends string, const Def extends object>(
  path: Path,
  def: Def,
  handlers: HandledExceptionsForUnion<
    Extract<RouteExceptionUnion<Def>, AnyCraftException>
  >,
): RouteWithProvidersBuilder<
  Simplify<
    Def & {
      path: Path;
      handleExceptions: HandledExceptionsForUnion<
        Extract<RouteExceptionUnion<Def>, AnyCraftException>
      >;
    }
  >
>;
// 2-arg form: the route throws no `craftException`s, so no handlers are needed.
export function route<const Path extends string, const Def extends object>(
  path: Path,
  def: Def,
): RouteWithProvidersBuilder<Simplify<Def & { path: Path }>>;
export function route(
  path: string,
  def: object,
  handlers?: CraftRouteHandleExceptions,
): RouteWithProvidersBuilder<Record<string, unknown>> {
  const routeDefinition = {
    ...def,
    ...(handlers ? { handleExceptions: handlers } : {}),
    path,
  };

  Object.defineProperty(routeDefinition, 'withProviders', {
    value: (factory: (helpers: Record<string, unknown>) => unknown) => ({
      ...routeDefinition,
      providersFn: factory,
    }),
    enumerable: false,
  });

  return routeDefinition as unknown as RouteWithProvidersBuilder<
    Record<string, unknown>
  >;
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

    if (route.withLoaderViewTransitionImage !== undefined) {
      registerRouteValueService(
        toRouteCollectionViewTransitionServiceName(
          routeCollectionName,
          route.path,
        ),
        toViewTransitionInjectHelperName(routeCollectionName, route.path),
      );
    }

    if (route.canActivate !== undefined) {
      registerRouteValueService(
        toRouteCollectionGuardedDataServiceName(
          routeCollectionName,
          route.path,
        ),
        toGuardedDataInjectHelperName(routeCollectionName, route.path),
      );
    }

    if (route.resolve !== undefined) {
      registerRouteValueService(
        toRouteCollectionResolvedDataServiceName(
          routeCollectionName,
          route.path,
        ),
        toResolvedDataInjectHelperName(routeCollectionName, route.path),
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
    _routes: [] as unknown as Routes,
    toRoutes: () => routes.map((route, index) => toAngularRoute(route, index)),
    META_DATA,
    META_PATHS: META_DATA as unknown as CraftRoutesPathRegistry<Routes>,
  };

  const result = {
    [routesExportKey]: craftedRoutes,
    ...helpers,
  } as Record<string, unknown>;

  // `.withParent<ParentRoutes<'path'>>()` is type-only: it re-brands the result
  // (pinning the child to a mount path) but returns the very same object.
  result['withParent'] = () => result;

  return result as CraftRoutesResult<Routes, Name>;

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
    const autoProviders: AngularRouteProviders = [
      provideHostName('route:' + route.path),
    ];

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

    if (route.withLoaderViewTransitionImage !== undefined) {
      const serviceName = toRouteCollectionViewTransitionServiceName(
        routeCollectionName,
        route.path,
      );
      const routeService = routeValueServices.get(serviceName);

      if (routeService) {
        // The typed route service is a thin re-export of the single global
        // view-transition sink the outlet publishes into; the generated helper
        // narrows it to the route's declared `Signal<T | null>`.
        autoProviders.push(
          provideRouteValueService(serviceName, routeService, () =>
            inject(CRAFT_VIEW_TRANSITION),
          ),
        );
      }
    }

    let guardDataSignal: WritableSignal<unknown> | null = null;

    if (route.canActivate !== undefined) {
      const guardDataServiceName = toRouteCollectionGuardedDataServiceName(
        routeCollectionName,
        route.path,
      );
      const routeService = routeValueServices.get(guardDataServiceName);

      if (routeService) {
        guardDataSignal = signal<unknown>(undefined);
        const capturedSignal = guardDataSignal;

        autoProviders.push(
          provideRouteValueService(
            guardDataServiceName,
            routeService,
            () => capturedSignal,
          ),
        );
      }
    }

    let resolveDataSignal: WritableSignal<unknown> | null = null;

    if (route.resolve !== undefined) {
      const resolvedDataServiceName = toRouteCollectionResolvedDataServiceName(
        routeCollectionName,
        route.path,
      );
      const routeService = routeValueServices.get(resolvedDataServiceName);

      if (routeService) {
        resolveDataSignal = signal<unknown>(undefined);
        const capturedSignal = resolveDataSignal;

        autoProviders.push(
          provideRouteValueService(
            resolvedDataServiceName,
            routeService,
            () => capturedSignal,
          ),
        );
      }
    }

    const {
      canActivate,
      canMatch,
      componentDeps: _componentDeps,
      data: routeData,
      loadChildren,
      paramsProvider: _paramsProvider,
      providers: routeProviders,
      providersFn,
      queryParams: _queryParams,
      redirectTo,
      resolve,
      handleExceptions,
      pendingComponent,
      errorComponent,
      stayMs,
      blankMs,
      pendingMinMs,
      reactiveGuards,
      withLoaderViewTransitionImage,
      ...angularRoute
    } = route;
    const factoryProviders = providersFn
      ? providersFn(buildRouteProviderHelpers(route))
      : [];
    const resolvedRouteProviders = [
      ...(routeProviders ?? []),
      ...factoryProviders,
    ];
    const wrappedLoadChildren =
      loadChildren && hasRouteLoadChildren(route)
        ? createLoadChildren(route.path, loadChildren)
        : undefined;
    const wrappedRedirectTo =
      typeof redirectTo === 'function'
        ? createRedirectTo(redirectTo)
        : redirectTo;

    // Non-blocking: no blocking Angular guard is registered, so the URL commits
    // immediately. `CraftRouterOutlet` reads this meta and drives
    // canMatch → canActivate → resolve *after* commit, rendering the target only
    // on success and routing exceptions through `handleExceptions`.
    const hasCraftChain =
      canActivate !== undefined ||
      canMatch !== undefined ||
      resolve !== undefined;

    const craftMeta: CraftRouteMeta | undefined = hasCraftChain
      ? {
          match: canMatch as unknown as CraftRouteMeta['match'],
          guard: canActivate as unknown as CraftRouteMeta['guard'],
          resolve: resolve as unknown as CraftRouteMeta['resolve'],
          handleExceptions: (handleExceptions ??
            {}) as CraftRouteExceptionHandlerMap,
          guardDataSink: guardDataSignal,
          resolveDataSink: resolveDataSignal,
          pendingComponent,
          errorComponent,
          stayMs,
          blankMs,
          pendingMinMs,
          reactiveGuards: reactiveGuards ?? true,
          withLoaderViewTransitionImage:
            withLoaderViewTransitionImage !== undefined,
        }
      : undefined;

    const mergedData =
      craftMeta !== undefined
        ? { ...(routeData ?? {}), [CRAFT_ROUTE_META]: craftMeta }
        : routeData;

    return {
      ...angularRoute,
      ...(mergedData !== undefined ? { data: mergedData } : {}),
      ...(redirectTo !== undefined ? { redirectTo: wrappedRedirectTo } : {}),
      loadChildren: wrappedLoadChildren,
      providers:
        autoProviders.length > 0 || resolvedRouteProviders.length
          ? [...autoProviders, ...resolvedRouteProviders]
          : undefined,
    };
  }

  function buildRouteProviderHelpers(
    route: AnyCraftRouteDefinition,
  ): Record<string, unknown> {
    const helpers: Record<string, unknown> = {};

    const addHelper = (helperKey: string, serviceName: string): void => {
      const routeService = routeValueServices.get(serviceName);
      if (routeService) {
        helpers[helperKey] = (
          routeService as Record<string, unknown>
        )[`${serviceName}ToYield`];
      }
    };

    for (const paramName of extractRouteParamNames(route.path)) {
      addHelper(
        `${toParamServiceName(paramName)}ParamsToYield`,
        toRouteParamServiceName(routeCollectionName, paramName),
      );
    }

    if (route.data !== undefined) {
      addHelper(
        'DataToYield',
        toRouteCollectionDataServiceName(routeCollectionName, route.path),
      );
    }

    if (route.queryParams !== undefined) {
      addHelper(
        'QueryParamsToYield',
        toRouteCollectionQueryParamsServiceName(
          routeCollectionName,
          route.path,
        ),
      );
    }

    if (route.canActivate !== undefined) {
      addHelper(
        'GuardedDataToYield',
        toRouteCollectionGuardedDataServiceName(
          routeCollectionName,
          route.path,
        ),
      );
    }

    return helpers;
  }
}
