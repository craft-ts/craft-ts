import {
  CraftHttpClient,
  asyncProcess,
  craftComputed,
  craftService,
  craftMethod,
  craftUntilSettled,
  deepYieldable,
  insertQueryParamsPipe,
  insertStatePipe,
  insertQueryPipe,
  insertReactOnMutation,
  mutation,
  on$,
  query,
  queryParams,
  source$,
  state,
  craftUse,
  craftPrivate,
  craftExpose,
} from '@craft-ts/core';
import type {
  ReviewApiQueue,
  ReviewDecisionReopenRequest,
  ReviewDecisionRequest,
  ReviewIterationHandoffResponse,
  ReviewSessionDecision,
} from '@craft-ts/style-testing/review';
type ReviewCard = ReviewApiQueue['cards'][number];
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
import { ReviewNavigation } from './review-navigation.service';
import { ideLinkUrl, sourcePathOf } from './ide-links';
import { ReviewFilters } from './review-filters.service';
import { CloseReview } from './close-review.service';
import { RetirementReasonChoice } from './retirement-reason.service';

import type { ApplicationVerdict } from './application-overview';

import { groupTemplateReviewCards } from './template-review-groups';

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
  reasonText,
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
const EMPTY_TEMPLATE_IDS: readonly string[] = [];

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

interface TemplateSourceDetail {
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
}

