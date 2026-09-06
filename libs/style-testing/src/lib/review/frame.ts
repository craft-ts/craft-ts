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

export const viewOf = (frame: HTMLIFrameElement): FrameView | undefined => {
  const view = frame.contentWindow;
  const document = frame.contentDocument;
  return view && document
    ? { document, window: view as Window & typeof globalThis }
    : undefined;
};

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
): ReplayFidelity {
  return replayFidelity(measureReplay(view, root), attested);
}

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
  style.textContent = `
    [${ATTESTED}] { position: relative; }
    ${
      options.dimDecor
        ? `:root body > *:not(:has([${ATTESTED}])):not([${ATTESTED}]) { opacity: .25; filter: grayscale(1); }`
        : ''
    }
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

  // Anything painted over the subject but not part of it. Marked so a reviewer
  // can lift it and see what it was covering — the one thing a screenshot can
  // never do, because those pixels are gone.
  const root = document.querySelector(options.root);
  for (const element of document.querySelectorAll('body *')) {
    if (root && (root.contains(element) || element.contains(root))) continue;
    const position = view.window.getComputedStyle(element).position;
    if (position === 'fixed' || position === 'sticky') {
      element.setAttribute('data-craft-chrome', '');
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
