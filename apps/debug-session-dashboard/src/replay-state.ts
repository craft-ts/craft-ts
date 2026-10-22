import {
  craftComputed,
  craftEffect,
  craftService,
  BrowserDocumentService,
  LocalStorage,
  on$,
  rawReactiveValue,
  source$,
  state,
  type SendContextEnvironmentProfile,
  type SendContextEvent,
  type SendContextReplayExport,
  type SendContextSessionParticipant,
  type InsertionStateFactoryContext,
  type YieldableReactiveValue,
} from '@craft-ts/core';
import {
  captureDebugSessionEnvironment,
  compileReplayPlan,
  environmentDifferences,
  getReplaySteps,
} from '@craft-ts/component';
import { currentHash } from './replay-browser';
import type { ThumbnailManifest } from './thumbnail-archive.service';
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

type StateFacade<T> = (() => T) & {
  set(value: T): void;
  update(updateFn: (current: T) => T): void;
};

type StateBridge<T> = {
  readonly value: StateFacade<T>;
  readonly initialValue: T;
  bind(
    read: () => T,
    set: (value: T) => void,
    update: (updateFn: (current: T) => T) => void,
  ): void;
};

type ReadBridge<T> = {
  readonly value: () => T;
  bind(read: () => T): void;
};

function createReadBridge<T>(_name: string, initialValue: T): ReadBridge<T> {
  let read = () => initialValue;
  return {
    value: () => read(),
    bind(nextRead) {
      read = nextRead;
    },
  };
}

/**
 * The replay engine still has synchronous browser callbacks. These facades
 * bridge those callbacks to the Craft-owned state service through source$;
 * views and derived values use the service's yieldable state directly.
 */
function createStateBridge<T>(_name: string, initialValue: T): StateBridge<T> {
  let read = () => initialValue;
  let write: (value: T) => void = () => undefined;
  let updateValue: (updateFn: (current: T) => T) => void = () => undefined;
  let initialized = false;
  const pending: (
    | { readonly kind: 'set'; readonly value: T }
    | { readonly kind: 'update'; readonly updateFn: (current: T) => T }
  )[] = [];
  const value: StateFacade<T> = Object.assign(() => read(), {
    set: (next: T) => {
      if (!initialized) {
        pending.push({ kind: 'set', value: next });
        return;
      }
      write(next);
    },
    update: (updateFn: (current: T) => T) => {
      if (!initialized) {
        pending.push({ kind: 'update', updateFn });
        return;
      }
      updateValue(updateFn);
    },
  });
  return {
    value,
    initialValue,
    bind(nextRead, nextSet, nextUpdate) {
      read = nextRead;
      write = nextSet;
      updateValue = nextUpdate;
      initialized = true;
      for (const operation of pending.splice(0)) {
        if (operation.kind === 'set') nextSet(operation.value);
        else nextUpdate(operation.updateFn);
      }
    },
  };
}

/**
 * What the dashboard knows right now: the recording that is open, where the
 * replay is, and what the page around it is showing. The engine writes it, the
 * view reads it. One module holds it so that neither has to import the other.
 */

/* ── the recording ──────────────────────────────────────────────────────── */

const sessionTextBridge = createStateBridge('sessionText', '');
export const sessionText = sessionTextBridge.value;
const sessionBridge = createStateBridge<SendContextReplayExport | undefined>(
  'session',
  undefined,
);
export const session = sessionBridge.value;
const eventsBridge = createStateBridge<readonly SendContextEvent[]>(
  'events',
  [],
);
export const events = eventsBridge.value;
const sessionParticipantsBridge = createStateBridge<
  readonly SendContextSessionParticipant[]
>('sessionParticipants', []);
export const sessionParticipants = sessionParticipantsBridge.value;
const selectedParticipantIdBridge = createStateBridge(
  'selectedParticipantId',
  'all',
);
export const selectedParticipantId = selectedParticipantIdBridge.value;
const loadErrorBridge = createStateBridge<string | undefined>(
  'loadError',
  undefined,
);
export const loadError = loadErrorBridge.value;

/** The thumbnails the archive prepared for the open recording, as far as known. */
const thumbnailManifestBridge = createStateBridge<
  ThumbnailManifest | undefined
>('thumbnailManifest', undefined);
export const thumbnailManifest = thumbnailManifestBridge.value;

