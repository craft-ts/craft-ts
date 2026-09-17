import { craftService } from './craft-service';

/** Coordinates async work that must finish before SSR DOM cleanup. */
export type CraftHydrationRuntime = Readonly<{
  track(source: string, work: PromiseLike<unknown>): void;
  hasPending(): boolean;
  whenSettled(): Promise<void>;
}>;

type CraftHydrationRuntimeHelper = () =>
  Generator<unknown, CraftHydrationRuntime, unknown>;
const craftHydrationRuntimeService = craftService(
  { name: 'CraftHydrationRuntime', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided: CraftHydrationRuntime }) => inputs.$provided,
) as unknown as {
  CraftHydrationRuntime: CraftHydrationRuntimeHelper;
  provideCraftHydrationRuntime: (value: CraftHydrationRuntime) => unknown;
  CRAFT_HYDRATION_RUNTIME_META_DATA: { inject(): CraftHydrationRuntime };
};

export const CraftHydrationRuntime =
  craftHydrationRuntimeService.CraftHydrationRuntime;
export const provideCraftHydrationRuntime =
  (value: CraftHydrationRuntime): unknown =>
    craftHydrationRuntimeService.provideCraftHydrationRuntime(value);
export const ɵinjectCraftHydrationRuntime = () => {
  try {
    return craftHydrationRuntimeService.CRAFT_HYDRATION_RUNTIME_META_DATA.inject() as CraftHydrationRuntime;
  } catch {
    return null;
  }
};
