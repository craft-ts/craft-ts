import {
  CRAFT_ROUTE_TARGET,
  craftRouteTarget,
  type ComponentDepsCarrier,
  type ComponentDepsOf,
  type ComponentExceptionsCarrier,
  type CraftRouteLazyLoadHelpers,
} from '@craft-ts/core';
import {
  CRAFT_GLOBAL_ERROR_COMPONENT,
  CRAFT_PENDING_COMPONENT,
  CRAFT_ROOT_COMPONENT,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  CRAFT_ROUTED_COMPONENT,
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
            'fieldExceptionBlock.exhaustive is required before mounting component field exceptions': ComponentFieldExceptionsOf<Component>;
          };

export function mountCraftComponent<Component extends CraftComponent<any>>(
  component: Component & RequireHandledMountFieldExceptions<Component>,
  hostElement: Element,
  injector: object,
  props: PropsOf<Component> = {} as PropsOf<Component>,
): CraftMountRef<PropsOf<Component>> {
  return mountInterpretedComponent(component, hostElement, injector, props);
}

type ValueProvider = {
  provide: object;
  useValue: unknown;
  multi?: boolean;
};

type Route = {
  providers?: readonly unknown[];
};

type Type<T> = new (...args: never[]) => T;

export {
  CRAFT_GLOBAL_ERROR_COMPONENT,
  CRAFT_PENDING_COMPONENT,
  CRAFT_ROOT_COMPONENT,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  CRAFT_ROUTED_COMPONENT,
} from './craft-host-tokens';

export function provideCraftComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_ROUTED_COMPONENT,
    useValue: component,
  };
}

type RequireHandledRouteFieldExceptions<Component> =
  IsAny<ComponentFieldExceptionsOf<Component>> extends true
    ? unknown
    : unknown extends ComponentFieldExceptionsOf<Component>
      ? unknown
      : [ComponentFieldExceptionsOf<Component>] extends [never]
        ? unknown
        : {
            'fieldExceptionBlock.exhaustive is required before routing component field exceptions': ComponentFieldExceptionsOf<Component>;
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

export function loadCraftComponent<const Component extends CraftComponent<any>>(
  loader: ((helpers: CraftRouteLazyLoadHelpers) => Promise<Component>) &
    RequireHandledRouteFieldExceptions<NoInfer<Component>>,
  additionalProviders: NonNullable<Route['providers']> = [],
): {
  loadComponent: (
    helpers: CraftRouteLazyLoadHelpers,
  ) => Promise<Type<unknown>>;
  providers: NonNullable<Route['providers']>;
} & ComponentDepsCarrier<ComponentDepsOf<Component>> &
  ComponentExceptionsCarrier<ComponentInitializationExceptionsOf<Component>> &
  CraftRouteCssVarsCarrier<
    ComponentCssVarsOf<Component>,
    ComponentNameOf<Component>
  > {
  let loadedComponent: Component | undefined;

  const fragment = {
    loadComponent: async (helpers: CraftRouteLazyLoadHelpers) => {
      loadedComponent = (await loader(helpers)) as Component;
      // The Angular host used to stand in here and read the component back out
      // of CRAFT_ROUTE_TARGET. The outlet mounts Craft components directly.
      return loadedComponent as unknown as Type<unknown>;
    },
    providers: [
      {
        provide: CRAFT_ROUTE_TARGET,
        useFactory: () => {
          if (!loadedComponent) {
            throw new Error(
              'loadCraftComponent() must finish loading before its route target is resolved.',
            );
          }
          return craftRouteTarget(loadedComponent);
        },
      },
      {
        provide: CRAFT_ROUTED_COMPONENT,
        useFactory: () => {
          if (!loadedComponent) {
            throw new Error(
              'loadCraftComponent() must finish loading before the route host is created.',
            );
          }
          return loadedComponent;
        },
      },
      ...additionalProviders,
    ],
  };

  return fragment as unknown as typeof fragment &
    ComponentDepsCarrier<ComponentDepsOf<Component>> &
    ComponentExceptionsCarrier<ComponentInitializationExceptionsOf<Component>>;
}

export function craftComponentRouteData(
  component: CraftComponent<any>,
): Readonly<Record<string, unknown>> {
  return { craftComponent: component };
}

export function provideCraftRootComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_ROOT_COMPONENT,
    useValue: component,
  };
}

export function provideCraftGlobalErrorComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_GLOBAL_ERROR_COMPONENT,
    useValue: component,
  };
}

export function provideCraftRouteLoadErrorComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
    useValue: component,
  };
}

export function provideCraftPendingComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_PENDING_COMPONENT,
    useValue: component,
  };
}

export function craftPendingComponentRouteData(
  component: CraftComponent<any>,
): Readonly<Record<string, unknown>> {
  return { craftPendingComponent: component };
}

