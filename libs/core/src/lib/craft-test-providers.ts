import type { Provider } from './host/craft-compat';

const registered: Provider[] = [];

/**
 * Providers every test root injector receives — `setupCraftServiceTest`,
 * `setupCraftServiceTestingByRegister`, `CraftTestBed` and the component test
 * helpers. Meant for a vitest setup file (a recorder, a fake clock), never for
 * a single test: returns the function that removes them again.
 */
export function ɵregisterCraftTestProviders(
  providers: readonly Provider[],
): () => void {
  registered.push(...providers);
  return () => {
    for (const provider of providers) {
      const index = registered.indexOf(provider);
      if (index >= 0) registered.splice(index, 1);
    }
  };
}

export function ɵcraftTestProviders(): readonly Provider[] {
  return registered;
}
