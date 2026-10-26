/**
 * What an AI needs to resume a recorded session, read from the archive alone:
 * the story up to a point, the state at that point, and hints on what the
 * point depends on (who was signed in, which entities the screen shows). No
 * application declaration is involved; hints are evidence, the AI decides.
 */

type Event = Readonly<Record<string, unknown>>;

export type ResumeArchive = Readonly<{
  events: readonly Event[];
  startUrl?: string;
  participants?: readonly Readonly<Record<string, unknown>>[];
}>;

export type ResumePointOptions = Readonly<{
  /** The point is just before this event; the end of the session when omitted. */
  beforeSequence?: number;
  /** One archived tab; every tab when omitted. */
  participantId?: string;
}>;

export type ResumeStoryStep = Readonly<{
  sequence: number;
  elapsedMs: number;
  participantId?: string;
  kind: 'interaction' | 'invocation' | 'call' | 'route' | 'error';
  label: string;
  detail?: Readonly<Record<string, unknown>>;
}>;

export type ResumeStory = Readonly<{
  participants: readonly string[];
  steps: readonly ResumeStoryStep[];
  /** Steps left out beyond `limit`, the oldest first. */
  omitted: number;
}>;

export type ResumeTarget = Readonly<{
  beforeSequence?: number;
  route?: string;
  /** Last known value of each primitive, by its address without ordinals. */
  primitives: Readonly<Record<string, unknown>>;
  storageKeys: readonly string[];
  pendingTasks: readonly Readonly<Record<string, unknown>>[];
  /** Calls started and not answered at the point. */
  inFlight: readonly string[];
}>;

export type ResumeIdentityHint = Readonly<{
  role: string;
  id?: string;
  name?: string;
  email?: string;
  /** Where it was read: a call name or a primitive address. */
  source: string;
  sequence: number;
}>;

export type ResumePrerequisites = Readonly<{
  /** Latest first. The first one is the most likely identity at the point. */
  identities: readonly ResumeIdentityHint[];
  session: Readonly<{
    /** `true` when a value holding a token is still set at the point. */
    open: boolean | 'unknown';
    evidence: string;
    /**
     * The condition for `app.handoff` that holds once the live app is signed
     * in again: the recorded token is masked, so only a real one counts.
     */
    signedInWhen?: Readonly<{ address: string; path: string; unmasked: true }>;
  }>;
  /** Route parameters and ids shown by the state at the point. */
  entities: readonly Readonly<{ kind: string; id: string; source: string }>[];
  /** Calls that wrote to the backend before the point (the AI may redo them). */
  writes: readonly Readonly<{ sequence: number; call: string; status?: number }>[];
  pendingTasks: readonly Readonly<Record<string, unknown>>[];
}>;

export type ResumeRecordedCall = Readonly<{
  sequence: number;
  call: string;
  request: Readonly<{
    method: string;
    url: string;
    headers?: unknown;
    body?: unknown;
  }>;
  response?: Readonly<{ status?: number; body?: unknown }>;
}>;

const WRITE_CALL = /(?:save|create|add|update|delete|remove|checkout|order|reset|login|logout|sign.?in|sign.?out|register|submit|send|pay)/i;
const SIGN_OUT_CALL = /(?:logout|log.?out|sign.?out)/i;
const TOKEN_KEY = /token|session/i;
const VALUE_LIMIT = 600;

