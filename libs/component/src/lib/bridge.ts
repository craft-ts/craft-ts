import {
  Component,
  Directive,
  ElementRef,
  inject,
  Injector,
  Input,
  InjectionToken,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  type SimpleChanges,
  type Type,
  type ValueProvider,
} from '@angular/core';
import { ActivatedRoute, type Route } from '@angular/router';
import {
  CRAFT_ROUTE_TARGET,
  craftRouteTarget,
  type ComponentDepsCarrier,
  type ComponentDepsOf,
  type ComponentExceptionsCarrier,
  type CraftRouteLazyLoadHelpers,
} from '@craft-ng/core';
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
import { combineLatest, type Subscription } from 'rxjs';

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
  injector: Injector,
  props: PropsOf<Component> = {} as PropsOf<Component>,
): CraftMountRef<PropsOf<Component>> {
  return mountInterpretedComponent(component, hostElement, injector, props);
}

@Directive({
  selector: '[craftComponentHost]',
  standalone: true,
})
export class CraftComponentHostDirective implements OnChanges, OnDestroy {
  @Input({ required: true })
  craftComponentHost!: CraftComponent<any>;

  @Input()
  craftComponentProps: object = {};

  private mounted: CraftMountRef<object> | undefined;

  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.craftComponentHost) {
      return;
    }

    if (changes['craftComponentHost'] || !this.mounted) {
      this.mounted?.destroy();
      this.mounted = mountCraftComponent(
        this.craftComponentHost,
        this.elementRef.nativeElement,
        this.injector,
        this.craftComponentProps,
      );
      return;
    }

    if (changes['craftComponentProps']) {
      this.mounted.updateProps(this.craftComponentProps);
    }
  }

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

@Component({
  selector: 'craft-routed-component-host',
  standalone: true,
  template: '',
})
export class CraftRoutedComponentHost implements OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = inject(CRAFT_ROUTED_COMPONENT, {
    optional: true,
  });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly mounted: CraftMountRef<object>;
  private readonly routeSubscription: Subscription | undefined;

  constructor() {
    const component =
      this.component ??
      (this.route?.snapshot.data['craftComponent'] as
        | CraftComponent<any>
        | undefined);
    if (!component) {
      throw new Error(
        'CraftRoutedComponentHost requires provideCraftComponent() or route data "craftComponent".',
      );
    }
    this.mounted = mountCraftComponent(
      component,
      this.elementRef.nativeElement,
      this.injector,
      {
        ...this.route?.snapshot.params,
        ...this.route?.snapshot.queryParams,
        ...this.route?.snapshot.data,
      },
    );
    this.routeSubscription = this.route
      ? combineLatest([
          this.route.params,
          this.route.queryParams,
          this.route.data,
        ]).subscribe(([params, queryParams, data]) => {
          this.mounted.updateProps({
            ...params,
            ...queryParams,
            ...data,
          });
        })
      : undefined;
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.mounted?.destroy();
  }
}

export const CRAFT_ROUTED_COMPONENT = new InjectionToken<CraftComponent<any>>(
  'CRAFT_ROUTED_COMPONENT',
);

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
  ) => Promise<Type<CraftRoutedComponentHost>>;
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
      return CraftRoutedComponentHost;
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

export const CRAFT_ROOT_COMPONENT = new InjectionToken<CraftComponent<any>>(
  'CRAFT_ROOT_COMPONENT',
);

@Component({
  selector: 'craft-root-component-host',
  standalone: true,
  template: '',
})
export class CraftRootComponentHost implements OnInit, OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = inject(CRAFT_ROOT_COMPONENT);
  private mounted: CraftMountRef<object> | undefined;

  ngOnInit(): void {
    this.mounted = createCraftHost(
      this.component,
      this.elementRef,
      this.injector,
    );
  }

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

export function provideCraftRootComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_ROOT_COMPONENT,
    useValue: component,
  };
}

function createCraftHost(
  component: CraftComponent<any>,
  elementRef: ElementRef<Element>,
  injector: Injector,
): CraftMountRef<object> {
  return mountCraftComponent(component, elementRef.nativeElement, injector, {});
}

export const CRAFT_GLOBAL_ERROR_COMPONENT = new InjectionToken<
  CraftComponent<any>
>('CRAFT_GLOBAL_ERROR_COMPONENT');

@Component({
  selector: 'craft-global-error-component-host',
  standalone: true,
  template: '',
})
export class CraftGlobalErrorComponentHost implements OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = inject(CRAFT_GLOBAL_ERROR_COMPONENT);
  private readonly mounted = createCraftHost(
    this.component,
    this.elementRef,
    this.injector,
  );

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

export function provideCraftGlobalErrorComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_GLOBAL_ERROR_COMPONENT,
    useValue: component,
  };
}

export const CRAFT_ROUTE_LOAD_ERROR_COMPONENT = new InjectionToken<
  CraftComponent<any>
>('CRAFT_ROUTE_LOAD_ERROR_COMPONENT');

@Component({
  selector: 'craft-route-load-error-component-host',
  standalone: true,
  template: '',
})
export class CraftRouteLoadErrorComponentHost implements OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = inject(CRAFT_ROUTE_LOAD_ERROR_COMPONENT);
  private readonly mounted = createCraftHost(
    this.component,
    this.elementRef,
    this.injector,
  );

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

export function provideCraftRouteLoadErrorComponent(
  component: CraftComponent<any>,
): ValueProvider {
  return {
    provide: CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
    useValue: component,
  };
}

export const CRAFT_PENDING_COMPONENT = new InjectionToken<CraftComponent<any>>(
  'CRAFT_PENDING_COMPONENT',
);

@Component({
  selector: 'craft-pending-component-host',
  standalone: true,
  template: '',
})
export class CraftPendingComponentHost implements OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = inject(CRAFT_PENDING_COMPONENT, {
    optional: true,
  });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly mounted: CraftMountRef<object>;

  constructor() {
    const component =
      this.component ??
      (this.route?.snapshot.data['craftPendingComponent'] as
        | CraftComponent<any>
        | undefined);
    if (!component) {
      throw new Error(
        'CraftPendingComponentHost requires provideCraftPendingComponent() or route data "craftPendingComponent".',
      );
    }
    this.mounted = mountCraftComponent(
      component,
      this.elementRef.nativeElement,
      this.injector,
      {
        ...this.route?.snapshot.params,
        ...this.route?.snapshot.queryParams,
        ...this.route?.snapshot.data,
      },
    );
  }

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
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
