import { i18n } from '../../shared/util/catalog';
import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  img,
  li,
  p,
  safeResourceUrl,
  span,
  ul,
} from '@craft-ts/component';
import { CraftRouter, craftComputed, rawReactiveValue } from '@craft-ts/core';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../shared/ui/dashboard.style';
import {
  CHECK_ARCHIVE_URL,
  CHECK_PICTURE_ORIGIN,
  GoldenSuiteArchive,
} from '../../shared/data-access/golden-suite.service';
import {
  checkPictureUrl,
  replayLineFor,
  replayStatusLine,
  sessionsCheckView,
  suiteRunLine,
  suiteView,
  type SessionsCheckMomentRow,
  type SessionsCheckRow,
} from '../../shared/util/golden-suite';

/**
 * An app's regression suite: the recorded sessions kept, each for what it
 * alone shows, the ones left out and why, the paths no session shows any
 * more. A session opens in the replay, or is replayed here as the suite runs
 * it (by the archive, actions dispatched on their elements, state recomputed).
 * The last base-against-head check (`npm run sessions:check`) is shown too,
 * and a change it found, when it is wanted, is approved from here.
 */
export const SuitePage = craftComponent('SuitePage', {}, function* () {
  const archive = yield* GoldenSuiteArchive();
  const suite = rawReactiveValue(archive.suite.goldenSuite);
  const loading = rawReactiveValue(archive.suite.suiteLoading);
  const unreachable = rawReactiveValue(archive.suite.suiteUnreachable);
  const origins = rawReactiveValue(archive.suite.origins);
  const origin = rawReactiveValue(archive.chosenOrigin.effective);
  const lastRun = rawReactiveValue(archive.suiteRun.lastRun);
  const replaying = rawReactiveValue(archive.suiteRun.replaying);
  const replayFailed = rawReactiveValue(archive.suiteRun.replayUnreachable);
  const lastCheck = rawReactiveValue(archive.lastCheck.check);
  const approving = rawReactiveValue(archive.approveChange.approving);
  const approveFailed = rawReactiveValue(archive.approveChange.approveFailed);
  const openedCheck = rawReactiveValue(archive.openedCheckSession.current);
  const check = yield* craftComputed('check', () => sessionsCheckView(lastCheck()));
  const checkRows = yield* craftComputed('checkRows', () => sessionsCheckView(lastCheck()).rows);

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

  const replayAll = button(
    'replaySuite',
    {
      type: 'button',
      class: buttonUi.root,
      'data-variant': 'primary',
      'data-lab': 'suite-replay-all',
      disabled: function* () {
        return replaying() || (yield* kept()).length === 0;
      },
      click: function* () {
        yield* archive.suiteRun.call((yield* kept()).map((row) => row.sessionId));
      },
    },
    i18n.t('suiteReplayAll'),
  );

  const replayStatus = p(
    {
      class: ui.lede,
      'data-lab': 'suite-replay-status',
      hidden: () => !replaying() && !replayFailed(),
    },
    () => replayStatusLine(replaying(), replayFailed()),
  );

  const runSummary = p(
    {
      class: badgeUi.root,
      'data-lab': 'suite-run-summary',
      'data-tone': () => suiteRunLine(lastRun()).tone,
      hidden: () => replaying() || suiteRunLine(lastRun()).hidden,
    },
    () => suiteRunLine(lastRun()).text,
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
                return replayLineFor(lastRun(), (yield* row()).sessionId).tone;
              },
              hidden: function* () {
                return replayLineFor(lastRun(), (yield* row()).sessionId).hidden;
              },
            },
            function* () {
              return replayLineFor(lastRun(), (yield* row()).sessionId).text;
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
                yield* archive.suiteRun.call([(yield* row()).sessionId]);
              },
            },
            i18n.t('suiteReplay'),
          ),
        ]),
      ]),
    ),
  );

  // A picture of the last check, asked for only while its session is open.
  const picture = (
    lab: string,
    label: string,
    path: (moment: SessionsCheckMomentRow) => string | undefined,
    sessionId: () => Generator<unknown, string, unknown>,
    moment: () => Generator<unknown, SessionsCheckMomentRow, unknown>,
  ) =>
    div(
      {
        class: ui.checkPicture,
        hidden: function* () {
          return path(yield* moment()) === undefined;
        },
      },
      [
        span({ class: ui.checkPictureLabel }, label),
        img({
          class: ui.checkPictureImage,
          'data-lab': lab,
          alt: label,
          src: function* () {
            const id = yield* sessionId();
            const url = openedCheck() === id ? checkPictureUrl(CHECK_ARCHIVE_URL, origin(), path(yield* moment())) : undefined;
            return url ? safeResourceUrl(url, { allowedOrigins: [CHECK_PICTURE_ORIGIN] }) : undefined;
          },
        }),
      ],
    );

  const checkMoments = (row: () => Generator<unknown, SessionsCheckRow, unknown>) => {
    const sessionId = function* () {
      return (yield* row()).sessionId;
    };
    return ul(
      {
        class: ui.checkMoments,
        'data-lab': 'suite-check-moments',
        hidden: function* () {
          return openedCheck() !== (yield* row()).sessionId;
        },
      },
      forNode(
        function* () {
          return (yield* row()).moments;
        },
        { track: (moment) => moment.key },
        (moment) =>
          li({ class: ui.checkMoment, 'data-lab': 'suite-check-moment' }, [
            p({ class: ui.rowTitle }, [
              span(function* () {
                return (yield* moment()).title;
              }),
              span({ class: ui.rowMeta }, function* () {
                return (yield* moment()).detail;
              }),
            ]),
            div({ class: ui.checkPictures }, [
              picture('suite-check-base', i18n.t('suiteCheckBase'), (item) => item.base, sessionId, moment),
              picture('suite-check-head', i18n.t('suiteCheckHead'), (item) => item.head, sessionId, moment),
              picture('suite-check-diff', i18n.t('suiteCheckDiff'), (item) => item.diff, sessionId, moment),
            ]),
            ul(
              { class: ui.rowChips },
              forNode(
                function* () {
                  return (yield* moment()).measures;
                },
                { track: (line) => line },
                (line) => li({ class: ui.unitTag, 'data-lab': 'suite-check-measure' }, line),
              ),
            ),
          ]),
      ),
    );
  };

  const checkSection = div(
    { class: ui.sideSection, 'data-lab': 'suite-check' },
    [
      p({ class: ui.sideSectionTitle }, [
        span(i18n.t('suiteCheckTitle')),
        span(
          {
            class: badgeUi.root,
            'data-lab': 'suite-check-builds',
            hidden: function* () {
              return (yield* check()).none;
            },
          },
          function* () {
            return (yield* check()).builds;
          },
        ),
      ]),
      p(
        {
          class: ui.lede,
          'data-lab': 'suite-check-none',
          hidden: function* () {
            return !(yield* check()).none;
          },
        },
        i18n.t('suiteCheckNone'),
      ),
      p(
        {
          class: badgeUi.root,
          'data-lab': 'suite-check-verdict',
          'data-tone': function* () {
            return (yield* check()).tone;
          },
          hidden: function* () {
            return (yield* check()).none;
          },
        },
        function* () {
          return (yield* check()).verdictLine;
        },
      ),
      p(
        {
          class: ui.lede,
          hidden: function* () {
            return (yield* check()).none;
          },
        },
        i18n.t('suiteCheckHint'),
      ),
      p(
        {
          class: ui.lede,
          'data-lab': 'suite-approve-failed',
          hidden: () => approving() || !approveFailed(),
        },
        i18n.t('suiteApproveFailed'),
      ),
      ul(
        { class: ui.sessions },
        forNode(checkRows, { track: (row) => row.sessionId }, (row) =>
          li({ class: [ui.row, ui.checkRow], 'data-lab': 'suite-check-session' }, [
            span({ class: ui.rowBody }, [
              span({ class: ui.rowTitle }, [
                span(function* () {
                  return (yield* row()).title;
                }),
                span(
                  {
                    class: badgeUi.root,
                    'data-lab': 'suite-check-session-verdict',
                    'data-tone': function* () {
                      return (yield* row()).tone;
                    },
                  },
                  function* () {
                    return (yield* row()).label;
                  },
                ),
              ]),
              span({ class: ui.rowMeta }, function* () {
                return (yield* row()).reason;
              }),
            ]),
            span({ class: ui.rowActions }, [
              button(
                'toggleCheckedMoments',
                {
                  type: 'button',
                  class: [buttonUi.root, ui.inlineAction],
                  'data-variant': 'secondary',
                  'data-lab': 'suite-check-toggle',
                  'aria-expanded': function* () {
                    return openedCheck() === (yield* row()).sessionId ? 'true' : 'false';
                  },
                  hidden: function* () {
                    return (yield* row()).moments.length === 0;
                  },
                  click: function* () {
                    yield* archive.openedCheckSession.toggle((yield* row()).sessionId);
                  },
                },
                function* () {
                  return openedCheck() === (yield* row()).sessionId ? i18n.t('suiteCheckHide') : i18n.t('suiteCheckShow');
                },
              ),
              button(
                'openCheckedSession',
                {
                  type: 'button',
                  class: [buttonUi.root, ui.inlineAction],
                  'data-variant': 'link',
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
                'approveCheckedChange',
                {
                  type: 'button',
                  class: [buttonUi.root, ui.inlineAction],
                  'data-variant': 'primary',
                  'data-lab': 'suite-approve-change',
                  hidden: function* () {
                    return !(yield* row()).approvable;
                  },
                  disabled: approving,
                  click: function* () {
                    yield* archive.approveCheckedChange(origin(), (yield* row()).sessionId);
                  },
                },
                () => (approving() ? i18n.t('suiteApproving') : i18n.t('suiteApprove')),
              ),
            ]),
            checkMoments(row),
          ]),
        ),
      ),
    ],
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
        div({ class: ui.listHeadActions }, [replayAll]),
      ]),
      originPicker,
      factList,
      replayStatus,
      runSummary,
      div({ class: ui.sectionStack }, [
        checkSection,
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
