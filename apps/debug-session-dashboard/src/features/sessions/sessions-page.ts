import {
  button,
  content,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import {
  CraftTemporalRuntime,
  CraftRouter,
  DEBUG_SESSION_EXPORT_VERSION,
  DEBUG_SESSION_REPLAY_VERSION,
} from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import {
  SessionArchive,
  type SessionSummary,
} from '../../shared/data-access/session-archive.service';
import { ReplaySession } from '../../shared/state/replay-session';
import { page, ReplayState } from '../../shared/state/replay-state';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { sessionDate, storageSizeLabel } from '../../shared/util/replay-labels';
import { plural } from '../../shared/util/replay-model';
import {
  continuationLabel,
  derivationLabel,
  derivedSessionsOf,
  isDerivedSession,
  shortUrl,
} from '../../shared/util/session-lineage';
import { lit } from '../../shared/util/view-helpers';
import { ImportDialog } from './import-dialog';
import {
  SessionResumeFilter,
  type SessionListView,
} from './session-resume-filter.service';
import {
  hasSupportedVersions,
  SessionPageActions,
} from './sessions-page-actions.service';

const VIEW_LABELS: Readonly<Record<SessionListView, string>> = {
  recordings: 'Enregistrements',
  derived: 'Reprises et recettes',
  all: 'Toutes',
};

type SessionsOverview = Readonly<{
  recordingCount: number;
  visibleSessions: readonly SessionSummary[];
  expiredCount: number;
  incompatibleCount: number;
  sessionsSummary: string;
  pageHidden: boolean;
}>;

function* sessionOverview(): Generator<unknown, SessionsOverview, unknown> {
  const archive = yield* SessionArchive();
  const sessions = yield* archive.sessions.savedSessions();
  const current = yield* (yield* SessionResumeFilter()).filter.view();
  const visibleSessions =
    current === 'all'
      ? sessions
      : sessions.filter((item) => isDerivedSession(item) === (current === 'derived'));
  const days = yield* archive.sessions.retentionDays();
  const cutoff = (yield* CraftTemporalRuntime()).dateNow() - days * 86400000;
  const expiredCount = sessions.filter(
    (item) => item.status !== 'recording' && Date.parse(item.createdAt) < cutoff,
  ).length;
  const incompatibleCount = sessions.filter(
    (item) => item.status !== 'recording' && !hasSupportedVersions(item),
  ).length;
  const bytes = yield* archive.sessions.storageBytes();
  return {
    recordingCount: sessions.filter((item) => !isDerivedSession(item)).length,
    visibleSessions,
    expiredCount,
    incompatibleCount,
    sessionsSummary: i18n.t('sessionsStorageSummary', {
      sessionCount: plural(sessions.length, 'session'),
      storageSize: storageSizeLabel(bytes),
      retentionDays: days,
    }),
    pageHidden: page() !== 'sessions',
  };
}

/**
 * Page 1: the sessions the local archive holds. By default the recordings a
 * person made; the sessions the resume tooling recorded from them sit in their
 * own view, and each recording says what came out of it.
 */
export const SessionsPage = craftComponent(
  'SessionsPage',
  {},
  function* () {
  const head = div({ class: ui.listHead }, [
    div([
      heading({ class: ui.title }, i18n.t('copy.copy168')),
      p({ class: ui.lede }, function* () {
        return (yield* sessionOverview()).sessionsSummary;
      }),
    ]),
    button(
      'openImport',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        click: function* () {
          (yield* ReplaySession()).openImport();
        },
      },
      i18n.t('copy.copy169'),
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
          const _view = yield* (yield* SessionResumeFilter()).filter.view();
          return _view === id ? 'true' : 'false';
        },
        'data-segment-on': function* () {
          const _view = yield* (yield* SessionResumeFilter()).filter.view();
          return _view === id ? 'true' : undefined;
        },
        click: function* () {
          yield* (yield* SessionResumeFilter()).filter.show(id);
        },
      },
      function* () {
        const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
        const sessions = _savedSessions;
        const _recordingCountValue = (yield* sessionOverview()).recordingCount;
        const count =
          id === 'all'
            ? sessions.length
            : id === 'recordings'
              ? _recordingCountValue
              : sessions.length - _recordingCountValue;
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
        const overview = yield* sessionOverview();
        const _expiredCount = overview.expiredCount;
        const _incompatibleCount = overview.incompatibleCount;
        return _incompatibleCount === 0 && _expiredCount === 0;
      },
    },
    [
      span(function* () {
        const _retentionDays = yield* (yield* SessionArchive()).sessions.retentionDays();
        const overview = yield* sessionOverview();
        const _expiredCount = overview.expiredCount;
        const _incompatibleCount = overview.incompatibleCount;
        return [
          ...(_incompatibleCount > 0
            ? [
                i18n.t('sessionsIncompatible', {
                  count: plural(_incompatibleCount, 'session'),
                }),
              ]
            : []),
          ...(_expiredCount > 0
            ? [
                i18n.t('sessionsOlderThan', {
                  count: plural(_expiredCount, 'session'),
                  total: _retentionDays,
                }),
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
              const _incompatibleCount = (yield* sessionOverview()).incompatibleCount;
              return _incompatibleCount === 0;
            },
            disabled: function* () {
              const _reachable = yield* (yield* SessionArchive()).sessions.reachable();
              return !_reachable;
            },
            'data-tooltip':
              'Supprime les sessions dont le format ou le replay n’est pas pris en charge.',
            click: function* () {
              yield* (yield* SessionPageActions()).deleteIncompatibleSessions();
            },
          },
          i18n.t('copy.copy170'),
        ),
        button(
          'cleanupOldSessions',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'cleanup-old-sessions',
            hidden: function* () {
              const _expiredCount = (yield* sessionOverview()).expiredCount;
              return _expiredCount === 0;
            },
            disabled: function* () {
              const _reachable = yield* (yield* SessionArchive()).sessions.reachable();
              return !_reachable;
            },
            click: function* () {
              const overview = yield* sessionOverview();
              const _expiredCount = overview.expiredCount;
              const count = _expiredCount;
              const _retentionDays = yield* (yield* SessionArchive()).sessions.retentionDays();
              const days = _retentionDays;
              if (count > 0) yield* (yield* SessionPageActions()).pruneExpiredSessions(count, days);
            },
          },
          i18n.t('copy.copy171'),
        ),
      ]),
    ],
  );

  const unreachable = div({ class: ui.gap, hidden: function* () {
    return yield* (yield* SessionArchive()).sessions.reachable();
  } }, [
    DocCallout({
      tone: lit('warning'),
      caption: lit('Archive injoignable'),
      body: content(() => [
        p(
          { 'data-lab': 'archive-status', role: 'status' },
          i18n.t('copy.copy172'),
        ),
      ]),
    }),
  ]);

  const rows = ul(
    { class: ui.sessions },
    forNode(function* () {
      return (yield* sessionOverview()).visibleSessions;
    }, { track: (saved) => saved.id }, (saved) =>
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
                    ? i18n.t('copy.copy173')
                    : item.status === 'interrupted'
                      ? i18n.t('copy.copy174')
                      : i18n.t('copy.copy175');
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
                i18n.t('copy.copy176'),
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
            // The same browser's previous session, when this one began after a pause.
            span(
              {
                class: ui.rowLineage,
                'data-lab': 'session-continuation',
                hidden: function* () {
                  const savedItem = yield* saved();
                  return !savedItem.continuesFrom;
                },
              },
              function* () {
                const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
                return `↳ ${continuationLabel(yield* saved(), _savedSessions)}`;
              },
            ),
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
                const _savedRecipes = yield* (yield* SessionArchive()).recipeCatalog.resumeRecipeList();
                const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
                return `↳ ${derivationLabel(yield* saved(), _savedSessions, _savedRecipes)}`;
              },
            ),
            // What came out of it, for a recording.
            span(
              {
                class: ui.rowChips,
                hidden: function* () {
                  const item = yield* saved();
                  const _savedRecipes = yield* (yield* SessionArchive()).recipeCatalog.resumeRecipeList();
                  const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
                  return (
                    isDerivedSession(item) ||
                    ((item.resumeCount ?? 0) === 0 &&
                      (item.recipeCount ?? 0) === 0 &&
                      derivedSessionsOf(item.id, _savedSessions, _savedRecipes)
                        .length === 0)
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
                      const _savedRecipes = yield* (yield* SessionArchive()).recipeCatalog.resumeRecipeList();
                      const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
                      return (
                        derivedSessionsOf(
                          item.id,
                          _savedSessions,
                          _savedRecipes,
                        ).length === 0
                      );
                    },
                  },
                  function* () {
                    const item = yield* saved();
                    const _savedRecipes = yield* (yield* SessionArchive()).recipeCatalog.resumeRecipeList();
                    const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
                    return plural(
                      derivedSessionsOf(item.id, _savedSessions, _savedRecipes)
                        .length,
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
                return (yield* (yield* ReplayState()).imperative.pendingDeleteSessionId()) === item.id;
              },
              'aria-label': function* () {
                const item = yield* saved();
                return i18n.t('sessionDeleteLabel', { sessionId: item.id });
              },
              'data-tooltip': 'Supprime cette session de l’archive locale.',
              click: function* () {
                const item = yield* saved();
                (yield* ReplayState()).imperative.setStates({ pendingDeleteSessionId: item.id });
              },
            },
            i18n.t('copy.copy178'),
          ),
          div(
            {
              class: ui.confirm,
              'data-lab': 'delete-confirmation',
              role: 'group',
              'aria-label': 'Confirmer la suppression de la session',
              hidden: function* () {
                const item = yield* saved();
                return (yield* (yield* ReplayState()).imperative.pendingDeleteSessionId()) !== item.id;
              },
            },
            [
              span(i18n.t('copy.copy179')),
              button(
                'cancelDeleteSession',
                {
                  type: 'button',
                  class: buttonUi.root,
                  'data-variant': 'secondary',
                  'data-lab': 'cancel-delete-session',
                  click: function* () {
                    (yield* ReplayState()).imperative.setStates({ pendingDeleteSessionId: undefined });
                  },
                },
                i18n.t('copy.copy180'),
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
                    yield* (yield* SessionPageActions()).confirmDeleteSession(item.id);
                  },
                },
                i18n.t('copy.copy181'),
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
        const _reachable = yield* (yield* SessionArchive()).sessions.reachable();
        const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
        return _savedSessions.length > 0 || !_reachable;
      },
    },
    i18n.t('copy.copy182'),
  );
  const emptyView = p(
    {
      class: ui.empty,
      'data-lab': 'empty-resume-filter',
      hidden: function* () {
        const _visibleSessionsValue = (yield* sessionOverview()).visibleSessions;
        const _savedSessions = yield* (yield* SessionArchive()).sessions.savedSessions();
        return _savedSessions.length === 0 || _visibleSessionsValue.length > 0;
      },
    },
    function* () {
      const _view = yield* (yield* SessionResumeFilter()).filter.view();
      return _view === 'derived'
        ? i18n.t('copy.copy183')
        : i18n.t('copy.copy184');
    },
  );

  return div(
    {
      class: ui.scroll,
      'data-lab': 'list-page',
      hidden: function* () {
        return (yield* sessionOverview()).pageHidden;
      },
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
