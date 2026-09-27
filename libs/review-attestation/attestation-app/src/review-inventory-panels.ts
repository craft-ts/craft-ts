import {
  a,
  button,
  craftComponent,
  div,
  figure,
  figcaption,
  forNode,
  heading,
  header,
  img,
  li,
  main,
  p,
  safeResourceUrl,
  safeUrl,
  section,
  small,
  span,
  strong,
  ul,
  type Input,
  type Output,
} from '@craft-ts/component';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';
import {
  craftComputed,
  deepYieldable,
  craftService,
  craftExpose,
  craftPrivate,
} from '@craft-ts/core';
import {
  ApplicationOverview,
  type ApplicationVerdict,
} from './application-overview';
import { AssetsInventoryList } from './assets-inventory-list';
import { BypassesView } from './bypasses-view';
import type { DevtoolView } from './devtool-view-state';
import type { Locale } from './preferences';
import type { Messages } from './messages';
import {
  conditionText,
  diagnosticSummaryOf,
  directionText,
  imageUrl,
  stateText,
  templateStatementOf,
} from './card-presentation';
import { reviewBits, imageEvidence } from './review-card.style';
import { inventory } from './review-inventory.style';

type VisualTest = ReviewApiQueue['visualTests'][number];
type VisualAsset = ReviewApiQueue['visualAssets'][number];
type ReviewCard = ReviewApiQueue['cards'][number];
type Inputs = {
  devtoolView: Input<DevtoolView>;
  t: Input<Messages>;
  applicationCaptures: Input<
    NonNullable<ReviewApiQueue['applicationCaptures']>
  >;
  decideApplicationCaptures: Output<(value: ApplicationVerdict) => unknown>;
  inspectApplicationCapture: Output<(subject: string) => unknown>;
  bypasses: Input<NonNullable<ReviewApiQueue['bypasses']>>;
  styleAdoption: Input<ReviewApiQueue['styleAdoption']>;
  visualAssets: Input<ReviewApiQueue['visualAssets']>;
  visualTests: Input<ReviewApiQueue['visualTests']>;
  selectedVisualTest: Input<VisualTest | undefined>;
  selectVisualTest: Output<(index: number) => unknown>;
  selectedVisualAsset: Input<VisualAsset | undefined>;
  sourceUrl: Output<(reference: string, line?: number) => unknown>;
  visualReviewCard: Input<ReviewCard | undefined>;
  openVisualReview: Output<() => unknown>;
  templateObligations: Input<ReviewApiQueue['templateObligations']>;
  queueValue: Input<ReviewApiQueue | undefined>;
  fileUrl: Output<(file: string | undefined, line?: number) => unknown>;
  locale: Input<Locale>;
};

