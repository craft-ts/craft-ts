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
import type {
  ComponentDepsCarrier,
  ComponentDepsOf,
  CraftRouteLazyLoadHelpers,
} from '@craft-ng/core';
import {
  mountInterpretedComponent,
  type MountedCraftComponent,
} from './render/interpreter';
import type { CraftComponent, PropsOf } from './types';
import { combineLatest, type Subscription } from 'rxjs';

export type CraftMountRef<Props extends object> = MountedCraftComponent<Props>;

export function mountCraftComponent<Component extends CraftComponent<any>>(
  component: Component,
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

export function loadCraftComponent<Component extends CraftComponent<any>>(
  loader: (helpers: CraftRouteLazyLoadHelpers) => Promise<Component>,
  additionalProviders: NonNullable<Route['providers']> = [],
): {
  loadComponent: (
    helpers: CraftRouteLazyLoadHelpers,
  ) => Promise<Type<CraftRoutedComponentHost>>;
  providers: NonNullable<Route['providers']>;
} & ComponentDepsCarrier<ComponentDepsOf<Component>> {
  let loadedComponent: Component | undefined;

  const fragment = {
    loadComponent: async (helpers: CraftRouteLazyLoadHelpers) => {
      loadedComponent = await loader(helpers);
      return CraftRoutedComponentHost;
    },
    providers: [
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

  return fragment as typeof fragment &
    ComponentDepsCarrier<ComponentDepsOf<Component>>;
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
