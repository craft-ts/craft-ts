import {
  Injector,
  effect,
  inject,
  runInInjectionContext,
  untracked,
  type Provider,
} from './host/craft-compat';
import { ɵcraftValueService } from './craft-service';
import { provideCraftHttpTrace } from './craft-http-trace';
import { ɵinjectCraftRuntimeMode } from './craft-runtime-mode';

/**
 * Development guard against silent loops: a component or service rebuilt over
 * and over, a loader restarting in a burst, one URL requested far more often
 * than a poll would, instances that outlive their replacement.
 *
 * None of these throws. The page keeps running, the console stays empty, and
 * the first symptom is a saturated server. The guard counts what the runtime
 * already sees (primitive creation and destruction, status transitions, HTTP
 * traces) over a sliding window and reports a *suspicion* — naming the
 * primitive, its kind and its frequency — when a count crosses a threshold.
 *
 * It is dev-only by construction: `provideLoopGuard()` installs nothing when
 * disabled or in production mode, and an application that never calls it pays
 * a single boolean check per primitive.
 */

export type LoopGuardKind =
  | 'instantiation'
  | 'loader-restart'
  | 'http-burst'
  | 'leaked-instance';

export interface LoopGuardThresholds {
  /** Length of the sliding window, in milliseconds. */
  readonly windowMs: number;
  /** Creations of the same primitive inside the window. */
  readonly instantiations: number;
  /** Loader starts (status entering loading/reloading) of one primitive. */
  readonly loaderRestarts: number;
  /** Requests to the same method + URL (query string ignored). */
  readonly httpRequests: number;
  /** Instances of one primitive alive at once, each created in the window. */
  readonly leakedInstances: number;
}

/**
 * A 5 s poll makes 2 requests in a 10 s window; these leave a wide margin
 * above that while still tripping within seconds on a real loop (a remount
 * loop makes tens of requests per second).
 */
export const DEFAULT_LOOP_GUARD_THRESHOLDS: LoopGuardThresholds = {
  windowMs: 10_000,
  instantiations: 20,
  loaderRestarts: 20,
  httpRequests: 20,
  leakedInstances: 10,
};

/** Creations closer than this are one render wave (a list drawing its rows). */
const WAVE_GAP_MS = 2;

export type LoopGuardExemption =
  | 'ignore'
  | Partial<Omit<LoopGuardThresholds, 'windowMs'>>;

export interface LoopGuardOptions {
  /** `false` installs nothing. Defaults to `true`; production mode is always off. */
  readonly enabled?: boolean;
  readonly thresholds?: Partial<LoopGuardThresholds>;
  /**
   * Once a key is suspected, refuse further instances and requests for it
   * (a `CraftLoopGuardError`), which stops a remount loop. Off by default.
   */
  readonly tripBreaker?: boolean;
  /**
   * Declared exceptions, by key: `'ignore'`, or higher thresholds. A key is a
   * primitive's short name (`query:sessions`), its full host path, or an HTTP
   * key (`GET /api/sessions`); a trailing `*` matches any suffix.
   */
  readonly exempt?: Readonly<Record<string, LoopGuardExemption>>;
  /** Called on each new suspicion (the page banner subscribes through this). */
  readonly onSuspected?: (suspicion: LoopSuspicion) => void;
  /** Mirror suspicions to `console.error`. Defaults to `true`. */
  readonly console?: boolean;
  /** Time source, for tests. Defaults to `performance.now()`. */
  readonly now?: () => number;
}

export interface LoopSuspicion {
  readonly kind: LoopGuardKind;
  /** Short name: `query:sessions`, or `GET /api/sessions`. */
  readonly name: string;
  /** Full key: the host path without instance ordinals, or the HTTP key. */
  readonly key: string;
  readonly count: number;
  readonly threshold: number;
  readonly windowMs: number;
  readonly perSecond: number;
  readonly alive?: number;
  readonly at: number;
  readonly message: string;
}

