import {
  activateCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  type SendContextEvent,
  type SendContextReplayExport,
} from '@craft-ts/core';

export type ReplayValidation = Readonly<{
  ok: true;
  session: SendContextReplayExport;
}> | Readonly<{ ok: false; error: string }>;

/** Parse the portable format without accepting partial or unknown versions. */
export function validateReplayExport(json: string): ReplayValidation {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The pasted session is not valid JSON.' };
  }
  if (!isRecord(value)) return { ok: false, error: 'The session must be a JSON object.' };
  if (value['format'] !== 'craft-debug-session' || value['version'] !== 1) {
    return { ok: false, error: 'This debug session format or version is not supported.' };
  }
  if (value['truncated'] === true || !Array.isArray(value['events']) || !Array.isArray(value['clips'])) {
    return { ok: false, error: 'This session is truncated or incomplete and cannot be replayed.' };
  }
  if (typeof value['startUrl'] !== 'string' || typeof value['exportedAt'] !== 'number') {
    return { ok: false, error: 'The session is missing its start URL or export timestamp.' };
  }
  const events = value['events'];
  if (!events.every(isReplayEvent)) return { ok: false, error: 'The session contains an invalid event.' };
  if ((value['clips'] as unknown[]).some((clip) => isRecord(clip) && clip['truncated'] === true)) {
    return { ok: false, error: 'A recording clip was truncated; this session cannot be replayed.' };
  }
  return { ok: true, session: value as unknown as SendContextReplayExport };
}

