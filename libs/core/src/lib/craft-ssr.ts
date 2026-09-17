import { craftService } from './craft-service';

export type SsrMode = 'block' | 'fallback' | 'client';

export type CraftSsrPolicy = Readonly<{
  mode: SsrMode;
  timeoutMs?: number;
}>;

/** Nearest route-level default, overridden by a local pendingNode policy. */
type SsrPolicyHelper = () => Generator<unknown, CraftSsrPolicy, unknown>;
const craftSsrPolicyService = craftService(
  { name: 'CraftSsrPolicy', providedIn: 'toProvide' },
  (inputs: { $provided: CraftSsrPolicy }) => inputs.$provided,
) as unknown as {
  CraftSsrPolicy: SsrPolicyHelper;
  provideCraftSsrPolicy: (value: CraftSsrPolicy) => unknown;
  CRAFT_SSR_POLICY_META_DATA: { inject(): CraftSsrPolicy };
};

export const CraftSsrPolicy = craftSsrPolicyService.CraftSsrPolicy;
export const provideCraftSsrPolicy = (value: CraftSsrPolicy): unknown =>
  craftSsrPolicyService.provideCraftSsrPolicy(value);
export const ɵinjectCraftSsrPolicy = () => {
  try {
    return craftSsrPolicyService.CRAFT_SSR_POLICY_META_DATA.inject() as CraftSsrPolicy;
  } catch {
    return null;
  }
};

/** Request-scoped bridge used by core async work such as lazy route loading. */
export type CraftSsrRuntime = Readonly<{
  track(source: string, work: PromiseLike<unknown>): void;
}>;

type SsrRuntimeHelper = () => Generator<unknown, CraftSsrRuntime, unknown>;
const craftSsrRuntimeService = craftService(
  { name: 'CraftSsrRuntime', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided: CraftSsrRuntime }) => inputs.$provided,
) as unknown as {
  CraftSsrRuntime: SsrRuntimeHelper;
  provideCraftSsrRuntime: (value: CraftSsrRuntime) => unknown;
  CRAFT_SSR_RUNTIME_META_DATA: { inject(): CraftSsrRuntime };
};

export const CraftSsrRuntime = craftSsrRuntimeService.CraftSsrRuntime;
export const provideCraftSsrRuntime = (value: CraftSsrRuntime): unknown =>
  craftSsrRuntimeService.provideCraftSsrRuntime(value);
export const ɵinjectCraftSsrRuntime = () => {
  try {
    return craftSsrRuntimeService.CRAFT_SSR_RUNTIME_META_DATA.inject() as CraftSsrRuntime;
  } catch {
    return null;
  }
};

export class CraftUnhandledSsrResolutionError extends Error {
  readonly source: string;
  readonly route?: string;
  readonly reason: 'no pendingNode or route SSR policy';

  constructor(source: string, route?: string) {
    super(
      `Craft async source "${source}" suspended during SSR without a pendingNode or route SSR policy${route ? ` (route: ${route})` : ''}.`,
    );
    this.name = 'CraftUnhandledSsrResolutionError';
    this.source = source;
    this.route = route;
    this.reason = 'no pendingNode or route SSR policy';
  }
}

export class CraftSsrTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly sources: readonly string[];

  constructor(timeoutMs: number, sources: readonly string[]) {
    super(
      `Craft SSR timed out after ${timeoutMs}ms while waiting for: ${sources.join(', ')}.`,
    );
    this.name = 'CraftSsrTimeoutError';
    this.timeoutMs = timeoutMs;
    this.sources = sources;
  }
}
