import { sha256Hex } from './sha256.js';

export const SESSION_TRACE_SCHEMA_VERSION = 2;

export type SessionTraceStepKind = 'route' | 'interaction' | 'http' | 'invocation' | 'checkpoint' | 'marker' | 'exception';
export type SessionTraceOutcome = 'ok' | 'error' | 'succeeded' | 'failed' | 'pending' | 'activated' | (string & {});
export type SessionTraceStep = Readonly<{
  key: string;
  kind: SessionTraceStepKind;
  /** Compared between runs. Never holds times, ids or random values. */
  detail: Readonly<Record<string, unknown>>;
  /** Time of the step's start since the beginning of the session. */
  elapsedMs: number;
  /** End minus start, for operations that have both. */
  durationMs?: number;
  participant: string;
  /** Event the step starts at: the replay positions itself there. */
  eventId: string;
}>;
export type SessionTrace = Readonly<{
  format: 'craft-session-trace';
  schemaVersion: typeof SESSION_TRACE_SCHEMA_VERSION;
  steps: readonly SessionTraceStep[];
  /** Events of a kind the table does not cover, by kind: a coverage gap shows here. */
  ignored: Readonly<Record<string, number>>;
  hash: string;
}>;
export type PortableSessionForTrace = Readonly<{
  events: readonly Readonly<Record<string, unknown>>[];
}>;
export type SessionTraceMarker = Readonly<{ label: string; at: number }>;
export type NormalizeSessionTraceOptions = Readonly<{
  /** URL paths that carry server functions; the function id is read from the JSON body. */
  serverFunctionPaths?: readonly string[];
  /** Step markers recorded outside the page (`Date.now()`), inserted by time. */
  markers?: readonly SessionTraceMarker[];
}>;

type Event = Readonly<Record<string, unknown>>;
type Operation = { start?: Event; end?: Event };
type Draft = Omit<SessionTraceStep, 'participant'> & { participantId: string; sequence: number; timestamp: number };

const DEFAULT_SERVER_FUNCTION_PATHS = ['/__server-functions'];
const OPERATION_KINDS = new Set(['http', 'craft', 'navigation']);
const END_PHASES = new Set(['succeeded', 'failed']);

