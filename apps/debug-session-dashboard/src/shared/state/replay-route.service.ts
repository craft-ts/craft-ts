import {
  BrowserCryptoService,
  BrowserLocationService,
  CraftActivatedRoute,
  craftEffect,
  craftExpose,
  CraftRouter,
  craftService,
  CraftTemporalRuntime,
  craftUse,
  ɵuntracked as untracked,
} from '@craft-ts/core';
import { BehaviorCoverageArchive } from '../data-access/behavior-coverage.service';
import { E2eComparison } from '../data-access/e2e-comparison.service';
import { GoldenSuiteArchive } from '../data-access/golden-suite.service';
import { ResumeThread } from '../data-access/resume-thread.service';
import {
  httpFailureReason,
  SessionArchive,
} from '../data-access/session-archive.service';
import {
  ThumbnailArchive,
  type ThumbnailManifest,
} from '../data-access/thumbnail-archive.service';
import { coverageE2eIntent } from '../util/behavior-coverage';
import {
  installReplayPlatform,
  isReplayWorkerMode,
  showReplayTileAlone,
} from '../util/replay-browser';
import { installReplayWorkerSurface } from '../util/replay-worker';
import { ReplayPlayback } from './replay-playback';
import { ReplaySession } from './replay-session';
import {
  ReplayState,
  replayState as replayStatus,
  routeSessionId,
  syncActiveRouteSessionId,
} from './replay-state';

/**
 * The address and the archive, together: the hash names the session to open,
 * a session that finishes loading becomes the open recording, a deletion that
 * succeeds closes the page that showed it. The view only asks to `open` or
 * `remove`; this is the one place that listens to `hashchange`.
 */