/* ── the page ───────────────────────────────────────────────────────────── */

const pageBridge = createStateBridge<'sessions' | 'detail'>('page', 'sessions');
export const page = pageBridge.value;
const importOpenBridge = createStateBridge('importOpen', false);
export const importOpen = importOpenBridge.value;
const sidePanelOpenBridge = createStateBridge('sidePanelOpen', false);
export const sidePanelOpen = sidePanelOpenBridge.value;
const showAllEventsBridge = createStateBridge('showAllEvents', false);
export const showAllEvents = showAllEventsBridge.value;
const pendingDeleteSessionIdBridge = createStateBridge<string | undefined>(
  'pendingDeleteSessionId',
  undefined,
);
export const pendingDeleteSessionId = pendingDeleteSessionIdBridge.value;
const eventTimelinePageBridge = createStateBridge('eventTimelinePage', 0);
export const eventTimelinePage = eventTimelinePageBridge.value;
export const eventTimelinePageSize = 250;

/* ── the replay ─────────────────────────────────────────────────────────── */

const targetUrlBridge = createStateBridge(
  'targetUrl',
  import.meta.env['VITE_CRAFT_REPLAY_TARGET_URL'] ?? 'http://localhost:4200/',
);
export const targetUrl = targetUrlBridge.value;
const startModeBridge = createStateBridge<ReplayStartMode>('startMode', 'url');
export const startMode = startModeBridge.value;
const statusBridge = createStateBridge(
  'status',
  'Importe une session v6 pour commencer.',
);
export const status = statusBridge.value;
const connectedBridge = createStateBridge('connected', false);
export const connected = connectedBridge.value;
const differenceBridge = createStateBridge<ReplayDifference | undefined>(
  'difference',
  undefined,
);
export const difference = differenceBridge.value;
const AUTO_SKIP_STORAGE_KEY =
  'craft-debug-session-dashboard:auto-skip-differences:v1';

export type ReplayDifferenceEntry = Readonly<{
  id: number;
  participantId: string;
  eventId?: string;
  expected: unknown;
  actual: unknown;
  transport?: ReplayDifference['transport'];
  checkpointEventId?: string;
  resolution: 'pending' | 'skipped' | 'recovered';
}>;
const replayDifferencesBridge = createStateBridge<
  readonly ReplayDifferenceEntry[]
>('replayDifferences', []);
export const replayDifferences = replayDifferencesBridge.value;
const differenceHistoryOpenBridge = createStateBridge(
  'differenceHistoryOpen',
  false,
);
export const differenceHistoryOpen = differenceHistoryOpenBridge.value;
const autoSkipDifferencesBridge = createStateBridge(
  'autoSkipDifferences',
  false,
);
export const autoSkipDifferences = autoSkipDifferencesBridge.value;
const partialReplayBridge = createStateBridge<PartialReplay | undefined>(
  'partialReplay',
  undefined,
);
export const partialReplay = partialReplayBridge.value;
const replayIndexBridge = createStateBridge('replayIndex', 0);
export const replayIndex = replayIndexBridge.value;
const replayStateBridge = createStateBridge('replayState', 'idle');
export const replayState = replayStateBridge.value;
/** Run playback with command/observation comparison notes enabled. */
const diagnosticReplayBridge = createStateBridge('diagnosticReplay', false);
export const diagnosticReplay = diagnosticReplayBridge.value;
/** Every note the replay made, kept so that they can all be read again. */
const replayWarningsBridge = createStateBridge<readonly string[]>(
  'replayWarnings',
  [],
);
export const replayWarnings = replayWarningsBridge.value;
/** The notes someone has already put away; they stay in the history. */
const dismissedWarningsBridge = createStateBridge<readonly string[]>(
  'dismissedWarnings',
  [],
);
export const dismissedWarnings = dismissedWarningsBridge.value;
const warningHistoryOpenBridge = createStateBridge('warningHistoryOpen', false);
export const warningHistoryOpen = warningHistoryOpenBridge.value;
/** Which action each note was raised on: the actions already run at that point. */
export const warningIndexes = new Map<string, number>();
/** "Go to this action": the replay steps by itself until this many actions have run. */
const seekTargetBridge = createStateBridge<number | undefined>(
  'seekTarget',
  undefined,
);
export const seekTarget = seekTargetBridge.value;
/** The session module's seek driver, called by the bridge after a step. */
export const seekHooks: { drive: () => void } = { drive: () => undefined };
const replaySkeletonVisibleBridge = createStateBridge(
  'replaySkeletonVisible',
  false,
);
export const replaySkeletonVisible = replaySkeletonVisibleBridge.value;
const activeReplayParticipantIdBridge = createStateBridge<string | undefined>(
  'activeReplayParticipantId',
  undefined,
);
export const activeReplayParticipantId = activeReplayParticipantIdBridge.value;
const replayViewportScaleBridge = createStateBridge('replayViewportScale', 1);
export const replayViewportScale = replayViewportScaleBridge.value;
const replayViewportBridge = createStateBridge<ReplayViewport | undefined>(
  'replayViewport',
  undefined,
);
export const replayViewport = replayViewportBridge.value;
const nextActionDelayMsBridge = createStateBridge<number | undefined>(
  'nextActionDelayMs',
  undefined,
);
export const nextActionDelayMs = nextActionDelayMsBridge.value;

