import {
  button,
  content,
  craftComponent,
  details,
  div,
  type CraftNodeChild,
  forNode,
  heading,
  input,
  li,
  option,
  p,
  pre,
  section,
  select,
  span,
  summary,
  textarea,
  ul,
} from '@craft-ts/component';
import {
  ɵcomputed as computed,
  craftSignal as signal,
  type SendContextEvent,
  type SendContextEnvironmentProfile,
  type SendContextReplayExport,
  type SendContextSessionParticipant,
} from '@craft-ts/core';
import {
  validateDebugSessionExport,
  getReplaySteps,
} from '@craft-ts/component';
import {
  captureDebugSessionEnvironment,
  environmentDifferences,
} from '@craft-ts/component';
import {
  DocBadge,
  DocCallout,
  DocDialog,
  DocLogo,
  DocModeToggle,
  DocSeasonPicker,
  DocSwitch,
  DocTabs,
  provideDocModeView,
  provideDocSeasonView,
} from '@craft-ts/ui';
import { assign, num, unit } from '@craft-ts/style';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import {
  frameVars,
  markerVars,
  progressVars,
  ui,
  viewportVars,
} from './dashboard.style';

type TypedVars = Readonly<Record<`--${string}`, string>>;

/**
 * The replay draws its frames with the DOM API, outside any template, so there
 * is no `style:` binding to carry a variable. This is the one place a typed
 * custom property is written onto an element: the value always comes from
 * `assign(token, …)` and the sheet reads the variable. Never a raw property.
 */
function writeVars(element: HTMLElement, vars: TypedVars): void {
  for (const [name, value] of Object.entries(vars))
    element.style.setProperty(name, value);
}

function clearVars(
  element: HTMLElement,
  ...tokens: readonly { readonly declaration: { readonly name: string } }[]
): void {
  for (const token of tokens)
    element.style.removeProperty(token.declaration.name);
}