/** Normalize portable session events into a deterministic, comparable trace. */
export function normalizeSessionTrace(session: PortableSessionForTrace, options: NormalizeSessionTraceOptions = {}): SessionTrace {
  const serverFunctionPaths = new Set(options.serverFunctionPaths ?? DEFAULT_SERVER_FUNCTION_PATHS);
  const events = [...session.events].sort((a, b) => number(a['sequence']) - number(b['sequence']));
  const operations = new Map<string, Operation>();
  for (const event of events) {
    const operationId = event['operationId'];
    if (!OPERATION_KINDS.has(String(event['kind'])) || typeof operationId !== 'string') continue;
    const operation = operations.get(operationId) ?? {};
    if (event['phase'] === 'started') operation.start ??= event;
    else if (END_PHASES.has(String(event['phase']))) operation.end ??= event;
    operations.set(operationId, operation);
  }
  const ignored: Record<string, number> = {};
  const lastValueByAddress = new Map<string, string>();
  const drafts: Draft[] = [];
  const draft = (event: Event, step: Pick<SessionTraceStep, 'key' | 'kind' | 'detail'> & { durationMs?: number }): Draft => ({
    ...step, elapsedMs: elapsed(event), eventId: String(event['id'] ?? ''), participantId: String(event['participantId'] ?? ''),
    sequence: number(event['sequence']), timestamp: number(event['timestamp'], NaN),
  });
  for (const event of events) {
    const kind = String(event['kind'] ?? '');
    const payload = record(event['payload']);
    if (OPERATION_KINDS.has(kind) && typeof event['operationId'] === 'string') {
      const operation = operations.get(event['operationId'])!;
      // One step per operation, at its start; an end without a start stands alone.
      if (event !== (operation.start ?? operation.end)) continue;
      const start = operation.start ?? {};
      const end = operation.end;
      const durationMs = end && operation.start ? Math.max(0, elapsed(end) - elapsed(operation.start)) : undefined;
      const step = kind === 'http' ? httpStep(start, end, serverFunctionPaths) : kind === 'craft' ? invocationStep(end, event) : navigationStep(end, event);
      drafts.push(draft(event, { ...step, ...(durationMs === undefined ? {} : { durationMs }) }));
    } else if (kind === 'route-activation') {
      drafts.push(draft(event, { key: `route-activation:${cleanAddress(String(payload['routePath'] ?? event['name'] ?? ''))}`, kind: 'route', detail: { outcome: payload['outcome'] ?? event['phase'] ?? null } }));
    } else if (kind === 'primitive') {
      const state = record(event['state']);
      for (const address of Object.keys(state).sort()) {
        const key = `checkpoint:${cleanAddress(address)}`;
        const value = sha256Hex(JSON.stringify(stableValue(state[address])));
        if (lastValueByAddress.get(key) === value) continue;
        lastValueByAddress.set(key, value);
        drafts.push(draft(event, { key, kind: 'checkpoint', detail: { value } }));
      }
    } else if (kind === 'dom' && typeof payload['interactionName'] === 'string') {
      drafts.push(draft(event, { key: `interaction:${clean(payload['interactionName'])}`, kind: 'interaction', detail: payload['value'] === undefined ? {} : { value: stableValue(payload['value']) } }));
    } else if (kind === 'custom' && event['name'] === 'test-marker') {
      drafts.push(draft(event, markerStep(String(payload['label'] ?? ''))));
    } else {
      ignored[kind || 'unknown'] = (ignored[kind || 'unknown'] ?? 0) + 1;
    }
  }
  const origin = events.reduce((min, event) => Math.min(min, number(event['timestamp'], Infinity)), Infinity);
  const withMarkers = insertMarkers(drafts, options.markers ?? [], origin);
  const participants = new Map<string, string>();
  const steps = withMarkers.map(({ participantId, sequence: _sequence, timestamp: _timestamp, ...step }): SessionTraceStep => {
    if (!participants.has(participantId)) participants.set(participantId, `p${participants.size + 1}`);
    return { ...step, participant: participants.get(participantId)! };
  });
  const hash = sha256Hex(JSON.stringify(steps.map(({ key, detail }) => [key, detail])));
  return { format: 'craft-session-trace', schemaVersion: SESSION_TRACE_SCHEMA_VERSION, steps, ignored: sortedRecord(ignored), hash };
}

function httpStep(start: Event, end: Event | undefined, serverFunctionPaths: ReadonlySet<string>): Pick<SessionTraceStep, 'key' | 'kind' | 'detail'> {
  const request = record(start['payload']);
  const response = end ? record(end['response']) : {};
  const method = String(request['method'] ?? start['name'] ?? end?.['name'] ?? 'GET').toUpperCase();
  const path = routePath(String(request['url'] ?? ''));
  const serverFunction = serverFunctionPaths.has(path) ? record(parseJson(request['body']))['id'] : undefined;
  const status = typeof response['status'] === 'number' ? response['status'] : null;
  const outcome = !end ? 'pending' : end['phase'] === 'failed' || (status !== null && status >= 400) ? 'error' : 'ok';
  return {
    key: typeof serverFunction === 'string' ? `server-fn:${clean(serverFunction)}` : `http:${method}:${path}`,
    kind: 'http',
    detail: { status, outcome, bodyKeys: Object.keys(record(parseJson(response['body']))).sort() },
  };
}

function invocationStep(end: Event | undefined, first: Event): Pick<SessionTraceStep, 'key' | 'kind' | 'detail'> {
  const payload = record(first['payload']);
  const invocation = record(payload['replayInvocation']);
  const hostTags = Array.isArray(payload['hostTags']) ? payload['hostTags'].filter((tag): tag is string => typeof tag === 'string') : [];
  const address = typeof invocation['address'] === 'string' ? invocation['address'] : hostTags.length ? hostTags.join(' / ') : String(payload['host'] ?? first['name'] ?? '');
  const failed = end?.['phase'] === 'failed';
  const error = record(end?.['response']);
  return {
    key: `invocation:${cleanAddress(address)}`,
    kind: 'invocation',
    detail: { outcome: !end ? 'pending' : failed ? 'failed' : 'succeeded', ...(failed ? { exception: String(error['_tag'] ?? error['name'] ?? 'unknown') } : {}) },
  };
}

