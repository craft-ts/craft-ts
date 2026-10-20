import type {
  SendContextEvent,
  SendContextReplayExport,
  SendContextSessionParticipant,
} from '@craft-ts/core';

/**
 * What the replay knows about a recording, with no state and no browser: the
 * pure functions the engine and the view share. Everything they need arrives
 * as an argument, so they read the same in a test as in the page.
 */

/** The postMessage channel the replayed page's bridge speaks on. */
export const REPLAY_CHANNEL = 'craft-debug-replay';
/** Added to the replayed page's address so its bridge knows it is being driven. */
export const REPLAY_QUERY_MARKER = 'craft-debug-replay';

export type ReplayParticipantState =
  'visible' | 'hidden' | 'blurred' | 'closed' | 'interrupted';

/** A pending timer the replay can cancel; its clock is the Craft temporal runtime's. */
export type ReplayTimer = Readonly<{ cancel(): void }>;

export type ReplayViewport = Readonly<{ width: number; height: number }>;

export type ReplayDifference = Readonly<{
  eventId?: string;
  expected: unknown;
  actual: unknown;
  tolerances?: readonly Readonly<{
    assertionId: string;
    path: string;
    kind: 'ignore' | 'redacted' | 'number' | 'unordered' | 'url';
  }>[];
  transport?: Readonly<{
    transportId: string;
    instanceId: string;
    direction: 'outgoing';
    sequence: number;
    message?: string;
  }>;
  recovery?: Readonly<{ href?: string; state?: unknown }>;
  skip?: Readonly<{ checkpointEventId: string; index: number }>;
}>;

export type PartialReplay = Readonly<{
  from: number;
  to: number;
  checkpointEventId: string;
}>;

/** One tab's slice of the recording, ready to be replayed in its own frame. */
export type ReplaySlice = Readonly<{
  participantId: string;
  session: SendContextReplayExport;
  timelineOriginMs?: number;
}>;

export type ReplayStartMode = 'url' | 'snapshot';

export type ReplayFrameConnection = {
  readonly participantId: string;
  readonly replayRunId: string;
  href: string;
  nonce: string;
  connected: boolean;
  started: boolean;
  status: string;
  resumeIndex: number;
  session: SendContextReplayExport;
  startMode: ReplayStartMode;
  timelineOriginMs?: number;
  startOffsetMs: number;
  pendingStep?: boolean;
};

export type VisibilityChange = Readonly<{
  participantId: string;
  state: ReplayParticipantState;
  time: number;
}>;

/** What a replayed page's `alert`, `confirm` or `prompt` shows in its frame. */
export type ReplayDialogView = Readonly<{
  title: string;
  message: string;
  result: string;
  durationMs: number;
}>;

export type LocalTarget =
  Readonly<{ ok: true; url: URL }> | Readonly<{ ok: false; error: string }>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function smallest(values: readonly number[]): number {
  return values.reduce((minimum, value) => Math.min(minimum, value), Infinity);
}

/** The dashboard only drives applications running on this machine. */
export function parseLocalTarget(value: string): LocalTarget {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return { ok: false, error: 'Utilise une URL HTTP ou HTTPS.' };
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      return {
        ok: false,
        error: 'Le dashboard ne pilote que des applications locales.',
      };
    return { ok: true, url };
  } catch {
    return { ok: false, error: 'URL de l’application cible invalide.' };
  }
}

/**
 * What deserves a look in a recording: a request, a navigation or a primitive
 * that failed. The slow tasks the browser reported are marked in the full
 * journal; everything else (clicks, scrolls, heartbeats) is the recording
 * itself and stays out of the way.
 */
export function eventSeverity(
  event: SendContextEvent,
): 'error' | 'slow' | undefined {
  if (event.phase === 'failed') return 'error';
  if (
    event.kind === 'performance' &&
    (event.name === 'browser.longtask' || event.name === 'browser.slow-event')
  )
    return 'slow';
  return undefined;
}

