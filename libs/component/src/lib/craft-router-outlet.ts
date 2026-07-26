import { createCraftRouterOutletController } from '@craft-ng/core';
import { angular } from './angular';
import { craftComponent } from './component';

/**
 * Functional non-blocking router outlet.
 *
 * The routing state machine lives in `@craft-ng/core`; this component owns its
 * render lifetime and mounts the active Angular route target with the
 * route-scoped injector supplied by the controller.
 */
export const CraftRouterOutlet = craftComponent(
  'CraftRouterOutlet',
  {},
  () => ({ outlet: createCraftRouterOutletController() }),
  ({ outlet }) => {
    const displayedComponent = outlet.displayedComponent();
    return displayedComponent
      ? angular(displayedComponent, {
          injector: outlet.displayedInjector(),
        })
      : [];
  },
);
