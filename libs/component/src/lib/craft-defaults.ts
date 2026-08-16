import {
  CRAFT_ACTIVE_ROUTE_LOAD_ERROR,
  CRAFT_LOADING_TEXT,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  craftRouteTarget,
  normalizeCraftRouteTarget,
  ɵregisterCraftRouteLoadErrorHostComponent,
  ɵregisterDefaultCraftPendingComponent,
} from '@craft-ng/core';
import { inject } from './host-runtime';
import { craftComponent } from './component';
import { div } from './hyperscript';

/**
 * The loader shown once a route's guard/resolve chain outruns both
 * `CRAFT_STAY_MS` and `CRAFT_BLANK_MS`. Override it globally with
 * `withPendingComponent`, or per route via the route's `pendingComponent`.
 *
 * This used to be an Angular component shipped by `@craft-ng/angular`, which
 * made a plain loading indicator drag the whole framework in. It is a Craft
 * component now, and `@craft-ng/component` — the package that owns the
 * renderer — is where it belongs.
 */
export const DefaultCraftPendingComponent = craftComponent(
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

/**
 * Mount point for the recovery UI of a failed lazy route load: it renders
 * whatever `CRAFT_ROUTE_LOAD_ERROR_COMPONENT` resolves to in the injector of
 * the route that failed.
 */
export const CraftRouteLoadErrorHost = craftComponent(
  'craftRouteLoadErrorHost',
  {},
  () => ({ active: inject(CRAFT_ACTIVE_ROUTE_LOAD_ERROR) }),
  ({ active }) =>
    div({ class: 'craft-route-load-error' }, function* () {
      const current = yield* active();
      if (!current) {
        return [];
      }
      const descriptor = current.injector.get(
        CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
      );
      if (!descriptor) {
        return [];
      }
      const target = normalizeCraftRouteTarget(descriptor);
      return target.kind === 'craft' ? [target.component] : [];
    }),
);

ɵregisterCraftRouteLoadErrorHostComponent(
  CraftRouteLoadErrorHost as never,
);
