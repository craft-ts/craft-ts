import {
  craftRouteTarget,
  provideCraftRouteTarget,
  type ComponentDepsCarrier,
  type ComponentDepsOf,
  type ComponentExceptionsCarrier,
  type CraftRouteAdditionalProvidersCarrier,
  type CraftRouteLazyLoadHelpers,
} from '@craft-ts/core';
import {
  provideCraftGlobalErrorComponent as provideGlobalErrorComponentService,
  provideCraftPendingComponent as providePendingComponentService,
  provideCraftRootComponent as provideRootComponentService,
  provideCraftRouteLoadErrorComponent as provideRouteLoadErrorComponentService,
  provideCraftRoutedComponent as provideRoutedComponentService,
} from './craft-host-tokens';
import {
  mountInterpretedComponent,
  type MountedCraftComponent,
} from './render/interpreter';
import type {
  ComponentFieldExceptionsOf,
  ComponentInitializationExceptionsOf,
  ComponentCssVarsOf,
  ComponentNameOf,
  CraftComponent,
  PropsOf,
} from './types';
import type { CssVarContract } from './css-vars.type';

export type CraftMountRef<Props extends object> = MountedCraftComponent<Props>;

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type RequireHandledMountFieldExceptions<Component> =
  IsAny<ComponentFieldExceptionsOf<Component>> extends true
    ? unknown
    : unknown extends ComponentFieldExceptionsOf<Component>
      ? unknown
      : [ComponentFieldExceptionsOf<Component>] extends [never]
        ? unknown
        : {
            'fieldErrorNode.exhaustive is required before mounting component field exceptions': ComponentFieldExceptionsOf<Component>;
          };

export function mountCraftComponent<Component extends CraftComponent<any>>(
  component: Component & RequireHandledMountFieldExceptions<Component>,
  hostElement: Element,
  injector: object,
  props: PropsOf<Component> = {} as PropsOf<Component>,
): CraftMountRef<PropsOf<Component>> {
  return mountInterpretedComponent(component, hostElement, injector, props);
}

type Route = {
  providers?: readonly unknown[];
};

type Type<T> = new (...args: never[]) => T;

export function provideCraftComponent(
  component: CraftComponent<any>,
): unknown {
  return provideRoutedComponentService(component);
}

type RequireHandledRouteFieldExceptions<Component> =
  IsAny<ComponentFieldExceptionsOf<Component>> extends true
    ? unknown
    : unknown extends ComponentFieldExceptionsOf<Component>
      ? unknown
      : [ComponentFieldExceptionsOf<Component>] extends [never]
        ? unknown
        : {
            'fieldErrorNode.exhaustive is required before routing component field exceptions': ComponentFieldExceptionsOf<Component>;
          };

export type CraftRouteCssVarsCarrier<
  Contract extends CssVarContract = CssVarContract,
  Name extends string = string,
> = {
  readonly __craftRouteCssVars__?: {
    readonly component: Name;
    readonly contract: Contract;
  };
};

type RouteCssVarErrors<Value> = Value extends {
  readonly _routes: infer Routes;
}
  ? RouteCssVarErrors<Routes>
  : Value extends readonly (infer Route)[]
    ? RouteCssVarErrors<Route>
    : Value extends CraftRouteCssVarsCarrier<
          infer Contract,
          infer Name extends string
        >
      ? [Contract['required']] extends [never]
        ? never
        : {
            readonly component: Name;
            readonly missing: Contract['required'];
          }
      : Value extends { readonly children?: infer Children }
        ? RouteCssVarErrors<NonNullable<Children>>
        : never;

type AssertCssVarsSatisfied<Routes> = [RouteCssVarErrors<Routes>] extends [
  never,
]
  ? unknown
  : { readonly ERROR_unsatisfied_css_vars: RouteCssVarErrors<Routes> };

/** Compile-time proof that no required CSS variable reaches a route root. */
export function assertCssVarsSatisfied<Routes>(
  routes: Routes & AssertCssVarsSatisfied<Routes>,
): Routes {
  return routes;
}

export function loadCraftComponent<
  const Component extends CraftComponent<any>,
  const AdditionalProviders extends NonNullable<Route['providers']> = readonly [],
>(
  loader: ((helpers: CraftRouteLazyLoadHelpers) => Promise<Component>) &
    RequireHandledRouteFieldExceptions<NoInfer<Component>>,
  additionalProviders: AdditionalProviders = [] as unknown as AdditionalProviders,
): {
  loadComponent: (
    helpers: CraftRouteLazyLoadHelpers,
  ) => Promise<Type<unknown>>;
  providers: NonNullable<Route['providers']>;
} & ComponentDepsCarrier<ComponentDepsOf<Component>> &
  ComponentExceptionsCarrier<ComponentInitializationExceptionsOf<Component>> &
  CraftRouteAdditionalProvidersCarrier<AdditionalProviders> &
  CraftRouteCssVarsCarrier<
    ComponentCssVarsOf<Component>,
    ComponentNameOf<Component>
  > {
  let loadedComponent: Component | undefined;

  const fragment = {
    loadComponent: async (helpers: CraftRouteLazyLoadHelpers) => {
      loadedComponent = (await loader(helpers)) as Component;
      // The Angular host used to stand in here and read the component back out
      // of the route-target service. The outlet mounts Craft components directly.
      return loadedComponent as unknown as Type<unknown>;
    },
    providers: [
      provideCraftRouteTarget(() => {
          if (!loadedComponent) {
            throw new Error(
              'loadCraftComponent() must finish loading before its route target is resolved.',
            );
          }
          return craftRouteTarget(loadedComponent);
        }),
      {
        ...provideRoutedComponentService(() => {
          if (!loadedComponent) {
            throw new Error(
              'loadCraftComponent() must finish loading before the route host is created.',
            );
          }
          return loadedComponent;
        }),
      },
      ...additionalProviders,
    ],
  };

  return fragment as unknown as {
    loadComponent: (
      helpers: CraftRouteLazyLoadHelpers,
    ) => Promise<Type<unknown>>;
    providers: NonNullable<Route['providers']>;
  } &
    ComponentDepsCarrier<ComponentDepsOf<Component>> &
    ComponentExceptionsCarrier<ComponentInitializationExceptionsOf<Component>> &
    CraftRouteAdditionalProvidersCarrier<AdditionalProviders>;
}

export function craftComponentRouteData(
  component: CraftComponent<any>,
): Readonly<Record<string, unknown>> {
  return { craftComponent: component };
}

export function provideCraftRootComponent(
  component: CraftComponent<any>,
): unknown {
  return provideRootComponentService(component);
}

export function provideCraftGlobalErrorComponent(
  component: CraftComponent<any>,
): unknown {
  return provideGlobalErrorComponentService(component);
}

export function provideCraftRouteLoadErrorComponent(
  component: CraftComponent<any>,
): unknown {
  return provideRouteLoadErrorComponentService(component);
}

export function provideCraftPendingComponent(
  component: CraftComponent<any>,
): unknown {
  return providePendingComponentService(component);
}

export function craftPendingComponentRouteData(
  component: CraftComponent<any>,
): Readonly<Record<string, unknown>> {
  return { craftPendingComponent: component };
}
