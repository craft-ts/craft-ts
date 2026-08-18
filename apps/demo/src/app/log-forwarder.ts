import {
  DestroyRef,
  InjectionToken,
  type Provider,
  ɵinject as inject,
} from '@craft-ts/core';
import {
  SERVICE_RUNTIME_OVERRIDES,
  type ConsoleServiceApi,
  type ServiceRuntimeOverride,
} from '@craft-ts/core';
import { FUNCTION_REGISTRY_CLIENT_ID } from './function-registry-bridge';

export const LOG_SERVER_URL = new InjectionToken<string>('LOG_SERVER_URL', {
  factory: () => 'http://127.0.0.1:4319/logs',
});

/** Levels that the craft `Console.*` boundary decorates with metadata. */
const FORWARDED_LEVELS = [
  'debug',
  'info',
  'log',
  'warn',
  'error',
] as const;

type ForwardedLevel = (typeof FORWARDED_LEVELS)[number];

/**
 * Metadata appended by the craft `Console.*` boundary as the last argument.
 * See `createConsoleCall` in `browser-boundaries.ts`.
 */
type CraftConsoleMetadata = {
  from: readonly string[];
  tags: readonly unknown[];
  trace: string;
  correlationId: unknown;
  timestamp: string;
  route: string;
  browser?: unknown;
};

export type ForwardedLogEntry = {
  readonly level: ForwardedLevel;
  readonly message: string;
  readonly args: readonly unknown[];
  readonly from?: readonly string[];
  readonly tags?: readonly unknown[];
  readonly trace?: string;
  readonly correlationId?: unknown;
  readonly timestamp?: string;
  readonly route?: string;
  readonly browser?: unknown;
};

export type LogForwarderOptions = {
  readonly clientId: string;
  /** Ships one batch. Injected in tests; defaults to `fetch` + `sendBeacon`. */
  readonly send: (
    payload: { clientId: string; entries: readonly ForwardedLogEntry[] },
    options: { beacon: boolean },
  ) => void | Promise<void>;
  /** Underlying console; the forwarder always echoes to it. */
  readonly target?: ConsoleServiceApi;
  readonly flushIntervalMs?: number;
  /** Flush as soon as the buffer reaches this many entries. */
  readonly batchSize?: number;
  /** Drop the oldest entries beyond this, so an offline server cannot leak. */
  readonly maxBufferSize?: number;
};

export type LogForwarder = {
  readonly console: ConsoleServiceApi;
  flush(options?: { beacon: boolean }): void;
  stop(): void;
  /** Pending entries; exposed for tests. */
  readonly pending: readonly ForwardedLogEntry[];
};

const DEFAULT_FLUSH_INTERVAL_MS = 1000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_BUFFER_SIZE = 1000;

export function createLogForwarder(
  options: LogForwarderOptions,
): LogForwarder {
  // This IS the Console boundary implementation: reaching for the craft
  // Console here would recurse into the sink we are building.
  // eslint-disable-next-line craft-ts/prefer-browser-boundaries
  const target = options.target ?? globalThis.console;
  const flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBufferSize = options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;

  let buffer: ForwardedLogEntry[] = [];

  const flush = (flushOptions?: { beacon: boolean }): void => {
    if (buffer.length === 0) return;

    const entries = buffer;
    buffer = [];
    try {
      void options.send(
        { clientId: options.clientId, entries },
        { beacon: flushOptions?.beacon ?? false },
      );
    } catch {
      // The log server is a dev convenience: never let it break the app, and
      // never re-log through Console.* (that would recurse into this sink).
    }
  };

  const timer = setInterval(flush, flushIntervalMs);

  const forward = (level: ForwardedLevel, data: readonly unknown[]): void => {
    const { metadata, values } = splitMetadata(data);
    buffer.push({
      level,
      message: formatMessage(values),
      args: values.map((value) => toJsonSafe(value)),
      ...(metadata ?? {}),
    });

    if (buffer.length > maxBufferSize) {
      buffer = buffer.slice(buffer.length - maxBufferSize);
    }
    if (buffer.length >= batchSize) flush();
  };

  const forwardingConsole = {
    ...createPassThrough(target),
  } as ConsoleServiceApi;

  for (const level of FORWARDED_LEVELS) {
    forwardingConsole[level] = (...data: unknown[]) => {
      forward(level, data);
      target[level](...data);
    };
  }

  return {
    console: forwardingConsole,
    flush,
    stop: () => {
      clearInterval(timer);
      flush();
    },
    get pending() {
      return buffer;
    },
  };
}

