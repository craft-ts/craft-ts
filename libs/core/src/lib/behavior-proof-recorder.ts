import type { Provider } from './host/craft-compat';
import { isCraftException } from './craft-exception';
import { ɵHostTag } from './craft-service';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';

/**
 * What a test exercised, read the way an e2e session trace reads it: one step
 * per primitive invocation that settled, keyed by its host address. The
 * behaviour catalog of `@craft-ts/dev-tools` turns these steps into proofs.
 *
 * Only a fingerprint is kept — each distinct `(address, outcome, exception)`
 * once — so a test that loops a thousand times weighs the same as one that
 * calls once.
 */
export type ɵBehaviorProofStep = Readonly<{
  key: string;
  kind: 'invocation';
  detail: Readonly<{ outcome: 'succeeded' | 'failed'; exception?: string }>;
}>;

let recording: Map<string, ɵBehaviorProofStep> | undefined;

/** Starts a fresh recording; the previous one, if any, is dropped. */
export function ɵstartBehaviorProofRecording(): void {
  recording = new Map();
}

/** Ends the recording and returns its steps in the order they first settled. */
export function ɵstopBehaviorProofRecording(): ɵBehaviorProofStep[] {
  const steps = [...(recording?.values() ?? [])];
  recording = undefined;
  return steps;
}

const HOST_FACTORY_TAG = /^(service|component|route):/;

function record(
  hostTags: readonly string[],
  detail: ɵBehaviorProofStep['detail'],
): void {
  const address = hostTags.map((tag) => tag.replace(/#\d+$/, '')).join(' / ');
  const step: ɵBehaviorProofStep = {
    key: `invocation:${address}`,
    kind: 'invocation',
    detail,
  };
  recording?.set(JSON.stringify([step.key, detail]), step);
}

/**
 * A failure travels as a Craft exception VALUE as often as a throw (server
 * functions, typed loaders): both count as failed, never as a success.
 */
const behaviorProofFnWrapper: FnWrapper = function* (factory, thisArg, args) {
  if (!recording) return yield* factory.apply(thisArg, args);
  let hostTags: readonly string[];
  try {
    hostTags = yield* ɵHostTag();
  } catch {
    return yield* factory.apply(thisArg, args);
  }
  // A service or component body is the host being built, not something a
  // user triggers.
  const host = hostTags[hostTags.length - 1];
  if (!host || HOST_FACTORY_TAG.test(host)) {
    return yield* factory.apply(thisArg, args);
  }
  try {
    const result = yield* factory.apply(thisArg, args);
    record(
      hostTags,
      isCraftException(result)
        ? { outcome: 'failed', exception: result._tag }
        : { outcome: 'succeeded' },
    );
    return result;
  } catch (error) {
    const tag = (error as { _tag?: unknown } | null)?._tag;
    record(hostTags, {
      outcome: 'failed',
      exception:
        typeof tag === 'string'
          ? tag
          : error instanceof Error
            ? error.name
            : 'unknown',
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
