import {
  article,
  aside,
  button,
  craftComponent,
  div,
  figure,
  figcaption,
  forNode,
  heading,
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
  details,
  summary,
  select,
  small,
  span,
  strong,
  textarea,
  ul,
  safeResourceUrl,
} from '@craft-ts/component';
import {
  CraftHttpClient,
  asyncProcess,
  craftComputed,
  craftGen,
  craftMethod,
  craftUntilSettled,
  insertQueryPipe,
  insertReactOnMutation,
  mutation,
  on$,
  query,
  queryParams,
  source$,
  state,
} from '@craft-ts/core';
import type {
  ReviewApiQueue,
  ReviewDecisionReopenRequest,
  ReviewDecisionRequest,
  ReviewIterationHandoffResponse,
  ReviewSessionDecision,
} from '@craft-ts/style-testing/review';
import {
  checkReplay,
  markTiers,
  markHighlight,
  markSelection,
  onPick,
  REVIEW_TOLERANCE,
  viewOf,
} from '@craft-ts/style-testing/review/frame';
import type { FidelityReason, LayoutDigest } from '@craft-ts/style-testing';
import { reviewClipboard, reviewDocument } from './browser-adapter';
import { MESSAGES } from './messages';
import { ReviewPreferences } from './preferences.service';
import { ReviewFilters } from './review-filters.service';
import { CloseReview } from './close-review.service';
import { RetirementReasonChoice } from './retirement-reason.service';
import { ThemeLocalePicker } from './theme-locale-picker';
import { RetirementReasonPicker } from './retirement-reason-picker';
import { TierLegend } from './tier-legend';
import { FilterBarActions, FilterBarFields } from './filter-bar';
import { ViewTabs } from './view-tabs';
import { AssetsInventoryList } from './assets-inventory-list';
import {
  MENTION_ID,
  chipFor,
  eventValue,
  mentionPattern,
  noteForMention,
  proseOf,
  relabelChip,
  textOf,
  type Mention,
} from './annotation-text';
import {
  devtoolViewQueryParamCodec,
  initialDevtoolView,
  initialEvidenceView,
  initialMentions,
  initialSelection,
  initialZoom,
  isZoomMode,
  stringQueryParamCodec,
  type DevtoolView,
  type UrlDevtoolView,
  type ZoomMode,
} from './devtool-view-state';
import {
  componentOf,
  conditionText,
  diagnosticSummaryOf,
  directionText,
  imageUrl,
  reasonText,
  scenarioOf,
  stateText,
  snapshotUrl,
  templateStatementOf,
  waitForReplayReady,
} from './card-presentation';

/**
 * The id of the frame holding the card being reviewed.
 *
 * The active review card carries this id so the checker always inspects the
 * frame belonging to the scenario currently shown in the central panel.
 */
const FRAME_ID = 'craft-replay-frame';

/** The reason field, which is also where group references are inserted. */
const NOTE_ID = 'review-note';

type DecisionVerdict =
  | 'ok'
  | 'ok-with-note'
  | 'rejected'
  | 'known-issue'
  | 'blocked';

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
  /**
   * Why, as data. The sentence is built where the language is known — the
   * library's own wording is English, and it is thrown at whoever wrote the
   * code rather than shown to whoever is reviewing the render.
   */
  readonly reason: FidelityReason | undefined;
  /** Supporting detail, one line each. */
  readonly report: readonly string[];
  /**
   * What is painted over the subject in this replay, named.
   *
   * Read back from the page rather than from the capture's metadata: the
   * metadata counts covered *nodes*, and one button sitting on five of them is
   * one thing to lift, not five.
   */
  readonly chrome: readonly string[];
}

