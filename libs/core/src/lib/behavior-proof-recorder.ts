import type { Provider } from './host/craft-compat';
import { isCraftException } from './craft-exception';
import { ɵHostTag } from './craft-service';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';

/**
 * What a test exercised, read the way an e2e session trace reads it: one step
 * per primitive invocation that settled, keyed by its host address; one per
 * route the router activated; one per server function that answered. The
 * behaviour catalog of `@craft-ts/dev-tools` turns these steps into proofs.
 *
 * Only a fingerprint is kept — each distinct `(address, outcome, exception)`
 * once — so a test that loops a thousand times weighs the same as one that
 * calls once.
 */
export type ɵBehaviorProofStep =
  | Readonly<{
      key: string;
      kind: 'invocation';
      detail: Readonly<{
        outcome: 'succeeded' | 'failed';
        exception?: string;
        /** `ɵbehaviorTarget` of the host tags, when the invocation has an owner. */
        behavior?: string;
      }>;
    }>
  | Readonly<{
      /** `route-activation:<route path>`, as a session trace keys it. */
      key: string;
      kind: 'route';
      detail: Readonly<{
        outcome: 'activated' | 'failed';
        /** `<collection>:<path>`, the catalog's name for the route. */
        behavior?: string;
      }>;
    }>
  | Readonly<{
      /** `server-fn:<id>`, as a session trace keys it. */
      key: string;
      kind: 'http';
      detail: Readonly<{ outcome: 'ok' | 'error' }>;
    }>;

export type ɵBehaviorProofRecording = Readonly<{
  /** In the order they first settled. */
  steps: ɵBehaviorProofStep[];
  /**
   * How many of the steps an assertion came after — the steps from this
   * index on were exercised but never observed. Absent when the recording
   * was started without an assertion counter.
   */
  observedSteps?: number;
}>;

type Recording = {
  steps: Map<string, { step: ɵBehaviorProofStep; assertionsBefore: number }>;
  assertions?: () => number;
};

let recording: Recording | undefined;

/**
 * Runs the code a primitive executes to build or feed itself — its insertions
 * when the host is created, the `params` and `method` functions that compute
 * what to load: none of it is the behaviour a user triggers. Only the loader
 * that runs with those params, or the method itself, may prove one; otherwise
 * creating a service would prove every query it declares.
 */
let outsideProof = 0;
export function ɵoutsideBehaviorProof<T>(run: () => T): T {
  outsideProof += 1;
  try {
    return run();
  } finally {
    outsideProof -= 1;
  }
}

/** Whether the code running now is a primitive building or feeding itself. */
export function ɵisOutsideBehaviorProof(): boolean {
  return outsideProof > 0;
}

/**
 * Starts a fresh recording; the previous one, if any, is dropped. With an
 * assertion counter (vitest: `expect.getState().assertionCalls`), the
 * recording also tells which steps an assertion followed.
 */
export function ɵstartBehaviorProofRecording(
  options: Readonly<{ assertions?: () => number }> = {},
): void {
  recording = { steps: new Map(), ...options };
}

export function ɵstopBehaviorProofRecording(): ɵBehaviorProofRecording {
  const current = recording;
  recording = undefined;
  const entries = [...(current?.steps.values() ?? [])];
  const steps = entries.map((entry) => entry.step);
  if (!current?.assertions) return { steps };
  // Steps are kept in the order they first settled, so the counts before
  // them never decrease: the observed ones are a prefix.
  const assertions = current.assertions();
  const unobserved = entries.findIndex(
    (entry) => entry.assertionsBefore >= assertions,
  );
  return {
    steps,
    observedSteps: unobserved === -1 ? entries.length : unobserved,
  };
}

const HOST_FACTORY_TAG = /^(service|component|route):/;

/**
 * The step key of an invocation, from the host tags it ran under — `undefined`
 * for a service or component body, the host being built, not something a
 * user triggers.
 */
export function ɵbehaviorInvocationKey(
  hostTags: readonly string[],
): string | undefined {
  const host = hostTags[hostTags.length - 1];
  if (!host || HOST_FACTORY_TAG.test(host)) return undefined;
  return `invocation:${hostTags.map((tag) => tag.replace(/#\d+$/, '')).join(' / ')}`;
}