export const { ReviewAppModel, provideReviewAppModel } = craftService(
  { name: 'ReviewAppModel', providedIn: 'toProvide' },
  function* () {
    const { navigateToView } = yield* ReviewNavigation();
    const navigation$ = source$<number>('navigation$');
    const decisionSubmitted$ = source$<
      ReviewDecisionRequest | readonly ReviewDecisionRequest[]
    >('decisionSubmitted$');
    const decisionReopened$ =
      source$<ReviewDecisionReopenRequest>('decisionReopened$');
    const regenerationDialogRequested$ = source$<void>(
      'regenerationDialogRequested$',
    );
    const regenerationDialogClosed$ = source$<void>(
      'regenerationDialogClosed$',
    );
    const regenerationConfirmed$ = source$<'regenerate'>(
      'regenerationConfirmed$',
    );
    const templateAgentRequested$ = source$<{
      readonly cards: readonly {
        readonly id: string;
        readonly revision: string;
      }[];
    }>('templateAgentRequested$');
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
    let folderLayoutApplyRequest = 0;
    const folderLayoutApplyRequested$ = source$<number>(
      'folderLayoutApplyRequested$',
    );
    const mentionEdited$ = source$<{
      readonly mentions: readonly Mention[];
      readonly note: string;
    }>('mentionEdited$');

    const navigationParams = yield* craftPrivate(
      queryParams(
        'reviewNavigation',
        {
          state: {
            view: {
              fallbackValue: '' satisfies UrlDevtoolView,
              codec: devtoolViewQueryParamCodec,
            },
            scenario: {
              fallbackValue: '',
              codec: stringQueryParamCodec,
            },
          },
        },
        insertQueryParamsPipe(
          ({ state }) => ({
            devtoolView: craftUse(
              craftComputed('devtoolView', function* () {
                const params = yield* state();
                return params.view || initialDevtoolView();
              }),
            ),
            selectedVisualTest: craftUse(
              craftComputed('selectedVisualTest', function* () {
                const list = yield* visualTests();
                if (list.length === 0) return undefined;
                const params = yield* state();
                return (
                  list.find(
                    (test) =>
                      test.subject === params.scenario ||
                      test.scenario === params.scenario,
                  ) ?? list[0]
                );
              }),
            ),
            activeTemplateGroupIndex: craftUse(
              craftComputed('activeTemplateGroupIndex', function* () {
                const groups = yield* templateReviewGroups();
                const params = yield* state();
                const index = groups.findIndex((group) =>
                  group.cards.some(
                    (card) =>
                      card.shape === params.scenario ||
                      card.subject === params.scenario,
                  ),
                );
                return index < 0 ? 0 : index;
              }),
            ),
            activeIndex: craftUse(
              craftComputed('activeIndex', function* () {
                const params = yield* state();
                const source = (yield* review.value())?.cards ?? [];
                const view = params.view || initialDevtoolView();
                let list = source;
                if (view === 'review') {
                  list = source.filter((card) => card.kind !== 'folder-layout');
                } else if (view === 'folder-layout') {
                  list = source.filter((card) => card.kind === 'folder-layout');
                } else {
                  const component = (yield* componentFilter())
                    .trim()
                    .toLowerCase();
                  const searchTerm = (yield* searchTextFilter())
                    .trim()
                    .toLowerCase();
                  const kind = yield* kindFilter();
                  const itemState = yield* stateFilter();
                  const direction = yield* directionFilter();
                  list = source.filter((card) => {
                    if (kind !== 'all' && card.kind !== kind) return false;
                    if (itemState !== 'all' && card.state !== itemState)
                      return false;
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
                    if (searchTerm) {
                      const searchable = [
                        card.subject,
                        card.reason,
                        ...card.changes,
                        ...(card.kind === 'template' ? [card.statement] : []),
                      ]
                        .join(' ')
                        .toLowerCase();
                      if (!searchable.includes(searchTerm)) return false;
                    }
                    return true;
                  });
                }
                if (list.length === 0) return 0;
                if (!params.scenario) return 0;
                const index = list.findIndex(
                  (card) => card.shape === params.scenario,
                );
                return index >= 0 ? index : 0;
              }),
            ),
          }),
          ({ patch }) => ({
            setViewForDevtoolChoice: function* (value: DevtoolView) {
              yield* patch({ view: value }, { replaceUrl: true });
              return navigateToView(value);
            },
            setViewForApplicationReview: function* (value: DevtoolView) {
              yield* patch({ view: value }, { replaceUrl: true });
              return navigateToView(value);
            },
            setScenarioForApplicationReview: function* (value: string) {
              return yield* patch({ scenario: value });
            },
            setScenarioForTemplateGroup: function* (value: string) {
              return yield* patch({ scenario: value });
            },
            setViewForVisualReview: function* (value: DevtoolView) {
              yield* patch({ view: value }, { replaceUrl: true });
              return navigateToView(value);
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
        ),
      ),
    );
    const { selectedVisualTest, activeTemplateGroupIndex } = navigationParams;
    const { devtoolView } = navigationParams;

    // Read from the environment before the first paint, so nothing renders in
    // the wrong language or the wrong theme and then corrects itself.
    const { locale, ide, theme: themePreference } = yield* ReviewPreferences();
    /** The explicit theme, or no attribute: `system` leaves the media query in charge. */
    yield* craftComputed('themeAttribute', function* () {
      const choice = yield* themePreference();
      return choice === 'system' ? null : choice;
    });
    const { retirementReason } = yield* RetirementReasonChoice();
    const {
      componentFilter,
      textFilter: searchTextFilter,
      kindFilter,
      stateFilter,
      directionFilter,
    } = yield* ReviewFilters();
    const zoom = yield* state('zoom', initialZoom(), ({ set }) => ({
      choose: (mode: ZoomMode) => set(mode),
    }));
    const note = yield* state(
      'note',
      '',
      insertStatePipe(
        ({ state }) => ({
          noteState: craftUse(
            craftComputed('noteState', function* () {
              return (yield* state()).length === 0 ? 'empty' : null;
            }),
          ),
          hasNote: craftUse(
            craftComputed('hasNote', function* () {
              return proseOf(yield* state()).length > 0;
            }),
          ),
          findings: craftUse(
            craftComputed('findings', function* () {
              const noteContent = yield* state();
              return (yield* mentions())
                .filter((mention) =>
                  mentionPattern(mention.id).test(noteContent),
                )
                .flatMap((mention) =>
                  mention.paths.map(
                    (path): Finding => ({
                      path,
                      note: noteForMention(noteContent, mention.id),
                    }),
                  ),
                );
            }),
          ),
        }),
        ({ set }) => ({
          writeFromInput: (value: string) => set(value),
          writeTemplateGroup: (value: string) => set(value),
          clearForTemplateRejection: () => set(''),
          replaceFromMentionEdit: on$(mentionEdited$, ({ note: value }) =>
            set(value),
          ),
          clearFromNavigation: on$(navigation$, () => set('')),
          clearFromDecision: on$(decisionSubmitted$, () => set('')),
          clearFromRegeneration: on$(regenerationConfirmed$, () => set('')),
        }),
      ),
    );
    const { noteState, hasNote, findings } = note;
    const selectedTemplateIds = yield* state(
      'selectedTemplateIds',
      EMPTY_TEMPLATE_IDS,
      ({ set, update }) => ({
        selectPending: (value: readonly string[]) => set(value),
        selectHuman: (value: readonly string[]) => set(value),
        toggle: (id: string) =>
          update((selected) =>
            selected.includes(id)
              ? selected.filter((candidate) => candidate !== id)
              : [...selected, id],
          ),
        clear: () => set([]),
        clearFromNavigation: on$(navigation$, () => set([])),
        clearFromDecision: on$(decisionSubmitted$, () => set([])),
      }),
    );
    const rejectionAttempted = yield* state(
      'rejectionAttempted',
      false,
      insertStatePipe(
        ({ state }) => ({
          rejectionReasonMissing: craftUse(
            craftComputed('rejectionReasonMissing', function* () {
              return (yield* state()) && !(yield* hasNote());
            }),
          ),
        }),
        ({ set }) => ({
          showForRejectedDecision: () => set(true),
          showForTemplateRejectedBatch: () => set(true),
          showForRetirement: () => set(true),
          clear: () => set(false),
          clearFromDecision: on$(decisionSubmitted$, () => set(false)),
          clearFromRegeneration: on$(regenerationConfirmed$, () => set(false)),
        }),
      ),
    );
    const { rejectionReasonMissing } = rejectionAttempted;
    const evidenceView = yield* state(
      'evidenceView',
      initialEvidenceView(),
      insertStatePipe(
        ({ state }) => ({
          showingReplay: craftUse(
            craftComputed('showingReplay', function* () {
              const card = yield* current();
              if (card?.kind === 'visual' && card.evidenceMode === 'screenshot')
                return false;
              if (!(yield* canReplay())) return false;
              const chosen = yield* state();
              if (chosen !== 'auto') return chosen === 'replay';
              const replayState = yield* replay();
              return !replayState.loaded || replayState.faithful;
            }),
          ),
          fellBack: craftUse(
            craftComputed('fellBack', function* () {
              const replayState = yield* replay();
              return (
                (yield* canReplay()) &&
                (yield* state()) === 'auto' &&
                replayState.loaded &&
                !replayState.faithful
              );
            }),
          ),
        }),
        ({ set }) => ({
          chooseReplay: () => set('replay'),
          chooseImage: () => set('image'),
          // Every card is judged on its own artefact: a pin taken on one card
          // must not decide what the next reviewer sees on the next one.
          releaseFromNavigation: on$(navigation$, () => set('auto')),
          releaseFromRegeneration: on$(regenerationConfirmed$, () =>
            set('auto'),
          ),
        }),
      ),
    );
    const { showingReplay, fellBack } = evidenceView;
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

    const hideChrome = yield* state(
      'hideChrome',
      false,
      insertStatePipe(
        ({ state }) => ({
          overlayLabel: craftUse(
            craftComputed('overlayLabel', function* () {
              const say = yield* t();
              return (yield* state()) ? say.drop : say.lift;
            }),
          ),
        }),
        ({ set }) => ({ choose: (value: boolean) => set(value) }),
      ),
    );
    const { overlayLabel } = hideChrome;
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
    const folderLayoutApplyDialogDismissed = yield* craftPrivate(
      state(
        'folderLayoutApplyDialogDismissed',
        false,
        insertStatePipe(
          ({ state }) => ({
            folderLayoutApplyDialogOpen: craftUse(
              craftComputed('folderLayoutApplyDialogOpen', function* () {
                const apply = (yield* review.value())?.folderLayoutApply;
                return Boolean(apply && !apply.applied && !(yield* state()));
              }),
            ),
          }),
          ({ set }) => ({ dismiss: () => set(true) }),
        ),
      ),
    );
    const { folderLayoutApplyDialogOpen } = folderLayoutApplyDialogDismissed;
    const folderLayoutApplyCopied = yield* state(
      'folderLayoutApplyCopied',
      false,
      ({ set }) => ({ markCopied: () => set(true) }),
    );
    const iterationPreparationStarted = yield* state(
      'iterationPreparationStarted',
      false,
      insertStatePipe(
        ({ state }) => ({
          iterationPreparationNotStarted: craftUse(
            craftComputed('iterationPreparationNotStarted', function* () {
              return !(yield* state());
            }),
          ),
        }),
        ({ set }) => ({
          beginFromConfirmation: on$(iterationHandoffRequested$, () =>
            set(true),
          ),
          resetFromDialog: on$(iterationDialogRequested$, () => set(false)),
        }),
      ),
    );
    const { iterationPreparationNotStarted } = iterationPreparationStarted;
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
    const selectNodes = yield* craftPrivate(
      craftMethod('selectNodes', function* (paths: readonly string[]) {
        yield* selection.replaceFromFrame(paths);
        trackSelection(paths);
      }),
    );
    const showBand = yield* craftPrivate(
      craftMethod(
        'showBand',
        function* (
          rect:
            | { x: number; y: number; width: number; height: number }
            | undefined,
        ) {
          yield* band.show(rect);
        },
      ),
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
      const box = frame.closest('[data-testid="replay-scale"]');
      const holder = frame.closest('[data-testid="replay-holder"]');
      const canvas = frame.closest('[data-testid="evidence-canvas"]');
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
    const inspect = yield* craftPrivate(
      asyncProcess(
        'inspectReplay',
        {
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
        },
        ({ resource, state, hasException }) => ({
          replay: craftUse(
            craftComputed('replay', function* () {
              return (
                (yield* state()) ??
                ({
                  loaded: false,
                  faithful: false,
                  reason: undefined,
                  report: [],
                  chrome: [],
                } satisfies ReplayState)
              );
            }),
          ),
          inspectFailed: craftUse(
            craftComputed('inspectFailed', function* () {
              return (
                String(yield* resource.status()) === 'exception' ||
                (yield* hasException())
              );
            }),
          ),
        }),
      ),
    );
    const { replay, inspectFailed } = inspect;

    const decision = yield* mutation(
      'decision',
      {
        method: decisionSubmitted$.value,
        loader: function* ({ params }) {
          const requests: readonly ReviewDecisionRequest[] =
            'shape' in params ? [params] : params;
          let result: ReviewApiQueue | undefined;
          for (const request of requests) {
            result = yield* craftUntilSettled(
              CraftHttpClient.post(({ response }) => ({
                url: '/api/decisions',
                payload: request,
                success: response<ReviewApiQueue>(),
              })),
            );
          }
          return result;
        },
      },
      ({ resource, hasException }) => ({
        decisionFailed: craftUse(
          craftComputed('decisionFailed', function* () {
            return (
              String(yield* resource.status()) === 'exception' ||
              (yield* hasException())
            );
          }),
        ),
      }),
    );
    const { decisionFailed } = decision;

    const reopen = yield* mutation(
      'reopen',
      {
        method: decisionReopened$.value,
        loader: function* ({ params }) {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: '/api/decisions/reopen',
            payload: params,
            success: response<ReviewApiQueue>(),
          }));
        },
      },
      ({ resource, hasException }) => ({
        reopenFailed: craftUse(
          craftComputed('reopenFailed', function* () {
            return (
              String(yield* resource.status()) === 'exception' ||
              (yield* hasException())
            );
          }),
        ),
      }),
    );
    const { reopenFailed } = reopen;

    const regenerate = yield* mutation(
      'regenerate',
      {
        method: regenerationConfirmed$.value,
        loader: function* () {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: '/api/regenerate',
            payload: {},
            success: response<ReviewApiQueue>(),
          }));
        },
      },
      ({ resource, hasException }) => ({
        regenerationFailed: craftUse(
          craftComputed('regenerationFailed', function* () {
            return (
              String(yield* resource.status()) === 'exception' ||
              (yield* hasException())
            );
          }),
        ),
      }),
    );
    const { regenerationFailed } = regenerate;

    const iterationHandoff = yield* mutation(
      'iterationHandoff',
      {
        method: iterationHandoffRequested$.value,
        loader: function* () {
          return yield* CraftHttpClient.post(({ response }) => ({
            url: '/api/iteration-handoff',
            payload: {},
            success: response<ReviewIterationHandoffResponse>(),
          }));
        },
      },
      ({ resource, hasException }) => ({
        iterationHandoffFailed: craftUse(
          craftComputed('iterationHandoffFailed', function* () {
            return (
              String(yield* resource.status()) === 'exception' ||
              (yield* hasException())
            );
          }),
        ),
      }),
    );
    const { iterationHandoffFailed } = iterationHandoff;

    const applyFolderLayout = yield* mutation('applyFolderLayout', {
      method: folderLayoutApplyRequested$.value,
      loader: function* () {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/folder-layout/apply',
          payload: {},
          success: response<ReviewApiQueue>(),
        }));
      },
    });

    const templateAgentReview = yield* mutation('templateAgentReview', {
      method: templateAgentRequested$.value,
      loader: function* ({ params }) {
        return yield* CraftHttpClient.post(({ response }) => ({
          url: '/api/template-agent',
          payload: params,
          success: response<ReviewApiQueue>(),
        }));
      },
    });

    const { closeReview, closeReviewSession, closeReviewFailed } =
      yield* CloseReview();

    // Infer the query before delegating to it: combining both expressions can
    // exceed TypeScript's union complexity limit when this file is checked first.
    const reviewQueue = yield* craftPrivate(
      query(
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
          insertReactOnMutation(applyFolderLayout, {
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
          insertReactOnMutation(templateAgentReview, {
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
      ),
    );

    const review = reviewQueue;

    const fileUrl = function* (file: string | undefined, line?: number) {
      return ideLinkUrl(
        (yield* review.value())?.sourceLinksAvailable,
        file,
        yield* ide(),
        line,
      );
    };
    const sourceUrl = function* (reference: string, line?: number) {
      return yield* fileUrl(sourcePathOf(reference), line);
    };

    yield* craftComputed('sessionHistory', function* () {
      return (yield* review.value())?.history ?? [];
    });

    const reviewCards = yield* craftComputed('reviewCards', function* () {
      return ((yield* review.value())?.cards ?? []).filter(
        (card) => card.kind !== 'folder-layout',
      );
    });
    const cards = yield* craftComputed('cards', function* () {
      // Filters describe the inventory views. The review queue is already the
      // actionable subset, so a filter selected elsewhere must not silently
      // hide decisions when the filters are not on screen.
      if ((yield* devtoolView()) === 'review') {
        return yield* reviewCards();
      }
      if ((yield* devtoolView()) === 'folder-layout') {
        return ((yield* review.value())?.cards ?? []).filter(
          (card) => card.kind === 'folder-layout',
        );
      }
      const component = (yield* componentFilter()).trim().toLowerCase();
      const searchTerm = (yield* searchTextFilter()).trim().toLowerCase();
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
        if (searchTerm) {
          const searchable = [
            card.subject,
            card.reason,
            ...card.changes,
            ...(card.kind === 'template' ? [card.statement] : []),
          ]
            .join(' ')
            .toLowerCase();
          if (!searchable.includes(searchTerm)) return false;
        }
        return true;
      });
    });
    const { activeIndex } = navigationParams;
    yield* craftComputed('folderLayouts', function* () {
      return (yield* review.value())?.folderLayouts ?? [];
    });
    yield* craftComputed('bypasses', function* () {
      return (yield* review.value())?.bypasses ?? [];
    });
    yield* craftComputed('styleAdoption', function* () {
      return (yield* review.value())?.styleAdoption;
    });
    yield* craftComputed('visualAssets', function* () {
      if ((yield* kindFilter()) !== 'all' && (yield* kindFilter()) !== 'visual')
        return [];
      if (
        (yield* directionFilter()) !== 'all' ||
        (yield* stateFilter()) !== 'all'
      )
        return [];
      const component = (yield* componentFilter()).trim().toLowerCase();
      const searchTerm = (yield* searchTextFilter()).trim().toLowerCase();
      return ((yield* review.value())?.visualAssets ?? []).filter((asset) => {
        const scenarios = asset.scenarios.join(' ').toLowerCase();
        return (
          (!component || scenarios.includes(component)) &&
          (!searchTerm ||
            `${asset.evidence} ${scenarios}`.toLowerCase().includes(searchTerm))
        );
      });
    });
    const visualTests = yield* craftComputed('visualTests', function* () {
      if ((yield* kindFilter()) !== 'all' && (yield* kindFilter()) !== 'visual')
        return [];
      if ((yield* directionFilter()) !== 'all') return [];
      const component = (yield* componentFilter()).trim().toLowerCase();
      const searchTerm = (yield* searchTextFilter()).trim().toLowerCase();
      const state = yield* stateFilter();
      return ((yield* review.value())?.visualTests ?? []).filter(
        (test) =>
          (state === 'all' || test.state === state) &&
          (!component || test.component.toLowerCase().includes(component)) &&
          (!searchTerm ||
            `${test.subject} ${test.scenario}`
              .toLowerCase()
              .includes(searchTerm)),
      );
    });
    yield* craftComputed('selectedVisualAsset', function* () {
      const test = yield* selectedVisualTest();
      if (!test) return undefined;
      return (yield* review.value())?.visualAssets.find(
        (asset) => asset.evidence === test.evidence,
      );
    });
    const visualReviewCard = yield* craftComputed(
      'visualReviewCard',
      function* () {
        const test = yield* selectedVisualTest();
        if (!test) return undefined;
        return (yield* review.value())?.cards.find(
          (card) =>
            card.kind === 'visual' &&
            card.reviewMembers.some(
              (member) => member.subject === test.subject,
            ),
        );
      },
    );
    yield* craftComputed('templateObligations', function* () {
      if (
        (yield* kindFilter()) !== 'all' &&
        (yield* kindFilter()) !== 'template'
      )
        return [];
      const component = (yield* componentFilter()).trim().toLowerCase();
      const searchTerm = (yield* searchTextFilter()).trim().toLowerCase();
      const state = yield* stateFilter();
      const direction = yield* directionFilter();
      return ((yield* review.value())?.templateObligations ?? []).filter(
        (obligation) =>
          (state === 'all' || obligation.state === state) &&
          (direction === 'all' || obligation.direction === direction) &&
          (!component ||
            obligation.component.toLowerCase().includes(component)) &&
          (!searchTerm ||
            `${obligation.subject} ${obligation.statement}`
              .toLowerCase()
              .includes(searchTerm)),
      );
    });
    const templateReviewGroups = yield* craftPrivate(
      craftComputed('templateReviewGroups', function* () {
        return groupTemplateReviewCards(
          ((yield* review.value())?.cards ?? []).filter(
            (card) => card.kind === 'template',
          ),
        );
      }),
    );
    const activeTemplateGroup = yield* craftComputed(
      'activeTemplateGroup',
      function* () {
        return (yield* templateReviewGroups())[
          yield* activeTemplateGroupIndex()
        ];
      },
    );
    yield* craftComputed('templateGroupCount', function* () {
      return (yield* templateReviewGroups()).length;
    });
    yield* craftComputed('templateAgentAvailable', function* () {
      return (yield* review.value())?.templateAgentAvailable ?? false;
    });
    const templateGroupVisible = yield* craftComputed(
      'templateGroupVisible',
      function* () {
        return (
          (yield* devtoolView()) === 'review' &&
          (yield* current())?.kind === 'template' &&
          Boolean(yield* activeTemplateGroup())
        );
      },
    );
    yield* craftComputed('workspaceInert', function* () {
      return (
        (yield* regenerationDialogOpen()) || (yield* iterationDialogOpen())
      );
    });
    yield* craftComputed('reviewPanelHidden', function* () {
      const view = yield* devtoolView();
      return view !== 'review' && view !== 'folder-layout';
    });
    const current = yield* craftComputed('current', function* () {
      const list = yield* cards();
      return list[yield* activeIndex()];
    });
    const activeCardForPanel = deepYieldable(
      yield* craftPrivate(
        craftComputed('activeCardForPanel', function* (): Generator<
          unknown,
          readonly ReviewCard[],
          unknown
        > {
          const card = yield* current();
          return card && !(yield* templateGroupVisible()) ? [card] : [];
        }),
      ),
    );
    const templateSource = yield* craftPrivate(
      query('templateSource', {
        params: function* () {
          const selected = yield* current();
          return selected?.kind === 'template'
            ? { subject: selected.subject, revision: selected.revision }
            : { subject: '', revision: '' };
        },
        loader: function* ({ params }) {
          if (!params.subject) return undefined;
          return yield* craftUntilSettled(
            CraftHttpClient.get(({ response }) => ({
              url: `/api/template-detail?subject=${encodeURIComponent(params.subject)}`,
              success: response<TemplateSourceDetail>(),
            })),
          );
        },
      }),
    );
    const sourceDetail = templateSource;
    const activeSourceLine = yield* craftComputed(
      'activeSourceLine',
      function* () {
        const card = yield* current();
        if (card?.kind !== 'template') return undefined;
        const detail = yield* sourceDetail.value();
        if (detail?.subject !== card.subject) return undefined;
        return detail.renderSites?.[0]?.line ?? detail.element?.line;
      },
    );
    yield* craftComputed('activeSubjectLabel', function* () {
      const card = yield* current();
      if (!card) return '';
      const line = yield* activeSourceLine();
      return `${componentOf(card.subject)}${line ? `:${line}` : ''}`;
    });
    yield* craftComputed('activeReasonLabel', function* () {
      const card = yield* current();
      return card ? reasonText(card.reason, yield* t()) : '';
    });
    yield* craftComputed('clusterMembersLabel', function* () {
      return (yield* t()).clusterMembers;
    });
    const activeSourceUrl = yield* craftComputed(
      'activeSourceUrl',
      function* () {
        const card = yield* current();
        if (!card) return '';
        return (
          ideLinkUrl(
            (yield* review.value())?.sourceLinksAvailable,
            sourcePathOf(card.subject),
            yield* ide(),
            yield* activeSourceLine(),
          ) ?? ''
        );
      },
    );
    yield* craftComputed('sourceLinkHidden', function* () {
      return (yield* activeSourceUrl()).length === 0;
    });
    yield* craftComputed('visualEvidence', function* () {
      return (yield* current())?.kind === 'visual';
    });
    yield* craftComputed('folderLayoutEvidence', function* () {
      return (yield* current())?.kind === 'folder-layout';
    });
    yield* craftComputed('bypassEvidence', function* () {
      const kind = (yield* current())?.kind;
      return kind === 'eslint-disable' || kind === 'architecture-waiver';
    });
    /** Every sentence, in the language on screen. */
    const t = yield* craftComputed('t', function* () {
      return MESSAGES[yield* locale()];
    });
    function* applyZoom(mode: ZoomMode) {
      yield* zoom.choose(mode);
      fitReplay = mode === 'fit';
      applyReplayScale();
    }
    yield* craftMethod('openRegenerationDialog', function* () {
      regenerationDialogRequested$.emit();
    });
    yield* craftMethod('closeRegenerationDialog', function* () {
      regenerationDialogClosed$.emit();
    });
    yield* craftMethod('confirmRegeneration', function* () {
      yield* navigationParams.setScenarioAfterRegeneration('');
      regenerationConfirmed$.emit('regenerate');
      clearReason();
    });
    yield* craftMethod('openIterationDialog', function* () {
      iterationDialogRequested$.emit();
    });
    yield* craftMethod('closeIterationDialog', function* () {
      iterationDialogClosed$.emit();
    });
    yield* craftMethod('confirmIterationHandoff', function* () {
      iterationHandoffRequested$.emit(++iterationHandoffRequest);
    });
    yield* craftMethod('copyIterationPrompt', function* () {
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
    });
    yield* craftMethod('dismissFolderLayoutApply', function* () {
      yield* folderLayoutApplyDialogDismissed.dismiss();
    });
    yield* craftMethod('confirmFolderLayoutApply', function* () {
      folderLayoutApplyRequested$.emit(++folderLayoutApplyRequest);
    });
    yield* craftMethod('copyFolderLayoutCommand', function* () {
      const value = (yield* review.value())?.folderLayoutApply?.command;
      if (!value) return;
      const clipboard = reviewClipboard();
      if (clipboard) void clipboard.writeText(value).catch(() => undefined);
      yield* folderLayoutApplyCopied.markCopied();
    });
    yield* craftMethod('chooseDevtoolView', function* (value: DevtoolView) {
      yield* navigationParams.setViewForDevtoolChoice(value);
    });
    yield* craftMethod(
      'inspectApplicationCapture',
      function* (subject: string) {
        const card = ((yield* review.value())?.cards ?? []).find((c) =>
          c.cluster.includes(subject),
        );
        if (!card) return;
        yield* navigationParams.setViewForApplicationReview('review');
        yield* navigationParams.setScenarioForApplicationReview(card.shape);
      },
    );
    yield* craftMethod(
      'decideApplicationCaptures',
      function* (value: ApplicationVerdict) {
        const available = (yield* review.value())?.cards ?? [];
        const requests = value.subjects.flatMap((subject) => {
          const card = available.find(
            (c) =>
              c.kind === 'visual' &&
              c.evidenceMode === 'screenshot' &&
              c.cluster.length === 1 &&
              c.subject === subject,
          );
          return card
            ? [
                {
                  shape: card.shape,
                  id: card.id,
                  revision: card.revision,
                  verdict: value.verdict,
                  ...(value.note ? { note: value.note } : {}),
                },
              ]
            : [];
        });
        if (requests.length) decisionSubmitted$.emit(requests);
      },
    );
    yield* craftComputed('applicationCaptures', function* () {
      return (yield* review.value())?.applicationCaptures ?? [];
    });
    yield* craftMethod('selectVisualTest', function* (index: number) {
      const test = (yield* visualTests())[index];
      if (!test) return;
      yield* navigationParams.setScenarioForVisualTestSelection(test.subject);
    });
    yield* craftMethod('openVisualReview', function* () {
      const card = yield* visualReviewCard();
      if (!card) return;
      yield* navigationParams.setViewForVisualReview('review');
      yield* navigationParams.setScenarioForVisualReview(card.shape);
    });
    /**
     * The groups this reason actually points at.
     *
     * Derived from the text every time rather than tracked alongside it. A
     * reviewer who deletes a token has removed that reference, and there is no
     * second list left holding a claim the reason no longer makes.
     */
    yield* craftComputed('activeMentions', function* () {
      const text = yield* note();
      return (yield* mentions()).filter((mention) =>
        mentionPattern(mention.id).test(text),
      );
    });
    const member = yield* craftComputed('member', function* () {
      return (yield* current())?.members[0];
    });
    const replayTarget = yield* craftPrivate(
      craftComputed('replayTarget', function* () {
        return (yield* member())?.metadata?.target ?? 'body';
      }),
    );
    const canReplay = yield* craftComputed('canReplay', function* () {
      const card = yield* current();
      if (card?.kind === 'visual' && card.evidenceMode === 'screenshot')
        return false;
      return Boolean((yield* member())?.snapshot);
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
    yield* craftComputed('coveredCount', function* () {
      return (yield* member())?.metadata?.coverage?.occluded ?? 0;
    });
    /**
     * The fidelity finding as a sentence, in the reviewer's language.
     *
     * `undefined` covers two different silences: the frame would not open, and
     * there is no attested digest to check against. Both leave the decision
     * degraded, and both have to say which.
     */
    yield* craftComputed('fidelitySentence', function* () {
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
    const chrome = yield* craftComputed('chrome', function* () {
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
    yield* craftComputed('overlayHint', function* () {
      const covering = yield* chrome();
      const say = yield* t();
      return covering.length === 1
        ? say.liftHint(covering[0] ?? '')
        : say.liftHintMany(covering.length);
    });
    const degraded = yield* craftComputed('degraded', function* () {
      const card = yield* current();
      if (card?.kind === 'visual' && card.evidenceMode === 'screenshot')
        return false;
      if ((yield* current())?.kind !== 'visual') return false;
      if (!(yield* canReplay())) return true;
      if (!(yield* showingReplay())) return true;
      const state = yield* replay();
      return !state.loaded || !state.faithful;
    });
    yield* craftComputed('reviewFailed', function* () {
      return (yield* review.status()) === 'exception';
    });
    yield* craftComputed('regenerationAvailable', function* () {
      return (yield* review.value())?.regeneration !== undefined;
    });
    yield* craftComputed('iterationHandoffAvailable', function* () {
      return (yield* review.value())?.iteration !== undefined;
    });
    yield* craftComputed('iterationHandoffReady', function* () {
      return (
        (yield* iterationPreparationStarted()) &&
        !(yield* iterationHandoff.isLoading()) &&
        Boolean(yield* iterationHandoff.value())
      );
    });
    yield* craftComputed('previousRegenerationDecisions', function* () {
      return (yield* review.value())?.regeneration?.previousDecisions ?? 0;
    });
    yield* craftMethod('toggleTemplateCard', function* (id: string) {
      yield* selectedTemplateIds.toggle(id);
    });
    yield* craftMethod('selectAllTemplateCards', function* () {
      const group = yield* activeTemplateGroup();
      if (!group) return;
      yield* selectedTemplateIds.selectPending(
        group.cards
          .filter((card) => card.state !== 'removed')
          .map((card) => card.id),
      );
    });
    yield* craftMethod('clearTemplateSelection', function* () {
      yield* selectedTemplateIds.clear();
    });
    yield* craftMethod('selectHumanTemplateCards', function* () {
      const group = yield* activeTemplateGroup();
      if (!group) return;
      const results =
        (yield* review.value())?.templateAgentResults ??
        (yield* templateAgentReview.value())?.templateAgentResults ??
        [];
      yield* selectedTemplateIds.selectHuman(
        group.cards
          .filter(
            (card) =>
              card.state !== 'removed' &&
              (card.validationPolicy === 'human-required' ||
                results.some(
                  (result) =>
                    result.id === card.id &&
                    result.revision === card.revision &&
                    result.outcome === 'needs-human',
                )),
          )
          .map((card) => card.id),
      );
    });
    yield* craftMethod('acceptTemplateSelection', function* () {
      const group = yield* activeTemplateGroup();
      const selected = new Set(yield* selectedTemplateIds());
      if (!group) return;
      const requests: ReviewDecisionRequest[] = group.cards
        .filter((card) => selected.has(card.id) && card.state !== 'removed')
        .map((card) => ({
          shape: card.shape,
          id: card.id,
          revision: card.revision,
          verdict: 'ok',
        }));
      if (requests.length) decisionSubmitted$.emit(requests);
    });
    yield* craftMethod('requestTemplateReject', function* () {
      yield* rejectionAttempted.showForTemplateRejectedBatch();
    });
    yield* craftMethod('cancelTemplateReject', function* () {
      yield* rejectionAttempted.clear();
      yield* note.clearForTemplateRejection();
    });
    yield* craftMethod('submitTemplateReject', function* () {
      const group = yield* activeTemplateGroup();
      const selected = new Set(yield* selectedTemplateIds());
      const writtenNote = proseOf(yield* note());
      if (!group || !writtenNote) return;
      const requests: ReviewDecisionRequest[] = group.cards
        .filter((card) => selected.has(card.id) && card.state !== 'removed')
        .map((card) => ({
          shape: card.shape,
          id: card.id,
          revision: card.revision,
          verdict: 'rejected',
          note: writtenNote,
        }));
      if (requests.length) decisionSubmitted$.emit(requests);
    });
    yield* craftMethod('navigateTemplateGroup', function* (offset: number) {
      const groups = yield* templateReviewGroups();
      const index = yield* activeTemplateGroupIndex();
      const target = groups[index + offset];
      const card = target?.cards.find(
        (candidate) => candidate.state !== 'removed',
      );
      if (!card) return;
      clearReason();
      navigation$.emit(index + offset);
      yield* navigationParams.setScenarioForTemplateGroup(card.shape);
    });
    yield* craftMethod('writeTemplateGroupNote', function* (value: string) {
      yield* note.writeTemplateGroup(value);
    });
    yield* craftMethod('delegateTemplateSelection', function* () {
      const group = yield* activeTemplateGroup();
      const selected = new Set(yield* selectedTemplateIds());
      if (!group) return;
      const cards = group.cards.filter(
        (card) => selected.has(card.id) && card.state !== 'removed',
      );
      if (!cards.length) return;
      templateAgentRequested$.emit({
        cards: cards.map(({ id, revision }) => ({ id, revision })),
      });
    });
    yield* craftMethod('movePrevious', function* () {
      const index = yield* activeIndex();
      const nextIndex = Math.max(0, index - 1);
      const card = (yield* cards())[nextIndex];
      if (!card) return;
      clearReason();
      navigation$.emit(nextIndex);
      yield* navigationParams.setScenarioPrevious(card.shape);
    });
    yield* craftMethod('moveNext', function* () {
      const list = yield* cards();
      const index = yield* activeIndex();
      const nextIndex = Math.min(Math.max(0, list.length - 1), index + 1);
      const card = list[nextIndex];
      if (!card) return;
      clearReason();
      navigation$.emit(nextIndex);
      yield* navigationParams.setScenarioNext(card.shape);
    });
    yield* craftMethod('selectCard', function* (index: number) {
      const card = (yield* cards())[index];
      if (!card) return;
      clearReason();
      navigation$.emit(index);
      yield* navigationParams.setScenarioForCardSelection(card.shape);
    });
    yield* craftMethod(
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

    yield* craftMethod('inspectFrame', function* () {
      yield* runInspection(yield* hideChrome());
    });

    yield* craftMethod('toggleChrome', function* () {
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
    const trackSelection = yield* craftPrivate(
      craftMethod('trackSelection', function* (paths: readonly string[]) {
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
      }),
    );

    /** Paints the nodes a reference stands for, while it is pointed at. */
    function* updateMentionPreview(id: number | undefined) {
      const holder = reviewDocument.getElementById(FRAME_ID);
      const view =
        holder instanceof HTMLIFrameElement ? viewOf(holder) : undefined;
      if (!view) return;
      const found =
        id === undefined
          ? undefined
          : (yield* mentions()).find((one) => one.id === id);
      markHighlight(view, found?.paths ?? []);
    }
    yield* craftMethod('previewMention', function* (id: number | undefined) {
      yield* updateMentionPreview(id);
    });

    yield* craftMethod('changeZoomFromEvent', function* (event: Event) {
      const value = eventValue(event);
      if (isZoomMode(value)) yield* applyZoom(value);
    });

    yield* craftMethod('handleNoteInput', function* (event: Event) {
      const field = event.currentTarget;
      if (!(field instanceof HTMLElement)) return;
      freezePick();
      yield* note.writeFromInput(textOf(field));
    });

    yield* craftMethod('previewMentionFromEvent', function* (event: Event) {
      const target = event.target;
      const chip =
        target instanceof Element ? target.closest(`[${MENTION_ID}]`) : null;
      const id = chip?.getAttribute(MENTION_ID);
      yield* updateMentionPreview(id ? Number(id) : undefined);
    });

    yield* craftMethod('pasteReasonText', function* (event: Event) {
      const clipboard =
        event instanceof ClipboardEvent ? event.clipboardData : null;
      if (!clipboard) return;
      event.preventDefault();
      const text = clipboard.getData('text/plain');
      reviewDocument
        .getSelection()
        ?.getRangeAt(0)
        .insertNode(reviewDocument.createTextNode(text));
      reviewDocument.getSelection()?.collapseToEnd();
      const field = event.currentTarget;
      if (field instanceof HTMLElement) {
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    yield* craftMethod('decide', function* (verdict: DecisionVerdict) {
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

    yield* craftMethod('retire', function* () {
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

    yield* craftExpose('review', review);
    yield* craftExpose('closeReview', closeReview);
    yield* craftExpose('selectedVisualTest', selectedVisualTest);
    yield* craftExpose('activeTemplateGroupIndex', activeTemplateGroupIndex);
    yield* craftExpose('activeIndex', activeIndex);
    yield* craftExpose('activeCardForPanel', activeCardForPanel);
    yield* craftExpose('sourceDetail', sourceDetail);
    yield* craftExpose('hasNote', hasNote);
    yield* craftExpose('rejectionReasonMissing', rejectionReasonMissing);
    yield* craftExpose('inspectFailed', inspectFailed);
    yield* craftExpose('decisionFailed', decisionFailed);
    yield* craftExpose('reopenFailed', reopenFailed);
    yield* craftExpose('iterationHandoffFailed', iterationHandoffFailed);
    yield* craftExpose(
      'iterationPreparationNotStarted',
      iterationPreparationNotStarted,
    );
    yield* craftExpose('closeReviewFailed', closeReviewFailed);
    yield* craftExpose(
      'folderLayoutApplyDialogOpen',
      folderLayoutApplyDialogOpen,
    );
    yield* craftExpose('regenerationFailed', regenerationFailed);
    yield* craftExpose('closeReviewSession', closeReviewSession);
    yield* craftExpose('devtoolView', devtoolView);
    yield* craftExpose('findings', findings);
    yield* craftExpose('replay', replay);
    yield* craftExpose('showingReplay', showingReplay);
    yield* craftExpose('fellBack', fellBack);
    yield* craftExpose('overlayLabel', overlayLabel);
    yield* craftExpose('rememberCaret', rememberCaret);
    yield* craftExpose('locale', locale);
    yield* craftExpose('fileUrl', fileUrl);
    yield* craftExpose('sourceUrl', sourceUrl);
    yield* craftExpose('noteState', noteState);
  },
);
