/**
 * Driving a frozen document from outside it.
 *
 * The snapshot carries no script, which is what makes it inert by
 * construction. Everything interactive therefore happens here, in the parent
 * frame, reaching into a same-origin iframe: measuring it, dimming the decor,
 * marking what moved, and turning a click into a node path.
 *
 * The path a click produces is computed by the *same* addressing pass that
 * produced the digest — not mapped from coordinates. That is the difference
 * between a reviewer designating a node and a reviewer designating a pixel and
 * hoping.
 */
import {
  layoutDigest,
  measureInPage,
  STYLE_KEYS,
  type LayoutDigest,
  type Rect,
} from '../digest.js';
import { replayFidelity, type ReplayFidelity } from '../replay.js';

export interface FrameView {
  readonly document: Document;
  readonly window: Window & typeof globalThis;
}

const ATTESTED = 'data-craft-attested';
const PATH = 'data-craft-path';
const DECOR = 'data-craft-decor';
const CHROME = 'data-craft-chrome';
const HIGHLIGHT = 'data-craft-highlight';
const UNRENDERED = new Set([
  'HEAD',
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'TITLE',
  'TEMPLATE',
]);

export const viewOf = (frame: HTMLIFrameElement): FrameView | undefined => {
  const view = frame.contentWindow;
  const document = frame.contentDocument;
  return view && document
    ? { document, window: view as Window & typeof globalThis }
    : undefined;
};

/**
 * Waits until the replay can be measured for what it will look like.
 *
 * Fonts load asynchronously, and a text box measured before its face arrives
 * carries the fallback's metrics — half a pixel out, on one span, which reads
 * as an unfaithful replay and sends the reviewer to the screenshot for no
 * reason. Bounded, because a font that never arrives must not hang the review.
 */