/**
 * The name the behaviour catalog gives what an invocation runs —
 * `service:cart / method:add` → `cart.add`: the primitive is the last tag, its
 * owner the nearest service or component before it. The catalog of
 * `@craft-ts/dev-tools` builds its ids from the same `<owner>.<name>`, so the
 * runtime writes it into every step it records (here and in a debug session)
 * and no reader has to work it out again.
 */
export function ɵbehaviorTarget(
  hostTags: readonly string[],
): string | undefined {
  const tags = hostTags.map((tag) => tag.replace(/#\d+$/, ''));
  const host = tags[tags.length - 1];
  if (!host || HOST_FACTORY_TAG.test(host)) return undefined;
  const owner = tags
    .slice(0, -1)
    .reverse()
    .find((tag) => tag.startsWith('service:') || tag.startsWith('component:'));
  const name = host.slice(host.indexOf(':') + 1);
  if (!name || !owner) return undefined;
  return `${owner.slice(owner.indexOf(':') + 1)}.${name}`;
}

function record(step: ɵBehaviorProofStep): void {
  const id = JSON.stringify([step.key, step.detail]);
  if (!recording || recording.steps.has(id)) return;
  recording.steps.set(id, {
    step,
    assertionsBefore: recording.assertions?.() ?? 0,
  });
}

/**
 * A failure travels as a Craft exception VALUE as often as a throw (server
 * functions, typed loaders): both count as failed, never as a success.
 */
const behaviorProofFnWrapper: FnWrapper = function* (factory, thisArg, args) {
  if (!recording || outsideProof > 0) return yield* factory.apply(thisArg, args);
  let hostTags: readonly string[];
  try {
    hostTags = yield* ɵHostTag();
  } catch {
    return yield* factory.apply(thisArg, args);
  }
  const key = ɵbehaviorInvocationKey(hostTags);
  if (!key) return yield* factory.apply(thisArg, args);
  const target = ɵbehaviorTarget(hostTags);
  const behavior = target ? { behavior: target } : {};
  try {
    const result = yield* factory.apply(thisArg, args);
    record({
      key,
      kind: 'invocation',
      detail: isCraftException(result)
        ? { outcome: 'failed', exception: result._tag, ...behavior }
        : { outcome: 'succeeded', ...behavior },
    });
    return result;
  } catch (error) {
    const tag = (error as { _tag?: unknown } | null)?._tag;
    record({
      key,
      kind: 'invocation',
      detail: {
        outcome: 'failed',
        exception:
          typeof tag === 'string'
            ? tag
            : error instanceof Error
              ? error.name
              : 'unknown',
        ...behavior,
      },
    });
    throw error;
  }
};

/** The wrapper that feeds the recording; inert while none is started. */
export function ɵprovideBehaviorProofRecording(): Provider {
  return provideFnWrapper(
    'Warning: dependency injection here is not type-safe and may fail at runtime',
    behaviorProofFnWrapper,
  );
}

/** Called by the route activation tracker: a page the test opened. */
export function ɵrecordRouteActivationProof(
  event: Readonly<{
    routePath: string;
    routeCollection?: string;
    outcome: 'activated' | 'failed';
  }>,
): void {
  const behavior = ɵrouteBehaviorTarget(event);
  record({
    key: `route-activation:${event.routePath.replace(/#\d+/g, '')}`,
    kind: 'route',
    detail: { outcome: event.outcome, ...(behavior ? { behavior } : {}) },
  });
}

/**
 * The name the behaviour catalog gives an activated route,
 * `<collection>:<path>` — `undefined` for a route declared outside
 * `craftRoutes`.
 */
export function ɵrouteBehaviorTarget(
  event: Readonly<{ routePath: string; routeCollection?: string }>,
): string | undefined {
  return event.routeCollection
    ? `${event.routeCollection}:${event.routePath}`
    : undefined;
}

/**
 * Called by the server-function client once the call settled: a failure that
 * travels as a Craft exception value is an error, never an answer.
 */
export function ɵrecordServerFunctionProof(id: string, result: unknown): void {
  record({
    key: `server-fn:${id}`,
    kind: 'http',
    detail: { outcome: isCraftException(result) ? 'error' : 'ok' },
  });
}
