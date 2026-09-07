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
  markSelection,
  onPick,
  REVIEW_TOLERANCE,
  TIERS,
  viewOf,
  whenReady,
} from '../../src/lib/review/frame';
import type { LayoutDigest } from '../../src/lib/digest';

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
  /** One sentence a reviewer can act on. */
  readonly summary: string;
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
  chip.setAttribute(
    'data-paths',
    paths.length > 6
      ? `${paths.slice(0, 6).join(' · ')} · +${paths.length - 6} more`
      : paths.join(' · '),
  );
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
    /** Where the reviewer right-clicked, in the frame's own coordinates. */
    const menuAt = yield* state(
      'menuAt',
      undefined as { x: number; y: number } | undefined,
      ({ set }) => ({
        show: (at: { x: number; y: number } | undefined) => set(at),
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
    const showMenu = craftMethod(
      'showMenu',
      function* (at: { x: number; y: number } | undefined) {
        yield* menuAt.show(at);
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
    const clearReason = (): void => {
      const field = reasonField();
      if (field) field.replaceChildren();
      caret = undefined;
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
      }) => payload,
      loader: async ({ params }): Promise<ReplayState> => {
        const view = viewOf(params.frame);
        if (!view) {
          return {
            loaded: false,
            faithful: false,
            summary: 'The frozen page could not be opened.',
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
        });
        // Re-applied after the marking, which rebuilds the frame's
        // annotations: lifting the page's chrome must not silently drop the
        // nodes the reviewer had already pointed at.
        markSelection(view, params.selected);
        stopPicking?.();
        stopPicking = onPick(view, selectNodes, {
          onBand: showBand,
          onMenu: showMenu,
        });

        return {
          loaded: true,
          faithful: fidelity?.faithful ?? false,
          summary:
            fidelity?.summary ??
            'There is no attested digest to check this frozen page against, so it cannot be vouched for.',
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
          summary: '',
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
    /** What this replay would lift, named from the replay itself. */
    const chrome = craftComputed('chrome', function* () {
      return (yield* replay()).chrome;
    });
    const overlayLabel = craftComputed('overlayLabel', function* () {
      const covering = yield* chrome();
      const verb = (yield* hideChrome()) ? 'Show' : 'Hide';
      // Named, not counted, when there is one of them: "Hide 1 overlay" asks
      // the reviewer what an overlay is; `button.clear-cache-btn` tells them
      // exactly what is about to disappear.
      return covering.length === 1
        ? `${verb} ${covering[0]}`
        : `${verb} the ${covering.length} elements covering this`;
    });
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
    const addSelectionToReason = craftMethod(
      'addSelectionToReason',
      function* () {
        const paths = yield* selection();
        if (paths.length === 0) return;
        const known = yield* mentions();
        const id =
          known.reduce((highest, one) => Math.max(highest, one.id), 0) + 1;

        const field = reasonField();
        if (!field) return;

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
        // Not `selection`: that name is the craft state this method clears a
        // few lines down, and shadowing it turned `selection.clear()` into a
        // call on the DOM's own Selection — which has no such method, so the
        // whole insertion threw before the outlines were taken off.
        const domSelection = document.getSelection();
        domSelection?.removeAllRanges();
        domSelection?.addRange(after);
        caret = after.cloneRange();

        yield* mentions.replace([...known, { id, paths }]);
        yield* note.write(textOf(field));
        yield* menuAt.show(undefined);
        // The group is recorded; leaving it outlined would say it still is
        // not. Cleared in the frame as well as in the state — the outlines are
        // painted there and nothing else repaints them until the next pick.
        yield* selection.clear();
        const holder = document.getElementById(FRAME_ID);
        const view =
          holder instanceof HTMLIFrameElement ? viewOf(holder) : undefined;
        if (view) markSelection(view, []);
        field.focus();
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
      menuAt,
      addSelectionToReason,
      rememberCaret,
      clearReason,
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
    menuAt,
    rememberCaret,
    clearReason,
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
    addSelectionToReason,
  }) =>
    div({ class: 'app-shell' }, [
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
          // In the sidebar rather than across the top. A full-width banner
          // repeating the name of the tool cost a band of height on every
          // card, and height is the thing a tall capture has none of.
          header({ class: 'panel-heading brand' }, [
            small({ class: 'eyebrow' }, 'CRAFTTS / ATTEST'),
            h1('Visual review'),
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
                div({ class: 'evidence-column' }, [
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
                    div({ class: 'evidence-views' }, [
                      span(
                        { class: 'field-label', id: 'evidence-views-label' },
                        'Evidence',
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
                              title:
                                'The page itself, frozen at the moment it was measured. Click any part of the component to write a remark about that node.',
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
                            'Page',
                          ),
                          button(
                            'ShowImage',
                            {
                              type: 'button',
                              'data-view': 'image',
                              title:
                                'The screenshot. It shows what the measurements cannot — a wrong icon, a missing background — and marks where the viewport ended.',
                              'aria-pressed': function* () {
                                return String(!(yield* showingReplay()));
                              },
                              *click() {
                                yield* evidenceView.choose('image');
                              },
                            },
                            'Screenshot',
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
                          title:
                            'Something in the application is painted over this component. Only the frozen page can lift it; in a screenshot those pixels have already been replaced.',
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
                    // Only the picture can be scaled. Scaling the frozen page
                    // would relayout it, and it would stop being the render that
                    // was measured — so the control is not offered there rather
                    // than offered and inert.
                    label(
                      {
                        class: 'field-label',
                        htmlFor: 'evidence-zoom',
                        hidden: function* () {
                          return yield* showingReplay();
                        },
                      },
                      'Zoom',
                    ),
                    select(
                      'EvidenceZoom',
                      {
                        id: 'evidence-zoom',
                        hidden: function* () {
                          return yield* showingReplay();
                        },
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
                  p({ class: 'evidence-help' }, function* () {
                    return (yield* showingReplay())
                      ? 'The render itself, frozen. Everything outside the subject is dimmed. Click a part of it to aim at that node, ctrl-click to add another, drag a box to take everything it touches — then right-click to drop a reference into the reason.'
                      : 'A picture of the same render. The dashed box marks what was on screen when it was captured; the rest is attested but was never visible.';
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
                      legendEntry(TIERS.subject),
                      legendEntry(TIERS.changed, {
                        hidden: function* () {
                          return ((yield* member())?.changed.length ?? 0) === 0;
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
                          if (covering.length === 1) {
                            return `Hidden behind ${covering[0]} when the capture was taken`;
                          }
                          return covering.length > 1
                            ? `Hidden behind ${covering.length} other elements when the capture was taken`
                            : TIERS.occluded.label;
                        },
                      }),
                      legendEntry(TIERS.picked),
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
                        const summary = (yield* replay()).summary;
                        return (yield* fellBack())
                          ? `Showing the screenshot: ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`
                          : summary;
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
                        return (yield* showingReplay())
                          ? 'You asked for the page anyway. It is on screen, but it is not what was measured — the decision will be recorded as made without a faithful replay.'
                          : 'Judge the picture. Switch to Page to look at the frozen copy anyway; either way the decision is recorded as made without a faithful replay.';
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
                        [
                          iframe({
                            id: function* () {
                              const active = yield* current();
                              return (yield* card()).shape === active?.shape
                                ? FRAME_ID
                                : '';
                            },
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
                          // The right-click menu, in this document for the
                          // same reason as the band. One action, because the
                          // gesture exists to shorten one thing: naming the
                          // group you are pointing at, inside the sentence you
                          // are writing.
                          div(
                            {
                              class: 'pick-menu',
                              role: 'menu',
                              hidden: function* () {
                                return !(yield* menuAt());
                              },
                              style: function* () {
                                const at = yield* menuAt();
                                return at ? `left:${at.x}px;top:${at.y}px` : '';
                              },
                            },
                            button(
                              'AddSelectionFromMenu',
                              {
                                type: 'button',
                                role: 'menuitem',
                                click: addSelectionToReason,
                              },
                              function* () {
                                const count = (yield* selection()).length;
                                return `Add ${count} node${count === 1 ? '' : 's'} to the reason`;
                              },
                            ),
                          ),
                        ],
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
                ]),
                div({ class: 'decision-column' }, [
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
                    div({ class: 'field-row' }, [
                      label({ htmlFor: NOTE_ID }, 'Decision reason'),
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
                          const count = (yield* selection()).length;
                          return `${count} element${count === 1 ? '' : 's'} selected`;
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
                      'data-placeholder':
                        'Explain what is wrong or why this decision is appropriate…',
                      *input(event: Event) {
                        const field = event.currentTarget;
                        if (!(field instanceof HTMLElement)) return;
                        yield* note.write(textOf(field));
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
                    button(
                      'AddSelectionToReason',
                      {
                        type: 'button',
                        class: 'link-button',
                        disabled: function* () {
                          return (yield* selection()).length === 0;
                        },
                        click: addSelectionToReason,
                      },
                      function* () {
                        const count = (yield* selection()).length;
                        return count === 0
                          ? 'Select part of the page to reference it here'
                          : `Insert a reference to ${count} selected node${count === 1 ? '' : 's'}`;
                      },
                    ),
                    small(
                      { id: 'review-note-help', class: 'decision-help' },
                      'A reason is required for Reject so the code can be corrected. Right-click a selection in the frozen page to drop a reference where you are typing.',
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
                              (yield* decision.isLoading()) ||
                              !(yield* hasNote())
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
                ]),
              ],
            ),
          ),
        ),
      ]),
    ]),
);