function createStateWriter<T>(name: string, bridge: StateBridge<T>) {
  const set$ = source$<T>('set$');
  const update$ = source$<(current: T) => T>('update$');
  return {
    insertion: ({
      set,
      update,
    }: InsertionStateFactoryContext<T, Record<never, never>>) => ({
      setFromExternal: on$(set$, (value) => set(value)),
      updateFromExternal: on$(update$, (updateFn) => update(updateFn)),
    }),
    bind(stateValue: YieldableReactiveValue<T>) {
      bridge.bind(
        rawReactiveValue(stateValue),
        (value) => set$.emit(value),
        (updateFn) => update$.emit(updateFn),
      );
      return stateValue;
    },
  };
}

/** Craft owner for replay state; bridge facades above serve imperative listeners. */
export const { ReplayState } = craftService(
  { name: 'replayState', providedIn: 'global' },
  function* () {
    const localStorage = LocalStorage;
    const browserDocument = yield* BrowserDocumentService();
    const autoSkipPreference =
      (yield* localStorage.getItem(AUTO_SKIP_STORAGE_KEY)) === 'true';
    const sessionTextWriter = createStateWriter(
      'sessionText',
      sessionTextBridge,
    );
    sessionTextWriter.bind(
      yield* state('sessionText', '', sessionTextWriter.insertion),
    );
    const sessionWriter = createStateWriter('session', sessionBridge);
    sessionWriter.bind(
      yield* state(
        'session',
        sessionBridge.initialValue,
        sessionWriter.insertion,
      ),
    );
    const eventsWriter = createStateWriter('events', eventsBridge);
    eventsWriter.bind(
      yield* state('events', eventsBridge.initialValue, eventsWriter.insertion),
    );
    const sessionParticipantsWriter = createStateWriter(
      'sessionParticipants',
      sessionParticipantsBridge,
    );
    sessionParticipantsWriter.bind(
      yield* state(
        'sessionParticipants',
        sessionParticipantsBridge.initialValue,
        sessionParticipantsWriter.insertion,
      ),
    );
    const selectedParticipantIdWriter = createStateWriter(
      'selectedParticipantId',
      selectedParticipantIdBridge,
    );
    selectedParticipantIdWriter.bind(
      yield* state(
        'selectedParticipantId',
        'all',
        selectedParticipantIdWriter.insertion,
      ),
    );
    const loadErrorWriter = createStateWriter('loadError', loadErrorBridge);
    loadErrorWriter.bind(
      yield* state(
        'loadError',
        loadErrorBridge.initialValue,
        loadErrorWriter.insertion,
      ),
    );
    const thumbnailManifestWriter = createStateWriter(
      'thumbnailManifest',
      thumbnailManifestBridge,
    );
    thumbnailManifestWriter.bind(
      yield* state(
        'thumbnailManifest',
        thumbnailManifestBridge.initialValue,
        thumbnailManifestWriter.insertion,
      ),
    );
    const pageWriter = createStateWriter('page', pageBridge);
    pageWriter.bind(
      yield* state('page', pageBridge.initialValue, pageWriter.insertion),
    );
    const importOpenWriter = createStateWriter('importOpen', importOpenBridge);
    importOpenWriter.bind(
      yield* state('importOpen', false, importOpenWriter.insertion),
    );
    const sidePanelOpenWriter = createStateWriter(
      'sidePanelOpen',
      sidePanelOpenBridge,
    );
    sidePanelOpenWriter.bind(
      yield* state('sidePanelOpen', false, sidePanelOpenWriter.insertion),
    );
    const showAllEventsWriter = createStateWriter(
      'showAllEvents',
      showAllEventsBridge,
    );
    showAllEventsWriter.bind(
      yield* state('showAllEvents', false, showAllEventsWriter.insertion),
    );
    const pendingDeleteSessionIdWriter = createStateWriter(
      'pendingDeleteSessionId',
      pendingDeleteSessionIdBridge,
    );
    pendingDeleteSessionIdWriter.bind(
      yield* state(
        'pendingDeleteSessionId',
        pendingDeleteSessionIdBridge.initialValue,
        pendingDeleteSessionIdWriter.insertion,
      ),
    );
    const eventTimelinePageWriter = createStateWriter(
      'eventTimelinePage',
      eventTimelinePageBridge,
    );
    eventTimelinePageWriter.bind(
      yield* state('eventTimelinePage', 0, eventTimelinePageWriter.insertion),
    );
    const targetUrlWriter = createStateWriter('targetUrl', targetUrlBridge);
    targetUrlWriter.bind(
      yield* state(
        'targetUrl',
        import.meta.env['VITE_CRAFT_REPLAY_TARGET_URL'] ??
          'http://localhost:4200/',
        targetUrlWriter.insertion,
      ),
    );
    const startModeWriter = createStateWriter('startMode', startModeBridge);
    startModeWriter.bind(
      yield* state(
        'startMode',
        startModeBridge.initialValue,
        startModeWriter.insertion,
      ),
    );
    const statusWriter = createStateWriter('status', statusBridge);
    statusWriter.bind(
      yield* state(
        'status',
        'Importe une session v6 pour commencer.',
        statusWriter.insertion,
      ),
    );
    const connectedWriter = createStateWriter('connected', connectedBridge);
    connectedWriter.bind(
      yield* state('connected', false, connectedWriter.insertion),
    );
    const differenceWriter = createStateWriter('difference', differenceBridge);
    differenceWriter.bind(
      yield* state(
        'difference',
        differenceBridge.initialValue,
        differenceWriter.insertion,
      ),
    );
    const replayDifferencesWriter = createStateWriter(
      'replayDifferences',
      replayDifferencesBridge,
    );
    replayDifferencesWriter.bind(
      yield* state(
        'replayDifferences',
        replayDifferencesBridge.initialValue,
        replayDifferencesWriter.insertion,
      ),
    );
    const differenceHistoryOpenWriter = createStateWriter(
      'differenceHistoryOpen',
      differenceHistoryOpenBridge,
    );
    differenceHistoryOpenWriter.bind(
      yield* state(
        'differenceHistoryOpen',
        false,
        differenceHistoryOpenWriter.insertion,
      ),
    );
    const autoSkipDifferencesWriter = createStateWriter(
      'autoSkipDifferences',
      autoSkipDifferencesBridge,
    );
    const autoSkipDifferencesState = autoSkipDifferencesWriter.bind(
      yield* state(
        'autoSkipDifferences',
        autoSkipPreference,
        autoSkipDifferencesWriter.insertion,
      ),
    );
    yield* craftEffect('persistAutoSkipPreference', function* () {
      const enabled = yield* autoSkipDifferencesState();
      yield* localStorage.setItem(AUTO_SKIP_STORAGE_KEY, String(enabled));
    });
    const partialReplayWriter = createStateWriter(
      'partialReplay',
      partialReplayBridge,
    );
    partialReplayWriter.bind(
      yield* state(
        'partialReplay',
        partialReplayBridge.initialValue,
        partialReplayWriter.insertion,
      ),
    );
    const replayIndexWriter = createStateWriter(
      'replayIndex',
      replayIndexBridge,
    );
    replayIndexWriter.bind(
      yield* state('replayIndex', 0, replayIndexWriter.insertion),
    );
    const replayStateWriter = createStateWriter(
      'replayState',
      replayStateBridge,
    );
    replayStateWriter.bind(
      yield* state('replayState', 'idle', replayStateWriter.insertion),
    );
    const diagnosticReplayWriter = createStateWriter(
      'diagnosticReplay',
      diagnosticReplayBridge,
    );
    diagnosticReplayWriter.bind(
      yield* state('diagnosticReplay', false, diagnosticReplayWriter.insertion),
    );
    const replayWarningsWriter = createStateWriter(
      'replayWarnings',
      replayWarningsBridge,
    );
    replayWarningsWriter.bind(
      yield* state(
        'replayWarnings',
        replayWarningsBridge.initialValue,
        replayWarningsWriter.insertion,
      ),
    );
    const dismissedWarningsWriter = createStateWriter(
      'dismissedWarnings',
      dismissedWarningsBridge,
    );
    dismissedWarningsWriter.bind(
      yield* state(
        'dismissedWarnings',
        dismissedWarningsBridge.initialValue,
        dismissedWarningsWriter.insertion,
      ),
    );
    const warningHistoryOpenWriter = createStateWriter(
      'warningHistoryOpen',
      warningHistoryOpenBridge,
    );
    warningHistoryOpenWriter.bind(
      yield* state(
        'warningHistoryOpen',
        false,
        warningHistoryOpenWriter.insertion,
      ),
    );
    const seekTargetWriter = createStateWriter('seekTarget', seekTargetBridge);
    seekTargetWriter.bind(
      yield* state(
        'seekTarget',
        seekTargetBridge.initialValue,
        seekTargetWriter.insertion,
      ),
    );
    const replaySkeletonVisibleWriter = createStateWriter(
      'replaySkeletonVisible',
      replaySkeletonVisibleBridge,
    );
    replaySkeletonVisibleWriter.bind(
      yield* state(
        'replaySkeletonVisible',
        false,
        replaySkeletonVisibleWriter.insertion,
      ),
    );
    const activeReplayParticipantIdWriter = createStateWriter(
      'activeReplayParticipantId',
      activeReplayParticipantIdBridge,
    );
    activeReplayParticipantIdWriter.bind(
      yield* state(
        'activeReplayParticipantId',
        activeReplayParticipantIdBridge.initialValue,
        activeReplayParticipantIdWriter.insertion,
      ),
    );
    const replayViewportScaleWriter = createStateWriter(
      'replayViewportScale',
      replayViewportScaleBridge,
    );
    replayViewportScaleWriter.bind(
      yield* state(
        'replayViewportScale',
        1,
        replayViewportScaleWriter.insertion,
      ),
    );
    const replayViewportWriter = createStateWriter(
      'replayViewport',
      replayViewportBridge,
    );
    replayViewportWriter.bind(
      yield* state(
        'replayViewport',
        replayViewportBridge.initialValue,
        replayViewportWriter.insertion,
      ),
    );
    const nextActionDelayMsWriter = createStateWriter(
      'nextActionDelayMs',
      nextActionDelayMsBridge,
    );
    nextActionDelayMsWriter.bind(
      yield* state(
        'nextActionDelayMs',
        nextActionDelayMsBridge.initialValue,
        nextActionDelayMsWriter.insertion,
      ),
    );

    const continuationsState = yield* craftComputed('continuationsState', () =>
      participantContinuations(sessionParticipants(), events()),
    );
    continuationsBridge.bind(rawReactiveValue(continuationsState));
    const replayableParticipantsState = yield* craftComputed(
      'replayableParticipantsState',
      () =>
        sessionParticipants().filter(
          (participant) => !continuations().has(participant.id),
        ),
    );
    replayableParticipantsBridge.bind(
      rawReactiveValue(replayableParticipantsState),
    );
    const environmentWarningState = yield* craftComputed(
      'environmentWarningState',
      computeEnvironmentWarning,
    );
    environmentWarningBridge.bind(rawReactiveValue(environmentWarningState));
    const visibleEventsState = yield* craftComputed(
      'visibleEventsState',
      computeVisibleEvents,
    );
    visibleEventsBridge.bind(rawReactiveValue(visibleEventsState));
    const problemEventsState = yield* craftComputed('problemEventsState', () =>
      visibleEvents().filter((event) => eventSeverity(event) === 'error'),
    );
    problemEventsBridge.bind(rawReactiveValue(problemEventsState));
    const errorCountState = yield* craftComputed(
      'errorCountState',
      () => problemEvents().length,
    );
    errorCountBridge.bind(rawReactiveValue(errorCountState));
    const journalEventsState = yield* craftComputed('journalEventsState', () =>
      showAllEvents() ? visibleEvents() : problemEvents(),
    );
    journalEventsBridge.bind(rawReactiveValue(journalEventsState));
    const visibleEventPageState = yield* craftComputed(
      'visibleEventPageState',
      computeVisibleEventPage,
    );
    visibleEventPageBridge.bind(rawReactiveValue(visibleEventPageState));
    const eventTimelinePageCountState = yield* craftComputed(
      'eventTimelinePageCountState',
      () =>
        Math.max(1, Math.ceil(journalEvents().length / eventTimelinePageSize)),
    );
    eventTimelinePageCountBridge.bind(
      rawReactiveValue(eventTimelinePageCountState),
    );
    const replayableEventsState = yield* craftComputed(
      'replayableEventsState',
      () => getReplaySteps(visibleEvents()),
    );
    replayableEventsBridge.bind(rawReactiveValue(replayableEventsState));
    const replayPlanState = yield* craftComputed('replayPlanState', () => {
      const current = session();
      return current
        ? compileReplayPlan(current, undefined, browserDocument.isValidSelector)
        : undefined;
    });
    replayPlanBridge.bind(rawReactiveValue(replayPlanState));
    const replayActionOffsetsMsState = yield* craftComputed(
      'replayActionOffsetsMsState',
      computeReplayActionOffsetsMs,
    );
    replayActionOffsetsMsBridge.bind(
      rawReactiveValue(replayActionOffsetsMsState),
    );
    const activeReplayEventIdState = yield* craftComputed(
      'activeReplayEventIdState',
      () => replayableEvents()[Math.max(0, replayIndex() - 1)]?.id,
    );
    activeReplayEventIdBridge.bind(rawReactiveValue(activeReplayEventIdState));
    const pendingWarningsState = yield* craftComputed(
      'pendingWarningsState',
      () =>
        replayWarnings().filter(
          (warning) => !dismissedWarnings().includes(warning),
        ),
    );
    pendingWarningsBridge.bind(rawReactiveValue(pendingWarningsState));
    const hasDifferenceState = yield* craftComputed(
      'hasDifferenceState',
      () => difference() !== undefined,
    );
    hasDifferenceBridge.bind(rawReactiveValue(hasDifferenceState));
    const canForceRecoveryState = yield* craftComputed(
      'canForceRecoveryState',
      () => difference()?.recovery !== undefined,
    );
    canForceRecoveryBridge.bind(rawReactiveValue(canForceRecoveryState));
    const canSkipDifferenceState = yield* craftComputed(
      'canSkipDifferenceState',
      () => difference()?.skip !== undefined,
    );
    canSkipDifferenceBridge.bind(rawReactiveValue(canSkipDifferenceState));
  },
);

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
  /** A step sent for a seek is on its way and has not answered yet. */
  seekStepping: boolean;
  /** The next start keeps the notes: it is a seek, not a new replay. */
  keepNotesOnStart: boolean;
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
  seekStepping: false,
  keepNotesOnStart: false,
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
const continuationsBridge = createReadBridge<ReadonlyMap<string, string>>(
  'continuations',
  new Map(),
);
export const continuations = continuationsBridge.value;
const replayableParticipantsBridge = createReadBridge<
  readonly SendContextSessionParticipant[]