const CHANNEL = 'craft-debug-replay';
const REPLAY_QUERY_MARKER = 'craft-debug-replay';
const SESSION_ARCHIVE_URL =
  import.meta.env['VITE_CRAFT_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';
type SessionSummary = Readonly<{
  id: string;
  startUrl: string;
  createdAt: string;
  updatedAt: string;
  status: 'recording' | 'completed' | 'interrupted';
  version: 2;
  eventCount: number;
  truncated: boolean;
  participantCount?: number;
}>;
const sessionText = signal('');
const session = signal<SendContextReplayExport | undefined>(undefined);
const events = signal<readonly SendContextEvent[]>([]);
const sessionParticipants = signal<readonly SendContextSessionParticipant[]>(
  [],
);
const replayableParticipants = computed(() => {
  const continuations = replayParticipantContinuations();
  return sessionParticipants().filter(
    (participant) => !continuations.has(participant.id),
  );
});
const currentEnvironment = captureDebugSessionEnvironment();
const environmentWarning = computed(() => {
  const profiles = sessionParticipants()
    .map((participant) => participant.environment)
    .filter((profile): profile is SendContextEnvironmentProfile =>
      Boolean(profile),
    );
  const differences = [
    ...new Set(
      profiles.flatMap((profile) =>
        environmentDifferences(profile, currentEnvironment),
      ),
    ),
  ];
  return differences.length
    ? `Environnement différent de l’enregistrement : ${differences.join(', ')}. Le user-agent n’est pas simulé et l’iframe utilise le navigateur actuel ; le schéma clair/sombre enregistré est appliqué quand il est disponible.`
    : '';
});
const selectedParticipantId = signal('all');
const savedSessions = signal<readonly SessionSummary[]>([]);
const pendingDeleteSessionId = signal<string | undefined>(undefined);
const archiveStatus = signal('Connexion au serveur de sessions…');
const archiveReachable = signal(true);
const loadError = signal<string | undefined>(undefined);
const importOpen = signal(false);
const sidePanelOpen = signal(false);
const showAllEvents = signal(false);
const page = signal<'sessions' | 'detail'>('sessions');
const targetUrl = signal(
  import.meta.env['VITE_CRAFT_REPLAY_TARGET_URL'] ?? 'http://localhost:4200/',
);
const startMode = signal<'url' | 'snapshot'>('url');
const status = signal('Importe une session v1 ou v2 pour commencer.');
const connected = signal(false);
const difference = signal<
  | Readonly<{
      eventId?: string;
      expected: unknown;
      actual: unknown;
      recovery?: Readonly<{ href?: string; state?: unknown }>;
      skip?: Readonly<{ checkpointEventId: string; index: number }>;
    }>
  | undefined
>(undefined);
const hasDifference = computed(() => difference() !== undefined);
const canForceRecovery = computed(() => difference()?.recovery !== undefined);
const canSkipDifference = computed(() => difference()?.skip !== undefined);
const partialReplay = signal<
  Readonly<{ from: number; to: number; checkpointEventId: string }> | undefined
>(undefined);
const replayIndex = signal(0);
const eventTimelinePage = signal(0);
const eventTimelinePageSize = 250;
const replayState = signal('idle');
const replayWarnings = signal<readonly string[]>([]);
const replaySkeletonVisible = signal(false);
const activeReplayParticipantId = signal<string | undefined>(undefined);
const replayViewportScale = signal(1);
const replayViewport = signal<
  Readonly<{ width: number; height: number }> | undefined
>(undefined);
const nextActionDelayMs = signal<number | undefined>(undefined);
const visibleEvents = computed(() => {
  const selected = selectedParticipantId();
  if (selected === 'all') {
    const participants = sessionParticipants();
    if (participants.length <= 1) return events();
    const replayableIds = new Set(
      participants
        .filter((participant) => Boolean(sessionForParticipant(participant.id)))
        .map((participant) => participant.id),
    );
    return events()
      .filter(
        (event) =>
          event.participantId && replayableIds.has(event.participantId),
      )
      .sort(
        (left, right) =>
          (left.globalElapsedMs ?? left.timestamp) -
          (right.globalElapsedMs ?? right.timestamp),
      );
  }
  const rootId = replayParticipantContinuations().get(selected) ?? selected;
  const groupedIds = new Set([
    rootId,
    ...[...replayParticipantContinuations()].flatMap(([id, root]) =>
      root === rootId ? [id] : [],
    ),
  ]);
  return events().filter(
    (event) => event.participantId && groupedIds.has(event.participantId),
  );
});
/**
 * What deserves a look in a recording: a request, a navigation or a primitive
 * that failed. The slow tasks the browser reported are marked in the full
 * journal; everything else (clicks, scrolls, heartbeats) is the recording
 * itself and stays out of the way.
 */
function eventSeverity(event: SendContextEvent): 'error' | 'slow' | undefined {
  if (event.phase === 'failed') return 'error';
  if (
    event.kind === 'performance' &&
    (event.name === 'browser.longtask' || event.name === 'browser.slow-event')
  )
    return 'slow';
  return undefined;
}
// Slow tasks are context, not a verdict: they appear under "Tout afficher",
// marked, but they neither fill the default journal nor raise the badge.
const problemEvents = computed(() =>
  visibleEvents().filter((event) => eventSeverity(event) === 'error'),
);
const errorCount = computed(() => problemEvents().length);
const journalEvents = computed(() =>
  showAllEvents() ? visibleEvents() : problemEvents(),
);
const visibleEventPage = computed(() => {
  const start = eventTimelinePage() * eventTimelinePageSize;
  return journalEvents().slice(start, start + eventTimelinePageSize);
});
const eventTimelinePageCount = computed(() =>
  Math.max(1, Math.ceil(journalEvents().length / eventTimelinePageSize)),
);
const replayableEvents = computed(() => getReplaySteps(visibleEvents()));
const activeReplayEventId = computed(
  () => replayableEvents()[Math.max(0, replayIndex() - 1)]?.id,
);
type ReplayFrameConnection = {
  readonly participantId: string;
  readonly replayRunId: string;
  href: string;
  nonce: string;
  connected: boolean;
  started: boolean;
  status: string;
  resumeIndex: number;
  session: SendContextReplayExport;
  startMode: 'url' | 'snapshot';
  timelineOriginMs?: number;
  startOffsetMs: number;
  pendingStep?: boolean;
};
const replayFrameConnections = new Map<string, ReplayFrameConnection>();
const replayViewports = new Map<
  string,
  Readonly<{ width: number; height: number }>
>();
const replayScales = new Map<string, number>();
const completedReplayEventIds = new Set<string>();
const handshakeTimers = new Map<string, number>();
const replayDialogTimers = new Map<string, number>();
let listenerInstalled = false;
let hashListenerInstalled = false;
let archiveRefreshTimer: ReturnType<typeof setInterval> | undefined;
let loadedArchiveSessionId: string | undefined;
let replayStageObserver: ResizeObserver | undefined;
let replaySkeletonTimer: number | undefined;
let nextActionCountdownTimer: number | undefined;
let differenceParticipantId: string | undefined;
let replayVisibilityTimer: number | undefined;
let replayClockStartedAt: number | undefined;
let replayClockElapsedMs = 0;
let replayPlaybackRequested = false;
let loadedArchiveCreatedAtMs: number | undefined;
type ReplayParticipantState =
  | 'visible'
  | 'hidden'
  | 'blurred'
  | 'closed'
  | 'interrupted';
let replayVisibilityTimeline: Array<{
  participantId: string;
  state: ReplayParticipantState;
  time: number;
}> = [];
let replayVisibilityCursor = 0;
let replayVisibilityOriginMs = 0;
let replayVisibilityParticipantIds: readonly string[] = [];
let replayRecordedActiveParticipantId: string | undefined;
let replayActionParticipantId: string | undefined;
const replayParticipantStates = new Map<
  string,
  Readonly<{ state: ReplayParticipantState; time: number }>
>();

function beginReplayLoadingIndicator(): void {
  if (replaySkeletonVisible() || replaySkeletonTimer !== undefined) return;
  replaySkeletonVisible.set(false);
  replaySkeletonTimer = window.setTimeout(() => {
    replaySkeletonVisible.set(true);
    replaySkeletonTimer = undefined;
  }, 300);
}

function endReplayLoadingIndicator(): void {
  if (replaySkeletonTimer !== undefined) {
    window.clearTimeout(replaySkeletonTimer);
    replaySkeletonTimer = undefined;
  }
  replaySkeletonVisible.set(false);
}

function scheduleReplayPreparation(): void {
  window.setTimeout(() => {
    if (canReplaySelectedSession()) startReplay();
    else endReplayLoadingIndicator();
  }, 0);
}

function setNextActionCountdown(delayMs: number | undefined): void {
  if (nextActionCountdownTimer !== undefined) {
    window.clearInterval(nextActionCountdownTimer);
    nextActionCountdownTimer = undefined;
  }
  if (delayMs === undefined || !Number.isFinite(delayMs)) {
    nextActionDelayMs.set(undefined);
    return;
  }

  const duration = Math.max(0, delayMs);
  const startedAt = performance.now();
  nextActionDelayMs.set(duration);
  if (duration === 0) return;
  nextActionCountdownTimer = window.setInterval(() => {
    const remaining = Math.max(0, duration - (performance.now() - startedAt));
    nextActionDelayMs.set(remaining);
    if (remaining === 0 && nextActionCountdownTimer !== undefined) {
      window.clearInterval(nextActionCountdownTimer);
      nextActionCountdownTimer = undefined;
    }
  }, 100);
}

function nextActionTimingLabel(): string {
  if (replayState() === 'playing') {
    const remaining = nextActionDelayMs();
    if (remaining === undefined) return 'synchronisation…';
    if (remaining <= 0) return 'maintenant';
    return `dans ${(remaining / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  }
  return '';
}

function updateReplayViewport(): void {
  const stage = document.getElementById('replay-stage');
  if (!stage) return;
  let primaryScale = 1;
  for (const participantId of replayParticipantIds()) {
    const frame = replayFrameFor(participantId);
    const viewportFrame = document.getElementById(
      replayFrameWrapperId(participantId),
    );
    const card = document.getElementById(replayFrameCardId(participantId));
    if (!frame || !viewportFrame || !card) continue;
    const viewport =
      replayViewports.get(participantId) ??
      sessionForParticipant(participantId)?.viewport ??
      session()?.viewport;
    if (!viewport) {
      clearVars(viewportFrame, viewportVars.width, viewportVars.height);
      clearVars(
        frame,
        frameVars.width,
        frameVars.height,
        frameVars.scale,
        frameVars.shiftX,
        frameVars.shiftY,
      );
      continue;
    }

    const availableWidth = card.clientWidth;
    // What the tile and the grid keep for themselves around the page: the
    // title, the address, the gaps and the padding.
    const grid = document.getElementById('replay-frame-grid');
    const gridStyle = grid ? getComputedStyle(grid) : undefined;
    const gridPadding = gridStyle
      ? Number.parseFloat(gridStyle.paddingTop) +
        Number.parseFloat(gridStyle.paddingBottom)
      : 0;
    const tileChrome = Math.max(
      0,
      card.offsetHeight - viewportFrame.offsetHeight,
    );
    const availableHeight = Math.max(
      180,
      stage.clientHeight - gridPadding - tileChrome,
    );
    if (availableWidth < 1 || availableHeight < 1) continue;
    const scale = Math.min(
      1,
      availableWidth / viewport.width,
      availableHeight / viewport.height,
    );
    writeVars(viewportFrame, {
      ...assign(viewportVars.width, unit.px(viewport.width * scale)),
      ...assign(viewportVars.height, unit.px(viewport.height * scale)),
    });
    // The page is scaled around its centre; the shift puts its corner back.
    writeVars(frame, {
      ...assign(frameVars.width, unit.px(viewport.width)),
      ...assign(frameVars.height, unit.px(viewport.height)),
      ...assign(frameVars.scale, num(scale)),
      ...assign(frameVars.shiftX, unit.px((-viewport.width * (1 - scale)) / 2)),
      ...assign(
        frameVars.shiftY,
        unit.px((-viewport.height * (1 - scale)) / 2),
      ),
    });
    replayScales.set(participantId, scale);
    if (participantId === selectedParticipantId() || primaryScale === 1)
      primaryScale = scale;
  }
  replayViewportScale.set(primaryScale);
}

function observeReplayStage(): void {
  const stage = document.getElementById('replay-stage');
  if (!stage || typeof ResizeObserver === 'undefined') {
    updateReplayViewport();
    return;
  }
  replayStageObserver?.disconnect();
  replayStageObserver = new ResizeObserver(updateReplayViewport);
  replayStageObserver.observe(stage);
  updateReplayViewport();
}

function sessionRoute(id: string): string {
  return `#/sessions/${encodeURIComponent(id)}`;
}

function routeSessionId(): string | undefined {
  const match = /^#\/sessions\/([^/]+)$/.exec(window.location.hash);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
}

function handleHashChange(): void {
  const id = routeSessionId();
  const isImportedSessionRoute = window.location.hash === '#/import';
  const wasDetailPage = page() === 'detail';
  page.set(id || isImportedSessionRoute ? 'detail' : 'sessions');
  if (id && id !== loadedArchiveSessionId) void loadSavedSession(id);
  if (!id && !isImportedSessionRoute) {
    endReplayLoadingIndicator();
    if (wasDetailPage) {
      send('stop');
      replayPlaybackRequested = false;
      for (const timer of handshakeTimers.values()) window.clearTimeout(timer);
      handshakeTimers.clear();
      replayFrameConnections.clear();
      setNextActionCountdown(undefined);
      connected.set(false);
      replayState.set('idle');
    }
    loadedArchiveSessionId = undefined;
  }
}

async function refreshSavedSessions(): Promise<void> {
  try {
    const response = await fetch(`${SESSION_ARCHIVE_URL}/sessions`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = (await response.json()) as {
      sessions?: readonly SessionSummary[];
    };
    savedSessions.set(result.sessions ?? []);
    archiveReachable.set(true);
    archiveStatus.set(
      `${savedSessions().length} session${savedSessions().length === 1 ? '' : 's'} dans l’archive locale`,
    );
  } catch {
    archiveReachable.set(false);
    archiveStatus.set('Serveur d’archive arrêté · lance npm run logs:server');
  }
}

async function deleteSavedSession(id: string): Promise<void> {
  try {
    const response = await fetch(
      `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    pendingDeleteSessionId.set(undefined);
    if (routeSessionId() === id) window.location.hash = '#/';
    await refreshSavedSessions();
    archiveStatus.set('Session supprimée de l’archive locale.');
  } catch (error) {
    archiveStatus.set(
      `Suppression impossible · ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadSavedSession(id: string): Promise<void> {
  beginReplayLoadingIndicator();
  loadError.set(undefined);
  if (loadedArchiveSessionId !== id) {
    session.set(undefined);
    events.set([]);
    difference.set(undefined);
    setNextActionCountdown(undefined);
    connected.set(false);
    replayState.set('idle');
    sessionText.set('');
  }
  try {
    const response = await fetch(
      `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const archived = await response.json();
    if (routeSessionId() !== id) return;
    importJson(JSON.stringify(archived));
    loadedArchiveCreatedAtMs =
      isRecord(archived) && typeof archived['createdAt'] === 'string'
        ? Date.parse(archived['createdAt'])
        : undefined;
    loadedArchiveSessionId = id;
    const participants = sessionParticipants();
    if (
      (participants.length > 1 || session()?.truncated) &&
      replayParticipantIds().length === 0
    ) {
      status.set(
        archived.truncated
          ? 'Session tronquée · aucun onglet avec un historique complet ne peut être rejoué.'
          : 'Session chargée · aucun onglet ne contient d’action rejouable.',
      );
      endReplayLoadingIndicator();
      return;
    }
    window.setTimeout(() => {
      if (routeSessionId() !== id || loadedArchiveSessionId !== id) return;
      if (!canReplaySelectedSession()) {
        status.set('Session chargée · aucun replay fiable à préparer.');
        endReplayLoadingIndicator();
        return;
      }
      startReplay();
    }, 0);
  } catch (error) {
    endReplayLoadingIndicator();
    const message = `Impossible de charger la session · ${error instanceof Error ? error.message : String(error)}`;
    status.set(message);
    loadError.set(message);
  }
}

function startArchiveRefresh(): void {
  if (!hashListenerInstalled) {
    hashListenerInstalled = true;
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
  }
  if (archiveRefreshTimer !== undefined) return;
  void refreshSavedSessions();
  archiveRefreshTimer = window.setInterval(() => {
    void refreshSavedSessions();
  }, 2000);
}

function parseLocalTarget(
  value: string,
): Readonly<{ ok: true; url: URL }> | Readonly<{ ok: false; error: string }> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function eventDiagnosticLabel(event: SendContextEvent): string {
  const name = event.name ?? 'nom non disponible';
  if (event.kind !== 'performance' || !isRecord(event.payload)) return name;
  const payload = event.payload;
  if (typeof payload['durationMs'] === 'number') {
    const duration = `${payload['durationMs'].toFixed(0)} ms`;
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

function importJson(text: string): void {
  loadedArchiveCreatedAtMs = undefined;
  sessionText.set(text);
  const result = validateDebugSessionExport(text.trim());
  if (!result.ok) {
    endReplayLoadingIndicator();
    session.set(undefined);
    events.set([]);
    status.set(result.error);
    loadError.set(result.error);
    return;
  }
  loadError.set(undefined);
  session.set(result.session);
  sessionParticipants.set(
    Array.isArray(result.session.participants)
      ? result.session.participants
      : [],
  );
  selectedParticipantId.set('all');
  eventTimelinePage.set(0);
  replayViewport.set(result.session.viewport);
  updateReplayViewport();
  events.set(result.session.events);
  if (!routeSessionId() && window.location.hash !== '#/import') {
    window.location.hash = '#/import';
  }
  difference.set(undefined);
  status.set(
    `Session v${result.session.version} importée · ${result.session.events.length} événements${result.session.truncated ? ' · archive tronquée, replay selon l’historique conservé par onglet' : ''}`,
  );
  const recordedUrl = parseLocalTarget(result.session.startUrl);
  if (recordedUrl.ok) targetUrl.set(recordedUrl.url.href);
  renderReplayFrames();
}

function sessionForParticipant(
  participantId: string,
): SendContextReplayExport | undefined {
  const imported = session();
  if (!imported) return undefined;
  const participants = sessionParticipants();
  if (participantId === 'default' || participants.length === 0) return imported;
  const participant = participants.find((item) => item.id === participantId);
  if (!participant) return imported;
  const continuations = replayParticipantContinuations();
  const groupedParticipantIds = new Set([
    participantId,
    ...[...continuations].flatMap(([continuationId, rootId]) =>
      rootId === participantId ? [continuationId] : [],
    ),
  ]);
  const participantEvents = imported.events.filter(
    (event) =>
      (event.participantId && groupedParticipantIds.has(event.participantId)) ||
      (participants.length === 1 && event.participantId === undefined),
  );
  const participantClips = imported.clips.filter(
    (clip) =>
      isRecord(clip) &&
      typeof clip['participantId'] === 'string' &&
      groupedParticipantIds.has(clip['participantId']),
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

function replayParticipantIds(): readonly string[] {
  const participants = sessionParticipants();
  if (participants.length === 0) return ['default'];
  const selected = selectedParticipantId();
  const continuations = replayParticipantContinuations();
  const candidates =
    selected === 'all'
      ? participants
      : participants.filter((participant) => participant.id === selected);
  return candidates
    .filter((participant) => {
      if (continuations.has(participant.id)) return false;
      const replay = sessionForParticipant(participant.id);
      return replay !== undefined && !replay.truncated;
    })
    .map((participant) => participant.id);
}

/** Older recordings assigned a new participant id after a Clear Cache reload. */
function replayParticipantContinuations(): ReadonlyMap<string, string> {
  const participants = [...sessionParticipants()].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
  const continuations = new Map<string, string>();
  for (let index = 1; index < participants.length; index += 1) {
    const next = participants[index]!;
    let nextStart: URL;
    try {
      nextStart = new URL(next.startUrl);
    } catch {
      continue;
    }
    const candidates = participants.slice(0, index).filter((previous) => {
      if (previous.status !== 'completed') return false;
      const gapMs = Date.parse(next.createdAt) - Date.parse(previous.updatedAt);
      if (!Number.isFinite(gapMs) || gapMs < 0 || gapMs > 2_000) return false;
      const previousEvents = events().filter(
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
    if (candidates.length === 1) continuations.set(next.id, candidates[0]!.id);
  }
  return continuations;
}

function replayFrameElementId(participantId: string): string {
  return `replay-target-${participantId}`;
}

function replayFrameFor(participantId: string): HTMLIFrameElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLIFrameElement>(
      'iframe[data-replay-participant]',
    ),
  ).find((frame) => frame.dataset['replayParticipant'] === participantId);
}

function replayFrameWrapperId(participantId: string): string {
  return replayParticipantIds()[0] === participantId
    ? 'replay-viewport-frame'
    : `replay-viewport-frame-${participantId}`;
}

function replayFrameCardId(participantId: string): string {
  return `replay-frame-card-${participantId}`;
}

function replayFrameUrlId(participantId: string): string {
  return `replay-frame-url-${participantId}`;
}

function replayFramePlaceholderId(participantId: string): string {
  return `replay-frame-placeholder-${participantId}`;
}

function replayMarkerId(participantId: string): string {
  return replayParticipantIds()[0] === participantId
    ? 'replay-click-marker'
    : `replay-click-marker-${participantId}`;
}

function replayDialogOverlayId(participantId: string): string {
  return `replay-dialog-overlay-${participantId}`;
}

function hideReplayDialog(participantId: string): void {
  const timer = replayDialogTimers.get(participantId);
  if (timer !== undefined) window.clearTimeout(timer);
  replayDialogTimers.delete(participantId);
  const overlay = document.getElementById(replayDialogOverlayId(participantId));
  if (overlay) overlay.hidden = true;
}

function showReplayDialog(participantId: string, value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const dialog = value as Record<string, unknown>;
  const overlay = document.getElementById(replayDialogOverlayId(participantId));
  if (!overlay) return;
  hideReplayDialog(participantId);
  const method =
    dialog['method'] === 'alert' ||
    dialog['method'] === 'confirm' ||
    dialog['method'] === 'prompt'
      ? dialog['method']
      : 'alert';
  const title = overlay.querySelector<HTMLElement>(
    '[data-lab="replay-dialog-title"]',
  );
  const message = overlay.querySelector<HTMLElement>(
    '[data-lab="replay-dialog-message"]',
  );
  const result = overlay.querySelector<HTMLElement>(
    '[data-lab="replay-dialog-result"]',
  );
  if (title)
    title.textContent =
      method === 'alert'
        ? 'Alerte navigateur'
        : method === 'confirm'
          ? 'Confirmation navigateur'
          : 'Saisie navigateur';
  if (message)
    message.textContent =
      typeof dialog['message'] === 'string'
        ? dialog['message']
        : 'Dialogue sans message';
  if (result) {
    const recorded = dialog['recorded'] === true;
    const answer = dialog['result'];
    result.textContent = recorded
      ? method === 'confirm'
        ? answer === true
          ? 'Réponse enregistrée : OK'
          : 'Réponse enregistrée : Annuler'
        : method === 'prompt'
          ? typeof answer === 'string'
            ? `Réponse enregistrée : ${answer}`
            : answer === null
              ? 'Réponse enregistrée : Annuler'
              : 'Valeur saisie non enregistrée'
          : 'Dialogue enregistré'
      : 'Dialogue non présent dans cet enregistrement';
  }
  overlay.hidden = false;
  const duration =
    typeof dialog['durationMs'] === 'number' &&
    Number.isFinite(dialog['durationMs'])
      ? Math.max(0, Math.min(dialog['durationMs'], 60_000))
      : 0;
  if (duration > 0)
    replayDialogTimers.set(
      participantId,
      window.setTimeout(() => hideReplayDialog(participantId), duration + 250),
    );
}

function replayParticipantTitle(participantId: string): string {
  return (
    sessionParticipants().find(
      (participant) => participant.id === participantId,
    )?.title ?? 'Application cible'
  );
}

function renderReplayFrames(): void {
  const grid = document.getElementById('replay-frame-grid');
  if (!grid) return;
  const participantIds = replayParticipantIds();
  if (!participantIds.includes(activeReplayParticipantId() ?? ''))
    activeReplayParticipantId.set(participantIds[0]);
  grid.replaceChildren();
  participantIds.forEach((participantId, index) => {
    const card = document.createElement('section');
    card.className = ui.tile;
    card.dataset['lab'] = 'replay-tile';
    card.hidden = participantId !== activeReplayParticipantId();
    card.id = replayFrameCardId(participantId);
    const title = document.createElement('h3');
    title.className = ui.tileTitle;
    title.dataset['lab'] = 'replay-tile-title';
    const participantName = document.createElement('span');
    participantName.className = ui.tileName;
    participantName.dataset['lab'] = 'replay-tile-name';
    participantName.textContent = replayParticipantTitle(participantId);
    const activeBadge = document.createElement('span');
    activeBadge.className = ui.tileBadge;
    activeBadge.dataset['lab'] = 'replay-active-badge';
    activeBadge.hidden = true;
    title.append(participantName, activeBadge);
    const viewportFrame = document.createElement('div');
    viewportFrame.className = ui.viewport;
    viewportFrame.dataset['lab'] = 'viewport-frame';
    viewportFrame.id = replayFrameWrapperId(participantId);
    const frame = document.createElement('iframe');
    frame.id =
      index === 0 ? 'replay-target' : replayFrameElementId(participantId);
    frame.className = ui.frame;
    frame.dataset['replayParticipant'] = participantId;
    frame.title = `${replayParticipantTitle(participantId)} · replay`;
    const recordedColorScheme = sessionParticipants().find(
      (participant) => participant.id === participantId,
    )?.environment?.colorScheme;
    // The iframe inherits color-scheme from this dark dashboard. Pin its
    // embedded preference to the recording when available; old exports have
    // no theme metadata, so use light as the least surprising legacy default.
    frame.dataset['frameScheme'] =
      recordedColorScheme === 'dark' ? 'dark' : 'light';
    frame.addEventListener('load', () => handshake(participantId));
    const placeholder = document.createElement('div');
    placeholder.className = ui.placeholder;
    placeholder.dataset['lab'] = 'replay-frame-placeholder';
    placeholder.id = replayFramePlaceholderId(participantId);
    placeholder.hidden = true;
    const visibilityOverlay = document.createElement('div');
    visibilityOverlay.className = ui.veil;
    visibilityOverlay.dataset['lab'] = 'replay-visibility-overlay';
    visibilityOverlay.hidden = true;
    visibilityOverlay.setAttribute('aria-label', 'Onglet non visible');
    visibilityOverlay.textContent = 'Non visible';
    const marker = document.createElement('div');
    marker.className = ui.marker;
    marker.dataset['lab'] = 'click-marker';
    marker.id = replayMarkerId(participantId);
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = ui.pageDialog;
    dialogOverlay.dataset['lab'] = 'replay-dialog-overlay';
    dialogOverlay.id = replayDialogOverlayId(participantId);
    dialogOverlay.hidden = true;
    dialogOverlay.setAttribute('role', 'status');
    const dialogPanel = document.createElement('div');
    dialogPanel.className = ui.pageDialogCard;
    dialogPanel.dataset['lab'] = 'replay-dialog';
    const dialogTitle = document.createElement('strong');
    dialogTitle.className = ui.pageDialogTitle;
    dialogTitle.dataset['lab'] = 'replay-dialog-title';
    const dialogMessage = document.createElement('p');
    dialogMessage.className = ui.pageDialogMessage;
    dialogMessage.dataset['lab'] = 'replay-dialog-message';
    const dialogResult = document.createElement('small');
    dialogResult.className = ui.pageDialogResult;
    dialogResult.dataset['lab'] = 'replay-dialog-result';
    dialogPanel.append(dialogTitle, dialogMessage, dialogResult);
    dialogOverlay.append(dialogPanel);
    const url = document.createElement('p');
    url.className = ui.tileUrl;
    url.dataset['lab'] = 'replay-tile-url';
    url.id = replayFrameUrlId(participantId);
    url.textContent =
      sessionParticipants().find(
        (participant) => participant.id === participantId,
      )?.startUrl ?? '';
    url.title = url.textContent;
    // One tab: the head already says what is shown. The title earns its place
    // when several tabs share the stage.
    title.hidden = participantIds.length === 1;
    url.hidden = participantIds.length === 1;
    viewportFrame.append(
      frame,
      visibilityOverlay,
      marker,
      dialogOverlay,
      placeholder,
    );
    card.append(title, url, viewportFrame);
    grid.append(card);
  });
  updateReplayViewport();
}

function updateReplayFrameUrl(
  participantId: string,
  value: unknown,
  expectedOrigin: string,
): void {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.origin !== expectedOrigin) return;
    // The replay marker is added by the dashboard and is not part of the
    // page's meaningful location.
    url.searchParams.delete(REPLAY_QUERY_MARKER);
    const displayUrl = url.href;
    const element = document.getElementById(replayFrameUrlId(participantId));
    if (!element) return;
    element.textContent = displayUrl;
    element.title = displayUrl;
  } catch {
    // Ignore malformed URLs from the embedded application.
  }
}

function updateReplayTileIndicators(): void {
  for (const id of replayVisibilityParticipantIds) {
    const card = document.getElementById(replayFrameCardId(id));
    if (!card) continue;
    const isRecordedActive = replayRecordedActiveParticipantId === id;
    const isActionTarget = replayActionParticipantId === id;
    if (isRecordedActive) card.setAttribute('data-tile-focus', 'true');
    else card.removeAttribute('data-tile-focus');
    if (isActionTarget) card.setAttribute('data-tile-action', 'true');
    else card.removeAttribute('data-tile-action');
    const badge = card.querySelector<HTMLElement>(
      '[data-lab="replay-active-badge"]',
    );
    if (badge) {
      badge.textContent =
        isRecordedActive && isActionTarget
          ? 'ACTIF · ACTION'
          : isRecordedActive
            ? 'ACTIF'
            : isActionTarget
              ? 'ACTION'
              : '';
      badge.hidden = badge.textContent === '';
    }
    const visibilityOverlay = card.querySelector<HTMLDivElement>(
      '[data-lab="replay-visibility-overlay"]',
    );
    if (visibilityOverlay) {
      const state = replayParticipantStates.get(id)?.state;
      const message =
        state === 'hidden'
          ? 'Non visible'
          : state === 'closed'
            ? 'Onglet fermé'
            : state === 'interrupted'
              ? 'Connexion interrompue'
              : undefined;
      visibilityOverlay.hidden = message === undefined;
      if (state === 'hidden')
        visibilityOverlay.setAttribute('data-veil', 'dim');
      else visibilityOverlay.removeAttribute('data-veil');
      if (message) {
        visibilityOverlay.textContent = message;
        visibilityOverlay.setAttribute('aria-label', message);
      }
    }
  }
}

function setReplayActionTarget(participantId: string): void {
  replayActionParticipantId = participantId;
  activeReplayParticipantId.set(participantId);
  updateReplayTileIndicators();
}

function updateActiveReplayFrame(elapsedMs = replayClockElapsedMs): void {
  const participantIds = replayVisibilityParticipantIds;
  if (participantIds.length === 0) return;
  const at = replayVisibilityOriginMs + elapsedMs;
  let changed = false;
  while (
    replayVisibilityCursor < replayVisibilityTimeline.length &&
    replayVisibilityTimeline[replayVisibilityCursor]!.time <= at
  ) {
    const change = replayVisibilityTimeline[replayVisibilityCursor++]!;
    replayParticipantStates.set(change.participantId, {
      state: change.state,
      time: change.time,
    });
    changed = true;
  }
  if (!changed) {
    updateReplayTileIndicators();
    return;
  }
  const states = [...replayParticipantStates.entries()];
  const focused = states
    .filter(([, value]) => value.state === 'visible')
    .sort((left, right) => right[1].time - left[1].time)[0];
  const fallback = states
    .filter(
      ([, value]) =>
        value.state !== 'hidden' &&
        value.state !== 'closed' &&
        value.state !== 'interrupted',
    )
    .sort((left, right) => right[1].time - left[1].time)[0];
  const participantId = (focused ?? fallback)?.[0] ?? participantIds[0];
  replayRecordedActiveParticipantId = focused?.[0];
  if (!participantId) return;
  if (participantId !== activeReplayParticipantId())
    activeReplayParticipantId.set(participantId);
  updateReplayTileIndicators();
  for (const id of participantIds) {
    const card = document.getElementById(replayFrameCardId(id));
    if (!card) continue;
    const scheduled = replayFrameConnections.get(id)?.status === 'scheduled';
    card.hidden = scheduled
      ? false
      : selectedParticipantId() === 'all'
        ? false
        : id !== participantId;
  }
}

function prepareReplayVisibilityTimeline(): void {
  replayVisibilityParticipantIds = replayParticipantIds();
  replayRecordedActiveParticipantId = undefined;
  replayVisibilityOriginMs = replaySessionStartAtMs(sessionsForReplay());
  const replaySessions = sessionsForReplay();
  const sessionStartMs = Number.isFinite(loadedArchiveCreatedAtMs)
    ? loadedArchiveCreatedAtMs!
    : sessionParticipants()
        .map((participant) => Date.parse(participant.createdAt))
        .filter(Number.isFinite)
        .reduce((minimum, value) => Math.min(minimum, value), Infinity);
  const visibilityChanges = replaySessions.flatMap(
    ({ participantId, session: replaySession }) =>
      replaySession.events.flatMap((event) => {
        if (event.kind !== 'participant' || event.name !== 'state') return [];
        const payload = isRecord(event.payload) ? event.payload : {};
        const state = payload['state'];
        const time = event.globalElapsedMs;
        if (
          (state !== 'visible' && state !== 'hidden' && state !== 'blurred') ||
          typeof time !== 'number'
        )
          return [];
        return [
          {
            participantId,
            state: state as 'visible' | 'hidden' | 'blurred',
            time,
          },
        ];
      }),
  );
  const continuedParticipantIds = new Set(
    replayParticipantContinuations().values(),
  );
  const terminalChanges = sessionParticipants().flatMap((participant) => {
    if (!replayVisibilityParticipantIds.includes(participant.id)) return [];
    if (continuedParticipantIds.has(participant.id)) return [];
    const state: ReplayParticipantState | undefined =
      participant.status === 'completed'
        ? 'closed'
        : participant.status === 'interrupted'
          ? 'interrupted'
          : undefined;
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
  replayVisibilityTimeline = [...visibilityChanges, ...terminalChanges].sort(
    (left, right) => left.time - right.time,
  );
  replayVisibilityCursor = 0;
  replayParticipantStates.clear();
  updateActiveReplayFrame(0);
  if (replayableEvents().length === 0) applyReplayTerminalParticipantStates();
}

function participantStartAtMs(
  participantId: string,
  replaySession: SendContextReplayExport,
): number {
  const initialStateEvents = replaySession.events.filter((event) => {
    if (event.kind !== 'participant' || event.name !== 'state') return false;
    const payload = isRecord(event.payload) ? event.payload : {};
    return payload['initial'] === true;
  });
  const initialStateTimes = initialStateEvents
    .map((event) => event.globalElapsedMs)
    .filter((value): value is number => typeof value === 'number');
  if (initialStateTimes.length)
    return initialStateTimes.reduce((minimum, value) =>
      Math.min(minimum, value),
    );
  if (initialStateEvents.length) {
    const firstSessionTimestamp = events()
      .map((event) => event.timestamp)
      .reduce((minimum, value) => Math.min(minimum, value), Infinity);
    const firstParticipantTimestamp = initialStateEvents
      .map((event) => event.timestamp)
      .reduce((minimum, value) => Math.min(minimum, value), Infinity);
    if (Number.isFinite(firstSessionTimestamp))
      return Math.max(0, firstParticipantTimestamp - firstSessionTimestamp);
  }

  const participant = sessionParticipants().find(
    (item) => item.id === participantId,
  );
  const participantCreatedAt = participant
    ? Date.parse(participant.createdAt)
    : Number.NaN;
  if (Number.isFinite(participantCreatedAt)) {
    const firstParticipantCreatedAt = sessionParticipants()
      .map((item) => Date.parse(item.createdAt))
      .filter(Number.isFinite)
      .reduce((minimum, value) => Math.min(minimum, value), Infinity);
    const baseline = Number.isFinite(loadedArchiveCreatedAtMs)
      ? loadedArchiveCreatedAtMs!
      : firstParticipantCreatedAt;
    if (Number.isFinite(baseline))
      return Math.max(0, participantCreatedAt - baseline);
  }

  const firstAction = replaySession.events
    .filter(
      (event) =>
        event.phase === 'emitted' &&
        (event.kind === 'dom' ||
          event.kind === 'scroll' ||
          event.kind === 'viewport'),
    )
    .map((event) => event.globalElapsedMs)
    .filter((value): value is number => typeof value === 'number')
    .reduce((minimum, value) => Math.min(minimum, value), Infinity);
  return Number.isFinite(firstAction) ? firstAction : 0;
}

function replaySessionStartAtMs(
  replaySessions: readonly Readonly<{
    participantId: string;
    session: SendContextReplayExport;
  }>[],
): number {
  return replaySessions
    .map((item) => participantStartAtMs(item.participantId, item.session))
    .reduce((minimum, value) => Math.min(minimum, value), Infinity);
}

function setReplayFramePlaceholder(
  participantId: string,
  message: string,
): void {
  const placeholder = document.getElementById(
    replayFramePlaceholderId(participantId),
  );
  if (!placeholder) return;
  placeholder.textContent = message;
  placeholder.hidden = message.length === 0;
}

function launchReplayParticipant(connection: ReplayFrameConnection): void {
  if (connection.status !== 'scheduled') return;
  const frame = replayFrameFor(connection.participantId);
  if (!frame) return;
  connection.status = 'preparing';
  setReplayFramePlaceholder(
    connection.participantId,
    'Ouverture au moment enregistré…',
  );
  frame.src = connection.href;
  updateGlobalReplayState();
}

function launchDueReplayParticipants(elapsedMs: number): void {
  for (const connection of replayFrameConnections.values()) {
    if (
      connection.status === 'scheduled' &&
      connection.startOffsetMs <= elapsedMs
    )
      launchReplayParticipant(connection);
  }
}

function stopReplayVisibilityClock(): void {
  if (replayVisibilityTimer !== undefined)
    window.clearInterval(replayVisibilityTimer);
  replayVisibilityTimer = undefined;
  replayClockStartedAt = undefined;
}

function freezeReplayVisibilityClock(): void {
  if (replayClockStartedAt !== undefined)
    replayClockElapsedMs += performance.now() - replayClockStartedAt;
  stopReplayVisibilityClock();
  updateActiveReplayFrame(replayClockElapsedMs);
}

function playReplay(): void {
  replayPlaybackRequested = true;
  send('play');
  stopReplayVisibilityClock();
  const baseElapsedMs = replayClockElapsedMs;
  replayClockStartedAt = performance.now();
  replayVisibilityTimer = window.setInterval(() => {
    if (replayClockStartedAt === undefined) return;
    replayClockElapsedMs =
      baseElapsedMs + performance.now() - replayClockStartedAt;
    launchDueReplayParticipants(replayClockElapsedMs);
    updateActiveReplayFrame(replayClockElapsedMs);
    if (replayState() === 'completed' || replayState() === 'error')
      stopReplayVisibilityClock();
  }, 40);
  updateActiveReplayFrame(replayClockElapsedMs);
}

function pauseReplay(): void {
  replayPlaybackRequested = false;
  freezeReplayVisibilityClock();
  send('pause');
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
  return (
    sequences.length > 0 &&
    sequences.reduce((minimum, value) => Math.min(minimum, value), Infinity) ===
      1
  );
}

function participantOptionLabel(
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

function canReplaySelectedSession(): boolean {
  const replaySessions = sessionsForReplay();
  return (
    replaySessions.length > 0 &&
    (startMode() !== 'snapshot' ||
      replaySessions.every(
        (item) => item.session.initialSnapshot !== undefined,
      ))
  );
}

function sessionsForReplay(): readonly Readonly<{
  participantId: string;
  session: SendContextReplayExport;
}>[] {
  const imported = session();
  if (!imported) return [];
  const participantIds = replayParticipantIds();
  const replaySessions = participantIds.flatMap((participantId) => {
    const replay = sessionForParticipant(participantId);
    return replay && !replay.truncated
      ? [{ participantId, session: replay }]
      : [];
  });
  if (selectedParticipantId() !== 'all' || replaySessions.length <= 1)
    return replaySessions;

  const allEvents = replaySessions.flatMap((item) => item.session.events);
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
        (minimum, event) => Math.min(minimum, event.globalElapsedMs!),
        allEvents.length ? Infinity : 0,
      )
    : 0;
  return replaySessions.map((item) => ({
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
  })) as readonly Readonly<{
    participantId: string;
    session: SendContextReplayExport;
    timelineOriginMs?: number;
  }>[];
}

function updateGlobalProgress(participantId: string, localIndex: number): void {
  const participantSession = sessionForParticipant(participantId);
  if (!participantSession) return;
  const localActions = getReplaySteps(participantSession.events);
  for (const event of localActions.slice(0, Math.max(0, localIndex)))
    completedReplayEventIds.add(event.id);
  const ordered = replayableEvents();
  let completedPrefix = 0;
  while (
    completedPrefix < ordered.length &&
    completedReplayEventIds.has(ordered[completedPrefix]!.id)
  )
    completedPrefix += 1;
  replayIndex.set(completedPrefix);
}

function updateGlobalReplayState(): void {
  const activeIds = replayParticipantIds();
  const active = activeIds.map((id) => replayFrameConnections.get(id));
  const framesConnected =
    active.length > 0 &&
    active.every(
      (connection) =>
        connection !== undefined &&
        ((connection.connected && connection.started) ||
          connection.status === 'scheduled' ||
          (connection.status === 'preparing' &&
            (replayPlaybackRequested || connection.startOffsetMs > 0))),
    );
  connected.set(framesConnected);
  const states = active.flatMap((connection) =>
    connection ? [connection.status] : [],
  );
  if (states.includes('error')) replayState.set('error');
  // The global cursor advances only after an interaction has settled and its
  // participant has reported progress. Hidden iframe timers can delay the
  // final "completed" status message even after every recorded action ran.
  else if (
    replayableEvents().length > 0 &&
    replayIndex() >= replayableEvents().length &&
    !hasDifference()
  )
    replayState.set('completed');
  else if (
    states.includes('playing') ||
    (replayPlaybackRequested &&
      states.some((state) => state !== 'completed' && state !== 'error'))
  )
    replayState.set('playing');
  else if (states.length > 0 && states.every((state) => state === 'completed'))
    replayState.set('completed');
  else if (states.includes('paused')) replayState.set('paused');
  else if (framesConnected) replayState.set('ready');
  else replayState.set('preparing');
  const hasStartedParticipant = active.some(
    (connection) => connection?.connected && connection.started,
  );
  if (hasStartedParticipant || states.includes('error'))
    endReplayLoadingIndicator();
  if (replayState() === 'completed') applyReplayTerminalParticipantStates();
  if (replayState() !== 'playing' && replayClockStartedAt !== undefined) {
    freezeReplayVisibilityClock();
  }
}

function applyReplayTerminalParticipantStates(): void {
  let changed = false;
  for (const participant of sessionParticipants()) {
    if (!replayVisibilityParticipantIds.includes(participant.id)) continue;
    const state: ReplayParticipantState | undefined =
      participant.status === 'completed'
        ? 'closed'
        : participant.status === 'interrupted'
          ? 'interrupted'
          : undefined;
    if (!state) continue;
    replayParticipantStates.set(participant.id, {
      state,
      time: Number.POSITIVE_INFINITY,
    });
    changed = true;
  }
  if (changed) updateReplayTileIndicators();
}

function selectParticipant(value: string): void {
  stopReplayVisibilityClock();
  replayPlaybackRequested = false;
  replayClockElapsedMs = 0;
  send('stop');
  for (const timer of handshakeTimers.values()) window.clearTimeout(timer);
  handshakeTimers.clear();
  replayFrameConnections.clear();
  completedReplayEventIds.clear();
  connected.set(false);
  replayState.set('idle');
  selectedParticipantId.set(
    replayParticipantContinuations().get(value) ?? value,
  );
  eventTimelinePage.set(0);
  replayIndex.set(0);
  const participant = sessionParticipants().find((item) => item.id === value);
  replayViewport.set(participant?.viewport ?? session()?.viewport);
  if (participant?.startUrl) {
    const parsed = parseLocalTarget(participant.startUrl);
    if (parsed.ok) targetUrl.set(parsed.url.href);
  }
  renderReplayFrames();
  updateReplayViewport();
  scheduleReplayPreparation();
}

function installMessageListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const connection = [...replayFrameConnections.values()].find(
      (candidate) =>
        replayFrameFor(candidate.participantId)?.contentWindow === event.source,
    );
    const target = parseLocalTarget(connection?.href ?? '');
    const data = event.data as Record<string, unknown> | null;
    if (
      !connection ||
      !target.ok ||
      event.origin !== target.url.origin ||
      !data ||
      data['channel'] !== CHANNEL ||
      typeof data['type'] !== 'string'
    )
      return;
    const participantId = connection.participantId;
    if (typeof data['href'] === 'string')
      updateReplayFrameUrl(participantId, data['href'], target.url.origin);
    if (typeof data['currentHref'] === 'string')
      updateReplayFrameUrl(
        participantId,
        data['currentHref'],
        target.url.origin,
      );
    if (
      data['type'] === 'interaction' ||
      data['type'] === 'scroll-step' ||
      data['type'] === 'viewport-step'
    )
      hideReplayDialog(participantId);
    if (data['type'] === 'dialog') {
      showReplayDialog(participantId, data['dialog']);
      return;
    }
    if (data['type'] === 'ready' && data['nonce'] === connection.nonce) {
      const handshakeTimer = handshakeTimers.get(participantId);
      if (handshakeTimer !== undefined) {
        window.clearTimeout(handshakeTimer);
        handshakeTimers.delete(participantId);
      }
      connection.connected = true;
      if (
        connection.startOffsetMs > 0 &&
        replayClockElapsedMs >= connection.startOffsetMs
      )
        connection.timelineOriginMs =
          replayVisibilityOriginMs + replayClockElapsedMs;
      replayFrameFor(participantId)?.contentWindow?.postMessage(
        {
          channel: CHANNEL,
          type: 'start',
          session: connection.session,
          startMode: connection.startMode,
          startIndex: connection.resumeIndex,
          replayRunId: connection.replayRunId,
          ...(connection.timelineOriginMs === undefined
            ? {}
            : { timelineOriginMs: connection.timelineOriginMs }),
        },
        target.url.origin,
      );
      connection.started = true;
      connection.status = 'ready';
      if (connection.resumeIndex > 0)
        updateGlobalProgress(participantId, connection.resumeIndex);
      setReplayFramePlaceholder(participantId, '');
      updateGlobalReplayState();
      if (connected())
        status.set(
          `Replay · ready${[...replayFrameConnections.values()].some((item) => item.status === 'scheduled') ? ` · ${[...replayFrameConnections.values()].filter((item) => item.status === 'scheduled').length} onglet(s) s’ouvriront au moment enregistré` : ` · ${replayFrameConnections.size} onglet(s) préparé(s)`}.`,
        );
      if (connection.pendingStep) {
        connection.pendingStep = false;
        send('step', {}, participantId);
      } else if (replayPlaybackRequested) {
        send('play', {}, participantId);
      }
    } else if (data['type'] === 'warning') {
      const warning = String(data['message'] ?? 'Événement de replay ignoré.');
      replayWarnings.update((warnings) =>
        warnings.includes(warning)
          ? warnings
          : [...warnings, warning].slice(-5),
      );
    } else if (data['type'] === 'error') {
      hideReplayDialog(participantId);
      freezeReplayVisibilityClock();
      setNextActionCountdown(undefined);
      connection.status = 'error';
      differenceParticipantId = participantId;
      replayState.set('error');
      endReplayLoadingIndicator();
      status.set(
        `Replay interrompu · ${String(data['message'] ?? 'erreur inconnue')}`,
      );
    } else if (data['type'] === 'status') {
      const nextState = String(data['status'] ?? 'état inconnu');
      if (nextState === 'stopped' || nextState === 'completed')
        hideReplayDialog(participantId);
      connection.status = nextState;
      if (typeof data['index'] === 'number')
        updateGlobalProgress(participantId, data['index']);
      updateGlobalReplayState();
      if (nextState !== 'playing') setNextActionCountdown(undefined);
      status.set(`Replay · ${nextState}`);
    } else if (data['type'] === 'recovered') {
      freezeReplayVisibilityClock();
      setNextActionCountdown(undefined);
      if (typeof data['index'] === 'number')
        updateGlobalProgress(participantId, data['index']);
      connection.status = 'paused';
      updateGlobalReplayState();
      replayState.set('paused');
      difference.set(undefined);
      const destination =
        typeof data['href'] === 'string'
          ? `navigation vers ${new URL(data['href']).pathname}`
          : 'point de contrôle restauré';
      status.set(`Reprise forcée · ${destination} · étape ${replayIndex()}`);
    } else if (data['type'] === 'skipped') {
      freezeReplayVisibilityClock();
      setNextActionCountdown(undefined);
      if (typeof data['index'] === 'number')
        updateGlobalProgress(participantId, data['index']);
      connection.status = 'paused';
      const skipped = {
        from: typeof data['from'] === 'number' ? data['from'] : replayIndex(),
        to: replayIndex(),
        checkpointEventId: String(data['checkpointEventId'] ?? 'inconnu'),
      };
      updateGlobalReplayState();
      replayState.set('paused');
      partialReplay.set(skipped);
      difference.set(undefined);
      status.set(
        `Replay partiel · intervalle ${skipped.from}–${skipped.to} ignoré · reprise en pause.`,
      );
    } else if (data['type'] === 'progress') {
      if (typeof data['index'] === 'number')
        updateGlobalProgress(participantId, data['index']);
      const nextState =
        typeof data['state'] === 'string' ? data['state'] : 'paused';
      if (nextState === 'completed') hideReplayDialog(participantId);
      connection.status = nextState;
      updateGlobalReplayState();
      setNextActionCountdown(
        nextState === 'playing' && typeof data['nextDelayMs'] === 'number'
          ? data['nextDelayMs']
          : undefined,
      );
      const total = replayableEvents().length;
      status.set(
        replayState() === 'completed'
          ? `Replay terminé · ${replayIndex()} / ${total}`
          : `Replay · ${data['state'] === 'playing' ? 'lecture' : 'étape'} ${replayIndex()} / ${total}`,
      );
    } else if (data['type'] === 'interaction') {
      if (typeof data['nextIndex'] === 'number')
        connection.resumeIndex = Math.max(
          connection.resumeIndex,
          data['nextIndex'],
        );
      setReplayActionTarget(participantId);
      const action = data['action'];
      const x = data['clientX'];
      const y = data['clientY'];
      const marker = document.getElementById(replayMarkerId(participantId));
      const scale = replayScales.get(participantId) ?? 1;
      if (
        marker &&
        (action === 'click' ||
          action === 'pointerdown' ||
          action === 'mousedown') &&
        typeof x === 'number' &&
        Number.isFinite(x) &&
        typeof y === 'number' &&
        Number.isFinite(y)
      ) {
        writeVars(marker, {
          ...assign(markerVars.x, unit.px(x * scale)),
          ...assign(markerVars.y, unit.px(y * scale)),
        });
        marker.setAttribute(
          'aria-label',
          `Clic rejoué · ${String(data['name'] ?? 'interaction')}`,
        );
        marker.hidden = false;
        // A second click on the same spot plays the ping again.
        for (const ping of marker.getAnimations()) {
          ping.cancel();
          ping.play();
        }
      }
    } else if (data['type'] === 'scroll-step') {
      if (typeof data['nextIndex'] === 'number')
        connection.resumeIndex = Math.max(
          connection.resumeIndex,
          data['nextIndex'],
        );
      setReplayActionTarget(participantId);
      const marker = document.getElementById(replayMarkerId(participantId));
      if (marker) marker.hidden = true;
    } else if (data['type'] === 'viewport-step') {
      if (typeof data['nextIndex'] === 'number')
        connection.resumeIndex = Math.max(
          connection.resumeIndex,
          data['nextIndex'],
        );
      setReplayActionTarget(participantId);
      const width = data['width'];
      const height = data['height'];
      if (
        typeof width === 'number' &&
        Number.isSafeInteger(width) &&
        width >= 1 &&
        width <= 16_384 &&
        typeof height === 'number' &&
        Number.isSafeInteger(height) &&
        height >= 1 &&
        height <= 16_384
      ) {
        replayViewports.set(participantId, { width, height });
        if (selectedParticipantId() === participantId)
          replayViewport.set({ width, height });
        updateReplayViewport();
        const marker = document.getElementById(replayMarkerId(participantId));
        if (marker) marker.hidden = true;
      }
    } else if (
      (data['type'] === 'step' || data['type'] === 'difference') &&
      data['difference'] &&
      typeof data['difference'] === 'object'
    ) {
      setNextActionCountdown(undefined);
      const first = data['difference'] as {
        eventId?: string;
        expected: unknown;
        actual: unknown;
        recovery?: Readonly<{ href?: string; state?: unknown }>;
        skip?: Readonly<{ checkpointEventId: string; index: number }>;
      };
      difference.set(first);
      replayPlaybackRequested = false;
      differenceParticipantId = participantId;
      if (typeof data['index'] === 'number')
        updateGlobalProgress(participantId, data['index']);
      if (typeof data['state'] === 'string') replayState.set(data['state']);
      if (replayState() !== 'playing') freezeReplayVisibilityClock();
      status.set(
        `Premier écart détecté à l’événement ${first.eventId ?? '?'}.`,
      );
    } else if (data['type'] === 'step') {
      setNextActionCountdown(undefined);
      const index = typeof data['index'] === 'number' ? data['index'] : 0;
      const total = replayableEvents().length;
      const nextState =
        typeof data['state'] === 'string' ? data['state'] : 'paused';
      updateGlobalProgress(participantId, index);
      connection.status = nextState;
      updateGlobalReplayState();
      status.set(
        replayState() === 'completed' || nextState === 'completed'
          ? `Replay terminé · ${replayIndex()} / ${total}`
          : `Replay · étape ${replayIndex()} / ${total}`,
      );
    } else if (
      data['type'] === 'export' &&
      typeof data['session'] === 'string'
    ) {
      importJson(data['session']);
      status.set('Session v2 exportée dans le dashboard.');
      const blob = new Blob([data['session']], { type: 'application/json' });
      const download = document.createElement('a');
      download.href = URL.createObjectURL(blob);
      download.download = 'craft-debug-session-v2.json';
      download.click();
      URL.revokeObjectURL(download.href);
    }
  });
}

function handshake(participantId: string): void {
  observeReplayStage();
  const connection = replayFrameConnections.get(participantId);
  const frame = replayFrameFor(participantId);
  if (!connection || !frame?.contentWindow) return;
  const parsed = parseLocalTarget(connection.href);
  if (!parsed.ok) return;
  const previousTimer = handshakeTimers.get(participantId);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  connection.nonce = crypto.randomUUID();
  const nonce = connection.nonce;
  frame.contentWindow.postMessage(
    { channel: CHANNEL, type: 'hello', nonce },
    parsed.url.origin,
  );
  status.set(
    `Vérification du pont de replay · ${replayParticipantTitle(participantId)}…`,
  );
  const timer = window.setTimeout(() => {
    handshakeTimers.delete(participantId);
    if (connection.connected || connection.nonce !== nonce) return;
    connection.status = 'error';
    updateGlobalReplayState();
    status.set(
      `Aucune réponse du pont de replay. Vérifie que l’application tourne sur ${parsed.url.origin} et active provideCraftDebugReplayBridge.`,
    );
  }, 5000);
  handshakeTimers.set(participantId, timer);
}

function send(
  type: string,
  payload: Record<string, unknown> = {},
  participantId?: string,
): void {
  const connections = participantId
    ? [replayFrameConnections.get(participantId)]
    : [...replayFrameConnections.values()];
  for (const connection of connections) {
    if (!connection?.connected) continue;
    const target = parseLocalTarget(connection.href);
    const frame = replayFrameFor(connection.participantId);
    if (!target.ok || !frame?.contentWindow) continue;
    frame.contentWindow.postMessage(
      {
        channel: CHANNEL,
        type,
        replayRunId: connection.replayRunId,
        ...payload,
      },
      target.url.origin,
    );
  }
}

function stepNextReplayAction(): void {
  const next = replayableEvents()[replayIndex()];
  if (!next) return;
  const participantId = next.participantId ?? replayParticipantIds()[0];
  if (participantId) {
    setReplayActionTarget(participantId);
    updateActiveReplayFrame();
    const connection = replayFrameConnections.get(participantId);
    if (connection?.status === 'scheduled') {
      connection.pendingStep = true;
      replayPlaybackRequested = false;
      launchReplayParticipant(connection);
      return;
    }
    send('step', {}, participantId);
  }
}

function startReplay(): void {
  const replaySessions = sessionsForReplay();
  if (replaySessions.length === 0) {
    endReplayLoadingIndicator();
    return;
  }
  setNextActionCountdown(undefined);
  if (
    startMode() === 'snapshot' &&
    replaySessions.some((item) => !item.session.initialSnapshot)
  ) {
    endReplayLoadingIndicator();
    status.set(
      'Au moins un onglet ne contient pas de snapshot initial. Choisis le démarrage à l’URL.',
    );
    return;
  }
  difference.set(undefined);
  differenceParticipantId = undefined;
  replayActionParticipantId = undefined;
  replayRecordedActiveParticipantId = undefined;
  completedReplayEventIds.clear();
  stopReplayVisibilityClock();
  replayClockElapsedMs = 0;
  replayPlaybackRequested = false;
  replayWarnings.set([]);
  replayFrameConnections.clear();
  replayIndex.set(0);
  replayState.set('preparing');
  beginReplayLoadingIndicator();
  connected.set(false);
  const mode = startMode();
  renderReplayFrames();
  prepareReplayVisibilityTimeline();
  installMessageListener();
  const timelineOriginMs = replaySessionStartAtMs(replaySessions);
  const replayRunId = crypto.randomUUID();
  const sharedTimeline =
    selectedParticipantId() === 'all' && replaySessions.length > 1;
  status.set(
    sharedTimeline
      ? `Préparation de ${replaySessions.length} onglets…`
      : 'Chargement et préparation du replay…',
  );
  replaySessions.forEach(({ participantId, session: replaySession }) => {
    const useRecordedUrl = mode === 'url' || sharedTimeline;
    const target = parseLocalTarget(
      useRecordedUrl ? replaySession.startUrl : targetUrl().trim(),
    );
    const frame = replayFrameFor(participantId);
    if (!target.ok || !frame) {
      endReplayLoadingIndicator();
      status.set(
        target.ok ? 'La frame de replay est introuvable.' : target.error,
      );
      return;
    }
    if (!sharedTimeline && mode === 'url') targetUrl.set(target.url.href);
    if (useRecordedUrl) target.url.searchParams.set(REPLAY_QUERY_MARKER, '1');
    const participantTimelineOriginMs = participantStartAtMs(
      participantId,
      replaySession,
    );
    const startOffsetMs = Math.max(
      0,
      participantTimelineOriginMs - timelineOriginMs,
    );
    const connection: ReplayFrameConnection = {
      participantId,
      replayRunId,
      href: target.url.href,
      nonce: '',
      connected: false,
      started: false,
      status: 'scheduled',
      resumeIndex: 0,
      session: replaySession,
      startMode: mode,
      timelineOriginMs: participantTimelineOriginMs,
      startOffsetMs,
    };
    replayFrameConnections.set(participantId, connection);
    if (startOffsetMs > 0)
      setReplayFramePlaceholder(
        participantId,
        'Cet onglet s’ouvrira au moment enregistré.',
      );
    if (startOffsetMs > 0) {
      const card = document.getElementById(replayFrameCardId(participantId));
      if (card) card.hidden = false;
    }
  });
  launchDueReplayParticipants(0);
}

function fileChanged(event: Event): void {
  const file = (event.target as HTMLInputElement | null)?.files?.[0];
  if (file) {
    loadedArchiveSessionId = undefined;
    void file
      .text()
      .then((text) => {
        importJson(text);
        if (session()) importOpen.set(false);
        scheduleReplayPreparation();
      })
      .catch((error: unknown) => status.set(String(error)));
  }
}

const lit = <Value>(value: Value) =>
  function* (): Generator<never, Value, never> {
    return value;
  };

const sessionDate = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const replayStateLabels: Readonly<Record<string, string>> = {
  idle: 'en attente',
  preparing: 'préparation…',
  ready: 'prêt',
  playing: 'lecture',
  paused: 'en pause',
  completed: 'terminé',
  error: 'interrompu',
};

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function currentSessionTitle(): string {
  const selected = savedSessions().find((item) => item.id === routeSessionId());
  return selected
    ? sessionDate.format(new Date(selected.createdAt))
    : 'Session importée';
}

function progressLabel(): string {
  const total = replayableEvents().length;
  if (!total) return 'Aucune étape rejouable dans cette session.';
  const state = replayStateLabels[replayState()] ?? replayState();
  return `${replayIndex()} / ${total} étapes · ${state}`;
}

function nextActionLabel(): string {
  const next = replayableEvents()[replayIndex()];
  if (!next) return 'Aucune étape restante';
  if (next.kind === 'scroll')
    return `Ensuite · défilement ${next.name ?? ''}`.trim();
  if (next.kind === 'viewport') {
    const viewport = next.payload as
      | { width?: unknown; height?: unknown }
      | undefined;
    return `Ensuite · viewport ${String(viewport?.width ?? '?')} × ${String(viewport?.height ?? '?')} px`;
  }
  return `Ensuite · ${next.name ?? 'nom non disponible'}`;
}

function journalSummary(): string {
  if (showAllEvents()) return plural(visibleEvents().length, 'événement');
  return errorCount() === 0
    ? 'Aucune erreur dans cet enregistrement.'
    : plural(errorCount(), 'erreur');
}

function eventElapsedLabel(item: SendContextEvent): string {
  const firstTimestamp = visibleEvents()[0]?.timestamp ?? item.timestamp;
  const elapsed =
    selectedParticipantId() === 'all'
      ? (item.globalElapsedMs ??
        item.elapsedMs ??
        item.timestamp - firstTimestamp)
      : (item.elapsedMs ?? item.timestamp - firstTimestamp);
  return elapsed >= 1000
    ? `${(elapsed / 1000).toFixed(1)} s`
    : `${elapsed.toFixed(0)} ms`;
}

function stopReplay(): void {
  send('stop');
  replayPlaybackRequested = false;
  stopReplayVisibilityClock();
  replayClockElapsedMs = 0;
  updateActiveReplayFrame(0);
  setNextActionCountdown(undefined);
  difference.set(undefined);
  status.set('Replay arrêté.');
}

function openImport(): void {
  // A fresh sheet: not the last session that was opened.
  sessionText.set('');
  loadError.set(undefined);
  importOpen.set(true);
}

function closeImport(): void {
  importOpen.set(false);
}

function importPastedSession(): void {
  loadedArchiveSessionId = undefined;
  importJson(sessionText());
  if (session()) importOpen.set(false);
  scheduleReplayPreparation();
}

function setShowAllEvents(next: boolean): void {
  showAllEvents.set(next);
  eventTimelinePage.set(0);
}

function recordingCaption(): string {
  const recorded = session();
  if (!recorded)
    return 'La session demandée est introuvable ou a été supprimée.';
  const truncated = recorded.truncated
    ? ' · archive tronquée, onglets incomplets exclus du replay'
    : '';
  return `Format v${recorded.version} · ${plural(events().length, 'événement')}${truncated}`;
}

function viewportCaption(): string {
  if (selectedParticipantId() === 'all' && replayableParticipants().length > 1)
    return `${replayParticipantIds().length} viewports participants · lecture synchronisée`;
  const viewport = replayViewport() ?? session()?.viewport;
  return viewport
    ? `Viewport enregistré · ${viewport.width} × ${viewport.height} px · aperçu à ${Math.round(replayViewportScale() * 100)} %`
    : 'Viewport non enregistré · aperçu adaptatif';
}

export const DebugSessionDashboard = craftComponent(
  'DebugSessionDashboard',
  { providers: [provideDocModeView(), provideDocSeasonView()] },
  () => {
    startArchiveRefresh();

    /* ── the bar ──────────────────────────────────────────────────────── */
    const bar = div({ class: ui.bar }, [
      div({ class: ui.brand }, [
        div({ class: ui.brandMark }, [DocLogo({})]),
        div([
          span({ class: ui.brandName }, 'craft-ts'),
          span({ class: ui.brandKind }, ' · replay'),
        ]),
      ]),
      div({ class: ui.barTools }, [
        DocBadge({ tone: lit('tip'), label: lit('Local') }),
        DocSeasonPicker({
          label: lit('Saison'),
          menuId: lit('season-menu'),
          names: lit({
            auto: 'Automatique',
            spring: 'Printemps',
            summer: 'Été',
            autumn: 'Automne',
            winter: 'Hiver',
          }),
        }),
        DocModeToggle({ label: lit('Basculer entre clair et sombre') }),
      ]),
    ]);

    /* ── page 1 : the sessions ────────────────────────────────────────── */
    const sessionItems = forNode(
      savedSessions,
      { track: (saved) => saved.id },
      (saved) =>
        li({ class: ui.row }, [
          button(
            'savedSession',
            {
              type: 'button',
              class: ui.rowOpen,
              'data-lab': 'saved-session',
              click: function* () {
                const item = yield* saved();
                if (routeSessionId() !== item.id)
                  window.location.hash = sessionRoute(item.id);
                else void loadSavedSession(item.id);
              },
            },
            [
              span({ class: ui.rowTitle }, [
                span(function* () {
                  return sessionDate.format(
                    new Date((yield* saved()).createdAt),
                  );
                }),
                span(
                  {
                    class: badgeUi.root,
                    'data-tone': function* () {
                      const item = yield* saved();
                      return item.status === 'recording'
                        ? 'tip'
                        : item.status === 'interrupted'
                          ? 'warning'
                          : 'important';
                    },
                    hidden: function* () {
                      const item = yield* saved();
                      return item.status === 'completed' && !item.truncated;
                    },
                  },
                  function* () {
                    const item = yield* saved();
                    return item.status === 'recording'
                      ? 'En cours'
                      : item.status === 'interrupted'
                        ? 'Interrompue'
                        : 'Tronquée';
                  },
                ),
              ]),
              span({ class: ui.rowMeta }, function* () {
                const item = yield* saved();
                return [
                  plural(item.participantCount ?? 1, 'onglet'),
                  plural(item.eventCount, 'événement'),
                ].join(' · ');
              }),
              span({ class: ui.rowUrl, 'data-lab': 'saved-url' }, function* () {
                return (yield* saved()).startUrl;
              }),
            ],
          ),
          div({ class: ui.rowActions }, [
            button(
              'deleteSavedSession',
              {
                type: 'button',
                class: buttonUi.root,
                'data-lab': 'delete-session',
                'data-variant': 'link',
                hidden: function* () {
                  const item = yield* saved();
                  return pendingDeleteSessionId() === item.id;
                },
                'aria-label': function* () {
                  return `Supprimer la session ${(yield* saved()).id}`;
                },
                'data-tooltip': 'Supprime cette session de l’archive locale.',
                click: function* () {
                  pendingDeleteSessionId.set((yield* saved()).id);
                },
              },
              'Supprimer',
            ),
            div(
              {
                class: ui.confirm,
                'data-lab': 'delete-confirmation',
                role: 'group',
                'aria-label': 'Confirmer la suppression de la session',
                hidden: function* () {
                  const item = yield* saved();
                  return pendingDeleteSessionId() !== item.id;
                },
              },
              [
                span('Supprimer de l’archive ?'),
                button(
                  'cancelDeleteSession',
                  {
                    type: 'button',
                    class: buttonUi.root,
                    'data-variant': 'secondary',
                    'data-lab': 'cancel-delete-session',
                    click: () => pendingDeleteSessionId.set(undefined),
                  },
                  'Annuler',
                ),
                button(
                  'confirmDeleteSession',
                  {
                    type: 'button',
                    class: buttonUi.root,
                    'data-variant': 'danger',
                    'data-lab': 'confirm-delete-session',
                    click: function* () {
                      void deleteSavedSession((yield* saved()).id);
                    },
                  },
                  'Supprimer définitivement',
                ),
              ],
            ),
          ]),
        ]),
    );

    const importDialog = DocDialog({
      heading: lit('Importer une session'),
      dialogId: lit('import-session'),
      open: function* () {
        return importOpen();
      },
      dismiss: closeImport as never,
      body: content(() => [
        div({ class: ui.importFields }, [
          p(
            { class: ui.lede },
            'Un export JSON v1 ou v2. Les sessions tronquées restent consultables mais ne sont pas rejouables.',
          ),
          input('sessionFile', {
            type: 'file',
            accept: 'application/json,.json',
            'aria-label': 'Importer une session JSON',
            change: fileChanged,
          }),
          textarea('sessionJson', {
            class: ui.importText,
            rows: 8,
            placeholder: 'Ou colle un export craft-debug-session…',
            value: sessionText,
            input: (event: Event) =>
              sessionText.set((event.target as HTMLTextAreaElement).value),
            'aria-label': 'Session JSON',
          }),
          p(
            {
              class: ui.importError,
              role: 'alert',
              hidden: computed(() => loadError() === undefined),
            },
            computed(() => loadError() ?? ''),
          ),
          div({ class: ui.importActions }, [
            button(
              'importSession',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'primary',
                click: importPastedSession,
              },
              'Valider la session',
            ),
          ]),
        ]),
      ]),
    });

    const listPage = div(
      {
        class: ui.scroll,
        'data-lab': 'list-page',
        hidden: computed(() => page() !== 'sessions'),
      },
      [
        div({ class: ui.listPage }, [
          div({ class: ui.listHead }, [
            div([
              heading({ class: ui.title }, 'Sessions'),
              p(
                { class: ui.lede },
                computed(
                  () =>
                    `${plural(savedSessions().length, 'session')} · enregistrées sur cette machine, rien n’est envoyé.`,
                ),
              ),
            ]),
            button(
              'openImport',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'secondary',
                click: openImport,
              },
              'Importer un fichier',
            ),
          ]),
          div({ class: ui.gap, hidden: computed(() => archiveReachable()) }, [
            DocCallout({
              tone: lit('warning'),
              caption: lit('Archive injoignable'),
              body: content(() => [
                p(
                  { 'data-lab': 'archive-status', role: 'status' },
                  archiveStatus,
                ),
              ]),
            }),
          ]),
          ul({ class: ui.sessions }, sessionItems),
          p(
            {
              class: ui.empty,
              'data-lab': 'empty',
              hidden: computed(
                () => savedSessions().length > 0 || !archiveReachable(),
              ),
            },
            'Aucune session pour le moment. Lance ton application avec l’enregistrement activé : ses sessions apparaissent ici.',
          ),
          importDialog,
        ]),
      ],
    );

    /* ── page 2 : the replay ──────────────────────────────────────────── */
    const head = div({ class: ui.head }, [
      button(
        'backToSessions',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          click: () => {
            window.location.hash = '#/';
          },
        },
        '← Sessions',
      ),
      div({ class: ui.headTitle }, [
        heading({ class: ui.headName }, computed(currentSessionTitle)),
        p(
          { class: ui.headUrl },
          computed(() => session()?.startUrl ?? ''),
        ),
      ]),
      div({ class: ui.headTools }, [
        select(
          'participantFilter',
          {
            class: ui.tabSelect,
            value: selectedParticipantId,
            hidden: computed(() => replayableParticipants().length <= 1),
            change: (event: Event) =>
              selectParticipant((event.target as HTMLSelectElement).value),
            'aria-label': 'Onglets à visionner',
          },
          [
            option({ value: 'all' }, 'Tous les onglets'),
            forNode(
              replayableParticipants,
              { track: (participant) => participant.id },
              (participant) =>
                option(
                  {
                    value: function* () {
                      return (yield* participant()).id;
                    },
                  },
                  function* () {
                    return participantOptionLabel(yield* participant());
                  },
                ),
            ),
          ],
        ),
        button(
          'fullscreen',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'aria-description': 'Affiche l’application cible en plein écran.',
            'data-tooltip':
              'Agrandit l’application cible en plein écran pour inspecter le replay.',
            click: () => {
              const participantId = replayParticipantIds()[0];
              const frame = participantId
                ? replayFrameFor(participantId)
                : undefined;
              void frame?.requestFullscreen?.();
            },
            disabled: computed(() => !connected()),
          },
          'Plein écran',
        ),
        button(
          'toggleJournal',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': function* () {
              return errorCount() > 0 ? 'tonal' : 'secondary';
            },
            'aria-expanded': function* () {
              return sidePanelOpen() ? 'true' : 'false';
            },
            click: () => sidePanelOpen.set(!sidePanelOpen()),
          },
          'Journal',
        ),
      ]),
    ]);

    const notices = div({ class: ui.notices }, [
      div(
        {
          class: ui.gap,
          'data-lab': 'diff',
          hidden: computed(() => !hasDifference()),
        },
        [
          DocCallout({
            tone: lit('warning'),
            caption: lit('Le replay s’écarte de l’enregistrement'),
            body: content(() => [
              div({ class: ui.gap }, [
                p(
                  computed(
                    () =>
                      `Premier écart à l’événement ${difference()?.eventId ?? '?'}. La lecture est en pause.`,
                  ),
                ),
                details([
                  summary('Voir le détail'),
                  div({ class: ui.compare }, [
                    div([
                      span({ class: ui.compareLabel }, 'Attendu'),
                      pre(
                        { class: ui.code },
                        computed(() =>
                          JSON.stringify(difference()?.expected, null, 2),
                        ),
                      ),
                    ]),
                    div([
                      span({ class: ui.compareLabel }, 'Observé'),
                      pre(
                        { class: ui.code },
                        computed(() =>
                          JSON.stringify(difference()?.actual, null, 2),
                        ),
                      ),
                    ]),
                  ]),
                ]),
                div({ class: ui.gapActions }, [
                  button(
                    'forceReplayRecovery',
                    {
                      type: 'button',
                      class: buttonUi.root,
                      'data-variant': 'primary',
                      'data-lab': 'force-recovery',
                      hidden: computed(() => !canForceRecovery()),
                      click: () => {
                        status.set('Application de la reprise forcée…');
                        if (differenceParticipantId)
                          send('force-recover', {}, differenceParticipantId);
                      },
                    },
                    'Forcer l’état attendu et continuer',
                  ),
                  button(
                    'skipToCheckpoint',
                    {
                      type: 'button',
                      class: buttonUi.root,
                      'data-variant': 'secondary',
                      'data-lab': 'force-recovery',
                      hidden: computed(() => !canSkipDifference()),
                      click: () => {
                        status.set('Restauration du prochain checkpoint…');
                        if (differenceParticipantId)
                          send(
                            'skip-to-checkpoint',
                            {},
                            differenceParticipantId,
                          );
                      },
                    },
                    'Ignorer jusqu’au prochain point de reprise',
                  ),
                ]),
              ]),
            ]),
          }),
        ],
      ),
      div(
        {
          class: ui.gap,
          'data-lab': 'partial',
          hidden: computed(() => partialReplay() === undefined),
        },
        [
          DocCallout({
            tone: lit('info'),
            caption: lit('Replay partiel'),
            body: content(() => [
              p(
                computed(() => {
                  const partial = partialReplay();
                  return partial
                    ? `Replay partiel · portion ${partial.from}–${partial.to} ignorée · checkpoint ${partial.checkpointEventId}`
                    : '';
                }),
              ),
            ]),
          }),
        ],
      ),
      div(
        {
          class: ui.gap,
          'data-lab': 'problem',
          hidden: computed(
            () => loadError() === undefined && replayState() !== 'error',
          ),
        },
        [
          DocCallout({
            tone: lit('danger'),
            caption: lit('Impossible de poursuivre'),
            body: content(() => [p(computed(() => loadError() ?? status()))]),
          }),
        ],
      ),
      div(
        {
          class: ui.gap,
          'data-lab': 'replay-warning',
          hidden: computed(() => replayWarnings().length === 0),
        },
        [
          DocCallout({
            tone: lit('important'),
            caption: lit('À noter'),
            body: content(() => [
              p(computed(() => replayWarnings().join(' · '))),
            ]),
          }),
        ],
      ),
    ]);

    const stage = div({ class: ui.stage, id: 'replay-stage' }, [
      div(
        {
          class: ui.skeleton,
          hidden: computed(() => !replaySkeletonVisible()),
          'aria-hidden': 'true',
        },
        [div({ class: ui.skeletonBlock })],
      ),
      div({ class: ui.grid, id: 'replay-frame-grid' }),
    ]);

    const canStep = computed(
      () =>
        !connected() ||
        !replayableEvents()[replayIndex()] ||
        !['ready', 'paused'].includes(replayState()),
    );

    const playbar = div({ class: ui.playbar }, [
      div({ class: ui.transport }, [
        button(
          'play',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            'aria-label': 'Lecture à vitesse réelle',
            'aria-description':
              'Rejoue les interactions en respectant les délais enregistrés.',
            'data-tooltip':
              'Lance le replay et respecte les délais réellement enregistrés entre les interactions.',
            click: playReplay,
            disabled: canStep,
          },
          'Lecture',
        ),
        button(
          'pause',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'aria-description': 'Met en pause la lecture chronométrée.',
            'data-tooltip':
              'Met en pause le replay. Tu peux le reprendre avec Lecture à vitesse réelle ou avancer avec Action suivante.',
            click: pauseReplay,
            disabled: computed(
              () => !connected() || replayState() !== 'playing',
            ),
          },
          'Pause',
        ),
        button(
          'restart',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'replay-restart',
            'aria-label': 'Recommencer le replay depuis le début',
            'aria-description':
              'Recharge les pages enregistrées et relance le replay depuis la première interaction.',
            'data-tooltip':
              'Recommence le replay depuis le début en rechargeant les pages enregistrées.',
            click: startReplay,
            disabled: computed(
              () =>
                ![
                  'ready',
                  'playing',
                  'paused',
                  'completed',
                  'error',
                ].includes(replayState()),
            ),
          },
          'Recommencer',
        ),
        button(
          'step',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'tonal',
            'data-lab': 'action-next',
            'aria-description':
              'Exécute immédiatement l’interaction affichée à droite.',
            'data-tooltip':
              'Exécute tout de suite l’interaction affichée à droite, sans attendre le délai enregistré.',
            click: stepNextReplayAction,
            disabled: canStep,
          },
          'Action suivante',
        ),
        button(
          'stop',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'link',
            'aria-description':
              'Arrête le replay et revient à la première interaction.',
            'data-tooltip':
              'Arrête la reproduction en cours et remet le curseur à la première interaction.',
            click: stopReplay,
            disabled: computed(
              () =>
                !connected() ||
                !['ready', 'playing', 'paused'].includes(replayState()),
            ),
          },
          'Arrêter',
        ),
      ]),
      div({ class: ui.progress }, [
        div({ class: ui.progressTrack }, [
          div({
            class: ui.progressFill,
            style: function* () {
              const total = replayableEvents().length;
              return assign(
                progressVars.done,
                unit.pct(total ? (replayIndex() / total) * 100 : 0),
              );
            },
          }),
        ]),
        div({ class: ui.progressText }, [
          p(
            { 'data-lab': 'replay-progress', role: 'status' },
            computed(progressLabel),
          ),
          p({ class: ui.next }, [
            span({ 'data-lab': 'next-action-name' }, computed(nextActionLabel)),
            span(
              {
                'data-lab': 'next-action-timing',
                role: 'timer',
                hidden: computed(() => nextActionTimingLabel() === ''),
              },
              computed(() => ` · ${nextActionTimingLabel()}`),
            ),
          ]),
        ]),
      ]),
    ]);

    /* ── the side panel: the journal, then the details ────────────────── */
    const journalPane = () =>
      div({ class: ui.sideBody }, [
        div({ class: ui.pager }, [
          p(computed(journalSummary)),
          DocSwitch({
            label: lit('Tout afficher'),
            controlId: lit('journal-all'),
            on: function* () {
              return showAllEvents();
            },
            disabled: lit(false),
            toggle: setShowAllEvents as never,
          }),
        ]),
        div({ class: ui.scroll }, [
          ul(
            { class: ui.events, 'data-lab': 'events' },
            forNode(visibleEventPage, { track: (event) => event.id }, (event) =>
              li(
                {
                  class: ui.event,
                  'data-entry': function* () {
                    const item = yield* event();
                    return (
                      eventSeverity(item) ??
                      (item.id === activeReplayEventId()
                        ? 'current'
                        : undefined)
                    );
                  },
                },
                [
                  span({ class: ui.eventName }, function* () {
                    return eventDiagnosticLabel(yield* event());
                  }),
                  span({ class: ui.eventMeta }, [
                    span(function* () {
                      const item = yield* event();
                      return `${item.kind} · ${item.phase}`;
                    }),
                    span(function* () {
                      return eventElapsedLabel(yield* event());
                    }),
                  ]),
                ],
              ),
            ),
          ),
        ]),
        div(
          {
            class: ui.pager,
            hidden: computed(() => eventTimelinePageCount() <= 1),
          },
          [
            button(
              'previousTimelinePage',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'link',
                disabled: computed(() => eventTimelinePage() === 0),
                click: () =>
                  eventTimelinePage.set(Math.max(0, eventTimelinePage() - 1)),
              },
              'Événements précédents',
            ),
            span(
              computed(
                () =>
                  `${eventTimelinePage() + 1} / ${eventTimelinePageCount()}`,
              ),
            ),
            button(
              'nextTimelinePage',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'link',
                disabled: computed(
                  () => eventTimelinePage() + 1 >= eventTimelinePageCount(),
                ),
                click: () =>
                  eventTimelinePage.set(
                    Math.min(
                      eventTimelinePageCount() - 1,
                      eventTimelinePage() + 1,
                    ),
                  ),
              },
              'Événements suivants',
            ),
          ],
        ),
      ]);

    const fact = (name: string, value: CraftNodeChild, hook?: string) =>
      div({ class: ui.fact }, [
        p({ class: ui.factLabel }, name),
        p({ class: ui.factValue, 'data-lab': hook }, value),
      ]);

    const detailsPane = () =>
      div({ class: ui.sidePane, 'data-lab': 'left' }, [
        fact(
          'Page de départ',
          computed(() => session()?.startUrl ?? 'Aucune session chargée.'),
        ),
        fact('Enregistrement', computed(recordingCaption)),
        fact('État du replay', status, 'status'),
        fact('Fenêtre', computed(viewportCaption), 'viewport-caption'),
        p(
          {
            class: ui.lede,
            'data-lab': 'environment-warning',
            hidden: computed(() => !environmentWarning()),
            role: 'status',
          },
          environmentWarning,
        ),
        div([
          p({ class: ui.fieldLabel }, 'URL locale instrumentée'),
          input('targetUrl', {
            class: ui.fieldInput,
            type: 'url',
            value: targetUrl,
            input: (event: Event) =>
              targetUrl.set((event.target as HTMLInputElement).value),
            change: () => scheduleReplayPreparation(),
            'aria-label': 'URL de l’application cible',
          }),
        ]),
        div([
          p({ class: ui.fieldLabel }, 'Point de départ'),
          select(
            'startMode',
            {
              class: ui.tabSelect,
              value: startMode,
              change: (event: Event) => {
                startMode.set(
                  (event.target as HTMLSelectElement).value === 'snapshot'
                    ? 'snapshot'
                    : 'url',
                );
                scheduleReplayPreparation();
              },
              'aria-label': 'Mode de démarrage',
            },
            [
              option({ value: 'url' }, 'Recharger l’URL enregistrée'),
              option({ value: 'snapshot' }, 'Restaurer le snapshot initial'),
            ],
          ),
        ]),
        button(
          'export',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'aria-description':
              'Exporte la session de diagnostic capturée par l’application cible, l’ajoute au dashboard et télécharge un fichier JSON.',
            'data-tooltip':
              'Récupère la session de diagnostic de l’application cible, l’ajoute au dashboard et télécharge le JSON.',
            click: () => {
              const participantId =
                selectedParticipantId() === 'all'
                  ? replayParticipantIds()[0]
                  : selectedParticipantId();
              if (participantId) send('export', {}, participantId);
              status.set('Export demandé à l’application cible…');
            },
          },
          'Exporter la cible',
        ),
      ]);

    const side = section(
      {
        class: ui.side,
        'data-lab': 'side',
        'aria-label': 'Journal et détails',
        hidden: computed(() => !sidePanelOpen()),
      },
      [
        div({ class: ui.sideHead }, [
          p(
            { class: ui.factLabel },
            computed(() =>
              errorCount() > 0
                ? plural(
                    errorCount(),
                    'erreur enregistrée',
                    'erreurs enregistrées',
                  )
                : 'Rien à signaler',
            ),
          ),
          button(
            'closeJournal',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              'aria-label': 'Fermer le journal',
              click: () => sidePanelOpen.set(false),
            },
            'Fermer',
          ),
        ]),
        DocTabs({
          group: lit('side'),
          surface: lit('page' as const),
          items: lit([
            { id: 'journal', label: 'Journal', render: journalPane },
            { id: 'details', label: 'Détails', render: detailsPane },
          ]),
        }),
      ],
    );

    const detailPage = div(
      {
        class: ui.page,
        'data-lab': 'detail-page',
        hidden: computed(() => page() !== 'detail'),
      },
      [
        head,
        div({ class: ui.workspace }, [
          div({ class: ui.main }, [notices, stage, playbar]),
          side,
        ]),
      ],
    );

    return div({ class: ui.root }, [
      bar,
      div({ class: ui.page }, [listPage, detailPage]),
    ]);
  },
);
