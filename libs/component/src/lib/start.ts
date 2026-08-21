import {
  bootstrapCraft,
  type BootstrapCraftOptions,
  type CraftAppRef,
} from './bootstrap';
import {
  hydrateCraft,
  type HydrateCraftOptions,
  type HydratedCraftAppRef,
} from './hydrate';

/** Options shared by a normal browser start and an SSR hydration. */
export type StartCraftOptions = HydrateCraftOptions;

export type StartedCraftAppRef = CraftAppRef | HydratedCraftAppRef;

/**
 * Starts a Craft application in the browser.
 *
 * If the host contains Craft's SSR hydration marker, the existing DOM is
 * hydrated; otherwise a fresh client render is mounted.
 */
export function startCraft(options: StartCraftOptions): StartedCraftAppRef {
  const host =
    options.host ?? document.querySelector('craft-root') ?? document.body;

  if (host.hasAttribute('data-craft-hk')) {
    return hydrateCraft({ ...options, host });
  }

  const bootstrapOptions: BootstrapCraftOptions = {
    config: options.config,
    host,
  };
  return bootstrapCraft(bootstrapOptions);
}
