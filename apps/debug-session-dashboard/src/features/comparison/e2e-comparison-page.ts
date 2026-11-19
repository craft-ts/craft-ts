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
import { CraftRouter } from '@craft-ts/core';
import {
  sessionTraceFindingAnchors,
  type SessionTraceFinding,
} from '@craft-ts/session-trace';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { seekE2eComparisonFrame } from '../../shared/util/replay-browser';
import { E2eComparisonPageViewModel } from './e2e-comparison-page-view-model.service';

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
    return div(
      {
        class: ui.scroll,
        hidden: function* () {
          return yield* (yield* E2eComparisonPageViewModel()).pageHidden();
        },
        'data-lab': 'e2e-comparison-page',
      },
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
            heading({ class: ui.title }, function* () {
              return yield* (yield* E2eComparisonPageViewModel()).title();
            }),
            p({ class: ui.lede, role: 'status' }, function* () {
              return yield* (yield* E2eComparisonPageViewModel()).summaryText();
            }),
          ]),
          div({ class: ui.gap }, [
            div(
              {
                class: ui.e2eFirstDivergence,
                'data-lab': 'e2e-first-divergence',
                hidden: function* () {
                  return yield* (yield* E2eComparisonPageViewModel()).hiddenFirstDivergence();
                },
              },
              [
                strong({}, function* () {
                  return yield* (yield* E2eComparisonPageViewModel()).firstDivergenceLabel();
                }),
                p({}, function* () {
                  return yield* (yield* E2eComparisonPageViewModel()).firstDivergenceText();
                }),
              ],
            ),
            div(
              {
                class: ui.e2eComparisonLayout,
                hidden: function* () {
                  return yield* (yield* E2eComparisonPageViewModel()).hiddenFirstDivergence();
                },
              },
              [
                div(
                  {
                    class: ui.e2eComparisonFrames,
                    'data-lab': 'e2e-replay-frames',
                  },
                  forNode(
                    function* () {
                      return yield* (yield* E2eComparisonPageViewModel()).replayFrames();
                    },
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
                        function* () {
                          return yield* (yield* E2eComparisonPageViewModel()).findings();
                        },
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
                hidden: function* () {
                  return yield* (yield* E2eComparisonPageViewModel()).hiddenFirstDivergence();
                },
              },
              [
                summary('Comparaison brute (JSON)'),
                pre(
                  { class: ui.code, 'data-lab': 'e2e-comparison-json' },
                  function* () {
                    return yield* (yield* E2eComparisonPageViewModel()).reportText();
                  },
                ),
              ],
            ),
          ]),
        ]),
      ],
    );
  },
);
