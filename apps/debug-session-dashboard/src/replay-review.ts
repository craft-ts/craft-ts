import {
  button,
  craftComponent,
  details,
  div,
  forNode,
  heading,
  li,
  p,
  pre,
  span,
  summary,
  ul,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { copyReplayNote } from './replay-notices';
import { seekReplayToWarning } from './replay-session';
import {
  autoSkipDifferences,
  dismissedWarnings,
  isReplayErrorNote,
  rememberAutoSkipDifferences,
  replayDifferences,
  replayWarnings,
} from './replay-state';

const RESOLUTION_LABEL: Readonly<Record<string, string>> = {
  pending: 'en attente',
  skipped: 'checkpoint rejoint',
  forced: 'reprise forcée',
};

/**
 * Where the replay and the recording parted ways: the gaps it detected, then
 * the notes it left on the way (a wait it shortened, an action it could not
 * reproduce). Both used to be popovers of the head; they are one view now.
 */
export const ReplayReview = craftComponent('ReplayReview', {}, function* () {
  const nothingHidden = yield* craftComputed(
    'nothingHidden',
    () => replayDifferences().length > 0 || replayWarnings().length > 0,
  );

  const differenceTitle = yield* craftComputed('differenceTitle', () =>
    replayDifferences().length > 1
      ? `${replayDifferences().length} décalages avec l’enregistrement`
      : '1 décalage avec l’enregistrement',
  );
  const notesTitle = yield* craftComputed('notesTitle', () =>
    replayWarnings().length > 1
      ? `${replayWarnings().length} notes du replay`
      : '1 note du replay',
  );

  const differences = div(
    {
      class: ui.sideSection,
      'data-lab': 'difference-history',
      hidden: yield* craftComputed(
        'hidden',
        () => replayDifferences().length === 0,
      ),
    },
    [
      heading({ class: ui.sideSectionTitle }, differenceTitle),
      button(
        'disableAutoSkipDifferences',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'secondary',
          hidden: yield* craftComputed('hidden', () => !autoSkipDifferences()),
          click: () => rememberAutoSkipDifferences(false),
        },
        'Désactiver le passage automatique',
      ),
      ul(
        { class: ui.events },
        forNode(replayDifferences, { track: (entry) => entry.id }, (entry) =>
          li({ class: ui.event, 'data-entry': 'difference' }, [
            div({ class: ui.eventInfo }, [
              span({ class: ui.eventName }, function* () {
                const item = yield* entry();
                return item.transport
                  ? `Transport ${item.transport.transportId} · ${item.transport.direction} ${item.transport.sequence}`
                  : `Événement ${item.eventId ?? '?'}`;
              }),
              span({ class: ui.eventMeta }, function* () {
                const item = yield* entry();
                return `${RESOLUTION_LABEL[item.resolution] ?? item.resolution}${item.checkpointEventId ? ` · checkpoint ${item.checkpointEventId}` : ''}`;
              }),
              details([
                summary('Attendu et observé'),
                div({ class: ui.compare }, [
                  div([
                    span({ class: ui.compareLabel }, 'Attendu'),
                    pre({ class: ui.code }, function* () {
                      const item = yield* entry();
                      return JSON.stringify(item.expected, null, 2);
                    }),
                  ]),
                  div([
                    span({ class: ui.compareLabel }, 'Observé'),
                    pre({ class: ui.code }, function* () {
                      const item = yield* entry();
                      return JSON.stringify(item.actual, null, 2);
                    }),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ),
      ),
    ],
  );

  const notes = div(
    {
      class: ui.sideSection,
      'data-lab': 'warning-history',
      role: 'region',
      'aria-label': 'Toutes les notes du replay',
      hidden: yield* craftComputed(
        'hidden',
        () => replayWarnings().length === 0,
      ),
    },
    [
      heading({ class: ui.sideSectionTitle }, notesTitle),
      p(
        { class: ui.lede },
        'Les plus récentes d’abord. « Revoir » relance le replay et s’arrête juste avant l’action concernée.',
      ),
      ul(
        { class: ui.events },
        forNode(
          yield* craftComputed('warningHistory', () =>
            [...replayWarnings()].reverse(),
          ),
          { track: (warning) => warning },
          (warning) =>
            li(
              {
                class: ui.noteItem,
                'data-note': function* () {
                  const text = yield* warning();
                  return isReplayErrorNote(text)
                    ? 'error'
                    : dismissedWarnings().includes(text)
                      ? 'dismissed'
                      : undefined;
                },
              },
              [
                button(
                  'copyReplayWarningHistory',
                  {
                    type: 'button',
                    class: [buttonUi.root, ui.noteText, ui.warningHistoryCopy],
                    'data-variant': 'link',
                    'data-lab': 'copy-replay-warning',
                    'aria-label': 'Copier la note du replay',
                    'data-tooltip': 'Copier cette note dans le presse-papiers.',
                    title: warning,
                    click: function* () {
                      copyReplayNote(yield* warning());
                    },
                  },
                  span({ class: ui.noteText }, warning),
                ),
                button(
                  'seekToWarning',
                  {
                    type: 'button',
                    class: buttonUi.root,
                    'data-variant': 'secondary',
                    'data-lab': 'seek-to-warning',
                    hidden: function* () {
                      return isReplayErrorNote(yield* warning());
                    },
                    'aria-label': 'Rejouer jusqu’à cette action',
                    'aria-description':
                      'Relance le replay depuis le début et s’arrête juste avant l’action à l’origine de cette note.',
                    'data-tooltip':
                      'Relance le replay sans attendre les délais et s’arrête juste avant l’action à l’origine de cette note. « Action suivante » l’exécute ensuite.',
                    click: function* () {
                      seekReplayToWarning(yield* warning());
                    },
                  },
                  'Revoir',
                ),
              ],
            ),
        ),
      ),
    ],
  );

  const empty = p(
    { class: ui.lede, hidden: nothingHidden },
    'Le replay suit l’enregistrement : aucun décalage, aucune note pour l’instant.',
  );

  return div({ class: ui.sideBody }, [
    div({ class: ui.scroll }, [
      div({ class: ui.sideStack }, [empty, differences, notes]),
    ]),
  ]);
});
