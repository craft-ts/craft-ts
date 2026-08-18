import {
  CRAFT_LOADING_TEXT,
  craftRouteTarget,
  ɵregisterDefaultCraftPendingComponent,
  ɵsetCraftTestMounter,
} from '@craft-ts/core';
import { mountCraftComponent } from './bridge';
import { inject } from './host-runtime';
import { craftComponent } from './component';
import { div } from './hyperscript';

/**
 * The loader shown once a route's guard/resolve chain outruns both
 * `CRAFT_STAY_MS` and `CRAFT_BLANK_MS`. Override it globally with
 * `withPendingComponent`, or per route via the route's `pendingComponent`.
 *
 * This used to be an Angular component shipped by `@craft-ts/angular`, which
 * made a plain loading indicator drag the whole framework in. It is a Craft
 * component now, and `@craft-ts/component` — the package that owns the
 * renderer — is where it belongs.
 */
const DefaultCraftPendingComponent = craftComponent(
  'craftPending',
  {
    styles: `
      .craft-pending {
        padding: 1rem;
        font-family: system-ui, -apple-system, sans-serif;
        color: #6b7280;
      }
    `,
  },
  () => ({ loading: inject(CRAFT_LOADING_TEXT) }),
  ({ loading }) => div({ class: 'craft-pending' }, loading),
);

ɵregisterDefaultCraftPendingComponent(
  craftRouteTarget(DefaultCraftPendingComponent),
);

// TODO(sortie-angular): the lazy-route recovery host has no Craft replacement
// yet. The Angular one mounted CRAFT_ROUTE_LOAD_ERROR_COMPONENT through
// NgComponentOutlet, using the failing route's own injector; the Craft DSL has
// no equivalent dynamic mount, so writing one is its own piece of work.
// Until then core's fallback is null: a failed lazy load reports through
// CRAFT_ROUTE_LOAD_ERROR and renders nothing, rather than throwing.

// Lets TestBed.createComponent(...) mount a Craft component: only this package
// owns the renderer.
ɵsetCraftTestMounter((component, host, injector) => {
  const mounted = mountCraftComponent(component as never, host, injector);
  return {
    instance: mounted,
    destroy: () => mounted.destroy(),
  };
});
