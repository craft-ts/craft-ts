import {
  button,
  craftComponent,
  details,
  div,
  forNode,
  heading,
  iframe,
  li,
  p,
  pre,
  safeResourceUrl,
  span,
  strong,
  summary,
  ul,
} from '@craft-ts/component';
import { CraftRouter, craftComputed, craftUse } from '@craft-ts/core';
import {
  describeSessionTraceFinding,
  sessionTraceFindingAnchors,
  sessionTraceFindingLabel,
  type SessionTraceFinding,
} from '@craft-ts/session-trace';
import { buttonUi } from '@craft-ts/ui/style';
import {
  E2eComparison,
  type E2eComparisonError,
  type E2eComparisonReport,
} from '../../shared/data-access/e2e-comparison.service';
import { httpFailureReason } from '../../shared/data-access/session-archive.service';
import { page } from '../../shared/state/replay-state';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import {
  dashboardHref,
  seekE2eComparisonFrame,
} from '../../shared/util/replay-browser';

function comparisonSummary(
  result: E2eComparisonReport | E2eComparisonError | undefined,
  exception: unknown,
): string {
  if (result && 'error' in result)
    return i18n.t('copy.copy005') + result.error + '';
  if (!result && exception !== undefined)
    return (
      i18n.t('copy.copy006') +
      (typeof exception === 'string'
        ? exception
        : httpFailureReason(exception)) +
      i18n.t('copy.copy007')
    );
  if (!result) return i18n.t('copy.copy008');
  const references = i18n.t(
    result.baselineCount > 1 ? 'greenReferencesMany' : 'greenReferencesOne',
    { count: result.baselineCount },
  );
  const single =
    result.baselineCount === 1 ? i18n.t('singleReferenceNote') : '';
  return (
    i18n.t('copy.copy009') +
    result.comparison.findings.length +
    i18n.t('copy.copy010') +
    references +
    i18n.t('copy.copy011') +
    single +
    '.'
  );
}

/** The two replay frames: the latest green reference and the observed run. */
function replayFramesOf(
  result: E2eComparisonReport | E2eComparisonError | undefined,
  router: CraftRouter,
) {
  if (
    !result ||
    'error' in result ||
    !result.baselineSource ||
    !result.observedSource
  )
    return [];
  // The frames show this dashboard, at the route the router writes for them
  // (`/#/e2e-replay?…`): a relative address, whatever port it runs on. A
  // report naming another dashboard opens the frames there.
  const dashboard = new URL(
    result.dashboardUrl || dashboardHref() || 'http://localhost/',
  );
  const replayUrl = (source: string) => {
    const serialized = router.serializeUrl(
      router.createUrlTree({ to: 'e2e-replay', queryParams: { source } }),
    );
    if (!result.dashboardUrl) return serialized;
    const hashAt = serialized.indexOf('#');
    if (hashAt < 0) return new URL(serialized, dashboard).toString();
    const url = new URL(dashboard.href);
    url.hash = serialized.slice(hashAt + 1);
    return url.toString();
  };
  return [
    {
      side: 'baseline',
      label: i18n.t('greenReferenceFrame'),
      src: replayUrl(result.baselineSource),
      origin: dashboard.origin,
    },
    {
      side: 'observed',
      label: i18n.t('observedRunFrame'),
      src: replayUrl(result.observedSource),
      origin: dashboard.origin,
    },
  ];
}

/** Places both replays on the steps a finding is about. */
function seekFinding(finding: SessionTraceFinding): void {
  const anchors = sessionTraceFindingAnchors(finding);
  if (anchors.baseline?.eventId)
    seekE2eComparisonFrame('baseline', anchors.baseline.eventId);
  if (anchors.observed?.eventId)
    seekE2eComparisonFrame('observed', anchors.observed.eventId);
}

