import {
  BrowserWindow,
  CraftRouter,
  craftExpose,
  craftService,
} from '@craft-ts/core';
import { plural } from './replay-model';
import { pendingDeleteSessionId, routeSessionId } from './replay-state';
import { SessionArchive } from './session-archive.service';

export const { SessionPageActions } = craftService(
  { name: 'sessionPageActions', providedIn: 'global' },
  function* () {
    const archive = yield* SessionArchive();
    yield* craftExpose('deleteIncompatibleSessions', function* (ids: string[]) {
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
      pendingDeleteSessionId.set(undefined);
      if (routeSessionId() === id) yield* CraftRouter.navigate({ to: '' });
    });
  },
);