export const ReviewApp = craftComponent(
  'ReviewApp',
  {},
  craftGen(function* () {
    const navigation$ = source$<number>('navigation$');
    const decisionSubmitted$ =
      source$<ReviewDecisionRequest>('decisionSubmitted$');
    const decisionReopened$ = source$<ReviewDecisionReopenRequest>(
      'decisionReopened$',
    );
    const regenerationDialogRequested$ = source$<void>(
      'regenerationDialogRequested$',
    );
    const regenerationDialogClosed$ = source$<void>(
      'regenerationDialogClosed$',
    );
    const regenerationConfirmed$ = source$<'regenerate'>(
      'regenerationConfirmed$',
    );
    const iterationDialogRequested$ = source$<void>(
      'iterationDialogRequested$',
    );
    const iterationDialogClosed$ = source$<void>('iterationDialogClosed$');
    // A source-backed mutation only starts when its source value changes. A
    // void/undefined event would be indistinguishable from the initial value,
    // so use a monotonically increasing request token for each click.
    let iterationHandoffRequest = 0;
    const iterationHandoffRequested$ = source$<number>(
      'iterationHandoffRequested$',
    );
    const mentionEdited$ = source$<{
      readonly mentions: readonly Mention[];
      readonly note: string;
    }>('mentionEdited$');

    const navigationParams = yield* queryParams(
      'reviewNavigation',
      {
        state: {
          view: {
            // An empty URL value means the default view. Keeping the fallback
            // empty makes an explicit click on Review queue visible as
            // `?view=review`, while a bare URL remains a clean deep link.
            fallbackValue: '' satisfies UrlDevtoolView,
            codec: devtoolViewQueryParamCodec,
          },
          scenario: {
            fallbackValue: '',
            codec: stringQueryParamCodec,
          },
        },
      },
      ({ patch }) => ({
        setViewForDevtoolChoice: function* (value: DevtoolView) {
          return yield* patch({ view: value });
        },
        setViewForVisualReview: function* (value: DevtoolView) {
          return yield* patch({ view: value });
        },
        setScenarioAfterRegeneration: function* (value: string) {
          return yield* patch({ scenario: value });
        },
        setScenarioPrevious: function* (value: string) {
          return yield* patch({ scenario: value });
        },
        setScenarioNext: function* (value: string) {
          return yield* patch({ scenario: value });
        },
        setScenarioForVisualTestSelection: function* (value: string) {
          return yield* patch({ scenario: value });
        },
        setScenarioForVisualReview: function* (value: string) {
          return yield* patch({ scenario: value });
        },
        setScenarioForCardSelection: function* (value: string) {
          return yield* patch({ scenario: value });
        },
        setScenarioForReopenedDecision: function* (value: string) {
          return yield* patch({ scenario: value });
        },
      }),
    );

    // Read from the environment before the first paint, so nothing renders in
    // the wrong language or the wrong theme and then corrects itself.
    const { locale } = yield* ReviewPreferences();
    const devtoolView = craftComputed('devtoolView', function* () {
      const value = yield* navigationParams.view();
      return value || initialDevtoolView();
    });
    const { retirementReason } = yield* RetirementReasonChoice();
    const {
      componentFilter,
      textFilter,
      kindFilter,
      stateFilter,
      directionFilter,
    } = yield* ReviewFilters();
    const zoom = yield* state('zoom', initialZoom(), ({ set }) => ({
      choose: (mode: ZoomMode) => set(mode),
    }));
    const note = yield* state('note', '', ({ set }) => ({
      writeFromInput: (value: string) => set(value),
      replaceFromMentionEdit: on$(mentionEdited$, ({ note: value }) =>
        set(value),
      ),
      clearFromNavigation: on$(navigation$, () => set('')),
      clearFromDecision: on$(decisionSubmitted$, () => set('')),
      clearFromRegeneration: on$(regenerationConfirmed$, () => set('')),
    }));
    const rejectionAttempted = yield* state(
      'rejectionAttempted',
      false,
      ({ set }) => ({
        showForRejectedDecision: () => set(true),
        showForRetirement: () => set(true),
        clearFromDecision: on$(decisionSubmitted$, () => set(false)),
        clearFromRegeneration: on$(regenerationConfirmed$, () => set(false)),
      }),
    );
    const evidenceView = yield* state(
      'evidenceView',
      initialEvidenceView(),
      ({ set }) => ({
        chooseReplay: () => set('replay'),
        chooseImage: () => set('image'),
        // Every card is judged on its own artefact: a pin taken on one card
        // must not decide what the next reviewer sees on the next one.
        releaseFromNavigation: on$(navigation$, () => set('auto')),
        releaseFromRegeneration: on$(regenerationConfirmed$, () => set('auto')),
      }),
    );
    /**
     * Every group the reviewer has ever named on this card.
     *
     * A registry, not the truth: which of them the decision carries is decided
     * by whether their token is still in the reason. Editing the text is
     * therefore the only way to edit the references, and there is no way for
     * the two to disagree.
     */
    const mentions = yield* state('mentions', initialMentions(), ({ set }) => ({
      replaceFromMentionEdit: on$(mentionEdited$, ({ mentions: value }) =>
        set(value),
      ),
      clearFromDecision: on$(decisionSubmitted$, () => set([])),
      clearFromRegeneration: on$(regenerationConfirmed$, () => set([])),
    }));

    const hideChrome = yield* state('hideChrome', false, ({ set }) => ({
      choose: (value: boolean) => set(value),
    }));
    /**
     * The nodes a remark would be aimed at.
     *
     * A set, not a single path: one remark usually covers a row of buttons or
     * a whole column, and adding them one at a time means retyping the same
     * sentence for each. Mirrored from the frame, which stays the authority on
     * what is highlighted.
     */
    const selection = yield* state(
      'selection',
      initialSelection(),
      ({ set }) => ({
        replaceFromFrame: (paths: readonly string[]) => set(paths),
        clearFromNavigation: on$(navigation$, () => set([])),
        clearFromDecision: on$(decisionSubmitted$, () => set([])),
        clearFromRegeneration: on$(regenerationConfirmed$, () => set([])),
      }),
    );
    const regenerationDialogOpen = yield* state(
      'regenerationDialogOpen',
      false,
      ({ set }) => ({
        openFromRequest: on$(regenerationDialogRequested$, () => set(true)),
        closeFromCancel: on$(regenerationDialogClosed$, () => set(false)),
        closeFromConfirmation: on$(regenerationConfirmed$, () => set(false)),
      }),
    );
    const iterationDialogOpen = yield* state(
      'iterationDialogOpen',
      false,
      ({ set }) => ({
        openFromRequest: on$(iterationDialogRequested$, () => set(true)),
        closeFromCancel: on$(iterationDialogClosed$, () => set(false)),
      }),
    );
    const iterationPreparationStarted = yield* state(
      'iterationPreparationStarted',
      false,
      ({ set }) => ({
        beginFromConfirmation: on$(iterationHandoffRequested$, () => set(true)),
        resetFromDialog: on$(iterationDialogRequested$, () => set(false)),
      }),
    );
    const iterationPromptCopied = yield* state(
      'iterationPromptCopied',
      false,
      ({ set }) => ({
        markCopied: () => set(true),
        resetFromPreparation: on$(iterationHandoffRequested$, () => set(false)),
        resetFromDialog: on$(iterationDialogRequested$, () => set(false)),
      }),
    );
    /** The rubber band being dragged, in the frame's own coordinates. */
    const band = yield* state(
      'band',
      undefined as
        | { x: number; y: number; width: number; height: number }
        | undefined,
      ({ set }) => ({
        show: (
          rect:
            | { x: number; y: number; width: number; height: number }
            | undefined,
        ) => set(rect),
      }),
    );

    // Callable from inside the frozen frame: a craftMethod is a plain function
    // that drives its own generator, which is what lets a listener living in
    // another document write back into this component's state.
    const selectNodes = craftMethod(
      'selectNodes',
      function* (paths: readonly string[]) {
        yield* selection.replaceFromFrame(paths);
        trackSelection(paths);
      },
    );
    const showBand = craftMethod(
      'showBand',
      function* (
        rect:
          | { x: number; y: number; width: number; height: number }
          | undefined,
      ) {
        yield* band.show(rect);
      },
    );
    // Replaced on every re-mark. Without it each toggle of the page chrome
    // added another listener, and one click produced two selections.
    let stopPicking: (() => void) | undefined;

    /**
     * Where the caret was in the reason.
     *
     * Remembered because the gestures that insert a reference all take focus
     * away first — the right-click happens inside the frozen frame, the button
     * takes focus on mousedown — so by the time the insertion runs there is no
     * live selection left to insert into.
     */
    let caret: Range | undefined;
    /**
     * The reference the current selection is still writing.
     *
     * Selecting drops the reference by itself, and refining the selection
     * edits that same one rather than adding a second — otherwise a click
     * followed by a ctrl-click would leave a stale "1 node" behind the "2
     * nodes" that replaced it. Typing ends the session: the reference is part
     * of a sentence now, and the next selection starts a new one.
     */
    let livePick: number | undefined;

    const publishMentionEdit = (
      nextMentions: readonly Mention[],
      nextNote: string,
    ): void => {
      mentionEdited$.emit({ mentions: nextMentions, note: nextNote });
    };

    /**
     * Fits the frozen page to the window, by drawing it smaller.
     *
     * `transform`, never a width: the frame has to stay exactly the viewport
     * the page laid itself out in, or the replay stops being the render that
     * was measured and the fidelity check says so. A transform changes what is
     * painted and nothing about what was measured — `getBoundingClientRect`
     * inside the frame is in the frame's own coordinates either way.
     *
     * The band is inside the scaled box rather than beside it, so a rectangle
     * dragged in frame coordinates lands where the pointer was.
     */
    let fitReplay = true;
    const applyReplayScale = (): void => {
      const frame = reviewDocument.getElementById(FRAME_ID);
      if (!(frame instanceof HTMLIFrameElement)) return;
      const box = frame.closest('.replay-scale');
      const holder = frame.closest('.replay-holder');
      const canvas = frame.closest('.evidence-canvas');
      if (
        !(box instanceof HTMLElement) ||
        !(holder instanceof HTMLElement) ||
        !(canvas instanceof HTMLElement)
      ) {
        return;
      }
      const width = Number(frame.getAttribute('width')) || frame.offsetWidth;
      const height = Number(frame.getAttribute('height')) || frame.offsetHeight;
      if (!width || !height) return;
      // The canvas' own padding, which the frame may not take.
      const style = globalThis.getComputedStyle(canvas);
      const room =
        canvas.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      const headroom =
        canvas.clientHeight -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom) -
        // The caption sits under the frame in the same box.
        56;
      // Never above 1: a small capture blown up is a blurrier picture of the
      // same thing, and every judgement about it would be about the blur.
      const scale = fitReplay
        ? Math.min(1, room / width, Math.max(headroom, 120) / height)
        : 1;
      box.style.transform = scale === 1 ? '' : `scale(${scale})`;
      holder.style.width = `${Math.round(width * scale)}px`;
      holder.style.height = `${Math.round(height * scale)}px`;
    };
    let watchingWindow = false;
    const watchWindowSize = (): void => {
      if (watchingWindow) return;
      watchingWindow = true;
      globalThis.addEventListener('resize', applyReplayScale);
    };
    const reasonField = (): HTMLElement | undefined => {
      const field = reviewDocument.getElementById(NOTE_ID);
      return field instanceof HTMLElement ? field : undefined;
    };
    const rememberCaret = (): void => {
      const field = reasonField();
      const selection = reviewDocument.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
      if (field && range && field.contains(range.commonAncestorContainer)) {
        caret = range.cloneRange();
      }
    };
    /**
     * Ends the current pointing session.
     *
     * A function rather than the variable itself: the template is a separate
     * top-level function, so it can only be handed values through the bindings
     * — and a copied `undefined` would set nothing.
     */
    const freezePick = (): void => {
      livePick = undefined;
    };
    const clearReason = (): void => {
      const field = reasonField();
      if (field) field.replaceChildren();
      caret = undefined;
      livePick = undefined;
    };

    /**
     * Measures the replay the reviewer is actually looking at.
     *
     * Not the capture machine's verdict on it: a document that was faithful in
     * CI and is not faithful here would otherwise be judged as though it were
     * the original. The check runs on load, on this screen, every time.
     */
    const inspect = yield* asyncProcess('inspectReplay', {
      method: (payload: {
        readonly frame: HTMLIFrameElement;
        readonly target: string;
        readonly evidence?: string;
        readonly attested: readonly string[];
        readonly changed: readonly string[];
        readonly occluded: readonly string[];
        readonly hideChrome: boolean;
        readonly selected: readonly string[];
        readonly colorScheme?: 'light' | 'dark' | 'no-preference';
      }) => payload,
      loader: function* ({ params }) {
        const view = viewOf(params.frame);
        if (!view) {
          return {
            loaded: false,
            faithful: false,
            reason: undefined,
            report: [],
            chrome: [],
          };
        }
        // Fonts first: a box measured before its face arrives carries the
        // fallback's metrics, and half a pixel on one span reads as an
        // unfaithful replay.
        yield* waitForReplayReady(view);

        // Measured before anything is drawn on it. The marking is meant to be
        // layout-neutral, but "meant to be" is not a guarantee, and a check
        // that runs after its own annotations is checking the annotations.
        const attested = params.evidence
          ? yield* craftUntilSettled(
              CraftHttpClient.get(({ response }) => ({
                url: `/api/digest/${encodeURIComponent(params.evidence ?? '')}`,
                success: response<LayoutDigest>(),
              })),
            )
          : undefined;
        const fidelity = attested
          ? checkReplay(view, params.target, attested, {
              tolerance: REVIEW_TOLERANCE,
            })
          : undefined;

        const chrome = markTiers(view, {
          root: params.target,
          attested: params.attested,
          changed: params.changed,
          occluded: params.occluded,
          dimDecor: true,
          hideChrome: params.hideChrome,
        });
        // Re-applied after the marking, which rebuilds the frame's
        // annotations: lifting the page's chrome must not silently drop the
        // nodes the reviewer had already pointed at.
        markSelection(view, params.selected);
        applyReplayScale();
        watchWindowSize();
        stopPicking?.();
        stopPicking = onPick(view, selectNodes, { onBand: showBand });

        return {
          loaded: true,
          faithful: fidelity?.faithful ?? false,
          reason: fidelity?.reason,
          report: fidelity?.report ?? [],
          chrome,
        };
      },
    });

    const decision = yield* mutation('reviewDecision', {
      method: decisionSubmitted$.value,
      loader: function* ({ params }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/decisions',
          payload: params,
          success: response<ReviewApiQueue>(),
        }));
      },
    });

    const reopen = yield* mutation('reopenReviewDecision', {
      method: decisionReopened$.value,
      loader: function* ({ params }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/decisions/reopen',
          payload: params,
          success: response<ReviewApiQueue>(),
        }));
      },
    });

    const regenerate = yield* mutation('regenerateEvidence', {
      method: regenerationConfirmed$.value,
      loader: function* () {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/regenerate',
          payload: {},
          success: response<ReviewApiQueue>(),
        }));
      },
    });

    const iterationHandoff = yield* mutation('iterationHandoff', {
      method: iterationHandoffRequested$.value,
      loader: function* () {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/iteration-handoff',
          payload: {},
          success: response<ReviewIterationHandoffResponse>(),
        }));
      },
    });

    const { closeReview, closeReviewSession, closeReviewFailed } =
      yield* CloseReview();

    // Infer the query before delegating to it: combining both expressions can
    // exceed TypeScript's union complexity limit when this file is checked first.
    const reviewQueue = query(
      'reviewQueue',
      {
        params: () => true,
        loader: function* () {
          return yield* CraftHttpClient.get(({ response }) => ({
            url: '/api/review',
            success: response<ReviewApiQueue>(),
          }));
        },
      },
      insertQueryPipe(
        insertReactOnMutation(decision, {
          update: ({ queryResource, mutationResource }) =>
            mutationResource.value() ??
            queryResource.value() ?? {
              items: 0,
              decisions: 0,
              cards: [],
              visualAssets: [],
              visualTests: [],
              templateObligations: [],
              diagnostics: [],
              history: [],
            },
        }),
        insertReactOnMutation(reopen, {
          update: ({ queryResource, mutationResource }) =>
            mutationResource.value() ??
            queryResource.value() ?? {
              items: 0,
              decisions: 0,
              cards: [],
              visualAssets: [],
              visualTests: [],
              templateObligations: [],
              diagnostics: [],
              history: [],
            },
        }),
        insertReactOnMutation(regenerate, {
          update: ({ queryResource, mutationResource }) =>
            mutationResource.value() ??
            queryResource.value() ?? {
              items: 0,
              decisions: 0,
              cards: [],
              visualAssets: [],
              visualTests: [],
              templateObligations: [],
              diagnostics: [],
              history: [],
            },
        }),
        insertReactOnMutation(iterationHandoff, {
          // The handoff writes files and returns its prompt; it does not change
          // the attestation queue. Still react declaratively so this mutation
          // participates in the same resource graph as the other actions.
          update: ({ queryResource }) =>
            queryResource.value() ?? {
              items: 0,
              decisions: 0,
              cards: [],
              visualAssets: [],
              visualTests: [],
              templateObligations: [],
              diagnostics: [],
              history: [],
            },
        }),
        insertReactOnMutation(closeReview, {
          // Closing writes the iteration handoff, so keep the queue resource
          // in the same declarative mutation graph even though the response
          // itself is not a queue payload.
          update: ({ queryResource }) =>
            queryResource.value() ?? {
              items: 0,
              decisions: 0,
              cards: [],
              visualAssets: [],
              visualTests: [],
              templateObligations: [],
              diagnostics: [],
              history: [],
            },
        }),
      ),
    );

    const review = yield* reviewQueue;

    const sessionHistory = craftComputed('sessionHistory', function* () {
      return (yield* review.value())?.history ?? [];
    });
    const reopenFailed = craftComputed('reopenFailed', function* () {
      return (yield* reopen.status()) === 'exception';
    });

    const cards = craftComputed('cards', function* () {
      // Filters describe the inventory views. The review queue is already the
      // actionable subset, so a filter selected elsewhere must not silently
      // hide decisions when the filters are not on screen.
      if ((yield* devtoolView()) === 'review') {
        return (yield* review.value())?.cards ?? [];
      }
      const component = (yield* componentFilter()).trim().toLowerCase();
      const text = (yield* textFilter()).trim().toLowerCase();
      const kind = yield* kindFilter();
      const state = yield* stateFilter();
      const direction = yield* directionFilter();
      return ((yield* review.value())?.cards ?? []).filter((card) => {
        if (kind !== 'all' && card.kind !== kind) return false;
        if (state !== 'all' && card.state !== state) return false;
        if (direction !== 'all') {
          const cardDirection =
            card.kind === 'template'
              ? card.direction
              : card.kind === 'removal'
                ? card.previousEvidence?.direction
                : undefined;
          if (cardDirection !== direction) return false;
        }
        if (
          component &&
          !card.reviewMembers.some((member) =>
            member.label.toLowerCase().includes(component),
          )
        ) {
          return false;
        }
        if (text) {
          const searchable = [
            card.subject,
            card.reason,
            ...card.changes,
            ...(card.kind === 'template' ? [card.statement] : []),
          ]
            .join(' ')
            .toLowerCase();
          if (!searchable.includes(text)) return false;
        }
        return true;
      });
    });
    const visualAssets = craftComputed('visualAssets', function* () {
      if ((yield* kindFilter()) !== 'all' && (yield* kindFilter()) !== 'visual')
        return [];
      if (
        (yield* directionFilter()) !== 'all' ||
        (yield* stateFilter()) !== 'all'
      )
        return [];
      const component = (yield* componentFilter()).trim().toLowerCase();
      const text = (yield* textFilter()).trim().toLowerCase();
      return ((yield* review.value())?.visualAssets ?? []).filter((asset) => {
        const scenarios = asset.scenarios.join(' ').toLowerCase();
        return (
          (!component || scenarios.includes(component)) &&
          (!text ||
            `${asset.evidence} ${scenarios}`.toLowerCase().includes(text))
        );
      });
    });
    const visualTests = craftComputed('visualTests', function* () {
      if ((yield* kindFilter()) !== 'all' && (yield* kindFilter()) !== 'visual')
        return [];
      if ((yield* directionFilter()) !== 'all') return [];
      const component = (yield* componentFilter()).trim().toLowerCase();
      const text = (yield* textFilter()).trim().toLowerCase();
      const state = yield* stateFilter();
      return ((yield* review.value())?.visualTests ?? []).filter(
        (test) =>
          (state === 'all' || test.state === state) &&
          (!component || test.component.toLowerCase().includes(component)) &&
          (!text ||
            `${test.subject} ${test.scenario}`.toLowerCase().includes(text)),
      );
    });
    const selectedVisualTest = craftComputed(
      'selectedVisualTest',
      function* () {
        const list = yield* visualTests();
        if (list.length === 0) return undefined;
        const scenario = yield* navigationParams.scenario();
        return (
          list.find(
            (test) => test.subject === scenario || test.scenario === scenario,
          ) ?? list[0]
        );
      },
    );
    const selectedVisualAsset = craftComputed(
      'selectedVisualAsset',
      function* () {
        const test = yield* selectedVisualTest();
        if (!test) return undefined;
        return (yield* review.value())?.visualAssets.find(
          (asset) => asset.evidence === test.evidence,
        );
      },
    );
    const visualReviewCard = craftComputed('visualReviewCard', function* () {
      const test = yield* selectedVisualTest();
      if (!test) return undefined;
      return (yield* review.value())?.cards.find(
        (card) =>
          card.kind === 'visual' &&
          card.reviewMembers.some((member) => member.subject === test.subject),
      );
    });
    const templateObligations = craftComputed(
      'templateObligations',
      function* () {
        if (
          (yield* kindFilter()) !== 'all' &&
          (yield* kindFilter()) !== 'template'
        )
          return [];
        const component = (yield* componentFilter()).trim().toLowerCase();
        const text = (yield* textFilter()).trim().toLowerCase();
        const state = yield* stateFilter();
        const direction = yield* directionFilter();
        return ((yield* review.value())?.templateObligations ?? []).filter(
          (obligation) =>
            (state === 'all' || obligation.state === state) &&
            (direction === 'all' || obligation.direction === direction) &&
            (!component ||
              obligation.component.toLowerCase().includes(component)) &&
            (!text ||
              `${obligation.subject} ${obligation.statement}`
                .toLowerCase()
                .includes(text)),
        );
      },
    );
    const activeIndex = craftComputed('activeIndex', function* () {
      const list = yield* cards();
      if (list.length === 0) return 0;
      const scenario = yield* navigationParams.scenario();
      if (!scenario) return 0;
      const index = list.findIndex((card) => card.shape === scenario);
      return index >= 0 ? index : 0;
    });
    const current = craftComputed('current', function* () {
      const list = yield* cards();
      return list[yield* activeIndex()];
    });
    const visualEvidence = craftComputed('visualEvidence', function* () {
      return (yield* current())?.kind === 'visual';
    });
    /** Every sentence, in the language on screen. */
    const t = craftComputed('t', function* () {
      return MESSAGES[yield* locale()];
    });
    const chooseZoom = craftMethod('chooseZoom', function* (mode: ZoomMode) {
      yield* zoom.choose(mode);
      fitReplay = mode === 'fit';
      applyReplayScale();
    });
    const openRegenerationDialog = craftMethod(
      'openRegenerationDialog',
      function* () {
        regenerationDialogRequested$.emit();
      },
    );
    const closeRegenerationDialog = craftMethod(
      'closeRegenerationDialog',
      function* () {
        regenerationDialogClosed$.emit();
      },
    );
    const confirmRegeneration = craftMethod(
      'confirmRegeneration',
      function* () {
        yield* navigationParams.setScenarioAfterRegeneration('');
        regenerationConfirmed$.emit('regenerate');
        clearReason();
      },
    );
    const openIterationDialog = craftMethod(
      'openIterationDialog',
      function* () {
        iterationDialogRequested$.emit();
      },
    );
    const closeIterationDialog = craftMethod(
      'closeIterationDialog',
      function* () {
        iterationDialogClosed$.emit();
      },
    );
    const confirmIterationHandoff = craftMethod(
      'confirmIterationHandoff',
      function* () {
        iterationHandoffRequested$.emit(++iterationHandoffRequest);
      },
    );
    const copyIterationPrompt = craftMethod(
      'copyIterationPrompt',
      function* () {
        const value = yield* iterationHandoff.value();
        if (!value) return;
        const clipboard = reviewClipboard();
        if (clipboard)
          void clipboard.writeText(value.prompt).catch(() => undefined);
        const field = reviewDocument.getElementById('iteration-prompt');
        if (field instanceof HTMLTextAreaElement) {
          field.focus();
          field.select();
        }
        yield* iterationPromptCopied.markCopied();
      },
    );
    const chooseDevtoolView = craftMethod(
      'chooseDevtoolView',
      function* (value: DevtoolView) {
        yield* navigationParams.setViewForDevtoolChoice(value);
      },
    );
    const selectVisualTest = craftMethod(
      'selectVisualTest',
      function* (index: number) {
        const test = (yield* visualTests())[index];
        if (!test) return;
        yield* navigationParams.setScenarioForVisualTestSelection(test.subject);
      },
    );
    const openVisualReview = craftMethod('openVisualReview', function* () {
      const card = yield* visualReviewCard();
      if (!card) return;
      yield* navigationParams.setViewForVisualReview('review');
      yield* navigationParams.setScenarioForVisualReview(card.shape);
    });
    const hasNote = craftComputed('hasNote', function* () {
      // The prose, not the raw field: a reason made only of group references
      // names what is wrong with nothing and explains nothing.
      return proseOf(yield* note()).length > 0;
    });
    /**
     * The groups this reason actually points at.
     *
     * Derived from the text every time rather than tracked alongside it. A
     * reviewer who deletes a token has removed that reference, and there is no
     * second list left holding a claim the reason no longer makes.
     */
    const activeMentions = craftComputed('activeMentions', function* () {
      const text = yield* note();
      return (yield* mentions()).filter((mention) =>
        mentionPattern(mention.id).test(text),
      );
    });
    const findings = craftComputed('findings', function* () {
      const text = yield* note();
      return (yield* activeMentions()).flatMap((mention) =>
        mention.paths.map(
          (path): Finding => ({
            path,
            note: noteForMention(text, mention.id),
          }),
        ),
      );
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
        ({
          loaded: false,
          faithful: false,
          reason: undefined,
          report: [],
          chrome: [],
        } satisfies ReplayState)
      );
    });
    const showingReplay = craftComputed('showingReplay', function* () {
      if (!(yield* canReplay())) return false;
      const chosen = yield* evidenceView();
      if (chosen !== 'auto') return chosen === 'replay';
      // Unpinned: the page, unless it has already failed its own check. While
      // the check is still running `loaded` is false and the page stays up, so
      // the reviewer sees the render rather than a flash of photograph.
      const state = yield* replay();
      return !state.loaded || state.faithful;
    });
    /** Was this reviewer sent to the photograph rather than choosing it? */
    const fellBack = craftComputed('fellBack', function* () {
      const state = yield* replay();
      return (
        (yield* canReplay()) &&
        (yield* evidenceView()) === 'auto' &&
        state.loaded &&
        !state.faithful
      );
    });
    /**
     * Whether this verdict would be reached without a faithful replay.
     *
     * Recorded on the attestation, because judging a photograph is a different
     * claim from judging the document: the reviewer could not lift the page's
     * own chrome to see what it was covering.
     */
    /**
     * How many attested nodes the page's own chrome is sitting on.
     *
     * In the label, not only in a tooltip: a control named "hide overlays"
     * asks the reviewer to guess whether there is anything to hide, and the
     * capture already knows the answer.
     */
    const coveredCount = craftComputed('coveredCount', function* () {
      return (yield* member())?.metadata?.coverage?.occluded ?? 0;
    });
    /**
     * The fidelity finding as a sentence, in the reviewer's language.
     *
     * `undefined` covers two different silences: the frame would not open, and
     * there is no attested digest to check against. Both leave the decision
     * degraded, and both have to say which.
     */
    const fidelitySentence = craftComputed('fidelitySentence', function* () {
      const state = yield* replay();
      const say = yield* t();
      if (!state.reason) {
        return state.loaded ? say.fidelityNoDigest : say.fidelityFrameUnopened;
      }
      switch (state.reason.kind) {
        case 'faithful':
          return say.fidelityFaithful;
        case 'empty':
          return say.fidelityEmpty;
        case 'no-root':
          return say.fidelityNoRoot(state.reason.root);
        case 'absent':
          return say.fidelityAbsent(state.reason.count);
        case 'moved':
          return say.fidelityMoved(state.reason.count);
      }
    });
    /** What this replay would lift, named from the replay itself. */
    const chrome = craftComputed('chrome', function* () {
      return (yield* replay()).chrome;
    });
    /**
     * The control says what it does; the explanation says what to.
     *
     * `Hide button.clear-cache-btn` named the right thing in the wrong place:
     * a class selector out of one application, sitting in a control every
     * application generated with CraftTS gets. The name is read from the
     * replay either way — nothing here is specific to a project — but it
     * belongs in the sentence that explains the control, not in its label.
     */
    const overlayLabel = craftComputed('overlayLabel', function* () {
      const say = yield* t();
      return (yield* hideChrome()) ? say.drop : say.lift;
    });
    const overlayHint = craftComputed('overlayHint', function* () {
      const covering = yield* chrome();
      const say = yield* t();
      return covering.length === 1
        ? say.liftHint(covering[0] ?? '')
        : say.liftHintMany(covering.length);
    });
    const degraded = craftComputed('degraded', function* () {
      if ((yield* current())?.kind !== 'visual') return false;
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
    const regenerationAvailable = craftComputed(
      'regenerationAvailable',
      function* () {
        return (yield* review.value())?.regeneration !== undefined;
      },
    );
    const iterationHandoffAvailable = craftComputed(
      'iterationHandoffAvailable',
      function* () {
        return (yield* review.value())?.iteration !== undefined;
      },
    );
    const iterationHandoffFailed = craftComputed(
      'iterationHandoffFailed',
      function* () {
        return (yield* iterationHandoff.status()) === 'exception';
      },
    );
    const iterationPreparationNotStarted = craftComputed(
      'iterationPreparationNotStarted',
      function* () {
        return !(yield* iterationPreparationStarted());
      },
    );
    const iterationHandoffReady = craftComputed(
      'iterationHandoffReady',
      function* () {
        return (
          (yield* iterationPreparationStarted()) &&
          !(yield* iterationHandoff.isLoading()) &&
          Boolean(yield* iterationHandoff.value())
        );
      },
    );
    const previousRegenerationDecisions = craftComputed(
      'previousRegenerationDecisions',
      function* () {
        return (yield* review.value())?.regeneration?.previousDecisions ?? 0;
      },
    );
    const regenerationFailed = craftComputed(
      'regenerationFailed',
      function* () {
        return (yield* regenerate.status()) === 'exception';
      },
    );
    const rejectionReasonMissing = craftComputed(
      'rejectionReasonMissing',
      function* () {
        return (yield* rejectionAttempted()) && !(yield* hasNote());
      },
    );
    const movePrevious = craftMethod('movePrevious', function* () {
      const index = yield* activeIndex();
      const nextIndex = Math.max(0, index - 1);
      const card = (yield* cards())[nextIndex];
      if (!card) return;
      clearReason();
      navigation$.emit(nextIndex);
      yield* navigationParams.setScenarioPrevious(card.shape);
    });
    const moveNext = craftMethod('moveNext', function* () {
      const list = yield* cards();
      const index = yield* activeIndex();
      const nextIndex = Math.min(Math.max(0, list.length - 1), index + 1);
      const card = list[nextIndex];
      if (!card) return;
      clearReason();
      navigation$.emit(nextIndex);
      yield* navigationParams.setScenarioNext(card.shape);
    });
    const selectCard = craftMethod('selectCard', function* (index: number) {
      const card = (yield* cards())[index];
      if (!card) return;
      clearReason();
      navigation$.emit(index);
      yield* navigationParams.setScenarioForCardSelection(card.shape);
    });
    const reopenDecision = craftMethod(
      'reopenDecision',
      function* (entry: ReviewSessionDecision) {
        clearReason();
        yield* navigationParams.setScenarioForReopenedDecision(
          entry.decision.shape,
        );
        decisionReopened$.emit({
          shape: entry.decision.shape,
          ...(entry.decision.id ? { id: entry.decision.id } : {}),
        });
      },
    );
    // A bare generator, composed by both methods below. A craftMethod is a
    // handler, not something another method calls.
    function* runInspection(chrome: boolean) {
      const frame = reviewDocument.getElementById(FRAME_ID);
      const active = yield* member();
      if (!(frame instanceof HTMLIFrameElement) || !active) return;
      yield* inspect.method({
        frame,
        target: yield* replayTarget(),
        ...(active.evidence ? { evidence: active.evidence } : {}),
        attested: active.attested,
        changed: active.changed,
        occluded: (active.metadata?.occluded ?? []).map((entry) => entry.path),
        hideChrome: chrome,
        selected: yield* selection(),
        ...(active.metadata?.colorScheme
          ? { colorScheme: active.metadata.colorScheme }
          : {}),
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
    /**
     * Drops a reference to the current selection where the reviewer is typing.
     *
     * At the caret, not appended: the point of the token is that it sits in the
     * sentence that explains it, so a second complaint further down the reason
     * can name a different group without either of them losing its text.
     */
    /**
     * Keeps the reason's live reference in step with what is selected.
     *
     * Selecting *is* referencing — there is no second gesture. Refining a
     * selection edits the reference that is already there rather than adding
     * another, so a click followed by a ctrl-click leaves one reference saying
     * "2 nodes" instead of a stale "1 node" beside it. Emptying the selection
     * takes the reference back out, because a reference to nothing is worse
     * than none.
     */
    const trackSelection = craftMethod(
      'trackSelection',
      function* (paths: readonly string[]) {
        const field = reasonField();
        if (!field) return;
        const known = yield* mentions();

        const live =
          livePick === undefined
            ? undefined
            : field.querySelector<HTMLElement>(`[${MENTION_ID}="${livePick}"]`);

        if (paths.length === 0) {
          if (!live || livePick === undefined) return;
          // Take the surrounding space with it, or the sentence keeps a gap
          // where a reference used to be.
          const after = live.nextSibling;
          if (after?.nodeType === Node.TEXT_NODE && after.textContent === ' ') {
            after.remove();
          }
          const id = livePick;
          live.remove();
          livePick = undefined;
          publishMentionEdit(
            known.filter((one) => one.id !== id),
            textOf(field),
          );
          return;
        }

        if (live && livePick !== undefined) {
          const id = livePick;
          relabelChip(live, paths);
          publishMentionEdit(
            known.map((one) => (one.id === id ? { id, paths } : one)),
            textOf(field),
          );
          return;
        }

        const id =
          known.reduce((highest, one) => Math.max(highest, one.id), 0) + 1;

        // Placed where the reviewer was typing, so a second complaint further
        // down the reason names a different group without either losing its
        // text. With no remembered caret — the very first thing they do is
        // point — it goes at the end.
        const at = reviewDocument.createRange();
        if (caret && field.contains(caret.commonAncestorContainer)) {
          at.setStart(caret.startContainer, caret.startOffset);
          at.setEnd(caret.endContainer, caret.endOffset);
        } else {
          at.selectNodeContents(field);
          at.collapse(false);
        }
        at.deleteContents();

        // A space on each side, including at the very end: the reviewer keeps
        // typing straight after inserting, and without it the next word ran
        // into the reference.
        const trail = reviewDocument.createTextNode(' ');
        at.insertNode(trail);
        const chip = chipFor(reviewDocument, id, paths);
        at.insertNode(chip);
        const previous = chip.previousSibling?.textContent ?? '';
        if (previous && !/\s$/.test(previous)) {
          chip.parentNode?.insertBefore(
            reviewDocument.createTextNode(' '),
            chip,
          );
        }

        const after = reviewDocument.createRange();
        after.setStartAfter(trail);
        after.collapse(true);
        // Not `selection`: that name is a craft state in this component, and
        // shadowing it once turned `selection.clear()` into a call on the
        // DOM's own Selection, which has no such method.
        const domSelection = reviewDocument.getSelection();
        domSelection?.removeAllRanges();
        domSelection?.addRange(after);
        caret = after.cloneRange();
        livePick = id;

        publishMentionEdit([...known, { id, paths }], textOf(field));
        // Focus follows the reference, once, when it appears: the next thing
        // to do is say what is wrong with it. Not on every refinement — the
        // caret would jump while the reviewer is still pointing.
        field.focus();
      },
    );

    /** Paints the nodes a reference stands for, while it is pointed at. */
    const previewMention = craftMethod(
      'previewMention',
      function* (id: number | undefined) {
        const holder = reviewDocument.getElementById(FRAME_ID);
        const view =
          holder instanceof HTMLIFrameElement ? viewOf(holder) : undefined;
        if (!view) return;
        const found =
          id === undefined
            ? undefined
            : (yield* mentions()).find((one) => one.id === id);
        markHighlight(view, found?.paths ?? []);
      },
    );

    const decide = craftMethod('decide', function* (verdict: DecisionVerdict) {
      const card = yield* current();
      if (!card) return;
      // Recorded as prose. The tokens are scaffolding for writing the reason;
      // what is attested is the sentence, plus the addresses it pointed at.
      const writtenNote = proseOf(yield* note());
      if (verdict === 'rejected' && writtenNote.length === 0) {
        yield* rejectionAttempted.showForRejectedDecision();
        reviewDocument.getElementById(NOTE_ID)?.focus();
        return;
      }
      const pointed = yield* findings();
      decisionSubmitted$.emit({
        shape: card.shape,
        id: card.id,
        revision: card.revision,
        verdict,
        ...(writtenNote ? { note: writtenNote } : {}),
        ...(pointed.length > 0 ? { findings: pointed } : {}),
        ...((yield* degraded()) ? { degraded: true } : {}),
      });
      // The field owns its own content, so emptying the state is not enough.
      clearReason();
    });

    const retire = craftMethod('retire', function* () {
      const card = yield* current();
      if (!card || card.kind !== 'removal') return;
      const writtenNote = proseOf(yield* note());
      if (!writtenNote) {
        yield* rejectionAttempted.showForRetirement();
        reviewDocument.getElementById(NOTE_ID)?.focus();
        return;
      }
      decisionSubmitted$.emit({
        shape: card.shape,
        id: card.id,
        revision: card.revision,
        verdict: 'retire',
        retirementReason: yield* retirementReason(),
        note: writtenNote,
      });
      clearReason();
    });

    return {
      review,
      decision,
      reopen,
      regenerate,
      iterationHandoff,
      closeReview,
      cards,
      visualAssets,
      visualTests,
      selectedVisualTest,
      selectedVisualAsset,
      visualReviewCard,
      templateObligations,
      activeIndex,
      current,
      visualEvidence,
      sessionHistory,
      zoom,
      note,
      hasNote,
      rejectionReasonMissing,
      reviewFailed,
      decisionFailed,
      reopenFailed,
      regenerationAvailable,
      iterationHandoffAvailable,
      iterationHandoffFailed,
      iterationPreparationNotStarted,
      iterationHandoffReady,
      closeReviewFailed,
      regenerationDialogOpen,
      iterationDialogOpen,
      iterationPreparationStarted,
      iterationPromptCopied,
      previousRegenerationDecisions,
      regenerationFailed,
      openRegenerationDialog,
      closeRegenerationDialog,
      confirmRegeneration,
      openIterationDialog,
      closeIterationDialog,
      confirmIterationHandoff,
      closeReviewSession,
      copyIterationPrompt,
      movePrevious,
      moveNext,
      selectCard,
      reopenDecision,
      decide,
      retire,
      devtoolView,
      chooseDevtoolView,
      selectVisualTest,
      openVisualReview,
      evidenceView,
      findings,
      hideChrome,
      member,
      canReplay,
      replay,
      showingReplay,
      fellBack,
      chrome,
      selection,
      band,
      degraded,
      coveredCount,
      overlayLabel,
      overlayHint,
      inspectFrame,
      toggleChrome,
      mentions,
      activeMentions,
      previewMention,
      rememberCaret,
      freezePick,
      chooseZoom,
      locale,
      t,
      fidelitySentence,
    };
  }),
  ({
    review,
    decision,
    reopen,
    regenerate,
    iterationHandoff,
    closeReview,
    cards,
    visualAssets,
    visualTests,
    selectedVisualTest,
    selectedVisualAsset,
    visualReviewCard,
    templateObligations,
    activeIndex,
    sessionHistory,
    zoom,
    note,
    hasNote,
    rejectionReasonMissing,
    reviewFailed,
    decisionFailed,
    reopenFailed,
    regenerationAvailable,
    iterationHandoffAvailable,
    iterationHandoffFailed,
    iterationPreparationNotStarted,
    iterationHandoffReady,
    closeReviewFailed,
    regenerationDialogOpen,
    iterationDialogOpen,
    iterationPromptCopied,
    previousRegenerationDecisions,
    regenerationFailed,
    openRegenerationDialog,
    closeRegenerationDialog,
    confirmRegeneration,
    openIterationDialog,
    closeIterationDialog,
    confirmIterationHandoff,
    closeReviewSession,
    copyIterationPrompt,
    movePrevious,
    moveNext,
    selectCard,
    reopenDecision,
    decide,
    retire,
    devtoolView,
    chooseDevtoolView,
    selectVisualTest,
    openVisualReview,
    current,
    visualEvidence,
    evidenceView,
    rememberCaret,
    freezePick,
    previewMention,
    chooseZoom,
    locale,
    t,
    fidelitySentence,
    hideChrome,
    member,
    coveredCount,
    canReplay,
    replay,
    showingReplay,
    fellBack,
    chrome,
    selection,
    band,
    degraded,
    overlayLabel,
    overlayHint,
    inspectFrame,
    toggleChrome,
  }) =>
    div({ class: 'app-shell' }, [
      ifNode(reviewFailed, () =>
        p({ class: 'notice error', role: 'alert' }, function* () {
          return (yield* t()).queueFailed;
        }),
      ),
      ifNode(decisionFailed, () =>
        p({ class: 'notice error', role: 'alert' }, function* () {
          return (yield* t()).decisionFailed;
        }),
      ),
      ifNode(reopenFailed, () =>
        p({ class: 'notice error', role: 'alert' }, function* () {
          return (yield* t()).reopenFailed;
        }),
      ),
      ifNode(regenerationFailed, () =>
        p({ class: 'notice error', role: 'alert' }, function* () {
          return (yield* t()).regenerationFailed;
        }),
      ),
      ifNode(iterationHandoffFailed, () =>
        p({ class: 'notice error', role: 'alert' }, function* () {
          return (yield* t()).iterationHandoffFailed;
        }),
      ),
      ifNode(closeReviewFailed, () =>
        p({ class: 'notice error', role: 'alert' }, function* () {
          return (yield* t()).closeReviewFailed;
        }),
      ),
      div(
        {
          class: 'workspace',
          inert: function* () {
            return (
              (yield* regenerationDialogOpen()) ||
              (yield* iterationDialogOpen())
            );
          },
        },
        [
          aside({ class: 'queue-panel', 'aria-label': 'Review queue' }, [
            // In the sidebar rather than across the top. A full-width banner
            // repeating the name of the tool cost a band of height on every
            // card, and height is the thing a tall capture has none of.
            header({ class: 'panel-heading brand' }, [
              small({ class: 'eyebrow' }, function* () {
                return (yield* t()).brand;
              }),
              heading(function* () {
                const queue = yield* review.value();
                const unified =
                  (queue?.templateObligations.length ?? 0) > 0 ||
                  queue?.cards.some((card) => card.kind !== 'visual');
                const say = yield* t();
                return unified ? say.attestationTitle : say.appTitle;
              }),
              div(
                { class: 'queue-summary', 'aria-live': 'polite' },
                function* () {
                  const queue = yield* review.value();
                  return (yield* t()).queueSummary(
                    queue?.items ?? 0,
                    queue?.decisions ?? 0,
                  );
                },
              ),
              ifNode(regenerationAvailable, () =>
                button(
                  'OpenRegenerationDialog',
                  {
                    type: 'button',
                    class: 'regeneration-trigger',
                    disabled: regenerate.isLoading,
                    click: openRegenerationDialog,
                  },
                  [
                    span({ 'aria-hidden': 'true' }, '↻'),
                    function* () {
                      return (yield* regenerate.isLoading())
                        ? (yield* t()).regeneratingEvidence
                        : (yield* t()).regenerateEvidence;
                    },
                  ],
                ),
              ),
              ifNode(iterationHandoffAvailable, () =>
                button(
                  'GenerateIterationHandoff',
                  {
                    type: 'button',
                    class: 'iteration-trigger',
                    disabled: iterationHandoff.isLoading,
                    click: openIterationDialog,
                  },
                  [
                    span({ 'aria-hidden': 'true' }, '↗'),
                    function* () {
                      return (yield* t()).iterationHandoff;
                    },
                  ],
                ),
              ),
              // The two choices about the tool rather than about a render. In
              // the sidebar with the name, because neither belongs beside the
              // evidence: a reviewer sets them once and then judges renders.
              ThemeLocalePicker({}),
            ]),
            div(
              {
                class: 'view-tabs',
                role: 'navigation',
                'aria-label': function* () {
                  return (yield* t()).viewNavigation;
                },
              },
              [
                div({ class: 'view-tabs-heading' }, [
                  heading(function* () {
                    return (yield* t()).viewNavigation;
                  }),
                  small(function* () {
                    return (yield* t()).viewNavigationDescription;
                  }),
                ]),
                ViewTabs({
                  devtoolView,
                  chooseDevtoolView,
                  visualTestsCount: function* () {
                    return (yield* visualTests()).length;
                  },
                  templateObligationsCount: function* () {
                    return (yield* templateObligations()).length;
                  },
                  cardsCount: function* () {
                    return (yield* cards()).length;
                  },
                  t,
                }),
              ],
            ),
            section(
              {
                class: 'shared-filters',
                hidden: function* () {
                  return (yield* devtoolView()) === 'review';
                },
                'aria-label': function* () {
                  return (yield* t()).filters;
                },
              },
              [
                div({ class: 'filters-heading' }, [
                  div([
                    heading(function* () {
                      return (yield* t()).filters;
                    }),
                    small(function* () {
                      return (yield* t()).filtersDescription;
                    }),
                  ]),
                  FilterBarActions({}),
                ]),
                FilterBarFields({}),
              ],
            ),
            div(
              {
                class: 'panel-heading review-navigation',
                hidden: function* () {
                  return (yield* devtoolView()) !== 'review';
                },
              },
              [
                heading(function* () {
                  return (yield* t()).queue;
                }),
                small(function* () {
                  return (yield* t()).queueSubtitle;
                }),
              ],
            ),
            div(
              {
                class: 'queue-list',
                hidden: function* () {
                  return (yield* devtoolView()) !== 'review';
                },
              },
              forNode(
                cards,
                {
                  track: (card) => card.shape,
                  empty: () =>
                    div({ class: 'empty-queue' }, [
                      strong(function* () {
                        return (yield* t()).reviewComplete;
                      }),
                      p(function* () {
                        return (yield* t()).reviewCompleteBody;
                      }),
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
                        yield* selectCard(index);
                      },
                    },
                    [
                      span({ class: 'scenario-name' }, function* () {
                        return scenarioOf((yield* card()).subject);
                      }),
                      small(function* () {
                        const value = yield* card();
                        return value.cluster.length > 1
                          ? (yield* t()).identicalChanges(value.cluster.length)
                          : reasonText(value.reason, yield* t());
                      }),
                    ],
                ),
              ),
            ),
            section(
              {
                class: 'review-history',
                hidden: function* () {
                  return (yield* sessionHistory()).length === 0;
                },
                'aria-label': function* () {
                  return (yield* t()).sessionHistoryTitle;
                },
              },
              [
                heading(function* () {
                  return (yield* t()).sessionHistoryTitle;
                }),
                small(function* () {
                  return (yield* t()).sessionHistoryDescription;
                }),
                ul(
                  forNode(
                    sessionHistory,
                    {
                      track: (entry) =>
                        `${entry.decision.shape}:${entry.decision.id ?? ''}`,
                    },
                    (entry, index) =>
                      li(
                        [
                          button(
                            'ReopenReviewDecision',
                            {
                              type: 'button',
                              disabled: reopen.isLoading,
                              class: 'history-item',
                              *click() {
                                yield* reopenDecision(yield* entry());
                              },
                            },
                            [
                              strong(function* () {
                                return `${index + 1}. ${scenarioOf((yield* entry()).card.subject)}`;
                              }),
                              small(function* () {
                                return (yield* t()).previousVerdict(
                                  (yield* entry()).decision.verdict,
                                );
                              }),
                              span({ class: 'history-action' }, function* () {
                                return (yield* reopen.isLoading())
                                  ? (yield* t()).reopeningDecision
                                  : (yield* t()).reopenDecision;
                              }),
                            ],
                          ),
                        ],
                      ),
                  ),
                ),
              ],
            ),
            div(
              {
                class: 'queue-navigation',
                hidden: function* () {
                  return (yield* devtoolView()) !== 'review';
                },
              },
              [
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
                  [
                    function* () {
                      return (yield* t()).previous;
                    },
                    span({ class: 'key' }, 'K'),
                  ],
                ),
                button(
                  'NextReviewCard',
                  {
                    type: 'button',
                    'data-hotkey': 'j',
                    disabled: function* () {
                      return (
                        (yield* activeIndex()) >= (yield* cards()).length - 1
                      );
                    },
                    click: moveNext,
                  },
                  [
                    function* () {
                      return (yield* t()).next;
                    },
                    span({ class: 'key' }, 'J'),
                  ],
                ),
              ],
            ),
          ]),
          main(
            {
              class: 'review-panel',
              hidden: function* () {
                return (yield* devtoolView()) !== 'review';
              },
            },
            // Keep one review card in the DOM. Rendering the complete queue and
            // hiding all but the active article left stale scenario content in
            // the central panel while a queue click was settling.
            forNode(
              function* () {
                const card = yield* current();
                return card ? [card] : [];
              },
              { track: (card) => card.shape },
              (card) =>
                article(
                  {
                    class: 'review-card',
                    'data-kind': function* () {
                      return (yield* card()).kind;
                    },
                  },
                  [
                  header({ class: 'review-heading' }, [
                    div([
                      small({ class: 'eyebrow' }, function* () {
                        return (yield* t()).scenario;
                      }),
                      heading(function* () {
                        return scenarioOf((yield* card()).subject);
                      }),
                      span({ class: 'subject code' }, function* () {
                        return componentOf((yield* card()).subject);
                      }),
                    ]),
                    span({ class: 'reason' }, function* () {
                      return reasonText((yield* card()).reason, yield* t());
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
                      return (yield* t()).clusterNotice(
                        (yield* card()).cluster.length,
                      );
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
                      heading(function* () {
                        return (yield* t()).clusterMembers;
                      }),
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
                  div({ class: 'evidence-column' }, [
                    section(
                      {
                        class: 'nonvisual-evidence',
                        hidden: function* () {
                          return (yield* card()).kind === 'visual';
                        },
                      },
                      [
                        heading(function* () {
                          const value = yield* card();
                          return value.kind === 'removal'
                            ? (yield* t()).removedPromise
                            : (yield* t()).currentPromise;
                        }),
                        p({ class: 'template-statement' }, [
                          span(
                            {
                              class: 'template-when',
                              hidden: function* () {
                                const value = yield* card();
                                return (
                                  value.kind !== 'template' ||
                                  !value.conditions ||
                                  value.conditions.length === 0
                                );
                              },
                            },
                            function* () {
                              const value = yield* card();
                              if (value.kind !== 'template') return '';
                              const say = yield* t();
                              return say.templateWhen(
                                conditionText(value.conditions ?? [], say),
                              );
                            },
                          ),
                          strong(function* () {
                            const value = yield* card();
                            if (value.kind === 'template') {
                              const say = yield* t();
                              return templateStatementOf(
                                value.statementParts,
                                value.statement,
                                say,
                                yield* locale(),
                              );
                            }
                            if (value.kind === 'removal') {
                              const proof = value.previousEvidence;
                              return proof
                                ? `${proof.element ?? 'template'}${proof.elementName ? ` "${proof.elementName}"` : ''} → ${proof.target}`
                                : (yield* t()).previousUnavailable;
                            }
                            return '';
                          }),
                        ]),
                        ul(
                          { class: 'template-diff' },
                          forNode(
                            function* () {
                              const value = yield* card();
                              return value.kind === 'template'
                                ? value.semanticDiff
                                : [];
                            },
                            { track: (change) => change.field },
                            (change) =>
                              li({ class: 'code' }, function* () {
                                const value = yield* change();
                                const say = yield* t();
                                return `${say.templateDiffField(value.field)}: ${value.before ?? say.templateValueMissing} → ${value.after ?? say.templateValueMissing}`;
                              }),
                          ),
                        ),
                        p({ class: 'template-warning' }, function* () {
                          const value = yield* card();
                          return value.kind !== 'visual' &&
                            value.previousEvidenceUnavailable
                            ? (yield* t()).previousUnavailable
                            : '';
                        }),
                        heading(function* () {
                          return (yield* t()).previousDecisionLabel;
                        }),
                        p(function* () {
                          const previous = (yield* card()).previousDecision;
                          return previous
                            ? `${(yield* t()).previousVerdict(previous.verdict)} · ${previous.by} · ${previous.at}${previous.note ? ` — ${previous.note}` : ''}`
                            : '—';
                        }),
                        heading(function* () {
                          return (yield* t()).codeChange;
                        }),
                        ul(
                          { class: 'code-leaves' },
                          forNode(
                            function* () {
                              const value = yield* card();
                              if (value.kind !== 'template') return [];
                              return [
                                ...value.codeDiff.removed.map((change) => ({
                                  line: `− ${change.leaf}`,
                                })),
                                ...value.codeDiff.added.map((change) => ({
                                  line: `+ ${change.leaf}`,
                                })),
                                ...value.codeDiff.changed.map((change) => ({
                                  line: `~ ${change.leaf}`,
                                })),
                              ];
                            },
                            { track: (change) => change.line },
                            (change) =>
                              li({ class: 'code' }, function* () {
                                return (yield* change()).line;
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
                          const say = yield* t();
                          return viewport
                            ? say.viewport(viewport.width, viewport.height)
                            : say.viewportUnknown;
                        }),
                        span({ class: 'chip' }, function* () {
                          const screenshot = (yield* card()).members[0]
                            ?.metadata?.screenshot;
                          const say = yield* t();
                          return screenshot
                            ? say.capture(screenshot.width, screenshot.height)
                            : say.captureUnknown;
                        }),
                        span({ class: 'chip' }, function* () {
                          return (
                            (yield* card()).members[0]?.metadata?.colorScheme ??
                            (yield* t()).schemeUnknown
                          );
                        }),
                        span({ class: 'chip' }, function* () {
                          const browser = (yield* card()).members[0]?.metadata
                            ?.browser;
                          return browser
                            ? `${browser.name} ${browser.version}`
                            : (yield* t()).browserUnknown;
                        }),
                        // What the verdict covers against what anybody could look
                        // at. Said out loud, on the same rule as `bulk`: an
                        // attestation must not claim a coverage it does not have.
                        // A subject nobody has attested, said once and small.
                        span(
                          {
                            class: 'chip',
                            hidden: function* () {
                              return (yield* card()).changes.length > 0;
                            },
                          },
                          function* () {
                            return (yield* t()).neverApproved;
                          },
                        ),
                        span({ class: 'chip coverage' }, function* () {
                          const coverage = (yield* card()).members[0]?.metadata
                            ?.coverage;
                          const say = yield* t();
                          if (!coverage) return say.coverageUnknown;
                          const seen =
                            coverage.attested -
                            coverage.offScreen -
                            coverage.occluded;
                          return say.coverage(
                            coverage.attested,
                            seen,
                            coverage.occluded,
                          );
                        }),
                      ]),
                      div({ class: 'evidence-views' }, [
                        span(
                          {
                            class: 'field-label',
                            id: 'evidence-views-label',
                          },
                          function* () {
                            return (yield* t()).evidence;
                          },
                        ),
                        div(
                          {
                            class: 'view-toggle',
                            role: 'group',
                            'aria-labelledby': 'evidence-views-label',
                          },
                          [
                            button(
                              'ShowReplay',
                              {
                                type: 'button',
                                'data-view': 'replay',
                                title: function* () {
                                  return (yield* t()).viewPageHint;
                                },
                                disabled: function* () {
                                  return !(yield* canReplay());
                                },
                                'aria-pressed': function* () {
                                  return String(yield* showingReplay());
                                },
                                click: evidenceView.chooseReplay,
                              },
                              function* () {
                                return (yield* t()).viewPage;
                              },
                            ),
                            button(
                              'ShowImage',
                              {
                                type: 'button',
                                'data-view': 'image',
                                title: function* () {
                                  return (yield* t()).viewImageHint;
                                },
                                'aria-pressed': function* () {
                                  return String(!(yield* showingReplay()));
                                },
                                click: evidenceView.chooseImage,
                              },
                              function* () {
                                return (yield* t()).viewImage;
                              },
                            ),
                          ],
                        ),
                        button(
                          'ToggleChrome',
                          {
                            type: 'button',
                            class: 'overlay-toggle',
                            // Only the page can do this. In a screenshot those
                            // pixels have already been replaced.
                            'data-hint': overlayHint,
                            // Offered only when there is something to lift. A
                            // control that is always present and does nothing on
                            // most cards reads as broken — and on those cards it
                            // was, because it marked every fixed element on the
                            // page whether or not it covered anything.
                            hidden: function* () {
                              return (
                                !(yield* showingReplay()) ||
                                (yield* chrome()).length === 0
                              );
                            },
                            'aria-pressed': function* () {
                              return String(yield* hideChrome());
                            },
                            click: toggleChrome,
                          },
                          overlayLabel,
                        ),
                      ]),
                      // Applies to both artefacts, by different means: the
                      // picture is a picture, and the frozen page is drawn
                      // smaller with a transform. Never a width — that would
                      // relayout it and it would stop being what was measured.
                      label(
                        {
                          class: 'field-label',
                          htmlFor: 'evidence-zoom',
                        },
                        function* () {
                          return (yield* t()).zoom;
                        },
                      ),
                      select(
                        'EvidenceZoom',
                        {
                          id: 'evidence-zoom',
                          'aria-label': 'Evidence zoom',
                          value: zoom,
                          *change(event: Event) {
                            const value = eventValue(event);
                            if (isZoomMode(value)) yield* chooseZoom(value);
                          },
                        },
                        [
                          option({ value: 'fit' }, function* () {
                            return (yield* t()).zoomFit;
                          }),
                          option({ value: 'actual' }, function* () {
                            return (yield* t()).zoomActual;
                          }),
                        ],
                      ),
                    ]),
                    p({ class: 'evidence-help' }, function* () {
                      const say = yield* t();
                      return (yield* showingReplay())
                        ? say.helpReplay
                        : say.helpImage;
                    }),
                    // What the outlines drawn into the frame mean. Without it a
                    // reviewer meets a dotted orange box around a button they never
                    // touched and has no way to find out what it is telling them.
                    TierLegend({
                      showing: showingReplay,
                      changedCount: function* () {
                        return (yield* member())?.changed.length ?? 0;
                      },
                      coveredCount,
                      chromeNames: chrome,
                      t,
                    }),
                    section(
                      {
                        class: 'notice warning',
                        role: 'status',
                        // Shown in both views, not only on the page. The reviewer
                        // who was moved to the photograph is exactly the one who
                        // needs to be told why, and hiding this with the frame
                        // left them looking at a picture for no stated reason.
                        hidden: function* () {
                          const state = yield* replay();
                          return (
                            !(yield* canReplay()) ||
                            !state.loaded ||
                            state.faithful
                          );
                        },
                      },
                      [
                        strong(function* () {
                          const sentence = yield* fidelitySentence();
                          return (yield* fellBack())
                            ? (yield* t()).fellBack(
                                `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`,
                              )
                            : sentence;
                        }),
                        // Folded. The sentence above is what a reviewer acts
                        // on; the addresses are what they check afterwards, and
                        // four lines of `color rgb(0,0,0)→rgb(255,255,255)` open
                        // by default push the verdict off the screen.
                        //
                        // What this costs the decision is not repeated here: the
                        // panel below says it once, next to the buttons it
                        // applies to.
                        details(
                          {
                            class: 'fidelity-detail',
                            hidden: function* () {
                              return (yield* replay()).report.length === 0;
                            },
                          },
                          [
                            summary(function* () {
                              const state = yield* replay();
                              return `${(yield* t()).fidelityDetail} (${state.report.length})`;
                            }),
                            ul(
                              forNode(
                                function* () {
                                  return (yield* replay()).report.map(
                                    (line) => ({
                                      line,
                                    }),
                                  );
                                },
                                { track: (entry) => entry.line },
                                (entry) =>
                                  li({ class: 'code' }, function* () {
                                    return (yield* entry()).line;
                                  }),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    ifNode(
                      visualEvidence,
                      () =>
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
                              // The scaled box. The frame keeps its captured size —
                              // a width change would relayout the page inside it —
                              // and this is drawn smaller instead. The band rides
                              // along, so a rectangle dragged in frame coordinates
                              // lands where the pointer was.
                              div({ class: 'replay-scale' }, [
                                iframe({
                                  id: function* () {
                                    const active = yield* current();
                                    return (yield* card()).shape === active?.shape
                                      ? FRAME_ID
                                      : '';
                                  },
                                  title: function* () {
                                    return (yield* t()).frameTitle;
                                  },
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
                                    // Only the card on screen loads a document. The
                                    // central panel renders no inactive cards, so this
                                    // frame always belongs to the selected scenario.
                                    const active = yield* current();
                                    const own = yield* card();
                                    const hash =
                                      own.shape === active?.shape
                                        ? own.members[0]?.snapshot
                                        : undefined;
                                    return safeResourceUrl(
                                      hash ? snapshotUrl(hash) : '/api/blank',
                                    );
                                  },
                                  load: inspectFrame,
                                }),
                                // Drawn in this document, on top of the frame — never
                                // inside it. Inserting an element into the frozen page
                                // would break the one claim it makes: that nothing was
                                // added to it after it was measured.
                                div({
                                  class: 'selection-band',
                                  'aria-hidden': 'true',
                                  hidden: function* () {
                                    return !(yield* band());
                                  },
                                  style: function* () {
                                    const rect = yield* band();
                                    return rect
                                      ? `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px`
                                      : '';
                                  },
                                }),
                              ]),
                            ),
                            div(
                              {
                                class: 'image-holder',
                                hidden: showingReplay,
                              },
                              [
                                img({
                                  hidden: function* () {
                                    return !(yield* card()).image;
                                  },
                                  alt: function* () {
                                    return (yield* t()).imageAlt(
                                      scenarioOf((yield* card()).subject),
                                    );
                                  },
                                  src: function* () {
                                    const hash = (yield* card()).image;
                                    return safeResourceUrl(
                                      hash ? imageUrl(hash) : '',
                                    );
                                  },
                                }),
                                // Where the viewport ended. Everything below it is
                                // attested and was never on anybody's screen.
                                div({
                                  class: 'fold',
                                  hidden: function* () {
                                    const metadata = (yield* card()).members[0]
                                      ?.metadata;
                                    return !(
                                      metadata?.visibleBand && metadata.screenshot
                                    );
                                  },
                                  style: function* () {
                                    const metadata = (yield* card()).members[0]
                                      ?.metadata;
                                    const band = metadata?.visibleBand;
                                    const shot = metadata?.screenshot;
                                    if (!band || !shot) return '';
                                    const percent = (
                                      value: number,
                                      total: number,
                                    ) =>
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
                                  // A template decision never carries a
                                  // screenshot — it attests a binding, not a
                                  // render — so saying one is missing tells a
                                  // reviewer nothing they could act on. The
                                  // notice is only useful where a picture was
                                  // ever a possibility.
                                  const own = yield* card();
                                  return (
                                    own.kind !== 'visual' || Boolean(own.image)
                                  );
                                },
                              },
                              function* () {
                                return (yield* t()).noImage;
                              },
                            ),
                            figcaption(function* () {
                              const target = (yield* card()).members[0]?.metadata
                                ?.target;
                              const say = yield* t();
                              return target
                                ? say.captionWithTarget(target)
                                : say.caption;
                            }),
                          ],
                        ),
                      ),
                    section(
                      {
                        class: 'diff-panel',
                        // Nothing to list is not worth a heading and a bullet
                        // saying so. A subject nobody has attested says that in
                        // one chip beside the viewport, where the rest of the
                        // facts about this capture already are.
                        hidden: function* () {
                          return (yield* card()).changes.length === 0;
                        },
                      },
                      [
                        heading(function* () {
                          return (yield* t()).measuredChange;
                        }),
                        ul(
                          forNode(
                            function* () {
                              return (yield* card()).changes;
                            },
                            { track: (change) => change },
                            (change) => li(span({ class: 'code' }, change)),
                          ),
                        ),
                      ],
                    ),
                  ]),
                  div({ class: 'decision-column' }, [
                    section(
                      {
                        class: 'previous-rejection',
                        hidden: function* () {
                          const value = yield* card();
                          return (
                            value.kind !== 'visual' ||
                            (!value.previousDecision && !value.rejectionReason)
                          );
                        },
                      },
                      [
                        heading(function* () {
                          return (yield* t()).previousDecisionLabel;
                        }),
                        p(function* () {
                          const value = yield* card();
                          const previous = value.previousDecision;
                          return previous
                            ? `${(yield* t()).previousVerdict(previous.verdict)} · ${previous.by} · ${previous.at}${previous.note ? ` — ${previous.note}` : ''}`
                            : (value.rejectionReason ?? '');
                        }),
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
                        function* () {
                          return (yield* t()).degraded;
                        },
                      ),
                      div({ class: 'field-row' }, [
                        label({ htmlFor: NOTE_ID }, function* () {
                          return (yield* t()).reason;
                        }),
                        // The count of what is outlined, next to the field that is
                        // about to name it. A reviewer who dragged a box needs to
                        // see what they caught without looking back at the page.
                        span(
                          {
                            class: 'selection-tag',
                            hidden: function* () {
                              return (yield* selection()).length === 0;
                            },
                          },
                          function* () {
                            return (yield* t()).selected(
                              (yield* selection()).length,
                            );
                          },
                        ),
                      ]),
                      // Uncontrolled on purpose. Re-rendering the field from
                      // the state on every keystroke would rebuild its children
                      // and throw the caret to the start; the state follows the
                      // field instead, and only the insertion writes into it.
                      div('ReviewNote', {
                        id: NOTE_ID,
                        class: 'reason-input',
                        contenteditable: 'true',
                        role: 'textbox',
                        tabIndex: 0,
                        'aria-multiline': 'true',
                        'aria-label': 'Decision note',
                        'aria-describedby':
                          'review-note-help review-note-error',
                        'aria-invalid': rejectionReasonMissing,
                        'data-placeholder': function* () {
                          return (yield* t()).reasonPlaceholder;
                        },
                        *input(event: Event) {
                          const field = event.currentTarget;
                          if (!(field instanceof HTMLElement)) return;
                          // The live reference belongs to the sentence now, so
                          // the next selection starts its own rather than
                          // rewriting this one.
                          freezePick();
                          yield* note.writeFromInput(textOf(field));
                        },
                        // Delegated, because the references are built by hand
                        // rather than rendered: a listener per chip would have
                        // to be attached and removed on every edit.
                        *mouseover(event: Event) {
                          const target = event.target;
                          const chip =
                            target instanceof Element
                              ? target.closest('.mention-chip')
                              : null;
                          const id = chip?.getAttribute(MENTION_ID);
                          yield* previewMention(id ? Number(id) : undefined);
                        },
                        *mouseleave() {
                          yield* previewMention(undefined);
                        },
                        keyup: rememberCaret,
                        mouseup: rememberCaret,
                        blur: rememberCaret,
                        // Pasted markup would arrive with its own styling and,
                        // worse, its own elements — including things that look
                        // like references and point at nothing.
                        *paste(event: Event) {
                          const clip =
                            event instanceof ClipboardEvent
                              ? event.clipboardData
                              : null;
                          if (!clip) return;
                          event.preventDefault();
                          const text = clip.getData('text/plain');
                          reviewDocument
                            .getSelection()
                            ?.getRangeAt(0)
                            .insertNode(reviewDocument.createTextNode(text));
                          reviewDocument.getSelection()?.collapseToEnd();
                          const field = event.currentTarget;
                          if (field instanceof HTMLElement) {
                            field.dispatchEvent(
                              new Event('input', { bubbles: true }),
                            );
                          }
                        },
                      }),
                      small(
                        { id: 'review-note-help', class: 'decision-help' },
                        function* () {
                          return (yield* t()).reasonHelp;
                        },
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
                        function* () {
                          return (yield* t()).reasonMissing;
                        },
                      ),
                      section(
                        {
                          class: 'retirement-actions',
                          hidden: function* () {
                            return (yield* current())?.kind !== 'removal';
                          },
                        },
                        [
                          RetirementReasonPicker({}),
                          button(
                            'RetireObligation',
                            {
                              type: 'button',
                              class: 'danger',
                              disabled: decision.isLoading,
                              click: retire,
                            },
                            function* () {
                              return (yield* t()).retire;
                            },
                          ),
                        ],
                      ),
                      div({ class: 'decision-actions' }, [
                        button(
                          'RejectReviewCard',
                          {
                            type: 'button',
                            'data-hint': function* () {
                              return (yield* t()).hintReject;
                            },
                            class: 'danger',
                            'data-hotkey': 'r',
                            disabled: decision.isLoading,
                            *click() {
                              yield* decide('rejected');
                            },
                          },
                          [
                            function* () {
                              return (yield* t()).reject;
                            },
                            span({ class: 'key' }, 'R'),
                          ],
                        ),
                        button(
                          'BlockReviewCard',
                          {
                            type: 'button',
                            'data-hint': function* () {
                              return (yield* t()).hintBlock;
                            },
                            disabled: decision.isLoading,
                            *click() {
                              yield* decide('blocked');
                            },
                          },
                          function* () {
                            return (yield* t()).block;
                          },
                        ),
                        button(
                          'KnownIssueReviewCard',
                          {
                            type: 'button',
                            'data-hint': function* () {
                              return (yield* t()).hintKnownIssue;
                            },
                            disabled: decision.isLoading,
                            *click() {
                              yield* decide('known-issue');
                            },
                          },
                          function* () {
                            return (yield* t()).knownIssue;
                          },
                        ),
                        button(
                          'AcceptWithNoteReviewCard',
                          {
                            type: 'button',
                            'data-hint': function* () {
                              return (yield* t()).hintAcceptWithNote;
                            },
                            'data-hotkey': 'n',
                            disabled: function* () {
                              return (
                                (yield* decision.isLoading()) ||
                                !(yield* hasNote())
                              );
                            },
                            *click() {
                              yield* decide('ok-with-note');
                            },
                          },
                          [
                            function* () {
                              return (yield* t()).acceptWithNote;
                            },
                            span({ class: 'key' }, 'N'),
                          ],
                        ),
                        button(
                          'AcceptReviewCard',
                          {
                            type: 'button',
                            'data-hint': function* () {
                              return (yield* t()).hintAccept;
                            },
                            class: 'primary',
                            'data-hotkey': 'a',
                            disabled: decision.isLoading,
                            *click() {
                              yield* decide('ok');
                            },
                          },
                          [
                            function* () {
                              return (yield* t()).accept;
                            },
                            span({ class: 'key' }, 'A'),
                          ],
                        ),
                      ]),
                    ]),
                  ]),
                ],
              ),
            ),
          ),
          main(
            {
              class: 'inventory-panel',
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
              class: 'inventory-panel visual-inventory-panel',
              hidden: function* () {
                return (yield* devtoolView()) !== 'visual';
              },
            },
            [
              heading(function* () {
                return (yield* t()).viewVisual;
              }),
              ul(
                { class: 'inventory-list' },
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
                        class: function* () {
                          return {
                            active:
                              (yield* selectedVisualTest())?.subject ===
                              (yield* test()).subject,
                          };
                        },
                      },
                      [
                        button(
                          'SelectVisualTest',
                          {
                            type: 'button',
                            class: function* () {
                              return {
                                'inventory-item': true,
                                active:
                                  (yield* selectedVisualTest())?.subject ===
                                  (yield* test()).subject,
                              };
                            },
                            'aria-current': function* () {
                              return String(
                                (yield* selectedVisualTest())?.subject ===
                                  (yield* test()).subject,
                              );
                            },
                            *click() {
                              yield* selectVisualTest(index);
                            },
                          },
                          [
                            strong(function* () {
                              return (yield* test()).scenario;
                            }),
                            span({ class: 'subject code' }, function* () {
                              return (yield* test()).component;
                            }),
                            small(function* () {
                              const say = yield* t();
                              return stateText((yield* test()).state, say);
                            }),
                          ],
                        ),
                      ],
                    ),
                ),
              ),
              section(
                {
                  class: 'visual-detail',
                  hidden: function* () {
                    return !(yield* selectedVisualTest());
                  },
                },
                [
                  header({ class: 'visual-detail-heading' }, [
                    div([
                      small({ class: 'eyebrow' }, function* () {
                        return (yield* t()).scenario;
                      }),
                      heading(function* () {
                        return (yield* selectedVisualTest())?.scenario ?? '';
                      }),
                      span({ class: 'subject code' }, function* () {
                        return (yield* selectedVisualTest())?.component ?? '';
                      }),
                    ]),
                    span({ class: 'chip' }, function* () {
                      const test = yield* selectedVisualTest();
                      return test
                        ? stateText(test.state, yield* t())
                        : '';
                    }),
                  ]),
                  figure({ class: 'evidence-canvas visual-evidence' }, [
                    img({
                      hidden: function* () {
                        return !(yield* selectedVisualAsset())?.image;
                      },
                      alt: function* () {
                        return (yield* t()).imageAlt(
                          (yield* selectedVisualTest())?.scenario ?? '',
                        );
                      },
                      src: function* () {
                        const image = (yield* selectedVisualAsset())?.image;
                        return safeResourceUrl(image ? imageUrl(image) : '');
                      },
                    }),
                    p(
                      {
                        class: 'no-image',
                        hidden: function* () {
                          return Boolean((yield* selectedVisualAsset())?.image);
                        },
                      },
                      function* () {
                        return (yield* t()).noImage;
                      },
                    ),
                    figcaption(function* () {
                      return (yield* t()).caption;
                    }),
                  ]),
                  section(
                    {
                      class: 'diff-panel',
                      hidden: function* () {
                        return !(yield* visualReviewCard())?.changes.length;
                      },
                    },
                    [
                      heading(function* () {
                        return (yield* t()).measuredChange;
                      }),
                      ul(
                        forNode(
                          function* () {
                            return (yield* visualReviewCard())?.changes ?? [];
                          },
                          { track: (change) => change },
                          (change) => li({ class: 'code' }, change),
                        ),
                      ),
                    ],
                  ),
                  button(
                    'OpenVisualReview',
                    {
                      type: 'button',
                      class: 'primary visual-review-link',
                      hidden: function* () {
                        return !(yield* visualReviewCard());
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
              class: 'inventory-panel',
              hidden: function* () {
                return (yield* devtoolView()) !== 'template';
              },
            },
            [
              heading(function* () {
                return (yield* t()).viewTemplate;
              }),
              ul(
                { class: 'inventory-list' },
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
                    li([
                      strong(function* () {
                        const value = yield* obligation();
                        const say = yield* t();
                        return `${value.component} · ${directionText(value.direction, say)}`;
                      }),
                      p([
                        span(
                          {
                            class: 'template-when',
                            hidden: function* () {
                              return !(yield* obligation()).conditions?.length;
                            },
                          },
                          function* () {
                            const value = yield* obligation();
                            const say = yield* t();
                            return say.templateWhen(
                              conditionText(value.conditions ?? [], say),
                            );
                          },
                        ),
                        strong(function* () {
                          const value = yield* obligation();
                          const say = yield* t();
                          return templateStatementOf(
                            value.statementParts,
                            value.statement,
                            say,
                            yield* locale(),
                          );
                        }),
                      ]),
                      small(function* () {
                        const say = yield* t();
                        return stateText((yield* obligation()).state, say);
                      }),
                    ]),
                ),
              ),
              heading(function* () {
                return (yield* t()).extractionDiagnostics;
              }),
              ul(
                { class: 'inventory-list diagnostics' },
                forNode(
                  function* () {
                    return (yield* review.value())?.diagnostics ?? [];
                  },
                  {
                    track: (diagnostic) =>
                      `${diagnostic.code}:${diagnostic.filePath ?? ''}:${diagnostic.line ?? ''}`,
                    empty: () => li('—'),
                  },
                  (diagnostic) =>
                    li([
                      strong(function* () {
                        return (yield* diagnostic()).code;
                      }),
                      p(function* () {
                        return (yield* diagnostic()).message;
                      }),
                      small(
                        {
                          class: 'diagnostic-summary',
                          hidden: function* () {
                            const value = yield* diagnostic();
                            const say = yield* t();
                            return (
                              diagnosticSummaryOf(
                                value.code,
                                value.message,
                                say,
                                yield* locale(),
                              ).length === 0
                            );
                          },
                        },
                        function* () {
                          const value = yield* diagnostic();
                          return diagnosticSummaryOf(
                            value.code,
                            value.message,
                            yield* t(),
                            yield* locale(),
                          );
                        },
                      ),
                    ]),
                ),
              ),
            ],
          ),
        ],
      ),
      ifNode(regenerationDialogOpen, () =>
        div({ class: 'regeneration-modal-backdrop' }, [
          section(
            {
              class: 'regeneration-modal',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'regeneration-dialog-title',
              'aria-describedby': 'regeneration-dialog-description',
            },
            [
              small({ class: 'eyebrow' }, function* () {
                return (yield* t()).regenerationEyebrow;
              }),
              heading({ id: 'regeneration-dialog-title' }, function* () {
                return (yield* t()).regenerationTitle;
              }),
              p({ id: 'regeneration-dialog-description' }, function* () {
                const queue = yield* review.value();
                return (yield* t()).regenerationScope(
                  queue?.visualTests.length ?? 0,
                  queue?.templateObligations.length ?? 0,
                );
              }),
              ul({ class: 'regeneration-consequences' }, [
                li(function* () {
                  return (yield* t()).regenerationReplacesArtifacts;
                }),
                li(function* () {
                  const previous = yield* previousRegenerationDecisions();
                  return previous > 0
                    ? (yield* t()).regenerationPreservesHistory(previous)
                    : (yield* t()).regenerationFirstGeneration;
                }),
                li(function* () {
                  return (yield* t()).regenerationRebuildsQueue;
                }),
                li(function* () {
                  return (yield* t()).regenerationDropsDraft;
                }),
              ]),
              div({ class: 'regeneration-modal-actions' }, [
                button(
                  'CancelRegeneration',
                  {
                    type: 'button',
                    'data-hotkey': 'escape',
                    autofocus: true,
                    click: closeRegenerationDialog,
                  },
                  function* () {
                    return (yield* t()).cancelRegeneration;
                  },
                ),
                button(
                  'ConfirmRegeneration',
                  {
                    type: 'button',
                    class: 'primary',
                    disabled: regenerate.isLoading,
                    click: confirmRegeneration,
                  },
                  function* () {
                    return (yield* t()).confirmRegeneration;
                  },
                ),
              ]),
            ],
          ),
        ]),
      ),
      ifNode(iterationDialogOpen, () =>
        div({ class: 'iteration-modal-backdrop' }, [
          section(
            {
              class: 'iteration-modal',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'iteration-dialog-title',
              'aria-describedby': 'iteration-dialog-description',
            },
            [
              small({ class: 'eyebrow' }, function* () {
                return (yield* t()).iterationModalEyebrow;
              }),
              ifNode(iterationPreparationNotStarted, () => [
                heading({ id: 'iteration-dialog-title' }, function* () {
                  return (yield* t()).iterationModalTitle;
                }),
                p({ id: 'iteration-dialog-description' }, function* () {
                  const rejected =
                    (yield* review.value())?.cards.filter(
                      (card) => card.previousDecision?.verdict === 'rejected',
                    ).length ?? 0;
                  return (yield* t()).iterationModalDescription(rejected);
                }),
                ul({ class: 'iteration-consequences' }, [
                  li(function* () {
                    return (yield* t()).iterationModalWritesFiles;
                  }),
                  li(function* () {
                    return (yield* t()).iterationModalStaysOpen;
                  }),
                  li(function* () {
                    return (yield* t()).iterationModalStopsServer;
                  }),
                ]),
                div({ class: 'iteration-modal-actions' }, [
                  button(
                    'CancelIteration',
                    {
                      type: 'button',
                      'data-hotkey': 'escape',
                      autofocus: true,
                      click: closeIterationDialog,
                    },
                    function* () {
                      return (yield* t()).cancelRegeneration;
                    },
                  ),
                  button(
                    'ConfirmIterationHandoff',
                    {
                      type: 'button',
                      class: 'primary',
                      disabled: iterationHandoff.isLoading,
                      click: confirmIterationHandoff,
                    },
                    function* () {
                      return (yield* t()).iterationConfirm;
                    },
                  ),
                ]),
              ]),
              ifNode(iterationHandoff.isLoading, () =>
                p(
                  { class: 'iteration-progress', 'aria-live': 'polite' },
                  function* () {
                    return (yield* t()).iterationModalPreparing;
                  },
                ),
              ),
              ifNode(iterationHandoffReady, () => [
                heading({ id: 'iteration-dialog-title' }, function* () {
                  return (yield* t()).iterationHandoffReady;
                }),
                p({ id: 'iteration-dialog-description' }, function* () {
                  const value = yield* iterationHandoff.value();
                  return value
                    ? (yield* t()).iterationHandoffFiles(
                        value.rejectedCards,
                        value.feedbackPath,
                        value.promptPath,
                      )
                    : '';
                }),
                p({ class: 'iteration-ready' }, function* () {
                  return (yield* t()).iterationModalReady;
                }),
                textarea('IterationPrompt', {
                  id: 'iteration-prompt',
                  readOnly: true,
                  value: function* () {
                    return (yield* iterationHandoff.value())?.prompt ?? '';
                  },
                  'aria-label': function* () {
                    return (yield* t()).iterationPrompt;
                  },
                }),
                div({ class: 'iteration-modal-actions' }, [
                  button(
                    'CopyIterationPrompt',
                    {
                      type: 'button',
                      class: 'copy-iteration-prompt',
                      click: copyIterationPrompt,
                    },
                    function* () {
                      return (yield* t()).copyIterationPrompt;
                    },
                  ),
                  button(
                    'CloseReview',
                    {
                      type: 'button',
                      class: 'primary',
                      disabled: closeReview.isLoading,
                      click: closeReviewSession,
                    },
                    function* () {
                      return (yield* closeReview.isLoading())
                        ? (yield* t()).iterationModalClosing
                        : (yield* t()).closeReview;
                    },
                  ),
                ]),
                ifNode(iterationPromptCopied, () =>
                  p(
                    { class: 'iteration-copied', 'aria-live': 'polite' },
                    function* () {
                      return (yield* t()).iterationPromptCopied;
                    },
                  ),
                ),
              ]),
            ],
          ),
        ]),
      ),
    ]),
);