export function eventDiagnosticLabel(event: SendContextEvent): string {
  const name = event.name ?? 'nom non disponible';
  if (event.kind === 'route-load' && isRecord(event.payload)) {
    const payload = event.payload;
    const outcome = payload['outcome'];
    return `Chargement route · ${String(payload['routePath'] ?? name)} · ${String(outcome ?? event.phase)}`;
  }
  if (event.kind === 'gesture' && isRecord(event.payload)) {
    const trigger =
      event.payload['trigger'] ??
      (name.startsWith('gesture:') ? name.slice('gesture:'.length) : undefined);
    if (trigger === 'longPress') return 'Appui long';
    if (trigger === 'drop') return 'Dépôt';
    if (trigger === 'dragCancel') return 'Glissement annulé';
    if (trigger === 'swipe') return 'Balayage';
    return `Geste · ${String(trigger ?? name)}`;
  }
  if (event.kind !== 'performance' || !isRecord(event.payload)) return name;
  const payload = event.payload;
  const durationMs = payload['durationMs'];
  if (typeof durationMs === 'number') {
    const duration = `${durationMs.toFixed(0)} ms`;
    if (event.name === 'browser.slow-event') {
      const input = Number(payload['inputDelayMs'] ?? 0).toFixed(0);
      const processing = Number(payload['processingMs'] ?? 0).toFixed(0);
      const presentation = Number(payload['presentationDelayMs'] ?? 0).toFixed(
        0,
      );
      return `${name} · ${String(payload['eventType'] ?? 'event')} · ${duration} (entrée ${input} / traitement ${processing} / affichage ${presentation} ms)`;
    }
    if (event.name === 'browser.longtask') return `${name} · ${duration}`;
  }
  if (event.name === 'browser.heartbeat') {
    const delay = Number(payload['timerDelayMs'] ?? 0).toFixed(0);
    return `${name} · retard ${delay} ms · ${String(payload['visibilityState'] ?? 'visibilité inconnue')}`;
  }
  return name;
}

/** Older recordings assigned a new participant id after a Clear Cache reload. */
export function participantContinuations(
  participants: readonly SendContextSessionParticipant[],
  events: readonly SendContextEvent[],
): ReadonlyMap<string, string> {
  const ordered = [...participants].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
  const continuations = new Map<string, string>();
  ordered.forEach((next, index) => {
    if (index === 0) return;
    let nextStart: URL;
    try {
      nextStart = new URL(next.startUrl);
    } catch {
      return;
    }
    const candidates = ordered.slice(0, index).filter((previous) => {
      if (previous.status !== 'completed') return false;
      const gapMs = Date.parse(next.createdAt) - Date.parse(previous.updatedAt);
      if (!Number.isFinite(gapMs) || gapMs < 0 || gapMs > 2_000) return false;
      const previousEvents = events.filter(
        (event) => event.participantId === previous.id,
      );
      const clearCacheAction = [...previousEvents]
        .reverse()
        .find(
          (event) =>
            event.kind === 'dom' &&
            event.phase === 'emitted' &&
            isRecord(event.payload) &&
            event.payload['action'] === 'click' &&
            ((event.name ?? '').toLowerCase().includes('clearcache') ||
              String(event.payload['selector'] ?? '').includes('clearCache')),
        );
      if (!clearCacheAction) return false;
      const actionAgeMs =
        Date.parse(previous.updatedAt) - clearCacheAction.timestamp;
      if (
        !Number.isFinite(actionAgeMs) ||
        actionAgeMs < 0 ||
        actionAgeMs > 3_000
      )
        return false;
      const lastRouteEvent = [...previousEvents]
        .reverse()
        .find(
          (event) =>
            event.kind === 'navigation' &&
            event.phase === 'started' &&
            event.name === 'NavigationEnd' &&
            isRecord(event.payload),
        );
      const route = isRecord(lastRouteEvent?.payload)
        ? lastRouteEvent.payload['url']
        : undefined;
      if (typeof route !== 'string') return false;
      try {
        return (
          new URL(route, previous.startUrl).pathname === nextStart.pathname
        );
      } catch {
        return false;
      }
    });
    const [only] = candidates;
    if (candidates.length === 1 && only) continuations.set(next.id, only.id);
  });
  return continuations;
}

