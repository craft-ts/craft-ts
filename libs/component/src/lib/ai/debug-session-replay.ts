import {
  activateCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  type SendContextEvent,
  type SendContextReplayExport,
} from '@craft-ts/core';

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
  if (
    value['format'] !== 'craft-debug-session' ||
    (value['version'] !== 1 && value['version'] !== 2)
  ) {
    return {
      ok: false,
      error: 'This debug session format or version is not supported.',
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
    if (event.phase !== 'emitted') continue;
    const payload = isRecord(event.payload) ? event.payload : undefined;
    if (event.kind === 'dom') {
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

function writeScrollAndWaitForEvent(
  target: EventTarget,
  write: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout>;
    const finish = () => {
      target.removeEventListener('scroll', finish);
      clearTimeout(timeout);
      resolve();
    };
    timeout = setTimeout(finish, 100);
    target.addEventListener('scroll', finish, { once: true });
    write();
  });
}

function hasReplayStateDifference(expected: unknown, actual: unknown): boolean {
  if (isRecord(expected) && isRecord(actual)) {
    // Route transitions add and remove registry entries while a checkpoint is
    // captured. Compare only primitive addresses that exist on both sides.
    const sharedKeys = Object.keys(expected).filter((key) => key in actual);
    return sharedKeys.some(
      (key) => stableJson(expected[key]) !== stableJson(actual[key]),
    );
  }
  return stableJson(expected) !== stableJson(actual);
}

export type ReplayDifference = Readonly<{
  eventId: string;
  expected: unknown;
  actual: unknown;
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
    onDifference?: (event: SendContextEvent) => ReplayDifference | undefined;
    onError?: (message: string) => void;
    observedEvents?: () => readonly SendContextEvent[];
    readState?: () => unknown;
    prepare?: () => void | Promise<void>;
    onReplayDifference?: (difference: ReplayDifference) => void;
    onProgress?: (
      index: number,
      total: number,
      state: string,
      nextDelayMs?: number,
    ) => void;
    onInteraction?: (event: SendContextEvent, target: HTMLElement) => void;
    onScroll?: (event: SendContextEvent) => void;
    onViewport?: (event: SendContextEvent) => void | Promise<void>;
    forceRecovery?: (recovery: ReplayRecovery) => void | Promise<void>;
  }> = {},
): ReplayController {
  const interactions = session.events.filter(isReplayStep);
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
  let cursor = 0;
  let running = false;
  let terminated = false;
  let playbackEpoch: number | undefined;
  let playbackPaused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let playbackWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let resolvePlaybackWait: (() => void) | undefined;
  let playbackStepInFlight = false;
  const playbackResumeWaiters: Array<() => void> = [];
  let restoreFetch: (() => void) | undefined;
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
      restoreFetch?.();
      restoreFetch = undefined;
      restoreClock();
      if (resetClock) clock.reset(firstTime);
      playbackEpoch = undefined;
      playbackPaused = false;
      terminated = true;
    }
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
      if (cursor === 0 && running) playbackEpoch = performance.now();
      try {
        await options.onViewport?.(event);
      } catch (error) {
        stop(true);
        options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      }
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
            writeScrollAndWaitForEvent(window, () =>
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
        const scroller = safeQuerySelector(payload['selector']);
        if (!(scroller instanceof HTMLElement)) {
          stop(true);
          options.onError?.(
            `Replay scroll target is invalid or not found: ${payload['selector']}`,
          );
          return undefined;
        }
        if (
          scroller.scrollLeft !== payload['scrollLeft'] ||
          scroller.scrollTop !== payload['scrollTop']
        ) {
          scrollSettlers.push(
            writeScrollAndWaitForEvent(scroller, () => {
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
      if (cursor === 0 && running) playbackEpoch = performance.now();
      options.onScroll?.(event);
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
    const followingInteraction = session.events.find(
      (candidate) =>
        candidate.kind === 'dom' &&
        candidate.phase === 'emitted' &&
        candidate.sequence > event.sequence,
    );
    const intervalEvents = session.events.filter(
      (candidate) =>
        candidate.sequence > event.sequence &&
        (followingInteraction === undefined ||
          candidate.sequence < followingInteraction.sequence) &&
        ((candidate.kind === 'craft' && isComparable(candidate)) ||
          candidate.state !== undefined),
    );
    const expectedCalls = intervalEvents.filter(
      (candidate) => candidate.kind === 'craft' && isComparable(candidate),
    );
    const payload = isRecord(event.payload) ? event.payload : {};
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
    const target = safeQuerySelector(payload['selector']);
    if (!(target instanceof HTMLElement)) {
      stop(true);
      options.onError?.(
        `Replay target selector is invalid or not found: ${payload['selector']}`,
      );
      return undefined;
    }
    restoreFetch ??= installReplayNetworkGuard(
      createRecordedResponseResolver(session),
      (request) => {
        stop(true);
        options.onError?.(
          `Replay stopped: no recorded response for ${request.method} ${request.url}`,
        );
      },
    );
    await clock.advanceTo(Math.max(clock.now(), timeOf(event)));
    if (typeof payload['value'] === 'string' && 'value' in target) {
      (target as HTMLInputElement).value = payload['value'];
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const init: KeyboardEventInit & MouseEventInit = {
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
    };
    const action = payload['action'];
    const scrollSettlers: Promise<void>[] = [];
    if (
      typeof payload['scrollX'] === 'number' &&
      typeof payload['scrollY'] === 'number' &&
      (window.scrollX !== payload['scrollX'] ||
        window.scrollY !== payload['scrollY'])
    ) {
      scrollSettlers.push(
        writeScrollAndWaitForEvent(window, () =>
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
        const scroller = safeQuerySelector(scrollState['selector']);
        if (!(scroller instanceof HTMLElement)) {
          stop(true);
          options.onError?.(
            `Replay scroll target selector is invalid or not found: ${scrollState['selector']}`,
          );
          return undefined;
        }
        if (
          scroller.scrollLeft !== scrollState['scrollLeft'] ||
          scroller.scrollTop !== scrollState['scrollTop']
        ) {
          scrollSettlers.push(
            writeScrollAndWaitForEvent(scroller, () => {
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
      : action.startsWith('pointer') ||
          action.startsWith('mouse') ||
          action === 'click'
        ? new MouseEvent(action, init)
        : new Event(action, init);
    // Preparation can reload or restore the target and take much longer than
    // any recorded gap. The interaction timeline begins when the first action
    // is dispatched, so setup time must not consume its recorded delays.
    if (cursor === 0 && running) playbackEpoch = performance.now();
    target.dispatchEvent(native);
    let expectedCallIndex = 0;
    const settleDeadline = Date.now() + 2500;
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
    let lastExpectedState: unknown;
    for (const intervalEvent of intervalEvents) {
      const isCraftCall =
        intervalEvent.kind === 'craft' && isComparable(intervalEvent);
      // Keep the target's virtual timers aligned with the recording's wall
      // time. Advancing straight to a query's recorded success would resolve
      // craftSleep immediately and reveal its value too early during playback.
      if (!(await waitForPlaybackTime(timeOf(intervalEvent)))) return undefined;
      await clock.advanceTo(Math.max(clock.now(), timeOf(intervalEvent)));
      if (intervalEvent.state !== undefined && options.readState) {
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
      } else if (intervalEvent.state !== undefined) {
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
    cursor += 1;
    if (options.observedEvents) {
      const observed = observedCalls();
      const length = Math.max(expectedCalls.length, observed.length);
      for (let index = 0; index < length; index += 1) {
        const expected = expectedCalls[index];
        const actual = observed[index];
        if (
          !expected ||
          !actual ||
          expected.phase !== actual.phase ||
          expected.name !== actual.name
        ) {
          return reportDifference(
            {
              eventId: expected?.id ?? `observed-${actual?.sequence ?? index}`,
              expected: expected ?? null,
              actual: actual ?? null,
            },
            lastExpectedState,
            cursor,
          );
        }
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
      const difference = await step();
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
    event.phase === 'emitted' &&
    (event.kind === 'dom' ||
      event.kind === 'scroll' ||
      event.kind === 'viewport')
  );
}

function isComparable(event: SendContextEvent): boolean {
  return !(
    typeof event.payload === 'object' &&
    event.payload !== null &&
    'comparable' in event.payload &&
    (event.payload as { comparable?: unknown }).comparable === false
  );
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
): (request: Request) => Promise<Response | undefined> {
  const firstInteractionSequence =
    session.events.find(
      (event) => event.kind === 'dom' && event.phase === 'emitted',
    )?.sequence ?? 0;
  const starts = session.events.filter(
    (event) =>
      event.kind === 'http' &&
      event.phase === 'started' &&
      event.sequence > firstInteractionSequence,
  );
  let nextIndex = 0;
  return async (request) => {
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
      !matchesRequestUrl(
        recordedUrl,
        request.url,
        payload['params'],
        session.startUrl,
      )
    )
      return undefined;
    const rawBody = payload['payload'];
    if (
      rawBody === undefined
        ? requestBody !== ''
        : !bodyMatches(rawBody, requestBody)
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
    return new Response(
      typeof finish.response === 'string'
        ? finish.response
        : JSON.stringify(finish.response ?? null),
      {
        status: finish.phase === 'failed' ? 500 : 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };
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

function bodyMatches(expected: unknown, actual: string): boolean {
  try {
    return matchesRedacted(expected, JSON.parse(actual));
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
