import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  input,
  label,
  option,
  p,
  pre,
  section,
  select,
  span,
  textarea,
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
  validateReplayExport,
} from '@craft-ts/component';
import {
  captureDebugSessionEnvironment,
  environmentDifferences,
} from '@craft-ts/component';

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
    ? `Environnement différent de l’enregistrement : ${differences.join(', ')}. Le user-agent n’est pas simulé et l’iframe utilise le navigateur actuel.`
    : '';
});
const selectedParticipantId = signal('all');
const savedSessions = signal<readonly SessionSummary[]>([]);
const pendingDeleteSessionId = signal<string | undefined>(undefined);
const archiveStatus = signal('Connexion au serveur de sessions…');
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
const replayState = signal('idle');
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
  return events().filter((event) => event.participantId === selected);
});
const replayableEvents = computed(() =>
  visibleEvents().filter(
    (event) =>
      event.phase === 'emitted' &&
      (event.kind === 'dom' ||
        event.kind === 'scroll' ||
        event.kind === 'viewport'),
  ),
);
const activeReplayEventId = computed(
  () => replayableEvents()[Math.max(0, replayIndex() - 1)]?.id,
);
type ReplayFrameConnection = {
  readonly participantId: string;
  href: string;
  nonce: string;
  connected: boolean;
  started: boolean;
  status: string;
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
    if (remaining === undefined) return 'Synchronisation avec le replay…';
    if (remaining <= 0) return 'La prochaine action arrive maintenant';
    return `Prochaine action dans ${(remaining / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  }
  if (replayState() === 'paused') return 'Lecture en pause';
  if (replayState() === 'completed')
    return 'Replay terminé · aucune action restante';
  if (replayState() === 'ready')
    return 'Prête · exécution immédiate en pas à pas';
  return 'Prépare le replay pour voir et exécuter la prochaine action';
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
      viewportFrame.style.removeProperty('width');
      viewportFrame.style.removeProperty('height');
      frame.style.removeProperty('width');
      frame.style.removeProperty('height');
      frame.style.removeProperty('transform');
      continue;
    }

    const availableWidth = card.clientWidth;
    const availableHeight = Math.max(180, stage.clientHeight - 48);
    if (availableWidth < 1 || availableHeight < 1) continue;
    const scale = Math.min(
      1,
      availableWidth / viewport.width,
      availableHeight / viewport.height,
    );
    viewportFrame.style.width = `${viewport.width * scale}px`;
    viewportFrame.style.height = `${viewport.height * scale}px`;
    frame.style.width = `${viewport.width}px`;
    frame.style.height = `${viewport.height}px`;
    frame.style.transform = `scale(${scale})`;
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
    archiveStatus.set(
      `${savedSessions().length} session${savedSessions().length === 1 ? '' : 's'} dans l’archive locale`,
    );
  } catch {
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
    status.set(
      `Impossible de charger la session · ${error instanceof Error ? error.message : String(error)}`,
    );
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

function importJson(text: string): void {
  loadedArchiveCreatedAtMs = undefined;
  sessionText.set(text);
  const result = validateDebugSessionExport(text.trim());
  if (!result.ok) {
    endReplayLoadingIndicator();
    session.set(undefined);
    events.set([]);
    status.set(result.error);
    return;
  }
  session.set(result.session);
  sessionParticipants.set(
    Array.isArray(result.session.participants)
      ? result.session.participants
      : [],
  );
  selectedParticipantId.set('all');
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
  const participantEvents = imported.events.filter(
    (event) =>
      event.participantId === participantId ||
      (participants.length === 1 && event.participantId === undefined),
  );
  const participantClips = imported.clips.filter(
    (clip) => isRecord(clip) && clip['participantId'] === participantId,
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

function sessionForReplay(): SendContextReplayExport | undefined {
  const participants = sessionParticipants();
  const selected = selectedParticipantId();
  if (selected === 'all')
    return participants.length <= 1 ? session() : undefined;
  return sessionForParticipant(selected);
}

function replayParticipantIds(): readonly string[] {
  const participants = sessionParticipants();
  if (participants.length === 0) return ['default'];
  const selected = selectedParticipantId();
  const candidates =
    selected === 'all'
      ? participants
      : participants.filter((participant) => participant.id === selected);
  return candidates
    .filter((participant) => {
      const replay = sessionForParticipant(participant.id);
      return replay !== undefined && !replay.truncated;
    })
    .map((participant) => participant.id);
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

function replayFramePlaceholderId(participantId: string): string {
  return `replay-frame-placeholder-${participantId}`;
}

function replayMarkerId(participantId: string): string {
  return replayParticipantIds()[0] === participantId
    ? 'replay-click-marker'
    : `replay-click-marker-${participantId}`;
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
    card.className = 'lab__replay-tile';
    card.hidden = participantId !== activeReplayParticipantId();
    card.id = replayFrameCardId(participantId);
    const title = document.createElement('h3');
    title.className = 'lab__replay-tile-title';
    const participantName = document.createElement('span');
    participantName.className = 'lab__replay-tile-name';
    participantName.textContent = replayParticipantTitle(participantId);
    const activeBadge = document.createElement('span');
    activeBadge.className = 'lab__replay-active-badge';
    activeBadge.textContent = 'ACTIF';
    title.append(participantName, activeBadge);
    const viewportFrame = document.createElement('div');
    viewportFrame.className = 'lab__viewport-frame';
    viewportFrame.id = replayFrameWrapperId(participantId);
    const frame = document.createElement('iframe');
    frame.id =
      index === 0 ? 'replay-target' : replayFrameElementId(participantId);
    frame.dataset['replayParticipant'] = participantId;
    frame.title = `${replayParticipantTitle(participantId)} · replay`;
    frame.addEventListener('load', () => handshake(participantId));
    const placeholder = document.createElement('div');
    placeholder.className = 'lab__replay-frame-placeholder';
    placeholder.id = replayFramePlaceholderId(participantId);
    placeholder.hidden = true;
    const visibilityOverlay = document.createElement('div');
    visibilityOverlay.className = 'lab__replay-visibility-overlay';
    visibilityOverlay.hidden = true;
    visibilityOverlay.setAttribute('aria-label', 'Onglet non visible');
    visibilityOverlay.textContent = 'Non visible';
    const marker = document.createElement('div');
    marker.className = 'lab__click-marker';
    marker.id = replayMarkerId(participantId);
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    viewportFrame.append(frame, visibilityOverlay, marker, placeholder);
    card.append(title, viewportFrame);
    grid.append(card);
  });
  updateReplayViewport();
}

function updateReplayTileIndicators(): void {
  for (const id of replayVisibilityParticipantIds) {
    const card = document.getElementById(replayFrameCardId(id));
    if (!card) continue;
    const isRecordedActive = replayRecordedActiveParticipantId === id;
    const isActionTarget = replayActionParticipantId === id;
    card.classList.toggle('lab__replay-tile--focused', isRecordedActive);
    card.classList.toggle('lab__replay-tile--action-target', isActionTarget);
    const badge = card.querySelector('.lab__replay-active-badge');
    if (badge)
      badge.textContent =
        isRecordedActive && isActionTarget
          ? 'ACTIF · ACTION'
          : isRecordedActive
            ? 'ACTIF'
            : isActionTarget
              ? 'ACTION'
              : '';
    const visibilityOverlay = card.querySelector<HTMLDivElement>(
      '.lab__replay-visibility-overlay',
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
  const terminalChanges = sessionParticipants().flatMap((participant) => {
    if (!replayVisibilityParticipantIds.includes(participant.id)) return [];
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

function replayTimelineOriginMs(): number {
  return replaySessionStartAtMs(sessionsForReplay());
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

function selectedParticipantLabel(): string {
  const selected = selectedParticipantId();
  if (selected === 'all') return 'Tous les onglets';
  const participant = sessionParticipants().find(
    (item) => item.id === selected,
  );
  return participant?.title ?? participant?.startUrl ?? 'Onglet sélectionné';
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
  const localActions = participantSession.events.filter(
    (event) =>
      event.phase === 'emitted' &&
      (event.kind === 'dom' ||
        event.kind === 'scroll' ||
        event.kind === 'viewport'),
  );
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
  selectedParticipantId.set(value);
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
          ...(connection.timelineOriginMs === undefined
            ? {}
            : { timelineOriginMs: connection.timelineOriginMs }),
        },
        target.url.origin,
      );
      connection.started = true;
      connection.status = 'ready';
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
    } else if (data['type'] === 'error') {
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
      connection.status = nextState;
      updateGlobalReplayState();
      setNextActionCountdown(
        nextState === 'playing' && typeof data['nextDelayMs'] === 'number'
          ? data['nextDelayMs']
          : undefined,
      );
      const total = replayableEvents().length;
      status.set(
        `Replay · ${data['state'] === 'playing' ? 'lecture' : 'étape'} ${replayIndex()} / ${total}`,
      );
    } else if (data['type'] === 'interaction') {
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
        marker.style.left = `${x * scale}px`;
        marker.style.top = `${y * scale}px`;
        marker.setAttribute(
          'aria-label',
          `Clic rejoué · ${String(data['name'] ?? 'interaction')}`,
        );
        marker.hidden = false;
        marker.style.animation = 'none';
        void marker.offsetWidth;
        marker.style.animation = '';
      }
    } else if (data['type'] === 'scroll-step') {
      setReplayActionTarget(participantId);
      const marker = document.getElementById(replayMarkerId(participantId));
      if (marker) marker.hidden = true;
    } else if (data['type'] === 'viewport-step') {
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
        nextState === 'completed'
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
      { channel: CHANNEL, type, ...payload },
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
      href: target.url.href,
      nonce: '',
      connected: false,
      started: false,
      status: 'scheduled',
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
        scheduleReplayPreparation();
      })
      .catch((error: unknown) => status.set(String(error)));
  }
}

export const DebugSessionDashboard = craftComponent(
  'DebugSessionDashboard',
  {},
  () => {
    startArchiveRefresh();
    return div({ class: 'lab' }, [
      div({ class: 'lab__header' }, [
        div([
          span({ class: 'lab__eyebrow' }, 'CRAFTTS · LOCAL SESSION LAB'),
          heading('Investigation et replay'),
        ]),
        span({ class: 'lab__privacy' }, 'LOCAL · aucun envoi externe'),
      ]),
      div(
        {
          class: 'lab__list-page',
          hidden: computed(() => page() !== 'sessions'),
        },
        [
          section({ class: 'panel' }, [
            div({ class: 'lab__section-heading' }, [
              div([
                heading('Sessions locales'),
                p(
                  'Sélectionne une session pour consulter ses événements et la rejouer.',
                ),
              ]),
              button(
                'refreshSessions',
                {
                  type: 'button',
                  click: () => void refreshSavedSessions(),
                },
                'Actualiser',
              ),
            ]),
            p({ class: 'lab__archive-status', role: 'status' }, archiveStatus),
            div(
              { class: 'lab__saved-sessions' },
              forNode(savedSessions, { track: (saved) => saved.id }, (saved) =>
                div({ class: 'lab__saved-session-row' }, [
                  button(
                    'savedSession',
                    {
                      type: 'button',
                      class: 'lab__saved-session',
                      click: function* () {
                        const item = yield* saved();
                        if (routeSessionId() !== item.id)
                          window.location.hash = sessionRoute(item.id);
                        else void loadSavedSession(item.id);
                      },
                    },
                    [
                      span(function* () {
                        const item = yield* saved();
                        return new Intl.DateTimeFormat('fr-FR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(item.createdAt));
                      }),
                      span(function* () {
                        const item = yield* saved();
                        const state =
                          item.status === 'recording'
                            ? 'en cours'
                            : item.status === 'completed'
                              ? 'terminée'
                              : 'interrompue';
                        const participantCount = item.participantCount ?? 1;
                        const participants =
                          participantCount > 1
                            ? ` · ${participantCount} onglets`
                            : '';
                        return `${state} · ${item.eventCount} événements${participants}${item.truncated ? ' · tronquée' : ''}`;
                      }),
                      span({ class: 'lab__saved-date' }, function* () {
                        const item = yield* saved();
                        return `Modifiée ${new Intl.DateTimeFormat('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(item.updatedAt))}`;
                      }),
                      span({ class: 'lab__saved-url' }, function* () {
                        return (yield* saved()).startUrl;
                      }),
                    ],
                  ),
                  button(
                    'deleteSavedSession',
                    {
                      type: 'button',
                      class: 'lab__delete-session',
                      hidden: function* () {
                        const item = yield* saved();
                        return pendingDeleteSessionId() === item.id;
                      },
                      'aria-label': function* () {
                        return `Supprimer la session ${(yield* saved()).id}`;
                      },
                      'data-tooltip':
                        'Supprime cette session de l’archive locale.',
                      click: function* () {
                        const item = yield* saved();
                        pendingDeleteSessionId.set(item.id);
                      },
                    },
                    'Supprimer',
                  ),
                  div(
                    {
                      class: 'lab__delete-confirmation',
                      role: 'group',
                      'aria-label': 'Confirmer la suppression de la session',
                      hidden: function* () {
                        const item = yield* saved();
                        return pendingDeleteSessionId() !== item.id;
                      },
                    },
                    [
                      span('Supprimer cette session de l’archive locale ?'),
                      button(
                        'cancelDeleteSession',
                        {
                          type: 'button',
                          class: 'lab__cancel-delete-session',
                          click: () => pendingDeleteSessionId.set(undefined),
                        },
                        'Annuler',
                      ),
                      button(
                        'confirmDeleteSession',
                        {
                          type: 'button',
                          class: 'lab__confirm-delete-session',
                          click: function* () {
                            const item = yield* saved();
                            void deleteSavedSession(item.id);
                          },
                        },
                        'Supprimer définitivement',
                      ),
                    ],
                  ),
                ]),
              ),
            ),
            p(
              {
                class: 'lab__empty',
                hidden: computed(() => savedSessions().length > 0),
              },
              'Aucune session enregistrée pour le moment.',
            ),
          ]),
          section({ class: 'panel' }, [
            heading('Importer une session'),
            p(
              'Importe un export JSON v1 ou v2. Les sessions tronquées restent consultables mais ne sont pas rejouables.',
            ),
            input('sessionFile', {
              type: 'file',
              accept: 'application/json,.json',
              'aria-label': 'Importer une session JSON',
              change: fileChanged,
            }),
            textarea('sessionJson', {
              rows: 8,
              placeholder: 'Colle un export craft-debug-session…',
              value: sessionText,
              input: (event: Event) =>
                sessionText.set((event.target as HTMLTextAreaElement).value),
              'aria-label': 'Session JSON',
            }),
            button(
              'importSession',
              {
                type: 'button',
                click: () => {
                  loadedArchiveSessionId = undefined;
                  importJson(sessionText());
                  scheduleReplayPreparation();
                },
              },
              'Valider la session',
            ),
            p({ class: 'lab__status', role: 'status' }, status),
          ]),
        ],
      ),
      div(
        {
          class: 'lab__detail-page',
          hidden: computed(() => page() !== 'detail'),
        },
        [
          div({ class: 'lab__detail-heading' }, [
            button(
              'backToSessions',
              {
                type: 'button',
                click: () => {
                  window.location.hash = '#/';
                },
              },
              '← Toutes les sessions',
            ),
            heading(
              computed(() => {
                const selected = savedSessions().find(
                  (item) => item.id === routeSessionId(),
                );
                if (selected) {
                  return new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(selected.createdAt));
                }
                return 'Session importée';
              }),
            ),
          ]),
          div({ class: 'lab__grid' }, [
            div({ class: 'lab__left' }, [
              section({ class: 'panel' }, [
                heading('Détails de la session'),
                p({ class: 'lab__status', role: 'status' }, status),
                p(
                  computed(
                    () => session()?.startUrl ?? 'Aucune session chargée.',
                  ),
                ),
                p(
                  computed(() =>
                    session()
                      ? `Format v${session()!.version} · ${events().length} événements${session()!.truncated ? ' · archive tronquée, onglets incomplets exclus du replay' : ''}`
                      : 'La session demandée est introuvable ou a été supprimée.',
                  ),
                ),
              ]),
              section({ class: 'panel' }, [
                heading('Premier écart'),
                p(
                  {
                    class: 'lab__partial',
                    hidden: computed(() => partialReplay() === undefined),
                  },
                  computed(() => {
                    const partial = partialReplay();
                    return partial
                      ? `Replay partiel · portion ${partial.from}–${partial.to} ignorée · checkpoint ${partial.checkpointEventId}`
                      : '';
                  }),
                ),
                p(
                  {
                    class: 'lab__empty',
                    hidden: computed(() => hasDifference()),
                  },
                  'Aucun écart signalé.',
                ),
                div(
                  {
                    class: 'lab__diff',
                    hidden: computed(() => !hasDifference()),
                  },
                  [
                    div([
                      span('Attendu'),
                      pre(
                        computed(() =>
                          JSON.stringify(difference()?.expected, null, 2),
                        ),
                      ),
                    ]),
                    div([
                      span('Observé'),
                      pre(
                        computed(() =>
                          JSON.stringify(difference()?.actual, null, 2),
                        ),
                      ),
                    ]),
                    button(
                      'forceReplayRecovery',
                      {
                        type: 'button',
                        class: 'lab__force-recovery',
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
                        class: 'lab__force-recovery',
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
                  ],
                ),
              ]),
              section({ class: 'panel' }, [
                heading(
                  computed(() => `Événements · ${visibleEvents().length}`),
                ),
                label('Onglets à visionner'),
                select(
                  'participantFilter',
                  {
                    value: selectedParticipantId,
                    change: (event: Event) =>
                      selectParticipant(
                        (event.target as HTMLSelectElement).value,
                      ),
                    'aria-label': 'Onglets à visionner',
                  },
                  [
                    option({ value: 'all' }, 'Tous les onglets'),
                    forNode(
                      sessionParticipants,
                      { track: (participant) => participant.id },
                      (participant) =>
                        option(
                          {
                            value: function* () {
                              return (yield* participant()).id;
                            },
                          },
                          function* () {
                            const item = yield* participant();
                            return participantOptionLabel(item);
                          },
                        ),
                    ),
                  ],
                ),
                p(
                  { class: 'lab__participant-help' },
                  computed(() =>
                    sessionParticipants().length > 1 &&
                    selectedParticipantId() === 'all'
                      ? 'Tous les onglets rejouables sont affichés côte à côte. La lecture suit leur chronologie commune ; un onglet resté inactif conserve sa place sans recevoir d’action.'
                      : sessionParticipants().length > 1
                        ? `Onglet sélectionné · ${selectedParticipantLabel()}. Un onglet masqué reste dans la session sans générer d’événements tant qu’il est inactif.`
                        : 'Cette session ne contient qu’un onglet participant.',
                  ),
                ),
                p(
                  {
                    class: 'lab__environment-warning',
                    hidden: computed(() => !environmentWarning()),
                    role: 'status',
                  },
                  environmentWarning,
                ),
                div(
                  { class: 'lab__events' },
                  forNode(
                    visibleEvents,
                    { track: (event) => event.id },
                    (event) =>
                      div(
                        {
                          class: function* () {
                            const item = yield* event();
                            return item.id === activeReplayEventId()
                              ? 'lab__event lab__event--current'
                              : 'lab__event';
                          },
                        },
                        [
                          span({ class: 'lab__event-kind' }, function* () {
                            return `${(yield* event()).kind} · ${(yield* event()).phase}`;
                          }),
                          span(function* () {
                            return (
                              (yield* event()).name ?? 'nom non disponible'
                            );
                          }),
                          span({ class: 'lab__event-time' }, function* () {
                            const item = yield* event();
                            const firstTimestamp =
                              visibleEvents()[0]?.timestamp ?? item.timestamp;
                            const elapsed =
                              selectedParticipantId() === 'all'
                                ? (item.globalElapsedMs ??
                                  item.elapsedMs ??
                                  item.timestamp - firstTimestamp)
                                : (item.elapsedMs ??
                                  item.timestamp - firstTimestamp);
                            return `${elapsed.toFixed(1)} ms`;
                          }),
                        ],
                      ),
                  ),
                ),
              ]),
            ]),
            div({ class: 'lab__right' }, [
              section({ class: 'panel' }, [
                heading('Application cible et replay'),
                label('URL locale instrumentée'),
                input('targetUrl', {
                  type: 'url',
                  value: targetUrl,
                  input: (event: Event) =>
                    targetUrl.set((event.target as HTMLInputElement).value),
                  change: () => scheduleReplayPreparation(),
                  'aria-label': 'URL de l’application cible',
                }),
                label('Point de départ'),
                select(
                  'startMode',
                  {
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
                    option(
                      { value: 'snapshot' },
                      'Restaurer le snapshot initial',
                    ),
                  ],
                ),
                div({ class: 'lab__actions' }, [
                  button(
                    'play',
                    {
                      type: 'button',
                      'aria-description':
                        'Rejoue les interactions en respectant les délais enregistrés.',
                      'data-tooltip':
                        'Lance le replay et respecte les délais réellement enregistrés entre les interactions.',
                      click: playReplay,
                      disabled: computed(
                        () =>
                          !connected() ||
                          !replayableEvents()[replayIndex()] ||
                          !['ready', 'paused'].includes(replayState()),
                      ),
                    },
                    'Lecture à vitesse réelle',
                  ),
                  button(
                    'pause',
                    {
                      type: 'button',
                      'aria-description':
                        'Met en pause la lecture chronométrée.',
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
                    'stop',
                    {
                      type: 'button',
                      'aria-description':
                        'Arrête le replay et revient à la première interaction.',
                      'data-tooltip':
                        'Arrête la reproduction en cours et remet le curseur à la première interaction.',
                      click: () => {
                        send('stop');
                        replayPlaybackRequested = false;
                        stopReplayVisibilityClock();
                        replayClockElapsedMs = 0;
                        updateActiveReplayFrame(0);
                        setNextActionCountdown(undefined);
                        difference.set(undefined);
                        status.set('Replay arrêté.');
                      },
                      disabled: computed(
                        () =>
                          !connected() ||
                          !['ready', 'playing', 'paused'].includes(
                            replayState(),
                          ),
                      ),
                    },
                    'Arrêter',
                  ),
                  button(
                    'export',
                    {
                      type: 'button',
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
                  button(
                    'fullscreen',
                    {
                      type: 'button',
                      'aria-description':
                        'Affiche l’application cible en plein écran.',
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
                ]),
                div({ class: 'lab__next-action' }, [
                  button(
                    'step',
                    {
                      type: 'button',
                      class: 'lab__action-next',
                      'aria-description':
                        'Exécute immédiatement l’interaction affichée sous ce bouton.',
                      'data-tooltip':
                        'Exécute tout de suite l’interaction affichée ci-dessous, sans attendre le délai enregistré.',
                      click: stepNextReplayAction,
                      disabled: computed(
                        () =>
                          !connected() ||
                          !replayableEvents()[replayIndex()] ||
                          !['ready', 'paused'].includes(replayState()),
                      ),
                    },
                    'Action suivante',
                  ),
                  p(
                    { class: 'lab__next-action-name' },
                    computed(() => {
                      const next = replayableEvents()[replayIndex()];
                      if (!next) return 'Aucune étape restante';
                      if (next.kind === 'scroll')
                        return `Défilement à venir · ${next.name ?? 'position enregistrée'}`;
                      if (next.kind === 'viewport') {
                        const viewport = next.payload as
                          | { width?: unknown; height?: unknown }
                          | undefined;
                        return `Viewport à venir · ${String(viewport?.width ?? '?')} × ${String(viewport?.height ?? '?')} px`;
                      }
                      return `Interaction à venir · ${next.name ?? 'nom non disponible'}`;
                    }),
                  ),
                  p(
                    {
                      class: 'lab__next-action-timing',
                      role: 'timer',
                    },
                    computed(nextActionTimingLabel),
                  ),
                ]),
                p(
                  { class: 'lab__replay-help' },
                  'La lecture respecte les délais enregistrés et affiche le compte à rebours. « Action suivante » exécute immédiatement l’interaction affichée.',
                ),
                p(
                  { class: 'lab__viewport-caption', 'aria-live': 'polite' },
                  computed(() => {
                    if (
                      selectedParticipantId() === 'all' &&
                      sessionParticipants().length > 1
                    )
                      return `${replayParticipantIds().length} viewports participants · lecture synchronisée`;
                    const viewport = replayViewport() ?? session()?.viewport;
                    return viewport
                      ? `Viewport enregistré · ${viewport.width} × ${viewport.height} px · aperçu à ${Math.round(replayViewportScale() * 100)} %`
                      : 'Viewport non enregistré · aperçu adaptatif';
                  }),
                ),
                div({ class: 'lab__replay-stage', id: 'replay-stage' }, [
                  div(
                    {
                      class: 'lab__replay-skeleton',
                      hidden: computed(() => !replaySkeletonVisible()),
                      'aria-hidden': 'true',
                    },
                    [
                      div({ class: 'lab__skeleton-title' }),
                      div({ class: 'lab__skeleton-viewport' }),
                    ],
                  ),
                  div({ class: 'lab__replay-grid', id: 'replay-frame-grid' }),
                ]),
                p(
                  { class: 'lab__replay-progress', role: 'status' },
                  computed(() => {
                    const total = replayableEvents().length;
                    return total
                      ? `${replayIndex()} / ${total} étapes · ${replayState()}`
                      : 'Aucune étape rejouable dans cette session.';
                  }),
                ),
              ]),
            ]),
          ]),
        ],
      ),
    ]);
  },
);
