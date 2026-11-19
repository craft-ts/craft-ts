import {
  button,
  craftComponent,
  div,
  forNode,
  option,
  p,
  renderContent,
  select,
  span,
  type ContentSlot,
} from '@craft-ts/component';
import { CraftRouter } from '@craft-ts/core';
import { DocIcon } from '@craft-ts/ui';
import { buttonUi, iconButtonUi } from '@craft-ts/ui/style';
import { ReplayDebug } from '../../shared/state/replay-debug';
import { ReplaySession } from '../../shared/state/replay-session';
import {
  replayableParticipants,
  replayParticipantIds,
  ReplayState,
  selectedParticipantId,
} from '../../shared/state/replay-state';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { requestFrameFullscreen } from '../../shared/util/replay-browser';
import { participantOptionLabel } from '../../shared/util/replay-model';
export { replaySessionTitle } from './replay-title';
import { ReplayPageViewModel } from './replay-page-view-model.service';
import { eventValue, lit } from '../../shared/util/view-helpers';

/**
 * The head of the replay page: which recording this is and where it came from
 * on the left; on the right, the two ways to leave the replay for the live
 * application at the moment it shows. The journal and the other views sit in
 * the rail at the side of the stage, not here.
 */
export const ReplayHead = craftComponent(
  'ReplayHead',
  {},
  function* (input: { readonly pageTitle: ContentSlot }) {
    const back = button(
      'backToSessions',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'link',
        click: function* () {
          yield* CraftRouter.navigate({ to: '' });
        },
      },
      i18n.t('copy.copy056'),
    );

    const lineage = p(
      {
        class: ui.headLineage,
        'data-lab': 'session-lineage',
        hidden: function* () {
          return (yield* (yield* ReplayPageViewModel()).derivation()) === '';
        },
      },
      [
        span(function* () {
          return yield* (yield* ReplayPageViewModel()).derivation();
        }),
        button(
          'openSourceSession',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'link',
            'data-lab': 'open-source-session',
            hidden: function* () {
              return !(yield* (yield* ReplayPageViewModel()).sourceKnown());
            },
            click: function* () {
              const id = yield* (yield* ReplayPageViewModel()).sourceId();
              if (id)
                yield* CraftRouter.navigate({
                  to: 'sessions/:sessionId',
                  params: { sessionId: id },
                });
            },
          },
          i18n.t('copy.copy057'),
        ),
      ],
    );

    const title = div({ class: ui.headTitle }, [
      back,
      renderContent('pageTitle', input.pageTitle),
      p({ class: ui.headUrl }, function* () {
        return yield* (yield* ReplayPageViewModel()).sessionFacts();
      }),
      lineage,
    ]);

    const tabs = select(
      'participantFilter',
      {
        class: ui.tabSelect,
        value: selectedParticipantId,
        hidden: function* () {
          return yield* (yield* ReplayPageViewModel()).participantFilterHidden();
        },
        change: function* (event: Event) {
          (yield* ReplaySession()).selectParticipant(eventValue(event));
        },
        'aria-label': i18n.t('copy.copy058'),
      },
      [
        option({ value: 'all' }, i18n.t('copy.copy059')),
        forNode(
          replayableParticipants,
          { track: (participant) => participant.id },
          (participant) =>
            option(
              {
                value: function* () {
                  const item = yield* participant();
                  return item.id;
                },
              },
              function* () {
                return i18n.t('participantLabel', {
                  participant: participantOptionLabel(yield* participant()),
                });
              },
            ),
        ),
      ],
    );

    const fullscreen = button(
      'fullscreen',
      {
        type: 'button',
        class: iconButtonUi.root,
        'aria-label': i18n.t('copy.copy060'),
        'aria-description': 'Affiche l’application cible en plein écran.',
        'data-tooltip':
          'Agrandit l’application rejouée en plein écran pour l’inspecter.',
        click: () => {
          const participantId = replayParticipantIds()[0];
          if (participantId) requestFrameFullscreen(participantId);
        },
        disabled: function* () {
          return yield* (yield* ReplayPageViewModel()).fullscreenDisabled();
        },
      },
      DocIcon({ name: lit('expand'), size: lit('sm') }),
    );

    // Both open the live application in a tab of its own, at the moment the
    // replay shows. One restores what was recorded, right away; the other asks
    // an agent to rebuild it with real data, and keeps the way back.
    const debug = button(
      'debugApp',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'secondary',
        'data-lab': 'debug-app',
        'aria-description':
          'Ouvre l’application vivante dans un nouvel onglet, à l’état où le replay est arrivé.',
        'data-tooltip':
          'Restaure tout de suite l’état enregistré dans un nouvel onglet, sans IA. Idéal pour inspecter.',
        click: function* () {
          (yield* ReplayDebug()).launchDebugAppAtReplay();
        },
        disabled: function* () {
          return yield* (yield* ReplayPageViewModel()).debugDisabled();
        },
      },
      [
        DocIcon({ name: lit('external'), size: lit('sm') }),
        span(i18n.t('copy.copy061')),
      ],
    );

    const resume = button(
      'resumeHere',
      {
        type: 'button',
        class: buttonUi.root,
        'data-variant': 'tonal',
        'data-lab': 'resume-here',
        'aria-label': i18n.t('copy.copy062'),
        'aria-description':
          'Demande à un agent IA de rouvrir l’application à ce moment, avec de vraies données.',
        'data-tooltip':
          'Un agent IA reconstruit ce moment dans l’application, avec de vraies données, et laisse un point de reprise et une recette pour y revenir.',
        'aria-haspopup': 'dialog',
        disabled: function* () {
          return yield* (yield* ReplayPageViewModel()).resumeDisabled();
        },
        click: function* () {
          yield* (yield* ReplayState()).imperative.resumeDialogOpen.set(true);
        },
      },
      [
        DocIcon({ name: lit('sparkle'), size: lit('sm') }),
        span(i18n.t('copy.copy063')),
      ],
    );

    const momentActions = div(
      {
        class: ui.momentActions,
        role: 'group',
        'aria-label': 'Ouvrir l’application à ce moment du replay',
      },
      [span({ class: ui.momentLabel }, i18n.t('copy.copy064')), debug, resume],
    );

    return div({ class: ui.head }, [
      title,
      div({ class: ui.headTools }, [tabs, momentActions, fullscreen]),
    ]);
  },
);