/**
 * Overrides the craft `ConsoleService` so every `Console.*` call is echoed to
 * the browser console AND shipped to the local log server. Raw
 * `console.log(...)` calls bypass the craft boundary and are NOT forwarded.
 */
export function provideLogForwarding(): Provider {
  return {
    provide: SERVICE_RUNTIME_OVERRIDES,
    useFactory: (): ReadonlyMap<string, ServiceRuntimeOverride> => {
      // Bootstrap boundary: the forwarder lifetime follows the app injector.
      // eslint-disable-next-line craft-ts/no-angular-inject
      const endpoint = inject(LOG_SERVER_URL);
      // eslint-disable-next-line craft-ts/no-angular-inject
      const clientId = inject(FUNCTION_REGISTRY_CLIENT_ID);
      // eslint-disable-next-line craft-ts/no-angular-inject
      const destroyRef = inject(DestroyRef);

      const forwarder = createLogForwarder({
        clientId,
        send: (payload, { beacon }) => sendToLogServer(endpoint, payload, beacon),
      });

      // Ship whatever is buffered when the tab goes away.
      const onPageHide = () => forwarder.flush({ beacon: true });
      globalThis.addEventListener?.('pagehide', onPageHide);
      destroyRef.onDestroy(() => {
        globalThis.removeEventListener?.('pagehide', onPageHide);
        forwarder.stop();
      });

      return new Map<string, ServiceRuntimeOverride>([
        ['ConsoleService', { kind: 'useValue', value: forwarder.console }],
      ]);
    },
  };
}

function sendToLogServer(
  endpoint: string,
  payload: unknown,
  beacon: boolean,
): void {
  const body = JSON.stringify(payload);

  // Transport boundary: the unload path must be synchronous, so it cannot go
  // through the generator-based BrowserNavigator service.
  // eslint-disable-next-line craft-ts/prefer-browser-boundaries
  if (beacon && typeof globalThis.navigator?.sendBeacon === 'function') {
    // eslint-disable-next-line craft-ts/prefer-browser-boundaries
    globalThis.navigator.sendBeacon(
      endpoint,
      new Blob([body], { type: 'application/json' }),
    );
    return;
  }

  // The non-beacon path is an intentional transport boundary for this log sink.
  const request = globalThis.fetch.bind(globalThis);
  void request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    })
    .catch(() => {
      // Log server offline: drop the batch silently.
    });
}

function createPassThrough(target: ConsoleServiceApi): ConsoleServiceApi {
  return {
    debug: (...data) => target.debug(...data),
    info: (...data) => target.info(...data),
    log: (...data) => target.log(...data),
    warn: (...data) => target.warn(...data),
    error: (...data) => target.error(...data),
    trace: (...data) => target.trace(...data),
    group: (...label) => target.group(...label),
    groupCollapsed: (...label) => target.groupCollapsed(...label),
    groupEnd: () => target.groupEnd(),
    time: (label) => target.time(label),
    timeEnd: (label) => target.timeEnd(label),
  };
}

function isCraftConsoleMetadata(
  value: unknown,
): value is CraftConsoleMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate['from']) &&
    Array.isArray(candidate['tags']) &&
    typeof candidate['trace'] === 'string' &&
    typeof candidate['timestamp'] === 'string' &&
    typeof candidate['route'] === 'string'
  );
}

function splitMetadata(data: readonly unknown[]): {
  metadata: CraftConsoleMetadata | undefined;
  values: readonly unknown[];
} {
  const last = data[data.length - 1];
  return isCraftConsoleMetadata(last)
    ? { metadata: last, values: data.slice(0, -1) }
    : { metadata: undefined, values: data };
}

function formatMessage(values: readonly unknown[]): string {
  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      try {
        return JSON.stringify(toJsonSafe(value));
      } catch {
        return String(value);
      }
    })
    .join(' ');
}

const MAX_DEPTH = 6;

/**
 * Makes a console argument structurally cloneable: unwraps Errors, breaks
 * cycles and caps depth so a signal graph or DOM node cannot blow up the batch.
 */
function toJsonSafe(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function'
      ? `[Function ${value.name || 'anonymous'}]`
      : typeof value === 'bigint'
        ? value.toString()
        : typeof value === 'symbol'
          ? value.toString()
          : value;
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (depth >= MAX_DEPTH) return '[Depth limit]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item, seen, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = toJsonSafe(item, seen, depth + 1);
  }
  return result;
}