/** The tab itself and every tab that continues it. */
export function participantGroup(
  rootId: string,
  continuations: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  return new Set([
    rootId,
    ...[...continuations].flatMap(([id, root]) =>
      root === rootId ? [id] : [],
    ),
  ]);
}

function hasCompleteRetainedParticipantHistory(
  imported: SendContextReplayExport,
  participantEvents: readonly SendContextEvent[],
  participantClips: readonly unknown[],
): boolean {
  if (!imported.truncated) return true;
  if (
    participantClips.some(
      (clip) => isRecord(clip) && clip['truncated'] === true,
    )
  )
    return false;
  const sequences = participantEvents
    .map((event) => event.participantSequence)
    .filter((sequence): sequence is number => Number.isSafeInteger(sequence));
  return sequences.length > 0 && smallest(sequences) === 1;
}

/** The recording as one tab saw it: its events, clips, start page and viewport. */
export function participantSession(
  imported: SendContextReplayExport,
  participants: readonly SendContextSessionParticipant[],
  participantId: string,
  continuations: ReadonlyMap<string, string>,
): SendContextReplayExport {
  if (participantId === 'default' || participants.length === 0) return imported;
  const participant = participants.find((item) => item.id === participantId);
  if (!participant) return imported;
  const group = participantGroup(participantId, continuations);
  const participantEvents = imported.events.filter(
    (event) =>
      (event.participantId && group.has(event.participantId)) ||
      (participants.length === 1 && event.participantId === undefined),
  );
  const participantClips = imported.clips.filter(
    (clip) =>
      isRecord(clip) &&
      typeof clip['participantId'] === 'string' &&
      group.has(clip['participantId']),
  );
  const participantHistoryComplete = hasCompleteRetainedParticipantHistory(
    imported,
    participantEvents,
    participantClips,
  );
  const { initialSnapshot: _initialSnapshot, ...base } = imported;
  return {
    ...base,
    truncated: imported.truncated && !participantHistoryComplete,
    startUrl: participant.startUrl,
    ...(participant.viewport ? { viewport: participant.viewport } : {}),
    ...(participant.initialSnapshot
      ? { initialSnapshot: participant.initialSnapshot }
      : {}),
    events: participantEvents,
    clips: participantClips,
  };
}

/**
 * Every tab replays against the same clock. When the recording has no global
 * timeline, each event is placed by its own timestamp relative to the first.
 */
export function alignSharedTimeline(
  slices: readonly ReplaySlice[],
): readonly ReplaySlice[] {
  const allEvents = slices.flatMap((item) => item.session.events);
  const hasGlobalTimeline = allEvents.every(
    (event) => typeof event.globalElapsedMs === 'number',
  );
  const firstTimestamp = allEvents.length
    ? allEvents.reduce(
        (minimum, event) => Math.min(minimum, event.timestamp),
        Infinity,
      )
    : 0;
  const timelineOrigin = hasGlobalTimeline
    ? allEvents.reduce(
        (minimum, event) => Math.min(minimum, event.globalElapsedMs ?? minimum),
        allEvents.length ? Infinity : 0,
      )
    : 0;
  return slices.map((item): ReplaySlice => ({
    ...item,
    session: {
      ...item.session,
      events: item.session.events.map((event) => ({
        ...event,
        globalElapsedMs: hasGlobalTimeline
          ? event.globalElapsedMs
          : event.timestamp - firstTimestamp,
      })),
    },
    timelineOriginMs: timelineOrigin,
  }));
}

/** What the recording says about when its tabs were created. */
export type RecordingClock = Readonly<{
  events: readonly SendContextEvent[];
  participants: readonly SendContextSessionParticipant[];
  /** When the archive was created, if the recording came from the archive. */
  archiveCreatedAtMs: number | undefined;
}>;

