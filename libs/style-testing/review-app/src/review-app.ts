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
  input,
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
  markHighlight,
  markSelection,
  onPick,
  REVIEW_TOLERANCE,
  TIERS,
  viewOf,
  whenReady,
} from '../../src/lib/review/frame';
import type { LayoutDigest } from '../../src/lib/digest';
import type { FidelityReason } from '../../src/lib/replay';
import { MESSAGES } from './messages';
import {
  applyLocale,
  applyTheme,
  initialLocale,
  initialTheme,
  storeLocale,
  storeTheme,
  type Locale,
  type ThemeChoice,
} from './preferences';

/**
 * The id of the frame holding the card being reviewed.
 *
 * Every card in the queue renders a holder, but only one of them carries this
 * id: `getElementById` returns the first match in the document, so a shared id
 * handed the checker the *first* card's frame — a blank page — whenever the
 * reviewer had moved past card one. The check was right and its subject was
 * wrong, which is the worst way for a check to fail.
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
type DevtoolView = 'assets' | 'visual' | 'template' | 'review';
type RetirementReason = 'superseded' | 'defect' | 'derivation';
type KindFilter = 'all' | 'visual' | 'template' | 'removal';
type StateFilter =
  | 'all'
  | 'current'
  | 'renewed'
  | 'missing'
  | 'review'
  | 'removed';
type DirectionFilter = 'all' | 'render' | 'command';
type ZoomMode = 'fit' | 'actual';
/**
 * Which artefact is on screen.
 *
 * `auto` is the state a card opens in, and it is not a third view: it defers
 * to the replay's own fidelity check, so a frozen page that fails that check
 * is never the first thing a reviewer sees. Choosing either view pins it —
 * a reviewer who asks for the page after being sent to the photograph gets
 * the page, broken and labelled as such.
 */
type EvidenceView = 'auto' | 'replay' | 'image';

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

/**
 * One line of the legend, drawn from the same object that paints the frame.
 *
 * The swatch takes its colour and its border style from `TIERS`, so a legend
 * that says "dotted orange" cannot survive the outline becoming something
 * else.
 */
const legendEntry = (
  tier: (typeof TIERS)[keyof typeof TIERS],
  options: {
    readonly hidden?: () => Generator<unknown, boolean>;
    /** Overrides the tier's wording when the card knows something better. */
    readonly label?: () => Generator<unknown, string>;
  } = {},
) =>
  li(
    {
      class: 'tier-legend-entry',
      ...(options.hidden ? { hidden: options.hidden } : {}),
    },
    [
      span({
        class: 'tier-swatch',
        'aria-hidden': 'true',
        style: `border-color:${tier.colour};border-style:${tier.style}`,
      }),
      options.label ?? tier.label,
    ],
  );

/**
 * A group of nodes the reason points at, and the token that stands for it.
 *
 * One reason usually carries more than one complaint — this row is misaligned,
 * and further down that button is cut — so the reference has to live *inside*
 * the sentence it belongs to rather than beside the whole text. The token is
 * plain text in the textarea, which makes the reason the only thing that has
 * to survive: deleting a token deletes its reference, with no second list to
 * keep in step.
 */
interface Mention {
  readonly id: number;
  readonly paths: readonly string[];
}

const mentionToken = (id: number, count: number): string =>
  `[#${id}: ${count} node${count === 1 ? '' : 's'}]`;

/**
 * The reason field is a `contenteditable`, not a `textarea`.
 *
 * A textarea cannot hold anything but characters, so a reference in it could
 * only ever be the literal `[#1: 2 nodes]` — legible, but no more than that: no
 * way to see which nodes it means without leaving the sentence and reading a
 * list beside it. As an element, the reference is a chip that says what it
 * points at on hover, and the list beside the field stops being needed.
 *
 * The plain text is still the model. Everything downstream — the prose, which
 * groups are live, which sentence each one carries — reads the serialised
 * string, so the chips are a rendering of the reason and never a second
 * version of it.
 */
const MENTION_ID = 'data-mention-id';

const describePaths = (paths: readonly string[]): string =>
  paths.length > 6
    ? `${paths.slice(0, 6).join(' · ')} · +${paths.length - 6} more`
    : paths.join(' · ');

