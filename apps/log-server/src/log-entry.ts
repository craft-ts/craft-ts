/**
 * Wire format shared by the browser forwarder, the ingestion server and the
 * MCP reader. Everything except `level` and `timestamp` is optional: the
 * forwarder ships whatever the craft `Console.*` boundary produced.
 */
export type LogLevel = 'debug' | 'info' | 'log' | 'warn' | 'error';

export const LOG_LEVELS: readonly LogLevel[] = [
  'debug',
  'info',
  'log',
  'warn',
  'error',
];

export type IncomingLogEntry = {
  readonly level: LogLevel;
  /** Human readable rendering of the console arguments. */
  readonly message: string;
  /** Original console arguments, JSON-safe. */
  readonly args?: readonly unknown[];
  /** Craft host tag ancestry, e.g. `['App', 'UserCard']`. */
  readonly from?: readonly string[];
  readonly tags?: readonly unknown[];
  readonly trace?: string;
  readonly correlationId?: unknown;
  /** ISO or UTC string produced in the browser. */
  readonly timestamp?: string;
  readonly route?: string;
  readonly browser?: unknown;
  readonly clientId?: string;
};

export type StoredLogEntry = IncomingLogEntry & {
  readonly timestamp: string;
  /** Server-side receive time, always ISO 8601. */
  readonly receivedAt: string;
  readonly seq: number;
};

export type LogBatch = {
  readonly clientId?: string;
  readonly entries: readonly IncomingLogEntry[];
};

function isLogLevel(value: unknown): value is LogLevel {
  return (
    typeof value === 'string' && LOG_LEVELS.includes(value as LogLevel)
  );
}

/**
 * Validates and normalises one wire entry. Returns `undefined` when the payload
 * is unusable so a single bad entry never rejects a whole batch.
 */
export function normalizeEntry(
  value: unknown,
  fallbackClientId?: string,
): IncomingLogEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const raw = value as Record<string, unknown>;
  if (!isLogLevel(raw['level'])) return undefined;

  const message =
    typeof raw['message'] === 'string'
      ? raw['message']
      : JSON.stringify(raw['message'] ?? '');

  return {
    level: raw['level'],
    message,
    args: Array.isArray(raw['args']) ? raw['args'] : undefined,
    from: Array.isArray(raw['from'])
      ? (raw['from'] as unknown[]).map(String)
      : undefined,
    tags: Array.isArray(raw['tags']) ? raw['tags'] : undefined,
    trace: typeof raw['trace'] === 'string' ? raw['trace'] : undefined,
    correlationId: raw['correlationId'],
    timestamp:
      typeof raw['timestamp'] === 'string' ? raw['timestamp'] : undefined,
    route: typeof raw['route'] === 'string' ? raw['route'] : undefined,
    browser: raw['browser'],
    clientId:
      typeof raw['clientId'] === 'string' ? raw['clientId'] : fallbackClientId,
  };
}

export function parseBatch(payload: unknown): readonly IncomingLogEntry[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is IncomingLogEntry => entry !== undefined);
  }

  if (typeof payload !== 'object' || payload === null) return [];

  const batch = payload as Record<string, unknown>;
  const clientId =
    typeof batch['clientId'] === 'string' ? batch['clientId'] : undefined;

  if (Array.isArray(batch['entries'])) {
    return batch['entries']
      .map((entry) => normalizeEntry(entry, clientId))
      .filter((entry): entry is IncomingLogEntry => entry !== undefined);
  }

  const single = normalizeEntry(payload, clientId);
  return single ? [single] : [];
}
