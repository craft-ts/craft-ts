import {
  ɵcomputed as computed,
  craftSignal as signal,
  type SendContextEnvironmentProfile,
  type SendContextEvent,
  type SendContextReplayExport,
  type SendContextSessionParticipant,
} from '@craft-ts/core';
import {
  captureDebugSessionEnvironment,
  environmentDifferences,
  getReplaySteps,
} from '@craft-ts/component';
import { currentHash } from './replay-browser';
import {
  alignSharedTimeline,
  eventSeverity,
  participantContinuations,
  participantGroup,
  participantSession,
  type PartialReplay,
  type RecordingClock,
  type ReplayDifference,
  type ReplayFrameConnection,
  type ReplayParticipantState,
  type ReplaySlice,
  type ReplayStartMode,
  type ReplayTimer,
  type ReplayViewport,
  type VisibilityChange,
} from './replay-model';

/**
 * What the dashboard knows right now: the recording that is open, where the
 * replay is, and what the page around it is showing. The engine writes it, the
 * view reads it. One module holds it so that neither has to import the other.
 */

/* ── the recording ──────────────────────────────────────────────────────── */

export const sessionText = signal('');
export const session = signal<SendContextReplayExport | undefined>(undefined);
export const events = signal<readonly SendContextEvent[]>([]);
export const sessionParticipants = signal<
  readonly SendContextSessionParticipant[]
>([]);
export const selectedParticipantId = signal('all');
export const loadError = signal<string | undefined>(undefined);

/* ── the page ───────────────────────────────────────────────────────────── */

export const page = signal<'sessions' | 'detail'>('sessions');
export const importOpen = signal(false);
export const sidePanelOpen = signal(false);
export const showAllEvents = signal(false);
export const pendingDeleteSessionId = signal<string | undefined>(undefined);
export const eventTimelinePage = signal(0);
export const eventTimelinePageSize = 250;

/* ── the replay ─────────────────────────────────────────────────────────── */

export const targetUrl = signal(
  import.meta.env['VITE_CRAFT_REPLAY_TARGET_URL'] ?? 'http://localhost:4200/',
);
export const startMode = signal<ReplayStartMode>('url');
export const status = signal('Importe une session v3 pour commencer.');
export const connected = signal(false);
export const difference = signal<ReplayDifference | undefined>(undefined);
export const partialReplay = signal<PartialReplay | undefined>(undefined);
export const replayIndex = signal(0);
export const replayState = signal('idle');
export const replayWarnings = signal<readonly string[]>([]);
export const replaySkeletonVisible = signal(false);
export const activeReplayParticipantId = signal<string | undefined>(undefined);
export const replayViewportScale = signal(1);
export const replayViewport = signal<ReplayViewport | undefined>(undefined);
export const nextActionDelayMs = signal<number | undefined>(undefined);

/**
 * The engine's own bookkeeping: what a message handler or a timer needs to
 * remember between two calls, and that no template reads.
 */
type ReplayRegisters = {
  /** The archived session the page currently shows. */
  loadedArchiveSessionId: string | undefined;
  loadedArchiveCreatedAtMs: number | undefined;
  differenceParticipantId: string | undefined;
  bridgeListening: boolean;
  playbackRequested: boolean;
  clockStartedAt: number | undefined;
  clockElapsedMs: number;
  clockTimer: ReplayTimer | undefined;
  skeletonTimer: ReplayTimer | undefined;
  countdownTimer: ReplayTimer | undefined;
  visibilityTimeline: VisibilityChange[];
  visibilityCursor: number;
  visibilityOriginMs: number;
  visibilityParticipantIds: readonly string[];
  recordedActiveParticipantId: string | undefined;
  actionParticipantId: string | undefined;
};

export const registers: ReplayRegisters = {
  loadedArchiveSessionId: undefined,
  loadedArchiveCreatedAtMs: undefined,
  differenceParticipantId: undefined,
  bridgeListening: false,
  playbackRequested: false,
  clockStartedAt: undefined,
  clockElapsedMs: 0,
  clockTimer: undefined,
  skeletonTimer: undefined,
  countdownTimer: undefined,
  visibilityTimeline: [],
  visibilityCursor: 0,
  visibilityOriginMs: 0,
  visibilityParticipantIds: [],
  recordedActiveParticipantId: undefined,
  actionParticipantId: undefined,
};

export const frameConnections = new Map<string, ReplayFrameConnection>();
export const replayViewports = new Map<string, ReplayViewport>();
export const replayScales = new Map<string, number>();
export const completedReplayEventIds = new Set<string>();
export const handshakeTimers = new Map<string, ReplayTimer>();
export const dialogTimers = new Map<string, ReplayTimer>();
export const participantStates = new Map<
  string,
  Readonly<{ state: ReplayParticipantState; time: number }>
