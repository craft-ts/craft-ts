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
 * The component package owns this default because it owns the renderer.
 */
const DefaultCraftPendingComponent = craftComponent(
  'craftPending',
  {},
  () => div({ class: craftPending.root }, ɵinjectCraftLoadingText()),
);

ɵregisterDefaultCraftPendingComponent(
  craftRouteTarget(DefaultCraftPendingComponent),
);

// TODO: add a dynamic route recovery host that uses the failing route's injector.
// Until then core's fallback is null: a failed lazy load reports through
// CraftRouteLoadError and renders nothing, rather than throwing.

// Lets CraftTestBed.createComponent(...) mount a Craft component: only this package
// owns the renderer.
ɵsetCraftTestMounter((component, host, injector) => {
  const mounted = mountCraftComponent(component as never, host, injector);
  return {
    instance: mounted,
    destroy: () => mounted.destroy(),
  };
});