/** Re-labels a reference in place, so refining a selection edits it. */
const relabelChip = (chip: HTMLElement, paths: readonly string[]): void => {
  chip.setAttribute('data-count', String(paths.length));
  chip.setAttribute('data-paths', describePaths(paths));
  chip.textContent = mentionToken(
    Number(chip.getAttribute(MENTION_ID) ?? 0),
    paths.length,
  );
};

const chipFor = (
  document: Document,
  id: number,
  paths: readonly string[],
): HTMLElement => {
  const chip = document.createElement('span');
  chip.className = 'mention-chip';
  chip.setAttribute(MENTION_ID, String(id));
  chip.setAttribute('data-count', String(paths.length));
  // Not `title`: a native tooltip waits a second, cannot be styled, and would
  // sit on top of the one drawn here.
  chip.setAttribute('data-paths', describePaths(paths));
  // Atomic: the caret steps over it and a backspace removes the whole
  // reference, which is what deleting a reference should mean.
  chip.contentEditable = 'false';
  chip.textContent = mentionToken(id, paths.length);
  return chip;
};

/** The field, as the plain text every rule downstream is written against. */
const textOf = (field: HTMLElement): string => {
  let text = '';
  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? '';
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      if (child.hasAttribute(MENTION_ID)) {
        text += child.textContent ?? '';
        continue;
      }
      if (child.tagName === 'BR') {
        text += '\n';
        continue;
      }
      // A browser wraps new lines in `div`s of its own making.
      if (text && !text.endsWith('\n')) text += '\n';
      walk(child);
    }
  };
  walk(field);
  return text;
};

