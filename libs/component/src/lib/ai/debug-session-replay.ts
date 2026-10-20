import {
  activateCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  type SendContextEvent,
  type SendContextReplayExport,
  type CraftReplayTarget,
  isCraftReplayTransportEvent,
  ɵresolveCraftReplayTarget,
} from '@craft-ts/core';
import {
  compareReplayScenarioValue,
  readReplayScenarioPath,
  type ReplayScenario,
  type ReplayScenarioTolerance,
  validateReplayScenario,
} from './debug-session-scenario';

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
      !isReplayInvocationEvent(event)
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
  if (value['format'] !== 'craft-debug-session' || value['version'] !== 5) {
    return {
      ok: false,
      error:
        'Cette session utilise un ancien format de rejeu. Enregistre une nouvelle session avec le format v5.',
    };
  }
  if (
    !Array.isArray(value['events']) ||
    !Array.isArray(value['clips']) ||
    typeof value['truncated'] !== 'boolean'
  ) {
    return {
      ok: false,
      error: 'The session is incomplete and cannot be inspected.',
    };
  }
  if (
    typeof value['startUrl'] !== 'string' ||
    typeof value['exportedAt'] !== 'number'
  ) {
    return {
      ok: false,
      error: 'The session is missing its start URL or export timestamp.',
    };
  }
  if (value['viewport'] !== undefined) {
    const viewport = value['viewport'];
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
    value['initialSnapshot'] !== undefined &&
    !isRecord(value['initialSnapshot'])
  ) {
    return { ok: false, error: 'The initial primitive snapshot is invalid.' };
  }
  const events = value['events'];
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
    if (event.kind === 'dom' || event.kind === 'hover') {
      if (
        !payload ||
        typeof payload['selector'] !== 'string' ||
        payload['selector'].length === 0 ||
        payload['selector'].length > 2_048 ||
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
): Promise<ReturnType<typeof ɵresolveCraftReplayTarget>> {
  const deadline = performance.now() + timeoutMs;
  let result = ɵresolveCraftReplayTarget(target);
  while (result.status === 'missing' && performance.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    result = ɵresolveCraftReplayTarget(target);
  }
  return result;
}

async function waitForReplayTarget(
  selector: string,
  timeoutMs = 10_000,
): Promise<HTMLElement | null> {
  const deadline = performance.now() + timeoutMs;
  do {
    const target = safeQuerySelector(selector);
    if (target instanceof HTMLElement) return target;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  } while (performance.now() < deadline);
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
  pause(): void;
  stop(): void;
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
    mode?: 'invocation' | 'legacy-dom';
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
  }> = {},
): ReplayController {
  if (options.scenario) {
    const validation = validateReplayScenario(JSON.stringify(options.scenario));
    if (!validation.ok) throw new Error(validation.error);
  }
  const interactions = getReplaySteps(session.events);
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
  const playbackResumeWaiters: Array<() => void> = [];
  let restoreFetch: (() => void) | undefined;
  let recordedResponseResolver: RecordedResponseResolver | undefined;
  const pendingInvocationTasks: Promise<void>[] = [];
  let pendingInvocationError: unknown;
  let restoreReplayScrollBlock: (() => void) | undefined;
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
    const event = interactions[cursor];
    if (!event) {
      stop(true, false);
      return undefined;
    }
    if (!prepared) {
      prepared = true;
      try {
        await options.prepare?.();
      } catch (error) {
        stop(true);
        options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
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
    const navigationForInteraction = (candidate: SendContextEvent): boolean => {
      if (
        !href ||
        candidate.kind !== 'navigation' ||
        candidate.phase !== 'started' ||
        candidate.name !== 'NavigationStart' ||
        !isRecord(candidate.payload) ||
        typeof candidate.payload['url'] !== 'string'
      )
        return false;
      try {
        const recordedDestination = new URL(
          candidate.payload['url'],
          session.startUrl,
        );
        const clickedDestination = new URL(href, session.startUrl);
        return (
          recordedDestination.pathname === clickedDestination.pathname &&
          recordedDestination.search === clickedDestination.search &&
          recordedDestination.hash === clickedDestination.hash
        );
      } catch {
        return false;
      }
    };
    const followingInteraction = interactions.find(
      (candidate) => candidate.sequence > event.sequence,
    );
    const intervalEvents = session.events.filter(
      (candidate) =>
        ((candidate.sequence > event.sequence &&
          (followingInteraction === undefined ||
            candidate.sequence < followingInteraction.sequence)) ||
          navigationForInteraction(candidate)) &&
        // Non-comparable Craft calls still mark lifecycle boundaries. In
        // particular, resource calls can be emitted when an async query
        // settles; keep their recorded timestamp in the interval so the
        // replay clock does not finish before that work has had a chance to
        // settle. Only comparable calls participate in result comparison.
        (candidate.kind === 'craft' ||
          candidate.kind === 'transport' ||
          (useInvocationReplay && candidate.kind === 'http') ||
          candidate.state !== undefined ||
          (useInvocationReplay &&
            (isReplayInvocationEvent(candidate) ||
              navigationForInteraction(candidate)))),
    );
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
    if (
      typeof payload['selector'] !== 'string' ||
      typeof payload['action'] !== 'string'
    ) {
      stop(true);
      options.onError?.(
        `Interaction ${event.sequence} has no replayable target or action.`,
      );
      return undefined;
    }
    const action = payload['action'];
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
    } else if (replayTarget) {
      // Hover is presentation only, so a late or missing DOM target should
      // fall back to the recorded coordinates promptly. Waiting for a target
      // that may never render stalls single-step playback without adding any
      // causal value.
      const resolution =
        event.kind === 'hover'
          ? ɵresolveCraftReplayTarget(replayTarget)
          : await waitForCraftReplayTarget(replayTarget);
      target =
        resolution.status === 'resolved' &&
        resolution.element instanceof HTMLElement
          ? resolution.element
          : null;
      if (!target && event.kind === 'hover') {
        options.onWarning?.(
          `Replay Craft hover target is ${resolution.status}; showing the recorded coordinates instead.`,
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
      const candidate = safeQuerySelector(payload['selector']);
      target = candidate instanceof HTMLElement ? candidate : null;
      if (!target)
        options.onWarning?.(
          `Replay hover target selector was not found: ${payload['selector']}. Showing the recorded coordinates instead.`,
        );
    } else {
      try {
        document.querySelector(payload['selector']);
      } catch {
        stop(true);
        options.onError?.(
          `Replay target selector is invalid or not found: ${payload['selector']}`,
        );
        return undefined;
      }
      target = await waitForReplayTarget(payload['selector']);
      if (!target) {
        stop(true);
        options.onError?.(
          `Replay target selector is invalid or not found: ${payload['selector']}`,
        );
        return undefined;
      }
    }
    await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
    recordedResponseResolver?.advanceTo(timeOf(event));
    await options.onTimelineAdvance?.(timeOf(event));
    if (event.kind === 'hover') {
      // Hover is a visual cue only. Dispatching pointer events here would run
      // application handlers a second time; the recorded Craft calls remain
      // the sole source of their effects during invocation replay.
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
    if (!useInvocationReplay) {
      target.dispatchEvent(native);
    } else {
      const navigation = intervalEvents.find(
        (candidate) =>
          candidate.kind === 'navigation' &&
          candidate.phase === 'started' &&
          typeof candidate.payload === 'object' &&
          candidate.payload !== null &&
          typeof (candidate.payload as Record<string, unknown>)['url'] ===
            'string',
      );
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
        const replayCalls = rootReplayInvocationEvents(intervalEvents);
        const deferredActivationRecorded = session.events.some(
          (candidate) =>
            candidate.kind === 'defer' &&
            candidate.phase === 'started' &&
            candidate.sequence > event.sequence &&
            (followingInteraction === undefined ||
              candidate.sequence < followingInteraction.sequence),
        );
        if (
          replayCalls.length === 0 &&
          !deferredActivationRecorded &&
          action === 'click'
        )
          options.onWarning?.(
            `Aucun appel Craft ni activation différée enregistrés après le clic ${event.name ?? event.sequence}.`,
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
    let lastExpectedState: unknown;
    for (const intervalEvent of intervalEvents) {
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
      try {
        difference = await step();
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
  const invocations = events.filter(isReplayInvocationEvent);
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
    // Registry.restore tolerates primitives that disappeared, but a checkpoint
    // with no shared identity cannot be considered compatible with this app.
    if (!Object.keys(state).some((key) => key in currentState)) continue;
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

function isReplayStep(event: SendContextEvent): boolean {
  return (
    (event.kind === 'defer' && event.phase === 'started') ||
    (event.phase === 'emitted' &&
      (event.kind === 'dom' ||
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