function isReplayEvent(value: unknown): value is SendContextEvent {
  return isRecord(value) && typeof value['id'] === 'string' &&
    typeof value['sequence'] === 'number' && typeof value['timestamp'] === 'number' &&
    typeof value['kind'] === 'string' && typeof value['phase'] === 'string';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ReplayDifference = Readonly<{ eventId: string; expected: unknown; actual: unknown }>;
export type ReplayController = Readonly<{
  clock: VirtualCraftTemporalRuntime;
  index(): number;
  playing(): boolean;
  step(): Promise<ReplayDifference | undefined>;
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
    onDifference?: (event: SendContextEvent) => ReplayDifference | undefined;
    onError?: (message: string) => void;
    settle?: () => Promise<void>;
  }> = {},
): ReplayController {
  const interactions = session.events.filter((event) => event.kind === 'dom' && event.phase === 'emitted');
  const firstTime = interactions[0]?.timestamp ?? 0;
  const clock = new VirtualCraftTemporalRuntime(firstTime);
  const restoreClock = activateCraftTemporalRuntime(clock);
  let cursor = 0;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (reset = false): void => {
    running = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (reset) { restoreFetch(); restoreClock(); clock.reset(firstTime); }
  };
  const restoreFetch = installReplayNetworkGuard(
    createRecordedResponseResolver(session),
    (request) => {
      stop(true);
      options.onError?.(`Replay stopped: no recorded response for ${request.method} ${request.url}`);
    },
  );
  const step = async (): Promise<ReplayDifference | undefined> => {
    const event = interactions[cursor];
    if (!event) { stop(true); return undefined; }
    const payload = isRecord(event.payload) ? event.payload : {};
    if (typeof payload['selector'] !== 'string' || typeof payload['action'] !== 'string') {
      stop(true);
      options.onError?.(`Interaction ${event.sequence} has no replayable target or action.`);
      return undefined;
    }
    const target = document.querySelector(payload['selector']);
    if (!(target instanceof HTMLElement)) {
      stop(true);
      options.onError?.(`Replay target not found: ${payload['selector']}`);
      return undefined;
    }
    await clock.advanceTo(Math.max(clock.now(), event.timestamp));
    if (typeof payload['value'] === 'string' && 'value' in target) {
      (target as HTMLInputElement).value = payload['value'];
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const init: KeyboardEventInit & MouseEventInit = {
      bubbles: true,
      cancelable: true,
      ...(typeof payload['key'] === 'string' ? { key: payload['key'], code: payload['code'] as string | undefined } : {}),
      ...(typeof payload['button'] === 'number' ? { button: payload['button'] } : {}),
      ...(typeof payload['clientX'] === 'number' ? { clientX: payload['clientX'] } : {}),
      ...(typeof payload['clientY'] === 'number' ? { clientY: payload['clientY'] } : {}),
    };
    const action = payload['action'];
    const native = action.startsWith('key')
      ? new KeyboardEvent(action, init)
      : action.startsWith('pointer') || action.startsWith('mouse') || action === 'click'
        ? new MouseEvent(action, init)
        : new Event(action, init);
    target.dispatchEvent(native);
    if (options.settle) await options.settle();
    else for (let pass = 0; pass < 8; pass += 1) await Promise.resolve();
    await clock.advanceTo(clock.now());
    cursor += 1;
    const followingInteraction = interactions[cursor];
    const checkpoint = session.events.find((candidate) =>
      candidate.sequence > event.sequence && candidate.state !== undefined &&
      (followingInteraction === undefined || candidate.sequence < followingInteraction.sequence),
    );
    return checkpoint ? options.onDifference?.(checkpoint) : undefined;
  };
  const advance = async (): Promise<void> => {
    if (!running) return;
    const previous = interactions[cursor - 1];
    const next = interactions[cursor];
    if (!next) { stop(true); return; }
    const delay = previous ? Math.max(0, next.timestamp - previous.timestamp) : 0;
    timer = setTimeout(async () => {
      if (!running) return;
      await step();
      void advance();
    }, delay);
  };
  return {
    clock,
    index: () => cursor,
    playing: () => running,
    step,
    play: () => { if (!running) { running = true; void advance(); } },
    pause: stop,
    stop: () => { stop(true); cursor = 0; },
  };
}

/** Block every live fetch during replay; a session adapter can resolve matches. */
export function installReplayNetworkGuard(
  resolve: (request: Request) => Response | undefined | Promise<Response | undefined>,
  onUnmatched?: (request: Request) => void,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const response = await resolve(request);
    if (!response) {
      onUnmatched?.(request);
      throw new Error(`Replay stopped: no recorded response for ${request.method} ${request.url}`);
    }
    return response;
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

/** Match requests in their recorded order using method, local path and body. */
export function createRecordedResponseResolver(session: SendContextReplayExport): (request: Request) => Promise<Response | undefined> {
  const starts = session.events.filter((event) => event.kind === 'http' && event.phase === 'started');
  const used = new Set<string>();
  return async (request) => {
    const requestBody = await request.clone().text().catch(() => '');
    for (const started of starts) {
      if (!started.operationId || used.has(started.operationId) || !isRecord(started.payload)) continue;
      const payload = started.payload;
      const recordedMethod = typeof payload['method'] === 'string' ? (payload['method'] as string).toUpperCase() : 'GET';
      const recordedUrl = typeof payload['url'] === 'string' ? payload['url'] as string : '';
      if (recordedMethod !== request.method.toUpperCase() || !matchesRequestUrl(recordedUrl, request.url, payload['params'], session.startUrl)) continue;
      const rawBody = payload['payload'];
      if (rawBody !== undefined && requestBody && !bodyMatches(rawBody, requestBody)) continue;
      const finish = session.events.find((event) => event.kind === 'http' && event.operationId === started.operationId && (event.phase === 'succeeded' || event.phase === 'failed'));
      if (!finish) continue;
      used.add(started.operationId);
      return new Response(typeof finish.response === 'string' ? finish.response : JSON.stringify(finish.response ?? null), {
        status: finish.phase === 'failed' ? 500 : 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return undefined;
  };
}

function matchesRequestUrl(recorded: string, actual: string, params: unknown, base: string): boolean {
  try {
    const expected = new URL(recorded, base || location.href);
    const received = new URL(actual);
    if (isRecord(params)) for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) expected.searchParams.set(key, String(value));
    }
    if (expected.pathname !== received.pathname) return false;
    const expectedParams = [...expected.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const receivedParams = [...received.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    return expectedParams.length === receivedParams.length && expectedParams.every(([key, value], index) =>
      receivedParams[index]?.[0] === key && (value === '[REDACTED]' || receivedParams[index]?.[1] === value),
    );
  } catch { return recorded === actual; }
}

function bodyMatches(expected: unknown, actual: string): boolean {
  try { return matchesRedacted(expected, JSON.parse(actual)); } catch { return actual.includes(String(expected)); }
}

function matchesRedacted(expected: unknown, actual: unknown): boolean {
  if (expected === '[REDACTED]') return true;
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((item, index) => matchesRedacted(item, actual[index]));
  if (isRecord(expected)) return isRecord(actual) && Object.entries(expected).every(([key, value]) => key in actual && matchesRedacted(value, actual[key]));
  return expected === actual;
}
