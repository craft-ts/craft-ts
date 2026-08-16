import {
  createCraftRouterOutletController,
  type CraftRouterOutletController,
} from '@craft-ng/core';
import { craftComponent } from './component';
import type { CraftComponent } from './types';
import type { ComponentNode } from './render/vnode';

/**
 * Functional non-blocking router outlet.
 *
 * The routing state machine lives in `@craft-ng/core`; this component owns its
 * render lifetime and mounts the active Angular route target with the
 * route-scoped injector supplied by the controller.
 */
type CraftRouterOutletFactory = () => {
  readonly outlet: CraftRouterOutletController;
};

export const CraftRouterOutlet = craftComponent(
  'CraftRouterOutlet',
  {},
  () => ({ outlet: createCraftRouterOutletController() }),
  ({ outlet }) => {
    const target = outlet.displayedTarget();
    if (!target) return [];
    const node = (target.component as CraftComponent<any>)(
      outlet.displayedProps() as never,
    ) as ComponentNode;
    return Object.assign(node, { injector: outlet.displayedInjector() });
  },
) as CraftComponent<
  Record<never, never>,
  Record<never, never>,
  CraftRouterOutletFactory
>;