function createdAtOrigin(clock: RecordingClock): number {
  return smallest(
    clock.participants
      .map((participant) => Date.parse(participant.createdAt))
      .filter(Number.isFinite),
  );
}

function archiveOrigin(clock: RecordingClock): number {
  const archived = clock.archiveCreatedAtMs;
  return archived !== undefined && Number.isFinite(archived)
    ? archived
    : createdAtOrigin(clock);
}

/** When a tab joined the shared timeline, in milliseconds from its start. */
export function participantStartAtMs(
  participantId: string,
  replaySession: SendContextReplayExport,
  clock: RecordingClock,
): number {
  const initialStateEvents = replaySession.events.filter((event) => {
    if (event.kind !== 'participant' || event.name !== 'state') return false;
    const payload = isRecord(event.payload) ? event.payload : {};
    return payload['initial'] === true;
  });
  const initialStateTimes = initialStateEvents
    .map((event) => event.globalElapsedMs)
    .filter((value): value is number => typeof value === 'number');
  if (initialStateTimes.length) return smallest(initialStateTimes);
  if (initialStateEvents.length) {
    const firstSessionTimestamp = smallest(
      clock.events.map((event) => event.timestamp),
    );
    const firstParticipantTimestamp = smallest(
      initialStateEvents.map((event) => event.timestamp),
    );
    if (Number.isFinite(firstSessionTimestamp))
      return Math.max(0, firstParticipantTimestamp - firstSessionTimestamp);
  }

  const participant = clock.participants.find(
    (item) => item.id === participantId,
  );
  const participantCreatedAt = participant
    ? Date.parse(participant.createdAt)
    : Number.NaN;
  if (Number.isFinite(participantCreatedAt)) {
    const baseline = archiveOrigin(clock);
    if (Number.isFinite(baseline))
      return Math.max(0, participantCreatedAt - baseline);
  }

  const firstAction = smallest(
    replaySession.events
      .filter(
        (event) =>
          (event.kind === 'defer' && event.phase === 'started') ||
          (event.phase === 'emitted' &&
            (event.kind === 'dom' ||
              event.kind === 'gesture' ||
              event.kind === 'hover' ||
              event.kind === 'scroll' ||
              event.kind === 'viewport')),
      )
      .map((event) => event.globalElapsedMs)
      .filter((value): value is number => typeof value === 'number'),
  );
  return Number.isFinite(firstAction) ? firstAction : 0;
}

export function replaySessionStartAtMs(
  slices: readonly ReplaySlice[],
  clock: RecordingClock,
): number {
  return smallest(
    slices.map((item) =>
      participantStartAtMs(item.participantId, item.session, clock),
    ),
  );
}

/** How a tab ended, when the archive says it did. */
export function terminalStateOf(
  participant: SendContextSessionParticipant,
): ReplayParticipantState | undefined {
  if (participant.status === 'completed') return 'closed';
  if (participant.status === 'interrupted') return 'interrupted';
  return undefined;
}

function recordedVisibility(
  value: unknown,
): 'visible' | 'hidden' | 'blurred' | undefined {
  return value === 'visible' || value === 'hidden' || value === 'blurred'
    ? value
    : undefined;
}

/**
 * When each tab was shown, hidden or closed, in the order it happened: what the
 * replay answers with the dim veil and the "active" badge.
 */
