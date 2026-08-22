import {
  InjectionToken,
  type Injector,
  type Provider,
} from './host/craft-compat';

/** Runtime mode used to gate optional diagnostics and development tooling. */
export type CraftRuntimeMode = 'development' | 'production';

/**
 * Directly-created injectors remain development-compatible. Application
 * entry points explicitly select their mode when they bootstrap.
 */
export const CRAFT_RUNTIME_MODE = new InjectionToken<CraftRuntimeMode>(
  'CRAFT_RUNTIME_MODE',
  { providedIn: 'root', factory: () => 'development' },
);

export function provideCraftRuntimeMode(mode: CraftRuntimeMode): Provider {
  return { provide: CRAFT_RUNTIME_MODE, useValue: mode };
}

export function provideCraftDevelopment(): Provider {
  return provideCraftRuntimeMode('development');
}

export function provideCraftProduction(): Provider {
  return provideCraftRuntimeMode('production');
}

export function craftRuntimeMode(injector: Injector): CraftRuntimeMode {
  return injector.get(CRAFT_RUNTIME_MODE, 'development');
}

export function isCraftDevelopment(injector: Injector): boolean {
  return craftRuntimeMode(injector) === 'development';
}
