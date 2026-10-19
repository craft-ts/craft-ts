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
  registers,
  routeSessionId,
} from './replay-state';
import { httpFailureReason, SessionArchive } from './session-archive.service';

/**
 * The address and the archive, together: the hash names the session to open,
 * a session that finishes loading becomes the open recording, a deletion that
 * succeeds closes the page that showed it. The view only asks to `open` or
 * `remove`; this is the one place that listens to `hashchange`.
 */
export const { ReplayRoute } = craftService(
  { name: 'replayRoute', providedIn: 'global' },
  function* () {
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
      navigate: (hash) => browserLocation.assign(hash),
    });

    const archive = yield* SessionArchive();
    const archivedValue = rawReactiveValue(archive.archived.value);
    const archivedException = rawReactiveValue(archive.archived.exception);
    const deletedValue = rawReactiveValue(archive.deleteSession.value);

    // The session the last load asked for, and the one a deletion is for: the
    // archive's answers do not say, and only the latest request is answered.
    let requestedId: string | undefined;
    let removingId: string | undefined;
    // The last answer that was opened, so that an effect that runs again
    // without a new answer never opens the previous session under a new id.
    let openedArchive: unknown;

    const open = (id: string): void => {
      requestedId = id;
      beginSessionLoad(id);
      archive.archived.call(id);
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
      untracked(() => completeSessionLoad(id, archived));
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
      const id = routeSessionId();
      const importedSession = currentHash() === '#/import';
      const wasDetailPage = page() === 'detail';
      page.set(id || importedSession ? 'detail' : 'sessions');
      if (id && id !== registers.loadedArchiveSessionId) open(id);
      if (!id && !importedSession) {
        endReplayLoadingIndicator();
        if (wasDetailPage) leaveReplayPage();
        registers.loadedArchiveSessionId = undefined;
      }
    };
    onHashChange(handleHashChange);
    handleHashChange();

    yield* craftExpose('open', open);
    yield* craftExpose('remove', remove);
  },
);