export function visibilityTimeline(
  slices: readonly ReplaySlice[],
  clock: RecordingClock,
  participantIds: readonly string[],
  continuations: ReadonlyMap<string, string>,
): VisibilityChange[] {
  const sessionStartMs = archiveOrigin(clock);
  const recorded = slices.flatMap(({ participantId, session: replaySession }) =>
    replaySession.events.flatMap((event): VisibilityChange[] => {
      if (event.kind !== 'participant' || event.name !== 'state') return [];
      const payload = isRecord(event.payload) ? event.payload : {};
      const state = recordedVisibility(payload['state']);
      const time = event.globalElapsedMs;
      if (state === undefined || typeof time !== 'number') return [];
      return [{ participantId, state, time }];
    }),
  );
  const continued = new Set(continuations.values());
  const terminal = clock.participants.flatMap((participant) => {
    if (!participantIds.includes(participant.id)) return [];
    if (continued.has(participant.id)) return [];
    const state = terminalStateOf(participant);
    const updatedAt = Date.parse(participant.updatedAt);
    if (
      !state ||
      !Number.isFinite(sessionStartMs) ||
      !Number.isFinite(updatedAt)
    )
      return [];
    return [
      {
        participantId: participant.id,
        state,
        time: Math.max(0, updatedAt - sessionStartMs),
      },
    ];
  });
  return [...recorded, ...terminal].sort(
    (left, right) => left.time - right.time,
  );
}

/** A replayed page's `alert`, `confirm` or `prompt`, as the frame shows it. */
export function describeReplayDialog(
  value: unknown,
): ReplayDialogView | undefined {
  if (!isRecord(value)) return undefined;
  const method =
    value['method'] === 'alert' ||
    value['method'] === 'confirm' ||
    value['method'] === 'prompt'
      ? value['method']
      : 'alert';
  const answer = value['result'];
  const recorded = value['recorded'] === true;
  let result = 'Dialogue non présent dans cet enregistrement';
  if (recorded) {
    if (method === 'confirm')
      result =
        answer === true
          ? 'Réponse enregistrée : OK'
          : 'Réponse enregistrée : Annuler';
    else if (method === 'prompt')
      result =
        typeof answer === 'string'
          ? `Réponse enregistrée : ${answer}`
          : answer === null
            ? 'Réponse enregistrée : Annuler'
            : 'Valeur saisie non enregistrée';
    else result = 'Dialogue enregistré';
  }
  const duration = finiteNumber(value['durationMs']);
  return {
    title:
      method === 'alert'
        ? 'Alerte navigateur'
        : method === 'confirm'
          ? 'Confirmation navigateur'
          : 'Saisie navigateur',
    message:
      typeof value['message'] === 'string'
        ? value['message']
        : 'Dialogue sans message',
    result,
    durationMs:
      duration === undefined ? 0 : Math.max(0, Math.min(duration, 60_000)),
  };
}

/**
 * The first place the replay left the recording, as the replayed page reports
 * it. The message crosses a window boundary, so every field is checked here.
 */
export function parseReplayDifference(
  value: unknown,
): ReplayDifference | undefined {
  if (!isRecord(value)) return undefined;
  const recovery = value['recovery'];
  const skip = value['skip'];
  const eventId = value['eventId'];
  const transport = value['transport'];
  const rawTolerances = value['tolerances'];
  const href = isRecord(recovery) ? recovery['href'] : undefined;
  const checkpointEventId = isRecord(skip)
    ? skip['checkpointEventId']
    : undefined;
  const index = isRecord(skip) ? skip['index'] : undefined;
  const transportDetail =
    isRecord(transport) &&
    typeof transport['transportId'] === 'string' &&
    typeof transport['instanceId'] === 'string' &&
    transport['direction'] === 'outgoing' &&
    Number.isSafeInteger(transport['sequence'])
      ? {
          transportId: transport['transportId'],
          instanceId: transport['instanceId'],
          direction: 'outgoing' as const,
          sequence: transport['sequence'] as number,
          ...(typeof transport['message'] === 'string'
            ? { message: transport['message'] }
            : {}),
        }
      : undefined;
  return {
    ...(typeof eventId === 'string' ? { eventId } : {}),
    expected: value['expected'],
    actual: 'actual' in value ? value['actual'] : value['observed'],
    ...(Array.isArray(rawTolerances)
      ? {
          tolerances: rawTolerances.flatMap((item) => {
            if (
              !isRecord(item) ||
              typeof item['assertionId'] !== 'string' ||
              typeof item['path'] !== 'string' ||
              !['ignore', 'redacted', 'number', 'unordered', 'url'].includes(
                String(item['kind']),
              )
            )
              return [];
            return [
              {
                assertionId: item['assertionId'],
                path: item['path'],
                kind: item['kind'] as NonNullable<
                  ReplayDifference['tolerances']
                >[number]['kind'],
              },
            ];
          }),
        }
      : {}),
    ...(transportDetail ? { transport: transportDetail } : {}),
    ...(isRecord(recovery)
      ? {
          recovery: {
            ...(typeof href === 'string' ? { href } : {}),
            ...('state' in recovery ? { state: recovery['state'] } : {}),
          },
        }
      : {}),
    ...(typeof checkpointEventId === 'string' && typeof index === 'number'
      ? { skip: { checkpointEventId, index } }
      : {}),
  };
}