>('replayableParticipants', []);
export const replayableParticipants = replayableParticipantsBridge.value;

const currentEnvironment = captureDebugSessionEnvironment();

const environmentWarningBridge = createReadBridge('environmentWarning', '');
export const environmentWarning = environmentWarningBridge.value;

function computeEnvironmentWarning(): string {
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
}

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

const visibleEventsBridge = createReadBridge<readonly SendContextEvent[]>(
  'visibleEvents',
  [],
);
export const visibleEvents = visibleEventsBridge.value;

function computeVisibleEvents(): readonly SendContextEvent[] {
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
}

// Slow tasks are context, not a verdict: they appear under "Tout afficher",
// marked, but they neither fill the default journal nor raise the badge.
const problemEventsBridge = createReadBridge<readonly SendContextEvent[]>(
  'problemEvents',
  [],
);
export const problemEvents = problemEventsBridge.value;
const errorCountBridge = createReadBridge('errorCount', 0);
export const errorCount = errorCountBridge.value;
const journalEventsBridge = createReadBridge<readonly SendContextEvent[]>(
  'journalEvents',
  [],
);
export const journalEvents = journalEventsBridge.value;
const visibleEventPageBridge = createReadBridge<readonly SendContextEvent[]>(
  'visibleEventPage',
  [],
);
export const visibleEventPage = visibleEventPageBridge.value;
const eventTimelinePageCountBridge = createReadBridge(
  'eventTimelinePageCount',
  1,
);
export const eventTimelinePageCount = eventTimelinePageCountBridge.value;
const replayableEventsBridge = createReadBridge<
  ReturnType<typeof getReplaySteps>
