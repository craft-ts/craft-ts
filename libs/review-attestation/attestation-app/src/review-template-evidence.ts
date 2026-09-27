import {
  a,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  ol,
  p,
  pre,
  safeUrl,
  section,
  small,
  span,
  strong,
  ul,
  type Input,
  type Output,
} from '@craft-ts/component';
import { craftComputed, deepYieldable } from '@craft-ts/core';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';
import { conditionText, templateStatementOf } from './card-presentation';
import type { Locale } from './preferences';
import type { Messages } from './messages';
import { reviewBits, templateEvidence } from './review-card.style';

type ReviewCard = ReviewApiQueue['cards'][number];
type TemplateSourceDetail = {
  readonly subject: string;
  readonly renderSites?: readonly {
    readonly file: string;
    readonly line: number;
    readonly code: string;
  }[];
  readonly element?: {
    readonly file: string;
    readonly line: number;
    readonly code: string;
  };
  readonly method?: {
    readonly file: string;
    readonly line: number;
    readonly code: string;
  };
};
type Inputs = {
  card: Input<ReviewCard>;
  sourceDetail: Input<TemplateSourceDetail | undefined>;
  fileUrl: Output<(file: string | undefined, line?: number) => unknown>;
  t: Input<Messages>;
  locale: Input<Locale>;
};

