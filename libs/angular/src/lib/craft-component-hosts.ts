import {
  Component,
  Directive,
  ElementRef,
  inject,
  Injector,
  Input,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  type SimpleChanges,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, type Subscription } from 'rxjs';
import {
  CRAFT_GLOBAL_ERROR_COMPONENT,
  CRAFT_PENDING_COMPONENT,
  CRAFT_ROOT_COMPONENT,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  CRAFT_ROUTED_COMPONENT,
  mountCraftComponent,
  ɵregisterAngularIsland,
} from '@craft-ng/component';
import { asCraftComponent, injectCraftToken } from './host-token-interop';

export {
  CRAFT_GLOBAL_ERROR_COMPONENT,
  CRAFT_PENDING_COMPONENT,
  CRAFT_ROOT_COMPONENT,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  CRAFT_ROUTED_COMPONENT,
};

export interface CraftHostMountRef {
  updateProps(props: object): void;
  destroy(): void;
}

const ANGULAR_ROUTE_PROP_SKIP = new Set([
  'craftComponent',
  'craftPendingComponent',
]);

function collectAngularRouteProps(
  route: ActivatedRoute | null | undefined,
): Record<string, unknown> {
  if (!route) {
    return {};
  }
  const props: Record<string, unknown> = {};
  const assign = (bag: Record<string, unknown> | undefined) => {
    if (!bag) {
      return;
    }
    for (const [key, value] of Object.entries(bag)) {
      if (ANGULAR_ROUTE_PROP_SKIP.has(key) || typeof value === 'function') {
        continue;
      }
      props[key] = value;
    }
  };
  for (const segment of route.pathFromRoot ?? [route]) {
    assign(segment.snapshot.params as Record<string, unknown>);
    assign(segment.snapshot.data as Record<string, unknown>);
  }
  assign(route.snapshot.queryParams as Record<string, unknown>);
  return props;
}

function createCraftHost(
  component: unknown,
  elementRef: ElementRef<Element>,
  injector: Injector,
): CraftHostMountRef {
  return mountCraftComponent(
    asCraftComponent(component),
    elementRef.nativeElement,
    injector,
    {},
  );
}

@Directive({
  selector: '[craftComponentHost]',
  standalone: true,
})
export class CraftComponentHostDirective implements OnChanges, OnDestroy {
  @Input({ required: true })
  craftComponentHost!: unknown;

  @Input()
  craftComponentProps: object = {};

  private mounted: CraftHostMountRef | undefined;

  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.craftComponentHost) {
      return;
    }

    if (changes['craftComponentHost'] || !this.mounted) {
      this.mounted?.destroy();
      this.mounted = mountCraftComponent(
        asCraftComponent(this.craftComponentHost),
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
  private readonly component = injectCraftToken<unknown>(CRAFT_ROUTED_COMPONENT, {
    optional: true,
  });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly mounted: CraftHostMountRef;
  private readonly routeSubscription: Subscription | undefined;

  constructor() {
    const component =
      this.component ?? this.route?.snapshot.data['craftComponent'];
    if (!component) {
      throw new Error(
        'CraftRoutedComponentHost requires provideCraftComponent() or route data "craftComponent".',
      );
    }
    this.mounted = mountCraftComponent(
      component,
      this.elementRef.nativeElement,
      this.injector,
      collectAngularRouteProps(this.route),
    );
    this.routeSubscription = this.route
      ? combineLatest(
          [
            ...(this.route.pathFromRoot ?? [this.route]).flatMap((segment) => [
              segment.params,
              segment.data,
            ]),
            this.route.queryParams,
          ].filter(Boolean),
        ).subscribe(() => {
          this.mounted.updateProps(collectAngularRouteProps(this.route));
        })
      : undefined;
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.mounted?.destroy();
  }
}

@Component({
  selector: 'craft-root-component-host',
  standalone: true,
  template: '',
})
export class CraftRootComponentHost implements OnInit, OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = injectCraftToken<unknown>(CRAFT_ROOT_COMPONENT);
  private mounted: CraftHostMountRef | undefined;

  ngOnInit(): void {
    this.mounted = createCraftHost(
      asCraftComponent(this.component),
      this.elementRef,
      this.injector,
    );
  }

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

@Component({
  selector: 'craft-global-error-component-host',
  standalone: true,
  template: '',
})
export class CraftGlobalErrorComponentHost implements OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = injectCraftToken<unknown>(CRAFT_GLOBAL_ERROR_COMPONENT);
  private readonly mounted = createCraftHost(
    this.component,
    this.elementRef,
    this.injector,
  );

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

@Component({
  selector: 'craft-route-load-error-component-host',
  standalone: true,
  template: '',
})
export class CraftRouteLoadErrorComponentHost implements OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = injectCraftToken<unknown>(CRAFT_ROUTE_LOAD_ERROR_COMPONENT);
  private readonly mounted = createCraftHost(
    this.component,
    this.elementRef,
    this.injector,
  );

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

@Component({
  selector: 'craft-pending-component-host',
  standalone: true,
  template: '',
})
export class CraftPendingComponentHost implements OnDestroy {
  private readonly elementRef = inject<ElementRef<Element>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly component = injectCraftToken<unknown>(CRAFT_PENDING_COMPONENT, {
    optional: true,
  });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly mounted: CraftHostMountRef;

  constructor() {
    const component =
      this.component ?? this.route?.snapshot.data['craftPendingComponent'];
    if (!component) {
      throw new Error(
        'CraftPendingComponentHost requires provideCraftPendingComponent() or route data "craftPendingComponent".',
      );
    }
    this.mounted = mountCraftComponent(
      component,
      this.elementRef.nativeElement,
      this.injector,
      collectAngularRouteProps(this.route),
    );
  }

  ngOnDestroy(): void {
    this.mounted?.destroy();
  }
}

ɵregisterAngularIsland({
  CraftRoutedComponentHost,
});
