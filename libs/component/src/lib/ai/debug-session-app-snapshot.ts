import type {
  SendContextEvent,
  SendContextReplayExport,
  SendContextReplaySnapshot,
} from '@craft-ts/core';
import { rootInvocations } from './debug-session-orchestrator';
import {
  browserStorageSnapshotBefore,
  type BrowserStorageSnapshot,
} from './debug-session-browser-storage';

export const DEBUG_APP_SNAPSHOT_FORMAT = 'craft-debug-app-snapshot';

/** Work that had started and not finished at the chosen moment. */
export type DebugInFlightWork = Readonly<{
  /** Root method calls that started requests still unanswered; relaunched in order. */
  invocations: readonly Readonly<{
    sequence: number;
    address: string;
    /** As recorded: serialized, to be revived by the app. */
    args: readonly unknown[];
  }>[];
  /** Primitives that were loading; reloaded. */
  reloads: readonly string[];
}>;

/**
 * The state of an application at one point of a recording, complete enough to
 * start the app again in live debug mode (no replay, real network) from there.
 */
export type DebugAppSnapshot = Readonly<{
  format: typeof DEBUG_APP_SNAPSHOT_FORMAT;
  version: 1;
  /** The event the state is taken just before; absent for the end of the recording. */
  beforeSequence?: number;
  /** Router destination (path, query, hash), relative to the app origin. */
  route: string;
  primitives: Readonly<Record<string, unknown>>;
  storage: SendContextReplaySnapshot['storage'];
  pendingTasks?: NonNullable<SendContextReplaySnapshot['pendingTasks']>;
  temporalNow?: number;
  temporalDateNow?: number;
  /** Origin storage as last recorded before the chosen moment. */
  browserStorage?: BrowserStorageSnapshot;
  /** Operations in flight at that moment, relaunched once the app is up. */
  inFlight?: DebugInFlightWork;
  /** What the reconstruction could not reproduce faithfully. */
  warnings: readonly string[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReplayCheckpoint(
  event: SendContextEvent,
): event is SendContextEvent & { payload: SendContextReplaySnapshot } {
  return (
    event.kind === 'snapshot' &&
    event.name === 'replay-checkpoint' &&
    isRecord(event.payload) &&
    event.payload['format'] === 'craft-debug-replay-snapshot'
  );
}

const IN_FLIGHT_OPERATION_KINDS = new Set(['http', 'async-process']);
const LOADING_STATUS = /(loading|pending|running|debouncing|refreshing)/i;

/**
 * What was still running just before the cut: requests with no answer yet are
 * traced back to the method calls that issued them, and primitives whose last
 * known status was loading are listed to be reloaded.
 */
function inFlightWork(
  events: readonly SendContextEvent[],
  warnings: string[],
): DebugInFlightWork {
  const finished = new Set(
    events.flatMap((event) =>
      IN_FLIGHT_OPERATION_KINDS.has(event.kind) &&
      (event.phase === 'succeeded' || event.phase === 'failed') &&
      event.operationId
        ? [event.operationId]
        : [],
    ),
  );
  const unanswered = events.filter(
    (event) =>
      IN_FLIGHT_OPERATION_KINDS.has(event.kind) &&
      event.phase === 'started' &&
      event.operationId !== undefined &&
      !finished.has(event.operationId),
  );
  // The call that issued a request is the last root call of its interaction
  // before it started: earlier calls of the same interaction are unrelated.
  const allRoots = rootInvocations(events);
  const issuers = new Map<number, (typeof allRoots)[number]>();
  const unexplained: SendContextEvent[] = [];
  for (const request of unanswered) {
    const issuer = allRoots
      .filter(
        (root) =>
          root.correlationId !== undefined &&
          root.correlationId === request.correlationId &&
          root.sequence < request.sequence,
      )
      .at(-1);
    if (issuer) issuers.set(issuer.sequence, issuer);
    else unexplained.push(request);
  }
  const invocations = [...issuers.values()]
    .sort((left, right) => left.sequence - right.sequence)
    .flatMap((event) => {
      const payload = isRecord(event.payload) ? event.payload : {};
      const invocation = isRecord(payload['replayInvocation'])
        ? payload['replayInvocation']
        : undefined;
      return typeof invocation?.['address'] === 'string' &&
        Array.isArray(invocation['args'])
        ? [
            {
              sequence: event.sequence,
              address: invocation['address'],
              args: invocation['args'],
            },
          ]
        : [];
    });

  const lastStatus = new Map<string, string | undefined>();
  for (const event of events) {
    if (
      event.kind !== 'primitive' ||
      event.name !== 'primitive-change' ||
      !isRecord(event.payload) ||
      typeof event.payload['address'] !== 'string'
    )
      continue;
    const status = event.payload['status'];
    lastStatus.set(
      event.payload['address'],
      typeof status === 'string' ? status : undefined,
    );
  }
  const reloads = [...lastStatus]
    .filter(([, status]) => status !== undefined && LOADING_STATUS.test(status))
    .map(([address]) => address);

  const unmatched = unexplained.length;
  if (unmatched > 0 && reloads.length === 0)
    warnings.push(
      `${unmatched} requête(s) en cours à cet instant n’ont pas pu être relancées : aucune méthode ni primitive enregistrée ne les explique.`,
    );
  return { invocations, reloads };
}

function routeOf(href: string, startUrl: string): string | undefined {
  try {
    const url = new URL(href, startUrl);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}

/**
 * Rebuilds the application state just before `beforeSequence` (the end of the
 * recording when omitted): the last checkpoint before it, or the initial
 * snapshot when there is none, then every primitive change recorded since.
 */
export function buildDebugAppSnapshot(
  session: SendContextReplayExport,
  beforeSequence?: number,
): DebugAppSnapshot {
  const warnings: string[] = [];
  const events = session.events
    .filter(
      (event) =>
        beforeSequence === undefined || event.sequence < beforeSequence,
    )
    .sort((left, right) => left.sequence - right.sequence);

  const checkpoint = events.filter(isReplayCheckpoint).at(-1);
  let primitives: Record<string, unknown> = {
    ...(checkpoint?.payload.primitives ?? session.initialSnapshot ?? {}),
  };
  const baseSequence = checkpoint?.sequence ?? -1;
  if (!checkpoint)
    warnings.push(
      session.initialSnapshot
        ? 'Aucun checkpoint avant cet événement : l’état part du snapshot initial et rejoue les changements enregistrés.'
        : 'Aucun checkpoint ni snapshot initial : seuls les changements enregistrés sont restaurés.',
    );

  let changes = 0;
  for (const event of events) {
    if (
      event.sequence <= baseSequence ||
      event.kind !== 'primitive' ||
      event.name !== 'primitive-change' ||
      !isRecord(event.state)
    )
      continue;
    primitives = { ...primitives, ...event.state };
    // JSON drops an undefined value: a change whose address is missing from
    // its state set the primitive back to undefined (a closed session).
    const changed = isRecord(event.payload) ? event.payload['address'] : undefined;
    if (typeof changed === 'string' && !Object.hasOwn(event.state, changed))
      primitives[changed] = undefined;
    changes += 1;
  }

  const lastNavigation = events
    .filter(
      (event) =>
        event.kind === 'navigation' &&
        event.phase === 'started' &&
        isRecord(event.payload) &&
        typeof event.payload['url'] === 'string' &&
        event.sequence > baseSequence,
    )
    .at(-1);
  const navigationUrl = isRecord(lastNavigation?.payload)
    ? (lastNavigation.payload['url'] as string)
    : undefined;
  let route =
    (navigationUrl && routeOf(navigationUrl, session.startUrl)) ??
    (checkpoint && routeOf(checkpoint.payload.route.url, session.startUrl)) ??
    routeOf(session.startUrl, session.startUrl) ??
    '/';
  if (/\[REDACTED\]/i.test(decodeURIComponentSafe(route))) {
    warnings.push(
      'La route enregistrée contient un paramètre secret masqué : elle est ouverte sans sa query.',
    );
    route = route.split(/[?#]/)[0] || '/';
  }

  const initialStorage = session.events.find(
    (event) => event.kind === 'storage' && event.name === 'initial-snapshot',
  )?.payload;
  const storage = checkpoint
    ? checkpoint.payload.storage
    : isRecord(initialStorage) && Array.isArray(initialStorage['entries'])
      ? (initialStorage['entries'] as SendContextReplaySnapshot['storage'])
      : [];

  const recordedStorage = browserStorageSnapshotBefore(
    session.events,
    beforeSequence,
  );
  const browserStorage = recordedStorage?.snapshot;
  if (recordedStorage?.source === 'initial')
    warnings.push(
      'Le stockage du navigateur (localStorage, cookies, IndexedDB) est celui du début de l’enregistrement : aucune recapture n’existe avant cet instant.',
    );

  if (changes === 0 && !checkpoint && !session.initialSnapshot)
    warnings.push('Aucun état de primitive n’a pu être reconstitué.');

  const inFlight = inFlightWork(events, warnings);

  return {
    format: DEBUG_APP_SNAPSHOT_FORMAT,
    version: 1,
    ...(beforeSequence === undefined ? {} : { beforeSequence }),
    route,
    primitives,
    storage,
    ...(checkpoint?.payload.pendingTasks
      ? { pendingTasks: checkpoint.payload.pendingTasks }
      : {}),
    ...(checkpoint?.payload.temporalNow === undefined
      ? {}
      : { temporalNow: checkpoint.payload.temporalNow }),
    ...(checkpoint?.payload.temporalDateNow === undefined
      ? {}
      : { temporalDateNow: checkpoint.payload.temporalDateNow }),
    ...(browserStorage ? { browserStorage } : {}),
    ...(inFlight.invocations.length || inFlight.reloads.length
      ? { inFlight }
      : {}),
    warnings,
  };
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isDebugAppSnapshot(value: unknown): value is DebugAppSnapshot {
  const pendingTasks = isRecord(value) ? value['pendingTasks'] : undefined;
  return (
    isRecord(value) &&
    value['format'] === DEBUG_APP_SNAPSHOT_FORMAT &&
    value['version'] === 1 &&
    typeof value['route'] === 'string' &&
    isRecord(value['primitives']) &&
    Array.isArray(value['storage']) &&
    Array.isArray(value['warnings']) &&
    (value['temporalNow'] === undefined ||
      (typeof value['temporalNow'] === 'number' &&
        Number.isFinite(value['temporalNow']))) &&
    (value['temporalDateNow'] === undefined ||
      (typeof value['temporalDateNow'] === 'number' &&
        Number.isFinite(value['temporalDateNow']))) &&
    (pendingTasks === undefined ||
      (Array.isArray(pendingTasks) &&
        pendingTasks.every(
          (task) =>
            isRecord(task) &&
            typeof task['kind'] === 'string' &&
            typeof task['dueAt'] === 'number' &&
            Number.isFinite(task['dueAt']) &&
            (task['owner'] === undefined ||
              typeof task['owner'] === 'string'),
        )))
  );
}