export interface LoopActivity {
  readonly kind: LoopGuardKind;
  readonly name: string;
  readonly key: string;
  /** Every occurrence since the guard started. */
  readonly total: number;
  /** Occurrences (render waves for creations) inside the current window. */
  readonly inWindow: number;
  readonly perSecond: number;
  readonly alive?: number;
  readonly tripped: boolean;
}

export class CraftLoopGuardError extends Error {
  readonly suspicion: LoopSuspicion;
  constructor(suspicion: LoopSuspicion) {
    super(suspicion.message);
    this.name = 'CraftLoopGuardError';
    this.suspicion = suspicion;
  }
}

export interface LoopGuardPrimitiveInfo {
  readonly kind: string;
  readonly name: string;
  readonly hostTags: readonly string[];
  readonly status?: () => string;
  readonly injector?: Injector;
}

export interface LoopGuard {
  readonly thresholds: LoopGuardThresholds;
  primitiveCreated(info: LoopGuardPrimitiveInfo): { release(): void };
  httpRequested(method: string, url: string): void;
  onSuspected(listener: (suspicion: LoopSuspicion) => void): () => void;
  reports(): readonly LoopSuspicion[];
  activity(): readonly LoopActivity[];
  /** Forgets every count, report and trip. */
  reset(): void;
}

type Bucket = {
  readonly kind: LoopGuardKind;
  readonly name: string;
  readonly key: string;
  total: number;
  waves: number[];
  lastAt: number;
  alive: number;
  /** Wave starts of instances created in the window (rows drawn together are one). */
  aliveSince: number[];
  startedWave: boolean;
  lastReportAt: number;
  tripped: boolean;
};

const ORDINAL = /#\d+/g;

const glob = (pattern: string, value: string): boolean =>
  pattern.endsWith('*')
    ? value.startsWith(pattern.slice(0, -1))
    : pattern === value;

const defaultNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

const httpKey = (method: string, url: string): string =>
  `${method.toUpperCase()} ${url.split(/[?#]/, 1)[0]}`;