/** The archived steps up to the point, at the level a person would tell them. */
export function resumeStory(
  archive: ResumeArchive,
  options: ResumePointOptions & Readonly<{ limit?: number }> = {},
): ResumeStory {
  const events = eventsUntil(archive, options);
  const calls = callsOf(events);
  const steps: ResumeStoryStep[] = [];
  for (const event of events) {
    const base = {
      sequence: num(event['sequence']),
      elapsedMs: elapsedOf(event),
      ...(typeof event['participantId'] === 'string'
        ? { participantId: event['participantId'] }
        : {}),
    };
    const kind = event['kind'];
    const name = typeof event['name'] === 'string' ? event['name'] : '';
    const payload = record(event['payload']);
    if (kind === 'dom') {
      const value = payload['value'];
      steps.push({
        ...base,
        kind: 'interaction',
        label: name,
        ...(value === undefined || value === null ? {} : { detail: { value } }),
      });
    } else if (kind === 'craft' && event['phase'] === 'started') {
      const invocation = record(payload['replayInvocation']);
      if (typeof invocation['address'] !== 'string') continue;
      steps.push({
        ...base,
        kind: 'invocation',
        label: invocation['address'],
        detail: { args: invocation['args'] ?? [] },
      });
    } else if (kind === 'http' && event['phase'] === 'started') {
      const call = calls.get(event);
      if (!call) continue;
      steps.push({
        ...base,
        kind: 'call',
        label: call.name,
        ...(call.status === undefined ? {} : { detail: { status: call.status } }),
      });
    } else if (kind === 'route-activation' && event['phase'] === 'succeeded') {
      steps.push({ ...base, kind: 'route', label: `/${name}` });
    } else if (kind === 'error' || (kind === 'exception' && name)) {
      steps.push({ ...base, kind: 'error', label: name || String(payload['message'] ?? 'error') });
    }
  }
  const limit = options.limit ?? 200;
  const omitted = Math.max(0, steps.length - limit);
  return {
    participants: [
      ...new Set(
        events.flatMap((event) =>
          typeof event['participantId'] === 'string' ? [event['participantId']] : [],
        ),
      ),
    ],
    steps: steps.slice(omitted),
    omitted,
  };
}

/** The state at the point, rebuilt the way the replay rebuilds it. */
export function resumeTarget(
  archive: ResumeArchive,
  options: ResumePointOptions = {},
): ResumeTarget {
  const events = eventsUntil(archive, options);
  const values = primitiveValues(events);
  const checkpoint = [...events].reverse().find(isCheckpoint);
  const checkpointPayload = record(checkpoint?.['payload']);
  const lastNavigation = [...events]
    .reverse()
    .find(
      (event) =>
        (event['kind'] === 'navigation' && typeof record(event['payload'])['url'] === 'string') ||
        (event['kind'] === 'route-activation' && event['phase'] === 'succeeded'),
    );
  const route =
    lastNavigation?.['kind'] === 'navigation'
      ? routeOf(String(record(lastNavigation['payload'])['url']))
      : lastNavigation
        ? `/${String(lastNavigation['name'] ?? '')}`
        : typeof record(checkpointPayload['route'])['url'] === 'string'
          ? routeOf(String(record(checkpointPayload['route'])['url']))
          : archive.startUrl
            ? routeOf(archive.startUrl)
            : undefined;
  const calls = callsOf(events);
  return {
    ...(options.beforeSequence === undefined ? {} : { beforeSequence: options.beforeSequence }),
    ...(route === undefined ? {} : { route }),
    primitives: Object.fromEntries(
      [...values].map(([address, entry]) => [address, summarize(entry.value)]),
    ),
    storageKeys: [...storageKeysOf(events)],
    pendingTasks: Array.isArray(checkpointPayload['pendingTasks'])
      ? (checkpointPayload['pendingTasks'] as unknown[]).map(record)
      : [],
    inFlight: [...calls.values()].filter((call) => call.status === undefined && !call.failed).map((call) => call.name),
  };
}