>('replayableEvents', []);
export const replayableEvents = replayableEventsBridge.value;
const replayPlanBridge = createReadBridge<
  ReturnType<typeof compileReplayPlan> | undefined
>('replayPlan', undefined);
export const replayPlan = replayPlanBridge.value;
const replayActionOffsetsMsBridge = createReadBridge<readonly number[]>(
  'replayActionOffsetsMs',
  [],
);
export const replayActionOffsetsMs = replayActionOffsetsMsBridge.value;
const activeReplayEventIdBridge = createReadBridge<string | undefined>(
  'activeReplayEventId',
  undefined,
);
export const activeReplayEventId = activeReplayEventIdBridge.value;
const pendingWarningsBridge = createReadBridge<readonly string[]>(
  'pendingWarnings',
  [],
);
export const pendingWarnings = pendingWarningsBridge.value;
const hasDifferenceBridge = createReadBridge('hasDifference', false);
export const hasDifference = hasDifferenceBridge.value;
const canForceRecoveryBridge = createReadBridge('canForceRecovery', false);
export const canForceRecovery = canForceRecoveryBridge.value;
const canSkipDifferenceBridge = createReadBridge('canSkipDifference', false);
export const canSkipDifference = canSkipDifferenceBridge.value;

function computeVisibleEventPage(): readonly SendContextEvent[] {
  const start = eventTimelinePage() * eventTimelinePageSize;
  return journalEvents().slice(start, start + eventTimelinePageSize);
}

