import {
  article,
  aside,
  button,
  craftComponent,
  div,
  figure,
  figcaption,
  forNode,
  h1,
  h2,
  h3,
  header,
  ifNode,
  img,
  label,
  li,
  main,
  option,
  p,
  section,
  select,
  small,
  span,
  strong,
  textarea,
  ul,
} from '@craft-ts/component';
import {
  craftComputed,
  craftMethod,
  insertReactOnMutation,
  mutation,
  query,
  state,
} from '@craft-ts/core';
import type {
  ReviewApiQueue,
  ReviewDecisionRequest,
} from '../../src/lib/review/server';

type DecisionVerdict =
  | 'ok'
  | 'ok-with-note'
  | 'rejected'
  | 'known-issue'
  | 'blocked';
type ZoomMode = 'fit' | 'actual';

const scenarioOf = (subject: string): string =>
  subject.slice(subject.lastIndexOf('#') + 1);

const componentOf = (subject: string): string => {
  const visual = subject.startsWith('visual:') ? subject.slice(7) : subject;
  return visual.slice(0, visual.lastIndexOf('#'));
};

const requestJson = async <Value>(
  input: string,
  init?: RequestInit,
): Promise<Value> => {
  const response = await fetch(input, init);
  const value = (await response.json()) as Value | { readonly error?: string };
  if (!response.ok) {
    throw new Error(
      'error' in (value as object) &&
      typeof (value as { error?: unknown }).error === 'string'
        ? (value as { error: string }).error
        : `Request failed (${response.status}).`,
    );
  }
  return value as Value;
};

const imageUrl = (hash: string): string =>
  `/api/evidence/${encodeURIComponent(hash)}`;

