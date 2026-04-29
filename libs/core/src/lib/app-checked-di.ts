import type {
  MergeObjectUnion,
  Simplify,
  UnionToTuple,
} from './craft-service.shared';
import type { MissingProvidersFromDepsMap } from './branded-component/branded-component';

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

type InputErrorMessage<
  Name extends string,
  Context extends string,
> = `Input "${Name}" is not provided in ${Context}`;

type InjectedErrorMessage<
  Name extends string,
  Context extends string,
> = `Injected ${Name} is not provided in ${Context}`;

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

type RoutesErrorMessages<Routes extends readonly unknown[]> =
  Routes extends readonly [infer Head, ...infer Tail]
    ? [...RouteErrorMessages<Head>, ...RoutesErrorMessages<Tail>]
    : [];

type AppErrorMessages<AppComponentDeps> = [
  ...InputErrorMessages<AppComponentDeps, 'AppComponent'>,
  ...InjectedErrorMessages<AppComponentDeps, 'AppComponent'>,
];

export type AppCheckedDI<
  AppComponentDeps,
  AppRoutes extends readonly unknown[],
> = [
  ...AppErrorMessages<AppComponentDeps>,
  ...RoutesErrorMessages<AppRoutes>,
] extends infer Errors extends string[]
  ? Errors extends []
    ? true
    : Errors
  : never;

export type CanRun<IsAppValid extends true> = IsAppValid extends true
  ? true
  : never;
