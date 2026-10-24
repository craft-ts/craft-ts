import {
  button,
  content,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  p,
  supportsDebugSessionExportVersion,
  supportsDebugSessionReplayVersion,
  span,
  ul,
} from '@craft-ts/component';
import {
  DEBUG_SESSION_EXPORT_VERSION,
  DEBUG_SESSION_REPLAY_VERSION,
  craftComputed,
  rawReactiveValue,
} from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ImportDialog } from './import-dialog';
import { goToHash } from './replay-browser';
import { sessionDate, storageSizeLabel } from './replay-labels';
import { plural } from './replay-model';
import { ReplayRoute } from './replay-route.service';
import { openImport } from './replay-session';
import type { SessionSummary } from './session-archive.service';
import {
  page,
  pendingDeleteSessionId,
  routeSessionId,
  sessionRoute,
} from './replay-state';
import { SessionArchive } from './session-archive.service';
import { lit } from './view-helpers';

function hasSupportedVersions(session: SessionSummary): boolean {
  return (
    supportsDebugSessionExportVersion(session.recordingVersion) &&
    supportsDebugSessionReplayVersion(session.replayVersion)
  );
}

/** Page 1: the sessions the local archive holds, to open or to delete. */
export const SessionsPage = craftComponent('SessionsPage', {}, function* () {
  const archive = yield* SessionArchive();
  const route = yield* ReplayRoute();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const retentionDays = rawReactiveValue(archive.retentionDays);
  const storageBytes = rawReactiveValue(archive.storageBytes);
  const reachable = rawReactiveValue(archive.reachable);
  const expiredSessions = yield* craftComputed('expiredSessions', () => {
    const cutoff = Date.now() - retentionDays() * 24 * 60 * 60 * 1000;
    return savedSessions().filter(
      (item) =>
        item.status !== 'recording' && Date.parse(item.createdAt) < cutoff,
    );
  });
  const expiredSessionsValue = rawReactiveValue(expiredSessions);
  const expiredSessionCount = yield* craftComputed(
    'expiredSessionCount',
    () => expiredSessionsValue().length,
  );
  const expiredCount = rawReactiveValue(expiredSessionCount);
  const incompatibleSessions = yield* craftComputed(
    'incompatibleSessions',
    () =>
      savedSessions().filter(
        (item) => item.status !== 'recording' && !hasSupportedVersions(item),
      ),
  );
  const incompatibleSessionsValue = rawReactiveValue(incompatibleSessions);
  const incompatibleCountSignal = yield* craftComputed(
    'incompatibleSessionCount',
    () => incompatibleSessionsValue().length,
  );
  const incompatibleCount = rawReactiveValue(incompatibleCountSignal);
  const sessionsSummary = yield* craftComputed(
    'sessionsSummary',
    () =>
      `${plural(savedSessions().length, 'session')} · ${storageSizeLabel(storageBytes())} pour les replays · sur cette machine, rien n’est envoyé · nettoyage après ${retentionDays()} jours.`,
  );
  const emptyHidden = yield* craftComputed(
    'emptyHidden',
    () => savedSessions().length > 0 || !reachable(),
  );
  const pageHidden = yield* craftComputed(
    'pageHidden',
    () => page() !== 'sessions',
  );

  const head = div({ class: ui.listHead }, [
    div([
      heading({ class: ui.title }, 'Sessions'),
      p({ class: ui.lede }, sessionsSummary),
    ]),
    div({ class: ui.listHeadActions }, [
      button(
        'deleteIncompatibleSessions',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'danger',
          'data-lab': 'delete-incompatible-sessions',
          disabled: function* () {
            return incompatibleCount() === 0 || !reachable();
          },
          'data-tooltip':
            'Supprime les sessions dont le format ou le replay n’est pas pris en charge.',
          click: function* () {
            const incompatible = incompatibleSessionsValue();
            if (
              incompatible.length === 0 ||
              !globalThis.confirm(
                `Supprimer définitivement ${plural(incompatible.length, 'session')} dont le format ou le replay n’est pas pris en charge ?`,
              )
            )
              return;
            yield* archive.deleteArchivedSessions(
              incompatible.map((item) => item.id),
            );
          },
        },
        function* () {
          return `Supprimer les incompatibles (${incompatibleCount()})`;
        },
      ),
      button(
        'cleanupOldSessions',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'secondary',
          'data-lab': 'cleanup-old-sessions',
          disabled: function* () {
            return expiredCount() === 0 || !reachable();
          },
          'data-tooltip': function* () {
            return `Supprime les sessions terminées de plus de ${retentionDays()} jours.`;
          },
          click: function* () {
            const count = expiredCount();
            const days = retentionDays();
            if (
              count === 0 ||
              !globalThis.confirm(
                `Supprimer définitivement ${plural(count, 'session')} terminée${count > 1 ? 's' : ''}, créée${count > 1 ? 's' : ''} il y a plus de ${days} jours ?`,
              )
            )
              return;
            yield* archive.pruneExpired();
          },
        },
        'Nettoyer les anciennes',
      ),
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
  ]);

  const unreachable = div({ class: ui.gap, hidden: reachable }, [
    DocCallout({
      tone: lit('warning'),
      caption: lit('Archive injoignable'),
      body: content(() => [
        p(
          { 'data-lab': 'archive-status', role: 'status' },
          'Serveur d’archive arrêté · lance npm run logs:server',
        ),
      ]),
    }),
  ]);

  const rows = ul(
    { class: ui.sessions },
    forNode(savedSessions, { track: (saved) => saved.id }, (saved) =>
      li({ class: ui.row }, [
        button(
          'savedSession',
          {
            type: 'button',
            class: ui.rowOpen,
            'data-lab': 'saved-session',
            click: function* () {
              const item = yield* saved();
              if (routeSessionId() !== item.id) goToHash(sessionRoute(item.id));
              else route.open(item.id);
            },
          },
          [
            span({ class: ui.rowTitle }, [
              span(function* () {
                const item = yield* saved();
                return sessionDate.format(new Date(item.createdAt));
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
              span(
                {
                  class: badgeUi.root,
                  'data-tone': 'warning',
                  'data-lab': 'replay-compatibility',
                  'data-tooltip': `Dashboard courant : format v${DEBUG_SESSION_EXPORT_VERSION}, replay v${DEBUG_SESSION_REPLAY_VERSION}.`,
                  hidden: function* () {
                    const item = yield* saved();
                    return (
                      supportsDebugSessionExportVersion(
                        item.recordingVersion,
                      ) && supportsDebugSessionReplayVersion(item.replayVersion)
                    );
                  },
                },
                'Replay incompatible',
              ),
              span({ class: badgeUi.root, 'data-tone': 'tip' }, function* () {
                const item = yield* saved();
                return `Format v${item.recordingVersion}`;
              }),
              span({ class: badgeUi.root, 'data-tone': 'tip' }, function* () {
                const item = yield* saved();
                return `Replay v${item.replayVersion}`;
              }),
            ]),
            span({ class: ui.rowMeta }, function* () {
              const item = yield* saved();
              return [
                plural(item.participantCount ?? 1, 'onglet'),
                plural(item.eventCount, 'événement'),
              ].join(' · ');
            }),
            span({ class: ui.rowUrl, 'data-lab': 'saved-url' }, function* () {
              const item = yield* saved();
              return item.startUrl;
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
                const item = yield* saved();
                return `Supprimer la session ${item.id}`;
              },
              'data-tooltip': 'Supprime cette session de l’archive locale.',
              click: function* () {
                const item = yield* saved();
                pendingDeleteSessionId.set(item.id);
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
                    const item = yield* saved();
                    route.remove(item.id);
                  },
                },
                'Supprimer définitivement',
              ),
            ],
          ),
        ]),
      ]),
    ),
  );

  const empty = p(
    {
      class: ui.empty,
      'data-lab': 'empty',
      hidden: emptyHidden,
    },
    'Aucune session pour le moment. Lance ton application avec l’enregistrement activé : ses sessions apparaissent ici.',
  );

  return div(
    {
      class: ui.scroll,
      'data-lab': 'list-page',
      hidden: pageHidden,
    },
    [
      div({ class: ui.listPage }, [
        head,
        unreachable,
        rows,
        empty,
        ImportDialog({}),
      ]),
    ],
  );
});
