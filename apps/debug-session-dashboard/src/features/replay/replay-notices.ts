import { i18n } from '../../shared/util/catalog';
import {
  button,
  content,
  craftComponent,
  div,
  forNode,
  p,
  span,
} from '@craft-ts/component';
import { BrowserNavigator } from '@craft-ts/core';
import { DocCallout } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../shared/ui/dashboard.style';
import { ReplaySession } from '../../shared/state/replay-session';
import {
  dismissDifferenceNotice,
  dismissWarning,
  toggleSideTab,
} from '../../shared/state/replay-state';
import { lit } from '../../shared/util/view-helpers';
import { ReplayPageViewModel } from './replay-page-view-model.service';

/** Best effort: a note goes to the clipboard when the browser lets it. */
export function* copyReplayNote(text: string) {
  yield* BrowserNavigator.writeClipboardText(text);
}

/** What the replay has to say when it leaves the recording or cannot go on. */
export const ReplayNotices = craftComponent('ReplayNotices', {}, function* () {
  const diff = div(
    {
      class: ui.snackbar,
      'data-lab': 'diff',
      role: 'region',
      'aria-label': 'Décalage du replay',
      hidden: function* () {
        return yield* (yield* ReplayPageViewModel()).differenceHidden();
      },
    },
    [
      p(
        { 'aria-live': 'polite' },
        function* () {
          return yield* (yield* ReplayPageViewModel()).differenceMessage();
        },
      ),
      p(
        {
          hidden: function* () {
            return yield* (yield* ReplayPageViewModel()).toleranceHidden();
          },
          'data-lab': 'applied-tolerances',
        },
        function* () {
          return yield* (yield* ReplayPageViewModel()).toleranceMessage();
        },
      ),
      div({ class: ui.gapActions }, [
        button(
          'skipToCheckpoint',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            'data-lab': 'skip-to-checkpoint',
            hidden: function* () {
              return yield* (yield* ReplayPageViewModel()).skipCheckpointHidden();
            },
            click: function* () {
              (yield* ReplaySession()).skipToCheckpoint();
            },
          },
          i18n.t("copy.copy075"),
        ),
        button(
          'forceReplayRecovery',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'force-recovery',
            hidden: function* () {
              return yield* (yield* ReplayPageViewModel()).forceRecoveryHidden();
            },
            click: function* () {
              (yield* ReplaySession()).forceReplayRecovery();
            },
          },
          i18n.t("copy.copy076"),
        ),
        button(
          'openDifferenceReview',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            'data-lab': 'open-difference-review',
            click: () => toggleSideTab('review'),
          },
          i18n.t("copy.copy077"),
        ),
        button(
          'dismissDifferenceNotice',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'link',
            'data-lab': 'dismiss-difference-notice',
            'aria-label': i18n.t("copy.copy078"),
            click: dismissDifferenceNotice,
          },
          i18n.t("copy.copy079"),
        ),
        span(
          {
            hidden: function* () {
              return yield* (yield* ReplayPageViewModel()).autoSkipHidden();
            },
          },
          i18n.t("copy.copy080"),
        ),
      ]),
      p(
        {
          hidden: function* () {
            return yield* (yield* ReplayPageViewModel()).skipExplanationHidden();
          },
        },
        i18n.t("copy.copy081"),
      ),
    ],
  );

  const partial = div(
    {
      class: ui.gap,
      'data-lab': 'partial',
      hidden: function* () {
        return yield* (yield* ReplayPageViewModel()).partialHidden();
      },
    },
    [
      DocCallout({
        tone: lit('info'),
        caption: lit('Replay partiel'),
        body: content(() => [p(function* () {
          return yield* (yield* ReplayPageViewModel()).partialMessage();
        })]),
      }),
    ],
  );

  const problem = div(
    {
      class: ui.gap,
      'data-lab': 'problem',
      hidden: function* () {
        return yield* (yield* ReplayPageViewModel()).problemHidden();
      },
    },
    [
      DocCallout({
        tone: lit('danger'),
        caption: lit('Impossible de poursuivre'),
        body: content(() => [p(function* () {
          return yield* (yield* ReplayPageViewModel()).problemMessage();
        })]),
      }),
    ],
  );

  // Notes float over the page: one line each, put away one by one or all at
  // once. Nothing here takes room from the replay; the history keeps them all.
  const toasts = div(
    {
      class: ui.toasts,
      'data-lab': 'replay-warning',
      role: 'region',
      'aria-label': 'Notes du replay',
      hidden: function* () {
        return yield* (yield* ReplayPageViewModel()).warningsHidden();
      },
    },
    [
      forNode(function* () {
        return yield* (yield* ReplayPageViewModel()).visibleWarnings();
      }, { track: (warning) => warning }, (warning) =>
        div({ class: ui.toast, 'data-entry': 'warning' }, [
          button(
            'copyReplayWarning',
            {
              type: 'button',
              class: [buttonUi.root, ui.toastText, ui.warningToastCopy],
              'data-variant': 'link',
              'data-lab': 'copy-replay-warning',
              'aria-label': i18n.t("copy.copy082"),
              'data-tooltip': 'Copier cette note dans le presse-papiers.',
              title: warning,
              click: function* () {
                yield* copyReplayNote(yield* warning());
              },
            },
            span({ class: ui.toastText }, warning),
          ),
          button(
            'dismissWarning',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              'aria-label': i18n.t("copy.copy083"),
              'data-lab': 'dismiss-warning',
              'data-tooltip':
                'Ignore cette note et passe tout de suite à l’action suivante au lieu d’attendre le délai enregistré.',
              click: function* () {
                dismissWarning(yield* warning());
                (yield* ReplaySession()).skipReplayWait();
              },
            },
            '×',
          ),
        ]),
      ),
      div(
        {
          class: ui.toastBar,
          hidden: function* () {
            return yield* (yield* ReplayPageViewModel()).toastBarHidden();
          },
        },
        [
          span(
            function* () {
              return yield* (yield* ReplayPageViewModel()).toastMessage();
            },
          ),
          button(
            'openWarningHistory',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              click: () => toggleSideTab('review'),
            },
            i18n.t("copy.copy089"),
          ),
          button(
            'dismissAllWarnings',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'data-lab': 'dismiss-all-warnings',
              'data-tooltip':
                'Ignore toutes les notes et passe tout de suite à l’action suivante.',
              click: function* () {
                (yield* ReplaySession()).dismissWarningsAndSkipReplayWait();
              },
            },
            i18n.t("copy.copy090"),
          ),
        ],
      ),
    ],
  );

  return div({ class: ui.notices }, [diff, partial, problem, toasts]);
});