export function createLoopGuard(options: LoopGuardOptions = {}): LoopGuard {
  const thresholds: LoopGuardThresholds = {
    ...DEFAULT_LOOP_GUARD_THRESHOLDS,
    ...options.thresholds,
  };
  const now = options.now ?? defaultNow;
  const buckets = new Map<string, Bucket>();
  const suspicions: LoopSuspicion[] = [];
  const listeners = new Set<(suspicion: LoopSuspicion) => void>();
  if (options.onSuspected) listeners.add(options.onSuspected);

  const exemptionOf = (
    ...candidates: readonly string[]
  ): LoopGuardExemption | undefined => {
    for (const [pattern, exemption] of Object.entries(options.exempt ?? {})) {
      if (candidates.some((candidate) => glob(pattern, candidate))) {
        return exemption;
      }
    }
    return undefined;
  };

  const limitFor = (
    kind: LoopGuardKind,
    exemption: LoopGuardExemption | undefined,
  ): number => {
    const own =
      kind === 'instantiation'
        ? 'instantiations'
        : kind === 'loader-restart'
          ? 'loaderRestarts'
          : kind === 'http-burst'
            ? 'httpRequests'
            : 'leakedInstances';
    return (
      (exemption && exemption !== 'ignore' ? exemption[own] : undefined) ??
      thresholds[own]
    );
  };

  const bucketOf = (kind: LoopGuardKind, name: string, key: string): Bucket => {
    const id = `${kind}|${key}`;
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = {
        kind,
        name,
        key,
        total: 0,
        waves: [],
        lastAt: Number.NEGATIVE_INFINITY,
        alive: 0,
        aliveSince: [],
        startedWave: false,
        lastReportAt: Number.NEGATIVE_INFINITY,
        tripped: false,
      };
      buckets.set(id, bucket);
    }
    return bucket;
  };

  const trim = (bucket: Bucket, at: number): void => {
    const from = at - thresholds.windowMs;
    while (bucket.waves.length > 0 && bucket.waves[0] < from) {
      bucket.waves.shift();
    }
    while (bucket.aliveSince.length > 0 && bucket.aliveSince[0] < from) {
      bucket.aliveSince.shift();
    }
  };

  const describe = (
    bucket: Bucket,
    count: number,
    threshold: number,
    perSecond: number,
  ): string => {
    const seconds = thresholds.windowMs / 1000;
    const rate = `${count} times in ${seconds}s (≈${perSecond.toFixed(1)}/s, threshold ${threshold})`;
    const where =
      bucket.key !== bucket.name ? ` in ${bucket.key.replace(` / ${bucket.name}`, '')}` : '';
    const hint =
      ' To allow it, declare { exempt: { "' +
      bucket.name +
      '": { … } } } in provideLoopGuard(); to stop it, enable { tripBreaker: true }.';
    switch (bucket.kind) {
      case 'instantiation':
        return `[craft:loop-guard] ${bucket.name}${where} was created ${rate}. The function declaring it is being re-run — a render or remount loop is likely.${hint}`;
      case 'loader-restart':
        return `[craft:loop-guard] The loader of ${bucket.name}${where} restarted ${rate}. Its params or the computation re-running it keep changing.${hint}`;
      case 'http-burst':
        return `[craft:loop-guard] ${bucket.name} was requested ${rate}. That is far above a poll; check what re-triggers the request.${hint}`;
      case 'leaked-instance':
        return `[craft:loop-guard] ${bucket.name}${where} has ${bucket.alive} live instances created within ${seconds}s (threshold ${threshold}). Replaced instances are not being destroyed, so each one keeps running.${hint}`;
    }
  };

  const suspect = (bucket: Bucket, count: number, threshold: number): void => {
    const at = now();
    if (options.tripBreaker) bucket.tripped = true;
    // One report per key per window: a persisting loop shows its growing
    // frequency, not a flood.
    if (at - bucket.lastReportAt < thresholds.windowMs) return;
    bucket.lastReportAt = at;
    const perSecond = (count / thresholds.windowMs) * 1000;
    const suspicion: LoopSuspicion = {
      kind: bucket.kind,
      name: bucket.name,
      key: bucket.key,
      count,
      threshold,
      windowMs: thresholds.windowMs,
      perSecond,
      ...(bucket.kind === 'leaked-instance' ? { alive: bucket.alive } : {}),
      at: Date.now(),
      message: describe(bucket, count, threshold, perSecond),
    };
    suspicions.push(suspicion);
    if (suspicions.length > 100) suspicions.shift();
    if (options.console !== false && typeof console !== 'undefined') {
      console.error(suspicion.message);
    }
    for (const listener of listeners) {
      try {
        listener(suspicion);
      } catch {
        // A broken listener must not break the guard.
      }
    }
  };

  /** Counts one occurrence. `gap` collapses same-instant creations into one wave. */
  const count = (
    kind: LoopGuardKind,
    name: string,
    key: string,
    gap: number,
    exemption: LoopGuardExemption | undefined,
  ): Bucket => {
    const bucket = bucketOf(kind, name, key);
    const at = now();
    bucket.total += 1;
    bucket.startedWave = at - bucket.lastAt >= gap;
    if (bucket.startedWave) {
      bucket.waves.push(at);
    }
    bucket.lastAt = at;
    trim(bucket, at);
    if (exemption !== 'ignore') {
      const limit = limitFor(kind, exemption);
      if (bucket.waves.length >= limit) suspect(bucket, bucket.waves.length, limit);
    }
    return bucket;
  };

  const refuse = (bucket: Bucket): void => {
    if (!bucket.tripped) return;
    const last = [...suspicions].reverse().find((entry) => entry.key === bucket.key);
    throw new CraftLoopGuardError(
      last ?? {
        kind: bucket.kind,
        name: bucket.name,
        key: bucket.key,
        count: bucket.waves.length,
        threshold: 0,
        windowMs: thresholds.windowMs,
        perSecond: 0,
        at: Date.now(),
        message: `[craft:loop-guard] ${bucket.name} refused by the circuit breaker.`,
      },
    );
  };

  const guard: LoopGuard = {
    thresholds,

    primitiveCreated(info) {
      const stripped = info.hostTags.map((tag) => tag.replace(ORDINAL, ''));
      const name = `${info.kind}:${info.name}`;
      // The host chain of a primitive can already end with its own tag.
      const key = (stripped[stripped.length - 1] === name
        ? stripped
        : [...stripped, name]
      ).join(' / ');
      const exemption = exemptionOf(name, key);

      const existing = buckets.get(`instantiation|${key}`);
      if (existing) refuse(existing);

      const creations = count('instantiation', name, key, WAVE_GAP_MS, exemption);
      refuse(creations);
      creations.alive += 1;
      if (creations.startedWave) creations.aliveSince.push(now());
      trim(creations, now());
      if (exemption !== 'ignore') {
        const limit = limitFor('leaked-instance', exemption);
        if (creations.aliveSince.length >= limit && creations.alive >= limit) {
          const leak = bucketOf('leaked-instance', name, key);
          leak.alive = creations.alive;
          suspect(leak, creations.aliveSince.length, limit);
        }
      }

      let released = false;
      let stopWatching: (() => void) | undefined;
      const release = (): void => {
        if (released) return;
        released = true;
        creations.alive = Math.max(0, creations.alive - 1);
        stopWatching?.();
      };

      const status = info.status;
      if (
        status &&
        info.injector &&
        (info.kind === 'query' ||
          info.kind === 'mutation' ||
          info.kind === 'asyncProcess')
      ) {
        const injector = info.injector;
        // Deferred: the primitive is still being built, and its status is
        // only readable once it is complete.
        queueMicrotask(() => {
          if (released) return;
          let previous: string | undefined;
          try {
            const ref = runInInjectionContext(injector, () =>
              effect(() => {
                let current: string;
                try {
                  current = status();
                } catch {
                  return;
                }
                const starting =
                  (current === 'loading' || current === 'reloading') &&
                  previous !== 'loading' &&
                  previous !== 'reloading';
                previous = current;
                if (starting) {
                  untracked(() =>
                    count('loader-restart', name, key, 0, exemption),
                  );
                }
              }),
            );
            stopWatching = () => ref.destroy();
          } catch {
            // The injector is gone: nothing left to watch.
          }
        });
      }

      return { release };
    },

    httpRequested(method, url) {
      const key = httpKey(method, url);
      const exemption = exemptionOf(key);
      const bucket = count('http-burst', key, key, 0, exemption);
      refuse(bucket);
    },

    onSuspected(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    reports: () => [...suspicions],

    activity() {
      const at = now();
      return [...buckets.values()]
        .map((bucket): LoopActivity => {
          trim(bucket, at);
          const inWindow =
            bucket.kind === 'leaked-instance'
              ? bucket.aliveSince.length
              : bucket.waves.length;
          return {
            kind: bucket.kind,
            name: bucket.name,
            key: bucket.key,
            total: bucket.total,
            inWindow,
            perSecond: (inWindow / thresholds.windowMs) * 1000,
            ...(bucket.kind === 'instantiation' ||
            bucket.kind === 'leaked-instance'
              ? { alive: bucket.alive }
              : {}),
            tripped: bucket.tripped,
          };
        })
        .filter((entry) => entry.kind !== 'leaked-instance' || entry.inWindow > 0)
        .sort((a, b) => b.inWindow - a.inWindow || b.total - a.total);
    },

    reset() {
      buckets.clear();
      suspicions.length = 0;
    },
  };
  return guard;
}