const eventValue = (event: Event): string =>
  (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
    .value;

export const ReviewApp = craftComponent(
  'AttestReviewApp',
  {},
  function* () {
    const selectedIndex = yield* state('selectedIndex', 0, ({ set }) => ({
      select: (index: number) => set(index),
    }));
    const zoom = yield* state('zoom', 'fit' as ZoomMode, ({ set }) => ({
      choose: (mode: ZoomMode) => set(mode),
    }));
    const note = yield* state('note', '', ({ set }) => ({
      write: (value: string) => set(value),
      clear: () => set(''),
    }));
    const rejectionAttempted = yield* state(
      'rejectionAttempted',
      false,
      ({ set }) => ({
        show: () => set(true),
        clear: () => set(false),
      }),
    );

    const decision = yield* mutation('reviewDecision', {
      method: (payload: ReviewDecisionRequest) => payload,
      loader: async ({ params }: { params: ReviewDecisionRequest }) =>
        await requestJson<ReviewApiQueue>('/api/decisions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
        }),
    });

    const review = yield* query(
      'reviewQueue',
      {
        params: () => true,
        loader: async () => await requestJson<ReviewApiQueue>('/api/review'),
      },
      insertReactOnMutation(decision, {
        update: ({ queryResource, mutationResource }) =>
          mutationResource.value() ??
          queryResource.value() ?? { items: 0, decisions: 0, cards: [] },
      }),
    );

    const cards = craftComputed('cards', function* () {
      return (yield* review.value())?.cards ?? [];
    });
    const activeIndex = craftComputed('activeIndex', function* () {
      const list = yield* cards();
      if (list.length === 0) return 0;
      return Math.min(yield* selectedIndex(), list.length - 1);
    });
    const current = craftComputed('current', function* () {
      const list = yield* cards();
      return list[yield* activeIndex()];
    });
    const hasNote = craftComputed('hasNote', function* () {
      return (yield* note()).trim().length > 0;
    });
    const reviewFailed = craftComputed('reviewFailed', function* () {
      return (yield* review.status()) === 'exception';
    });
    const decisionFailed = craftComputed('decisionFailed', function* () {
      return (yield* decision.status()) === 'exception';
    });
    const rejectionReasonMissing = craftComputed(
      'rejectionReasonMissing',
      function* () {
        return (yield* rejectionAttempted()) && !(yield* hasNote());
      },
    );
    const movePrevious = craftMethod('movePrevious', function* () {
      const index = yield* selectedIndex();
      yield* selectedIndex.select(Math.max(0, index - 1));
    });
    const moveNext = craftMethod('moveNext', function* () {
      const list = yield* cards();
      const index = yield* selectedIndex();
      yield* selectedIndex.select(
        Math.min(Math.max(0, list.length - 1), index + 1),
      );
    });
    const decide = craftMethod('decide', function* (verdict: DecisionVerdict) {
      const card = yield* current();
      if (!card) return;
      const writtenNote = (yield* note()).trim();
      if (verdict === 'rejected' && writtenNote.length === 0) {
        yield* rejectionAttempted.show();
        document.querySelector<HTMLTextAreaElement>('#review-note')?.focus();
        return;
      }
      yield* decision.mutate({
        shape: card.shape,
        verdict,
        ...(writtenNote ? { note: writtenNote } : {}),
      });
      yield* note.clear();
      yield* rejectionAttempted.clear();
    });

    return {
      review,
      decision,
      cards,
      activeIndex,
      current,
      selectedIndex,
      zoom,
      note,
      hasNote,
      rejectionReasonMissing,
      reviewFailed,
      decisionFailed,
      movePrevious,
      moveNext,
      decide,
    };
  },
  ({
    review,
    decision,
    cards,
    activeIndex,
    selectedIndex,
    zoom,
    note,
    hasNote,
    rejectionReasonMissing,
    reviewFailed,
    decisionFailed,
    movePrevious,
    moveNext,
    decide,
  }) =>
    div({ class: 'app-shell' }, [
      header({ class: 'topbar' }, [
        div([
          small({ class: 'eyebrow' }, 'CRAFTTS / ATTEST'),
          h1('Visual review'),
        ]),
        div({ class: 'queue-summary', 'aria-live': 'polite' }, [
          strong(function* () {
            return String((yield* review.value())?.items ?? 0);
          }),
          span(' scenarios · '),
          strong(function* () {
            return String((yield* review.value())?.decisions ?? 0);
          }),
          span(' decisions'),
        ]),
      ]),
      ifNode(reviewFailed, () =>
        p(
          { class: 'notice error', role: 'alert' },
          'The review queue could not be loaded. Reload the page to retry.',
        ),
      ),
      ifNode(decisionFailed, () =>
        p(
          { class: 'notice error', role: 'alert' },
          'The decision was not saved. The scenario remains in the queue.',
        ),
      ),
      div({ class: 'workspace' }, [
        aside({ class: 'queue-panel', 'aria-label': 'Review queue' }, [
          div({ class: 'panel-heading' }, [
            h2('Queue'),
            small('One card per decision'),
          ]),
          div(
            { class: 'queue-list' },
            forNode(
              cards,
              {
                track: (card) => card.shape,
                empty: () =>
                  div({ class: 'empty-queue' }, [
                    strong('Review complete'),
                    p('Every decision in this session has been recorded.'),
                  ]),
              },
              (card, index) =>
                button(
                  'SelectReviewCard',
                  {
                    type: 'button',
                    class: function* () {
                      return {
                        'queue-item': true,
                        active: index === (yield* activeIndex()),
                      };
                    },
                    'aria-current': function* () {
                      return index === (yield* activeIndex())
                        ? 'true'
                        : 'false';
                    },
                    *click() {
                      yield* selectedIndex.select(index);
                    },
                  },
                  [
                    span({ class: 'scenario-name' }, function* () {
                      return scenarioOf((yield* card()).subject);
                    }),
                    small(function* () {
                      const value = yield* card();
                      return value.cluster.length > 1
                        ? `${value.cluster.length} identical changes`
                        : value.reason;
                    }),
                  ],
                ),
            ),
          ),
          div({ class: 'queue-navigation' }, [
            button(
              'PreviousReviewCard',
              {
                type: 'button',
                'data-hotkey': 'k',
                disabled: function* () {
                  return (yield* activeIndex()) === 0;
                },
                click: movePrevious,
              },
              ['↑ Previous ', span({ class: 'key' }, 'K')],
            ),
            button(
              'NextReviewCard',
              {
                type: 'button',
                'data-hotkey': 'j',
                disabled: function* () {
                  return (yield* activeIndex()) >= (yield* cards()).length - 1;
                },
                click: moveNext,
              },
              ['Next ↓ ', span({ class: 'key' }, 'J')],
            ),
          ]),
        ]),
        main(
          { class: 'review-panel' },
          forNode(cards, { track: (card) => card.shape }, (card, index) =>
            article(
              {
                class: 'review-card',
                hidden: function* () {
                  return index !== (yield* activeIndex());
                },
              },
              [
                header({ class: 'review-heading' }, [
                  div([
                    small({ class: 'eyebrow' }, 'SCENARIO'),
                    h2(function* () {
                      return scenarioOf((yield* card()).subject);
                    }),
                    span({ class: 'subject code' }, function* () {
                      return componentOf((yield* card()).subject);
                    }),
                  ]),
                  span({ class: 'reason' }, function* () {
                    return (yield* card()).reason;
                  }),
                ]),
                p(
                  {
                    class: 'notice cluster',
                    hidden: function* () {
                      return (yield* card()).cluster.length <= 1;
                    },
                  },
                  function* () {
                    return `${(yield* card()).cluster.length} scenarios have the same measured delta. This decision covers all of them.`;
                  },
                ),
                section(
                  {
                    class: 'cluster-members',
                    hidden: function* () {
                      return (yield* card()).members.length <= 1;
                    },
                  },
                  [
                    h3('Scenarios covered by this decision'),
                    ul(
                      forNode(
                        function* () {
                          return (yield* card()).members;
                        },
                        { track: (member) => member.subject },
                        (member) =>
                          li(function* () {
                            return scenarioOf((yield* member()).subject);
                          }),
                      ),
                    ),
                  ],
                ),
                section({ class: 'evidence-toolbar' }, [
                  div({ class: 'metadata' }, [
                    span({ class: 'chip' }, function* () {
                      const viewport = (yield* card()).members[0]?.metadata
                        ?.viewport;
                      return viewport
                        ? `Viewport ${viewport.width}×${viewport.height}`
                        : 'Viewport unknown';
                    }),
                    span({ class: 'chip' }, function* () {
                      const screenshot = (yield* card()).members[0]?.metadata
                        ?.screenshot;
                      return screenshot
                        ? `Capture ${screenshot.width}×${screenshot.height}`
                        : 'Capture size unknown';
                    }),
                    span({ class: 'chip' }, function* () {
                      return (
                        (yield* card()).members[0]?.metadata?.colorScheme ??
                        'scheme unknown'
                      );
                    }),
                    span({ class: 'chip' }, function* () {
                      const browser = (yield* card()).members[0]?.metadata
                        ?.browser;
                      return browser
                        ? `${browser.name} ${browser.version}`
                        : 'browser unknown';
                    }),
                  ]),
                  select(
                    'EvidenceZoom',
                    {
                      'aria-label': 'Evidence zoom',
                      value: zoom,
                      *change(event: Event) {
                        yield* zoom.choose(eventValue(event) as ZoomMode);
                      },
                    },
                    [
                      option({ value: 'fit' }, 'Fit to window'),
                      option({ value: 'actual' }, 'Actual size'),
                    ],
                  ),
                ]),
                figure(
                  {
                    class: function* () {
                      return `evidence-canvas zoom-${yield* zoom()}`;
                    },
                  },
                  [
                    img({
                      hidden: function* () {
                        return !(yield* card()).image;
                      },
                      alt: function* () {
                        return `Current rendering for ${scenarioOf((yield* card()).subject)}`;
                      },
                      src: function* () {
                        const hash = (yield* card()).image;
                        return hash ? imageUrl(hash) : '';
                      },
                    }),
                    p(
                      {
                        class: 'no-image',
                        hidden: function* () {
                          return Boolean((yield* card()).image);
                        },
                      },
                      'No screenshot was captured.',
                    ),
                    figcaption(function* () {
                      const target = (yield* card()).members[0]?.metadata
                        ?.target;
                      return target
                        ? `Current evidence · captured element ${target}`
                        : 'Current evidence';
                    }),
                  ],
                ),
                section({ class: 'diff-panel' }, [
                  h3('Measured change'),
                  ul(
                    forNode(
                      function* () {
                        return (yield* card()).changes;
                      },
                      {
                        track: (change) => change,
                        empty: () =>
                          li('New subject: nothing has been approved yet.'),
                      },
                      (change) => li(span({ class: 'code' }, change)),
                    ),
                  ),
                ]),
                section(
                  {
                    class: 'previous-rejection',
                    hidden: function* () {
                      return !(yield* card()).rejectionReason;
                    },
                  },
                  [
                    h3('Previous rejection reason'),
                    p(function* () {
                      return (yield* card()).rejectionReason ?? '';
                    }),
                  ],
                ),
                section({ class: 'decision-panel' }, [
                  label({ htmlFor: 'review-note' }, 'Decision reason'),
                  textarea('ReviewNote', {
                    id: 'review-note',
                    'aria-label': 'Decision note',
                    'aria-describedby': 'review-note-help review-note-error',
                    'aria-invalid': rejectionReasonMissing,
                    placeholder:
                      'Explain what is wrong or why this decision is appropriate…',
                    value: note,
                    *input(event: Event) {
                      yield* note.write(eventValue(event));
                    },
                  }),
                  small(
                    { id: 'review-note-help', class: 'decision-help' },
                    'A reason is required for Reject so the code can be corrected.',
                  ),
                  small(
                    {
                      id: 'review-note-error',
                      class: 'field-error',
                      role: 'alert',
                      hidden: function* () {
                        return !(yield* rejectionReasonMissing());
                      },
                    },
                    'Explain why this rendering should be rejected.',
                  ),
                  div({ class: 'decision-actions' }, [
                    button(
                      'RejectReviewCard',
                      {
                        type: 'button',
                        class: 'danger',
                        'data-hotkey': 'r',
                        disabled: decision.isLoading,
                        *click() {
                          yield* decide('rejected');
                        },
                      },
                      ['Reject ', span({ class: 'key' }, 'R')],
                    ),
                    button(
                      'BlockReviewCard',
                      {
                        type: 'button',
                        disabled: decision.isLoading,
                        *click() {
                          yield* decide('blocked');
                        },
                      },
                      'Block',
                    ),
                    button(
                      'KnownIssueReviewCard',
                      {
                        type: 'button',
                        disabled: decision.isLoading,
                        *click() {
                          yield* decide('known-issue');
                        },
                      },
                      'Known issue',
                    ),
                    button(
                      'AcceptWithNoteReviewCard',
                      {
                        type: 'button',
                        'data-hotkey': 'n',
                        disabled: function* () {
                          return (
                            (yield* decision.isLoading()) || !(yield* hasNote())
                          );
                        },
                        *click() {
                          yield* decide('ok-with-note');
                        },
                      },
                      ['Accept with note ', span({ class: 'key' }, 'N')],
                    ),
                    button(
                      'AcceptReviewCard',
                      {
                        type: 'button',
                        class: 'primary',
                        'data-hotkey': 'a',
                        disabled: decision.isLoading,
                        *click() {
                          yield* decide('ok');
                        },
                      },
                      ['Accept ', span({ class: 'key' }, 'A')],
                    ),
                  ]),
                ]),
              ],
            ),
          ),
        ),
      ]),
    ]),
);
