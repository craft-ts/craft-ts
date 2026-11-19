import {
  BrowserWindow,
  CraftRouter,
  craftExpose,
  craftService,
} from '@craft-ts/core';
import {
  supportsDebugSessionExportVersion,
  supportsDebugSessionReplayVersion,
} from '@craft-ts/component';
import { plural } from '../../shared/util/replay-model';
import { ReplayState, routeSessionId } from '../../shared/state/replay-state';
import {
  SessionArchive,
  type SessionSummary,
} from '../../shared/data-access/session-archive.service';

export function hasSupportedVersions(session: SessionSummary): boolean {
  return (
    supportsDebugSessionExportVersion(session.recordingVersion) &&
    supportsDebugSessionReplayVersion(session.replayVersion)
  );
}

export const { SessionPageActions } = craftService(
  { name: 'sessionPageActions', providedIn: 'global' },
  function* () {
    const archive = yield* SessionArchive();
    const { pendingDeleteSessionId } = (yield* ReplayState()).imperative;
    yield* craftExpose('deleteIncompatibleSessions', function* () {
      const ids = (yield* archive.sessions.savedSessions())
        .filter((item) => item.status !== 'recording' && !hasSupportedVersions(item))
        .map((item) => item.id);
      if (ids.length === 0) return;
      if (
        yield* BrowserWindow.confirm(
          `Supprimer définitivement ${plural(ids.length, 'session')} dont le format ou le replay n’est pas pris en charge ?`,
        )
      )
        yield* archive.deleteArchivedSessions(ids);
    });
    yield* craftExpose(
      'pruneExpiredSessions',
      function* (count: number, days: number) {
        if (count === 0) return;
        if (
          yield* BrowserWindow.confirm(
            `Supprimer définitivement ${plural(count, 'session')} terminée${count > 1 ? 's' : ''}, créée${count > 1 ? 's' : ''} il y a plus de ${days} jours ?`,
          )
        )
          yield* archive.pruneExpired();
      },
    );
    yield* craftExpose('confirmDeleteSession', function* (id: string) {
      yield* archive.deleteSession.mutate(id);
      yield* pendingDeleteSessionId.set(undefined);
      if (routeSessionId() === id) yield* CraftRouter.navigate({ to: '' });
    });
  },
);