/** Inventory panels for application, bypass, asset, visual, and template views. */
export const { ReviewInventoryPanelsView, provideReviewInventoryPanelsView } =
  craftService(
    { name: 'reviewInventoryPanelsView', providedIn: 'toProvide' },
    function* (inputs: Inputs) {
      const {
        devtoolView,
        t,
        applicationCaptures,
        decideApplicationCaptures,
        inspectApplicationCapture,
        bypasses,
        styleAdoption,
        visualAssets,
        selectedVisualTest,
        selectVisualTest,
        selectedVisualAsset,
        sourceUrl,
        visualReviewCard,
        openVisualReview,
        fileUrl,
      } = inputs;
      const diagnostics = deepYieldable(
        yield* craftPrivate(
          craftComputed('diagnostics', function* () {
            const say = yield* inputs.t();
            const locale = yield* inputs.locale();
            return ((yield* inputs.queueValue())?.diagnostics ?? []).map(
              (diagnostic) => {
                const summary = diagnosticSummaryOf(
                  diagnostic.code,
                  diagnostic.message,
                  say,
                  locale,
                );
                return {
                  code: diagnostic.code,
                  message: diagnostic.message,
                  filePath: diagnostic.filePath ?? '',
                  line: diagnostic.line ?? 0,
                  summary,
                  summaryHidden: summary.length === 0,
                };
              },
            );
          }),
        ),
      );
      const templateObligations = deepYieldable(
        yield* craftPrivate(
          craftComputed('templateObligations', function* () {
            const say = yield* inputs.t();
            const locale = yield* inputs.locale();
            return (yield* inputs.templateObligations()).map((obligation) => ({
              subject: obligation.subject,
              componentDirection: `${obligation.component} · ${directionText(obligation.direction, say)}`,
              conditionsHidden: (obligation.conditions?.length ?? 0) === 0,
              conditionsText: say.templateWhen(
                conditionText(obligation.conditions ?? [], say),
              ),
              statementText: templateStatementOf(
                obligation.statementParts,
                obligation.statement,
                say,
                locale,
              ),
              stateLabel: stateText(obligation.state, say),
            }));
          }),
        ),
      );
      const visualTests = deepYieldable(
        yield* craftPrivate(
          craftComputed('visualTestRows', function* () {
            const say = yield* inputs.t();
            return (yield* inputs.visualTests()).map((test) => ({
              ...test,
              stateLabel: stateText(test.state, say),
            }));
          }),
        ),
      );
      yield* craftComputed('selectedSourceHref', function* () {
        const subject = (yield* inputs.selectedVisualTest())?.subject ?? '';
        const url = sourceUrl(subject);
        return typeof url === 'string' ? url : '';
      });
      yield* craftComputed('selectedSourceHidden', function* () {
        const subject = (yield* inputs.selectedVisualTest())?.subject ?? '';
        return !sourceUrl(subject);
      });
      yield* craftComputed('selectedVisualState', function* () {
        const test = yield* inputs.selectedVisualTest();
        return test ? stateText(test.state, yield* inputs.t()) : '';
      });
      yield* craftComputed('selectedImageSource', function* () {
        const image = (yield* inputs.selectedVisualAsset())?.image;
        return image ? imageUrl(image) : '';
      });
      yield* craftExpose('devtoolView', devtoolView);
      yield* craftExpose('applicationCaptures', applicationCaptures);
      yield* craftExpose(
        'decideApplicationCaptures',
        decideApplicationCaptures,
      );
      yield* craftExpose(
        'inspectApplicationCapture',
        inspectApplicationCapture,
      );
      yield* craftExpose('t', t);
      yield* craftExpose('bypasses', bypasses);
      yield* craftExpose('styleAdoption', styleAdoption);
      yield* craftExpose('visualAssets', visualAssets);
      yield* craftExpose('visualTests', visualTests);
      yield* craftExpose('selectedVisualTest', selectedVisualTest);
      yield* craftExpose('selectVisualTest', selectVisualTest);
      yield* craftExpose('sourceUrl', sourceUrl);
      yield* craftExpose('selectedVisualAsset', selectedVisualAsset);
      yield* craftExpose('visualReviewCard', visualReviewCard);
      yield* craftExpose('openVisualReview', openVisualReview);
      yield* craftExpose('templateObligations', templateObligations);
      yield* craftExpose('diagnostics', diagnostics);
      yield* craftExpose('fileUrl', fileUrl);
    },
  );

