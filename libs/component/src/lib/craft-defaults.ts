import {
  craftRouteTarget,
  ɵinjectCraftLoadingText,
  ɵregisterDefaultCraftPendingComponent,
  ɵsetCraftTestMounter,
} from '@craft-ts/core';
import { mountCraftComponent } from './bridge';
import { craftComponent } from './component';
import { div } from './hyperscript';
import { craftPending } from './craft-defaults.style';

/**
 * The loader shown once a route's guard/resolve chain outruns both
 * `CraftStayMs` and `CraftBlankMs`. Override them globally with
 * `withPendingComponent`, or per route via the route's `pendingComponent`.
 *
 * This used to be an Angular component shipped by `@craft-ts/angular`, which
 * made a plain loading indicator drag the whole framework in. It is a Craft
 * component now, and `@craft-ts/component` — the package that owns the
 * renderer — is where it belongs.
 */
const DefaultCraftPendingComponent = craftComponent(
  'craftPending',
  {},
  () => ({ loading: ɵinjectCraftLoadingText() }),
  ({ loading }) => div({ class: craftPending.root }, loading),
);

ɵregisterDefaultCraftPendingComponent(
  craftRouteTarget(DefaultCraftPendingComponent),
);

// TODO(sortie-angular): the lazy-route recovery host has no Craft replacement
// yet. The Angular one mounted the route-load error component through
// NgComponentOutlet, using the failing route's own injector; the Craft DSL has
// no equivalent dynamic mount, so writing one is its own piece of work.
// Until then core's fallback is null: a failed lazy load reports through
// CraftRouteLoadError and renders nothing, rather than throwing.

// Lets TestBed.createComponent(...) mount a Craft component: only this package
// owns the renderer.
ɵsetCraftTestMounter((component, host, injector) => {
  const mounted = mountCraftComponent(component as never, host, injector);
  return {
    instance: mounted,
    destroy: () => mounted.destroy(),
  };
});
