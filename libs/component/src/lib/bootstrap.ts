import {
  APP_INITIALIZER,
  COMPONENT_REGISTER,
  CRAFT_PLATFORM,
  CRAFT_PRIMITIVE_REGISTRY,
  CRAFT_RUNTIME_MODE,
  CraftPrimitiveRegistry,
  createBrowserPlatform,
  createComponentRegister,
  createCraftInjector,
  ɵcreateEnvironmentInjector as createEnvironmentInjector,
  ɵgetCraftRootDefaultProviders as getCraftRootDefaultProviders,
  ɵinject as inject,
  ɵrunInInjectionContext as runInInjectionContext,
  type CraftInjector,
  type CraftRuntimeMode,
} from '@craft-ts/core';
import { mountCraftComponent } from './bridge';
import { CRAFT_ROOT_COMPONENT } from './craft-host-tokens';
import type { CraftComponent } from './types';

export type BootstrapCraftOptions = {
  /**
   * The result of `craftAppConfig(...)`. Its `providers` already carry the
   * root component, the router and one APP_INITIALIZER per appStart service.
   */
  readonly config: { readonly providers: readonly unknown[] };
  /**
   * Where to mount. Defaults to the first `<craft-root>` in the document, or
   * `document.body` when there is none.
   */
  readonly host?: Element;
  /** Runtime mode for optional diagnostics and development tooling. */
  readonly mode?: CraftRuntimeMode;
};

export type CraftAppRef = {
  readonly injector: CraftInjector;
  destroy(): void;
};

function resolveHost(host: Element | undefined): Element {
  if (host) return host;
  return document.querySelector('craft-root') ?? document.body;
}

export function ɵcreateCraftApplicationInjector(
  config: BootstrapCraftOptions['config'],
  additionalProviders: readonly unknown[] = [],
  mode: CraftRuntimeMode = 'production',
): CraftInjector {
  return createEnvironmentInjector(
    [
      ...getCraftRootDefaultProviders(),
      { provide: CRAFT_RUNTIME_MODE, useValue: mode },
      {
        provide: COMPONENT_REGISTER,
        useValue: createComponentRegister(),
      },
      {
        provide: CRAFT_PRIMITIVE_REGISTRY,
        useValue: new CraftPrimitiveRegistry(),
      },
      ...config.providers,
      ...additionalProviders,
    ],
    createCraftInjector([]),
    'CraftApp',
  );
}

export function ɵrunCraftAppInitializers(
  injector: CraftInjector,
): readonly unknown[] {
  return injector
    .get(APP_INITIALIZER, [])
    .map((initializer) =>
      runInInjectionContext(injector, initializer as () => unknown),
    );
}

/**
 * Boots a Craft application: builds the root injector, runs the app-start
 * hooks, then mounts the root component.
 *
 * This replaces Angular's `bootstrapApplication`. There is no platform to
 * create and no zone to enter — an injector and a mount is the whole of it.
 */
export function bootstrapCraft(options: BootstrapCraftOptions): CraftAppRef {
  const platform = createBrowserPlatform(window);
  const injector = ɵcreateCraftApplicationInjector(
    options.config,
    [{ provide: CRAFT_PLATFORM, useValue: platform }],
    options.mode,
  );

  // appStart hooks run before the first render, so a service that seeds state
  // has done so by the time the root component reads it.
  ɵrunCraftAppInitializers(injector);

  const root = injector.get(CRAFT_ROOT_COMPONENT) as CraftComponent<any>;
  if (!root) {
    throw new Error(
      'bootstrapCraft found no root component. Add provideCraftRootComponent(App) to your app config.',
    );
  }

  const mounted = mountCraftComponent(
    root,
    resolveHost(options.host),
    injector,
  );

  return {
    injector,
    destroy() {
      mounted.destroy();
      platform.history.dispose();
      (injector as { destroy?(): void }).destroy?.();
    },
  };
}

/** Re-exported so apps can reach the boot injector without importing core. */
export { inject as ɵbootstrapInject };
