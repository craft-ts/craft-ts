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
} from '../digest.js';
import { replayFidelity, type ReplayFidelity } from '../replay.js';

export interface FrameView {
  readonly document: Document;
  readonly window: Window & typeof globalThis;
}

const ATTESTED = 'data-craft-attested';
const PATH = 'data-craft-path';
const DECOR = 'data-craft-decor';
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
    return {
      faithful: false,
      missing: attested.nodes.map((node) => node.path),
      unexpected: [],
      moved: [],
      summary: `The frozen page contains no element matching '${root}', so nothing in it is the component this evidence is about.`,
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
): void {
  const { document } = view;
  document.getElementById('craft-review-tiers')?.remove();
  const style = document.createElement('style');
  style.id = 'craft-review-tiers';
  // Every declaration here must be layout-neutral. `outline` and `opacity`
  // are; `position: relative` was not, and it moved the very tree this is
  // supposed to annotate — the fidelity check caught it as an unfaithful
  // replay, which is what that check is for.
  style.textContent = `
    [${ATTESTED}] { outline: 2px solid #1570ef; outline-offset: 6px; }
    ${options.dimDecor ? `[${DECOR}] { opacity: .3; }` : ''}
    ${
      options.hideChrome
        ? `[data-craft-chrome] { visibility: hidden !important; }`
        : ''
    }
    [data-craft-tier="changed"] { outline: 2px solid #d92d20; outline-offset: 1px; }
    [data-craft-tier="attested"]:hover { outline: 2px dashed #1570ef; outline-offset: 1px; cursor: crosshair; }
    [data-craft-tier="occluded"] { outline: 2px dotted #dc6803; outline-offset: 1px; }
    [data-craft-picked] { outline: 3px solid #7f56d9 !important; outline-offset: 2px; }
  `;
  document.head?.appendChild(style);

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
  if (!root) return;

  // Anything painted over the subject but not part of it. Marked so a reviewer
  // can lift it and see what it was covering — the one thing a screenshot can
  // never do, because those pixels are gone.
  const holdsPinned = new Set<Element>();
  for (const element of document.querySelectorAll('body *')) {
    if (root.contains(element) || element.contains(root)) continue;
    const position = view.window.getComputedStyle(element).position;
    if (position === 'fixed' || position === 'sticky') {
      element.setAttribute('data-craft-chrome', '');
      for (
        let ancestor = element.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        holdsPinned.add(ancestor);
      }
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
}

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
  measureInPage(
    { root, styleKeys: [], markPathAttribute: PATH },
    view.window,
  );
  return [...view.document.querySelectorAll(`[${PATH}]`)].map(
    (element) => [element, element.getAttribute(PATH) ?? ''] as const,
  );
}

/** Wires clicks in the replay to the path they land on. */
export function onPick(
  view: FrameView,
  handler: (path: string) => void,
): () => void {
  const listener = (event: Event): void => {
    const target = event.target as Element | null;
    const picked = target?.closest?.(`[${PATH}]`);
    if (!picked) return;
    event.preventDefault();
    event.stopPropagation();
    for (const previous of view.document.querySelectorAll('[data-craft-picked]')) {
      previous.removeAttribute('data-craft-picked');
    }
    picked.setAttribute('data-craft-picked', '');
    handler(picked.getAttribute(PATH) ?? '');
  };
  view.document.addEventListener('click', listener, true);
  return () => view.document.removeEventListener('click', listener, true);
}
