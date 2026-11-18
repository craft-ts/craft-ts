import {
  cutUnfinishedTail,
  splitPageReloads,
  validateDebugSessionExport,
  type ReplayTailCut,
} from '@craft-ts/component';
import { craftExpose, craftService, craftUse } from '@craft-ts/core';
import {
  after,
  cancelAfter,
  firstSelectedFile,
  hasFrame,
  hasFrameGrid,
  isReplayInteractionMode,
  isReplayStateRecomputed,
  isReplayStateVerification,
  newUuid,
  renderFrames,
  setFramePlaceholder,
  setTileHidden,
} from '../util/replay-browser';
import {
  isRecord,
  parseLocalTarget,
  participantStartAtMs,
  REPLAY_QUERY_MARKER,
  replaySessionStartAtMs,
  type ReplayFrameConnection,
} from '../util/replay-model';
import { ReplayBridge } from './replay-bridge';
import { ReplayPlayback } from './replay-playback';
import {
  canReplaySelectedSession,
  continuations,
  participantTitle,
  recordingClock,
  rememberAutoSkipDifferences,
  replayParticipantIds,
  ReplayState,
  routeSessionId,
  sessionsForReplay,
} from './replay-state';

export const { ReplaySession } = craftService(
  { name: 'replaySession', providedIn: 'global' },
  function* () {
    const {
      beginReplayLoadingIndicator,
      endReplayLoadingIndicator,
      launchDueReplayParticipants,
      launchReplayParticipant,
      prepareReplayVisibilityTimeline,
      send,
      setNextActionCountdown,
      setReplayActionTarget,
      stopReplayVisibilityClock,
      updateActiveReplayFrame,
      updateReplayViewport,
    } = yield* ReplayPlayback();
    const { handshake, listenToReplayBridge } = yield* ReplayBridge();
    const {
      activeReplayParticipantId,
      completedReplayEventIds,
      diagnosticReplay,
      difference,
      events,
      frameConnections,
      handshakeTimers,
      registers,
      replayableEvents,
      replayActionOffsetsMs,
      replayIndex,
      replayState,
      seekHooks,
      seekTarget,
      warningIndexes,
      selectedParticipantId,
      setStates,
      session,
      sessionParticipants,
      sessionText,
      startMode,
      targetUrl,
    } = (yield* ReplayState()).imperative;

    /**
     * What the dashboard does with a recording: open it, draw its tabs, start the
     * replay and steer it. The view calls these; the route and the archive call
     * the load ones.
     */

    /* ── the stage ──────────────────────────────────────────────────────────── */

    function renderReplayFrames(): void {
      if (!hasFrameGrid()) return;
      const participantIds = replayParticipantIds();
      if (!participantIds.includes(craftUse(activeReplayParticipantId()) ?? ''))
        setStates({ activeReplayParticipantId: participantIds[0] });
      renderFrames(
        participantIds.map((participantId) => {
          const participant = craftUse(sessionParticipants()).find(
            (item) => item.id === participantId,
          );
          return {
            participantId,
            title: participantTitle(participantId),
            startUrl: participant?.startUrl ?? '',
            colorScheme:
              participant?.environment?.colorScheme === 'dark'
                ? 'dark'
                : 'light',
            hidden: participantId !== craftUse(activeReplayParticipantId()),
          };
        }),
        handshake,
      );
      updateReplayViewport();
    }

    /* ── opening a recording ────────────────────────────────────────────────── */

    function importJson(text: string): void {
      registers.loadedArchiveCreatedAtMs = undefined;
      setStates({ sessionText: text });
      const result = validateDebugSessionExport(text.trim());
      if (!result.ok) {
        endReplayLoadingIndicator();
        setStates({
          session: undefined,
          events: [],
          status: result.error,
          loadError: result.error,
        });
        return;
      }
      // A page loaded again goes on in a tab of its own; the replay goes as far
      // as the recording lets it: an end left unfinished (a tab closed
      // mid-request) is left out, and said.
      // The journal and « Déboguer ici » keep the whole recording; only what
      // the replay consumes leaves the cut end out (see `replayedPart`).
      const replayable = splitPageReloads(result.session);
      const { cut } = cutUnfinishedTail(replayable);
      registers.tailCut = cut;
      const recordedUrl = parseLocalTarget(replayable.startUrl);
      setStates({
        session: replayable,
        sessionParticipants: Array.isArray(replayable.participants)
          ? replayable.participants
          : [],
        selectedParticipantId: 'all',
        eventTimelinePage: 0,
        replayViewport: replayable.viewport,
        events: replayable.events,
        difference: undefined,
        status: `Session v${replayable.version} importée · ${replayable.events.length} événements${replayable.truncated ? ' · archive tronquée, replay selon l’historique conservé par onglet' : ''}${cut ? ` · ${describeTailCut(cut)}` : ''}`,
        loadError: undefined,
        ...(recordedUrl.ok ? { targetUrl: recordedUrl.url.href } : {}),
      });
      updateReplayViewport();
      renderReplayFrames();
    }

    /** Starts the replay on the next turn, once the tabs it needs are drawn. */
    function scheduleReplayPreparation(): void {
      const expectedSession = craftUse(session());
      const expectedRoute = routeSessionId();
      let attempts = 0;
      const prepare = (): void => {
        if (
          craftUse(session()) !== expectedSession ||
          routeSessionId() !== expectedRoute
        )
          return;
        if (!hasFrameGrid()) {
          attempts += 1;
          if (attempts < 120) after(16, prepare);
          else endReplayLoadingIndicator();
          return;
        }
        if (canReplaySelectedSession()) startReplay();
        else endReplayLoadingIndicator();
      };
      after(0, prepare);
    }

    /** An archived session was asked for: clear what the last one left. */
    function beginSessionLoad(id: string): void {
      beginReplayLoadingIndicator();
      setStates({ loadError: undefined });
      if (registers.loadedArchiveSessionId !== id) {
        setStates({
          session: undefined,
          events: [],
          difference: undefined,
          connected: false,
          replayState: 'idle',
          sessionText: '',
        });
        setNextActionCountdown(undefined);
      }
    }

    /** The archive answered: open the session unless the address moved on. */
    function completeSessionLoad(id: string, archived: unknown): void {
      if (routeSessionId() !== id) return;
      importJson(JSON.stringify(archived));
      registers.loadedArchiveCreatedAtMs =
        isRecord(archived) && typeof archived['createdAt'] === 'string'
          ? Date.parse(archived['createdAt'])
          : undefined;
      registers.loadedArchiveSessionId = id;
      const participants = craftUse(sessionParticipants());
      if (
        (participants.length > 1 || craftUse(session())?.truncated) &&
        replayParticipantIds().length === 0
      ) {
        setStates({
          status:
            isRecord(archived) && archived['truncated']
              ? 'Session tronquée · aucun onglet avec un historique complet ne peut être rejoué.'
              : 'Session chargée · aucun onglet ne contient d’action rejouable.',
        });
        endReplayLoadingIndicator();
        return;
      }
      after(0, () => {
        if (routeSessionId() !== id || registers.loadedArchiveSessionId !== id)
          return;
        if (!canReplaySelectedSession()) {
          setStates({
            status: 'Session chargée · aucun replay fiable à préparer.',
          });
          endReplayLoadingIndicator();
          return;
        }
        scheduleReplayPreparation();
      });
    }

    function failSessionLoad(reason: string): void {
      endReplayLoadingIndicator();
      const message = `Impossible de charger la session · ${reason}`;
      setStates({ status: message, loadError: message });
    }

    /** The address left the replay page: stop what was running in it. */
    function leaveReplayPage(): void {
      send('stop');
      registers.playbackRequested = false;
      for (const timer of handshakeTimers.values()) cancelAfter(timer);
      handshakeTimers.clear();
      frameConnections.clear();
      setNextActionCountdown(undefined);
      setStates({ connected: false, replayState: 'idle' });
    }

    function openImport(): void {
      // A fresh sheet: not the last session that was opened.
      setStates({ sessionText: '', loadError: undefined, importOpen: true });
    }

    function closeImport(): void {
      setStates({ importOpen: false });
    }

    /**
     * Where an imported recording is shown: its own address, `#/import`. The route
     * service installs the way there, since only it holds the router.
     */
    let showImportedRecording: () => void = () => undefined;
    function installImportNavigation(show: () => void): void {
      showImportedRecording = show;
    }

    /** A recording that parsed leaves the dialog for the replay page. */
    function openImportedRecording(): void {
      if (!craftUse(session())) return;
      setStates({ importOpen: false });
      if (!routeSessionId()) showImportedRecording();
    }

    function importPastedSession(): void {
      registers.loadedArchiveSessionId = undefined;
      importJson(craftUse(sessionText()));
      openImportedRecording();
      scheduleReplayPreparation();
    }

    /** A file picked in the import dialog. */
    function importSelectedFile(event: Event): void {
      const file = firstSelectedFile(event);
      if (!file) return;
      registers.loadedArchiveSessionId = undefined;
      void file
        .text()
        .then((text) => {
          importJson(text);
          openImportedRecording();
          scheduleReplayPreparation();
        })
        .catch((error: unknown) => setStates({ status: String(error) }));
    }

    function setShowAllEvents(next: boolean): void {
      setStates({ showAllEvents: next, eventTimelinePage: 0 });
    }

    /* ── steering the replay ────────────────────────────────────────────────── */

    function startReplay(): void {
      const slices = sessionsForReplay();
      if (slices.length === 0) {
        endReplayLoadingIndicator();
        return;
      }
      setNextActionCountdown(undefined);
      if (
        craftUse(startMode()) === 'snapshot' &&
        slices.some((item) => !item.session.snapshots?.length)
      ) {
        endReplayLoadingIndicator();
        setStates({
          status:
            'Au moins un onglet ne contient pas de snapshot versionné complet. Choisis le démarrage à l’URL.',
        });
        return;
      }
      registers.differenceParticipantId = undefined;
      registers.actionParticipantId = undefined;
      registers.recordedActiveParticipantId = undefined;
      completedReplayEventIds.clear();
      stopReplayVisibilityClock();
      registers.clockElapsedMs = 0;
      registers.playbackRequested = false;
      const keepNotes = registers.keepNotesOnStart;
      if (keepNotes) {
        registers.keepNotesOnStart = false;
      } else {
        warningIndexes.clear();
      }
      registers.seekStepping = false;
      frameConnections.clear();
      setStates({
        difference: undefined,
        replayDifferences: [],
        differenceHistoryOpen: false,
        warningHistoryOpen: false,
        replayIndex: 0,
        replayState: 'preparing',
        connected: false,
        ...(!keepNotes
          ? {
              replayWarnings: [],
              dismissedWarnings: [],
              seekTarget: undefined,
            }
          : {}),
      });
      beginReplayLoadingIndicator();
      const mode = craftUse(startMode());
      renderReplayFrames();
      prepareReplayVisibilityTimeline();
      listenToReplayBridge(importJson);
      const timelineOriginMs = replaySessionStartAtMs(slices, recordingClock());
      const replayRunId = newUuid();
      const sharedTimeline =
        craftUse(selectedParticipantId()) === 'all' && slices.length > 1;
      setStates({
        status: sharedTimeline
          ? `Préparation de ${slices.length} onglets…`
          : 'Chargement et préparation du replay…',
      });
      for (const { participantId, session: replaySession } of slices) {
        const useRecordedUrl = mode === 'url' || sharedTimeline;
        const target = parseLocalTarget(
          useRecordedUrl
            ? replaySession.startUrl
            : craftUse(targetUrl()).trim(),
        );
        if (!target.ok || !hasFrame(participantId)) {
          endReplayLoadingIndicator();
          setStates({
            status: target.ok
              ? 'La frame de replay est introuvable.'
              : target.error,
          });
          continue;
        }
        if (!sharedTimeline && mode === 'url')
          setStates({ targetUrl: target.url.href });
        if (useRecordedUrl)
          target.url.searchParams.set(REPLAY_QUERY_MARKER, '1');
        const participantTimelineOriginMs = participantStartAtMs(
          participantId,
          replaySession,
          recordingClock(),
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
          diagnostic: diagnosticReplay(),
          ...(isReplayStateVerification() ? { verifyState: true } : {}),
          ...(isReplayStateRecomputed() ? { recomputeState: true } : {}),
          ...(isReplayInteractionMode() ? { dispatchInteractions: true } : {}),
          timelineOriginMs: participantTimelineOriginMs,
          startOffsetMs,
        };
        frameConnections.set(participantId, connection);
        if (startOffsetMs > 0) {
          setFramePlaceholder(
            participantId,
            'Cet onglet s’ouvrira au moment enregistré.',
          );
          setTileHidden(participantId, false);
        }
      }
      launchDueReplayParticipants(0);
    }

    function stepNextReplayAction(): void {
      const next = replayableEvents()[craftUse(replayIndex())];
      if (!next) return;
      const participantId = next.participantId ?? replayParticipantIds()[0];
      if (!participantId) return;
      setReplayActionTarget(participantId);
      updateActiveReplayFrame();
      const connection = frameConnections.get(participantId);
      if (connection?.status === 'scheduled') {
        connection.pendingStep = true;
        registers.playbackRequested = false;
        launchReplayParticipant(connection);
        return;
      }
      if (connection?.connected && !connection.frameReady) {
        // The page has not created its replay yet: it would drop the step. The
        // step goes out when it says it is ready.
        connection.pendingStep = true;
        return;
      }
      send('step', {}, participantId);
    }

    /** Stop waiting for the next action: it starts now. Only meaningful while playing. */
    function skipReplayWait(): void {
      if (craftUse(replayState()) === 'playing') send('skip-wait');
    }

    /**
     * Replay again from the start, quickly, and stop right before the action a note
     * was raised on, so the gap can be looked at. The notes are kept.
     */
    function seekReplayToWarning(warning: string): void {
      const target = warningIndexes.get(warning);
      if (target === undefined) return;
      seekReplayToIndex(target, { fromStart: true });
    }

    type SeekOptions = Readonly<{
      participantId?: string;
      fromStart?: boolean;
    }>;

    /**
     * Brings the replay to the state it had once `target` actions had run: on from
     * where it stands when it is ready, paused and not past that point, otherwise
     * from the start, quickly. The notes are kept. `participantId` is the tab put
     * in front once it is there; `fromStart` replays even when it could go on.
     */
    function seekReplayToIndex(
      target: number,
      { participantId, fromStart = false }: SeekOptions = {},
    ): void {
      const index = Math.max(0, Math.min(target, replayableEvents().length));
      const continuing =
        !fromStart &&
        ['ready', 'paused'].includes(craftUse(replayState())) &&
        craftUse(replayIndex()) <= index &&
        craftUse(difference()) === undefined;
      if (!continuing) {
        registers.keepNotesOnStart = true;
        startReplay();
        // `startReplay` refuses to start without slices: then nothing consumed it.
        registers.keepNotesOnStart = false;
        if (craftUse(replayState()) !== 'preparing') return;
      }
      setStates({
        seekTarget: index,
        status: `Replay · retour à l’action ${index + 1}…`,
        ...(participantId && replayParticipantIds().includes(participantId)
          ? { activeReplayParticipantId: participantId }
          : {}),
      });
      if (continuing) driveSeek();
    }

    /**
     * Brings the replay to the moment just after an action ran — the way a
     * thumbnail names its moment. No event: the app as it opens. Returns whether
     * the replay of the open recording has that action at all.
     */
    function seekReplayToEvent(
      eventId: string | undefined,
      participantId?: string,
    ): boolean {
      if (eventId === undefined) {
        seekReplayToIndex(0, { participantId });
        return true;
      }
      const position = replayableEvents().findIndex(
        (item) => item.id === eventId,
      );
      if (position < 0) {
        setStates({
          status: 'Cet aperçu ne correspond à aucune action de ce replay.',
        });
        return false;
      }
      seekReplayToIndex(position + 1, { participantId });
      return true;
    }

    /**
     * Brings the replay to just before a recorded event — the moment a resume
     * point names: every action recorded before it has run, itself not yet. No
     * event: the end of the recording.
     */
    function seekReplayBeforeSequence(
      sequence: number | undefined,
      participantId?: string,
    ): void {
      const actions = replayableEvents();
      seekReplayToIndex(
        sequence === undefined
          ? actions.length
          : actions.filter((event) => event.sequence < sequence).length,
        { participantId },
      );
    }

    /**
     * Brings the replay to any recorded event, an action or not: every action up
     * to it, itself included, has run. An unknown event leaves it in place.
     */
    function seekReplayToRecordedEvent(eventId: string): void {
      const target = craftUse(events()).find((event) => event.id === eventId);
      if (!target) return;
      seekReplayToIndex(
        replayableEvents().filter((event) => event.sequence <= target.sequence)
          .length,
      );
    }

    /**
     * Brings the replay to a point of its timeline, `share` of the way through the
     * recording (0 to 1): the state it had once every action recorded by then had
     * run. The very start is the app as it opens, before any action.
     */
    function seekReplayToShare(share: number): void {
      const offsets = replayActionOffsetsMs();
      const duration = offsets.at(-1) ?? 0;
      if (offsets.length === 0) return;
      if (share < 0.01 || duration <= 0) {
        seekReplayToIndex(duration <= 0 && share >= 0.99 ? offsets.length : 0);
        return;
      }
      const moment = share * duration;
      seekReplayToIndex(offsets.filter((offset) => offset <= moment).length);
    }

    /** Stops going to a thumbnail's moment: the replay stays where it got to. */
    function cancelReplaySeek(): void {
      if (craftUse(seekTarget()) === undefined) return;
      setStates({
        seekTarget: undefined,
        status: `Accélération annulée · le replay est à l’étape ${craftUse(replayIndex())}.`,
      });
    }

    function settleSeek(): boolean {
      const target = craftUse(seekTarget());
      if (target === undefined) return true;
      if (
        craftUse(difference()) !== undefined ||
        ['error', 'completed'].includes(craftUse(replayState())) ||
        craftUse(replayIndex()) >= target
      ) {
        setStates({ seekTarget: undefined });
        if (
          craftUse(replayIndex()) >= target &&
          !['error', 'completed'].includes(craftUse(replayState()))
        )
          setStates({
            status: `Replay · arrêté avant l’action ${target + 1}. « Action suivante » l’exécute.`,
          });
        return true;
      }
      return false;
    }

    function driveSeek(): void {
      if (settleSeek()) return;
      if (!['ready', 'paused'].includes(craftUse(replayState()))) return;
      if (registers.seekStepping) return;
      registers.seekStepping = true;
      stepNextReplayAction();
    }
    seekHooks.drive = driveSeek;
    seekHooks.settle = () => {
      if (craftUse(difference()) !== undefined) return;
      settleSeek();
    };

    function stopReplay(): void {
      registers.seekStepping = false;
      send('stop');
      registers.playbackRequested = false;
      stopReplayVisibilityClock();
      registers.clockElapsedMs = 0;
      updateActiveReplayFrame(0);
      setNextActionCountdown(undefined);
      setStates({
        seekTarget: undefined,
        difference: undefined,
        status: 'Replay arrêté.',
      });
    }

    function selectParticipant(value: string): void {
      const participant = craftUse(sessionParticipants()).find(
        (item) => item.id === value,
      );
      const parsed = participant?.startUrl
        ? parseLocalTarget(participant.startUrl)
        : undefined;
      stopReplayVisibilityClock();
      registers.playbackRequested = false;
      registers.clockElapsedMs = 0;
      send('stop');
      for (const timer of handshakeTimers.values()) cancelAfter(timer);
      handshakeTimers.clear();
      frameConnections.clear();
      completedReplayEventIds.clear();
      setStates({
        connected: false,
        replayState: 'idle',
        selectedParticipantId: continuations().get(value) ?? value,
        eventTimelinePage: 0,
        replayIndex: 0,
        replayViewport: participant?.viewport ?? craftUse(session())?.viewport,
        ...(parsed?.ok ? { targetUrl: parsed.url.href } : {}),
      });
      renderReplayFrames();
      updateReplayViewport();
      scheduleReplayPreparation();
    }

    /** Asks the replayed page to apply the state the recording expected. */
    function forceReplayRecovery(): void {
      setStates({ status: 'Application de la reprise forcée…' });
      if (registers.differenceParticipantId)
        send('force-recover', {}, registers.differenceParticipantId);
    }

    /** Asks the replayed page to jump to the next checkpoint it can resume from. */
    function skipToCheckpoint(): void {
      if (!craftUse(difference())?.skip) return;
      rememberAutoSkipDifferences(true);
      setStates({ status: 'Restauration du prochain checkpoint…' });
      if (registers.differenceParticipantId)
        send('skip-to-checkpoint', {}, registers.differenceParticipantId);
    }

    /** Asks the replayed page for the session it captured, to open and download it. */
    function exportTarget(): void {
      const participantId =
        craftUse(selectedParticipantId()) === 'all'
          ? replayParticipantIds()[0]
          : craftUse(selectedParticipantId());
      if (participantId) send('export', {}, participantId);
      setStates({ status: 'Export demandé à l’application cible…' });
    }

    yield* craftExpose('renderReplayFrames', renderReplayFrames);
    yield* craftExpose('importJson', importJson);
    yield* craftExpose('scheduleReplayPreparation', scheduleReplayPreparation);
    yield* craftExpose('beginSessionLoad', beginSessionLoad);
    yield* craftExpose('completeSessionLoad', completeSessionLoad);
    yield* craftExpose('failSessionLoad', failSessionLoad);
    yield* craftExpose('leaveReplayPage', leaveReplayPage);
    yield* craftExpose('openImport', openImport);
    yield* craftExpose('closeImport', closeImport);
    yield* craftExpose('installImportNavigation', installImportNavigation);
    yield* craftExpose('importPastedSession', importPastedSession);
    yield* craftExpose('importSelectedFile', importSelectedFile);
    yield* craftExpose('setShowAllEvents', setShowAllEvents);
    yield* craftExpose('startReplay', startReplay);
    yield* craftExpose('stepNextReplayAction', stepNextReplayAction);
    yield* craftExpose('skipReplayWait', skipReplayWait);
    yield* craftExpose('seekReplayToWarning', seekReplayToWarning);
    yield* craftExpose('seekReplayToIndex', seekReplayToIndex);
    yield* craftExpose('seekReplayToEvent', seekReplayToEvent);
    yield* craftExpose('seekReplayBeforeSequence', seekReplayBeforeSequence);
    yield* craftExpose('seekReplayToRecordedEvent', seekReplayToRecordedEvent);
    yield* craftExpose('seekReplayToShare', seekReplayToShare);
    yield* craftExpose('cancelReplaySeek', cancelReplaySeek);
    yield* craftExpose('stopReplay', stopReplay);
    yield* craftExpose('selectParticipant', selectParticipant);
    yield* craftExpose('forceReplayRecovery', forceReplayRecovery);
    yield* craftExpose('skipToCheckpoint', skipToCheckpoint);
    yield* craftExpose('exportTarget', exportTarget);
  },
);

const TAIL_CUT_REASONS: Record<ReplayTailCut['reason'], string> = {
  'missing-result':
    'une opération n’a jamais reçu de résultat (onglet fermé en pleine requête ?)',
  'page-reload': 'la page a été rechargée',
  'reload-requested': 'l’app a demandé un rechargement',
};

/** The end a replay leaves out, as the journal says it. */
export function describeTailCut(cut: ReplayTailCut): string {
  return `fin non rejouée : ${cut.droppedSteps} action${cut.droppedSteps > 1 ? 's' : ''} sur ${cut.keptSteps + cut.droppedSteps}, ${TAIL_CUT_REASONS[cut.reason]}`;
}