export const ReviewInventoryPanels = craftComponent(
  'ReviewInventoryPanels',
  {
    providers: [provideReviewInventoryPanelsView()],
  },
  function* (inputs: Inputs) {
    const {
      devtoolView,
      applicationCaptures,
      decideApplicationCaptures,
      inspectApplicationCapture,
      t,
      bypasses,
      styleAdoption,
      visualAssets,
      visualTests,
      selectedVisualTest,
      selectVisualTest,
      sourceUrl,
      selectedVisualState,
      selectedSourceHref,
      selectedSourceHidden,
      selectedVisualAsset,
      selectedImageSource,
      visualReviewCard,
      openVisualReview,
      templateObligations,
      diagnostics,
      fileUrl,
    } = yield* ReviewInventoryPanelsView(inputs);
    return [
      main(
        {
          class: inventory.panel,
          'data-testid': 'inventory-panel',
          hidden: function* () {
            return (yield* devtoolView()) !== 'application';
          },
        },
        [
          heading('Aperçu de l’application'),
          ApplicationOverview({
            captures: applicationCaptures,
            decide: decideApplicationCaptures,
            inspect: inspectApplicationCapture,
          }),
        ],
      ),
      main(
        {
          class: inventory.panel,
          'data-testid': 'inventory-panel',
          hidden: function* () {
            return (yield* devtoolView()) !== 'bypasses';
          },
        },
        [
          heading(function* () {
            return (yield* t()).viewBypasses;
          }),
          BypassesView({ bypasses, adoption: styleAdoption, t }),
        ],
      ),
      main(
        {
          class: inventory.panel,
          'data-testid': 'inventory-panel',
          hidden: function* () {
            return (yield* devtoolView()) !== 'assets';
          },
        },
        [
          heading(function* () {
            return (yield* t()).viewAssets;
          }),
          AssetsInventoryList({ assets: visualAssets, t }),
        ],
      ),
      main(
        {
          class: inventory.visualPanel,
          'data-testid': 'inventory-panel',
          hidden: function* () {
            return (yield* devtoolView()) !== 'visual';
          },
        },
        [
          heading({ class: inventory.heading }, function* () {
            return (yield* t()).viewVisual;
          }),
          ul(
            { class: inventory.sideList },
            forNode(
              visualTests,
              {
                track: (test) => test.subject,
                empty: () =>
                  li(function* () {
                    return (yield* t()).noInventory;
                  }),
              },
              (test, index) =>
                li(
                  {
                    class: inventory.entry,
                    'data-inventoryActive': function* () {
                      return String(
                        (yield* selectedVisualTest())?.subject ===
                          (yield* test.subject()),
                      );
                    },
                  },
                  [
                    button(
                      'SelectVisualTest',
                      {
                        type: 'button',
                        class: inventory.item,
                        'aria-current': function* () {
                          return String(
                            (yield* selectedVisualTest())?.subject ===
                              (yield* test.subject()),
                          );
                        },
                        *click() {
                          selectVisualTest(index);
                        },
                      },
                      [
                        strong(test.scenario),
                        span(
                          {
                            class: reviewBits.subject,
                            'data-testid': 'subject',
                          },
                          test.component,
                        ),
                        small(test.stateLabel),
                      ],
                    ),
                  ],
                ),
            ),
          ),
          section(
            {
              class: inventory.detail,
              'data-testid': 'visual-detail',
              hidden: function* () {
                return Boolean(yield* selectedVisualTest()) === false;
              },
            },
            [
              header({ class: inventory.detailHeading }, [
                div([
                  small({ class: reviewBits.eyebrow }, function* () {
                    return (yield* t()).scenario;
                  }),
                  heading(function* () {
                    return (yield* selectedVisualTest())?.scenario ?? '';
                  }),
                  span(
                    { class: reviewBits.subject, 'data-testid': 'subject' },
                    function* () {
                      return (yield* selectedVisualTest())?.component ?? '';
                    },
                  ),
                  a(
                    'visualTestSource',
                    {
                      class: reviewBits.sourceLink,
                      'data-navigation': 'external',
                      'data-testid': 'source-link',
                      href: function* () {
                        return safeUrl(yield* selectedSourceHref());
                      },
                      hidden: selectedSourceHidden,
                    },
                    function* () {
                      return (yield* t()).openInIde;
                    },
                  ),
                ]),
                span({ class: reviewBits.chip }, selectedVisualState),
              ]),
              figure({ class: imageEvidence.detailCanvas }, [
                img({
                  class: imageEvidence.picture,
                  'data-zoom': 'fit',
                  hidden: function* () {
                    return (
                      Boolean((yield* selectedVisualAsset())?.image) === false
                    );
                  },
                  alt: function* () {
                    return (yield* t()).imageAlt(
                      (yield* selectedVisualTest())?.scenario ?? '',
                    );
                  },
                  src: function* () {
                    return safeResourceUrl(yield* selectedImageSource());
                  },
                }),
                p(
                  {
                    class: imageEvidence.noImage,
                    hidden: function* () {
                      return Boolean((yield* selectedVisualAsset())?.image);
                    },
                  },
                  function* () {
                    return (yield* t()).noImage;
                  },
                ),
                figcaption({ class: imageEvidence.caption }, function* () {
                  return (yield* t()).caption;
                }),
              ]),
              section(
                {
                  class: imageEvidence.diff,
                  hidden: function* () {
                    return (
                      Boolean((yield* visualReviewCard())?.changes.length) ===
                      false
                    );
                  },
                },
                [
                  heading(function* () {
                    return (yield* t()).measuredChange;
                  }),
                  ul(
                    { class: reviewBits.list },
                    forNode(
                      function* () {
                        return (yield* visualReviewCard())?.changes ?? [];
                      },
                      { track: (change) => change },
                      (change) => li({ class: reviewBits.code }, change),
                    ),
                  ),
                ],
              ),
              button(
                'OpenVisualReview',
                {
                  type: 'button',
                  class: [reviewBits.button, inventory.reviewLink],
                  'data-reviewAction': 'primary',
                  hidden: function* () {
                    return Boolean(yield* visualReviewCard()) === false;
                  },
                  click: openVisualReview,
                },
                function* () {
                  return (yield* t()).openVisualReview;
                },
              ),
            ],
          ),
        ],
      ),
      main(
        {
          class: inventory.panel,
          'data-testid': 'inventory-panel',
          hidden: function* () {
            return (yield* devtoolView()) !== 'template';
          },
        },
        [
          heading(function* () {
            return (yield* t()).viewTemplate;
          }),
          ul(
            { class: inventory.list },
            forNode(
              templateObligations,
              {
                track: (obligation) => obligation.subject,
                empty: () =>
                  li(function* () {
                    return (yield* t()).noInventory;
                  }),
              },
              (obligation) =>
                li({ class: inventory.entry }, [
                  strong(obligation.componentDirection),
                  a(
                    'obligationSource',
                    {
                      class: reviewBits.sourceLink,
                      'data-navigation': 'external',
                      'data-testid': 'source-link',
                      href: function* () {
                        return safeUrl(
                          sourceUrl(yield* obligation.subject()) ?? '',
                        );
                      },
                      hidden: function* () {
                        return (
                          Boolean(sourceUrl(yield* obligation.subject())) ===
                          false
                        );
                      },
                    },
                    function* () {
                      return (yield* t()).openInIde;
                    },
                  ),
                  p([
                    span(
                      {
                        class: reviewBits.dim,
                        'data-testid': 'template-when',
                        hidden: obligation.conditionsHidden,
                      },
                      obligation.conditionsText,
                    ),
                    strong(obligation.statementText),
                  ]),
                  small(obligation.stateLabel),
                ]),
            ),
          ),
          heading(function* () {
            return (yield* t()).extractionDiagnostics;
          }),
          ul(
            { class: inventory.list, 'data-testid': 'diagnostics' },
            forNode(
              diagnostics,
              {
                track: (diagnostic) =>
                  `${diagnostic.code}:${diagnostic.filePath ?? ''}:${diagnostic.line ?? ''}`,
                empty: () => li('—'),
              },
              (diagnostic) =>
                li({ class: inventory.entry }, [
                  strong(diagnostic.code),
                  p(diagnostic.message),
                  a(
                    'diagnosticSource',
                    {
                      class: reviewBits.sourceLink,
                      'data-navigation': 'external',
                      'data-testid': 'source-link',
                      href: function* () {
                        return safeUrl(
                          fileUrl(
                            yield* diagnostic.filePath(),
                            yield* diagnostic.line(),
                          ) ?? '',
                        );
                      },
                      hidden: function* () {
                        return (
                          Boolean(
                            fileUrl(
                              yield* diagnostic.filePath(),
                              yield* diagnostic.line(),
                            ),
                          ) === false
                        );
                      },
                    },
                    function* () {
                      return (yield* t()).openInIde;
                    },
                  ),
                  small(
                    { class: reviewBits.dim, hidden: diagnostic.summaryHidden },
                    diagnostic.summary,
                  ),
                ]),
            ),
          ),
        ],
      ),
    ];
  },
);