export async function whenReady(
  view: FrameView,
  timeoutMs = 3000,
): Promise<void> {
  const fonts = (view.document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  await Promise.race([
    fonts.ready,
    new Promise((resolve) => view.window.setTimeout(resolve, timeoutMs)),
  ]);
}

/** Re-measures the replay with the collector that produced the evidence. */
export function measureReplay(view: FrameView, root: string): LayoutDigest {
  const measured = measureInPage(
    { root, styleKeys: STYLE_KEYS as readonly string[] },
    view.window,
  );
  return layoutDigest(measured.elements);
}

/**
 * Is the document on screen the one the ledger holds evidence for?
 *
 * Checked on the reviewer's machine, not on the capture machine: a replay that
 * was faithful in CI and is not faithful here would otherwise be judged as if
 * it were the original.
 */
export function checkReplay(
  view: FrameView,
  root: string,
  attested: LayoutDigest,
  options: { readonly tolerance?: number } = {},
): ReplayFidelity {
  const measured = measureInPage(
    { root, styleKeys: STYLE_KEYS as readonly string[] },
    view.window,
  );
  // Asked and answered before anything is compared. Without this the selector
  // missing produced "36 nodes are absent" followed by `html`, `html/head`,
  // `html/head/meta` — every symptom of one cause, and none of them saying it.
  if (!measured.scope.rootMatched) {
    const empty = (view.document.body?.childElementCount ?? 0) === 0;
    return {
      faithful: false,
      missing: attested.nodes.map((node) => node.path),
      unexpected: [],
      moved: [],
      // Named as one cause with its likely explanations, not as its forty
      // symptoms. The reviewer's next move is different in each case, and
      // "36 nodes are absent" told them neither.
      summary: empty
        ? 'The frozen page is empty — nothing was loaded into it, so there is nothing here to compare with the evidence.'
        : `The frozen page has no '${root}' in it, so what it shows is not this component. That happens when the stored snapshot is older than the report it is paired with, or when the component's root selector changed after it was captured.`,
      reason: empty ? { kind: 'empty' } : { kind: 'no-root', root },
      report: [],
    };
  }
  return replayFidelity(layoutDigest(measured.elements), attested, options);
}

/**
 * Half a pixel — one quantum of the digest's own rounding.
 *
 * An inline element's rect is the union of its line boxes, and on a real page
 * one of those lands on a rounding boundary and falls the other way in a
 * frame. Measured on the demo route: 35 of 36 nodes match exactly and one
 * differs by half a pixel, with the same fonts, the same viewport and the same
 * text-rendering.
 *
 * Asking for this forgives exactly one quantum, and a genuine half-pixel
 * regression with it. That is acceptable *here* and nowhere else: this check
 * decides which artefact to put in front of the reviewer, not whether a human
 * is asked at all. That decision is the evidence hash, and it stays exact.
 */
export const REVIEW_TOLERANCE = 0.5;

/**
 * What each outline in the replay means.
 *
 * Exported because the legend beside the frame draws from this exact object: a
 * legend that keeps its own copy of `#dc6803` is a legend that will one day
 * name the wrong colour, and an unexplained outline on a page under review is
 * worse than no outline at all.
 */
export const TIERS = {
  subject: {
    colour: '#1570ef',
    style: 'solid',
    label: 'The component this evidence is about',
  },
  changed: {
    colour: '#d92d20',
    style: 'solid',
    label: 'Measured differently from the last accepted render',
  },
  occluded: {
    colour: '#dc6803',
    style: 'dotted',
    // Plain: something in the application was painted on top of this node, so
    // part of it was not visible in the screenshot. The reviewer's next move
    // is the lift control above, which names the thing in the way.
    label: 'Hidden behind something else when the capture was taken',
  },
  picked: {
    colour: '#7f56d9',
    style: 'solid',
    label: 'Selected — a remark you add will name this node',
  },
} as const;

/**
 * The three tiers, painted into the replay.
 *
 * Everything outside the subject is dimmed rather than hidden. Hiding it would
 * undo the reason the capture shows the whole page: a component is judged in
 * the frame it actually sits in, margins and neighbours included.
 */
export function markTiers(
  view: FrameView,
  options: {
    readonly root: string;
    readonly attested: readonly string[];
    readonly changed: readonly string[];
    readonly occluded: readonly string[];
    readonly dimDecor: boolean;
    readonly hideChrome: boolean;
  },
): readonly string[] {
  const { document } = view;
  document.getElementById('craft-review-tiers')?.remove();
  const style = document.createElement('style');
  style.id = 'craft-review-tiers';
  // Every declaration here must be layout-neutral. `outline` and `opacity`
  // are; `position: relative` was not, and it moved the very tree this is
  // supposed to annotate — the fidelity check caught it as an unfaithful
  // replay, which is what that check is for.
  style.textContent = `
    [${ATTESTED}] { outline: 2px ${TIERS.subject.style} ${TIERS.subject.colour}; outline-offset: 6px; }
    ${options.dimDecor ? `[${DECOR}] { opacity: .3; }` : ''}
    ${
      options.hideChrome ? `[${CHROME}] { visibility: hidden !important; }` : ''
    }
    [data-craft-tier="changed"] { outline: 2px ${TIERS.changed.style} ${TIERS.changed.colour}; outline-offset: 1px; }
    [data-craft-tier="attested"]:hover { outline: 2px dashed ${TIERS.subject.colour}; outline-offset: 1px; cursor: crosshair; }
    [data-craft-tier="occluded"] { outline: 2px ${TIERS.occluded.style} ${TIERS.occluded.colour}; outline-offset: 1px; }
    [data-craft-picked] { outline: 3px ${TIERS.picked.style} ${TIERS.picked.colour} !important; outline-offset: 2px; }
    /* Pointing at a reference, not selecting: dashed, so it cannot be mistaken
       for the selection it is showing the history of. */
    [${HIGHLIGHT}] { outline: 3px dashed ${TIERS.picked.colour} !important; outline-offset: 4px; }
  `;
  const changed = new Set(options.changed);
  const occluded = new Set(options.occluded);
  for (const [element, path] of markPaths(view, options.root)) {
    element.setAttribute(
      'data-craft-tier',
      changed.has(path)
        ? 'changed'
        : occluded.has(path)
          ? 'occluded'
          : 'attested',
    );
  }

  const root = document.querySelector(options.root);
  for (const element of document.querySelectorAll(`[${DECOR}]`)) {
    element.removeAttribute(DECOR);
  }
  for (const element of document.querySelectorAll(`[${CHROME}]`)) {
    element.removeAttribute(CHROME);
  }
  if (!root) {
    document.head?.appendChild(style);
    return [];
  }

  // Which elements make opacity unsafe on their subtree: a fixed or sticky
  // descendant moves when an ancestor becomes a containing block.
  const holdsPinned = new Set<Element>();
  for (const element of document.querySelectorAll('body *')) {
    if (root.contains(element) || element.contains(root)) continue;
    const position = view.window.getComputedStyle(element).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    for (
      let ancestor = element.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      holdsPinned.add(ancestor);
    }
  }

  // What is actually painted over the subject.
  //
  // Asked of the page rather than guessed from `position`. Marking every fixed
  // element outside the subject offered to lift a header that covered nothing
  // — the control looked broken because it was doing nothing — and left an
  // absolutely positioned element that *was* covering a node unliftable, while
  // the card went on saying that node was covered.
  const covering = new Map<Element, string>();
  const { innerWidth, innerHeight } = view.window;
  for (const element of document.querySelectorAll(`[${PATH}]`)) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const inset = 1;
    const samples: readonly (readonly [number, number])[] = [
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + inset, box.top + inset],
      [box.right - inset, box.top + inset],
      [box.left + inset, box.bottom - inset],
      [box.right - inset, box.bottom - inset],
    ];
    for (const [x, y] of samples) {
      // Skipped, never clamped: a clamped point is a point somewhere else, and
      // what is over *that* says nothing about this element.
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      // An ancestor answering the probe means the sample fell in a gap or a
      // padding — it is behind the element, not over it.
      if (!hit || root.contains(hit) || hit === root || hit.contains(element)) {
        continue;
      }
      hit.setAttribute(CHROME, '');
      covering.set(hit, describeElement(hit));
    }
  }

  // The topmost decor elements: for every ancestor of the subject, the
  // children that do not lead to it.
  //
  // Marking only the tops is what keeps nested opacity from compounding into
  // an unreadable page, and dimming top-level children alone — the first
  // attempt — dimmed nothing at all, because a real application hangs its
  // whole page off one root.
  for (
    let ancestor: Element | null = root.parentElement;
    ancestor && ancestor !== document.documentElement.parentElement;
    ancestor = ancestor.parentElement
  ) {
    for (const sibling of ancestor.children) {
      if (sibling.contains(root)) continue;
      // `head` and its kin paint nothing; marking them says nothing and makes
      // the marked set harder to read when debugging.
      if (UNRENDERED.has(sibling.tagName)) continue;
      // Never dim something that holds a fixed or sticky descendant: opacity
      // makes a containing block, and the pinned element would move.
      if (holdsPinned.has(sibling)) continue;
      sibling.setAttribute(DECOR, '');
    }
  }

  // Applied last, so the probe above is not looking through its own
  // `visibility: hidden` — with the sheet in place first, lifting the chrome
  // once made it impossible to find again, and the control disappeared.
  document.head?.appendChild(style);
  return [...new Set(covering.values())];
}