/** Hints on what the point depends on; each comes with where it was read. */
export function resumePrerequisites(
  archive: ResumeArchive,
  options: ResumePointOptions = {},
): ResumePrerequisites {
  const events = eventsUntil(archive, options);
  const calls = callsOf(events);
  const identities: ResumeIdentityHint[] = [];
  for (const call of calls.values()) {
    if (call.status !== undefined && call.status >= 400) continue;
    for (const identity of identitiesIn(call.responseBody))
      identities.push({ ...identity, source: call.name, sequence: call.sequence });
  }
  const values = primitiveValues(events);
  for (const [address, entry] of values)
    for (const identity of identitiesIn(entry.value))
      identities.push({ ...identity, source: address, sequence: entry.sequence });
  identities.sort((left, right) => right.sequence - left.sequence);

  const signOut = [...calls.values()]
    .filter((call) => SIGN_OUT_CALL.test(call.name))
    .at(-1);
  const holders = [...values].filter(([, entry]) => holdsToken(entry.value));
  const cleared = [...values].filter(
    ([address, entry]) => TOKEN_KEY.test(address) && entry.value === undefined,
  );
  const latestHolder = holders.sort((a, b) => b[1].sequence - a[1].sequence)[0];
  const latestClear = cleared.sort((a, b) => b[1].sequence - a[1].sequence)[0];
  const session: ResumePrerequisites['session'] =
    signOut && (!latestHolder || signOut.sequence > latestHolder[1].sequence)
      ? { open: false, evidence: `${signOut.name} appelé avant le point.` }
      : latestClear && (!latestHolder || latestClear[1].sequence > latestHolder[1].sequence)
        ? { open: false, evidence: `${latestClear[0]} vidé avant le point.` }
        : latestHolder
          ? { open: true, evidence: `${latestHolder[0]} garde un jeton au point.` }
          : { open: 'unknown', evidence: 'Aucune valeur portant un jeton.' };
  const holderPath = latestHolder ? tokenPath(latestHolder[1].value) : undefined;
  const sessionWithCondition: ResumePrerequisites['session'] =
    latestHolder && holderPath
      ? {
          ...session,
          signedInWhen: { address: latestHolder[0], path: holderPath, unmasked: true },
        }
      : session;

  const target = resumeTarget(archive, options);
  const entities: ResumePrerequisites['entities'][number][] = [];
  const routeEvent = [...events]
    .reverse()
    .find((event) => event['kind'] === 'route-activation' && event['phase'] === 'succeeded');
  if (routeEvent && target.route) {
    const pattern = String(routeEvent['name'] ?? '').split('/');
    const actual = target.route.replace(/^\//, '').split(/[?#]/)[0]!.split('/');
    pattern.forEach((segment, index) => {
      if (segment.startsWith(':') && actual[index])
        entities.push({ kind: segment.slice(1), id: decodeURIComponent(actual[index]!), source: 'route' });
    });
  }
  for (const [address, entry] of values)
    for (const id of idsIn(entry.value).slice(0, 10))
      entities.push({ ...id, source: address });

  return {
    identities: dedupeIdentities(identities).slice(0, 10),
    session: sessionWithCondition,
    entities: dedupeEntities(entities).slice(0, 40),
    writes: [...calls.values()]
      .filter((call) => call.method !== 'GET' && WRITE_CALL.test(call.name))
      .map((call) => ({
        sequence: call.sequence,
        call: call.name,
        ...(call.status === undefined ? {} : { status: call.status }),
      })),
    pendingTasks: target.pendingTasks,
  };
}

/** One recorded request and its answer: by sequence, or the nth call of a name. */
export function resumeRecordedCall(
  archive: ResumeArchive,
  query: Readonly<{ sequence?: number; call?: string; occurrence?: number }>,
): ResumeRecordedCall | undefined {
  const calls = [...callsOf([...archive.events].sort(bySequence)).values()];
  const matches =
    query.sequence !== undefined
      ? calls.filter((call) => call.sequence === query.sequence)
      : calls.filter((call) => call.name === query.call);
  const call = matches[query.occurrence ?? matches.length - 1];
  if (!call) return undefined;
  return {
    sequence: call.sequence,
    call: call.name,
    request: {
      method: call.method,
      url: call.url,
      ...(call.headers === undefined ? {} : { headers: call.headers }),
      ...(call.requestBody === undefined ? {} : { body: call.requestBody }),
    },
    ...(call.status === undefined && call.responseBody === undefined
      ? {}
      : {
          response: {
            ...(call.status === undefined ? {} : { status: call.status }),
            ...(call.responseBody === undefined ? {} : { body: call.responseBody }),
          },
        }),
  };
}

type Call = {
  sequence: number;
  name: string;
  method: string;
  url: string;
  headers?: unknown;
  requestBody?: unknown;
  status?: number;
  responseBody?: unknown;
  failed?: boolean;
};

/**
 * Every recorded call, in story order. Operation ids restart with each page
 * load, so an answer belongs to the latest start that carries its id.
 */
function callsOf(events: readonly Event[]): Map<Event, Call> {
  const calls = new Map<Event, Call>();
  const open = new Map<string, Call>();
  for (const event of events) {
    if (event['kind'] !== 'http' || typeof event['operationId'] !== 'string') continue;
    const key = callKey(event);
    if (event['phase'] === 'started') {
      const payload = record(event['payload']);
      const method = String(payload['method'] ?? event['name'] ?? (payload['body'] === undefined ? 'GET' : 'POST')).toUpperCase();
      const url = String(payload['url'] ?? '');
      const requestBody = decodeJson(payload['body']);
      const call: Call = {
        sequence: num(event['sequence']),
        name: callName(method, url, requestBody, payload['headers']),
        method,
        url,
        ...(payload['headers'] === undefined ? {} : { headers: payload['headers'] }),
        ...(requestBody === undefined ? {} : { requestBody }),
      };
      calls.set(event, call);
      open.set(key, call);
      continue;
    }
    const call = open.get(key);
    if (!call) continue;
    open.delete(key);
    const response = record(event['response']);
    if (typeof response['status'] === 'number') call.status = response['status'];
    if ('body' in response) call.responseBody = decodeJson(response['body']);
    if (event['phase'] === 'failed') call.failed = true;
  }
  return calls;
}

/** A call is identified by its tab and its operation. */
function callKey(event: Event): string {
  return `${String(event['participantId'] ?? '')}:${String(event['operationId'])}`;
}

/** The function id for a craft server function, else `METHOD /path`. */
function callName(method: string, url: string, body: unknown, headers: unknown): string {
  const header = Object.entries(record(headers)).find(([name]) => name.toLowerCase() === 'x-craft-function-id')?.[1];
  if (typeof header === 'string' && !header.startsWith('craft-ref:')) return header;
  const decoded = record(body);
  if (method === 'POST' && typeof decoded['id'] === 'string' && 'input' in decoded) return decoded['id'];
  let path = url;
  try {
    path = new URL(url, 'http://craft.invalid').pathname;
  } catch {
    // Keep the archived text.
  }
  return `${method} ${path}`;
}

type PrimitiveValue = { value: unknown; sequence: number };

/** Checkpoint primitives, then every later change; a change to undefined clears. */
function primitiveValues(events: readonly Event[]): Map<string, PrimitiveValue> {
  const values = new Map<string, PrimitiveValue>();
  const set = (address: string, value: unknown, sequence: number) =>
    values.set(ordinalFree(address), { value, sequence });
  for (const event of events) {
    const sequence = num(event['sequence']);
    if (isCheckpoint(event)) {
      for (const [address, value] of Object.entries(record(record(event['payload'])['primitives'])))
        set(address, value, sequence);
      continue;
    }
    if (event['kind'] !== 'primitive') continue;
    const state = record(event['state']);
    const changed = record(event['payload'])['address'];
    if (event['name'] === 'primitive-change' && typeof changed === 'string') {
      set(changed, state[changed], sequence);
      continue;
    }
    for (const [address, value] of Object.entries(state)) set(address, value, sequence);
  }
  return values;
}

function storageKeysOf(events: readonly Event[]): Set<string> {
  const keys = new Set<string>();
  for (const event of events) {
    if (event['kind'] !== 'storage') continue;
    const payload = record(event['payload']);
    const entries = Array.isArray(payload['entries']) ? payload['entries'] : [payload];
    for (const entry of entries) {
      const key = record(entry)['key'];
      if (typeof key === 'string') keys.add(key);
    }
  }
  return keys;
}

function identitiesIn(value: unknown, depth = 0): Omit<ResumeIdentityHint, 'source' | 'sequence'>[] {
  if (depth > 4) return [];
  if (Array.isArray(value)) return value.length > 3 ? [] : value.flatMap((item) => identitiesIn(item, depth + 1));
  const object = record(value);
  const found: Omit<ResumeIdentityHint, 'source' | 'sequence'>[] = [];
  if (typeof object['role'] === 'string') {
    const text = (key: string) =>
      typeof object[key] === 'string' || typeof object[key] === 'number' ? String(object[key]) : undefined;
    const id = text('id') ?? text('userId') ?? text('username');
    found.push({
      role: object['role'],
      ...(id === undefined ? {} : { id }),
      ...(text('name') === undefined ? {} : { name: text('name')! }),
      ...(text('email') === undefined ? {} : { email: text('email')! }),
    });
  }
  for (const [key, child] of Object.entries(object))
    if (key !== 'role' && typeof child === 'object') found.push(...identitiesIn(child, depth + 1));
  return found;
}

function dedupeIdentities(identities: readonly ResumeIdentityHint[]): ResumeIdentityHint[] {
  const seen = new Set<string>();
  return identities.filter((identity) => {
    const key = `${identity.role}\0${identity.id ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function holdsToken(value: unknown, depth = 0): boolean {
  if (depth > 3) return false;
  return Object.entries(record(value)).some(
    ([key, child]) =>
      (/token/i.test(key) && typeof child === 'string' && child.length > 0) ||
      (typeof child === 'object' && holdsToken(child, depth + 1)),
  );
}

/** The dot path of the first token-like field, where `holdsToken` found one. */
function tokenPath(value: unknown, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  for (const [key, child] of Object.entries(record(value))) {
    if (/token/i.test(key) && typeof child === 'string' && child.length > 0) return key;
    if (typeof child === 'object') {
      const nested = tokenPath(child, depth + 1);
      if (nested) return `${key}.${nested}`;
    }
  }
  return undefined;
}

/** One entity per kind and id: the first place it was seen is enough. */
function dedupeEntities<T extends Readonly<{ kind: string; id: string }>>(
  entities: readonly T[],
): T[] {
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.kind}:${entity.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function idsIn(value: unknown, depth = 0): { kind: string; id: string }[] {
  if (depth > 3) return [];
  if (Array.isArray(value)) return value.slice(0, 5).flatMap((item) => idsIn(item, depth + 1));
  return Object.entries(record(value)).flatMap(([key, child]) => {
    if ((key === 'id' || /Id$/.test(key)) && (typeof child === 'string' || typeof child === 'number') && !String(child).startsWith('craft-ref:'))
      return [{ kind: key === 'id' ? 'id' : key.slice(0, -2), id: String(child) }];
    return typeof child === 'object' ? idsIn(child, depth + 1) : [];
  });
}

function summarize(value: unknown): unknown {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return '[non sérialisable]';
  }
  if (text === undefined || text.length <= VALUE_LIMIT) return value;
  return `${text.slice(0, VALUE_LIMIT)}… (${text.length} caractères)`;
}

function eventsUntil(archive: ResumeArchive, options: ResumePointOptions): Event[] {
  return [...archive.events]
    .filter(
      (event) =>
        (options.beforeSequence === undefined || num(event['sequence']) < options.beforeSequence) &&
        (options.participantId === undefined || event['participantId'] === options.participantId),
    )
    .sort(bySequence);
}

function isCheckpoint(event: Event | undefined): boolean {
  return event?.['kind'] === 'snapshot' && event['name'] === 'replay-checkpoint';
}

function routeOf(url: string): string {
  try {
    const parsed = new URL(url, 'http://craft.invalid');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function ordinalFree(address: string): string {
  return address.split(' / ').map((part) => part.replace(/#\d+$/, '')).join(' / ');
}

function decodeJson(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 3 && typeof current === 'string'; depth += 1) {
    const text = current.trim();
    if (!/^[[{"]/.test(text)) break;
    try {
      current = JSON.parse(text) as unknown;
    } catch {
      break;
    }
  }
  return current;
}

function elapsedOf(event: Event): number {
  return num(event['globalElapsedMs'] ?? event['elapsedMs']);
}

function bySequence(left: Event, right: Event): number {
  return num(left['sequence']) - num(right['sequence']);
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
