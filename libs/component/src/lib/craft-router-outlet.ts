import {
  craftService,
  craftUse,
  createCraftRouterOutletController,
} from '@craft-ts/core';
import { craftComponent } from './component';
import type { CraftComponent } from './types';
import type { ComponentNode } from './render/vnode';

/**
 * Functional non-blocking router outlet.
 *
 * The routing state machine lives in `@craft-ts/core`; this component owns its
 * render lifetime and mounts the active Angular route target with the
 * route-scoped injector supplied by the controller.
 */
type CraftRouterOutletTemplate = () => unknown;

/**
 * The outlet controller is the route's render lifetime: one per mounted outlet,
 * never one per render.
 */
const { CraftRouterOutletState, provideCraftRouterOutletState } = craftService(
  { name: 'craftRouterOutletState', providedIn: 'toProvide' },
  () => createCraftRouterOutletController(),
);

export const CraftRouterOutlet = craftComponent(
  'CraftRouterOutlet',
  { providers: [provideCraftRouterOutletState()] },
  function* () {
    const outlet = yield* CraftRouterOutletState();
    const target = craftUse(outlet.displayedTarget());
    if (!target) return [];
    const node = (target.component as CraftComponent<any>)(
      craftUse(outlet.displayedProps()) as never,
    ) as ComponentNode;
    return Object.assign(node, {
      injector: craftUse(outlet.displayedInjector()),
    });
  },
) as CraftComponent<
  Record<never, never>,
  Record<never, never>,
  CraftRouterOutletTemplate
>;
