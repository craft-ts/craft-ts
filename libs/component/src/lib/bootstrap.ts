import {
  APP_INITIALIZER,
  createCraftInjector,
  ɵcreateEnvironmentInjector as createEnvironmentInjector,
  ɵgetCraftRootDefaultProviders as getCraftRootDefaultProviders,
  ɵinject as inject,
  ɵrunInInjectionContext as runInInjectionContext,
  type CraftInjector,
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
};

export type CraftAppRef = {
  readonly injector: CraftInjector;
  destroy(): void;
};

function resolveHost(host: Element | undefined): Element {
  if (host) return host;
  return document.querySelector('craft-root') ?? document.body;
}

/**
 * Boots a Craft application: builds the root injector, runs the app-start
 * hooks, then mounts the root component.
 *
 * This replaces Angular's `bootstrapApplication`. There is no platform to
 * create and no zone to enter — an injector and a mount is the whole of it.
 */
export function bootstrapCraft(options: BootstrapCraftOptions): CraftAppRef {
  const injector = createEnvironmentInjector(
    [...getCraftRootDefaultProviders(), ...options.config.providers],
    createCraftInjector([]),
    'CraftApp',
  );

  // appStart hooks run before the first render, so a service that seeds state
  // has done so by the time the root component reads it.
  for (const initializer of injector.get(APP_INITIALIZER, [])) {
    runInInjectionContext(injector, initializer as () => unknown);
  }

  const root = injector.get(CRAFT_ROOT_COMPONENT) as CraftComponent<any>;
  if (!root) {
    throw new Error(
      'bootstrapCraft found no root component. Add provideCraftRootComponent(App) to your app config.',
    );
  }

  const mounted = mountCraftComponent(root, resolveHost(options.host), injector);

  return {
    injector,
    destroy() {
      mounted.destroy();
      (injector as { destroy?(): void }).destroy?.();
    },
  };
}

/** Re-exported so apps can reach the boot injector without importing core. */
export { inject as ɵbootstrapInject };