/** Template, removal, and source evidence for a review card. */
export const ReviewTemplateEvidence = craftComponent(
  'ReviewTemplateEvidence',
  {},
  function* (inputs: Inputs) {
    const { card, sourceDetail, fileUrl, t } = inputs;
    const effects = yield* craftComputed('effects', function* () {
      const card = yield* inputs.card();
      return card.kind === 'template' ? (card.effects ?? []) : [];
    });
    const renderSites = deepYieldable(
      yield* craftComputed('renderSites', function* () {
        return (yield* inputs.sourceDetail())?.renderSites ?? [];
      }),
    );
    const elementSource = yield* craftComputed('elementSource', function* () {
      return (yield* inputs.sourceDetail())?.element;
    });
    const methodSource = yield* craftComputed('methodSource', function* () {
      return (yield* inputs.sourceDetail())?.method;
    });
    const evidenceHidden = yield* craftComputed('evidenceHidden', function* () {
      const kind = (yield* inputs.card()).kind;
      return kind !== 'template' && kind !== 'removal';
    });
    const promiseHeading = yield* craftComputed('promiseHeading', function* () {
      return (yield* inputs.card()).kind === 'removal'
        ? (yield* inputs.t()).removedPromise
        : (yield* inputs.t()).currentPromise;
    });
    const templateWhenHidden = yield* craftComputed(
      'templateWhenHidden',
      function* () {
        const card = yield* inputs.card();
        return card.kind !== 'template' || !card.conditions?.length;
      },
    );
    const templateWhenText = yield* craftComputed('templateWhenText', function* () {
      const card = yield* inputs.card();
      return card.kind === 'template'
        ? (yield* inputs.t()).templateWhen(
            conditionText(card.conditions ?? [], yield* inputs.t()),
          )
        : '';
    });
    const statementText = yield* craftComputed('statementText', function* () {
      const card = yield* inputs.card();
      if (card.kind === 'template') {
        return templateStatementOf(
          card.statementParts,
          card.statement,
          yield* inputs.t(),
          yield* inputs.locale(),
        );
      }
      if (card.kind === 'removal') {
        const proof = card.previousEvidence;
        return proof
          ? `${proof.element ?? 'template'}${proof.elementName ? ` "${proof.elementName}"` : ''} → ${proof.target}`
          : (yield* inputs.t()).previousUnavailable;
      }
      return '';
    });
    const effectsHidden = yield* craftComputed('effectsHidden', function* () {
      return (yield* effects()).length === 0;
    });
    const templateSourceHidden = yield* craftComputed(
      'templateSourceHidden',
      function* () {
        const card = yield* inputs.card();
        const detail = yield* inputs.sourceDetail();
        return (
          card.kind !== 'template' ||
          detail?.subject !== card.subject ||
          !(detail.element || detail.method || detail.renderSites?.length)
        );
      },
    );
    const renderSitesHidden = yield* craftComputed('renderSitesHidden', function* () {
      return (yield* renderSites()).length === 0;
    });
    const elementSourceHidden = yield* craftComputed(
      'elementSourceHidden',
      function* () {
        return !(yield* elementSource());
      },
    );
    const elementLocation = yield* craftComputed('elementLocation', function* () {
      const value = yield* elementSource();
      return value ? `${value.file}:${value.line}` : '';
    });
    const methodSourceHidden = yield* craftComputed(
      'methodSourceHidden',
      function* () {
        return !(yield* methodSource());
      },
    );
    const methodLocation = yield* craftComputed('methodLocation', function* () {
      const value = yield* methodSource();
      return value ? `${value.file}:${value.line}` : '';
    });
    const semanticDiff = deepYieldable(
      yield* craftComputed('semanticDiff', function* () {
        const card = yield* inputs.card();
        return card.kind === 'template' ? card.semanticDiff : [];
      }),
    );
    const codeDiff = yield* craftComputed('codeDiff', function* () {
      const card = yield* inputs.card();
      if (card.kind !== 'template') return [];
      return [
        ...card.codeDiff.removed.map((change) => ({
          line: `− ${change.leaf}`,
        })),
        ...card.codeDiff.added.map((change) => ({ line: `+ ${change.leaf}` })),
        ...card.codeDiff.changed.map((change) => ({
          line: `~ ${change.leaf}`,
        })),
      ];
    });
    const previousEvidenceUnavailable = yield* craftComputed(
      'previousEvidenceUnavailable',
      function* () {
        const card = yield* inputs.card();
        return (
          (card.kind === 'template' || card.kind === 'removal') &&
          card.previousEvidenceUnavailable
        );
      },
    );
    const previousDecision = yield* craftComputed('previousDecision', function* () {
      return (yield* inputs.card()).previousDecision;
    });
    const previousDecisionText = yield* craftComputed(
      'previousDecisionText',
      function* () {
        const previous = (yield* inputs.card()).previousDecision;
        if (!previous) return '—';
        const note = previous.note ? ` — ${previous.note}` : '';
        return `${(yield* inputs.t()).previousVerdict(previous.verdict)} · ${previous.by} · ${previous.at}${note}`;
      },
    );
    return section(
      {
        class: templateEvidence.root,
        'data-reviewKind': function* () {
          return (yield* card()).kind;
        },
        hidden: evidenceHidden,
      },
      [
        heading(promiseHeading),
        p(
          {
            class: templateEvidence.statement,
            'data-testid': 'template-statement',
          },
          [
            span(
              {
                class: reviewBits.dim,
                'data-testid': 'template-when',
                hidden: templateWhenHidden,
              },
              templateWhenText,
            ),
            strong(statementText),
          ],
        ),
        section(
          {
            class: reviewBits.dim,
            'data-testid': 'template-effects',
            hidden: effectsHidden,
          },
          [
            strong(function* () {
              return (yield* t()).templateEffects;
            }),
            ol(
              { class: templateEvidence.effects },
              forNode(
                effects,
                {
                  track: (effect, index) => `${index}:${effect}`,
                },
                (effect) => li({ class: reviewBits.code }, effect),
              ),
            ),
          ],
        ),
        section(
          {
            class: templateEvidence.source,
            'data-testid': 'template-source',
            hidden: templateSourceHidden,
          },
          [
            section(
              {
                class: templateEvidence.sourceSection,
                hidden: renderSitesHidden,
              },
              [
                strong(function* () {
                  return (yield* t()).templateRenderSource;
                }),
                forNode(
                  renderSites,
                  {
                    track: (site) => `${site.file}:${site.line}`,
                  },
                  (site) =>
                    div(
                      {
                        class: templateEvidence.sourceSection,
                        'data-testid': 'template-source-site',
                      },
                      [
                        small(
                          {
                            class: templateEvidence.sourceLocation,
                          },
                          function* () {
                            return `${yield* site.file()}:${yield* site.line()}`;
                          },
                        ),
                        a(
                          'renderSite',
                          {
                            class: reviewBits.sourceLink,
                            'data-navigation': 'external',
                            'data-testid': 'source-link',
                            href: function* () {
                              return safeUrl(
                                fileUrl(
                                  yield* site.file(),
                                  yield* site.line(),
                                ) ?? '',
                              );
                            },
                            hidden: function* () {
                              return (
                                fileUrl(
                                  yield* site.file(),
                                  yield* site.line(),
                                ) === undefined
                              );
                            },
                          },
                          function* () {
                            return (yield* t()).openInIde;
                          },
                        ),
                        pre(
                          {
                            class: templateEvidence.sourceCode,
                          },
                          function* () {
                            return (yield* site()).code;
                          },
                        ),
                      ],
                    ),
                ),
              ],
            ),
            section(
              {
                class: templateEvidence.sourceSection,
                hidden: elementSourceHidden,
              },
              [
                strong(function* () {
                  return (yield* t()).templateElementSource;
                }),
                small(
                  { class: templateEvidence.sourceLocation },
                  elementLocation,
                ),
                a(
                  'elementSource',
                  {
                    class: reviewBits.sourceLink,
                    'data-navigation': 'external',
                    'data-testid': 'source-link',
                    href: function* () {
                      const value = yield* elementSource();
                      return safeUrl(fileUrl(value?.file, value?.line) ?? '');
                    },
                    hidden: function* () {
                      const value = yield* elementSource();
                      return fileUrl(value?.file, value?.line) === undefined;
                    },
                  },
                  function* () {
                    return (yield* t()).openInIde;
                  },
                ),
                pre({ class: templateEvidence.sourceCode }, function* () {
                  return (yield* sourceDetail())?.element?.code ?? '';
                }),
              ],
            ),
            section(
              {
                class: templateEvidence.sourceSection,
                hidden: methodSourceHidden,
              },
              [
                strong(function* () {
                  return (yield* t()).templateMethodSource;
                }),
                small(
                  { class: templateEvidence.sourceLocation },
                  methodLocation,
                ),
                a(
                  'methodSource',
                  {
                    class: reviewBits.sourceLink,
                    'data-navigation': 'external',
                    'data-testid': 'source-link',
                    href: function* () {
                      const value = yield* methodSource();
                      return safeUrl(fileUrl(value?.file, value?.line) ?? '');
                    },
                    hidden: function* () {
                      const value = yield* methodSource();
                      return fileUrl(value?.file, value?.line) === undefined;
                    },
                  },
                  function* () {
                    return (yield* t()).openInIde;
                  },
                ),
                pre({ class: templateEvidence.sourceCode }, function* () {
                  return (yield* sourceDetail())?.method?.code ?? '';
                }),
              ],
            ),
          ],
        ),
        ul(
          {
            class: reviewBits.list,
            'data-testid': 'template-diff',
          },
          forNode(semanticDiff, { track: (change) => change.field }, (change) =>
            li({ class: reviewBits.code }, function* () {
              const messages = yield* t();
              const field = yield* change.field();
              const before = yield* change.before();
              const after = yield* change.after();
              return `${messages.templateDiffField(field)}: ${before ?? messages.templateValueMissing} → ${after ?? messages.templateValueMissing}`;
            }),
          ),
        ),
        p(
          {
            class: reviewBits.dim,
            hidden: function* () {
              return (yield* previousEvidenceUnavailable()) === false;
            },
          },
          function* () {
            return (yield* t()).previousUnavailable;
          },
        ),
        heading(function* () {
          return (yield* t()).previousDecisionLabel;
        }),
        p(previousDecisionText),
        heading(function* () {
          return (yield* t()).codeChange;
        }),
        ul(
          { class: reviewBits.list },
          forNode(codeDiff, { track: (change) => change.line }, (change) =>
            li({ class: reviewBits.code }, function* () {
              return (yield* change()).line;
            }),
          ),
        ),
      ],
    );
  },
);
