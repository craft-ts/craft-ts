import {
  Injector,
  runInInjectionContext,
  type Provider,
} from './host/craft-compat';
import { ɵcraftValueService } from './craft-service';
import { isCraftDevelopment } from './craft-runtime-mode';
import { isCraftReplaying } from './craft-replay';

export type CraftHttpTraceContext = Readonly<{
  method: string;
  url: string;
  params?: unknown;
  payload?: unknown;
  /** Stable non-secret identity for otherwise identical concurrent requests. */
  replayKey?: string;
}>;

export type CraftHttpTraceWrapper = (
  context: CraftHttpTraceContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

export type CraftHttpResumeDecision =
  | Readonly<{ kind: 'live' }>
  | Readonly<{ kind: 'live+patch'; patch: (response: unknown) => unknown }>
  | Readonly<{ kind: 'recorded'; response: unknown }>
  | Readonly<{ kind: 'held'; wait: Promise<unknown> }>;

export type CraftHttpResumeBarrier = Readonly<{
  decide(context: CraftHttpTraceContext): CraftHttpResumeDecision | Promise<CraftHttpResumeDecision>;
}>;

export type CraftHttpReplayOutcome = Readonly<{
  context: CraftHttpTraceContext;
  elapsedMs: number;
  phase: 'succeeded' | 'failed';
  response: unknown;
}>;

type PendingHttpReplay = {
  outcome: CraftHttpReplayOutcome;
  resolve(value: unknown): void;
  reject(error: unknown): void;
};

let activeHttpReplay:
  | {
      outcomes: CraftHttpReplayOutcome[];
      consumed: Set<number>;
      pending: PendingHttpReplay[];
      elapsedMs: number;
    }
  | undefined;
let craftHttpTransportDepth = 0;
let activeResumeBarrier: CraftHttpResumeBarrier | undefined;

/** Installs the outbound-call gate for a functional-resume launch. */
export function ɵinstallCraftHttpResumeBarrier(
  barrier: CraftHttpResumeBarrier,
): () => void {
  activeResumeBarrier = barrier;
  return () => {
    if (activeResumeBarrier === barrier) activeResumeBarrier = undefined;
  };
}

/** Apply the active resume barrier without installing HTTP trace capture. */
export function ɵexecuteCraftHttpResumeBarrier<Result>(
  context: CraftHttpTraceContext,
  next: () => Promise<Result>,
): Promise<Result> | undefined {
  const barrier = activeResumeBarrier;
  if (!barrier) return undefined;
  return Promise.resolve(barrier.decide(context)).then((decision) => {
    switch (decision.kind) {
      case 'live':
        return next();
      case 'live+patch':
        return next().then(decision.patch) as Promise<Result>;
      case 'recorded':
        return decision.response as Result;
      case 'held':
        return decision.wait as Promise<Result>;
    }
  });
}

/** Runs only the synchronous transport-start portion of a Craft HTTP request. */
export function ɵinvokeCraftHttpTransport<Result>(start: () => Result): Result {
  craftHttpTransportDepth++;
  try {
    return start();
  } finally {
    craftHttpTransportDepth--;
  }
}

/** Used by the local fetch recorder to avoid duplicating Craft HTTP outcomes. */
export function ɵisCraftHttpTransportActive(): boolean {
  return craftHttpTransportDepth > 0;
}

/** Installs the recorded Craft HTTP results for one replay run. */
export function ɵinstallCraftHttpReplay(
  outcomes: readonly CraftHttpReplayOutcome[],
): () => void {
  const replay = {
    outcomes: [...outcomes],
    consumed: new Set<number>(),
    pending: [] as PendingHttpReplay[],
    elapsedMs: 0,
  };
  activeHttpReplay = replay;
  return () => {
    if (activeHttpReplay !== replay) return;
    for (const pending of replay.pending.splice(0))
      pending.reject(new Error('Craft HTTP replay stopped before the result.'));
    activeHttpReplay = undefined;
  };
}

/** Resolves recorded HTTP calls when replay advances to their recorded time. */
export function ɵadvanceCraftHttpReplay(elapsedMs: number): void {
  const replay = activeHttpReplay;
  if (!replay || !Number.isFinite(elapsedMs)) return;
  replay.elapsedMs = Math.max(replay.elapsedMs, elapsedMs);
  const due = replay.pending.filter(
    (pending) => pending.outcome.elapsedMs <= replay.elapsedMs,
  );
  replay.pending = replay.pending.filter(
    (pending) => pending.outcome.elapsedMs > replay.elapsedMs,
  );
  for (const pending of due) settleHttpReplay(pending);
}

/** Returns a recorded result instead of issuing a live Craft HTTP request. */
export function ɵconsumeCraftHttpReplayResult(
  context: CraftHttpTraceContext,
): Promise<unknown> | undefined {
  const replay = activeHttpReplay;
  if (!replay) return undefined;
  const outcomeIndex = replay.outcomes.findIndex(
    (outcome, index) =>
      !replay.consumed.has(index) &&
      httpReplayContextMatches(outcome.context, context),
  );
  if (outcomeIndex < 0) return undefined;
  replay.consumed.add(outcomeIndex);
  const outcome = replay.outcomes[outcomeIndex]!;
  return new Promise((resolve, reject) => {
    const pending = { outcome, resolve, reject };
    if (outcome.elapsedMs <= replay.elapsedMs) settleHttpReplay(pending);
    else replay.pending.push(pending);
  });
}

function settleHttpReplay(pending: PendingHttpReplay): void {
  if (pending.outcome.phase === 'failed') {
    const response = pending.outcome.response;
    const message =
      typeof response === 'object' &&
      response !== null &&
      'message' in response &&
      typeof response.message === 'string'
        ? response.message
        : 'Recorded Craft HTTP request failed.';
    pending.reject(new Error(message));
  } else {
    pending.resolve(pending.outcome.response);
  }
}

function httpReplayContextMatches(
  expected: CraftHttpTraceContext,
  actual: CraftHttpTraceContext,
): boolean {
  return (
    expected.method.toUpperCase() === actual.method.toUpperCase() &&
    expected.url === actual.url &&
    expected.replayKey === actual.replayKey &&
    replayValueMatches(expected.params, actual.params) &&
    replayValueMatches(expected.payload, actual.payload)
  );
}

function replayValueMatches(expected: unknown, actual: unknown): boolean {
  if (
    expected === '[REDACTED]' ||
    expected === '[REDACTED_EMAIL]' ||
    expected === '[Circular]'
  )
    return true;
  if (Object.is(expected, actual)) return true;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) => replayValueMatches(value, actual[index]))
    );
  if (isRecord(expected)) {
    if (!isRecord(actual)) return false;
    return Object.entries(expected).every(([key, value]) =>
      replayValueMatches(value, actual[key]),
    );
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const craftHttpTraceService = ɵcraftValueService(
  { name: 'CraftHttpTraces', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: CraftHttpTraceWrapper }) =>
    inputs.$provided ? [inputs.$provided] : [],
) as unknown as {
  provideCraftHttpTraces: (value?: CraftHttpTraceWrapper) => unknown;
  CRAFT_HTTP_TRACES_META_DATA: { inject(): readonly CraftHttpTraceWrapper[] };
};

