import { craftToken } from './host/craft-injector';

/** Coordinates async work that must finish before SSR DOM cleanup. */
export type CraftHydrationRuntime = Readonly<{
  track(source: string, work: PromiseLike<unknown>): void;
  hasPending(): boolean;
  whenSettled(): Promise<void>;
}>;

export const CRAFT_HYDRATION_RUNTIME = craftToken<CraftHydrationRuntime>(
  'CraftHydrationRuntime',
);