function navigationStep(end: Event | undefined, first: Event): Pick<SessionTraceStep, 'key' | 'kind' | 'detail'> {
  const payload = record(first['payload']);
  const url = String(payload['url'] ?? record(payload['event'])['url'] ?? '');
  const eventName = String(payload['eventName'] ?? first['name'] ?? '');
  // NavigationStart names the route; the other router events are suffixed so a
  // cancelled navigation shows as a missing end, not as a changed start.
  const suffix = eventName && eventName !== 'NavigationStart' ? `:${eventName.replace(/^Navigation/, '').toLowerCase()}` : '';
  return {
    key: `route:${routePath(url)}${suffix}`,
    kind: 'route',
    detail: { queryKeys: queryKeys(url), outcome: !end ? 'pending' : end['phase'] === 'failed' ? 'failed' : 'succeeded' },
  };
}

function markerStep(label: string): Pick<SessionTraceStep, 'key' | 'kind' | 'detail'> {
  return { key: `marker:${clean(label)}`, kind: 'marker', detail: {} };
}

function insertMarkers(drafts: readonly Draft[], markers: readonly SessionTraceMarker[], origin: number): Draft[] {
  if (markers.length === 0) return [...drafts];
  const result: Draft[] = [];
  const pending = [...markers].sort((a, b) => a.at - b.at);
  // A label the page already emitted (test-marker) is not inserted twice.
  const present = new Set(drafts.filter((step) => step.kind === 'marker').map((step) => step.key));
  const flushBefore = (timestamp: number) => {
    while (pending.length && pending[0]!.at <= timestamp) {
      const marker = pending.shift()!;
      const step = markerStep(marker.label);
      if (present.has(step.key)) continue;
      present.add(step.key);
      result.push({ ...step, elapsedMs: Number.isFinite(origin) ? Math.max(0, marker.at - origin) : 0, eventId: '', participantId: '', sequence: -1, timestamp: marker.at });
    }
  };
  for (const step of drafts) {
    if (Number.isFinite(step.timestamp)) flushBefore(step.timestamp);
    result.push(step);
  }
  flushBefore(Infinity);
  return result;
}

/** Instance counters (`#12`) and generated values never identify a step. */
function cleanAddress(value: string): string { return clean(value.replace(/#\d+/g, '')); }
function clean(value: string): string { return value.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid').replace(/\b\d{7,}\b/g, ':n').replace(/\b\d{4}-\d\d-\d\dT[^\s]+/g, ':time').replace(/\[REDACTED\]/g, ':redacted').replace(/\s+/g, ' ').trim(); }
/**
 * Value used for a fingerprint: sorted keys, and volatile scalars masked.
 * A string with a digit (id, token, date) or a timestamp-sized number differs
 * on every run; lengths, counts, flags and enum-like strings carry the signal.
 */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === 'string') return /\d/.test(value) || value.length > 64 ? ':s' : value;
  if (typeof value === 'number') return Math.abs(value) >= 1e9 ? ':n' : value;
  if (!isRecord(value)) return value ?? null;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}
function routePath(value: string): string { try { return clean(new URL(value, 'http://craft.local').pathname); } catch { return clean(value.split('?')[0] ?? ''); } }
function queryKeys(value: string): string[] { try { return [...new URL(value, 'http://craft.local').searchParams.keys()].sort(); } catch { return []; } }
/** Response bodies are recorded as JSON strings, sometimes encoded twice. */
function parseJson(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 2 && typeof current === 'string'; depth += 1) {
    try { current = JSON.parse(current) as unknown; } catch { return undefined; }
  }
  return current;
}
function elapsed(event: Event): number { return Math.max(0, number(event['globalElapsedMs'] ?? event['elapsedMs'])); }
function sortedRecord(value: Record<string, number>): Record<string, number> { return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]!])); }
function record(value: unknown): Readonly<Record<string, unknown>> { return isRecord(value) ? value : {}; }
function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