export const ɵinjectCraftHttpTraces = (
  injector?: Injector,
): readonly CraftHttpTraceWrapper[] => {
  try {
    return injector
      ? runInInjectionContext(injector, () =>
          craftHttpTraceService.CRAFT_HTTP_TRACES_META_DATA.inject(),
        )
      : craftHttpTraceService.CRAFT_HTTP_TRACES_META_DATA.inject();
  } catch {
    return [];
  }
};

export function provideCraftHttpTrace(
  wrapper: CraftHttpTraceWrapper,
): Provider {
  return craftHttpTraceService.provideCraftHttpTraces(wrapper) as Provider;
}

export function executeCraftHttpTrace<Value>(
  injector: Injector,
  context: CraftHttpTraceContext,
  next: () => Promise<Value>,
): Promise<Value> {
  const resumed = ɵexecuteCraftHttpResumeBarrier(context, next);
  if (resumed) return resumed;
  // Replay safety applies independently of the app's development mode. If a
  // replay has no matching response, do not fall through to a live server.
  if (isCraftReplaying()) return replayOrNext(context, next);
  if (!isCraftDevelopment(injector)) {
    return next();
  }
  const wrappers = ɵinjectCraftHttpTraces(injector);
  if (wrappers.length === 0) {
    return replayOrNext(context, next);
  }

  const run = (index: number): Promise<Value> => {
    if (index === wrappers.length) {
      return replayOrNext(context, next);
    }

    const wrapper = wrappers[index];
    return wrapper(context, () => run(index + 1)) as Promise<Value>;
  };

  return runInInjectionContext(injector, () => run(0));
}

function replayOrNext<Value>(
  context: CraftHttpTraceContext,
  next: () => Promise<Value>,
): Promise<Value> {
  const recorded = ɵconsumeCraftHttpReplayResult(context);
  if (recorded) return recorded as Promise<Value>;
  if (isCraftReplaying()) {
    return Promise.reject(
      new Error(
        `Replay stopped: no recorded Craft HTTP result for ${context.method} ${context.url}`,
      ),
    );
  }
  return next();
}