/** `button.clear-cache-btn` — short enough for a label, precise enough to find. */
const describeElement = (element: Element): string => {
  const first = String(element.className || '')
    .split(/\s+/)
    .filter(Boolean)[0];
  return `${element.tagName.toLowerCase()}${first ? `.${first}` : ''}`;
};

/**
 * Writes each attested node's address onto the replayed element.
 *
 * The collector does it during its own walk, so there is exactly one
 * definition of an address in the system: a click reads back the same string
 * the digest recorded, rather than a coordinate lookup that can drift.
 */
export function markPaths(
  view: FrameView,
  root: string,
): readonly (readonly [Element, string])[] {
  measureInPage({ root, styleKeys: [], markPathAttribute: PATH }, view.window);
  return [...view.document.querySelectorAll(`[${PATH}]`)].map(
    (element) => [element, element.getAttribute(PATH) ?? ''] as const,
  );
}

const PICKED = 'data-craft-picked';

/** How far the pointer has to travel before a click becomes a drag. */
const DRAG_THRESHOLD = 4;

/**
 * Paints a selection onto the replay.
 *
 * Separate from `onPick` because the selection outlives the annotations: the
 * frame is re-marked whenever the reviewer lifts the page's chrome, and a
 * selection that vanished every time they did that would make the two controls
 * fight each other.
 */
export function markSelection(view: FrameView, paths: readonly string[]): void {
  const wanted = new Set(paths);
  for (const element of view.document.querySelectorAll(`[${PATH}]`)) {
    const path = element.getAttribute(PATH) ?? '';
    if (wanted.has(path)) element.setAttribute(PICKED, '');
    else element.removeAttribute(PICKED);
  }
}

