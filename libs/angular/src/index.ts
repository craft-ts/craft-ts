import './lib/angular';
import './lib/register-angular-island';
import './lib/craft-inject-fallback';
import './lib/default-craft-pending';
import './lib/craft-route-load-error-host';
import './lib/craft-component-hosts';
import './lib/legacy-craft-field';
import './lib/legacy-craft-router-link';

export * from './lib/angular';
export { injectCraft } from './lib/inject-craft';
export { ɵtoCraftService as toCraftService, ɵinjectService as injectService } from '@craft-ng/core';
export {
  DefaultCraftPendingComponent,
  type GenDeps_DefaultCraftPendingComponent,
} from './lib/default-craft-pending';
export {
  CraftRouteLoadErrorHostComponent,
  type GenDeps_CraftRouteLoadErrorHostComponent,
} from './lib/craft-route-load-error-host';
export { LegacyCraftFieldDirective } from './lib/legacy-craft-field';
export {
  LegacyCraftRouterLink,
  type GenDeps_LegacyCraftRouterLink,
} from './lib/legacy-craft-router-link';
export {
  CRAFT_GLOBAL_ERROR_COMPONENT,
  CRAFT_PENDING_COMPONENT,
  CRAFT_ROOT_COMPONENT,
  CRAFT_ROUTE_LOAD_ERROR_COMPONENT,
  CRAFT_ROUTED_COMPONENT,
  CraftComponentHostDirective,
  CraftGlobalErrorComponentHost,
  CraftPendingComponentHost,
  CraftRootComponentHost,
  CraftRouteLoadErrorComponentHost,
  CraftRoutedComponentHost,
} from './lib/craft-component-hosts';
export { fromAngularSignal } from './lib/from-angular-signal';