// ─── dependency injection ───────────────────────────────────────────────────

const loopGuardService = ɵcraftValueService(
  { name: 'LoopGuard', providedIn: 'toProvide' },
  (inputs: { $provided?: LoopGuard }) => inputs.$provided ?? null,
) as unknown as {
  provideLoopGuard: (value: LoopGuard) => unknown;
  LOOP_GUARD_META_DATA: { inject(): LoopGuard | null };
};

/** Flipped by the first `provideLoopGuard()`: until then the hooks cost one check. */
let loopGuardInstalled = false;

/** The guard in force, or `null` when none is provided or in production mode. */
export const ɵinjectLoopGuard = (): LoopGuard | null => {
  if (!loopGuardInstalled) return null;
  try {
    if (ɵinjectCraftRuntimeMode() === 'production') return null;
    return loopGuardService.LOOP_GUARD_META_DATA.inject();
  } catch {
    return null;
  }
};

/** The guard reachable from an injector, for code outside an injection context. */
export const ɵloopGuardOf = (injector: Injector): LoopGuard | null => {
  if (!loopGuardInstalled) return null;
  try {
    return runInInjectionContext(injector, () => ɵinjectLoopGuard());
  } catch {
    return null;
  }
};

export interface CraftLoopGuardGlobal {
  reports(): readonly LoopSuspicion[];
  activity(): readonly LoopActivity[];
  reset(): void;
}