/**
 * When each replayable action happens, in milliseconds from the first one: the
 * recorded timeline the replay keeps to when it plays at real speed.
 */
function computeReplayActionOffsetsMs(): readonly number[] {
  const shared = selectedParticipantId() === 'all';
  const times = replayableEvents().map((event) =>
    shared
      ? (event.globalElapsedMs ?? event.elapsedMs ?? event.timestamp)
      : (event.elapsedMs ?? event.timestamp),
  );
  const origin = times[0] ?? 0;
  let latest = 0;
  return times.map((time) => (latest = Math.max(latest, time - origin)));
}

export function dismissWarning(warning: string): void {
  dismissedWarnings.update((dismissed) =>
    dismissed.includes(warning) ? dismissed : [...dismissed, warning],
  );
}

export function dismissAllWarnings(): void {
  dismissedWarnings.set(replayWarnings());
}

export function rememberAutoSkipDifferences(enabled: boolean): void {
  autoSkipDifferences.set(enabled);
}

export function recordReplayDifference(
  participantId: string,
  found: ReplayDifference,
): void {
  replayDifferences.update((entries) => [
    ...entries,
    {
      id: entries.length + 1,
      participantId,
      ...(found.eventId === undefined ? {} : { eventId: found.eventId }),
      expected: found.expected,
      actual: found.actual,
      ...(found.transport === undefined ? {} : { transport: found.transport }),
      ...(found.skip === undefined
        ? {}
        : { checkpointEventId: found.skip.checkpointEventId }),
      resolution: 'pending',
    },
  ]);
}

export function resolveLatestReplayDifference(
  participantId: string,
  resolution: 'skipped' | 'recovered',
): void {
  replayDifferences.update((entries) => {
    let index = entries.length - 1;
    while (
      index >= 0 &&
      (entries[index]?.resolution !== 'pending' ||
        entries[index]?.participantId !== participantId)
    )
      index--;
    if (index < 0) return entries;
    return entries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, resolution } : entry,
    );
  });
}

/** What the tab calls itself; the page it runs when the recording does not say. */
export function participantTitle(participantId: string): string {
  return (
    sessionParticipants().find(
      (participant) => participant.id === participantId,
    )?.title ?? 'Application cible'
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
      slices.every((item) => (item.session.snapshots?.length ?? 0) > 0))
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
