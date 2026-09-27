import { craftService, type Provider } from '@craft-ts/core';
import { isCraftComponent } from './types';

type HostComponent = unknown;
type HostComponentHelper = () => Generator<unknown, HostComponent, unknown>;
type HostComponentService = {
  readonly helper: HostComponentHelper;
  readonly provide: (value: HostComponent | (() => HostComponent)) => Provider;
  readonly inject: { inject(): HostComponent };
};

function resolveHostComponent(
  value: HostComponent | (() => HostComponent),
): HostComponent {
  return typeof value === 'function' && !isCraftComponent(value)
    ? value()
    : value;
}

function serviceAsHostComponentService(
  service: unknown,
  helperName: string,
  provideName: string,
  metadataName: string,
): HostComponentService {
  const api = service as Record<string, unknown>;
  return {
    helper: api[helperName] as HostComponentHelper,
    provide: api[provideName] as HostComponentService['provide'],
    inject: api[metadataName] as HostComponentService['inject'],
  };
}

const craftRoutedComponentService = craftService(
  { name: 'CraftRoutedComponent', providedIn: 'toProvide' },
  (inputs: { $provided: HostComponent | (() => HostComponent) }) =>
    resolveHostComponent(inputs.$provided),
);
const craftRootComponentService = craftService(
  { name: 'CraftRootComponent', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided: HostComponent | (() => HostComponent) }) =>
    resolveHostComponent(inputs.$provided),
);
const craftGlobalErrorComponentService = craftService(
  { name: 'CraftGlobalErrorComponent', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided: HostComponent | (() => HostComponent) }) =>
    resolveHostComponent(inputs.$provided),
);
const craftRouteLoadErrorComponentService = craftService(
  { name: 'CraftRouteLoadErrorComponent', providedIn: 'toProvide' },
  (inputs: { $provided: HostComponent | (() => HostComponent) }) =>
    resolveHostComponent(inputs.$provided),
);
const craftPendingComponentService = craftService(
  { name: 'CraftPendingComponent', providedIn: 'toProvide' },
  (inputs: { $provided: HostComponent | (() => HostComponent) }) =>
    resolveHostComponent(inputs.$provided),
);

const routed = serviceAsHostComponentService(
  craftRoutedComponentService,
  'CraftRoutedComponent',
  'provideCraftRoutedComponent',
  'CRAFT_ROUTED_COMPONENT_META_DATA',
);
export const CraftRoutedComponent = routed.helper;
export const provideCraftRoutedComponent = routed.provide;
export const ɵinjectCraftRoutedComponent = (): HostComponent | null => {
  try {
    return routed.inject.inject();
  } catch {
    return null;
  }
};

const root = serviceAsHostComponentService(
  craftRootComponentService,
  'CraftRootComponent',
  'provideCraftRootComponent',
  'CRAFT_ROOT_COMPONENT_META_DATA',
);
export const CraftRootComponent = root.helper;
export const provideCraftRootComponent = root.provide;
export const ɵinjectCraftRootComponent = (): HostComponent | null => {
  try {
    return root.inject.inject();
  } catch {
    return null;
  }
};

const globalError = serviceAsHostComponentService(
  craftGlobalErrorComponentService,
  'CraftGlobalErrorComponent',
  'provideCraftGlobalErrorComponent',
  'CRAFT_GLOBAL_ERROR_COMPONENT_META_DATA',
);
export const CraftGlobalErrorComponent = globalError.helper;
export const provideCraftGlobalErrorComponent = globalError.provide;
export const ɵinjectCraftGlobalErrorComponent = (): HostComponent | null => {
  try {
    return globalError.inject.inject();
  } catch {
    return null;
  }
};

const routeLoadError = serviceAsHostComponentService(
  craftRouteLoadErrorComponentService,
  'CraftRouteLoadErrorComponent',
  'provideCraftRouteLoadErrorComponent',
  'CRAFT_ROUTE_LOAD_ERROR_COMPONENT_META_DATA',
);
export const CraftRouteLoadErrorComponent = routeLoadError.helper;
export const provideCraftRouteLoadErrorComponent = routeLoadError.provide;
export const ɵinjectCraftRouteLoadErrorComponent = (): HostComponent | null => {
  try {
    return routeLoadError.inject.inject();
  } catch {
    return null;
  }
};

const pending = serviceAsHostComponentService(
  craftPendingComponentService,
  'CraftPendingComponent',
  'provideCraftPendingComponent',
  'CRAFT_PENDING_COMPONENT_META_DATA',
);
export const CraftPendingComponent = pending.helper;
export const provideCraftPendingComponent = pending.provide;
export const ɵinjectCraftPendingComponent = (): HostComponent | null => {
  try {
    return pending.inject.inject();
  } catch {
    return null;
  }
};
