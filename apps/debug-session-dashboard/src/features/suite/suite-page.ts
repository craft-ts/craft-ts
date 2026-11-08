import { i18n } from '../../shared/util/catalog';
import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import { CraftRouter, craftComputed, rawReactiveValue } from '@craft-ts/core';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../shared/ui/dashboard.style';
import { GoldenSuiteArchive } from '../../shared/data-access/golden-suite.service';
import {
  replayLineFor,
  replayStatusLine,
  suiteView,
} from '../../shared/util/golden-suite';

/**
 * An app's regression suite: the recorded sessions kept, each for what it
 * alone shows, the ones left out and why, the paths no session shows any
 * more. A session opens in the replay, or is replayed here as the suite runs
 * it (by the archive, actions dispatched on their elements, state recomputed).
 */
export const SuitePage = craftComponent('SuitePage', {}, function* () {
  const archive = yield* GoldenSuiteArchive();
  const suite = rawReactiveValue(archive.suite.goldenSuite);
  const loading = rawReactiveValue(archive.suite.suiteLoading);
  const unreachable = rawReactiveValue(archive.suite.suiteUnreachable);
  const origins = rawReactiveValue(archive.suite.origins);
  const origin = rawReactiveValue(archive.chosenOrigin.effective);
  const lastReplay = rawReactiveValue(archive.suiteReplay.lastReplay);
  const replaying = rawReactiveValue(archive.suiteReplay.replaying);
  const replayFailed = rawReactiveValue(archive.suiteReplay.replayUnreachable);

  const facts = yield* craftComputed('facts', () => suiteView(suite()).facts);
  const kept = yield* craftComputed('kept', () => suiteView(suite()).sessions);
  const rejected = yield* craftComputed(
    'rejected',
    () => suiteView(suite()).rejected,
  );
  const toRecapture = yield* craftComputed(
    'toRecapture',
    () => suiteView(suite()).toRecapture,
  );
  const uncovered = yield* craftComputed(
    'uncovered',
    () => suiteView(suite()).uncovered,
  );

  const originPicker = div(
    {
      class: ui.segments,
      role: 'group',
      'aria-label': i18n.t('suiteAppsLabel'),
      'data-lab': 'suite-origins',
      hidden: () => origins().length < 2,
    },
    forNode(origins, { track: (item) => item }, (item) =>
      button(
        'chooseSuiteOrigin',
        {
          type: 'button',
          class: ui.segment,
          'aria-pressed': function* () {
            return origin() === (yield* item()) ? 'true' : 'false';
          },
          'data-segment-on': function* () {
            return origin() === (yield* item()) ? 'true' : undefined;
          },
          click: function* () {
            yield* archive.chosenOrigin.choose(yield* item());
          },
        },
        item,
      ),
    ),
  );

  const factList = ul(
    { class: ui.rowChips, 'data-lab': 'suite-facts' },
    forNode(facts, { track: (fact) => fact.label }, (fact) =>
      li({ class: ui.fact }, [
        span({ class: ui.factLabel }, function* () {
          return (yield* fact()).label;
        }),
        span({ class: ui.factValue }, function* () {
          return (yield* fact()).value;
        }),
      ]),
    ),
  );

  const replayStatus = p(
    {
      class: ui.lede,
      'data-lab': 'suite-replay-status',
      hidden: () => !replaying() && !replayFailed(),
    },
    () => replayStatusLine(replaying(), replayFailed()),
  );

  const keptList = ul(
    { class: ui.sessions, 'data-lab': 'suite-sessions' },
    forNode(kept, { track: (row) => row.sessionId }, (row) =>
      li({ class: ui.row, 'data-lab': 'suite-session' }, [
        span({ class: ui.rowBody }, [
          span({ class: ui.rowTitle }, [
            span(function* () {
              return (yield* row()).recorded;
            }),
            span(
              {
                class: badgeUi.root,
                'data-tone': 'warning',
                hidden: function* () {
                  return !(yield* row()).unverified;
                },
              },
              i18n.t('suiteSessionUnverified'),
            ),
          ]),
          span({ class: ui.rowMeta }, function* () {
            return (yield* row()).meta;
          }),
          span(
            { class: ui.rowChips },
            forNode(
              function* () {
                return (yield* row()).uniqueUnits;
              },
              { track: (unit) => unit },
              (unit) =>
                span(
                  { class: ui.unitTag, 'data-lab': 'suite-unique-unit' },
                  unit,
                ),
            ),
          ),
          span(
            {
              class: badgeUi.root,
              'data-lab': 'suite-replay-result',
              'data-tone': function* () {
                return replayLineFor(lastReplay(), (yield* row()).sessionId)
                  .tone;
              },
              hidden: function* () {
                return replayLineFor(lastReplay(), (yield* row()).sessionId)
                  .hidden;
              },
            },
            function* () {
              return replayLineFor(lastReplay(), (yield* row()).sessionId).text;
            },
          ),
        ]),
        span({ class: ui.rowActions }, [
          button(
            'openSuiteSession',
            {
              type: 'button',
              class: [buttonUi.root, ui.inlineAction],
              'data-variant': 'link',
              'data-lab': 'suite-open-session',
              click: function* () {
                yield* CraftRouter.navigate({
                  to: 'sessions/:sessionId',
                  params: { sessionId: (yield* row()).sessionId },
                });
              },
            },
            i18n.t('suiteOpenSession'),
          ),
          button(
            'replaySuiteSession',
            {
              type: 'button',
              class: [buttonUi.root, ui.inlineAction],
              'data-variant': 'secondary',
              'data-lab': 'suite-replay-session',
              disabled: replaying,
              click: function* () {
                yield* archive.suiteReplay.call((yield* row()).sessionId);
              },
            },
            i18n.t('suiteReplay'),
          ),
        ]),
      ]),
    ),
  );

  const unitSection = (
    lab: string,
    title: string,
    hint: string,
    units: typeof toRecapture | typeof uncovered,
  ) =>
    div(
      {
        class: ui.sideSection,
        'data-lab': lab,
        hidden: function* () {
          return (yield* units()).length === 0;
        },
      },
      [
        p({ class: ui.sideSectionTitle }, [
          span(title),
          span({ class: badgeUi.root, 'data-tone': 'warning' }, function* () {
            return String((yield* units()).length);
          }),
        ]),
        p({ class: ui.lede }, hint),
        span(
          { class: ui.rowChips },
          forNode(units, { track: (unit) => unit }, (unit) =>
            span({ class: ui.unitTag }, unit),
          ),
        ),
      ],
    );

  const rejectedSection = div(
    {
      class: ui.sideSection,
      'data-lab': 'suite-rejected',
      hidden: function* () {
        return (yield* rejected()).length === 0;
      },
    },
    [
      p({ class: ui.sideSectionTitle }, [
        span(i18n.t('suiteRejectedTitle')),
        span({ class: badgeUi.root }, function* () {
          return String((yield* rejected()).length);
        }),
      ]),
      ul(
        { class: ui.sessions },
        forNode(rejected, { track: (row) => row.sessionId }, (row) =>
          li({ class: ui.row, 'data-lab': 'suite-rejected-session' }, [
            span({ class: ui.rowBody }, [
              span({ class: ui.rowTitle }, function* () {
                return (yield* row()).shortId;
              }),
              span({ class: ui.rowMeta }, function* () {
                return (yield* row()).reason;
              }),
            ]),
          ]),
        ),
      ),
    ],
  );

  const empty = p(
    {
      class: ui.empty,
      'data-lab': 'suite-empty',
      hidden: function* () {
        return loading() || unreachable() || (yield* kept()).length > 0;
      },
    },
    i18n.t('suiteEmpty'),
  );
  const unreachableNote = p(
    {
      class: ui.empty,
      'data-lab': 'suite-unreachable',
      hidden: () => !unreachable(),
    },
    i18n.t('suiteUnreachable'),
  );

  return div({ class: ui.scroll }, [
    div({ class: ui.listPage, 'data-lab': 'suite-page' }, [
      div({ class: ui.listHead }, [
        div([
          heading({ class: ui.title }, i18n.t('suiteTitle')),
          p({ class: ui.lede }, i18n.t('suiteLede')),
        ]),
      ]),
      originPicker,
      factList,
      replayStatus,
      div({ class: ui.sectionStack }, [
        keptList,
        unitSection(
          'suite-to-recapture',
          i18n.t('suiteToRecaptureTitle'),
          i18n.t('suiteToRecaptureHint'),
          toRecapture,
        ),
        rejectedSection,
        unitSection(
          'suite-uncovered',
          i18n.t('suiteUncoveredTitle'),
          i18n.t('suiteUncoveredHint'),
          uncovered,
        ),
      ]),
      empty,
      unreachableNote,
    ]),
  ]);
});