const GLOBAL_KEY = '__CRAFT_LOOP_GUARD__';

/**
 * A bridge, a devtools panel or an end-to-end test reads the guard here
 * without instrumenting the application: `window.__CRAFT_LOOP_GUARD__`.
 */
export function craftLoopGuardGlobal(): CraftLoopGuardGlobal | undefined {
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
    | CraftLoopGuardGlobal
    | undefined;
}

/** Suspicions reported so far by the guard in this page (empty when none runs). */
export const craftLoopGuardReports = (): readonly LoopSuspicion[] =>
  craftLoopGuardGlobal()?.reports() ?? [];

/** Activity per primitive and per URL, busiest first. */
export const craftLoopGuardActivity = (): readonly LoopActivity[] =>
  craftLoopGuardGlobal()?.activity() ?? [];

/**
 * Installs the loop guard. Pass it in development only:
 *
 * ```ts
 * providers: [...(isDevMode() ? provideLoopGuard({ tripBreaker: true }) : [])]
 * ```
 *
 * Returns no providers when `enabled` is `false`.
 */
export function provideLoopGuard(options: LoopGuardOptions = {}): Provider[] {
  if (options.enabled === false) return [];
  loopGuardInstalled = true;
  const guard = createLoopGuard(options);
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
    reports: () => guard.reports(),
    activity: () => guard.activity(),
    reset: () => guard.reset(),
  } satisfies CraftLoopGuardGlobal;
  return [
    loopGuardService.provideLoopGuard(guard) as Provider,
    provideCraftHttpTrace((context, next) => {
      if (ɵinjectCraftRuntimeMode() !== 'production') {
        try {
          guard.httpRequested(context.method, context.url);
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return next();
    }),
  ];
}

/** Used by the registry: runs the guard hook for a primitive being created. */
export function ɵloopGuardPrimitiveCreated(
  info: LoopGuardPrimitiveInfo,
): { release(): void } | null {
  if (!loopGuardInstalled) return null;
  const guard = info.injector
    ? ɵloopGuardOf(info.injector)
    : ɵinjectLoopGuard();
  return guard ? untracked(() => guard.primitiveCreated(info)) : null;
}

/** Ambient injector, for the registry hook when none was passed. */
export const ɵcurrentInjector = (): Injector | undefined => {
  try {
    return inject(Injector, { optional: true }) ?? undefined;
  } catch {
    return undefined;
  }
};