/** A viewport the replayed page reports, when it is a plausible one. */
export function parseViewport(
  width: unknown,
  height: unknown,
): ReplayViewport | undefined {
  const plausible = (side: unknown): side is number =>
    typeof side === 'number' &&
    Number.isSafeInteger(side) &&
    side >= 1 &&
    side <= 16_384;
  return plausible(width) && plausible(height) ? { width, height } : undefined;
}

export function participantOptionLabel(
  participant: SendContextSessionParticipant,
): string {
  const activity =
    participant.status === 'completed'
      ? 'fermé'
      : participant.status === 'interrupted'
        ? 'interrompu'
        : participant.state === 'hidden'
          ? 'masqué'
          : participant.state === 'blurred'
            ? 'inactif'
            : 'visible';
  let path = participant.startUrl;
  try {
    path = new URL(participant.startUrl).pathname;
  } catch {
    // The original URL remains useful context for malformed legacy metadata.
  }
  return `${participant.title} · ${path} · ${activity}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const replayStateLabels: Readonly<Record<string, string>> = {
  idle: 'en attente',
  preparing: 'préparation…',
  ready: 'prêt',
  playing: 'lecture',
  paused: 'en pause',
  completed: 'terminé',
  error: 'interrompu',
};

/** What comes next in the replay, in a few words. */
export function nextActionLabel(next: SendContextEvent | undefined): string {
  if (!next) return 'Aucune étape restante';
  if (next.kind === 'defer')
    return `Ensuite · chargement différé ${next.name ?? ''}`.trim();
  if (next.kind === 'gesture') {
    const payload = isRecord(next.payload) ? next.payload : {};
    const trigger =
      payload['trigger'] ??
      (next.name?.startsWith('gesture:')
        ? next.name.slice('gesture:'.length)
        : undefined);
    if (trigger === 'longPress') return 'Ensuite · Appui long';
    if (trigger === 'drop') return 'Ensuite · Dépôt';
    if (trigger === 'dragCancel') return 'Ensuite · glissement annulé';
    if (trigger === 'swipe') return 'Ensuite · Balayage';
    return `Ensuite · Geste ${String(trigger ?? next.name ?? '')}`.trim();
  }
  if (next.kind === 'hover') {
    const payload = isRecord(next.payload) ? next.payload : {};
    return `Ensuite · survol ${String(payload['action'] ?? '')} ${String(payload['selector'] ?? '')}`.trim();
  }
  if (next.kind === 'scroll')
    return `Ensuite · défilement ${next.name ?? ''}`.trim();
  if (next.kind === 'viewport') {
    const viewport = isRecord(next.payload) ? next.payload : {};
    return `Ensuite · viewport ${String(viewport['width'] ?? '?')} × ${String(viewport['height'] ?? '?')} px`;
  }
  return `Ensuite · ${next.name ?? 'nom non disponible'}`;
}

export function countdownLabel(remainingMs: number | undefined): string {
  if (remainingMs === undefined) return 'synchronisation…';
  if (remainingMs <= 0) return 'maintenant';
  return `dans ${(remainingMs / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** A duration read as a clock: 1:05, or 1:02:05 past the hour. */
export function clockLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}