/** Read-only report view for a failed Playwright run and its green history. */
export const E2eComparisonPage = craftComponent(
  'E2eComparisonPage',
  {},
  function* () {
    const service = yield* E2eComparison();
    const report = service.comparison.value;
    const queryException = service.comparison.exception;
    const hidden = yield* craftComputed('hidden', () => page() !== 'compare');
    const title = yield* craftComputed('title', function* () {
      const _report = yield* report();
      const result = _report;
      return result && !('error' in result)
        ? i18n.t('copy.copy012') +
            result.testId +
            i18n.t('copy.copy013') +
            result.project +
            ''
        : i18n.t('copy.copy014');
    });
    const summaryText = yield* craftComputed('summaryText', function* () {
      const _queryException = yield* queryException();
      const _report = yield* report();
      return comparisonSummary(_report, _queryException);
    });
    const comparison = () => {
      const result = craftUse(report());
      return result && !('error' in result) ? result.comparison : undefined;
    };
    const firstDivergenceLabel = yield* craftComputed(
      'firstDivergenceLabel',
      () => {
        const first = comparison()?.firstDivergence;
        return first
          ? i18n.t('findingHeading', {
              findingLabel: sessionTraceFindingLabel(first),
            })
          : i18n.t('copy.copy016');
      },
    );
    const firstDivergenceText = yield* craftComputed(
      'firstDivergenceText',
      () => {
        const first = comparison()?.firstDivergence;
        return first
          ? i18n.t('findingDetails', {
              findingDetails: describeSessionTraceFinding(first),
            })
          : i18n.t('copy.copy017');
      },
    );
    const reportText = yield* craftComputed('reportText', () => {
      const current = comparison();
      return current
        ? JSON.stringify(current, null, 2)
        : i18n.t('copy.copy018');
    });
    const replayFrames = yield* craftComputed('replayFrames', function* () {
      const router = yield* CraftRouter();
      const _report = yield* report();
      return replayFramesOf(_report, router);
    });
    const findings = yield* craftComputed('findings', () => {
      const current = comparison();
      // Decoded from JSON, the first divergence is a copy of one finding, not the same object.
      const first = current?.firstDivergence
        ? JSON.stringify(current.firstDivergence)
        : undefined;
      const firstIndex = (current?.findings ?? []).findIndex(
        (finding) => JSON.stringify(finding) === first,
      );
      return (current?.findings ?? []).map((finding, index) => ({
        finding,
        label: i18n.t('findingLabelText', {
          findingLabel: sessionTraceFindingLabel(finding),
        }),
        text: ` · ${describeSessionTraceFinding(finding)}`,
        first: index === firstIndex ? 'true' : 'false',
      }));
    });
    const hiddenFirstDivergence = yield* craftComputed(
      'hiddenFirstDivergence',
      () => comparison() === undefined,
    );
    return div(
      { class: ui.scroll, hidden, 'data-lab': 'e2e-comparison-page' },
      [
        div({ class: ui.widePage }, [
          div({ class: ui.recipeHead }, [
            button(
              'backToSessions',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'link',
                click: function* () {
                  yield* CraftRouter.navigate({ to: '' });
                },
              },
              i18n.t('copy.copy019'),
            ),
            heading({ class: ui.title }, title),
            p({ class: ui.lede, role: 'status' }, summaryText),
          ]),
          div({ class: ui.gap }, [
            div(
              {
                class: ui.e2eFirstDivergence,
                'data-lab': 'e2e-first-divergence',
                hidden: hiddenFirstDivergence,
              },
              [strong({}, firstDivergenceLabel), p({}, firstDivergenceText)],
            ),
            div(
              { class: ui.e2eComparisonLayout, hidden: hiddenFirstDivergence },
              [
                div(
                  {
                    class: ui.e2eComparisonFrames,
                    'data-lab': 'e2e-replay-frames',
                  },
                  forNode(
                    replayFrames,
                    { track: (frame) => frame.label },
                    (frame) =>
                      div(
                        {
                          class: ui.e2eComparisonFrame,
                          'data-replay-side': function* () {
                            const frameItem = yield* frame();
                            return frameItem.side;
                          },
                        },
                        [
                          p(function* () {
                            const frameItem = yield* frame();
                            return frameItem.label;
                          }),
                          iframe({
                            title: function* () {
                              const frameItem = yield* frame();
                              return frameItem.label;
                            },
                            src: function* () {
                              const item = yield* frame();
                              return safeResourceUrl(item.src, {
                                allowedOrigins: [item.origin],
                              });
                            },
                            loading: 'lazy',
                            'data-lab': function* () {
                              const frameItem = yield* frame();
                              return `e2e-replay-${frameItem.side}`;
                            },
                            class: ui.e2eComparisonIframe,
                            sandbox: 'allow-scripts allow-same-origin',
                          }),
                        ],
                      ),
                  ),
                ),
                div(
                  {
                    class: ui.e2eComparisonFindings,
                    role: 'complementary',
                    'aria-label': 'Trouvailles du comparateur',
                    'data-lab': 'e2e-comparison-findings-panel',
                  },
                  [
                    p({ class: ui.sideSectionTitle }, i18n.t('copy.copy020')),
                    ul(
                      {
                        class: ui.sessions,
                        'data-lab': 'e2e-comparison-findings',
                      },
                      forNode(
                        findings,
                        { track: (_item, index) => index },
                        (item) =>
                          li({ class: ui.row }, [
                            button(
                              'seekComparisonFinding',
                              {
                                type: 'button',
                                class: ui.rowOpen,
                                'data-lab': 'e2e-comparison-finding',
                                'data-first': function* () {
                                  const entry = yield* item();
                                  return entry.first;
                                },
                                click: function* () {
                                  seekFinding((yield* item()).finding);
                                },
                              },
                              [
                                strong({}, function* () {
                                  const entry = yield* item();
                                  return entry.label;
                                }),
                                span({}, function* () {
                                  const entry = yield* item();
                                  return entry.text;
                                }),
                              ],
                            ),
                          ]),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            details(
              {
                'data-lab': 'e2e-comparison-raw',
                hidden: hiddenFirstDivergence,
              },
              [
                summary('Comparaison brute (JSON)'),
                pre(
                  { class: ui.code, 'data-lab': 'e2e-comparison-json' },
                  reportText,
                ),
              ],
            ),
          ]),
        ]),
      ],
    );
  },
);
