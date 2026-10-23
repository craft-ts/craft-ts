import {
  activateCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  type SendContextEvent,
  type SendContextReplayExport,
  type CraftReplayTarget,
  isCraftReplayTransportEvent,
  ɵresolveCraftReplayTarget,
} from '@craft-ts/core';
import { CRAFT_REPLAY_HOVER_ATTRIBUTE } from '@craft-ts/style';
import {
  compareReplayScenarioValue,
  readReplayScenarioPath,
  type ReplayScenario,
  type ReplayScenarioTolerance,
  validateReplayScenario,
} from './debug-session-scenario';
import { createDebugSessionNativeControlReplayPresentation } from './debug-session-native-control-replay';
import { migrateDebugSessionExport } from './debug-session-format';
import {
  compileReplayPlan,
  executeReplayPlan,
  replayObservationSatisfied,
  type ReplayCommand,
  type ReplayPlan,
  type ReplayTargetResolver,
  validateReplaySnapshot,
} from './debug-session-orchestrator';

export type ReplayValidation =
  | Readonly<{
      ok: true;
      session: SendContextReplayExport;
    }>
  | Readonly<{ ok: false; error: string }>;

/** Parse the portable format without accepting partial or unknown versions. */
export function validateReplayExport(json: string): ReplayValidation {
  const validation = validateDebugSessionExport(json);
  if (!validation.ok) return validation;
  const stepError = validateReplaySteps(validation.session.events);
  if (stepError) return { ok: false, error: stepError };
  const invocationError = validateReplayInvocations(validation.session.events);
  if (invocationError) return { ok: false, error: invocationError };
  const httpIdentityError = validateConcurrentHttpReplayIdentity(
    validation.session.events,
  );
  if (httpIdentityError) return { ok: false, error: httpIdentityError };
  if (validation.session.truncated) {
    return {
      ok: false,
      error: 'This session is truncated or incomplete and cannot be replayed.',
    };
  }
  if (
    validation.session.clips.some(
      (clip) => isRecord(clip) && clip['truncated'] === true,
    )
  ) {
    return {
      ok: false,
      error: 'A recording clip was truncated; this session cannot be replayed.',
    };
  }
  return validation;
}

function validateReplayInvocations(
  events: readonly SendContextEvent[],
): string | undefined {
  const missingInvocation = events.find((event) => {
    if (event.kind !== 'craft' || event.phase !== 'started') return false;
    const payload = isRecord(event.payload) ? event.payload : undefined;
    return (
      typeof payload?.['host'] === 'string' &&
      payload['host'].startsWith('method:') &&
      !isReplayInvocationEvent(event) &&
      !events.some(
        (trigger) =>
          trigger.kind === 'gesture' &&
          trigger.phase === 'emitted' &&
          trigger.correlationId === event.correlationId &&
          trigger.sequence < event.sequence,
      )
    );
  });
  if (missingInvocation)
    return `L’appel Craft ${missingInvocation.sequence} ne contient pas les données nécessaires au rejeu par invocation. Enregistre une nouvelle session avec la capture des arguments activée.`;

  const unreplayableInvocation = events.find((event) => {
    if (event.kind !== 'craft' || event.phase !== 'started') return false;
    const payload = isRecord(event.payload) ? event.payload : undefined;
    if (
      typeof payload?.['host'] !== 'string' ||
      !payload['host'].startsWith('method:')
    )
      return false;
    const invocation = isRecord(payload['replayInvocation'])
      ? payload['replayInvocation']
      : undefined;
    return (
      Array.isArray(invocation?.['args']) &&
      invocation['args'].some(hasUnreplayableReplayArgument)
    );
  });
  if (unreplayableInvocation)
    return `L’appel Craft ${unreplayableInvocation.sequence} contient un argument non sérialisable ou expurgé ; la session reste inspectable, mais ce replay est refusé.`;
  return undefined;
}

function validateConcurrentHttpReplayIdentity(
  events: readonly SendContextEvent[],
): string | undefined {
  const requests = events.flatMap((started) => {
    if (
      started.kind !== 'http' ||
      started.phase !== 'started' ||
      !started.operationId ||
      !isRecord(started.payload) ||
      started.payload['source'] !== 'craft-http-client'
    )
      return [];
    const finished = events.find(
      (candidate) =>
        candidate.kind === 'http' &&
        candidate.operationId === started.operationId &&
        (candidate.phase === 'succeeded' || candidate.phase === 'failed'),
    );
    if (!finished || !isRecord(started.payload)) return [];
    const timeOf = (event: SendContextEvent) =>
      event.globalElapsedMs ?? event.elapsedMs ?? event.timestamp;
    return [
      {
        identity: stableJson({
          method: started.payload['method'],
          url: started.payload['url'],
          params: started.payload['params'],
          payload: started.payload['payload'],
        }),
        replayKey:
          typeof started.payload['replayKey'] === 'string'
            ? started.payload['replayKey']
            : undefined,
        startedAt: timeOf(started),
        finishedAt: timeOf(finished),
      },
    ];
  });
  const byIdentity = new Map<string, typeof requests>();
  for (const request of requests) {
    const group = byIdentity.get(request.identity) ?? [];
    group.push(request);
    byIdentity.set(request.identity, group);
  }
  for (const group of byIdentity.values()) {
    for (let first = 0; first < group.length; first += 1) {
      for (let second = first + 1; second < group.length; second += 1) {
        const left = group[first]!;
        const right = group[second]!;
        const overlap =
          left.startedAt < right.finishedAt &&
          right.startedAt < left.finishedAt;
        if (
          overlap &&
          (!left.replayKey ||
            !right.replayKey ||
            left.replayKey === right.replayKey)
        )
          return 'Two concurrent Craft HTTP requests have the same method, URL, parameters and body. Give each request a distinct replayKey before replaying this session.';
      }
    }
  }
  return undefined;
}

/** Parse a session for inspection, including retained data from truncated exports. */
export function validateDebugSessionExport(json: string): ReplayValidation {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The pasted session is not valid JSON.' };
  }
  if (!isRecord(value))
    return { ok: false, error: 'The session must be a JSON object.' };
  if (value['format'] !== 'craft-debug-session') {
    return {
      ok: false,
      error: 'Cette session ne déclare pas le format craft-debug-session.',
    };
  }
  const normalized = migrateDebugSessionExport(value);
  if (!normalized.ok) return normalized;
  const normalizedValue = normalized.value as unknown as Record<
    string,
    unknown
  >;
  if (
    !Array.isArray(normalizedValue['events']) ||
    !Array.isArray(normalizedValue['clips']) ||
    typeof normalizedValue['truncated'] !== 'boolean'
  ) {
    return {
      ok: false,
      error: 'The session is incomplete and cannot be inspected.',
    };
  }
  if (
    typeof normalizedValue['startUrl'] !== 'string' ||
    typeof normalizedValue['exportedAt'] !== 'number'
  ) {
    return {
      ok: false,
      error: 'The session is missing its start URL or export timestamp.',
    };
  }
  if (normalizedValue['viewport'] !== undefined) {
    const viewport = normalizedValue['viewport'];
    if (
      !isRecord(viewport) ||
      !Number.isSafeInteger(viewport['width']) ||
      !Number.isSafeInteger(viewport['height']) ||
      (viewport['width'] as number) < 1 ||
      (viewport['height'] as number) < 1 ||
      (viewport['width'] as number) > 16_384 ||
      (viewport['height'] as number) > 16_384
    ) {
      return { ok: false, error: 'The recorded viewport is invalid.' };
    }
  }
  if (
    normalizedValue['initialSnapshot'] !== undefined &&
    !isRecord(normalizedValue['initialSnapshot'])
  ) {
    return { ok: false, error: 'The initial primitive snapshot is invalid.' };
  }
  if (normalizedValue['snapshots'] !== undefined) {
    if (!Array.isArray(normalizedValue['snapshots']))
      return { ok: false, error: 'The replay snapshots are invalid.' };
    for (const snapshot of normalizedValue['snapshots']) {
      const validation = validateReplaySnapshot(snapshot);
      if (!validation.ok) return validation;
    }
  }
  const events = normalizedValue['events'];
  if (!events.every(isReplayEvent))
    return { ok: false, error: 'The session contains an invalid event.' };
  const validEvents = events as SendContextEvent[];
  const transportProgress = new Map<
    string,
    { sequence: number; elapsedMs: number; transportId: string; kind: string }
  >();
  for (const event of validEvents) {
    if (event.kind !== 'transport') continue;
    const transportEvent = event.payload;
    if (!isCraftReplayTransportEvent(transportEvent))
      return {
        ok: false,
        error: `Transport event ${event.sequence} is invalid.`,
      };
    if (!transportEvent.replayable)
      return {
        ok: false,
        error: `Transport event ${event.sequence} cannot be replayed: ${transportEvent.reason ?? 'unsupported data'}.`,
      };
    const previous = transportProgress.get(transportEvent.instanceId);
    const eventElapsedMs = event.elapsedMs ?? transportEvent.elapsedMs;
    if (
      !Number.isFinite(eventElapsedMs) ||
      transportEvent.elapsedMs !== eventElapsedMs ||
      (previous &&
        (transportEvent.sequence <= previous.sequence ||
          eventElapsedMs < previous.elapsedMs)) ||
      (previous &&
        (transportEvent.transportId !== previous.transportId ||
          transportEvent.transport !== previous.kind))
    )
      return {
        ok: false,
        error: `Transport instance ${transportEvent.instanceId} has unordered or inconsistent events.`,
      };
    transportProgress.set(transportEvent.instanceId, {
      sequence: transportEvent.sequence,
      elapsedMs: eventElapsedMs,
      transportId: transportEvent.transportId,
      kind: transportEvent.transport,
    });
    if (
      transportEvent.data &&
      new TextEncoder().encode(JSON.stringify(transportEvent.data)).byteLength >
        1_048_576
    )
      return {
        ok: false,
        error: `Transport event ${event.sequence} exceeds the replay payload limit.`,
      };
  }
  const eventIds = new Set<string>();
  let previousSequence = 0;
  for (const event of validEvents) {
    if (
      !Number.isSafeInteger(event.sequence) ||
      event.sequence <= previousSequence ||
      eventIds.has(event.id)
    )
      return {
        ok: false,
        error: 'The session contains duplicate or unordered event identities.',
      };
    eventIds.add(event.id);
    previousSequence = event.sequence;
  }
  return { ok: true, session: value as unknown as SendContextReplayExport };
}

function validateReplaySteps(
  events: readonly SendContextEvent[],
): string | undefined {
  for (const event of events) {
    if (event.kind === 'pending') {
      const payload = isRecord(event.payload) ? event.payload : undefined;
      if (
        (event.phase !== 'started' &&
          event.phase !== 'succeeded' &&
          event.phase !== 'failed') ||
        !payload ||
        !event.operationId ||
        typeof payload['source'] !== 'string' ||
        typeof payload['boundaryId'] !== 'number' ||
        (payload['mode'] !== 'suspended' && payload['mode'] !== 'reloading') ||
        (event.phase === 'started'
          ? payload['transition'] !== 'visible' ||
            typeof payload['fallbackRendered'] !== 'boolean'
          : event.phase === 'succeeded'
            ? payload['transition'] !== 'settled'
            : payload['transition'] !== 'destroyed')
      )
        return `Pending transition event ${event.sequence} has an invalid operation identity or transition.`;
      continue;
    }
    if (event.kind === 'route-load') {
      const payload = isRecord(event.payload) ? event.payload : undefined;
      if (!payload)
        return `Route load event ${event.sequence} is missing its payload.`;
      if (
        event.phase !== 'started' &&
        event.phase !== 'succeeded' &&
        event.phase !== 'failed'
      )
        return `Route load event ${event.sequence} has an invalid event phase.`;
      if (payload['phase'] !== 'component' && payload['phase'] !== 'children')
        return `Route load event ${event.sequence} has an invalid load phase.`;
      if (
        typeof payload['routePath'] !== 'string' ||
        payload['routePath'].length > 2_048
      )
        return `Route load event ${event.sequence} has an invalid routePath (expected a string up to 2048 characters; the root route may be empty).`;
      if (typeof payload['targetUrl'] !== 'string')
        return `Route load event ${event.sequence} has an invalid targetUrl.`;
      if (!event.operationId)
        return `Route load event ${event.sequence} is missing its operationId.`;
      if (
        event.phase === 'started'
          ? payload['outcome'] !== undefined
          : payload['outcome'] !==
            (event.phase === 'succeeded' ? 'loaded' : 'error')
      )
        return `Route load event ${event.sequence} has an invalid outcome for phase "${event.phase}".`;
      continue;
    }
    if (event.kind === 'defer') {
      const payload = isRecord(event.payload) ? event.payload : undefined;
      if (
        (event.phase !== 'started' &&
          event.phase !== 'succeeded' &&
          event.phase !== 'failed') ||
        !payload ||
        typeof payload['targetId'] !== 'string' ||
        payload['targetId'].length === 0 ||
        payload['targetId'].length > 128
      )
        return `Deferred activation event ${event.sequence} has an invalid target identity.`;
      if (
        event.phase !== 'started' &&
        (typeof payload['activationEventId'] !== 'string' ||
          (payload['outcome'] !== 'loaded' && payload['outcome'] !== 'error'))
      )
        return `Deferred result event ${event.sequence} has an invalid outcome.`;
      continue;
    }
    if (event.phase !== 'emitted') continue;
    const payload = isRecord(event.payload) ? event.payload : undefined;
    if (event.kind === 'gesture') {
      const detail =
        payload && isRecord(payload['detail']) ? payload['detail'] : undefined;
      if (
        typeof payload?.['trigger'] !== 'string' ||
        payload['trigger'].length === 0 ||
        payload['trigger'].length > 64 ||
        !event.correlationId ||
        !isCraftReplayTarget(payload['replayTarget']) ||
        (payload['detail'] !== undefined && detail === undefined)
      )
        return `Gesture event ${event.sequence} has invalid trigger or target metadata.`;
    } else if (event.kind === 'dom' || event.kind === 'hover') {
      if (
        !payload ||
        typeof payload['selector'] !== 'string' ||
        payload['selector'].length === 0 ||
        payload['selector'].length > 2_048 ||
        !hasValidSelectorSyntax(payload['selector']) ||
        typeof payload['action'] !== 'string' ||
        payload['action'].length === 0 ||
        payload['action'].length > 64
      )
        return `Interaction event ${event.sequence} has an invalid selector or action.`;
      if (
        payload['replayTarget'] !== undefined &&
        !isCraftReplayTarget(payload['replayTarget'])
      )
        return `Interaction event ${event.sequence} has an invalid Craft target identity.`;
    } else if (event.kind === 'scroll') {
      if (
        !payload ||
        (payload['target'] === 'viewport'
          ? !isFiniteNumber(payload['scrollX']) ||
            !isFiniteNumber(payload['scrollY'])
          : payload['target'] === 'element'
            ? typeof payload['selector'] !== 'string' ||
              payload['selector'].length === 0 ||
              payload['selector'].length > 2_048 ||
              !hasValidSelectorSyntax(payload['selector']) ||
              !isFiniteNumber(payload['scrollLeft']) ||
              !isFiniteNumber(payload['scrollTop'])
            : true)
      )
        return `Scroll event ${event.sequence} has an invalid target or position.`;
    } else if (event.kind === 'viewport') {
      if (!payload || !isValidViewport(payload['width'], payload['height']))
        return `Viewport event ${event.sequence} has invalid dimensions.`;
    }
  }
  const deferActivations = events.filter(
    (event) => event.kind === 'defer' && event.phase === 'started',
  );
  for (const activation of deferActivations) {
    const activationPayload = isRecord(activation.payload)
      ? activation.payload
      : undefined;
    const results = events.filter((candidate) => {
      if (
        candidate.kind !== 'defer' ||
        (candidate.phase !== 'succeeded' && candidate.phase !== 'failed') ||
        !isRecord(candidate.payload)
      )
        return false;
      return candidate.payload['activationEventId'] === activation.id;
    });
    if (results.length !== 1)
      return `Deferred activation event ${activation.sequence} must have exactly one recorded result.`;
    const resultPayload = isRecord(results[0]!.payload)
      ? results[0]!.payload
      : undefined;
    if (
      resultPayload?.['targetId'] !== activationPayload?.['targetId'] ||
      (results[0]!.phase === 'succeeded') !==
        (resultPayload?.['outcome'] === 'loaded')
    )
      return `Deferred activation event ${activation.sequence} has an inconsistent recorded result.`;
  }
  return undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValidSelectorSyntax(selector: string): boolean {
  if (typeof document === 'undefined') return true;
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

function isValidViewport(width: unknown, height: unknown): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    (width as number) >= 1 &&
    (height as number) >= 1 &&
    (width as number) <= 16_384 &&
    (height as number) <= 16_384
  );
}

