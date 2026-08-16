import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  signal,
  type Type,
} from '@angular/core';
import {
  CRAFT_ACTIVE_ROUTE_LOAD_ERROR,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  ɵregisterCraftRouteLoadErrorHostComponent,
  normalizeCraftRouteTarget,
  type CraftExceptionComponentDescriptor,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import { injectCraft } from './inject-craft';

@Component({
  standalone: true,
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container
      [ngComponentOutlet]="component()"
      [ngComponentOutletInjector]="componentInjector()"
    />
  `,
})
export class CraftRouteLoadErrorHostComponent {
  private readonly active = injectCraft(CRAFT_ACTIVE_ROUTE_LOAD_ERROR);
  readonly componentInjector = signal<EnvironmentInjector | undefined>(
    this.active()?.injector,
  );
  readonly component = signal<Type<unknown> | null>(
    resolveEagerComponent(
      this.active()?.injector.get(CRAFT_ROUTE_LOAD_ERROR_COMPONENT) ?? null,
    ),
  );
}

function resolveEagerComponent(
  descriptor: CraftExceptionComponentDescriptor | null,
): Type<unknown> | null {
  if (!descriptor) return null;
  if (descriptor.component) {
    const target = normalizeCraftRouteTarget(descriptor.component);
    if (target.kind === 'angular') {
      return target.component as Type<unknown>;
    }
    throw new Error(
      'The Angular route-load recovery host cannot render a Craft target directly. Configure the @craft-ng/component compatibility host for chunk recovery.',
    );
  }
  throw new Error(
    'withRouteLoadError requires an eager error component because lazy loading is unavailable after a route chunk failure.',
  );
}

ɵregisterCraftRouteLoadErrorHostComponent(CraftRouteLoadErrorHostComponent);

export type GenDeps_CraftRouteLoadErrorHostComponent = GetDeps<{
  deps: {
    NgComponentOutlet: NgComponentOutlet;
  };
  propertiesDeps: {
    active: {
      CRAFT_ACTIVE_ROUTE_LOAD_ERROR: typeof CRAFT_ACTIVE_ROUTE_LOAD_ERROR;
    };
    componentInjector: ExtractDeps<
      CraftRouteLoadErrorHostComponent['componentInjector']
    >;
    component: ExtractDeps<CraftRouteLoadErrorHostComponent['component']>;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<CraftRouteLoadErrorHostComponent>;
  missingProvider: {
    CRAFT_ACTIVE_ROUTE_LOAD_ERROR: typeof CRAFT_ACTIVE_ROUTE_LOAD_ERROR;
  };
}>;
