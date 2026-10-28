import {
  BrowserCryptoService,
  BrowserLocationService,
  CraftTemporalRuntime,
  craftEffect,
  craftExpose,
  craftService,
  rawReactiveValue,
  ɵuntracked as untracked,
} from '@craft-ts/core';
import {
  currentHash,
  goToHash,
  installReplayPlatform,
  isReplayWorkerMode,
  onHashChange,
} from './replay-browser';
import {
  beginSessionLoad,
  completeSessionLoad,
  failSessionLoad,
  leaveReplayPage,
} from './replay-session';
import { endReplayLoadingIndicator } from './replay-playback';
import {
  page,
  pendingDeleteSessionId,
  ReplayState,
  registers,
  routeSessionId,
  syncActiveRouteSessionId,
  thumbnailManifest,
} from './replay-state';
import { installReplayWorkerSurface } from './replay-worker';
import { httpFailureReason, SessionArchive } from './session-archive.service';
import { E2eComparison } from './e2e-comparison.service';
import { ResumeThread } from './resume-thread.service';
import {
  ThumbnailArchive,
  type ThumbnailManifest,
} from './thumbnail-archive.service';

/**
 * The address and the archive, together: the hash names the session to open,
 * a session that finishes loading becomes the open recording, a deletion that
 * succeeds closes the page that showed it. The view only asks to `open` or
 * `remove`; this is the one place that listens to `hashchange`.
 */
export const { ReplayRoute } = craftService(
  { name: 'replayRoute', providedIn: 'global' },
  function* () {
    yield* ReplayState();
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
      uuid: () => browserCrypto.randomUUID(),
      hash: () => browserLocation.hash(),
      search: () => browserLocation.search(),
      navigate: (hash) => browserLocation.assign(hash),
    });

    // Opened by the thumbnail worker: it replays and is photographed, it does
    // not ask for thumbnails of its own.
    const workerMode = isReplayWorkerMode();
    if (workerMode) installReplayWorkerSurface();

    const archive = yield* SessionArchive();
    const e2eComparison = yield* E2eComparison();
    const thumbnails = yield* ThumbnailArchive();
    const resumeThread = yield* ResumeThread();
    const archivedValue = rawReactiveValue(archive.archived.value);
    const archivedException = rawReactiveValue(archive.archived.exception);
    const deletedValue = rawReactiveValue(archive.deleteSession.value);
    const manifestValue = rawReactiveValue(thumbnails.thumbnailManifest.value);
    const preparedValue = rawReactiveValue(thumbnails.prepareThumbnails.value);

    // The session the last load asked for, and the one a deletion is for: the
    // archive's answers do not say, and only the latest request is answered.
    let requestedId: string | undefined;
    let removingId: string | undefined;
    // The last answer that was opened, so that an effect that runs again
    // without a new answer never opens the previous session under a new id.
    let openedArchive: unknown;

    const open = (id: string): void => {
      requestedId = id;
      thumbnails.stop();
      thumbnailManifest.set(undefined);
      beginSessionLoad(id);
      archive.archived.call(id);
      archive.resumeCheckpoints.call(id);
      archive.resumeRecipes.call(id);
      if (!workerMode) resumeThread.watchSession(id);
    };

    const remove = (id: string): void => {
      removingId = id;
      archive.deleteSession.mutate(id);
    };

    yield* craftEffect('openArchivedSession', () => {
      const archived = archivedValue();
      const id = requestedId;
      if (archived === undefined || id === undefined) return;
      if (archived === openedArchive) return;
      openedArchive = archived;
      untracked(() => {
        completeSessionLoad(id, archived);
        if (!workerMode) thumbnails.watch(id);
      });
    });

    // The manifest of the open recording: what the start answered, then what
    // the archive says as the work goes on. An answer about another recording
    // (the user moved on) is dropped.
    const showManifest = (manifest: ThumbnailManifest): void => {
      if (manifest.sessionId === requestedId) thumbnailManifest.set(manifest);
    };
    yield* craftEffect('showPreparedThumbnails', () => {
      const manifest = preparedValue();
      if (manifest !== undefined) untracked(() => showManifest(manifest));
    });
    yield* craftEffect('showThumbnailManifest', () => {
      const manifest = manifestValue();
      if (manifest !== undefined) untracked(() => showManifest(manifest));
    });

    yield* craftEffect('failArchivedSession', () => {
      const exception = archivedException();
      if (exception !== undefined)
        untracked(() => failSessionLoad(httpFailureReason(exception)));
    });

    yield* craftEffect('closeRemovedSession', () => {
      const deleted = deletedValue();
      const id = removingId;
      if (deleted === undefined || id === undefined) return;
      untracked(() => {
        removingId = undefined;
        pendingDeleteSessionId.set(undefined);
        if (routeSessionId() === id) goToHash('#/');
      });
    });

    const handleHashChange = (): void => {
      syncActiveRouteSessionId();
      const id = routeSessionId();
      const importedSession = currentHash() === '#/import';
      const comparison = currentHash().startsWith('#/compare?');
      const e2eReplay = currentHash().startsWith('#/e2e-replay?');
      const wasDetailPage = page() === 'detail';
      page.set(
        comparison
          ? 'compare'
          : id || importedSession || e2eReplay
            ? 'detail'
            : 'sessions',
      );
      if (comparison) {
        e2eComparison.comparison.call(currentHash());
      }
      if (id && id !== registers.loadedArchiveSessionId) open(id);
      if (!id) {
        thumbnails.stop();
        resumeThread.stop();
        thumbnailManifest.set(undefined);
      }
      if (!id && !importedSession && !e2eReplay) {
        endReplayLoadingIndicator();
        if (wasDetailPage) leaveReplayPage();
        registers.loadedArchiveSessionId = undefined;
      }
    };
    onHashChange(handleHashChange);
    handleHashChange();

    const retryThumbnails = (): void => {
      if (requestedId !== undefined && !workerMode)
        thumbnails.watch(requestedId, true);
    };

    yield* craftExpose('open', open);
    yield* craftExpose('retryThumbnails', retryThumbnails);
    yield* craftExpose('remove', remove);
  },
);