function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function isCraftReplayTarget(value: unknown): value is CraftReplayTarget {
  return (
    isRecord(value) &&
    typeof value['runtimeId'] === 'string' &&
    value['runtimeId'].length > 0 &&
    Array.isArray(value['componentPath']) &&
    value['componentPath'].length === 1 &&
    value['componentPath'].every(
      (segment) =>
        typeof segment === 'string' &&
        segment.length > 0 &&
        segment.length <= 128,
    ) &&
    (value['stability'] === undefined ||
      value['stability'] === 'stable' ||
      value['stability'] === 'unstable') &&
    Array.isArray(value['localTargetPath']) &&
    value['localTargetPath'].length <= 128 &&
    value['localTargetPath'].every(
      (segment) =>
        typeof segment === 'number' &&
        Number.isSafeInteger(segment) &&
        segment >= 0,
    ) &&
    (value['fallback'] === undefined ||
      (isRecord(value['fallback']) &&
        (value['fallback']['selector'] === undefined ||
          (typeof value['fallback']['selector'] === 'string' &&
            value['fallback']['selector'].length <= 2_048)) &&
        (value['fallback']['clientX'] === undefined ||
          isFiniteNumber(value['fallback']['clientX'])) &&
        (value['fallback']['clientY'] === undefined ||
          isFiniteNumber(value['fallback']['clientY']))))
  );
}

async function waitForCraftReplayTarget(
  target: CraftReplayTarget,
  timeoutMs = 10_000,
  aborted?: () => boolean,
): Promise<ReturnType<typeof ɵresolveCraftReplayTarget>> {
  const deadline = performance.now() + timeoutMs;
  let result = ɵresolveCraftReplayTarget(target);
  while (
    result.status === 'missing' &&
    performance.now() < deadline &&
    !aborted?.()
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    result = ɵresolveCraftReplayTarget(target);
  }
  return result;
}

async function waitForReplayTarget(
  selector: string,
  timeoutMs = 10_000,
  aborted?: () => boolean,
): Promise<HTMLElement | null> {
  const deadline = performance.now() + timeoutMs;
  do {
    const target = safeQuerySelector(selector);
    if (target instanceof HTMLElement) return target;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  } while (performance.now() < deadline && !aborted?.());
  return null;
}

function isReplayDestinationCurrent(href: unknown): boolean {
  if (typeof href !== 'string') return false;
  try {
    const recorded = new URL(href, location.href);
    const current = new URL(location.href);
    if (recorded.origin !== current.origin) return false;
    recorded.searchParams.delete('craft-debug-replay');
    current.searchParams.delete('craft-debug-replay');
    return (
      recorded.pathname === current.pathname &&
      (!recorded.search || recorded.search === current.search) &&
      (!recorded.hash || recorded.hash === current.hash)
    );
  } catch {
    return false;
  }
}

function hasUnreplayableReplayArgument(value: unknown): boolean {
  if (value === '[REDACTED]' || value === '[REDACTED_EMAIL]') return true;
  if (Array.isArray(value)) return value.some(hasUnreplayableReplayArgument);
  if (!isRecord(value)) return false;
  if ('$craftReplayUnsupported' in value) return true;
  const event = value['$craftReplayEvent'];
  if (isRecord(event) && event['replayTarget'] !== undefined) {
    if (
      !isCraftReplayTarget(event['replayTarget']) ||
      event['replayTarget']['stability'] === 'unstable'
    )
      return true;
  }
  return Object.values(value).some(hasUnreplayableReplayArgument);
}

function isReplayEvent(value: unknown): value is SendContextEvent {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    value['id'].length <= 200 &&
    typeof value['sequence'] === 'number' &&
    Number.isFinite(value['sequence']) &&
    typeof value['timestamp'] === 'number' &&
    Number.isFinite(value['timestamp']) &&
    (value['elapsedMs'] === undefined ||
      (typeof value['elapsedMs'] === 'number' &&
        Number.isFinite(value['elapsedMs']) &&
        value['elapsedMs'] >= 0)) &&
    typeof value['kind'] === 'string' &&
    (value['phase'] === 'started' ||
      value['phase'] === 'emitted' ||
      value['phase'] === 'succeeded' ||
      value['phase'] === 'failed')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasReplayStateDifference(expected: unknown, actual: unknown): boolean {
  if (isRecord(expected) && isRecord(actual)) {
    // Route transitions add and remove registry entries while a checkpoint is
    // captured. Compare only primitive addresses that exist on both sides.
    const sharedKeys = Object.keys(expected).filter((key) => key in actual);
    return sharedKeys.some(
      (key) => !replaySnapshotValueMatches(expected[key], actual[key]),
    );
  }
  return !replaySnapshotValueMatches(expected, actual);
}

function replaySnapshotValueMatches(
  expected: unknown,
  actual: unknown,
): boolean {
  // Session exports replace repeated references and over-deep values with
  // these markers. They describe serialization limits, not the live value.
  if (expected === '[Circular]' || expected === '[Depth limit]') return true;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, index) =>
        replaySnapshotValueMatches(value, actual[index]),
      )
    );
  if (isRecord(expected) && isRecord(actual))
    return Object.keys(expected).every(
      (key) =>
        key in actual && replaySnapshotValueMatches(expected[key], actual[key]),
    );
  return stableJson(expected) === stableJson(actual);
}

export type ReplayDifference = Readonly<{
  eventId: string;
  expected: unknown;
  actual: unknown;
  tolerances?: readonly ReplayScenarioTolerance[];
  recovery?: ReplayRecovery;
  skip?: Readonly<{ checkpointEventId: string; index: number }>;
}>;
export type ReplayRecovery = Readonly<{
  href?: string;
  state?: unknown;
}>;
export type ReplaySkip = Readonly<{
  recovery: ReplayRecovery;
  nextIndex: number;
  from: number;
  checkpointEventId: string;
}>;
export type ReplayController = Readonly<{
  /** The explicit command/observation plan compiled before the first action. */
  plan(): ReplayPlan;
  clock: VirtualCraftTemporalRuntime;
  index(): number;
  playing(): boolean;
  step(): Promise<ReplayDifference | undefined>;
  forceAndContinue(): Promise<ReplayRecovery | undefined>;
  skipToCheckpoint(): Promise<
    | Readonly<{ from: number; to: number; checkpointEventId: string }>
    | undefined
  >;
  play(): void;
  /**
   * Stop waiting: the next interaction starts now, and the recorded timeline
   * shifts so that the ones after it keep their spacing. Only while playing.
   */
  skipWait(): void;
  pause(): void;
  stop(): void;
}>;

export type ReplayDiagnosticReport = Readonly<{
  commandId: string;
  expectedCount: number;
  observedCount: number;
  missing: readonly string[];
  unexpected: readonly string[];
}>;

/**
 * Replays app DOM events only. It never relaxes the browser's network boundary:
 * fetch interception is installed separately and unmatched requests reject.
 */
