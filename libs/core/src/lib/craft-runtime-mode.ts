import { runInInjectionContext, type Injector } from './host/craft-compat';
import { craftService, type CraftServiceProvider } from './craft-service';

/** Runtime mode used to gate optional diagnostics and development tooling. */
export type CraftRuntimeMode = 'development' | 'production';

/**
 * Directly-created injectors remain development-compatible. Application
 * entry points explicitly select their mode when they bootstrap.
 */
const craftRuntimeModeService = craftService(
  { name: 'CraftRuntimeMode', providedIn: 'toProvide' },
  (inputs: { $provided?: CraftRuntimeMode }) => inputs.$provided ?? 'development',
) as unknown as {
  CraftRuntimeMode: () => Generator<unknown, CraftRuntimeMode, unknown>;
  provideCraftRuntimeMode: (value: CraftRuntimeMode) => CraftServiceProvider;
  CRAFT_RUNTIME_MODE_META_DATA: { inject(): CraftRuntimeMode };
};

export const CraftRuntimeMode = craftRuntimeModeService.CraftRuntimeMode;
export const ɵinjectCraftRuntimeMode = (): CraftRuntimeMode => {
  try {
    return craftRuntimeModeService.CRAFT_RUNTIME_MODE_META_DATA.inject();
  } catch {
    return 'development';
  }
};

export function provideCraftRuntimeMode(mode: CraftRuntimeMode): CraftServiceProvider {
  return craftRuntimeModeService.provideCraftRuntimeMode(mode);
}

export function provideCraftDevelopment(): CraftServiceProvider {
  return provideCraftRuntimeMode('development');
}

export function provideCraftProduction(): CraftServiceProvider {
  return provideCraftRuntimeMode('production');
}

export function craftRuntimeMode(injector: Injector): CraftRuntimeMode {
  return runInInjectionContext(injector, () => ɵinjectCraftRuntimeMode());
}

export function isCraftDevelopment(injector: Injector): boolean {
  return craftRuntimeMode(injector) === 'development';
}