export const { ReplayRoute, provideReplayRoute } = craftService(
  { name: 'replayRoute', providedIn: 'toProvide' },
  function* () {
    const replayState = yield* ReplayState();
    const { page, registers, setStates } = replayState.imperative;
    const replaySession = yield* ReplaySession();
    const playback = yield* ReplayPlayback();
    // The engine's clock, ids and hash come from Craft: the temporal runtime
    // and the browser boundaries, resolved once here for the code that is not
    // a generator (message listeners, timers, layout passes).
    const temporal = yield* CraftTemporalRuntime();
    const browserLocation = yield* BrowserLocationService();
    const browserCrypto = yield* BrowserCryptoService();
    installReplayPlatform({
      schedule: (run, delayMs) =>
        temporal.schedule(run, delayMs, { owner: 'replay' }),
      now: () => temporal.now(),
      dateNow: () => temporal.dateNow(),
      uuid: () => browserCrypto.randomUUID(),
      search: () => browserLocation.search(),
      href: () => browserLocation.href(),
    });

    // Opened by the thumbnail worker: it replays and is photographed, it does
    // not ask for thumbnails of its own.
    const workerMode = isReplayWorkerMode();
    if (workerMode)
      installReplayWorkerSurface(
        playback.playReplay,
        (index) => replaySession.seekReplayToIndex(index),
        (participantId) => {
          showReplayTileAlone(participantId);
          playback.updateReplayViewport();
        },
      );

    const archive = yield* SessionArchive();
    const e2eComparison = yield* E2eComparison();
    const behaviorCoverage = yield* BehaviorCoverageArchive();
    const goldenSuite = yield* GoldenSuiteArchive();
    const thumbnails = yield* ThumbnailArchive();
    const resumeThread = yield* ResumeThread();
    const activeRoute = yield* CraftActivatedRoute();
    // Resolved here, once: asking for the router from inside an effect's own
    // injector builds another one, and this page stops hearing navigations.
    const router = yield* CraftRouter();
    replaySession.installImportNavigation(
      () => void router.navigate({ to: 'import' }),
    );
    const archivedValue = archive.archived.value;
    const archivedException = archive.archived.exception;
    const deletedValue = archive.deleteSession.value;
    const manifestValue = thumbnails.thumbnailManifest.value;
    const preparedValue = thumbnails.prepareThumbnails.value;

    // The session the last load asked for, and the one a deletion is for: the
    // archive's answers do not say, and only the latest request is answered.
    let requestedId: string | undefined;
    let removingId: string | undefined;
    // The last answer that was opened, so that an effect that runs again
    // without a new answer never opens the previous session under a new id.
    let openedArchive: unknown;
    // The recorded event a link asked the replay to open at (`?event=`, from
    // the coverage page): sought once, when the replay of the session is ready.
    let requestedEventId: string | undefined;
    // And the behaviour whose e2e to write from there: « Reprendre ici »
    // opens, its intent filled in, once the replay stands at the event.
    let requestedE2e: Readonly<{ app: string; behavior: string }> | undefined;
    let coverageRequests = 0;

    const open = (id: string): void => {
      requestedId = id;
      thumbnails.stop();
      setStates({ thumbnailManifest: undefined });
      replaySession.beginSessionLoad(id);
      archive.archived.call(id);
      archive.resumeCheckpoints.call(id);
      if (!workerMode) resumeThread.watchSession(id);
    };

    const remove = (id: string): void => {
      removingId = id;
      archive.deleteSession.mutate(id);
    };

    yield* craftEffect('openArchivedSession', () => {
      const archived = craftUse(archivedValue());
      const id = requestedId;
      if (archived === undefined || id === undefined) return;
      if (archived === openedArchive) return;
      openedArchive = archived;
      untracked(() => {
        replaySession.completeSessionLoad(id, archived);
        if (!workerMode) thumbnails.watch(id);
      });
    });

    // The manifest of the open recording: what the start answered, then what
    // the archive says as the work goes on. An answer about another recording
    // (the user moved on) is dropped.
    const showManifest = (manifest: ThumbnailManifest): void => {
      if (manifest.sessionId === requestedId)
        setStates({ thumbnailManifest: manifest });
    };
    yield* craftEffect('showPreparedThumbnails', () => {
      const manifest = craftUse(preparedValue());
      if (manifest !== undefined) untracked(() => showManifest(manifest));
    });
    yield* craftEffect('showThumbnailManifest', () => {
      const manifest = craftUse(manifestValue());
      if (manifest !== undefined) untracked(() => showManifest(manifest));
    });

    yield* craftEffect('failArchivedSession', () => {
      const exception = craftUse(archivedException());
      if (exception !== undefined)
        untracked(() =>
          replaySession.failSessionLoad(httpFailureReason(exception)),
        );
    });

    yield* craftEffect('closeRemovedSession', () => {
      const deleted = craftUse(deletedValue());
      const id = removingId;
      if (deleted === undefined || id === undefined) return;
      const shouldNavigate = routeSessionId() === id;
      untracked(() => {
        removingId = undefined;
        setStates({ pendingDeleteSessionId: undefined });
      });
      if (shouldNavigate) void router.navigate({ to: '' });
    });

    const handleRoute = (route: typeof activeRoute.snapshot): void => {
      const routePaths = route.pathFromRoot.map(
        (segment) => segment.routeConfig?.path,
      );
      const routeParams = route.params;
      syncActiveRouteSessionId(routeParams['sessionId']);
      const id = routeSessionId();
      const importedSession = routePaths.includes('import');
      const comparison = routePaths.includes('compare');
      const recipes = routePaths.includes('recipes');
      const coverage = routePaths.includes('coverage');
      const suite = routePaths.includes('suite');
      const e2eReplay = routePaths.includes('e2e-replay');
      const wasDetailPage = craftUse(page()) === 'detail';
      setStates({
        page: comparison
          ? 'compare'
          : recipes
            ? 'recipes'
            : coverage
              ? 'coverage'
              : suite
                ? 'suite'
                : id || importedSession || e2eReplay
                  ? 'detail'
                  : 'sessions',
      });
      if (comparison) {
        e2eComparison.comparison.call({
          test: route.queryParams['test'] ?? '',
          project: route.queryParams['project'] ?? '',
          run: route.queryParams['run'] ?? '',
        });
      }
      // Read when the page opens: the archive looks through every session.
      if (coverage) behaviorCoverage.coverage.call(++coverageRequests);
      // The same: the suite is computed from every recorded session.
      if (suite) void goldenSuite.suiteOpenings.open();
      if (id) {
        requestedEventId = route.queryParams['event'] || undefined;
        const behavior = route.queryParams['behavior'];
        const app = route.queryParams['app'];
        requestedE2e =
          requestedEventId && behavior && app ? { app, behavior } : undefined;
      }
      if (id && id !== registers.loadedArchiveSessionId) open(id);
      if (!id) {
        thumbnails.stop();
        resumeThread.stop();
        setStates({ thumbnailManifest: undefined });
      }
      if (!id && !importedSession && !e2eReplay) {
        playback.endReplayLoadingIndicator();
        if (wasDetailPage) replaySession.leaveReplayPage();
        registers.loadedArchiveSessionId = undefined;
      }
    };
    // The activated route is the router's current match, a reactive value: it
    // changes on every navigation, the first one included. That first one
    // resolves its lazy page without a NavigationEnd event, so an address
    // opened directly (a shared link, a refresh) is only seen this way.
    yield* craftEffect('followRoute', () => {
      const route = activeRoute.snapshot;
      untracked(() => handleRoute(route));
    });

    yield* craftEffect('seekRequestedEvent', () => {
      const state = replayStatus();
      const eventId = requestedEventId;
      if (eventId === undefined || !['ready', 'paused'].includes(state)) return;
      if (registers.loadedArchiveSessionId !== routeSessionId()) return;
      requestedEventId = undefined;
      const e2e = requestedE2e;
      requestedE2e = undefined;
      untracked(() => {
        replaySession.seekReplayToRecordedEvent(eventId);
        if (e2e)
          setStates({
            resumeIntent: coverageE2eIntent(e2e.app, e2e.behavior),
            resumeDialogOpen: true,
          });
      });
    });

    const retryThumbnails = (): void => {
      if (requestedId !== undefined && !workerMode)
        thumbnails.watch(requestedId, true);
    };

    yield* craftExpose('open', open);
    yield* craftExpose('retryThumbnails', retryThumbnails);
    yield* craftExpose('remove', remove);
  },
);
