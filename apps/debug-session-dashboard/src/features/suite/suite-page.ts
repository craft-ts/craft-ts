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
import { CraftRouter } from '@craft-ts/core';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import {
  CHECK_ARCHIVE_URL,
  CHECK_PICTURE_ORIGIN,
  GoldenSuiteArchive,
} from '../../shared/data-access/golden-suite.service';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import {
  checkPictureUrl,
  replayLineFor,
  replayStatusLine,
  suiteRunLine,
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
  const originPicker = div(
    {
      class: ui.segments,
      role: 'group',
      'aria-label': i18n.t('suiteAppsLabel'),
      'data-lab': 'suite-origins',
      hidden: function* () {
        return (yield* (yield* GoldenSuiteArchive()).suite.originsCount()) < 2;
      },
    },
    forNode(function* () {
      return yield* (yield* GoldenSuiteArchive()).suite.origins();
    }, { track: (item) => item }, (item) =>
      button(
        'chooseSuiteOrigin',
        {
          type: 'button',
          class: ui.segment,
          'aria-pressed': function* () {
            const _origin = yield* (yield* GoldenSuiteArchive()).chosenOrigin.effective();
            return _origin === (yield* item()) ? 'true' : 'false';
          },
          'data-segment-on': function* () {
            const _origin = yield* (yield* GoldenSuiteArchive()).chosenOrigin.effective();
            return _origin === (yield* item()) ? 'true' : undefined;
          },
          click: function* () {
            yield* (yield* GoldenSuiteArchive()).chosenOrigin.choose(yield* item());
          },
        },
        item,
      ),
    ),
  );

  const factList = ul(
    { class: ui.rowChips, 'data-lab': 'suite-facts' },
    forNode(function* () {
      return yield* (yield* GoldenSuiteArchive()).suite.facts();
    }, { track: (fact) => fact.label }, (fact) =>
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
        const _replaying = yield* (yield* GoldenSuiteArchive()).suiteRun.replaying();
        return _replaying || (yield* (yield* GoldenSuiteArchive()).suite.keptCount()) === 0;
      },
      click: function* () {
        yield* (yield* GoldenSuiteArchive()).suiteRun.call(
          (yield* (yield* GoldenSuiteArchive()).suite.kept()).map((row) => row.sessionId),
        );
      },
    },
    i18n.t('suiteReplayAll'),
  );

  const replayStatus = p(
    {
      class: ui.lede,
      'data-lab': 'suite-replay-status',
      hidden: function* () {
        const archive = yield* GoldenSuiteArchive();
        return !(yield* archive.suiteRun.replaying()) && !(yield* archive.suiteRun.replayUnreachable());
      },
    },
    function* () {
      const archive = yield* GoldenSuiteArchive();
      return replayStatusLine(yield* archive.suiteRun.replaying(), yield* archive.suiteRun.replayUnreachable());
    },
  );

  const runSummary = p(
    {
      class: badgeUi.root,
      'data-lab': 'suite-run-summary',
      'data-tone': function* () {
        return suiteRunLine(yield* (yield* GoldenSuiteArchive()).suiteRun.lastRun()).tone;
      },
      hidden: function* () {
        const archive = yield* GoldenSuiteArchive();
        return (yield* archive.suiteRun.replaying()) || suiteRunLine(yield* archive.suiteRun.lastRun()).hidden;
      },
    },
    function* () {
      return suiteRunLine(yield* (yield* GoldenSuiteArchive()).suiteRun.lastRun()).text;
    },
  );

  const keptList = ul(
    { class: ui.sessions, 'data-lab': 'suite-sessions' },
    forNode(function* () {
      return yield* (yield* GoldenSuiteArchive()).suite.kept();
    }, { track: (row) => row.sessionId }, (row) =>
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
                const _lastRun = yield* (yield* GoldenSuiteArchive()).suiteRun.lastRun();
                return replayLineFor(_lastRun, (yield* row()).sessionId).tone;
              },
              hidden: function* () {
                const _lastRun = yield* (yield* GoldenSuiteArchive()).suiteRun.lastRun();
                return replayLineFor(_lastRun, (yield* row()).sessionId).hidden;
              },
            },
            function* () {
              const _lastRun = yield* (yield* GoldenSuiteArchive()).suiteRun.lastRun();
              return replayLineFor(_lastRun, (yield* row()).sessionId).text;
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
              disabled: function* () {
                return yield* (yield* GoldenSuiteArchive()).suiteRun.replaying();
              },
              click: function* () {
                yield* (yield* GoldenSuiteArchive()).suiteRun.call([(yield* row()).sessionId]);
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
            const _origin = yield* (yield* GoldenSuiteArchive()).chosenOrigin.effective();
            const _openedCheck = yield* (yield* GoldenSuiteArchive()).openedCheckSession.current();
            const url =
              _openedCheck === id
                ? checkPictureUrl(
                    CHECK_ARCHIVE_URL,
                    _origin,
                    path(yield* moment()),
                  )
                : undefined;
            return safeResourceUrl(url, {
              allowedOrigins: [CHECK_PICTURE_ORIGIN],
            });
          },
        }),
      ],
    );

  const checkMoments = (
    row: () => Generator<unknown, SessionsCheckRow, unknown>,
  ) => {
    const sessionId = function* () {
      return (yield* row()).sessionId;
    };
    return ul(
      {
        class: ui.checkMoments,
        'data-lab': 'suite-check-moments',
        hidden: function* () {
          const _openedCheck = yield* (yield* GoldenSuiteArchive()).openedCheckSession.current();
          return _openedCheck !== (yield* row()).sessionId;
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
              picture(
                'suite-check-base',
                i18n.t('suiteCheckBase'),
                (item) => item.base,
                sessionId,
                moment,
              ),
              picture(
                'suite-check-head',
                i18n.t('suiteCheckHead'),
                (item) => item.head,
                sessionId,
                moment,
              ),
              picture(
                'suite-check-diff',
                i18n.t('suiteCheckDiff'),
                (item) => item.diff,
                sessionId,
                moment,
              ),
            ]),
            ul(
              { class: ui.rowChips },
              forNode(
                function* () {
                  return (yield* moment()).measures;
                },
                { track: (line) => line },
                (line) =>
                  li(
                    { class: ui.unitTag, 'data-lab': 'suite-check-measure' },
                    line,
                  ),
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
              return (yield* (yield* GoldenSuiteArchive()).lastCheck.view()).none;
            },
          },
          function* () {
            return (yield* (yield* GoldenSuiteArchive()).lastCheck.view()).builds;
          },
        ),
      ]),
      p(
        {
          class: ui.lede,
          'data-lab': 'suite-check-none',
          hidden: function* () {
            return !(yield* (yield* GoldenSuiteArchive()).lastCheck.view()).none;
          },
        },
        i18n.t('suiteCheckNone'),
      ),
      p(
        {
          class: badgeUi.root,
          'data-lab': 'suite-check-verdict',
          'data-tone': function* () {
            return (yield* (yield* GoldenSuiteArchive()).lastCheck.view()).tone;
          },
          hidden: function* () {
            return (yield* (yield* GoldenSuiteArchive()).lastCheck.view()).none;
          },
        },
        function* () {
          return (yield* (yield* GoldenSuiteArchive()).lastCheck.view()).verdictLine;
        },
      ),
      p(
        {
          class: ui.lede,
          hidden: function* () {
            return (yield* (yield* GoldenSuiteArchive()).lastCheck.view()).none;
          },
        },
        i18n.t('suiteCheckHint'),
      ),
      p(
        {
          class: ui.lede,
          'data-lab': 'suite-approve-failed',
          hidden: function* () {
            const archive = yield* GoldenSuiteArchive();
            return (yield* archive.approveChange.approving()) || !(yield* archive.approveChange.approveFailed());
          },
        },
        i18n.t('suiteApproveFailed'),
      ),
      ul(
        { class: ui.sessions },
        forNode(function* () {
          return yield* (yield* GoldenSuiteArchive()).lastCheck.rows();
        }, { track: (row) => row.sessionId }, (row) =>
          li(
            { class: [ui.row, ui.checkRow], 'data-lab': 'suite-check-session' },
            [
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
                      const _openedCheck = yield* (yield* GoldenSuiteArchive()).openedCheckSession.current();
                      return _openedCheck === (yield* row()).sessionId
                        ? 'true'
                        : 'false';
                    },
                    hidden: function* () {
                      return (yield* row()).moments.length === 0;
                    },
                    click: function* () {
                      yield* (yield* GoldenSuiteArchive()).openedCheckSession.toggle(
                        (yield* row()).sessionId,
                      );
                    },
                  },
                  function* () {
                    const _openedCheck = yield* (yield* GoldenSuiteArchive()).openedCheckSession.current();
                    return _openedCheck === (yield* row()).sessionId
                      ? i18n.t('suiteCheckHide')
                      : i18n.t('suiteCheckShow');
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
                    disabled: function* () {
                      return yield* (yield* GoldenSuiteArchive()).approveChange.approving();
                    },
                    click: function* () {
                      const _origin = yield* (yield* GoldenSuiteArchive()).chosenOrigin.effective();
                      yield* (yield* GoldenSuiteArchive()).approveCheckedChange(
                        _origin,
                        (yield* row()).sessionId,
                      );
                    },
                  },
                  function* () {
                    const approving = yield* (yield* GoldenSuiteArchive())
                      .approveChange.approving();
                    return approving
                      ? i18n.t('suiteApproving')
                      : i18n.t('suiteApprove');
                  },
                ),
              ]),
              checkMoments(row),
            ],
          ),
        ),
      ),
    ],
  );

  const unitSection = (
    lab: string,
    title: string,
    hint: string,
    collection: 'toRecapture' | 'uncovered',
  ) =>
    div(
      {
        class: ui.sideSection,
        'data-lab': lab,
        hidden: function* () {
          const archive = yield* GoldenSuiteArchive();
          const count =
            collection === 'toRecapture'
              ? yield* archive.suite.toRecaptureCount()
              : yield* archive.suite.uncoveredCount();
          return count === 0;
        },
      },
      [
        p({ class: ui.sideSectionTitle }, [
          span(title),
          span({ class: badgeUi.root, 'data-tone': 'warning' }, function* () {
            const archive = yield* GoldenSuiteArchive();
            return String(
              collection === 'toRecapture'
                ? yield* archive.suite.toRecaptureCount()
                : yield* archive.suite.uncoveredCount(),
            );
          }),
        ]),
        p({ class: ui.lede }, hint),
        span(
          { class: ui.rowChips },
          forNode(function* () {
            const archive = yield* GoldenSuiteArchive();
            return collection === 'toRecapture'
              ? yield* archive.suite.toRecapture()
              : yield* archive.suite.uncovered();
          }, { track: (unit) => unit }, (unit) =>
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
        return (yield* (yield* GoldenSuiteArchive()).suite.rejectedCount()) === 0;
      },
    },
    [
      p({ class: ui.sideSectionTitle }, [
        span(i18n.t('suiteRejectedTitle')),
        span({ class: badgeUi.root }, function* () {
          return String(yield* (yield* GoldenSuiteArchive()).suite.rejectedCount());
        }),
      ]),
      ul(
        { class: ui.sessions },
        forNode(function* () {
          return yield* (yield* GoldenSuiteArchive()).suite.rejected();
        }, { track: (row) => row.sessionId }, (row) =>
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
        const archive = yield* GoldenSuiteArchive();
        const _unreachable = yield* archive.suite.suiteUnreachable();
        const _loading = yield* archive.suite.suiteLoading();
        return _loading || _unreachable || (yield* archive.suite.keptCount()) > 0;
      },
    },
    i18n.t('suiteEmpty'),
  );
  const unreachableNote = p(
    {
      class: ui.empty,
      'data-lab': 'suite-unreachable',
      hidden: function* () {
        return !(yield* (yield* GoldenSuiteArchive()).suite.suiteUnreachable());
      },
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
          'toRecapture',
        ),
        rejectedSection,
        unitSection(
          'suite-uncovered',
          i18n.t('suiteUncoveredTitle'),
          i18n.t('suiteUncoveredHint'),
          'uncovered',
        ),
      ]),
      empty,
      unreachableNote,
    ]),
  ]);
});