/**
 * Shows which nodes a reference in the reason stands for.
 *
 * Separate from the selection: a reference is usually pointed at long after
 * the selection that made it was cleared, and the two must not be confused —
 * one is what a remark *will* name, the other what an existing one already
 * does.
 */
export function markHighlight(view: FrameView, paths: readonly string[]): void {
  const wanted = new Set(paths);
  for (const element of view.document.querySelectorAll(`[${PATH}]`)) {
    if (wanted.has(element.getAttribute(PATH) ?? '')) {
      element.setAttribute(HIGHLIGHT, '');
    } else {
      element.removeAttribute(HIGHLIGHT);
    }
  }
}

/** The current selection, read back from the frame itself. */
export function selectionOf(view: FrameView): readonly string[] {
  return [...view.document.querySelectorAll(`[${PICKED}]`)]
    .map((element) => element.getAttribute(PATH) ?? '')
    .filter(Boolean);
}

/**
 * Turns pointing at the replay into a set of node addresses.
 *
 * Three gestures, because one remark usually covers more than one node — a row
 * of buttons, a whole column — and adding them one at a time means retyping
 * the same sentence:
 *
 * - a click selects one node;
 * - ctrl (or cmd) click adds or removes one, keeping the rest;
 * - dragging a box selects everything the box touches, adding to the selection
 *   when ctrl or cmd is held.
 *
 * The band is reported to the caller rather than drawn here. Drawing it would
 * mean inserting an element into the frozen document, and the whole claim this
 * page makes is that nothing was inserted into it.
 */
export function onPick(
  view: FrameView,
  handler: (paths: readonly string[]) => void,
  options: {
    readonly onBand?: (band: Rect | undefined) => void;
  } = {},
): () => void {
  const { document } = view;
  let origin: { x: number; y: number } | undefined;
  let banding = false;
  // A drag ends with a `click` on the two points' common ancestor. Without
  // this the band's own selection would be overwritten by that click, one
  // frame after it was made.
  let justBanded = false;

  const additive = (event: MouseEvent | PointerEvent): boolean =>
    event.ctrlKey || event.metaKey;

  const bandOf = (event: MouseEvent): Rect => {
    const start = origin ?? { x: event.clientX, y: event.clientY };
    return {
      x: Math.min(start.x, event.clientX),
      y: Math.min(start.y, event.clientY),
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
    };
  };

  const commit = (paths: readonly string[]): void => {
    markSelection(view, paths);
    handler(paths);
  };

  const onClick = (event: Event): void => {
    const picked = (event.target as Element | null)?.closest?.(`[${PATH}]`);
    event.preventDefault();
    event.stopPropagation();
    if (justBanded) {
      justBanded = false;
      return;
    }
    if (!picked) return;
    const path = picked.getAttribute(PATH) ?? '';
    const current = selectionOf(view);
    if (!additive(event as MouseEvent)) {
      commit([path]);
      return;
    }
    commit(
      current.includes(path)
        ? current.filter((entry) => entry !== path)
        : [...current, path],
    );
  };

  const onDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    origin = { x: event.clientX, y: event.clientY };
    banding = false;
    // Stops the frozen page from starting a text selection under the band.
    event.preventDefault();
  };

  const onMove = (event: MouseEvent): void => {
    if (!origin) return;
    const travelled = Math.max(
      Math.abs(event.clientX - origin.x),
      Math.abs(event.clientY - origin.y),
    );
    if (!banding && travelled < DRAG_THRESHOLD) return;
    banding = true;
    options.onBand?.(bandOf(event));
  };

  const onUp = (event: MouseEvent): void => {
    if (!origin) return;
    const band = bandOf(event);
    const wasBanding = banding;
    origin = undefined;
    banding = false;
    options.onBand?.(undefined);
    if (!wasBanding) return;
    justBanded = true;

    const inside: string[] = [];
    for (const element of document.querySelectorAll(`[${PATH}]`)) {
      const box = element.getBoundingClientRect();
      const touches =
        box.right >= band.x &&
        box.left <= band.x + band.width &&
        box.bottom >= band.y &&
        box.top <= band.y + band.height;
      if (touches) inside.push(element.getAttribute(PATH) ?? '');
    }
    const kept = additive(event) ? selectionOf(view) : [];
    commit([...new Set([...kept, ...inside.filter(Boolean)])]);
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
  };
}
