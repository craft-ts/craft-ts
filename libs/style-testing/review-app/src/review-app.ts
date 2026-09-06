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
  iframe,
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
import {
  checkReplay,
  markTiers,
  onPick,
  REVIEW_TOLERANCE,
  viewOf,
  whenReady,
} from '../../src/lib/review/frame';
import type { LayoutDigest } from '../../src/lib/digest';

const FRAME_ID = 'craft-replay-frame';

type DecisionVerdict =
  | 'ok'
  | 'ok-with-note'
  | 'rejected'
  | 'known-issue'
  | 'blocked';
type ZoomMode = 'fit' | 'actual';
type EvidenceView = 'replay' | 'image';

interface Finding {
  readonly path: string;
  readonly note: string;
}

/**
 * The frozen document, once the browser has decided whether to trust it.
 *
 * `faithful` is measured here rather than taken from the capture machine: the
 * only replay worth vouching for is the one on the screen the reviewer is
 * looking at.
 */
interface ReplayState {
  readonly loaded: boolean;
  readonly faithful: boolean;
  readonly report: readonly string[];
}

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

const snapshotUrl = (hash: string): string =>
  `/api/snapshot/${encodeURIComponent(hash)}`;

const digestUrl = (hash: string): string =>
  `/api/digest/${encodeURIComponent(hash)}`;

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
    const evidenceView = yield* state(
      'evidenceView',
      'replay' as EvidenceView,
      ({ set }) => ({ choose: (mode: EvidenceView) => set(mode) }),
    );
    const findings = yield* state(
      'findings',
      [] as readonly Finding[],
      ({ set }) => ({ replace: (value: readonly Finding[]) => set(value) }),
    );
    const hideChrome = yield* state('hideChrome', false, ({ set }) => ({
      choose: (value: boolean) => set(value),
    }));

    /**
     * Measures the replay the reviewer is actually looking at.
     *
     * Not the capture machine's verdict on it: a document that was faithful in
     * CI and is not faithful here would otherwise be judged as though it were
     * the original. The check runs on load, on this screen, every time.
     */
    const inspect = yield* mutation('inspectReplay', {
      method: (payload: {
        readonly frame: HTMLIFrameElement;
        readonly target: string;
        readonly evidence?: string;
        readonly attested: readonly string[];
        readonly changed: readonly string[];
        readonly occluded: readonly string[];
        readonly hideChrome: boolean;
      }) => payload,
      loader: async ({ params }): Promise<ReplayState> => {
        const view = viewOf(params.frame);
        if (!view) {
          return {
            loaded: false,
            faithful: false,
            report: ['The frozen document could not be opened.'],
          };
        }
        // Fonts first: a box measured before its face arrives carries the
        // fallback's metrics, and half a pixel on one span reads as an
        // unfaithful replay.
        await whenReady(view);

        // Measured before anything is drawn on it. The marking is meant to be
        // layout-neutral, but "meant to be" is not a guarantee, and a check
        // that runs after its own annotations is checking the annotations.
        const attested = params.evidence
          ? await requestJson<LayoutDigest>(digestUrl(params.evidence))
          : undefined;
        const fidelity = attested
          ? checkReplay(view, params.target, attested, {
              tolerance: REVIEW_TOLERANCE,
            })
          : undefined;

        markTiers(view, {
          root: params.target,
          attested: params.attested,
          changed: params.changed,
          occluded: params.occluded,
          dimDecor: true,
          hideChrome: params.hideChrome,
        });
        onPick(view, () => undefined);

        return {
          loaded: true,
          faithful: fidelity?.faithful ?? false,
          report: fidelity?.report ?? [
            'No attested digest to check this replay against, so it cannot be vouched for.',
          ],
        };
      },
    });

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
    const member = craftComputed('member', function* () {
      return (yield* current())?.members[0];
    });
    const replayTarget = craftComputed('replayTarget', function* () {
      return (yield* member())?.metadata?.target ?? 'body';
    });
    const canReplay = craftComputed('canReplay', function* () {
      return Boolean((yield* member())?.snapshot);
    });
    const replay = craftComputed('replay', function* () {
      return (
        (yield* inspect.value()) ??
        ({ loaded: false, faithful: false, report: [] } satisfies ReplayState)
      );
    });
    const showingReplay = craftComputed('showingReplay', function* () {
      return (yield* evidenceView()) === 'replay' && (yield* canReplay());
    });
    /**
     * Whether this verdict would be reached without a faithful replay.
     *
     * Recorded on the attestation, because judging a photograph is a different
     * claim from judging the document: the reviewer could not lift the page's
     * own chrome to see what it was covering.
     */
    const degraded = craftComputed('degraded', function* () {
      if (!(yield* canReplay())) return true;
      if (!(yield* showingReplay())) return true;
      const state = yield* replay();
      return !state.loaded || !state.faithful;
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
    // A bare generator, composed by both methods below. A craftMethod is a
    // handler, not something another method calls.
    function* runInspection(chrome: boolean) {
      const frame = document.getElementById(FRAME_ID);
      const active = yield* member();
      if (!(frame instanceof HTMLIFrameElement) || !active) return;
      yield* inspect.mutate({
        frame,
        target: yield* replayTarget(),
        ...(active.evidence ? { evidence: active.evidence } : {}),
        attested: active.attested,
        changed: active.changed,
        occluded: (active.metadata?.occluded ?? []).map((entry) => entry.path),
        hideChrome: chrome,
      });
    }

    const inspectFrame = craftMethod('inspectFrame', function* () {
      yield* runInspection(yield* hideChrome());
    });

    const toggleChrome = craftMethod('toggleChrome', function* () {
      const next = !(yield* hideChrome());
      yield* hideChrome.choose(next);
      yield* runInspection(next);
    });

    /**
     * Turns the current selection into a remark aimed at one node.
     *
     * The path is read back from the replayed element rather than derived from
     * where the cursor was: the address is the digest's own, so the remark can
     * be followed to the code that produced the node.
     */
    const addFinding = craftMethod('addFinding', function* () {
      const frame = document.getElementById(FRAME_ID);
      const view = frame instanceof HTMLIFrameElement ? viewOf(frame) : undefined;
      const path = view?.document
        .querySelector('[data-craft-picked]')
        ?.getAttribute('data-craft-path');
      const text = (yield* note()).trim();
      if (!path || text.length === 0) return;
      const existing = yield* findings();
      yield* findings.replace([
        ...existing.filter((finding) => finding.path !== path),
        { path, note: text },
      ]);
      yield* note.clear();
    });

    const removeFinding = craftMethod('removeFinding', function* (path: string) {
      const existing = yield* findings();
      yield* findings.replace(
        existing.filter((finding) => finding.path !== path),
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
      const pointed = yield* findings();
      yield* decision.mutate({
        shape: card.shape,
        verdict,
        ...(writtenNote ? { note: writtenNote } : {}),
        ...(pointed.length > 0 ? { findings: pointed } : {}),
        ...((yield* degraded()) ? { degraded: true } : {}),
      });
      yield* note.clear();
      yield* findings.replace([]);
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
      evidenceView,
      findings,
      hideChrome,
      member,
      canReplay,
      replay,
      showingReplay,
      degraded,
      inspectFrame,
      toggleChrome,
      addFinding,
      removeFinding,
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
    current,
    evidenceView,
    findings,
    hideChrome,
    canReplay,
    replay,
    showingReplay,
    degraded,
    inspectFrame,
    toggleChrome,
    addFinding,
    removeFinding,
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
                    // What the verdict covers against what anybody could look
                    // at. Said out loud, on the same rule as `bulk`: an
                    // attestation must not claim a coverage it does not have.
                    span({ class: 'chip coverage' }, function* () {
                      const coverage = (yield* card()).members[0]?.metadata
                        ?.coverage;
                      if (!coverage) return 'coverage unknown';
                      const seen =
                        coverage.attested -
                        coverage.offScreen -
                        coverage.occluded;
                      return `${coverage.attested} attested · ${seen} on screen · ${coverage.occluded} covered`;
                    }),
                  ]),
                  div({ class: 'view-toggle', role: 'group' }, [
                    button(
                      'ShowReplay',
                      {
                        type: 'button',
                        'data-view': 'replay',
                        disabled: function* () {
                          return !(yield* canReplay());
                        },
                        'aria-pressed': function* () {
                          return String(yield* showingReplay());
                        },
                        *click() {
                          yield* evidenceView.choose('replay');
                        },
                      },
                      'Frozen page',
                    ),
                    button(
                      'ShowImage',
                      {
                        type: 'button',
                        'data-view': 'image',
                        'aria-pressed': function* () {
                          return String(!(yield* showingReplay()));
                        },
                        *click() {
                          yield* evidenceView.choose('image');
                        },
                      },
                      'Screenshot',
                    ),
                    button(
                      'ToggleChrome',
                      {
                        type: 'button',
                        hidden: function* () {
                          return !(yield* showingReplay());
                        },
                        'aria-pressed': function* () {
                          return String(yield* hideChrome());
                        },
                        click: toggleChrome,
                      },
                      // Only the replay can do this. In a screenshot those
                      // pixels have already been replaced.
                      'Lift page chrome',
                    ),
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
                p(
                  {
                    class: 'notice warning',
                    role: 'status',
                    hidden: function* () {
                      const state = yield* replay();
                      return (
                        !(yield* showingReplay()) ||
                        !state.loaded ||
                        state.faithful
                      );
                    },
                  },
                  function* () {
                    const state = yield* replay();
                    return `This frozen page does not measure like the evidence, so it is not the render that was attested: ${state.report.join(' ')} Judge the screenshot instead — the decision will be recorded as made without a faithful replay.`;
                  },
                ),
                figure(
                  {
                    class: function* () {
                      return `evidence-canvas zoom-${yield* zoom()}`;
                    },
                  },
                  [
                    div(
                      {
                        class: 'replay-holder',
                        hidden: function* () {
                          return !(yield* showingReplay());
                        },
                      },
                      iframe({
                        id: FRAME_ID,
                        title: 'Frozen page, as captured',
                        // Sized to the captured viewport, never to the
                        // reviewer's window: the snapshot freezes the styles,
                        // not the box the page lays itself out in.
                        width: function* () {
                          return String(
                            (yield* card()).members[0]?.metadata?.viewport
                              ?.width ?? 375,
                          );
                        },
                        height: function* () {
                          // The captured viewport, not the picture's height.
                          // The frame has to reproduce the window the page laid
                          // itself out in; anything taller is a different
                          // viewport and measures differently.
                          return String(
                            (yield* card()).members[0]?.metadata?.viewport
                              ?.height ?? 900,
                          );
                        },
                        src: function* () {
                          // Only the card on screen loads a document. Every
                          // other card in the queue is rendered and hidden, and
                          // giving each one an iframe would parse the same
                          // page as many times as the queue is long.
                          const active = yield* current();
                          const own = yield* card();
                          const hash =
                            own.shape === active?.shape
                              ? own.members[0]?.snapshot
                              : undefined;
                          return hash ? snapshotUrl(hash) : '/api/blank';
                        },
                        load: inspectFrame,
                      }),
                    ),
                    div(
                      {
                        class: 'image-holder',
                        hidden: function* () {
                          return yield* showingReplay();
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
                        // Where the viewport ended. Everything below it is
                        // attested and was never on anybody's screen.
                        div({
                          class: 'fold',
                          hidden: function* () {
                            const metadata = (yield* card()).members[0]
                              ?.metadata;
                            return !(metadata?.visibleBand && metadata.screenshot);
                          },
                          style: function* () {
                            const metadata = (yield* card()).members[0]
                              ?.metadata;
                            const band = metadata?.visibleBand;
                            const shot = metadata?.screenshot;
                            if (!band || !shot) return '';
                            const percent = (value: number, total: number) =>
                              `${Math.max(0, Math.min(100, (value / total) * 100))}%`;
                            return [
                              `left:${percent(band.x, shot.width)}`,
                              `top:${percent(band.y, shot.height)}`,
                              `width:${percent(band.width, shot.width)}`,
                              `height:${percent(band.height, shot.height)}`,
                            ].join(';');
                          },
                        }),
                      ],
                    ),
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
                section(
                  {
                    class: 'findings-panel',
                    hidden: function* () {
                      return !(yield* showingReplay());
                    },
                  },
                  [
                    h3('Remarks on a specific node'),
                    small(
                      { class: 'decision-help' },
                      'Click an element in the frozen page, write the reason above, then add it. A remark carries the node address the digest uses, so it can be followed back to the code — and one aimed at something this subject does not attest is refused.',
                    ),
                    ul(
                      { class: 'findings-list' },
                      forNode(
                        findings,
                        {
                          track: (finding) => finding.path,
                          empty: () =>
                            li(
                              { class: 'findings-empty' },
                              'No node has been pointed at yet.',
                            ),
                        },
                        (finding) =>
                          li([
                            span({ class: 'code' }, function* () {
                              return (yield* finding()).path;
                            }),
                            span(function* () {
                              return (yield* finding()).note;
                            }),
                            button(
                              'RemoveFinding',
                              {
                                type: 'button',
                                *click() {
                                  yield* removeFinding((yield* finding()).path);
                                },
                              },
                              'Remove',
                            ),
                          ]),
                      ),
                    ),
                    button(
                      'AddFinding',
                      {
                        type: 'button',
                        disabled: function* () {
                          return !(yield* hasNote());
                        },
                        click: addFinding,
                      },
                      'Add remark on the selected node',
                    ),
                  ],
                ),
                section({ class: 'decision-panel' }, [
                  p(
                    {
                      class: 'notice degraded',
                      hidden: function* () {
                        return !(yield* degraded());
                      },
                    },
                    // Written into the attestation, not just shown: judging a
                    // photograph and judging the document are different claims.
                    'This decision will be recorded as made without a faithful replay.',
                  ),
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