export function createReplayController(
  session: SendContextReplayExport,
  options: Readonly<{
    /** Shared wall-clock origin used to synchronize participants from one archive. */
    timelineOriginMs?: number;
    /** Resume after a target page reload without replaying completed actions. */
    startIndex?: number;
    onDifference?: (event: SendContextEvent) => ReplayDifference | undefined;
    onError?: (message: string) => void;
    onWarning?: (message: string) => void;
    observedEvents?: () => readonly SendContextEvent[];
    readState?: () => unknown;
    /** Applies recorded primitive checkpoints at their original timeline position. */
    restoreState?: (state: unknown, event?: SendContextEvent) => void;
    /** Advances async replay adapters alongside the recorded event timeline. */
    onTimelineAdvance?: (elapsedMs: number) => void | Promise<void>;
    prepare?: () => void | Promise<void>;
    onReplayDifference?: (difference: ReplayDifference) => void;
    onProgress?: (
      index: number,
      total: number,
      state: string,
      nextDelayMs?: number,
    ) => void;
    onInteraction?: (event: SendContextEvent, target: HTMLElement) => void;
    /** Activate a recorded deferNode by its stable semantic identity. */
    onDeferActivation?: (
      event: SendContextEvent,
      targetId: string,
    ) => Promise<'loaded' | 'error'>;
    /** Invoke the recorded Craft method roots associated with this visual step. */
    invokeRecordedMethod?: (event: SendContextEvent) => void | Promise<void>;
    /** Explicit opt-in for the isolated pre-invocation DOM replay path. */
    mode?: 'invocation' | 'legacy-dom' | 'diagnostic';
    /** Non-blocking comparison of legacy playback with the compiled plan. */
    onDiagnostic?: (report: ReplayDiagnosticReport) => void;
    /** Apply a recorded navigation through the application's router. */
    navigateToRecordedRoute?: (
      url: string,
      options?: Readonly<{
        replaceUrl?: boolean;
        skipLocationChange?: boolean;
      }>,
    ) => void | Promise<void>;
    onScroll?: (event: SendContextEvent) => void;
    onViewport?: (event: SendContextEvent) => void | Promise<void>;
    forceRecovery?: (recovery: ReplayRecovery) => void | Promise<void>;
    /** Explicit sidecar contract for checkpoint assertions in test replay. */
    scenario?: ReplayScenario;
    /** Maximum time to wait for an expected async invocation; defaults to 2500 ms. */
    settleTimeoutMs?: number;
    /** Resolve routes and registered Craft targets in the running application. */
    resolveTarget?: ReplayTargetResolver;
  }> = {},
): ReplayController {
  if (options.scenario) {
    const validation = validateReplayScenario(JSON.stringify(options.scenario));
    if (!validation.ok) throw new Error(validation.error);
  }
  const orchestrationPlan = compileReplayPlan(
    session,
    options.resolveTarget,
    hasValidSelectorSyntax,
  );
  const recordedSteps = getReplaySteps(session.events);
  const eventBySequence = new Map(
    session.events.map((event) => [event.sequence, event]),
  );
  const plannedSteps = orchestrationPlan.commands
    .filter((command) => command.kind !== 'restore-snapshot')
    .flatMap((command) => {
      const event = eventBySequence.get(command.sequence);
      return event ? [event] : [];
    });
  const plannedSequences = new Set(plannedSteps.map((event) => event.sequence));
  const legacySyntheticSteps = recordedSteps.filter(
    (event) =>
      isRecord(event.payload) &&
      event.payload['interactionName'] === 'legacy-source$:pointerdown' &&
      !plannedSequences.has(event.sequence),
  );
  const interactions = [...plannedSteps, ...legacySyntheticSteps].sort(
    (left, right) => left.sequence - right.sequence,
  );
  // Invocation is the default. The old event-dispatch implementation is only
  // available through an explicit compatibility mode and is never selected as
  // a fallback when a recorded method cannot be identified.
  const useInvocationReplay = options.mode !== 'legacy-dom';
  const timeOf = (event: SendContextEvent): number =>
    options.timelineOriginMs !== undefined &&
    typeof event.globalElapsedMs === 'number'
      ? event.globalElapsedMs
      : (event.elapsedMs ?? event.timestamp);
  const firstTime =
    options.timelineOriginMs ??
    timeOf(
      interactions[0] ??
        session.events[0] ??
        ({ timestamp: 0 } as SendContextEvent),
    );
  const clock = new VirtualCraftTemporalRuntime(firstTime);
  const restoreClock = activateCraftTemporalRuntime(clock);
  const baselineEvents = options.observedEvents?.().length ?? 0;
  const observedRouteOperationIds = new Map<string, string>();
  const usedObservedRouteOperationIds = new Set<string>();
  const ambiguousRouteOperationIds = new Set<string>();
  let prepared = false;
  const startingCursor = Math.min(
    interactions.length,
    Math.max(0, Math.floor(options.startIndex ?? 0)),
  );
  let cursor = startingCursor;
  let running = false;
  let terminated = false;
  let playbackEpoch: number | undefined;
  if (cursor > 0 && cursor < interactions.length) {
    playbackEpoch =
      performance.now() - (timeOf(interactions[cursor]!) - firstTime);
  }
  let playbackPaused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let playbackWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let resolvePlaybackWait: (() => void) | undefined;
  let playbackStepInFlight = false;
  // Bumped by `skipWait`; a wait that started earlier gives up when it changes.
  let skipGeneration = 0;
  const skippable = (): (() => boolean) | undefined => {
    // Only invocation replay has a fallback for a target that never shows up.
    if (!useInvocationReplay) return undefined;
    const generation = skipGeneration;
    return () => skipGeneration !== generation;
  };
  const playbackResumeWaiters: Array<() => void> = [];
  let restoreFetch: (() => void) | undefined;
  let recordedResponseResolver: RecordedResponseResolver | undefined;
  const pendingInvocationTasks: Promise<void>[] = [];
  let pendingInvocationError: unknown;
  let restoreReplayScrollBlock: (() => void) | undefined;
  const nativeControlPresentation =
    createDebugSessionNativeControlReplayPresentation();
  const replayHoverTargetsByPointer = new Map<number, Map<string, Element>>();
  const replayHoverReferenceCounts = new Map<Element, number>();
  const clearReplayHoverState = (): void => {
    for (const element of replayHoverReferenceCounts.keys())
      element.removeAttribute(CRAFT_REPLAY_HOVER_ATTRIBUTE);
    replayHoverReferenceCounts.clear();
    replayHoverTargetsByPointer.clear();
  };
  const syncReplayHoverState = (event: SendContextEvent): void => {
    if (event.kind !== 'hover' || !isRecord(event.payload)) return;
    const payload = event.payload;
    const pointerId =
      typeof payload['pointerId'] === 'number' ? payload['pointerId'] : 1;
    const activeTargets =
      replayHoverTargetsByPointer.get(pointerId) ?? new Map<string, Element>();
    const targets = Array.isArray(payload['craftHoverTargets'])
      ? payload['craftHoverTargets']
      : [];
    for (const value of targets) {
      if (!isRecord(value)) continue;
      const selector =
        typeof value['selector'] === 'string' ? value['selector'] : undefined;
      const replayTarget = isCraftReplayTarget(value['replayTarget'])
        ? value['replayTarget']
        : undefined;
      const key = replayTarget
        ? JSON.stringify(replayTarget)
        : (selector ?? '');
      if (!key) continue;

      if (payload['action'] === 'enter') {
        if (activeTargets.has(key)) continue;
        const resolution = replayTarget
          ? ɵresolveCraftReplayTarget(replayTarget)
          : undefined;
        const element =
          resolution?.status === 'resolved'
            ? resolution.element
            : !replayTarget && selector
              ? safeQuerySelector(selector)
              : null;
        if (!element) continue;
        activeTargets.set(key, element);
        const references = replayHoverReferenceCounts.get(element) ?? 0;
        replayHoverReferenceCounts.set(element, references + 1);
        element.setAttribute(CRAFT_REPLAY_HOVER_ATTRIBUTE, '');
      } else if (payload['action'] === 'leave') {
        const element = activeTargets.get(key);
        if (!element) continue;
        activeTargets.delete(key);
        const references = replayHoverReferenceCounts.get(element) ?? 0;
        if (references <= 1) {
          replayHoverReferenceCounts.delete(element);
          element.removeAttribute(CRAFT_REPLAY_HOVER_ATTRIBUTE);
        } else {
          replayHoverReferenceCounts.set(element, references - 1);
        }
      }
    }
    if (activeTargets.size > 0)
      replayHoverTargetsByPointer.set(pointerId, activeTargets);
    else replayHoverTargetsByPointer.delete(pointerId);
  };
  const pendingScrollEvents = new Map<EventTarget, () => void>();
  const writeAndWaitForScroll = (
    target: EventTarget,
    write: () => void,
  ): Promise<void> =>
    new Promise((resolve) => {
      let timeout: ReturnType<typeof setTimeout>;
      const finish = () => {
        pendingScrollEvents.delete(target);
        clearTimeout(timeout);
        resolve();
      };
      timeout = setTimeout(finish, 100);
      pendingScrollEvents.set(target, finish);
      write();
    });
  if (useInvocationReplay && typeof window !== 'undefined') {
    const blockApplicationScrollHandlers = (event: Event) => {
      const eventTarget = event.target;
      if (eventTarget instanceof EventTarget)
        pendingScrollEvents.get(eventTarget)?.();
      if (eventTarget === document) pendingScrollEvents.get(window)?.();
      event.stopImmediatePropagation();
    };
    window.addEventListener('scroll', blockApplicationScrollHandlers, true);
    restoreReplayScrollBlock = () =>
      window.removeEventListener(
        'scroll',
        blockApplicationScrollHandlers,
        true,
      );
  }
  let pendingRecovery:
    | Readonly<{ recovery: ReplayRecovery; nextIndex: number }>
    | undefined;
  let pendingSkip: ReplaySkip | undefined;
  const stop = (reset = false, resetClock = true): void => {
    if (running) playbackPaused = true;
    running = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (playbackWaitTimer !== undefined) clearTimeout(playbackWaitTimer);
    playbackWaitTimer = undefined;
    resolvePlaybackWait?.();
    resolvePlaybackWait = undefined;
    if (reset) playbackResumeWaiters.splice(0).forEach((resume) => resume());
    if (reset) {
      recordedResponseResolver?.dispose();
      recordedResponseResolver = undefined;
      restoreFetch?.();
      restoreFetch = undefined;
      restoreReplayScrollBlock?.();
      restoreReplayScrollBlock = undefined;
      nativeControlPresentation.dispose();
      if (resetClock) clearReplayHoverState();
      restoreClock();
      if (resetClock) clock.reset(firstTime);
      playbackEpoch = undefined;
      playbackPaused = false;
      terminated = true;
    }
  };
  const installRecordedFetchReplay = (): void => {
    if (restoreFetch || !useInvocationReplay || typeof window === 'undefined')
      return;
    recordedResponseResolver = createRecordedResponseResolver(
      session,
      options.scenario,
    );
    recordedResponseResolver.enableTimeline();
    restoreFetch = installReplayNetworkGuard(
      recordedResponseResolver,
      (request) => {
        stop(true);
        options.onError?.(
          `Replay stopped: no recorded response for ${request.method} ${request.url}`,
        );
      },
    );
  };
  // Install before preparation and before the first visual step. Loaders
  // triggered by route preparation must already receive recorded fetch results.
  if (!orchestrationPlan.issues.some((issue) => issue.blocking !== false))
    installRecordedFetchReplay();
  const waitForPlaybackTime = async (
    recordedTime: number,
  ): Promise<boolean> => {
    if (!running) return true;
    while (!terminated) {
      if (!running) {
        await new Promise<void>((resolve) =>
          playbackResumeWaiters.push(resolve),
        );
        continue;
      }
      if (playbackEpoch === undefined) return true;
      const remaining = Math.max(
        0,
        recordedTime - firstTime - (performance.now() - playbackEpoch),
      );
      if (remaining === 0) return true;
      await new Promise<void>((resolve) => {
        resolvePlaybackWait = resolve;
        playbackWaitTimer = setTimeout(() => {
          playbackWaitTimer = undefined;
          resolvePlaybackWait = undefined;
          resolve();
        }, remaining);
      });
    }
    return false;
  };
  const restorePrimitiveChangesBetweenSteps = async (
    event: SendContextEvent,
    includeTrailing = false,
  ): Promise<boolean> => {
    const followingInteraction = interactions[cursor + 1];
    if (!followingInteraction && !includeTrailing) return true;
    const changes = session.events
      .filter(
        (candidate) =>
          candidate.sequence > event.sequence &&
          (followingInteraction === undefined ||
            candidate.sequence < followingInteraction.sequence) &&
          candidate.kind === 'primitive' &&
          candidate.name === 'primitive-change' &&
          candidate.state !== undefined,
      )
      .sort((left, right) => left.sequence - right.sequence);
    for (const change of changes) {
      if (!(await waitForPlaybackTime(timeOf(change)))) return false;
      await clock.advanceTo(Math.max(clock.now(), timeOf(change)));
      recordedResponseResolver?.advanceTo(timeOf(change));
      await options.onTimelineAdvance?.(timeOf(change));
      options.restoreState?.(change.state, change);
    }
    return true;
  };
  const step = async (): Promise<ReplayDifference | undefined> => {
    if (terminated) return undefined;
    const blockingIssues = orchestrationPlan.issues.filter(
      (issue) => issue.blocking !== false,
    );
    if (blockingIssues.length > 0) {
      options.onError?.(
        `Replay preflight failed: ${blockingIssues
          .map((issue) => issue.message)
          .join(' ')}`,
      );
      stop(true);
      return undefined;
    }
    const event = interactions[cursor];
    if (!event) {
      stop(true, false);
      return undefined;
    }
    const plannedCommand = orchestrationPlan.commands.find(
      (command) => command.sequence === event.sequence,
    );
    const observedBeforeIds = new Set(
      (options.observedEvents?.() ?? []).map((candidate) => candidate.id),
    );
    const legacySyntheticStep =
      isRecord(event.payload) &&
      event.payload['interactionName'] === 'legacy-source$:pointerdown';
    if (!plannedCommand && !legacySyntheticStep) {
      stop(true);
      options.onError?.(
        `Replay preflight did not produce a command for event ${event.id}.`,
      );
      return undefined;
    }
    if (!prepared) {
      prepared = true;
      try {
        await options.prepare?.();
        for (const priorEvent of interactions.slice(0, cursor))
          syncReplayHoverState(priorEvent);
      } catch (error) {
        stop(true);
        options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
    }
    if (plannedCommand?.kind === 'navigate' && event.kind === 'navigation') {
      const payload = isRecord(event.payload) ? event.payload : {};
      const url = payload['url'];
      if (typeof url !== 'string' || !options.navigateToRecordedRoute) {
        stop(true);
        options.onError?.(
          typeof url !== 'string'
            ? `Replay navigation event ${event.sequence} has no recorded URL.`
            : 'Replay cannot apply a recorded browser history navigation in this application.',
        );
        return undefined;
      }
      if (!(await waitForPlaybackTime(timeOf(event)))) return undefined;
      await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
      recordedResponseResolver?.advanceTo(timeOf(event));
      await options.onTimelineAdvance?.(timeOf(event));
      const recordedOptions = isRecord(payload['navigationOptions'])
        ? payload['navigationOptions']
        : {};
      try {
        await options.navigateToRecordedRoute(url, {
          ...(typeof recordedOptions['replaceUrl'] === 'boolean'
            ? { replaceUrl: recordedOptions['replaceUrl'] }
            : {}),
          ...(typeof recordedOptions['skipLocationChange'] === 'boolean'
            ? { skipLocationChange: recordedOptions['skipLocationChange'] }
            : {}),
        });
      } catch (error) {
        stop(true);
        options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
      if (!(await restorePrimitiveChangesBetweenSteps(event, true)))
        return undefined;
      cursor += 1;
      if (cursor >= interactions.length) {
        stop(true, false);
        options.onProgress?.(cursor, interactions.length, 'completed');
      } else {
        options.onProgress?.(
          cursor,
          interactions.length,
          running ? 'playing' : 'paused',
          nextPlaybackDelayMs(),
        );
      }
      return undefined;
    }
    if (event.kind === 'defer' && event.phase === 'started') {
      const payload = isRecord(event.payload) ? event.payload : {};
      const targetId = payload['targetId'];
      if (typeof targetId !== 'string' || !options.onDeferActivation) {
        stop(true);
        options.onError?.(
          typeof targetId !== 'string'
            ? `Deferred node identity is invalid at event ${event.sequence}.`
            : 'Replay cannot activate a deferred node in this application.',
        );
        return undefined;
      }
      await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
      recordedResponseResolver?.advanceTo(timeOf(event));
      await options.onTimelineAdvance?.(timeOf(event));
      const expected = session.events.find((candidate) => {
        if (
          candidate.kind !== 'defer' ||
          (candidate.phase !== 'succeeded' && candidate.phase !== 'failed') ||
          !isRecord(candidate.payload)
        )
          return false;
        return candidate.payload['activationEventId'] === event.id;
      });
      const expectedOutcome = isRecord(expected?.payload)
        ? expected.payload['outcome']
        : undefined;
      const activationResult = Promise.resolve()
        .then(() => options.onDeferActivation!(event, targetId))
        .then(
          (outcome) => ({ outcome }),
          (error: unknown) => ({ error }),
        );
      try {
        // Deferred loaders can consume recorded HTTP, worker, and Craft timer
        // results. Advance those causal events while the loader is in flight,
        // through its recorded settlement point.
        const causalEvents = session.events
          .filter(
            (candidate) =>
              candidate.sequence > event.sequence &&
              (expected === undefined ||
                candidate.sequence <= expected.sequence),
          )
          .sort((left, right) => left.sequence - right.sequence);
        for (const causalEvent of causalEvents) {
          if (!(await waitForPlaybackTime(timeOf(causalEvent))))
            return undefined;
          await clock.advanceTo(Math.max(clock.now(), timeOf(causalEvent)));
          recordedResponseResolver?.advanceTo(timeOf(causalEvent));
          await options.onTimelineAdvance?.(timeOf(causalEvent));
          if (
            causalEvent.kind === 'primitive' &&
            causalEvent.name === 'primitive-change' &&
            causalEvent.state !== undefined
          )
            options.restoreState?.(causalEvent.state, causalEvent);
          await Promise.resolve();
          await Promise.resolve();
        }
        const result = await activationResult;
        if ('error' in result) throw result.error;
        const outcome = result.outcome;
        if (expectedOutcome === 'error' && outcome === 'error')
          options.onWarning?.(
            `Le chargement différé ${targetId} a échoué comme pendant l’enregistrement.`,
          );
        else if (expectedOutcome && expectedOutcome !== outcome)
          options.onWarning?.(
            `Le nœud différé ${targetId} a produit ${outcome} au lieu de ${String(expectedOutcome)} pendant l’enregistrement.`,
          );
      } catch (error) {
        stop(true);
        options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
      if (!(await restorePrimitiveChangesBetweenSteps(event, true)))
        return undefined;
      cursor += 1;
      if (cursor >= interactions.length) {
        stop(true, false);
        options.onProgress?.(cursor, interactions.length, 'completed');
      } else {
        options.onProgress?.(
          cursor,
          interactions.length,
          running ? 'playing' : 'paused',
          nextPlaybackDelayMs(),
        );
      }
      return undefined;
    }
    if (event.kind === 'viewport') {
      const payload = isRecord(event.payload) ? event.payload : {};
      if (
        !Number.isSafeInteger(payload['width']) ||
        !Number.isSafeInteger(payload['height']) ||
        (payload['width'] as number) < 1 ||
        (payload['height'] as number) < 1 ||
        (payload['width'] as number) > 16_384 ||
        (payload['height'] as number) > 16_384
      ) {
        stop(true);
        options.onError?.(
          `Replay viewport event ${event.sequence} is invalid.`,
        );
        return undefined;
      }
      await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
      if (playbackEpoch === undefined && cursor === startingCursor && running)
        playbackEpoch = performance.now();
      try {
        await options.onViewport?.(event);
      } catch (error) {
        stop(true);
        options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
      if (!(await restorePrimitiveChangesBetweenSteps(event, true)))
        return undefined;
      cursor += 1;
      if (cursor >= interactions.length) {
        stop(true, false);
        options.onProgress?.(cursor, interactions.length, 'completed');
      } else {
        options.onProgress?.(
          cursor,
          interactions.length,
          running ? 'playing' : 'paused',
          nextPlaybackDelayMs(),
        );
      }
      return undefined;
    }
    if (event.kind === 'scroll') {
      await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
      const payload = isRecord(event.payload) ? event.payload : {};
      const scrollSettlers: Promise<void>[] = [];
      if (
        payload['target'] === 'viewport' &&
        typeof payload['scrollX'] === 'number' &&
        typeof payload['scrollY'] === 'number'
      ) {
        if (
          window.scrollX !== payload['scrollX'] ||
          window.scrollY !== payload['scrollY']
        ) {
          scrollSettlers.push(
            writeAndWaitForScroll(window, () =>
              window.scrollTo({
                left: payload['scrollX'] as number,
                top: payload['scrollY'] as number,
                behavior: 'instant',
              }),
            ),
          );
        }
      } else if (
        payload['target'] === 'element' &&
        typeof payload['selector'] === 'string' &&
        typeof payload['scrollLeft'] === 'number' &&
        typeof payload['scrollTop'] === 'number'
      ) {
        const scroller = await waitForReplayTarget(payload['selector']);
        if (!scroller) {
          // Scroll positions are presentation state. A selector generated from
          // the old DOM can become stale after a route or layout change; keep
          // replaying semantic interactions and report the skipped scroll.
          options.onWarning?.(
            `Replay scroll target is invalid or not found: ${payload['selector']}`,
          );
        } else if (
          scroller.scrollLeft !== payload['scrollLeft'] ||
          scroller.scrollTop !== payload['scrollTop']
        ) {
          scrollSettlers.push(
            writeAndWaitForScroll(scroller, () => {
              scroller.scrollLeft = payload['scrollLeft'] as number;
              scroller.scrollTop = payload['scrollTop'] as number;
            }),
          );
        }
      } else {
        stop(true);
        options.onError?.(`Replay scroll event ${event.sequence} is invalid.`);
        return undefined;
      }
      await Promise.all(scrollSettlers);
      if (playbackEpoch === undefined && cursor === startingCursor && running)
        playbackEpoch = performance.now();
      options.onScroll?.(event);
      if (!(await restorePrimitiveChangesBetweenSteps(event, true)))
        return undefined;
      cursor += 1;
      if (cursor >= interactions.length) {
        stop(true, false);
        options.onProgress?.(cursor, interactions.length, 'completed');
      } else {
        options.onProgress?.(
          cursor,
          interactions.length,
          running ? 'playing' : 'paused',
          nextPlaybackDelayMs(),
        );
      }
      return undefined;
    }
    const observedBefore = options.observedEvents?.().length ?? baselineEvents;
    const payload = isRecord(event.payload) ? event.payload : {};
    const href = typeof payload['href'] === 'string' ? payload['href'] : '';
    const destinationMatches = (
      recordedUrl: string,
      interactionHref: string,
    ): boolean => {
      if (!interactionHref) return false;
      try {
        const recordedDestination = new URL(recordedUrl, session.startUrl);
        const clickedDestination = new URL(interactionHref, session.startUrl);
        return (
          recordedDestination.pathname === clickedDestination.pathname &&
          recordedDestination.search === clickedDestination.search &&
          recordedDestination.hash === clickedDestination.hash
        );
      } catch {
        return false;
      }
    };
    const navigationMatchesHref = (
      candidate: SendContextEvent,
      interactionHref: string,
    ): boolean =>
      candidate.kind === 'navigation' &&
      candidate.phase === 'started' &&
      candidate.name === 'NavigationStart' &&
      isRecord(candidate.payload) &&
      typeof candidate.payload['url'] === 'string' &&
      destinationMatches(candidate.payload['url'], interactionHref);
    const routeLoadMatchesHref = (
      candidate: SendContextEvent,
      interactionHref: string,
    ): boolean =>
      candidate.kind === 'route-load' &&
      isRecord(candidate.payload) &&
      typeof candidate.payload['targetUrl'] === 'string' &&
      destinationMatches(candidate.payload['targetUrl'], interactionHref);
    const plannedNavigationHref =
      plannedCommand?.kind === 'navigate' &&
      typeof plannedCommand.payload['url'] === 'string'
        ? plannedCommand.payload['url']
        : '';
    const navigationForInteraction = (candidate: SendContextEvent): boolean =>
      navigationMatchesHref(candidate, href) ||
      navigationMatchesHref(candidate, plannedNavigationHref);
    const routeLoadForInteraction = (candidate: SendContextEvent): boolean =>
      routeLoadMatchesHref(candidate, href) ||
      routeLoadMatchesHref(candidate, plannedNavigationHref);
    const followingInteraction = interactions.find(
      (candidate) => candidate.sequence > event.sequence,
    );
    const followingPayload = isRecord(followingInteraction?.payload)
      ? followingInteraction.payload
      : {};
    const followingHref =
      typeof followingPayload['href'] === 'string'
        ? followingPayload['href']
        : '';
    const intervalEvents = session.events.filter((candidate) => {
      const insideSequenceInterval =
        candidate.sequence > event.sequence &&
        (followingInteraction === undefined ||
          candidate.sequence < followingInteraction.sequence);
      const belongsToFollowingNavigation =
        navigationMatchesHref(candidate, followingHref) ||
        routeLoadMatchesHref(candidate, followingHref);
      const belongsToThisNavigation =
        navigationForInteraction(candidate) ||
        routeLoadForInteraction(candidate);
      const inCausalInterval =
        (insideSequenceInterval && !belongsToFollowingNavigation) ||
        belongsToThisNavigation;
      const gestureMatches =
        event.kind !== 'gesture' ||
        (candidate.correlationId === event.correlationId &&
          (candidate.kind === 'craft' || candidate.kind === 'http'));
      const domCallMatches =
        event.kind !== 'dom' ||
        (candidate.kind !== 'craft' && candidate.kind !== 'http') ||
        !event.correlationId ||
        candidate.correlationId === event.correlationId;
      const replayRelevantEvent =
        candidate.kind === 'craft' ||
        candidate.kind === 'transport' ||
        (useInvocationReplay && candidate.kind === 'route-load') ||
        (useInvocationReplay && candidate.kind === 'pending') ||
        (useInvocationReplay && candidate.kind === 'http') ||
        candidate.state !== undefined ||
        (useInvocationReplay &&
          (isReplayInvocationEvent(candidate) ||
            navigationForInteraction(candidate)));
      return (
        inCausalInterval &&
        // Non-comparable Craft calls still mark lifecycle boundaries. In
        // particular, resource calls can be emitted when an async query
        // settles; keep their recorded timestamp in the interval so the
        // replay clock does not finish before that work has had a chance to
        // settle. Only comparable calls participate in result comparison.
        gestureMatches &&
        domCallMatches &&
        replayRelevantEvent
      );
    });
    const expectedCalls = intervalEvents.filter(
      (candidate) => candidate.kind === 'craft' && isComparable(candidate),
    );
    const recovery = (state?: unknown): ReplayRecovery => ({
      ...(typeof payload['href'] === 'string' ? { href: payload['href'] } : {}),
      ...(state === undefined ? {} : { state }),
    });
    const reportDifference = (
      difference: Omit<ReplayDifference, 'recovery'>,
      recoveryState: unknown,
      nextIndex: number,
    ): ReplayDifference => {
      const target = recovery(recoveryState);
      const canRecover =
        target.href !== undefined || target.state !== undefined;
      const completeDifference = {
        ...difference,
        ...(canRecover ? { recovery: target } : {}),
      };
      pendingRecovery = canRecover
        ? { recovery: target, nextIndex }
        : undefined;
      const differenceEvent = session.events.find(
        (candidate) => candidate.id === difference.eventId,
      );
      pendingSkip = differenceEvent
        ? findCompatibleSkip(
            session,
            differenceEvent.sequence,
            options.readState?.(),
            cursor,
          )
        : undefined;
      if (pendingSkip) {
        Object.assign(completeDifference, {
          skip: {
            checkpointEventId: pendingSkip.checkpointEventId,
            index: pendingSkip.nextIndex,
          },
        });
      }
      stop();
      return completeDifference;
    };
    if (event.kind === 'hover' && payload['action'] === 'leave') {
      // A route change can remove the hovered node before its pointerout step
      // reaches the dashboard. Leaving is only marker cleanup, so it does not
      // need the old target to remain in the new route's DOM.
      await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
      syncReplayHoverState(event);
      options.onInteraction?.(event, document.body);
      if (!(await restorePrimitiveChangesBetweenSteps(event, true)))
        return undefined;
      cursor += 1;
      if (cursor >= interactions.length) {
        stop(true, false);
        options.onProgress?.(cursor, interactions.length, 'completed');
      } else {
        options.onProgress?.(
          cursor,
          interactions.length,
          running ? 'playing' : 'paused',
          nextPlaybackDelayMs(),
        );
      }
      return undefined;
    }
    const isGesture = event.kind === 'gesture';
    if (
      (!isGesture &&
        (typeof payload['selector'] !== 'string' ||
          typeof payload['action'] !== 'string')) ||
      (isGesture && !isCraftReplayTarget(payload['replayTarget']))
    ) {
      stop(true);
      options.onError?.(
        `Interaction ${event.sequence} has no replayable target or action.`,
      );
      return undefined;
    }
    const action = isGesture ? 'gesture' : String(payload['action']);
    // A navigation can complete just before its progress message reaches the
    // dashboard. After the target reloads, the recorded link no longer exists
    // in the DOM. Treat that link action as consumed when its destination is
    // already the current route, then continue from the next timeline event.
    if (
      (payload['action'] === 'click' || payload['action'] === 'pointerdown') &&
      isReplayDestinationCurrent(payload['href'])
    ) {
      await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
      if (!(await restorePrimitiveChangesBetweenSteps(event))) return undefined;
      cursor += 1;
      options.onProgress?.(
        cursor,
        interactions.length,
        running ? 'playing' : 'paused',
        nextPlaybackDelayMs(),
      );
      return undefined;
    }
    let target: HTMLElement | null;
    const replayTarget = isCraftReplayTarget(payload['replayTarget'])
      ? payload['replayTarget']
      : undefined;
    if (options.scenario) {
      // Scenario runs treat DOM targets as diagnostic unless an explicit
      // visual assertion checks them after the causal replay has completed.
      const resolution = resolveScenarioInteractionTarget(event, replayTarget);
      target = resolution.element ?? document.body ?? document.documentElement;
      if (!resolution.element)
        options.onWarning?.(
          `Scenario replay skipped an informative target (${resolution.status}) for event ${event.id}.`,
        );
    } else if (isGesture && replayTarget) {
      const resolution = ɵresolveCraftReplayTarget(replayTarget);
      target =
        resolution.status === 'resolved' &&
        resolution.element instanceof HTMLElement
          ? resolution.element
          : document.body;
      if (resolution.status !== 'resolved')
        options.onWarning?.(
          `Replay geste ${String(payload['trigger'])}: cible ${resolution.status}; aucun gestionnaire natif ne sera appelé.`,
        );
    } else if (replayTarget) {
      // Hover is presentation only, so a late or missing DOM target should
      // fall back to the recorded coordinates promptly. Waiting for a target
      // that may never render stalls single-step playback without adding any
      // causal value.
      const resolution =
        event.kind === 'hover'
          ? ɵresolveCraftReplayTarget(replayTarget)
          : await waitForCraftReplayTarget(
              replayTarget,
              undefined,
              skippable(),
            );
      target =
        resolution.status === 'resolved' &&
        resolution.element instanceof HTMLElement
          ? resolution.element
          : null;
      if (!target && event.kind === 'hover') {
        options.onWarning?.(
          `Replay Craft hover target is ${resolution.status}; showing the recorded coordinates instead.`,
        );
      } else if (!target && useInvocationReplay) {
        if (resolution.status === 'foreign-runtime') {
          stop(true);
          options.onError?.(
            `Replay Craft target is ${resolution.status}; the interaction cannot be replayed safely.`,
          );
          return undefined;
        }
        // Invocation replay reproduces Craft calls separately from DOM input.
        // A target with an unstable render identity cannot safely be resolved
        // to an element, but its native interaction is only a visual cue here;
        // keep the timeline moving and use the recorded coordinates.
        target = document.body;
        options.onWarning?.(
          `Replay Craft target is ${resolution.status}; showing the recorded coordinates instead.`,
        );
      } else if (!target) {
        stop(true);
        options.onError?.(
          `Replay Craft target is ${resolution.status}; the interaction was not dispatched.`,
        );
        return undefined;
      }
    } else if (event.kind === 'hover') {
      // Unowned DOM keeps the explicit selector fallback. Craft-owned targets
      // never silently fall through to a potentially different CSS match.
      const candidate = safeQuerySelector(payload['selector'] as string);
      target = candidate instanceof HTMLElement ? candidate : null;
      if (!target)
        options.onWarning?.(
          `Replay hover target selector was not found: ${payload['selector']}. Showing the recorded coordinates instead.`,
        );
    } else {
      try {
        document.querySelector(payload['selector'] as string);
      } catch {
        stop(true);
        options.onError?.(
          `Replay target selector is invalid or not found: ${payload['selector']}`,
        );
        return undefined;
      }
      target = await waitForReplayTarget(
        payload['selector'] as string,
        undefined,
        skippable(),
      );
      if (!target) {
        if (useInvocationReplay) {
          // Native interactions are presentation cues during invocation replay:
          // their handlers are deliberately not dispatched. A positional CSS
          // selector can drift when runtime-only DOM (such as the loop-guard
          // alert) is added, so keep the timeline moving and show the recorded
          // coordinates instead of treating that missing cue as a replay gap.
          target = document.body;
          options.onWarning?.(
            `Replay target selector was not found: ${payload['selector']}. Showing the recorded coordinates instead.`,
          );
        } else {
          stop(true);
          options.onError?.(
            `Replay target selector is invalid or not found: ${payload['selector']}`,
          );
          return undefined;
        }
      }
    }
    await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
    recordedResponseResolver?.advanceTo(timeOf(event));
    await options.onTimelineAdvance?.(timeOf(event));
    if (event.kind === 'hover') {
      // Hover is a visual cue only. Dispatching pointer events here would run
      // application handlers a second time; the recorded Craft calls remain
      // the sole source of their effects during invocation replay.
      nativeControlPresentation.sync(event, target ?? document.body);
      syncReplayHoverState(event);
      options.onInteraction?.(event, target ?? document.body);
      if (!(await restorePrimitiveChangesBetweenSteps(event))) return undefined;
      cursor += 1;
      if (cursor >= interactions.length) {
        // A visual-only hover can be the final replay step even when the
        // preceding click started async route work. Drain the Craft calls
        // causally linked to that click before declaring playback complete.
        const trailingEvents = session.events.filter(
          (candidate) =>
            candidate.sequence > event.sequence &&
            (candidate.kind === 'craft' ||
              candidate.kind === 'http' ||
              candidate.state !== undefined),
        );
        for (const trailingEvent of trailingEvents) {
          if (!(await waitForPlaybackTime(timeOf(trailingEvent)))) break;
          await clock.advanceTo(Math.max(clock.now(), timeOf(trailingEvent)));
          recordedResponseResolver?.advanceTo(timeOf(trailingEvent));
          await options.onTimelineAdvance?.(timeOf(trailingEvent));
          if (
            trailingEvent.kind === 'primitive' &&
            trailingEvent.name === 'primitive-change' &&
            trailingEvent.state !== undefined
          )
            options.restoreState?.(trailingEvent.state, trailingEvent);
          await Promise.resolve();
        }
        await Promise.all(pendingInvocationTasks);
        if (pendingInvocationError !== undefined) throw pendingInvocationError;
        stop(true, false);
        options.onProgress?.(cursor, interactions.length, 'completed');
      } else {
        options.onProgress?.(
          cursor,
          interactions.length,
          running ? 'playing' : 'paused',
          nextPlaybackDelayMs(),
        );
      }
      return undefined;
    }
    if (!target) return undefined;
    installRecordedFetchReplay();
    if (typeof payload['value'] === 'string' && 'value' in target) {
      (target as HTMLInputElement).value = payload['value'];
      // The value is restored for presentation only. State changes are restored
      // from the recorded primitive snapshot or produced by a Craft invocation.
      if (!useInvocationReplay) {
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (
      typeof payload['checked'] === 'boolean' &&
      target instanceof HTMLInputElement &&
      (target.type === 'checkbox' || target.type === 'radio')
    ) {
      target.checked = payload['checked'];
    }
    const init: KeyboardEventInit & MouseEventInit & PointerEventInit = {
      bubbles: true,
      cancelable: true,
      ...(typeof payload['key'] === 'string'
        ? { key: payload['key'], code: payload['code'] as string | undefined }
        : {}),
      ...(typeof payload['button'] === 'number'
        ? { button: payload['button'] }
        : {}),
      ...(typeof payload['clientX'] === 'number'
        ? { clientX: payload['clientX'] }
        : {}),
      ...(typeof payload['clientY'] === 'number'
        ? { clientY: payload['clientY'] }
        : {}),
      ...(typeof payload['pointerId'] === 'number'
        ? { pointerId: payload['pointerId'] }
        : {}),
      ...(typeof payload['pointerType'] === 'string'
        ? { pointerType: payload['pointerType'] }
        : {}),
      ...(typeof payload['isPrimary'] === 'boolean'
        ? { isPrimary: payload['isPrimary'] }
        : {}),
    };
    const scrollSettlers: Promise<void>[] = [];
    if (
      typeof payload['scrollX'] === 'number' &&
      typeof payload['scrollY'] === 'number' &&
      (window.scrollX !== payload['scrollX'] ||
        window.scrollY !== payload['scrollY'])
    ) {
      scrollSettlers.push(
        writeAndWaitForScroll(window, () =>
          window.scrollTo({
            left: payload['scrollX'] as number,
            top: payload['scrollY'] as number,
            behavior: 'instant',
          }),
        ),
      );
    }
    if (Array.isArray(payload['scrollAncestors'])) {
      for (const scrollState of payload['scrollAncestors']) {
        if (
          !isRecord(scrollState) ||
          typeof scrollState['selector'] !== 'string' ||
          typeof scrollState['scrollLeft'] !== 'number' ||
          typeof scrollState['scrollTop'] !== 'number'
        )
          continue;
        const scroller = await waitForReplayTarget(scrollState['selector']);
        if (!scroller) {
          options.onWarning?.(
            `Replay scroll target selector is invalid or not found: ${scrollState['selector']}`,
          );
          continue;
        }
        if (
          scroller.scrollLeft !== scrollState['scrollLeft'] ||
          scroller.scrollTop !== scrollState['scrollTop']
        ) {
          scrollSettlers.push(
            writeAndWaitForScroll(scroller, () => {
              scroller.scrollLeft = scrollState['scrollLeft'] as number;
              scroller.scrollTop = scrollState['scrollTop'] as number;
            }),
          );
        }
      }
    }
    await Promise.all(scrollSettlers);
    nativeControlPresentation.sync(event, target, options.onWarning);
    options.onInteraction?.(event, target);
    const native = action.startsWith('key')
      ? new KeyboardEvent(action, init)
      : action.startsWith('pointer') && typeof PointerEvent !== 'undefined'
        ? new PointerEvent(action, init)
        : action.startsWith('mouse') || action === 'click'
          ? new MouseEvent(action, init)
          : new Event(action, init);
    let navigationTask: Promise<void> | undefined;
    let navigationFailed = false;
    let navigationError: unknown;
    let replayInvocationsBySequence: Map<number, SendContextEvent> | undefined;
    // Preparation can reload or restore the target and take much longer than
    // any recorded gap. The interaction timeline begins when the first action
    // is dispatched, so setup time must not consume its recorded delays.
    if (cursor === startingCursor && running)
      playbackEpoch = performance.now() - (timeOf(event) - firstTime);
    if (!useInvocationReplay && !isGesture) {
      target.dispatchEvent(native);
    } else if (useInvocationReplay) {
      const navigation =
        plannedCommand?.kind === 'navigate'
          ? (intervalEvents.find(
              (candidate) =>
                candidate.kind === 'navigation' &&
                candidate.phase === 'started' &&
                typeof candidate.payload === 'object' &&
                candidate.payload !== null &&
                typeof (candidate.payload as Record<string, unknown>)['url'] ===
                  'string',
            ) ??
            session.events.find((candidate) =>
              navigationMatchesHref(candidate, href),
            ))
          : undefined;
      if (navigation) {
        const payload = navigation.payload as Record<string, unknown>;
        const recordedOptions = isRecord(payload['navigationOptions'])
          ? payload['navigationOptions']
          : {};
        const navigationOptions = {
          ...(typeof recordedOptions['replaceUrl'] === 'boolean'
            ? { replaceUrl: recordedOptions['replaceUrl'] }
            : {}),
          ...(typeof recordedOptions['skipLocationChange'] === 'boolean'
            ? { skipLocationChange: recordedOptions['skipLocationChange'] }
            : {}),
        };
        // Start routing without holding the replay timeline. Guards, resolvers,
        // or loaders can wait on virtual time and recorded events that follow
        // NavigationStart; awaiting the router here would deadlock those waits.
        navigationTask = Promise.resolve()
          .then(() =>
            options.navigateToRecordedRoute?.(
              String(payload['url']),
              navigationOptions,
            ),
          )
          .then(
            () => undefined,
            (error: unknown) => {
              navigationFailed = true;
              navigationError = error;
            },
          );
      } else {
        const replayCalls =
          plannedCommand?.kind === 'invoke'
            ? rootReplayInvocationEvents(intervalEvents)
            : [];
        const documentReloads = intervalEvents.filter(
          isDocumentReloadInvocation,
        );
        const mismatchedCorrelations = intervalEvents.filter(
          (candidate) =>
            (candidate.kind === 'craft' || candidate.kind === 'http') &&
            event.correlationId !== undefined &&
            candidate.correlationId !== event.correlationId,
        );
        const deferredActivationRecorded = session.events.some(
          (candidate) =>
            candidate.kind === 'defer' &&
            candidate.phase === 'started' &&
            candidate.sequence > event.sequence &&
            (followingInteraction === undefined ||
              candidate.sequence < followingInteraction.sequence ||
              (candidate.id === followingInteraction.id &&
                followingInteraction.kind === 'defer')),
        );
        const routeLoadRecorded =
          intervalEvents.some((candidate) => candidate.kind === 'route-load') ||
          (typeof followingHref === 'string' &&
            session.events.some((candidate) =>
              routeLoadMatchesHref(candidate, followingHref),
            ));
        if (replayCalls.length === 0 && isGesture)
          options.onWarning?.(
            `[Invocation non exécutée] Appui long enregistré (${String(payload['trigger'])}, corrélation ${event.correlationId ?? 'absente'}), mais aucun appel Craft rejouable n'est associé. Le handler natif n'a pas été exécuté.`,
          );
        else if (documentReloads.length > 0)
          options.onWarning?.(
            `Document reload recorded for ${event.name ?? event.sequence} is a session boundary and was not executed during replay. Resume from a new recording after the page reload.`,
          );
        else if (mismatchedCorrelations.length > 0)
          options.onWarning?.(
            `[Corrélation incompatible] Interaction ${event.name ?? event.sequence}, corrélation ${event.correlationId ?? 'absente'}; ${mismatchedCorrelations.length} appel(s) de l’intervalle portent une autre corrélation et n’ont pas été rejoués.`,
          );
        else if (
          replayCalls.length === 0 &&
          !deferredActivationRecorded &&
          !routeLoadRecorded &&
          documentReloads.length === 0 &&
          action === 'click'
        )
          options.onWarning?.(
            `[Invocation non exécutée] Aucun appel Craft ni activation différée enregistrés après le clic ${event.name ?? event.sequence} (corrélation ${event.correlationId ?? 'absente'}).`,
          );
        replayInvocationsBySequence = new Map(
          replayCalls.map((call) => [call.sequence, call]),
        );
      }
    }
    let expectedCallIndex = 0;
    const settleDeadline =
      Date.now() +
      Math.max(0, Math.min(options.settleTimeoutMs ?? 2500, 30_000));
    const observedCalls = () =>
      options
        .observedEvents?.()
        .slice(observedBefore)
        .filter(
          (candidate) => candidate.kind === 'craft' && isComparable(candidate),
        ) ?? [];
    const waitForObservedCall = async (index: number): Promise<boolean> => {
      while (Date.now() < settleDeadline && observedCalls().length <= index) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return observedCalls().length > index;
    };
    const waitForObservedRouteLoad = async (
      expected: SendContextEvent,
    ): Promise<SendContextEvent | undefined> => {
      const expectedPayload = isRecord(expected.payload)
        ? expected.payload
        : undefined;
      if (!expectedPayload) return undefined;
      const expectedOperationId = expected.operationId;
      const findObserved = (): SendContextEvent | undefined => {
        const routeCandidates =
          options
            .observedEvents?.()
            // Route loaders can run while the replay target resumes bootstrap,
            // before the first interaction starts. Keep those observations in
            // the run-wide comparison window instead of dropping them at each
            // interaction boundary.
            .slice(baselineEvents)
            .filter((candidate) => {
              const actualPayload = isRecord(candidate.payload)
                ? candidate.payload
                : undefined;
              return (
                candidate.kind === 'route-load' &&
                candidate.phase === expected.phase &&
                actualPayload?.['replay'] === true &&
                actualPayload['routePath'] === expectedPayload['routePath'] &&
                (expectedPayload['phase'] === undefined ||
                  actualPayload['phase'] === expectedPayload['phase']) &&
                (expectedPayload['targetUrl'] === undefined ||
                  actualPayload['targetUrl'] === expectedPayload['targetUrl'])
              );
            }) ?? [];
        const commandCandidates = expectedOperationId
          ? routeCandidates.filter((candidate) => {
              const actualPayload = isRecord(candidate.payload)
                ? candidate.payload
                : undefined;
              return (
                actualPayload?.['replayCommandOperationId'] ===
                expectedOperationId
              );
            })
          : [];
        const candidates =
          commandCandidates.length > 0 ? commandCandidates : routeCandidates;
        if (
          candidates.length === 0 &&
          navigationTask &&
          options.navigateToRecordedRoute
        )
          return undefined;
        if (!candidates?.length) return undefined;
        const pairedOperationId = expectedOperationId
          ? observedRouteOperationIds.get(expectedOperationId)
          : undefined;
        if (pairedOperationId) {
          return candidates.find(
            (candidate) => candidate.operationId === pairedOperationId,
          );
        }
        const available = candidates.filter(
          (candidate) =>
            !candidate.operationId ||
            !usedObservedRouteOperationIds.has(candidate.operationId),
        );
        const distinctAvailable = new Set(
          available.flatMap((candidate) =>
            candidate.operationId ? [candidate.operationId] : [],
          ),
        );
        if (expectedOperationId && distinctAvailable.size > 1) {
          ambiguousRouteOperationIds.add(expectedOperationId);
          return undefined;
        }
        const observed = available[0];
        if (expectedOperationId && observed?.operationId) {
          observedRouteOperationIds.set(
            expectedOperationId,
            observed.operationId,
          );
          usedObservedRouteOperationIds.add(observed.operationId);
        }
        return observed;
      };
      const deadline = Date.now() + 2_500;
      while (Date.now() < deadline) {
        const observed = findObserved();
        if (observed) return observed;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return undefined;
    };
    const missingRouteStarts: SendContextEvent[] = [];
    const observedPendingOperationIds = new Map<string, string>();
    const usedObservedPendingOperationIds = new Set<string>();
    const ambiguousPendingOperationIds = new Set<string>();
    const waitForObservedPending = async (
      expected: SendContextEvent,
    ): Promise<SendContextEvent | undefined> => {
      const expectedPayload = isRecord(expected.payload)
        ? expected.payload
        : undefined;
      if (!expectedPayload) return undefined;
      const deadline = Date.now() + 2_500;
      while (Date.now() < deadline) {
        const candidates =
          options
            .observedEvents?.()
            .slice(observedBefore)
            .filter((candidate) => {
              const payload = isRecord(candidate.payload)
                ? candidate.payload
                : undefined;
              return (
                candidate.kind === 'pending' &&
                candidate.phase === expected.phase &&
                payload?.['replay'] === true &&
                payload['source'] === expectedPayload['source'] &&
                payload['mode'] === expectedPayload['mode']
              );
            }) ?? [];
        const pairedOperationId = expected.operationId
          ? observedPendingOperationIds.get(expected.operationId)
          : undefined;
        const available = pairedOperationId
          ? []
          : candidates.filter(
              (candidate) =>
                !candidate.operationId ||
                !usedObservedPendingOperationIds.has(candidate.operationId),
            );
        const distinctAvailable = new Set(
          available.flatMap((candidate) =>
            candidate.operationId ? [candidate.operationId] : [],
          ),
        );
        if (expected.operationId && distinctAvailable.size > 1) {
          ambiguousPendingOperationIds.add(expected.operationId);
          return undefined;
        }
        const observed = pairedOperationId
          ? candidates.find(
              (candidate) => candidate.operationId === pairedOperationId,
            )
          : candidates.find(
              (candidate) =>
                !candidate.operationId ||
                !usedObservedPendingOperationIds.has(candidate.operationId),
            );
        if (observed) {
          if (
            expected.phase === 'started' &&
            expected.operationId &&
            observed.operationId
          )
            observedPendingOperationIds.set(
              expected.operationId,
              observed.operationId,
            );
          if (observed.operationId)
            usedObservedPendingOperationIds.add(observed.operationId);
          else if (
            expected.operationId &&
            observed.operationId &&
            !observedPendingOperationIds.has(expected.operationId)
          )
            observedPendingOperationIds.set(
              expected.operationId,
              observed.operationId,
            );
          return observed;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return undefined;
    };
    let lastExpectedState: unknown;
    for (const intervalEvent of intervalEvents) {
      if (intervalEvent.kind === 'route-load') {
        if (!(await waitForPlaybackTime(timeOf(intervalEvent))))
          return undefined;
        await clock.advanceTo(Math.max(clock.now(), timeOf(intervalEvent)));
        const observed = await waitForObservedRouteLoad(intervalEvent);
        const expectedPayload = isRecord(intervalEvent.payload)
          ? intervalEvent.payload
          : {};
        const actualPayload = isRecord(observed?.payload)
          ? observed.payload
          : {};
        if (!observed && intervalEvent.phase === 'started') {
          missingRouteStarts.push(intervalEvent);
        } else if (
          !observed &&
          intervalEvent.phase === 'succeeded' &&
          navigationTask &&
          options.navigateToRecordedRoute
        ) {
          // The router promise is the authoritative terminal result when this
          // route's lazy loader does not publish a replay observation. Let the
          // timeline advance before awaiting guards and resolvers below.
        } else if (
          !observed ||
          expectedPayload['outcome'] !== actualPayload['outcome']
        ) {
          const category = observed
            ? 'Résultat différent'
            : intervalEvent.operationId &&
                ambiguousRouteOperationIds.has(intervalEvent.operationId)
              ? 'Corrélation ambiguë'
              : 'Observation absente';
          options.onWarning?.(
            `[${category}] Chargement de route ${intervalEvent.operationId ?? intervalEvent.sequence} (${String(expectedPayload['routePath'])}) ${intervalEvent.phase}: attendu ${String(expectedPayload['outcome'] ?? 'started')} · corrélation ${intervalEvent.correlationId ?? 'absente'}; observé ${String(actualPayload['outcome'] ?? 'absent')} · opération ${observed?.operationId ?? 'absente'} · corrélation ${observed?.correlationId ?? 'absente'}.`,
          );
        }
        continue;
      }
      if (intervalEvent.kind === 'pending') {
        if (!(await waitForPlaybackTime(timeOf(intervalEvent))))
          return undefined;
        await clock.advanceTo(Math.max(clock.now(), timeOf(intervalEvent)));
        const observed = await waitForObservedPending(intervalEvent);
        const expectedPending = isRecord(intervalEvent.payload)
          ? intervalEvent.payload
          : {};
        const actualPending = isRecord(observed?.payload)
          ? observed.payload
          : {};
        if (
          !observed ||
          expectedPending['transition'] !== actualPending['transition'] ||
          (intervalEvent.phase === 'started' &&
            expectedPending['fallbackRendered'] !==
              actualPending['fallbackRendered'])
        )
          options.onWarning?.(
            `[${observed ? 'Résultat différent' : intervalEvent.operationId && ambiguousPendingOperationIds.has(intervalEvent.operationId) ? 'Corrélation ambiguë' : 'Observation absente'}] Transition pending ${intervalEvent.operationId ?? intervalEvent.sequence} (${String(expectedPending['source'] ?? 'unknown')}) ${intervalEvent.phase}: attendu ${String(expectedPending['transition'])}${intervalEvent.phase === 'started' ? `, fallback affiché ${String(expectedPending['fallbackRendered'])}` : ''} · corrélation ${intervalEvent.correlationId ?? 'absente'}; observé ${observed ? `${String(actualPending['transition'])}${intervalEvent.phase === 'started' ? `, fallback affiché ${String(actualPending['fallbackRendered'])}` : ''} · opération ${observed.operationId ?? 'absente'} · corrélation ${observed.correlationId ?? 'absente'}` : 'plusieurs opérations candidates ou aucune observation'}.`,
          );
        continue;
      }
      // Start each recorded root call only when the timeline reaches its
      // recorded position. The visual click above never dispatches to the app,
      // and overlapping asynchronous roots can otherwise reorder state changes.
      if (
        replayInvocationsBySequence?.has(intervalEvent.sequence) &&
        options.invokeRecordedMethod
      ) {
        const recordedCall = replayInvocationsBySequence.get(
          intervalEvent.sequence,
        )!;
        pendingInvocationTasks.push(
          Promise.resolve()
            .then(() => options.invokeRecordedMethod!(recordedCall))
            .then(() => undefined)
            .catch((error: unknown) => {
              pendingInvocationError ??= error;
            }),
        );
      }
      const isCraftCall =
        intervalEvent.kind === 'craft' && isComparable(intervalEvent);
      // Keep the target's virtual timers aligned with the recording's wall
      // time. Advancing straight to a query's recorded success would resolve
      // craftSleep immediately and reveal its value too early during playback.
      if (!(await waitForPlaybackTime(timeOf(intervalEvent)))) return undefined;
      await clock.advanceTo(Math.max(clock.now(), timeOf(intervalEvent)));
      recordedResponseResolver?.advanceTo(timeOf(intervalEvent));
      await options.onTimelineAdvance?.(timeOf(intervalEvent));
      const isRecordedPrimitiveChange =
        intervalEvent.kind === 'primitive' &&
        intervalEvent.name === 'primitive-change' &&
        intervalEvent.state !== undefined;
      if (isRecordedPrimitiveChange && options.restoreState) {
        options.restoreState(intervalEvent.state, intervalEvent);
      } else if (
        intervalEvent.state !== undefined &&
        options.readState &&
        !options.scenario
      ) {
        lastExpectedState = intervalEvent.state;
        const actualState = options.readState();
        if (hasReplayStateDifference(intervalEvent.state, actualState)) {
          return reportDifference(
            {
              eventId: intervalEvent.id,
              expected: intervalEvent.state,
              actual: actualState,
            },
            intervalEvent.state,
            cursor + 1,
          );
        }
      } else if (intervalEvent.state !== undefined && !options.scenario) {
        lastExpectedState = intervalEvent.state;
        const difference = options.onDifference?.(intervalEvent);
        if (difference) {
          return reportDifference(difference, intervalEvent.state, cursor + 1);
        }
      }
      if (isCraftCall) {
        if (!(await waitForObservedCall(expectedCallIndex))) break;
        expectedCallIndex += 1;
      }
    }
    if (navigationTask) {
      await navigationTask;
      if (navigationFailed) throw navigationError;
    }
    for (const missingStart of missingRouteStarts) {
      const payload = isRecord(missingStart.payload)
        ? missingStart.payload
        : {};
      const operationId = missingStart.operationId;
      const operationObserved =
        Boolean(navigationTask && options.navigateToRecordedRoute) ||
        options
          .observedEvents?.()
          .slice(observedBefore)
          .some((candidate) => {
            const candidatePayload = isRecord(candidate.payload)
              ? candidate.payload
              : undefined;
            return (
              candidate.kind === 'route-load' &&
              (operationId
                ? candidate.operationId ===
                  observedRouteOperationIds.get(operationId)
                : candidatePayload?.['routePath'] === payload['routePath']) &&
              (candidate.phase === 'succeeded' ||
                candidate.phase === 'failed') &&
              candidatePayload?.['replay'] === true
            );
          });
      if (!operationObserved)
        options.onWarning?.(
          `[${operationId && ambiguousRouteOperationIds.has(operationId) ? 'Corrélation ambiguë' : 'Observation absente'}] Chargement de route ${operationId ?? missingStart.sequence} (${String(payload['routePath'])}, corrélation ${missingStart.correlationId ?? 'absente'}) : aucune phase observée associable sans ambiguïté à cette opération.`,
        );
    }
    if (options.mode === 'diagnostic' && plannedCommand) {
      const actualEvents = (options.observedEvents?.() ?? []).filter(
        (candidate) => !observedBeforeIds.has(candidate.id),
      );
      const expected = plannedCommand.expected;
      const missing = expected.filter(
        (observation) => !replayObservationSatisfied(observation, actualEvents),
      );
      const unexpected = actualEvents.filter(
        (candidate) =>
          !expected.some((observation) =>
            replayObservationSatisfied(observation, [candidate]),
          ),
      );
      options.onDiagnostic?.({
        commandId: plannedCommand.id,
        expectedCount: expected.length,
        observedCount: actualEvents.length,
        missing: missing.map(
          (observation) =>
            `${observation.kind}:${observation.phase}:${observation.eventId}`,
        ),
        unexpected: unexpected.map(
          (candidate) => `${candidate.kind}:${candidate.phase}:${candidate.id}`,
        ),
      });
    }
    cursor += 1;
    if (cursor >= interactions.length) {
      await Promise.all(pendingInvocationTasks);
      if (pendingInvocationError !== undefined) throw pendingInvocationError;
    }
    if (options.observedEvents) {
      const observed = observedCalls();
      const mismatch = findCraftCallMismatch(expectedCalls, observed);
      if (mismatch) {
        return reportDifference(
          {
            eventId:
              mismatch.expected?.id ??
              `observed-${mismatch.actual?.sequence ?? cursor}`,
            expected: mismatch.expected ?? null,
            actual: mismatch.actual ?? null,
          },
          lastExpectedState,
          cursor,
        );
      }
    }
    if (cursor >= interactions.length) {
      stop(true, false);
      options.onProgress?.(cursor, interactions.length, 'completed');
    } else {
      options.onProgress?.(
        cursor,
        interactions.length,
        running ? 'playing' : 'paused',
        nextPlaybackDelayMs(),
      );
    }
    return undefined;
  };
  const nextPlaybackDelayMs = (): number | undefined => {
    const next = interactions[cursor];
    if (!running || !next) return undefined;
    const elapsed =
      playbackEpoch === undefined ? 0 : performance.now() - playbackEpoch;
    return Math.max(0, timeOf(next) - firstTime - elapsed);
  };
  const advance = async (): Promise<void> => {
    if (!running) return;
    const selectorIssue = orchestrationPlan.issues.find(
      (issue) => issue.code === 'invalid-selector',
    );
    if (selectorIssue) {
      stop(true);
      options.onError?.(
        `Replay plan preflight failed: ${selectorIssue.message}`,
      );
      return;
    }
    const next = interactions[cursor];
    if (!next) {
      stop(true, false);
      options.onProgress?.(cursor, interactions.length, 'completed');
      return;
    }
    // Schedule against one monotonic playback timeline. `step()` can spend
    // real time waiting for the app to settle; adding a fresh full interval
    // after it returns would accumulate that work and make the replay drift.
    const delay = nextPlaybackDelayMs() ?? 0;
    timer = setTimeout(async () => {
      if (!running) return;
      playbackStepInFlight = true;
      let difference: ReplayDifference | undefined;
      const interaction = interactions[cursor];
      const command = interaction
        ? orchestrationPlan.commands.find(
            (candidate) => candidate.sequence === interaction.sequence,
          )
        : undefined;
      const fallbackCommand: ReplayCommand | undefined =
        interaction && !command
          ? {
              id: `command:${interaction.id}`,
              operationId:
                interaction.operationId ?? `replay:${interaction.id}`,
              kind: 'dispatch',
              sequence: interaction.sequence,
              atMs: timeOf(interaction),
              dependsOn: [],
              payload: isRecord(interaction.payload) ? interaction.payload : {},
              expected: [],
            }
          : undefined;
      const executable = command ?? fallbackCommand;
      const completedCommandIds = orchestrationPlan.commands
        .filter(
          (candidate) =>
            candidate.kind === 'restore-snapshot' ||
            (interaction !== undefined &&
              candidate.sequence < interaction.sequence),
        )
        .map((candidate) => candidate.id);
      try {
        if (!executable) {
          stop(true);
          options.onProgress?.(cursor, interactions.length, 'completed');
          return;
        }
        const result = await executeReplayPlan(
          {
            version: orchestrationPlan.version,
            status: 'replayable',
            // `step()` pairs runtime operation IDs to their recorded
            // counterparts by correlation and already waits for invocation,
            // navigation, route-load, and pending outcomes. Rechecking the
            // archive's raw operation IDs here would create a second, weaker
            // barrier that can reject a correctly paired runtime operation.
            commands: [{ ...executable, expected: [] }],
            observations: [],
            issues: [],
          },
          {
            completedCommandIds,
            observations: () => options.observedEvents?.() ?? [],
            execute: async () => {
              difference = await step();
              if (difference)
                throw new Error('Replay command produced a state difference.');
            },
          },
        );
        if (result.status === 'failed') {
          if (difference) {
            options.onReplayDifference?.(difference);
            stop();
            return;
          }
          throw new Error(result.error ?? 'Replay command failed.');
        }
      } catch (error) {
        playbackStepInFlight = false;
        stop(true);
        options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
        return;
      }
      playbackStepInFlight = false;
      if (difference) {
        options.onReplayDifference?.(difference);
        stop();
        return;
      }
      void advance();
    }, delay);
  };
  return {
    plan: () => orchestrationPlan,
    clock,
    index: () => cursor,
    playing: () => running,
    step,
    forceAndContinue: async () => {
      if (!pendingRecovery || terminated || !options.forceRecovery)
        return undefined;
      const pending = pendingRecovery;
      await options.forceRecovery(pending.recovery);
      pendingRecovery = undefined;
      cursor = pending.nextIndex;
      options.onProgress?.(cursor, interactions.length, 'paused');
      return pending.recovery;
    },
    skipToCheckpoint: async () => {
      if (!pendingSkip || terminated || !options.forceRecovery)
        return undefined;
      const pending = pendingSkip;
      await options.forceRecovery(pending.recovery);
      pendingSkip = undefined;
      pendingRecovery = undefined;
      cursor = pending.nextIndex;
      options.onProgress?.(cursor, interactions.length, 'paused');
      return {
        from: pending.from,
        to: cursor,
        checkpointEventId: pending.checkpointEventId,
      };
    },
    play: () => {
      if (!running && !terminated) {
        const now = performance.now();
        if (playbackEpoch === undefined) {
          const previous = interactions[Math.max(0, cursor - 1)];
          playbackEpoch = now - (previous ? timeOf(previous) - firstTime : 0);
        } else if (playbackPaused) {
          const previous = interactions[Math.max(0, cursor - 1)];
          playbackEpoch = now - (previous ? timeOf(previous) - firstTime : 0);
        }
        playbackPaused = false;
        running = true;
        playbackResumeWaiters.splice(0).forEach((resume) => resume());
        options.onProgress?.(
          cursor,
          interactions.length,
          'playing',
          nextPlaybackDelayMs(),
        );
        if (!playbackStepInFlight) void advance();
      }
    },
    skipWait: () => {
      if (!running || terminated) return;
      skipGeneration += 1;
      // The step in flight is waiting on the timeline up to the next action;
      // idle, the timer is. Either way, the epoch moves so that time is now.
      const upcoming =
        interactions[cursor + (playbackStepInFlight ? 1 : 0)] ??
        interactions[interactions.length - 1];
      if (upcoming) {
        const reached = performance.now() - (timeOf(upcoming) - firstTime);
        if (playbackEpoch === undefined || reached < playbackEpoch)
          playbackEpoch = reached;
      }
      if (playbackWaitTimer !== undefined) clearTimeout(playbackWaitTimer);
      playbackWaitTimer = undefined;
      resolvePlaybackWait?.();
      resolvePlaybackWait = undefined;
      if (!playbackStepInFlight && timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        void advance();
      }
    },
    pause: stop,
    stop: () => {
      stop(true);
      cursor = 0;
    },
  };
}

function isReplayInvocationEvent(event: SendContextEvent): boolean {
  if (event.kind !== 'craft' || event.phase !== 'started') return false;
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const invocation =
    payload && isRecord(payload['replayInvocation'])
      ? payload['replayInvocation']
      : undefined;
  return (
    typeof invocation?.['address'] === 'string' &&
    Array.isArray(invocation['args'])
  );
}

function rootReplayInvocationEvents(
  events: readonly SendContextEvent[],
): SendContextEvent[] {
  const invocations = events.filter(
    (event) =>
      isReplayInvocationEvent(event) && !isDocumentReloadInvocation(event),
  );
  const operationIds = new Set(
    invocations.flatMap((event) =>
      typeof event.operationId === 'string' ? [event.operationId] : [],
    ),
  );
  const roots = invocations.filter((event) => {
    const payload = isRecord(event.payload) ? event.payload : undefined;
    const invocation =
      payload && isRecord(payload['replayInvocation'])
        ? payload['replayInvocation']
        : undefined;
    const parentOperationId = invocation?.['parentOperationId'];
    return (
      typeof parentOperationId !== 'string' ||
      !operationIds.has(parentOperationId)
    );
  });

  // A single Craft call can pass through several wrapped layers. The runtime
  // wrapper records each layer with the same correlation id and method address,
  // often with an empty argument list before the real payload reaches it. The
  // replay must invoke that call once, using the richest captured arguments.
  const byCall = new Map<string, SendContextEvent[]>();
  for (const event of roots) {
    const payload = isRecord(event.payload) ? event.payload : undefined;
    const invocation =
      payload && isRecord(payload['replayInvocation'])
        ? payload['replayInvocation']
        : undefined;
    const address = String(invocation?.['address'] ?? '');
    const correlation = event.correlationId ?? event.id;
    const key = `${correlation}\u0000${address}`;
    const group = byCall.get(key) ?? [];
    group.push(event);
    byCall.set(key, group);
  }
  return [...byCall.values()]
    .map((group) => {
      const first = group.reduce((earliest, candidate) =>
        candidate.sequence < earliest.sequence ? candidate : earliest,
      );
      const invocation = group.reduce((best, candidate) => {
        const argsOf = (event: SendContextEvent): unknown[] => {
          const payload = isRecord(event.payload) ? event.payload : undefined;
          const invocation =
            payload && isRecord(payload['replayInvocation'])
              ? payload['replayInvocation']
              : undefined;
          return Array.isArray(invocation?.['args']) ? invocation['args'] : [];
        };
        const candidateArgs = argsOf(candidate);
        const bestArgs = argsOf(best);
        return candidateArgs.length > bestArgs.length ? candidate : best;
      });
      // Use the first wrapper's timeline position, while retaining the richer
      // arguments captured by a later wrapper for the same causal call.
      return {
        ...invocation,
        sequence: first.sequence,
        timestamp: first.timestamp,
        ...(first.elapsedMs === undefined
          ? {}
          : { elapsedMs: first.elapsedMs }),
        ...(first.globalElapsedMs === undefined
          ? {}
          : { globalElapsedMs: first.globalElapsedMs }),
      };
    })
    .sort((left, right) => left.sequence - right.sequence);
}

function isDocumentReloadInvocation(event: SendContextEvent): boolean {
  if (!isReplayInvocationEvent(event)) return false;
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const invocation =
    payload && isRecord(payload['replayInvocation'])
      ? payload['replayInvocation']
      : undefined;
  const address =
    typeof invocation?.['address'] === 'string' ? invocation['address'] : '';
  return /BrowserLocationService\b.*\bmethod:reload\b/.test(address);
}

function findCompatibleSkip(
  session: SendContextReplayExport,
  afterSequence: number,
  currentState: unknown,
  currentInteractionIndex: number,
): ReplaySkip | undefined {
  if (!isRecord(currentState)) return undefined;
  const checkpoints = session.events.filter(
    (event) =>
      event.sequence > afterSequence &&
      (event.kind === 'snapshot' || event.kind === 'primitive') &&
      isRecord(event.state),
  );
  for (const checkpoint of checkpoints) {
    const state = checkpoint.state as Record<string, unknown>;
    // Runtime host-tag ordinals change across reloads. Match the same stable
    // primitive path the registry uses, but reject ambiguous normalized keys.
    if (!hasSharedReplayPrimitiveIdentity(state, currentState)) continue;
    const blockingBoundary = session.events.some(
      (event) =>
        event.sequence > afterSequence &&
        event.sequence < checkpoint.sequence &&
        (event.kind === 'http' || event.kind === 'craft') &&
        event.phase === 'started' &&
        (!event.operationId ||
          !session.events.some(
            (end) =>
              end.operationId === event.operationId &&
              end.sequence < checkpoint.sequence &&
              (end.phase === 'succeeded' || end.phase === 'failed'),
          )),
    );
    if (blockingBoundary) return undefined;
    const nextIndex = session.events.filter(
      (event) => isReplayStep(event) && event.sequence <= checkpoint.sequence,
    ).length;
    if (
      nextIndex <= currentInteractionIndex ||
      nextIndex >= session.events.filter(isReplayStep).length
    )
      continue;
    return {
      recovery: { state },
      nextIndex,
      from: currentInteractionIndex + 1,
      checkpointEventId: checkpoint.id,
    };
  }
  return undefined;
}

function normalizeReplayPrimitiveAddress(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

function hasSharedReplayPrimitiveIdentity(
  checkpoint: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  const countByNormalizedAddress = (state: Record<string, unknown>) => {
    const counts = new Map<string, number>();
    for (const address of Object.keys(state)) {
      const normalized = normalizeReplayPrimitiveAddress(address);
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    return counts;
  };
  const checkpointCounts = countByNormalizedAddress(checkpoint);
  const currentCounts = countByNormalizedAddress(current);
  return [...checkpointCounts].some(
    ([address, checkpointCount]) =>
      checkpointCount === 1 && currentCounts.get(address) === 1,
  );
}

function isReplayStep(event: SendContextEvent): boolean {
  if (
    event.kind === 'navigation' &&
    event.phase === 'started' &&
    isRecord(event.payload) &&
    isRecord(event.payload['event']) &&
    event.payload['event']['trigger'] === 'history'
  )
    return true;
  return (
    (event.kind === 'defer' && event.phase === 'started') ||
    (event.phase === 'emitted' &&
      (event.kind === 'dom' ||
        event.kind === 'gesture' ||
        event.kind === 'hover' ||
        event.kind === 'scroll' ||
        event.kind === 'viewport'))
  );
}

/**
 * Returns the replay timeline, including recoverable native events recorded by
 * older source$ sessions before they carried a target selector.
 */
export function getReplaySteps(
  events: readonly SendContextEvent[],
): SendContextEvent[] {
  return events.flatMap((event, index) => {
    if (isReplayStep(event)) return [event];
    if (
      event.kind !== 'custom' ||
      event.phase !== 'emitted' ||
      event.source !== 'source$' ||
      event.name !== 'pointerdown'
    )
      return [];

    const recordedPayload = isRecord(event.payload) ? event.payload : {};
    if (typeof recordedPayload['selector'] === 'string') return [];
    const following = events
      .slice(index + 1)
      .find(
        (candidate) =>
          candidate.kind === 'dom' &&
          candidate.phase === 'emitted' &&
          candidate.participantId === event.participantId &&
          isRecord(candidate.payload) &&
          candidate.payload['action'] === 'click',
      );
    if (!following || !isRecord(following.payload)) return [];
    const followingPayload = following.payload;
    if (typeof followingPayload['selector'] !== 'string') return [];
    const eventTime = replayEventTime(event);
    const clickTime = replayEventTime(following);
    if (clickTime < eventTime || clickTime - eventTime > 1_500) return [];

    return [
      {
        ...event,
        kind: 'dom',
        payload: {
          ...followingPayload,
          action: 'pointerdown',
          eventName: 'pointerdown',
          interactionName: 'legacy-source$:pointerdown',
        },
      },
    ];
  });
}

function replayEventTime(event: SendContextEvent): number {
  return event.globalElapsedMs ?? event.elapsedMs ?? event.timestamp;
}

function isComparable(event: SendContextEvent): boolean {
  // Craft start/failure events are diagnostic traces, not replay actions. Older
  // archives may contain the previous start/success pairs; their `host` marker
  // keeps every generation of these call-boundary events out of replay matching.
  if (
    event.kind === 'craft' &&
    typeof event.payload === 'object' &&
    event.payload !== null &&
    'host' in event.payload
  )
    return false;
  // Primitive methods and queries can be called in a different order or count
  // while routes, caches, and async views settle during replay. Their effects
  // are checked through primitive state and recorded HTTP results instead.
  if (
    event.kind === 'craft' &&
    (event.name?.startsWith('query:') ||
      event.name?.startsWith('method:') ||
      event.name?.startsWith('mutation:'))
  )
    return false;
  return !(
    typeof event.payload === 'object' &&
    event.payload !== null &&
    'comparable' in event.payload &&
    (event.payload as { comparable?: unknown }).comparable === false
  );
}

/**
 * Invocations with the same host can overlap, so their start/finish callbacks
 * may arrive in a different order during replay. Compare each contiguous host
 * group by phase counts while keeping the order of different hosts strict.
 */
function findCraftCallMismatch(
  expected: readonly SendContextEvent[],
  actual: readonly SendContextEvent[],
): { expected?: SendContextEvent; actual?: SendContextEvent } | undefined {
  let expectedIndex = 0;
  let actualIndex = 0;
  while (expectedIndex < expected.length || actualIndex < actual.length) {
    const expectedEvent = expected[expectedIndex];
    const actualEvent = actual[actualIndex];
    if (!expectedEvent || !actualEvent) {
      return { expected: expectedEvent, actual: actualEvent };
    }
    if (
      expectedEvent.name === actualEvent.name &&
      expectedEvent.phase === actualEvent.phase
    ) {
      expectedIndex += 1;
      actualIndex += 1;
      continue;
    }
    if (expectedEvent.name !== actualEvent.name) {
      return { expected: expectedEvent, actual: actualEvent };
    }

    const name = expectedEvent.name;
    let expectedEnd = expectedIndex;
    let actualEnd = actualIndex;
    while (
      expectedEnd < expected.length &&
      expected[expectedEnd]?.name === name
    )
      expectedEnd += 1;
    while (actualEnd < actual.length && actual[actualEnd]?.name === name)
      actualEnd += 1;
    const expectedGroup = expected.slice(expectedIndex, expectedEnd);
    const actualGroup = actual.slice(actualIndex, actualEnd);
    const phases: readonly SendContextEvent['phase'][] = [
      'started',
      'succeeded',
      'failed',
      'emitted',
    ];
    const phaseMismatch = phases.find(
      (phase) =>
        expectedGroup.filter((event) => event.phase === phase).length !==
        actualGroup.filter((event) => event.phase === phase).length,
    );
    if (phaseMismatch) {
      return {
        expected:
          expectedGroup.find((event) => event.phase === phaseMismatch) ??
          expectedGroup[0],
        actual:
          actualGroup.find((event) => event.phase === phaseMismatch) ??
          actualGroup[0],
      };
    }
    expectedIndex = expectedEnd;
    actualIndex = actualEnd;
  }
  return undefined;
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (typeof input === 'object' && input !== null) {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  try {
    return JSON.stringify(normalize(value));
  } catch {
    return String(value);
  }
}

/** Block every live fetch during replay; a session adapter can resolve matches. */
export function installReplayNetworkGuard(
  resolve: (
    request: Request,
  ) => Response | undefined | Promise<Response | undefined>,
  onUnmatched?: (request: Request) => void,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const requestUrl = new URL(request.url);
    // The local Vite typecheck badge polls this development-only endpoint.
    // It is infrastructure rather than recorded app traffic; satisfy it
    // locally so it cannot stop an otherwise valid replay.
    if (
      request.method === 'GET' &&
      requestUrl.origin === location.origin &&
      requestUrl.pathname === '/__demo/typecheck'
    ) {
      return new Response(JSON.stringify({ status: 'passed' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    const response = await resolve(request);
    if (!response) {
      onUnmatched?.(request);
      throw new Error(
        `Replay stopped: no recorded response for ${request.method} ${request.url}`,
      );
    }
    return response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** Match requests in their recorded order using method, local path and body. */
export function createRecordedResponseResolver(
  session: SendContextReplayExport,
  scenario?: ReplayScenario,
): RecordedResponseResolver {
  const firstInteractionSequence =
    session.events.find(
      (event) =>
        (event.kind === 'dom' || event.kind === 'hover') &&
        event.phase === 'emitted',
    )?.sequence ?? 0;
  const starts = session.events.filter(
    (event) =>
      event.kind === 'http' &&
      event.phase === 'started' &&
      event.sequence > firstInteractionSequence &&
      isRecord(event.payload) &&
      event.payload['source'] === 'browser-fetch',
  );
  let nextIndex = 0;
  let currentElapsedMs = Number.NEGATIVE_INFINITY;
  let timelineEnabled = false;
  const pending: Array<{
    dueMs: number;
    resolve(response: Response): void;
    reject(error: unknown): void;
    response?: Response;
    error?: unknown;
  }> = [];
  const resolvePending = (): void => {
    const due = pending.filter((item) => item.dueMs <= currentElapsedMs);
    for (let index = pending.length - 1; index >= 0; index--) {
      if (pending[index]!.dueMs <= currentElapsedMs) pending.splice(index, 1);
    }
    for (const item of due) {
      if (item.error !== undefined) item.reject(item.error);
      else item.resolve(item.response!);
    }
  };
  const resolver = (async (request: Request) => {
    const requestBody = await request
      .clone()
      .text()
      .catch(() => '');
    const started = starts[nextIndex];
    if (!started?.operationId || !isRecord(started.payload)) return undefined;
    const payload = started.payload;
    const recordedMethod =
      typeof payload['method'] === 'string'
        ? (payload['method'] as string).toUpperCase()
        : 'GET';
    const recordedUrl =
      typeof payload['url'] === 'string' ? (payload['url'] as string) : '';
    if (
      recordedMethod !== request.method.toUpperCase() ||
      !(scenario
        ? matchesRequestUrlStrict(
            recordedUrl,
            request.url,
            payload['params'],
            session.startUrl,
          )
        : matchesRequestUrl(
            recordedUrl,
            request.url,
            payload['params'],
            session.startUrl,
          ))
    )
      return undefined;
    const rawBody = payload['body'];
    if (
      rawBody === undefined
        ? requestBody !== ''
        : !(scenario
            ? bodyMatchesStrict(
                rawBody,
                requestBody,
                request,
                payload,
                scenario,
              )
            : bodyMatches(rawBody, requestBody))
    )
      return undefined;
    const finish = session.events.find(
      (event) =>
        event.kind === 'http' &&
        event.operationId === started.operationId &&
        (event.phase === 'succeeded' || event.phase === 'failed'),
    );
    if (!finish) return undefined;
    nextIndex += 1;
    const response = recordedFetchResponse(finish);
    const dueMs =
      finish.globalElapsedMs ?? finish.elapsedMs ?? finish.timestamp;
    if (!timelineEnabled || dueMs <= currentElapsedMs) {
      if (response instanceof Error) throw response;
      return response;
    }
    return new Promise<Response>((resolve, reject) => {
      pending.push({
        dueMs,
        resolve,
        reject,
        ...(response instanceof Error ? { error: response } : { response }),
      });
    });
  }) as RecordedResponseResolver;
  resolver.enableTimeline = () => {
    timelineEnabled = true;
  };
  resolver.advanceTo = (elapsedMs) => {
    if (!Number.isFinite(elapsedMs)) return;
    timelineEnabled = true;
    currentElapsedMs = Math.max(currentElapsedMs, elapsedMs);
    resolvePending();
  };
  resolver.dispose = () => {
    for (const item of pending.splice(0))
      item.reject(new Error('Replay stopped before the recorded response.'));
  };
  return resolver;
}

export type RecordedResponseResolver = ((
  request: Request,
) => Promise<Response | undefined>) & {
  enableTimeline(): void;
  advanceTo(elapsedMs: number): void;
  dispose(): void;
};

export type ReplayTestResult = Readonly<{
  status: 'passed' | 'failed' | 'partial' | 'not-replayable';
  classification:
    | 'none'
    | 'invalid-scenario'
    | 'capture-incomplete'
    | 'stale-or-incompatible'
    | 'environment-or-adapter-missing'
    | 'visual-only'
    | 'regression-or-contract-change';
  scenarioId: string;
  scenarioVersion: number;
  firstDifference?: ReplayDifference;
  error?: string;
  comparedAssertions: readonly string[];
  appliedTolerances: readonly Readonly<{
    assertionId: string;
    rule: ReplayScenarioTolerance;
  }>[];
}>;

/** Run a validated scenario to completion without dashboard recovery controls. */
export async function runReplayTest(
  session: SendContextReplayExport,
  scenarioJson: string,
  options: Readonly<{
    readState?: () => unknown;
    observedEvents?: () => readonly SendContextEvent[];
    invokeRecordedMethod?: (event: SendContextEvent) => void | Promise<void>;
    onTimelineAdvance?: (elapsedMs: number) => void | Promise<void>;
    onDeferActivation?: (
      event: SendContextEvent,
      targetId: string,
    ) => Promise<'loaded' | 'error'>;
    prepare?: () => void | Promise<void>;
    settleTimeoutMs?: number;
  }>,
): Promise<ReplayTestResult> {
  const scenarioValidation = validateReplayScenario(scenarioJson);
  const fallbackScenarioId = 'invalid-scenario';
  const scenario = scenarioValidation.ok
    ? scenarioValidation.scenario
    : undefined;
  const scenarioValidationError = scenarioValidation.ok
    ? undefined
    : scenarioValidation.error;
  const scenarioId = scenario?.id ?? fallbackScenarioId;
  const scenarioVersion = scenario?.scenarioVersion ?? 0;
  const appliedTolerances: Array<{
    assertionId: string;
    rule: ReplayScenarioTolerance;
  }> = [];
  const comparedAssertions = new Set<string>();
  if (!scenario)
    return {
      status: 'not-replayable',
      classification: 'invalid-scenario',
      scenarioId,
      scenarioVersion,
      error: scenarioValidationError,
      comparedAssertions: [],
      appliedTolerances,
    };
  const archiveValidation = validateReplayExport(JSON.stringify(session));
  if (!archiveValidation.ok)
    return {
      status: 'not-replayable',
      classification: /truncated|incomplete|clip/i.test(archiveValidation.error)
        ? 'capture-incomplete'
        : /transport|adapter|unsupported/i.test(archiveValidation.error)
          ? 'environment-or-adapter-missing'
          : 'stale-or-incompatible',
      scenarioId,
      scenarioVersion,
      error: archiveValidation.error,
      comparedAssertions: [],
      appliedTolerances,
    };
  const steps = getReplaySteps(session.events);
  if (!steps.length)
    return {
      status: 'not-replayable',
      classification: 'capture-incomplete',
      scenarioId,
      scenarioVersion,
      error: 'Session contains no replayable interaction steps.',
      comparedAssertions: [],
      appliedTolerances,
    };

  let firstDifference: ReplayDifference | undefined;
  let error: string | undefined;
  let replay: ReplayController | undefined;
  const observedBaseline = options.observedEvents?.().length ?? 0;
  try {
    replay = createReplayController(session, {
      ...options,
      mode: 'invocation',
      scenario,
      forceRecovery: undefined,
      onError: (message) => {
        error ??= message;
      },
    });
    while (replay.index() < steps.length) {
      const previousIndex = replay.index();
      const difference = await replay.step();
      if (difference) {
        firstDifference = difference;
        break;
      }
      if (error) break;
      if (replay.index() === previousIndex) {
        error = 'Replay stopped without completing its next interaction.';
        break;
      }
    }
  } catch (caught) {
    error ??= caught instanceof Error ? caught.message : String(caught);
  } finally {
    replay?.stop();
  }

  if (!firstDifference && !error && scenario.checkpoints.length) {
    if (!options.readState) {
      error =
        'Scenario declares business state assertions but no state reader was configured.';
    } else {
      const finalState = options.readState();
      for (const assertion of scenario.checkpoints) {
        const observed = readReplayScenarioPath(finalState, assertion.path);
        const actual = observed.found ? observed.value : null;
        const rules = scenario.tolerances.filter(
          (tolerance) => tolerance.assertionId === assertion.id,
        );
        const comparison = compareReplayScenarioValue(
          assertion.expected,
          actual,
          rules,
        );
        comparedAssertions.add(assertion.id);
        for (const rule of comparison.applied)
          appliedTolerances.push({ assertionId: assertion.id, rule });
        if (!comparison.matches) {
          firstDifference = {
            eventId: `scenario:${assertion.id}`,
            expected: assertion.expected,
            actual,
            ...(comparison.applied.length
              ? { tolerances: comparison.applied }
              : {}),
          };
          break;
        }
      }
    }
  }

  if (!firstDifference && !error && scenario.eventAssertions.length) {
    const observed = options.observedEvents?.().slice(observedBaseline);
    if (!observed) {
      error =
        'Scenario declares invocation, HTTP, or transport assertions but no observed event source was configured.';
    } else {
      const consumed = new Set<number>();
      for (const assertion of scenario.eventAssertions) {
        const candidate = findScenarioObservedAssertion(
          assertion,
          observed,
          consumed,
        );
        const actual = candidate
          ? scenarioEventValue(candidate, assertion, observed)
          : null;
        if (candidate) consumed.add(observed.indexOf(candidate));
        const projected = projectScenarioExpectedShape(
          assertion.expected,
          actual,
        );
        const rules = scenario.tolerances.filter(
          (tolerance) => tolerance.assertionId === assertion.id,
        );
        const comparison = compareReplayScenarioValue(
          assertion.expected,
          projected,
          rules,
        );
        comparedAssertions.add(assertion.id);
        for (const rule of comparison.applied)
          appliedTolerances.push({ assertionId: assertion.id, rule });
        if (!comparison.matches) {
          firstDifference = {
            eventId: `scenario:${assertion.id}`,
            expected: assertion.expected,
            actual: candidate ? projected : null,
            ...(comparison.applied.length
              ? { tolerances: comparison.applied }
              : {}),
          };
          break;
        }
      }
    }
  }

  if (!firstDifference && !error) {
    for (const assertion of scenario.visualAssertions) {
      if (typeof document === 'undefined') {
        error = `Visual assertion ${assertion.id} requires a browser document.`;
        break;
      }
      const targetInfo = resolveScenarioVisualTarget(assertion.targetId);
      const actual = scenarioVisualValue(targetInfo.element);
      const rules = scenario.tolerances.filter(
        (tolerance) => tolerance.assertionId === assertion.id,
      );
      const projected = projectScenarioExpectedShape(
        assertion.expected,
        actual,
      );
      const comparison = compareReplayScenarioValue(
        assertion.expected,
        projected,
        rules,
      );
      comparedAssertions.add(assertion.id);
      for (const rule of comparison.applied)
        appliedTolerances.push({ assertionId: assertion.id, rule });
      if (!comparison.matches) {
        firstDifference = {
          eventId: `visual:${assertion.id}`,
          expected: assertion.expected,
          actual: projected,
          ...(comparison.applied.length
            ? { tolerances: comparison.applied }
            : {}),
        };
        break;
      }
    }
  }

  if (!firstDifference && !error) {
    const missing = [
      ...scenario.checkpoints.map((assertion) => assertion.id),
      ...scenario.eventAssertions.map((assertion) => assertion.id),
      ...scenario.visualAssertions.map((assertion) => assertion.id),
    ].find((id) => !comparedAssertions.has(id));
    if (missing) error = `Scenario assertion ${missing} was not evaluated.`;
  }
  const status = firstDifference || error ? 'failed' : 'passed';
  return {
    status,
    classification:
      status === 'passed'
        ? 'none'
        : firstDifference &&
            scenario.visualAssertions.some(
              (assertion) =>
                `visual:${assertion.id}` === firstDifference?.eventId,
            )
          ? 'visual-only'
          : /adapter|transport|environment|not recorded|no recorded|fetch/i.test(
                error ?? '',
              )
            ? 'environment-or-adapter-missing'
            : 'regression-or-contract-change',
    scenarioId,
    scenarioVersion,
    ...(firstDifference ? { firstDifference } : {}),
    ...(error ? { error } : {}),
    comparedAssertions: [...comparedAssertions],
    appliedTolerances,
  };
}

export class ReplayScenarioTestError extends Error {
  readonly result: ReplayTestResult;

  constructor(result: ReplayTestResult) {
    super(
      `Replay scenario ${result.scenarioId}@${result.scenarioVersion} ${result.status}: ${result.error ?? result.firstDifference?.eventId ?? result.classification}`,
    );
    this.name = 'ReplayScenarioTestError';
    this.result = result;
  }
}

/** Throw on every non-green verdict so an unhandled call fails a CI test process. */
export async function runReplayTestOrThrow(
  session: SendContextReplayExport,
  scenarioJson: string,
  options: Parameters<typeof runReplayTest>[2],
): Promise<ReplayTestResult & { status: 'passed' }> {
  const result = await runReplayTest(session, scenarioJson, options);
  if (result.status !== 'passed') throw new ReplayScenarioTestError(result);
  return result as ReplayTestResult & { status: 'passed' };
}

function findScenarioObservedAssertion(
  assertion: ReplayScenario['eventAssertions'][number],
  observed: readonly SendContextEvent[],
  consumed: ReadonlySet<number>,
): SendContextEvent | undefined {
  const expected = isRecord(assertion.expected) ? assertion.expected : {};
  const index = observed.findIndex((candidate, candidateIndex) => {
    if (consumed.has(candidateIndex)) return false;
    if (assertion.kind === 'invocation') {
      if (candidate.kind !== 'craft' || candidate.phase !== 'started')
        return false;
      const payload = isRecord(candidate.payload) ? candidate.payload : {};
      const invocation = isRecord(payload['replayInvocation'])
        ? payload['replayInvocation']
        : {};
      return invocation['address'] === expected['address'];
    }
    if (assertion.kind === 'http') {
      if (candidate.kind !== 'http' || candidate.phase !== 'started')
        return false;
      const payload = isRecord(candidate.payload) ? candidate.payload : {};
      return (
        String(payload['method'] ?? '').toUpperCase() ===
          String(expected['method'] ?? '').toUpperCase() &&
        sameUrlEndpoint(
          String(payload['url'] ?? ''),
          String(expected['url'] ?? ''),
        )
      );
    }
    if (candidate.kind !== 'transport' || !isRecord(candidate.payload))
      return false;
    return (
      candidate.payload['transportId'] === expected['transportId'] &&
      candidate.payload['direction'] === expected['direction']
    );
  });
  return index < 0 ? undefined : observed[index];
}

function scenarioEventValue(
  event: SendContextEvent,
  assertion: ReplayScenario['eventAssertions'][number],
  observed: readonly SendContextEvent[],
): unknown {
  if (assertion.kind === 'invocation') {
    const payload = isRecord(event.payload) ? event.payload : {};
    return isRecord(payload['replayInvocation'])
      ? payload['replayInvocation']
      : null;
  }
  if (assertion.kind === 'http') {
    const payload = isRecord(event.payload) ? event.payload : {};
    const result: Record<string, unknown> = {
      method: payload['method'],
      url: payload['url'],
      ...(payload['params'] === undefined ? {} : { params: payload['params'] }),
      ...(payload['body'] === undefined
        ? {}
        : { body: parseScenarioBody(payload['body']) }),
    };
    if (isRecord(assertion.expected) && 'response' in assertion.expected) {
      const finish = observed.find(
        (candidate) =>
          candidate.kind === 'http' &&
          candidate.operationId === event.operationId &&
          (candidate.phase === 'succeeded' || candidate.phase === 'failed'),
      );
      result['response'] = finish?.response ?? null;
    }
    return result;
  }
  return event.payload ?? null;
}

function parseScenarioBody(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function sameUrlEndpoint(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

/** Project only fields named by the assertion; missing expected fields remain mismatches. */
function projectScenarioExpectedShape(
  expected: unknown,
  actual: unknown,
): unknown {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length)
      return actual;
    return expected.map((item, index) =>
      projectScenarioExpectedShape(item, actual[index]),
    );
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) return actual;
    return Object.fromEntries(
      Object.keys(expected).map((key) => [
        key,
        Object.hasOwn(actual, key)
          ? projectScenarioExpectedShape(expected[key], actual[key])
          : undefined,
      ]),
    );
  }
  return actual;
}

function resolveScenarioInteractionTarget(
  event: SendContextEvent,
  replayTarget: CraftReplayTarget | undefined,
): Readonly<{
  element: HTMLElement | null;
  status: 'resolved' | 'missing' | 'ambiguous' | 'invalid';
}> {
  if (replayTarget) {
    const result = ɵresolveCraftReplayTarget(replayTarget);
    return {
      element:
        result.status === 'resolved' && result.element instanceof HTMLElement
          ? result.element
          : null,
      status:
        result.status === 'resolved'
          ? 'resolved'
          : result.status === 'ambiguous'
            ? 'ambiguous'
            : 'missing',
    };
  }
  const payload = isRecord(event.payload) ? event.payload : {};
  if (typeof payload['selector'] !== 'string')
    return { element: null, status: 'invalid' };
  try {
    const matches = document.querySelectorAll(payload['selector']);
    if (matches.length > 1) return { element: null, status: 'ambiguous' };
    const element = matches.item(0);
    return element instanceof HTMLElement
      ? { element, status: 'resolved' }
      : { element: null, status: 'missing' };
  } catch {
    return { element: null, status: 'invalid' };
  }
}

function resolveScenarioVisualTarget(targetId: string): Readonly<{
  element: HTMLElement | null;
  status: 'resolved' | 'missing' | 'ambiguous';
}> {
  const matches = Array.from(
    document.querySelectorAll('[data-replay-id]'),
  ).filter((element) => element.getAttribute('data-replay-id') === targetId);
  if (matches.length > 1) return { element: null, status: 'ambiguous' };
  const element = matches[0];
  return element instanceof HTMLElement
    ? { element, status: 'resolved' }
    : { element: null, status: 'missing' };
}

function scenarioVisualValue(element: HTMLElement | null): unknown {
  if (!element) return { present: false };
  const explicitRole = element.getAttribute('role');
  const role = explicitRole ?? implicitRole(element);
  const labels =
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.labels
      ? Array.from(element.labels)
          .map((label) => label.textContent ?? '')
          .join(' ')
      : '';
  const accessibleName =
    element.getAttribute('aria-label') ||
    labels.trim() ||
    element.getAttribute('alt') ||
    element.getAttribute('title') ||
    element.textContent?.trim() ||
    '';
  return {
    present: true,
    tagName: element.tagName.toLowerCase(),
    ...(role ? { role } : {}),
    accessibleName,
  };
}

function implicitRole(element: HTMLElement): string | undefined {
  const tag = element.tagName.toLowerCase();
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'nav') return 'navigation';
  if (tag === 'main') return 'main';
  if (tag === 'header') return 'banner';
  if (tag === 'footer') return 'contentinfo';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select')
    return element.hasAttribute('multiple') ? 'listbox' : 'combobox';
  if (tag === 'input') {
    const type = (element as HTMLInputElement).type.toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'reset')
      return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (type === 'search') return 'searchbox';
    if (type !== 'hidden') return 'textbox';
  }
  return undefined;
}

function recordedFetchResponse(finished: SendContextEvent): Response | Error {
  if (finished.phase === 'failed') {
    const response = isRecord(finished.response) ? finished.response : {};
    return new Error(
      typeof response['message'] === 'string'
        ? response['message']
        : 'Recorded fetch failed.',
    );
  }
  const response = isRecord(finished.response) ? finished.response : undefined;
  if (response?.['source'] === 'browser-fetch-response') {
    const status =
      typeof response['status'] === 'number' &&
      Number.isInteger(response['status']) &&
      response['status'] >= 200 &&
      response['status'] <= 599
        ? response['status']
        : 200;
    const headers = isRecord(response['headers'])
      ? Object.fromEntries(
          Object.entries(response['headers']).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : { 'content-type': 'application/json' };
    return new Response(
      status === 204 || status === 205 || status === 304
        ? null
        : replayFetchBody(response['body']),
      {
        status,
        statusText:
          typeof response['statusText'] === 'string'
            ? response['statusText']
            : undefined,
        headers,
      },
    );
  }
  return new Response(
    typeof finished.response === 'string'
      ? finished.response
      : JSON.stringify(finished.response ?? null),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function replayFetchBody(body: unknown): BodyInit | null {
  if (typeof body === 'string') return body;
  if (
    isRecord(body) &&
    body['encoding'] === 'base64' &&
    typeof body['data'] === 'string'
  ) {
    const binary = atob(body['data']);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return null;
}

function matchesRequestUrl(
  recorded: string,
  actual: string,
  params: unknown,
  base: string,
): boolean {
  try {
    const expected = new URL(recorded, base || location.href);
    const received = new URL(actual);
    if (isRecord(params))
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null)
          expected.searchParams.set(key, String(value));
      }
    if (expected.pathname !== received.pathname) return false;
    const expectedParams = [...expected.searchParams.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );
    const receivedParams = [...received.searchParams.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return (
      expectedParams.length === receivedParams.length &&
      expectedParams.every(
        ([key, value], index) =>
          receivedParams[index]?.[0] === key &&
          (value === '[REDACTED]' || receivedParams[index]?.[1] === value),
      )
    );
  } catch {
    return recorded === actual;
  }
}

/** Scenario mode requires the recorded origin, path, and every query pair. */
function matchesRequestUrlStrict(
  recorded: string,
  actual: string,
  params: unknown,
  base: string,
): boolean {
  try {
    const expected = new URL(recorded, base || location.href);
    const received = new URL(actual);
    if (isRecord(params))
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null)
          expected.searchParams.set(key, String(value));
      }
    if (
      expected.origin !== received.origin ||
      expected.pathname !== received.pathname
    )
      return false;
    const pairs = (url: URL): string[] =>
      [...url.searchParams.entries()]
        .map(([key, value]) => `${key}\0${value}`)
        .sort();
    const expectedPairs = pairs(expected);
    const receivedPairs = pairs(received);
    return (
      expectedPairs.length === receivedPairs.length &&
      expectedPairs.every((pair, index) => pair === receivedPairs[index])
    );
  } catch {
    return false;
  }
}

/** Scenario fixtures use exact JSON equality; diagnostic replay keeps legacy redaction matching. */
function bodyMatchesStrict(
  expected: unknown,
  actual: string,
  request: Request,
  recordedPayload: Record<string, unknown>,
  scenario: ReplayScenario,
): boolean {
  if (typeof expected !== 'string') return false;
  try {
    const recordedBody: unknown = JSON.parse(expected);
    const actualBody: unknown = JSON.parse(actual);
    if (stableJson(recordedBody) === stableJson(actualBody)) return true;
    if (!containsRedactedValue(recordedBody)) return false;

    const recordedUrl = String(recordedPayload['url'] ?? '');
    const assertion = scenario.eventAssertions.find((candidate) => {
      if (candidate.kind !== 'http' || !isRecord(candidate.expected))
        return false;
      const assertionExpected = candidate.expected;
      return (
        String(assertionExpected['method'] ?? '').toUpperCase() ===
          request.method.toUpperCase() &&
        typeof assertionExpected['url'] === 'string' &&
        sameUrlEndpoint(assertionExpected['url'], request.url) &&
        sameUrlEndpoint(recordedUrl, request.url) &&
        'body' in assertionExpected
      );
    });
    if (!assertion) return false;
    const comparison = compareReplayScenarioValue(
      assertion.expected,
      {
        method: request.method,
        url: request.url,
        body: actualBody,
      },
      scenario.tolerances.filter(
        (tolerance) => tolerance.assertionId === assertion.id,
      ),
    );
    return (
      comparison.matches &&
      comparison.applied.some((tolerance) => tolerance.kind === 'redacted')
    );
  } catch {
    return expected === actual;
  }
}

function containsRedactedValue(value: unknown): boolean {
  if (value === '[REDACTED]') return true;
  if (Array.isArray(value)) return value.some(containsRedactedValue);
  return isRecord(value) && Object.values(value).some(containsRedactedValue);
}

function bodyMatches(expected: unknown, actual: string): boolean {
  try {
    const actualValue: unknown = JSON.parse(actual);
    if (typeof expected === 'string') {
      try {
        return matchesRedacted(JSON.parse(expected), actualValue);
      } catch {
        return actual.includes(expected);
      }
    }
    return matchesRedacted(expected, actualValue);
  } catch {
    return actual.includes(String(expected));
  }
}

function matchesRedacted(expected: unknown, actual: unknown): boolean {
  if (expected === '[REDACTED]') return true;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item, index) => matchesRedacted(item, actual[index]))
    );
  if (isRecord(expected))
    return (
      isRecord(actual) &&
      Object.entries(expected).every(
        ([key, value]) => key in actual && matchesRedacted(value, actual[key]),
      )
    );
  return expected === actual;
}
