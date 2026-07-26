import type { Simplify, UnionToTuple } from './craft-service.shared';
import type { MissingProvidersFromDepsMap } from './branded-component/branded-component';
import type {
  AppConfigProvidedDependencyValuesKey,
  AppConfigProvidedServiceNamesKey,
} from './craft-app-config';

type DepsMap<Input> = Input extends { deps: infer Deps extends object }
  ? Deps
  : {};

type ProvidedMap<Input> = Input extends {
  provided: infer Provided extends object;
}
  ? Provided
  : {};

type PublicPropertiesMap<Input> = Input extends {
  publicProperties: infer PublicProperties extends object;
}
  ? PublicProperties
  : {};

type MissingProviderMap<Input> = Input extends {
  missingProvider: infer MissingProvider extends object;
}
  ? MissingProvider
  : Simplify<
      Omit<
        MissingProvidersFromDepsMap<DepsMap<Input>>,
        keyof ProvidedMap<Input>
      >
    >;

type AppProvidedServiceNames<Routes> = Routes extends {
  readonly [Key in AppConfigProvidedServiceNamesKey]?: infer ProvidedNames extends
    string;
}
  ? ProvidedNames
  : never;

type AppProvidedDependencyValues<Routes> = Routes extends {
  readonly [Key in AppConfigProvidedDependencyValuesKey]?: infer ProvidedValues;
}
  ? ProvidedValues
  : never;

type AppProvidedValueKeys<MissingProviders extends object, ProvidedValues> = {
  [Name in Extract<
    keyof MissingProviders,
    string
  >]: MissingProviders[Name] extends ProvidedValues ? Name : never;
}[Extract<keyof MissingProviders, string>];

type AppMissingProviderMap<
  AppComponentDeps,
  AppRoutes extends readonly unknown[],
> = Simplify<
  Omit<
    MissingProviderMap<AppComponentDeps>,
    | AppProvidedServiceNames<AppRoutes>
    | AppProvidedValueKeys<
        MissingProviderMap<AppComponentDeps>,
        AppProvidedDependencyValues<AppRoutes>
      >
  >
>;

type InputErrorMessage<
  Name extends string,
  Context extends string,
> = `Input "${Name}" is not provided in ${Context}`;

type InjectedErrorMessage<
  Name extends string,
  Context extends string,
> = `The ${Name} service is not provided in ${Context}`;

type InputErrorMessagesFromNames<
  Names extends readonly unknown[],
  Context extends string,
> = Names extends readonly [infer Head extends string, ...infer Tail]
  ? [
      InputErrorMessage<Head, Context>,
      ...InputErrorMessagesFromNames<Tail, Context>,
    ]
  : [];

type InjectedErrorMessagesFromNames<
  Names extends readonly unknown[],
  Context extends string,
> = Names extends readonly [infer Head extends string, ...infer Tail]
  ? [
      InjectedErrorMessage<Head, Context>,
      ...InjectedErrorMessagesFromNames<Tail, Context>,
    ]
  : [];

type InputErrorMessages<
  Input,
  Context extends string,
> = InputErrorMessagesFromNames<
  UnionToTuple<Extract<keyof PublicPropertiesMap<Input>, string>>,
  Context
>;

type InjectedErrorMessages<
  Input,
  Context extends string,
> = InjectedErrorMessagesFromNames<
  UnionToTuple<Extract<keyof MissingProviderMap<Input>, string>>,
  Context
>;

type RoutePath<RouteDefinition> = RouteDefinition extends {
  path: infer Path extends string;
}
  ? Path
  : string;

type RouteContext<RouteDefinition> = `path: "${RoutePath<RouteDefinition>}"`;

type RouteErrorMessages<RouteDefinition> = [
  ...InputErrorMessages<RouteDefinition, RouteContext<RouteDefinition>>,
  ...InjectedErrorMessages<RouteDefinition, RouteContext<RouteDefinition>>,
];

// Uses index-based access (works with mapped types like APP_CONFIG_META_DATA) and
// processes 4 routes per step to keep recursion depth ~N/4 for large route tables.
type RoutesErrorMessagesByIndex<
  Routes extends readonly unknown[],
  Traversed extends readonly unknown[] = readonly [],
> = number extends Routes['length']
  ? UnionToTuple<RouteErrorMessages<Routes[number]>[number]>
  : Traversed['length'] extends Routes['length']
    ? []
    : [...Traversed, unknown]['length'] extends Routes['length']
      ? [...RouteErrorMessages<Routes[Traversed['length']]>]
      : [...Traversed, unknown, unknown]['length'] extends Routes['length']
        ? [
            ...RouteErrorMessages<Routes[Traversed['length']]>,
            ...RouteErrorMessages<Routes[[...Traversed, unknown]['length']]>,
          ]
        : [
              ...Traversed,
              unknown,
              unknown,
              unknown,
            ]['length'] extends Routes['length']
          ? [
              ...RouteErrorMessages<Routes[Traversed['length']]>,
              ...RouteErrorMessages<Routes[[...Traversed, unknown]['length']]>,
              ...RouteErrorMessages<
                Routes[[...Traversed, unknown, unknown]['length']]
              >,
            ]
          : [
              ...RouteErrorMessages<Routes[Traversed['length']]>,
              ...RouteErrorMessages<Routes[[...Traversed, unknown]['length']]>,
              ...RouteErrorMessages<
                Routes[[...Traversed, unknown, unknown]['length']]
              >,
              ...RouteErrorMessages<
                Routes[[...Traversed, unknown, unknown, unknown]['length']]
              >,
              ...RoutesErrorMessagesByIndex<
                Routes,
                [...Traversed, unknown, unknown, unknown, unknown]
              >,
            ];

type RoutesErrorMessages<Routes extends readonly unknown[]> =
  RoutesErrorMessagesByIndex<Routes>;

type AppErrorMessages<
  AppComponentDeps,
  AppRoutes extends readonly unknown[],
> = [
  ...InputErrorMessages<AppComponentDeps, 'AppComponent'>,
  ...InjectedErrorMessagesFromNames<
    UnionToTuple<
      Extract<keyof AppMissingProviderMap<AppComponentDeps, AppRoutes>, string>
    >,
    'AppComponent'
  >,
];

export type AppCheckedDI<
  AppComponentDeps,
  AppRoutes extends readonly unknown[],
> = [
  ...AppErrorMessages<AppComponentDeps, AppRoutes>,
  ...RoutesErrorMessages<AppRoutes>,
] extends infer Errors extends string[]
  ? Errors extends []
    ? true
    : Errors
  : never;

export type CanRun<IsAppValid extends true> = IsAppValid extends true
  ? true
  : never;
