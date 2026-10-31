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
  CraftRouter,
  DEBUG_SESSION_EXPORT_VERSION,
  DEBUG_SESSION_REPLAY_VERSION,
  CraftTemporalRuntime,
  craftComputed,
  rawReactiveValue,
} from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ImportDialog } from './import-dialog';
import { sessionDate, storageSizeLabel } from './replay-labels';
import { plural } from './replay-model';
import {
  SessionResumeFilter,
  type SessionListView,
} from './session-resume-filter.service';
import { openImport } from './replay-session';
import type { SessionSummary } from './session-archive.service';
import { page, pendingDeleteSessionId } from './replay-state';
import { SessionArchive } from './session-archive.service';
import {
  derivationLabel,
  derivedSessionsOf,
  isDerivedSession,
  shortUrl,
} from './session-lineage';
import { SessionPageActions } from './sessions-page-actions.service';
import { lit } from './view-helpers';

function hasSupportedVersions(session: SessionSummary): boolean {
  return (
    supportsDebugSessionExportVersion(session.recordingVersion) &&
    supportsDebugSessionReplayVersion(session.replayVersion)
  );
}

const VIEW_LABELS: Readonly<Record<SessionListView, string>> = {
  recordings: 'Enregistrements',
  derived: 'Reprises et recettes',
  all: 'Toutes',
};

/**
 * Page 1: the sessions the local archive holds. By default the recordings a
 * person made; the sessions the resume tooling recorded from them sit in their
 * own view, and each recording says what came out of it.
 */
