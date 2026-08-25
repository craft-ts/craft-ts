import { craftToken } from './host/craft-injector';

export type SsrMode = 'block' | 'fallback' | 'client';

export type CraftSsrPolicy = Readonly<{
  mode: SsrMode;
  timeoutMs?: number;
}>;

/** Nearest route-level default, overridden by a local pendingNode policy. */
export const CRAFT_SSR_POLICY = craftToken<CraftSsrPolicy>('CraftSsrPolicy');

/** Request-scoped bridge used by core async work such as lazy route loading. */
export type CraftSsrRuntime = Readonly<{
  track(source: string, work: PromiseLike<unknown>): void;
}>;

export const CRAFT_SSR_RUNTIME = craftToken<CraftSsrRuntime>('CraftSsrRuntime');

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