const ANY_MENTION = /\[#\d+: \d+ nodes?\]/g;

const mentionPattern = (id: number): RegExp =>
  new RegExp(`\\[#${id}: \\d+ nodes?\\]`);

/** The prose of a reason, with the reference tokens taken back out. */
const proseOf = (text: string): string =>
  text
    .replace(ANY_MENTION, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

/**
 * What a reference carries: everything written since the previous one.
 *
 * The first rule tried was "the sentence the token stands in", and it was
 * wrong for the way people actually write. A reviewer types the complaint,
 * ends it, and *then* points at the group — so the caret is past the full stop
 * and the token opens the next sentence rather than closing its own.
 *
 * Position, not punctuation, settles it: each reference takes the text between
 * the reference before it and itself. Referencing first and explaining after
 * reads the other way round, so a group with nothing before it takes what
 * follows instead.
 */
const MENTION_WITH_ID = /\[#(\d+): \d+ nodes?\]/g;

const noteForMention = (text: string, id: number): string => {
  const tokens = [...text.matchAll(MENTION_WITH_ID)];
  const at = tokens.findIndex((token) => Number(token[1]) === id);
  const self = tokens[at];
  if (at < 0 || !self || self.index === undefined) return proseOf(text);

  const previous = tokens[at - 1];
  const from =
    previous && previous.index !== undefined
      ? previous.index + previous[0].length
      : 0;
  const before = proseOf(text.slice(from, self.index));
  if (before) return before;

  const next = tokens[at + 1];
  const to = next?.index ?? text.length;
  return proseOf(text.slice(self.index + self[0].length, to)) || proseOf(text);
};

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
    // Read from the environment before the first paint, so nothing renders in
    // the wrong language or the wrong theme and then corrects itself.
    const locale = yield* state('locale', initialLocale(), ({ set }) => ({
      choose: (value: Locale) => set(value),
    }));
    const theme = yield* state('theme', initialTheme(), ({ set }) => ({
      choose: (value: ThemeChoice) => set(value),
    }));
    const devtoolView = yield* state(
      'devtoolView',
      'review' as DevtoolView,
      ({ set }) => ({ choose: (value: DevtoolView) => set(value) }),
    );
    const retirementReason = yield* state(
      'retirementReason',
      'superseded' as RetirementReason,
      ({ set }) => ({ choose: (value: RetirementReason) => set(value) }),
    );
    const componentFilter = yield* state('componentFilter', '', ({ set }) => ({
      write: (value: string) => set(value),
    }));
    const textFilter = yield* state('textFilter', '', ({ set }) => ({
      write: (value: string) => set(value),
    }));
    const kindFilter = yield* state(
      'kindFilter',
      'all' as KindFilter,
      ({ set }) => ({
        choose: (value: KindFilter) => set(value),
      }),
    );
    const stateFilter = yield* state(
      'stateFilter',
      'all' as StateFilter,
      ({ set }) => ({ choose: (value: StateFilter) => set(value) }),
    );
    const directionFilter = yield* state(
      'directionFilter',
      'all' as DirectionFilter,
      ({ set }) => ({ choose: (value: DirectionFilter) => set(value) }),
    );
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
      'auto' as EvidenceView,
      ({ set }) => ({
        choose: (mode: EvidenceView) => set(mode),
        // Every card is judged on its own artefact: a pin taken on one card
        // must not decide what the next reviewer sees on the next one.
        release: () => set('auto'),
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
    const mentions = yield* state(
      'mentions',
      [] as readonly Mention[],
      ({ set }) => ({
        replace: (value: readonly Mention[]) => set(value),
        clear: () => set([]),
      }),
    );

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
      [] as readonly string[],
      ({ set }) => ({
        replace: (paths: readonly string[]) => set(paths),
        clear: () => set([]),
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
        yield* selection.replace(paths);
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
      const frame = document.getElementById(FRAME_ID);
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
      const field = document.getElementById(NOTE_ID);
      return field instanceof HTMLElement ? field : undefined;
    };
    const rememberCaret = (): void => {
      const field = reasonField();
      const selection = document.getSelection();
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
    const inspect = yield* mutation('inspectReplay', {
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
      loader: async ({ params }): Promise<ReplayState> => {
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

        const chrome = markTiers(view, {
          root: params.target,
          attested: params.attested,
          changed: params.changed,
          occluded: params.occluded,
          dimDecor: true,
          hideChrome: params.hideChrome,
          ...(params.colorScheme ? { colorScheme: params.colorScheme } : {}),
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
          queryResource.value() ?? {
            items: 0,
            decisions: 0,
            cards: [],
            visualAssets: [],
            visualTests: [],
            templateObligations: [],
            diagnostics: [],
          },
      }),
    );

    const cards = craftComputed('cards', function* () {
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
      return Math.min(yield* selectedIndex(), list.length - 1);
    });
    const current = craftComputed('current', function* () {
      const list = yield* cards();
      return list[yield* activeIndex()];
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
    const chooseLocale = craftMethod('chooseLocale', function* (value: Locale) {
      yield* locale.choose(value);
      storeLocale(value);
      applyLocale(value, document.documentElement);
    });
    const chooseTheme = craftMethod(
      'chooseTheme',
      function* (value: ThemeChoice) {
        yield* theme.choose(value);
        storeTheme(value);
        applyTheme(value, document.documentElement);
      },
    );
    const chooseDevtoolView = craftMethod(
      'chooseDevtoolView',
      function* (value: DevtoolView) {
        yield* devtoolView.choose(value);
      },
    );
    const chooseRetirementReason = craftMethod(
      'chooseRetirementReason',
      function* (value: RetirementReason) {
        yield* retirementReason.choose(value);
      },
    );
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
    const overlayLabel = craftComputed('overlayLabel', function* () {
      const covering = yield* chrome();
      const say = yield* t();
      const lifted = yield* hideChrome();
      // Named, not counted, when there is one of them: "Hide 1 overlay" asks
      // the reviewer what an overlay is; `button.clear-cache-btn` tells them
      // exactly what is about to disappear.
      if (covering.length === 1) {
        const what = covering[0] ?? '';
        return lifted ? say.showOne(what) : say.liftOne(what);
      }
      return lifted
        ? say.showMany(covering.length)
        : say.liftMany(covering.length);
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
    const rejectionReasonMissing = craftComputed(
      'rejectionReasonMissing',
      function* () {
        return (yield* rejectionAttempted()) && !(yield* hasNote());
      },
    );
    const movePrevious = craftMethod('movePrevious', function* () {
      const index = yield* selectedIndex();
      yield* evidenceView.release();
      yield* selection.clear();
      clearReason();
      yield* note.clear();
      yield* selectedIndex.select(Math.max(0, index - 1));
    });
    const moveNext = craftMethod('moveNext', function* () {
      const list = yield* cards();
      const index = yield* selectedIndex();
      yield* evidenceView.release();
      yield* selection.clear();
      clearReason();
      yield* note.clear();
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
          yield* mentions.replace(known.filter((one) => one.id !== id));
          yield* note.write(textOf(field));
          return;
        }

        if (live && livePick !== undefined) {
          const id = livePick;
          relabelChip(live, paths);
          yield* mentions.replace(
            known.map((one) => (one.id === id ? { id, paths } : one)),
          );
          yield* note.write(textOf(field));
          return;
        }

        const id =
          known.reduce((highest, one) => Math.max(highest, one.id), 0) + 1;

        // Placed where the reviewer was typing, so a second complaint further
        // down the reason names a different group without either losing its
        // text. With no remembered caret — the very first thing they do is
        // point — it goes at the end.
        const at = document.createRange();
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
        const trail = document.createTextNode(' ');
        at.insertNode(trail);
        const chip = chipFor(document, id, paths);
        at.insertNode(chip);
        const previous = chip.previousSibling?.textContent ?? '';
        if (previous && !/\s$/.test(previous)) {
          chip.parentNode?.insertBefore(document.createTextNode(' '), chip);
        }

        const after = document.createRange();
        after.setStartAfter(trail);
        after.collapse(true);
        // Not `selection`: that name is a craft state in this component, and
        // shadowing it once turned `selection.clear()` into a call on the
        // DOM's own Selection, which has no such method.
        const domSelection = document.getSelection();
        domSelection?.removeAllRanges();
        domSelection?.addRange(after);
        caret = after.cloneRange();
        livePick = id;

        yield* mentions.replace([...known, { id, paths }]);
        yield* note.write(textOf(field));
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
        const holder = document.getElementById(FRAME_ID);
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
        yield* rejectionAttempted.show();
        document.getElementById(NOTE_ID)?.focus();
        return;
      }
      const pointed = yield* findings();
      yield* decision.mutate({
        shape: card.shape,
        id: card.id,
        revision: card.revision,
        verdict,
        ...(writtenNote ? { note: writtenNote } : {}),
        ...(pointed.length > 0 ? { findings: pointed } : {}),
        ...((yield* degraded()) ? { degraded: true } : {}),
      });
      yield* note.clear();
      yield* mentions.clear();
      yield* selection.clear();
      yield* rejectionAttempted.clear();
      // The field owns its own content, so emptying the state is not enough.
      clearReason();
    });

    const retire = craftMethod('retire', function* () {
      const card = yield* current();
      if (!card || card.kind !== 'removal') return;
      const writtenNote = proseOf(yield* note());
      if (!writtenNote) {
        yield* rejectionAttempted.show();
        document.getElementById(NOTE_ID)?.focus();
        return;
      }
      yield* decision.mutate({
        shape: card.shape,
        id: card.id,
        revision: card.revision,
        verdict: 'retire',
        retirementReason: yield* retirementReason(),
        note: writtenNote,
      });
      yield* note.clear();
      yield* rejectionAttempted.clear();
      clearReason();
    });

    return {
      review,
      decision,
      cards,
      visualAssets,
      visualTests,
      templateObligations,
      componentFilter,
      textFilter,
      kindFilter,
      stateFilter,
      directionFilter,
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
      retire,
      devtoolView,
      chooseDevtoolView,
      retirementReason,
      chooseRetirementReason,
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
      inspectFrame,
      toggleChrome,
      mentions,
      activeMentions,
      previewMention,
      rememberCaret,
      clearReason,
      freezePick,
      locale,
      theme,
      chooseLocale,
      chooseTheme,
      chooseZoom,
      t,
      fidelitySentence,
    };
  },
  ({
    review,
    decision,
    cards,
    visualAssets,
    visualTests,
    templateObligations,
    componentFilter,
    textFilter,
    kindFilter,
    stateFilter,
    directionFilter,
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
    retire,
    devtoolView,
    chooseDevtoolView,
    retirementReason,
    chooseRetirementReason,
    current,
    evidenceView,
    rememberCaret,
    clearReason,
    freezePick,
    previewMention,
    locale,
    theme,
    chooseLocale,
    chooseTheme,
    chooseZoom,
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
      div({ class: 'workspace' }, [
        aside({ class: 'queue-panel', 'aria-label': 'Review queue' }, [
          // In the sidebar rather than across the top. A full-width banner
          // repeating the name of the tool cost a band of height on every
          // card, and height is the thing a tall capture has none of.
          header({ class: 'panel-heading brand' }, [
            small({ class: 'eyebrow' }, function* () {
              return (yield* t()).brand;
            }),
            h1(function* () {
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
            // The two choices about the tool rather than about a render. In
            // the sidebar with the name, because neither belongs beside the
            // evidence: a reviewer sets them once and then judges renders.
            div({ class: 'preferences' }, [
              label(
                { class: 'field-label', htmlFor: 'review-locale' },
                function* () {
                  return (yield* t()).language;
                },
              ),
              select(
                'ReviewLocale',
                {
                  id: 'review-locale',
                  value: locale,
                  *change(event: Event) {
                    chooseLocale(eventValue(event) as Locale);
                  },
                },
                [
                  option({ value: 'en' }, 'English'),
                  option({ value: 'fr' }, 'Français'),
                ],
              ),
              label(
                { class: 'field-label', htmlFor: 'review-theme' },
                function* () {
                  return (yield* t()).theme;
                },
              ),
              select(
                'ReviewTheme',
                {
                  id: 'review-theme',
                  value: theme,
                  *change(event: Event) {
                    chooseTheme(eventValue(event) as ThemeChoice);
                  },
                },
                [
                  // First, and the default: a reviewer who has never touched
                  // this gets what their machine asks for, and keeps getting
                  // it when the machine changes its mind at sunset.
                  option({ value: 'system' }, function* () {
                    return (yield* t()).themeSystem;
                  }),
                  option({ value: 'light' }, function* () {
                    return (yield* t()).themeLight;
                  }),
                  option({ value: 'dark' }, function* () {
                    return (yield* t()).themeDark;
                  }),
                ],
              ),
            ]),
          ]),
          div({ class: 'view-tabs', role: 'navigation' }, [
            button(
              'ShowVisualAssets',
              {
                type: 'button',
                'aria-pressed': function* () {
                  return (yield* devtoolView()) === 'assets' ? 'true' : 'false';
                },
                *click() {
                  chooseDevtoolView('assets');
                },
              },
              function* () {
                return (yield* t()).viewAssets;
              },
            ),
            button(
              'ShowVisualTests',
              {
                type: 'button',
                'aria-pressed': function* () {
                  return (yield* devtoolView()) === 'visual' ? 'true' : 'false';
                },
                *click() {
                  chooseDevtoolView('visual');
                },
              },
              function* () {
                return (yield* t()).viewVisual;
              },
            ),
            button(
              'ShowTemplateObligations',
              {
                type: 'button',
                'aria-pressed': function* () {
                  return (yield* devtoolView()) === 'template'
                    ? 'true'
                    : 'false';
                },
                *click() {
                  chooseDevtoolView('template');
                },
              },
              function* () {
                return (yield* t()).viewTemplate;
              },
            ),
            button(
              'ShowReviewQueue',
              {
                type: 'button',
                'aria-pressed': function* () {
                  return (yield* devtoolView()) === 'review' ? 'true' : 'false';
                },
                *click() {
                  chooseDevtoolView('review');
                },
              },
              function* () {
                return (yield* t()).viewReview;
              },
            ),
          ]),
          section(
            {
              class: 'shared-filters',
              'aria-label': function* () {
                return (yield* t()).filters;
              },
            },
            [
              label({ htmlFor: 'component-filter' }, function* () {
                return (yield* t()).filterComponent;
              }),
              input('ComponentFilter', {
                id: 'component-filter',
                value: componentFilter,
                placeholder: 'UserCard',
                *input(event: Event) {
                  yield* componentFilter.write(eventValue(event));
                },
              }),
              label({ htmlFor: 'kind-filter' }, function* () {
                return (yield* t()).filterType;
              }),
              select(
                'KindFilter',
                {
                  id: 'kind-filter',
                  value: kindFilter,
                  *change(event: Event) {
                    yield* kindFilter.choose(eventValue(event) as KindFilter);
                  },
                },
                [
                  option({ value: 'all' }, function* () {
                    return (yield* t()).filterAll;
                  }),
                  option({ value: 'visual' }, function* () {
                    return (yield* t()).filterVisual;
                  }),
                  option({ value: 'template' }, function* () {
                    return (yield* t()).filterTemplate;
                  }),
                  option({ value: 'removal' }, function* () {
                    return (yield* t()).filterRemoved;
                  }),
                ],
              ),
              label({ htmlFor: 'state-filter' }, function* () {
                return (yield* t()).filterState;
              }),
              select(
                'StateFilter',
                {
                  id: 'state-filter',
                  value: stateFilter,
                  *change(event: Event) {
                    yield* stateFilter.choose(eventValue(event) as StateFilter);
                  },
                },
                [
                  option({ value: 'all' }, function* () {
                    return (yield* t()).filterAll;
                  }),
                  option({ value: 'current' }, function* () {
                    return (yield* t()).filterCurrent;
                  }),
                  option({ value: 'renewed' }, function* () {
                    return (yield* t()).filterRenewed;
                  }),
                  option({ value: 'missing' }, function* () {
                    return (yield* t()).filterMissing;
                  }),
                  option({ value: 'review' }, function* () {
                    return (yield* t()).filterReview;
                  }),
                  option({ value: 'removed' }, function* () {
                    return (yield* t()).filterRemoved;
                  }),
                ],
              ),
              label({ htmlFor: 'direction-filter' }, function* () {
                return (yield* t()).filterDirection;
              }),
              select(
                'DirectionFilter',
                {
                  id: 'direction-filter',
                  value: directionFilter,
                  *change(event: Event) {
                    yield* directionFilter.choose(
                      eventValue(event) as DirectionFilter,
                    );
                  },
                },
                [
                  option({ value: 'all' }, function* () {
                    return (yield* t()).filterAll;
                  }),
                  option({ value: 'render' }, function* () {
                    return (yield* t()).filterRender;
                  }),
                  option({ value: 'command' }, function* () {
                    return (yield* t()).filterCommand;
                  }),
                ],
              ),
              label({ htmlFor: 'text-filter' }, function* () {
                return (yield* t()).filterText;
              }),
              input('TextFilter', {
                id: 'text-filter',
                value: textFilter,
                placeholder: 'save',
                *input(event: Event) {
                  yield* textFilter.write(eventValue(event));
                },
              }),
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
              h2(function* () {
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
                      yield* evidenceView.release();
                      yield* selection.clear();
                      clearReason();
                      yield* note.clear();
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
          forNode(cards, { track: (card) => card.shape }, (card, index) =>
            article(
              {
                class: 'review-card',
                'data-kind': function* () {
                  return (yield* card()).kind;
                },
                hidden: function* () {
                  return index !== (yield* activeIndex());
                },
              },
              [
                header({ class: 'review-heading' }, [
                  div([
                    small({ class: 'eyebrow' }, function* () {
                      return (yield* t()).scenario;
                    }),
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
                    h3(function* () {
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
                      h3(function* () {
                        const value = yield* card();
                        return value.kind === 'removal'
                          ? (yield* t()).removedPromise
                          : (yield* t()).currentPromise;
                      }),
                      p({ class: 'template-statement' }, function* () {
                        const value = yield* card();
                        if (value.kind === 'template') return value.statement;
                        if (value.kind === 'removal') {
                          const proof = value.previousEvidence;
                          return proof
                            ? `${proof.element ?? 'template'}${proof.elementName ? ` "${proof.elementName}"` : ''} → ${proof.target}`
                            : (yield* t()).previousUnavailable;
                        }
                        return '';
                      }),
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
                              return `${value.field}: ${value.before ?? '∅'} → ${value.after ?? '∅'}`;
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
                      h3(function* () {
                        return (yield* t()).previousDecisionLabel;
                      }),
                      p(function* () {
                        const previous = (yield* card()).previousDecision;
                        return previous
                          ? `${previous.verdict} · ${previous.by} · ${previous.at}${previous.note ? ` — ${previous.note}` : ''}`
                          : '—';
                      }),
                      h3(function* () {
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
                        const screenshot = (yield* card()).members[0]?.metadata
                          ?.screenshot;
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
                        { class: 'field-label', id: 'evidence-views-label' },
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
                              *click() {
                                yield* evidenceView.choose('replay');
                              },
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
                              *click() {
                                yield* evidenceView.choose('image');
                              },
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
                          title: function* () {
                            return (yield* t()).liftHint;
                          },
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
                          chooseZoom(eventValue(event) as ZoomMode);
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
                  ul(
                    {
                      class: 'tier-legend',
                      hidden: function* () {
                        return !(yield* showingReplay());
                      },
                    },
                    [
                      legendEntry(TIERS.subject, {
                        *label() {
                          return (yield* t()).tierSubject;
                        },
                      }),
                      legendEntry(TIERS.changed, {
                        hidden: function* () {
                          return ((yield* member())?.changed.length ?? 0) === 0;
                        },
                        label: function* () {
                          return (yield* t()).tierChanged;
                        },
                      }),
                      legendEntry(TIERS.occluded, {
                        hidden: function* () {
                          return (yield* coveredCount()) === 0;
                        },
                        // Named when the replay knows the name. "Covered by
                        // the page's own overlay" asked the reviewer to work
                        // out what an overlay is and which one; this points at
                        // the same thing the lift control above removes.
                        label: function* () {
                          const covering = yield* chrome();
                          const say = yield* t();
                          if (covering.length === 1) {
                            return say.tierOccludedOne(covering[0] ?? '');
                          }
                          return covering.length > 1
                            ? say.tierOccludedMany(covering.length)
                            : say.tierOccludedUnknown;
                        },
                      }),
                      legendEntry(TIERS.picked, {
                        *label() {
                          return (yield* t()).tierPicked;
                        },
                      }),
                    ],
                  ),
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
                      ul(
                        {
                          class: 'fidelity-detail',
                          hidden: function* () {
                            return (yield* replay()).report.length === 0;
                          },
                        },
                        forNode(
                          function* () {
                            return (yield* replay()).report.map((line) => ({
                              line,
                            }));
                          },
                          { track: (entry) => entry.line },
                          (entry) =>
                            li({ class: 'code' }, function* () {
                              return (yield* entry()).line;
                            }),
                        ),
                      ),
                      p(function* () {
                        const say = yield* t();
                        return (yield* showingReplay())
                          ? say.fidelityOnPage
                          : say.fidelityOnImage;
                      }),
                    ],
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
                            // The ground the capture was taken on. A page that
                            // paints no background of its own was composited
                            // over the user agent's canvas when the screenshot
                            // was taken; a transparent frame shows the review
                            // tool's checkerboard instead, which is a different
                            // picture from the one that was attested.
                            'data-scheme': function* () {
                              return (yield* card()).members[0]?.metadata
                                ?.colorScheme === 'dark'
                                ? 'dark'
                                : 'light';
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
                              return (yield* t()).imageAlt(
                                scenarioOf((yield* card()).subject),
                              );
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
                  section({ class: 'diff-panel' }, [
                    h3(function* () {
                      return (yield* t()).measuredChange;
                    }),
                    ul(
                      forNode(
                        function* () {
                          return (yield* card()).changes;
                        },
                        {
                          track: (change) => change,
                          empty: () =>
                            li(function* () {
                              return (yield* t()).noApprovedYet;
                            }),
                        },
                        (change) => li(span({ class: 'code' }, change)),
                      ),
                    ),
                  ]),
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
                      h3(function* () {
                        return (yield* t()).previousDecisionLabel;
                      }),
                      p(function* () {
                        const value = yield* card();
                        const previous = value.previousDecision;
                        return previous
                          ? `${previous.verdict} · ${previous.by} · ${previous.at}${previous.note ? ` — ${previous.note}` : ''}`
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
                      'aria-multiline': 'true',
                      'aria-label': 'Decision note',
                      'aria-describedby': 'review-note-help review-note-error',
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
                        yield* note.write(textOf(field));
                      },
                      // Delegated, because the references are built by hand
                      // rather than rendered: a listener per chip would have
                      // to be attached and removed on every edit.
                      mouseover(event: Event) {
                        const chip = (
                          event.target as Element | null
                        )?.closest?.('.mention-chip');
                        const id = chip?.getAttribute(MENTION_ID);
                        previewMention(id ? Number(id) : undefined);
                      },
                      mouseleave() {
                        previewMention(undefined);
                      },
                      keyup: rememberCaret,
                      mouseup: rememberCaret,
                      blur: rememberCaret,
                      // Pasted markup would arrive with its own styling and,
                      // worse, its own elements — including things that look
                      // like references and point at nothing.
                      *paste(event: Event) {
                        const clip = (event as ClipboardEvent).clipboardData;
                        if (!clip) return;
                        event.preventDefault();
                        const text = clip.getData('text/plain');
                        document
                          .getSelection()
                          ?.getRangeAt(0)
                          .insertNode(document.createTextNode(text));
                        document.getSelection()?.collapseToEnd();
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
                        label({ htmlFor: 'retirement-reason' }, function* () {
                          return (yield* t()).retirementReason;
                        }),
                        select(
                          'RetirementReason',
                          {
                            id: 'retirement-reason',
                            value: retirementReason,
                            *change(event: Event) {
                              chooseRetirementReason(
                                eventValue(event) as RetirementReason,
                              );
                            },
                          },
                          [
                            option({ value: 'superseded' }, function* () {
                              return (yield* t()).superseded;
                            }),
                            option({ value: 'defect' }, function* () {
                              return (yield* t()).defect;
                            }),
                            option({ value: 'derivation' }, function* () {
                              return (yield* t()).derivation;
                            }),
                          ],
                        ),
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
                            decide('rejected');
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
                            decide('blocked');
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
                            decide('known-issue');
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
                            decide('ok-with-note');
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
                            decide('ok');
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
            h2(function* () {
              return (yield* t()).viewAssets;
            }),
            ul(
              { class: 'inventory-list' },
              forNode(
                function* () {
                  return yield* visualAssets();
                },
                {
                  track: (asset) => asset.evidence,
                  empty: () =>
                    li(function* () {
                      return (yield* t()).noInventory;
                    }),
                },
                (asset) =>
                  li([
                    strong(function* () {
                      return (yield* asset()).evidence;
                    }),
                    small(function* () {
                      const value = yield* asset();
                      return `${value.scenarios.length} scenario${value.scenarios.length === 1 ? '' : 's'}`;
                    }),
                  ]),
              ),
            ),
          ],
        ),
        main(
          {
            class: 'inventory-panel',
            hidden: function* () {
              return (yield* devtoolView()) !== 'visual';
            },
          },
          [
            h2(function* () {
              return (yield* t()).viewVisual;
            }),
            ul(
              { class: 'inventory-list' },
              forNode(
                function* () {
                  return yield* visualTests();
                },
                {
                  track: (test) => test.subject,
                  empty: () =>
                    li(function* () {
                      return (yield* t()).noInventory;
                    }),
                },
                (test) =>
                  li([
                    strong(function* () {
                      return (yield* test()).scenario;
                    }),
                    span({ class: 'subject code' }, function* () {
                      return (yield* test()).component;
                    }),
                    small(function* () {
                      return (yield* test()).state;
                    }),
                  ]),
              ),
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
            h2(function* () {
              return (yield* t()).viewTemplate;
            }),
            ul(
              { class: 'inventory-list' },
              forNode(
                function* () {
                  return yield* templateObligations();
                },
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
                      return `${value.component} · ${value.direction}`;
                    }),
                    p(function* () {
                      return (yield* obligation()).statement;
                    }),
                    small(function* () {
                      return (yield* obligation()).state;
                    }),
                  ]),
              ),
            ),
            h3(function* () {
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
                  ]),
              ),
            ),
          ],
        ),
      ]),
    ]),
);
