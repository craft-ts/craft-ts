import { i18n } from '../../../shared/util/catalog';
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
import { ui } from '../../../shared/ui/dashboard.style';
import { copyReplayNote } from '../replay-notices';
import { ReplaySession } from '../../../shared/state/replay-session';
import {
  autoSkipDifferences,
  dismissedWarnings,
  isReplayErrorNote,
  rememberAutoSkipDifferences,
  replayDifferences,
  replayWarnings,
} from '../../../shared/state/replay-state';

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
  const replaySession = yield* ReplaySession();
  const nothingHidden = yield* craftComputed(
    'nothingHidden',
    () => replayDifferences().length > 0 || replayWarnings().length > 0,
  );

  const differenceTitle = yield* craftComputed('differenceTitle', () =>
    replayDifferences().length > 1
      ? (i18n.t("copy.copy109") + (replayDifferences().length) + i18n.t("copy.copy110"))
      : i18n.t("copy.copy111"),
  );
  const notesTitle = yield* craftComputed('notesTitle', () =>
    replayWarnings().length > 1
      ? (i18n.t("copy.copy112") + (replayWarnings().length) + i18n.t("copy.copy113"))
      : i18n.t("copy.copy114"),
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
        i18n.t("copy.copy115"),
      ),
      ul(
        { class: ui.events },
        forNode(replayDifferences, { track: (entry) => entry.id }, (entry) =>
          li({ class: ui.event, 'data-entry': 'difference' }, [
            div({ class: ui.eventInfo }, [
              span({ class: ui.eventName }, function* () {
                const item = yield* entry();
                return item.transport
                  ? i18n.t('transportSummary', {
                      transportId: item.transport.transportId,
                      direction: item.transport.direction,
                      sequence: item.transport.sequence,
                    })
                  : i18n.t('eventSummary', {
                      eventId: item.eventId ?? '?',
                    });
              }),
              span({ class: ui.eventMeta }, function* () {
                const item = yield* entry();
                return `${RESOLUTION_LABEL[item.resolution] ?? item.resolution}${item.checkpointEventId ? ` · checkpoint ${item.checkpointEventId}` : ''}`;
              }),
              details([
                summary('Attendu et observé'),
                div({ class: ui.compare }, [
                  div([
                    span({ class: ui.compareLabel }, i18n.t("copy.copy120")),
                    pre({ class: ui.code }, function* () {
                      const item = yield* entry();
                      return JSON.stringify(item.expected, null, 2);
                    }),
                  ]),
                  div([
                    span({ class: ui.compareLabel }, i18n.t("copy.copy121")),
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
        i18n.t("copy.copy122"),
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
                    'aria-label': i18n.t("copy.copy123"),
                    'data-tooltip': 'Copier cette note dans le presse-papiers.',
                    title: warning,
                    click: function* () {
                      yield* copyReplayNote(yield* warning());
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
                    'aria-label': i18n.t("copy.copy124"),
                    'aria-description':
                      'Relance le replay depuis le début et s’arrête juste avant l’action à l’origine de cette note.',
                    'data-tooltip':
                      'Relance le replay sans attendre les délais et s’arrête juste avant l’action à l’origine de cette note. « Action suivante » l’exécute ensuite.',
                    click: function* () {
                      replaySession.seekReplayToWarning(yield* warning());
                    },
                  },
                  i18n.t("copy.copy125"),
                ),
              ],
            ),
        ),
      ),
    ],
  );

  const empty = p(
    { class: ui.lede, hidden: nothingHidden },
    i18n.t("copy.copy126"),
  );

  return div({ class: ui.sideBody }, [
    div({ class: ui.scroll }, [
      div({ class: ui.sideStack }, [empty, differences, notes]),
    ]),
  ]);
});