>();

/* ── the route ──────────────────────────────────────────────────────────── */

export function sessionRoute(id: string): string {
  return `#/sessions/${encodeURIComponent(id)}`;
}

/** The archived session the address names, if it names one. */
export function routeSessionId(): string | undefined {
  const match = /^#\/sessions\/([^/]+)$/.exec(currentHash());
  const encoded = match?.[1];
  if (encoded === undefined) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

/* ── what follows from the recording ────────────────────────────────────── */

/** Which tabs are the continuation of another one (a Clear Cache reload). */
export const continuations = computed(() =>
  participantContinuations(sessionParticipants(), events()),
);

export const replayableParticipants = computed(() =>
  sessionParticipants().filter(
    (participant) => !continuations().has(participant.id),
  ),
);

const currentEnvironment = captureDebugSessionEnvironment();

export const environmentWarning = computed(() => {
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

/** The recording as one tab saw it. */
export function sessionForParticipant(
  participantId: string,
): SendContextReplayExport | undefined {
  const imported = session();
  if (!imported) return undefined;
  return participantSession(
    imported,
    sessionParticipants(),
    participantId,
    continuations(),
  );
}

export const visibleEvents = computed(() => {
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
  const group = participantGroup(
    continuations().get(selected) ?? selected,
    continuations(),
  );
  return events().filter(
    (event) => event.participantId && group.has(event.participantId),
  );
});

// Slow tasks are context, not a verdict: they appear under "Tout afficher",
// marked, but they neither fill the default journal nor raise the badge.
export const problemEvents = computed(() =>
  visibleEvents().filter((event) => eventSeverity(event) === 'error'),
);
export const errorCount = computed(() => problemEvents().length);
export const journalEvents = computed(() =>
  showAllEvents() ? visibleEvents() : problemEvents(),
);
export const visibleEventPage = computed(() => {
  const start = eventTimelinePage() * eventTimelinePageSize;
  return journalEvents().slice(start, start + eventTimelinePageSize);
});
export const eventTimelinePageCount = computed(() =>
  Math.max(1, Math.ceil(journalEvents().length / eventTimelinePageSize)),
);
export const replayableEvents = computed(() => getReplaySteps(visibleEvents()));
export const activeReplayEventId = computed(
  () => replayableEvents()[Math.max(0, replayIndex() - 1)]?.id,
);
export const hasDifference = computed(() => difference() !== undefined);
export const canForceRecovery = computed(
  () => difference()?.recovery !== undefined,
);
export const canSkipDifference = computed(() => difference()?.skip !== undefined);

/** What the tab calls itself; the page it runs when the recording does not say. */
export function participantTitle(participantId: string): string {
  return (
    sessionParticipants().find((participant) => participant.id === participantId)
      ?.title ?? 'Application cible'
  );
}

/** The tabs the replay plays, in the order the stage lays them out. */
export function replayParticipantIds(): readonly string[] {
  const participants = sessionParticipants();
  if (participants.length === 0) return ['default'];
  const selected = selectedParticipantId();
  const candidates =
    selected === 'all'
      ? participants
      : participants.filter((participant) => participant.id === selected);
  return candidates
    .filter((participant) => {
      if (continuations().has(participant.id)) return false;
      const replay = sessionForParticipant(participant.id);
      return replay !== undefined && !replay.truncated;
    })
    .map((participant) => participant.id);
}

/** Each replayable tab's slice of the recording, on one shared timeline. */
export function sessionsForReplay(): readonly ReplaySlice[] {
  const imported = session();
  if (!imported) return [];
  const slices = replayParticipantIds().flatMap((participantId) => {
    const replay = sessionForParticipant(participantId);
    return replay && !replay.truncated
      ? [{ participantId, session: replay }]
      : [];
  });
  if (selectedParticipantId() !== 'all' || slices.length <= 1) return slices;
  return alignSharedTimeline(slices);
}

export function canReplaySelectedSession(): boolean {
  const slices = sessionsForReplay();
  return (
    slices.length > 0 &&
    (startMode() !== 'snapshot' ||
      slices.every((item) => item.session.initialSnapshot !== undefined))
  );
}

/** What the recording says about when its tabs were created. */
export function recordingClock(): RecordingClock {
  return {
    events: events(),
    participants: sessionParticipants(),
    archiveCreatedAtMs: registers.loadedArchiveCreatedAtMs,
  };
}
