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
import { rawReactiveValue, ɵcomputed as computed } from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ImportDialog } from './import-dialog';
import { goToHash } from './replay-browser';
import { sessionDate } from './replay-labels';
import { plural } from './replay-model';
import { ReplayRoute } from './replay-route.service';
import { openImport } from './replay-session';
import {
  page,
  pendingDeleteSessionId,
  routeSessionId,
  sessionRoute,
} from './replay-state';
import { SessionArchive } from './session-archive.service';
import { lit } from './view-helpers';

/** Page 1: the sessions the local archive holds, to open or to delete. */
export const SessionsPage = craftComponent('SessionsPage', {}, function* () {
  const archive = yield* SessionArchive();
  const route = yield* ReplayRoute();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const reachable = rawReactiveValue(archive.reachable);

  const head = div({ class: ui.listHead }, [
    div([
      heading({ class: ui.title }, 'Sessions'),
      p(
        { class: ui.lede },
        computed(
          () =>
            `${plural(savedSessions().length, 'session')} · enregistrées sur cette machine, rien n’est envoyé.`,
        ),
      ),
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
      hidden: computed(() => savedSessions().length > 0 || !reachable()),
    },
    'Aucune session pour le moment. Lance ton application avec l’enregistrement activé : ses sessions apparaissent ici.',
  );

  return div(
    {
      class: ui.scroll,
      'data-lab': 'list-page',
      hidden: computed(() => page() !== 'sessions'),
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