export const SessionsPage = craftComponent('SessionsPage', {}, function* () {
  const archive = yield* SessionArchive();
  const listView = yield* SessionResumeFilter();
  const actions = yield* SessionPageActions();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const savedRecipes = rawReactiveValue(archive.resumeRecipeList);
  const retentionDays = rawReactiveValue(archive.retentionDays);
  const storageBytes = rawReactiveValue(archive.storageBytes);
  const reachable = rawReactiveValue(archive.reachable);
  const view = rawReactiveValue(listView.filter.view);

  const recordingCount = yield* craftComputed(
    'recordingCount',
    () => savedSessions().filter((item) => !isDerivedSession(item)).length,
  );
  const recordingCountValue = rawReactiveValue(recordingCount);
  const visibleSessions = yield* craftComputed('visibleSessions', () => {
    const sessions = savedSessions();
    const current = view();
    return current === 'all'
      ? sessions
      : sessions.filter(
          (item) => isDerivedSession(item) === (current === 'derived'),
        );
  });
  const visibleSessionsValue = rawReactiveValue(visibleSessions);

  const temporal = yield* CraftTemporalRuntime();
  const expiredSessions = yield* craftComputed('expiredSessions', () => {
    const cutoff = temporal.dateNow() - retentionDays() * 24 * 60 * 60 * 1000;
    return savedSessions().filter(
      (item) =>
        item.status !== 'recording' && Date.parse(item.createdAt) < cutoff,
    );
  });
  const expiredSessionsValue = rawReactiveValue(expiredSessions);
  const expiredCount = rawReactiveValue(
    yield* craftComputed(
      'expiredSessionCount',
      () => expiredSessionsValue().length,
    ),
  );
  const incompatibleSessions = yield* craftComputed(
    'incompatibleSessions',
    () =>
      savedSessions().filter(
        (item) => item.status !== 'recording' && !hasSupportedVersions(item),
      ),
  );
  const incompatibleSessionsValue = rawReactiveValue(incompatibleSessions);
  const incompatibleCount = rawReactiveValue(
    yield* craftComputed(
      'incompatibleCountSignal',
      () => incompatibleSessionsValue().length,
    ),
  );
  const sessionsSummary = yield* craftComputed(
    'sessionsSummary',
    () =>
      `${plural(savedSessions().length, 'session')} · ${storageSizeLabel(storageBytes())} · sur cette machine, rien n’est envoyé · effacées après ${retentionDays()} jours`,
  );

  const head = div({ class: ui.listHead }, [
    div([
      heading({ class: ui.title }, 'Sessions'),
      p({ class: ui.lede }, sessionsSummary),
    ]),
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
  ]);

  const viewButton = (id: SessionListView) =>
    button(
      'showSessionView',
      {
        type: 'button',
        class: ui.segment,
        'data-lab': `session-view-${id}`,
        'aria-pressed': function* () {
          return view() === id ? 'true' : 'false';
        },
        'data-segment-on': function* () {
          return view() === id ? 'true' : undefined;
        },
        click: function* () {
          yield* listView.filter.show(id);
        },
      },
      function* () {
        const sessions = savedSessions();
        const count =
          id === 'all'
            ? sessions.length
            : id === 'recordings'
              ? recordingCountValue()
              : sessions.length - recordingCountValue();
        return `${VIEW_LABELS[id]} · ${count}`;
      },
    );
  const views = div(
    {
      class: ui.segments,
      role: 'group',
      'aria-label': 'Sessions à afficher',
    },
    [viewButton('recordings'), viewButton('derived'), viewButton('all')],
  );

  // Housekeeping shows only when there is some to do.
  const housekeeping = div(
    {
      class: ui.housekeeping,
      'data-lab': 'housekeeping',
      hidden: function* () {
        return incompatibleCount() === 0 && expiredCount() === 0;
      },
    },
    [
      span(function* () {
        return [
          ...(incompatibleCount() > 0
            ? [
                `${plural(incompatibleCount(), 'session')} au format non rejouable par ce dashboard`,
              ]
            : []),
          ...(expiredCount() > 0
            ? [
                `${plural(expiredCount(), 'session')} de plus de ${retentionDays()} jours`,
              ]
            : []),
        ].join(' · ');
      }),
      div({ class: ui.gapActions }, [
        button(
          'deleteIncompatibleSessions',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'delete-incompatible-sessions',
            hidden: function* () {
              return incompatibleCount() === 0;
            },
            disabled: function* () {
              return !reachable();
            },
            'data-tooltip':
              'Supprime les sessions dont le format ou le replay n’est pas pris en charge.',
            click: function* () {
              const incompatible = incompatibleSessionsValue();
              if (incompatible.length > 0)
                yield* actions.deleteIncompatibleSessions(
                  incompatible.map((item) => item.id),
                );
            },
          },
          'Supprimer les incompatibles',
        ),
        button(
          'cleanupOldSessions',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'cleanup-old-sessions',
            hidden: function* () {
              return expiredCount() === 0;
            },
            disabled: function* () {
              return !reachable();
            },
            click: function* () {
              const count = expiredCount();
              const days = retentionDays();
              if (count > 0) yield* actions.pruneExpiredSessions(count, days);
            },
          },
          'Nettoyer les anciennes',
        ),
      ]),
    ],
  );

  const unreachable = div({ class: ui.gap, hidden: reachable }, [
    DocCallout({
      tone: lit('warning'),
      caption: lit('Archive injoignable'),
      body: content(() => [
        p(
          { 'data-lab': 'archive-status', role: 'status' },
          'Le serveur d’archive ne répond pas. Lancez npm run logs:server : la liste se remplira toute seule.',
        ),
      ]),
    }),
  ]);

  const rows = ul(
    { class: ui.sessions },
    forNode(visibleSessions, { track: (saved) => saved.id }, (saved) =>
      li({ class: ui.row }, [
        button(
          'savedSession',
          {
            type: 'button',
            class: ui.rowOpen,
            'data-lab': 'saved-session',
            click: function* () {
              const item = yield* saved();
              yield* CraftRouter.navigate({
                to: 'sessions/:sessionId',
                params: { sessionId: item.id },
              });
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
                  'data-tone': 'danger',
                  'data-lab': 'replay-compatibility',
                  'data-tooltip': function* () {
                    const item = yield* saved();
                    return `Format v${item.recordingVersion}, replay v${item.replayVersion}. Ce dashboard rejoue le format v${DEBUG_SESSION_EXPORT_VERSION}, replay v${DEBUG_SESSION_REPLAY_VERSION}.`;
                  },
                  hidden: function* () {
                    const savedItem = yield* saved();
                    return hasSupportedVersions(savedItem);
                  },
                },
                'Replay incompatible',
              ),
            ]),
            span({ class: ui.rowMeta }, function* () {
              const item = yield* saved();
              return [
                shortUrl(item.startUrl),
                plural(item.participantCount ?? 1, 'onglet'),
                plural(item.eventCount, 'événement'),
              ].join(' · ');
            }),
            // Where it came from, for a session the resume tooling recorded.
            span(
              {
                class: ui.rowLineage,
                'data-lab': 'session-derivation',
                hidden: function* () {
                  const savedItem = yield* saved();
                  return !isDerivedSession(savedItem);
                },
              },
              function* () {
                return `↳ ${derivationLabel(yield* saved(), savedSessions(), savedRecipes())}`;
              },
            ),
            // What came out of it, for a recording.
            span(
              {
                class: ui.rowChips,
                hidden: function* () {
                  const item = yield* saved();
                  return (
                    isDerivedSession(item) ||
                    ((item.resumeCount ?? 0) === 0 &&
                      (item.recipeCount ?? 0) === 0 &&
                      derivedSessionsOf(
                        item.id,
                        savedSessions(),
                        savedRecipes(),
                      ).length === 0)
                  );
                },
              },
              [
                span(
                  {
                    class: badgeUi.root,
                    'data-tone': 'tip',
                    'data-lab': 'resume-count',
                    hidden: function* () {
                      const savedItem = yield* saved();
                      return (savedItem.resumeCount ?? 0) === 0;
                    },
                  },
                  function* () {
                    const savedItem = yield* saved();
                    return plural(
                      savedItem.resumeCount ?? 0,
                      'point de reprise',
                      'points de reprise',
                    );
                  },
                ),
                span(
                  {
                    class: badgeUi.root,
                    'data-tone': 'tip',
                    'data-lab': 'recipe-count',
                    hidden: function* () {
                      const savedItem = yield* saved();
                      return (savedItem.recipeCount ?? 0) === 0;
                    },
                  },
                  function* () {
                    const savedItem = yield* saved();
                    return plural(savedItem.recipeCount ?? 0, 'recette');
                  },
                ),
                span(
                  {
                    class: badgeUi.root,
                    'data-tone': 'info',
                    'data-lab': 'derived-count',
                    hidden: function* () {
                      const item = yield* saved();
                      return (
                        derivedSessionsOf(
                          item.id,
                          savedSessions(),
                          savedRecipes(),
                        ).length === 0
                      );
                    },
                  },
                  function* () {
                    const item = yield* saved();
                    return plural(
                      derivedSessionsOf(
                        item.id,
                        savedSessions(),
                        savedRecipes(),
                      ).length,
                      'session issue',
                      'sessions issues',
                    );
                  },
                ),
              ],
            ),
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
                    yield* actions.confirmDeleteSession(item.id);
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
      hidden: function* () {
        return savedSessions().length > 0 || !reachable();
      },
    },
    'Aucune session pour le moment. Lancez votre application avec l’enregistrement activé : ses sessions apparaissent ici.',
  );
  const emptyView = p(
    {
      class: ui.empty,
      'data-lab': 'empty-resume-filter',
      hidden: function* () {
        return (
          savedSessions().length === 0 || visibleSessionsValue().length > 0
        );
      },
    },
    function* () {
      return view() === 'derived'
        ? 'Aucune reprise ni exécution de recette. Ouvrez un enregistrement et choisissez « Reprendre ici » pour en lancer une.'
        : 'Aucun enregistrement dans cette vue.';
    },
  );

  return div(
    {
      class: ui.scroll,
      'data-lab': 'list-page',
      hidden: yield* craftComputed('hidden', () => page() !== 'sessions'),
    },
    [
      div({ class: ui.listPage }, [
        head,
        unreachable,
        div({ class: ui.listTools }, [views, housekeeping]),
        rows,
        emptyView,
        empty,
        ImportDialog({}),
      ]),
    ],
  );
});
