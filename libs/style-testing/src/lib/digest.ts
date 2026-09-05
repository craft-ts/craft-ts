/**
 * The layout digest — the choice in this plan that cannot be taken back.
 *
 * The evidence a human judges is **not** a PNG. It is a set of measurements of
 * the render: boxes, intrinsic sizes, a closed list of computed styles, and a
 * handful of discrete facts. Three things follow, and each of them is why the
 * digest exists rather than a screenshot:
 *
 * - it is **diffable**. "`.card` padding 8→12" is a sentence; two images are
 *   not, and a reviewer who cannot see what changed approves everything.
 * - it is **assertable**. Overflow, truncation, overlap and contrast fall out
 *   of these numbers, so most of what one wanted to look at no longer needs an
 *   eye at all (see `assertions.ts`).
 * - it is **stable**. Anti-aliasing, font hinting and GPU rasterisation move
 *   pixels without moving layout, and every one of those would be a review
 *   item under an image comparison.
 *
 * The style list is closed on purpose, and widening it bumps `digestVersion`.
 * The migration rule in `carriesForward` is what keeps that from being a trap:
 * a digest that differs only by fields the new version added carries its
 * attestation forward automatically. Without that rule, v1 is a cage.
 */

export const DIGEST_VERSION = 1;

/** Closed list. Widening it changes `digestVersion`. */
export type StyleKey =
  | 'display'
  | 'position'
  | 'color'
  | 'background-color'
  | 'border-width'
  | 'border-radius'
  | 'font'
  | 'letter-spacing'
  | 'opacity'
  | 'visibility'
  | 'transform'
  | 'overflow'
  | 'flex'
  | 'grid-template-columns'
  | 'gap'
  | 'z-index';

export const STYLE_KEYS: readonly StyleKey[] = [
  'display',
  'position',
  'color',
  'background-color',
  'border-width',
  'border-radius',
  'font',
  'letter-spacing',
  'opacity',
  'visibility',
  'transform',
  'overflow',
  'flex',
  'grid-template-columns',
  'gap',
  'z-index',
];

export interface LayoutNode {
  /** Stable address in the rendered tree. */
  readonly path: string;
  /** `[x, y, width, height]`, rounded to the half pixel. */
  readonly box: readonly [number, number, number, number];
  readonly intrinsic?: {
    readonly minContent: number;
    readonly maxContent: number;
  };
  readonly text?: {
    readonly content: string;
    readonly lines: number;
    /** Pixels of text the box does not show. */
    readonly clipped: number;
  };
  readonly styles: Readonly<Record<StyleKey, string>>;
  readonly overflow: { readonly inline: boolean; readonly block: boolean };
  readonly zOrder: number;
}

/**
 * The **discrete** facts. This is what the bisection watches.
 *
 * Continuous measurements move constantly and say nothing; a column count that
 * goes from three to two is a fact with a threshold behind it, and a threshold
 * is the only thing worth reporting a margin against.
 */
export interface LayoutSignature {
  readonly columns: Readonly<Record<string, number>>;
  readonly lines: Readonly<Record<string, number>>;
  readonly wrapped: readonly string[];
  readonly clipped: readonly string[];
  readonly scrollbars: readonly string[];
  readonly overlaps: readonly (readonly [string, string])[];
}

export interface LayoutDigest {
  readonly digestVersion: 1;
  readonly nodes: readonly LayoutNode[];
  readonly signature: LayoutSignature;
}

/**
 * One element, as measured in the page.
 *
 * The collector is split from the digest so the arithmetic — rounding,
 * signature, diffing, migration — runs in a unit test with no browser, and the
 * browser half stays a thin adapter with nothing to get subtly wrong.
 */
export interface MeasuredElement {
  readonly path: string;
  readonly parent?: string;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly styles: Readonly<Record<string, string>>;
  readonly scroll: {
    readonly width: number;
    readonly height: number;
    readonly clientWidth: number;
    readonly clientHeight: number;
  };
  readonly text?: {
    readonly content: string;
    readonly lines: number;
    readonly clipped: number;
  };
  readonly intrinsic?: {
    readonly minContent: number;
    readonly maxContent: number;
  };
  readonly zOrder: number;
  /** Track count of a grid container; absent when the element is not one. */
  readonly columns?: number;
  /** Row offsets of the children, used to detect wrapping. */
  readonly childRows?: readonly number[];
}

/** Rounded to the half pixel: below that, nothing is a layout fact. */
export const half = (value: number): number => Math.round(value * 2) / 2;

const stylesOf = (
  styles: Readonly<Record<string, string>>,
): Readonly<Record<StyleKey, string>> =>
  Object.fromEntries(
    STYLE_KEYS.map((key) => [key, styles[key] ?? '']),
  ) as Record<StyleKey, string>;

const scrolls = (element: MeasuredElement): boolean =>
  element.styles['overflow'] !== undefined &&
  element.styles['overflow'] !== 'visible' &&
  (element.scroll.width > element.scroll.clientWidth ||
    element.scroll.height > element.scroll.clientHeight);

const intersects = (left: LayoutNode, right: LayoutNode): boolean => {
  const [lx, ly, lw, lh] = left.box;
  const [rx, ry, rw, rh] = right.box;
  return lx < rx + rw && rx < lx + lw && ly < ry + rh && ry < ly + lh;
};

export interface DigestOptions {
  /**
   * Paths whose overlap is expected — a tooltip over its anchor, a sticky
   * header over the scrolled content.
   *
   * Declared rather than inferred: overlapping on purpose and overlapping by
   * accident look identical from the outside, and guessing wrong in either
   * direction is worse than being told.
   */
  readonly allowOverlap?: readonly string[];
}

export function layoutDigest(
  measured: readonly MeasuredElement[],
  options: DigestOptions = {},
): LayoutDigest {
  const nodes: LayoutNode[] = measured
    .map((element) => ({
      path: element.path,
      box: [
        half(element.rect.x),
        half(element.rect.y),
        half(element.rect.width),
        half(element.rect.height),
      ] as const,
      ...(element.intrinsic
        ? {
            intrinsic: {
              minContent: half(element.intrinsic.minContent),
              maxContent: half(element.intrinsic.maxContent),
            },
          }
        : {}),
      ...(element.text ? { text: element.text } : {}),
      styles: stylesOf(element.styles),
      overflow: {
        inline: element.scroll.width > element.scroll.clientWidth,
        block: element.scroll.height > element.scroll.clientHeight,
      },
      zOrder: element.zOrder,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const byPath = new Map(measured.map((element) => [element.path, element]));
  const allowed = new Set(options.allowOverlap ?? []);

  const columns: Record<string, number> = {};
  const lines: Record<string, number> = {};
  const wrapped: string[] = [];
  const clipped: string[] = [];
  const scrollbars: string[] = [];

  for (const element of measured) {
    if (element.columns !== undefined) columns[element.path] = element.columns;
    if (element.text) {
      lines[element.path] = element.text.lines;
      if (element.text.clipped > 0) clipped.push(element.path);
    }
    if (scrolls(element)) scrollbars.push(element.path);
    if (element.childRows && new Set(element.childRows).size > 1) {
      wrapped.push(element.path);
    }
  }

  // Only siblings are compared. Two boxes on different branches overlapping is
  // the normal state of any layered layout, and reporting it would drown the
  // one case that matters: two things that share a parent fighting for room.
  const overlaps: [string, string][] = [];
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const one = nodes[left] as LayoutNode;
      const other = nodes[right] as LayoutNode;
      if (allowed.has(one.path) || allowed.has(other.path)) continue;
      if (byPath.get(one.path)?.parent !== byPath.get(other.path)?.parent) continue;
      if (byPath.get(one.path)?.parent === undefined) continue;
      if (one.zOrder !== other.zOrder) continue;
      if (intersects(one, other)) overlaps.push([one.path, other.path]);
    }
  }

  return {
    digestVersion: DIGEST_VERSION,
    nodes,
    signature: {
      columns,
      lines,
      wrapped: wrapped.sort(),
      clipped: clipped.sort(),
      scrollbars: scrollbars.sort(),
      overlaps: overlaps.sort(
        (left, right) =>
          left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]),
      ),
    },
  };
}

/* ------------------------------------------------------------------------ *
 * Reading a digest
 * ------------------------------------------------------------------------ */

export interface DigestDelta {
  readonly path: string;
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

const boxFields = ['x', 'y', 'width', 'height'] as const;

/**
 * What changed, as sentences a reviewer can read.
 *
 * The shape of this list is also what clusters a review queue: two hundred
 * scenarios whose delta reads identically are one decision, not two hundred.
 */
export function digestDelta(
  before: LayoutDigest,
  after: LayoutDigest,
): readonly DigestDelta[] {
  const left = new Map(before.nodes.map((node) => [node.path, node]));
  const right = new Map(after.nodes.map((node) => [node.path, node]));
  const deltas: DigestDelta[] = [];

  for (const [path, node] of right) {
    const previous = left.get(path);
    if (!previous) {
      deltas.push({ path, field: 'node', before: 'absent', after: 'present' });
      continue;
    }
    boxFields.forEach((field, index) => {
      const one = previous.box[index] as number;
      const other = node.box[index] as number;
      if (one !== other) {
        deltas.push({ path, field, before: String(one), after: String(other) });
      }
    });
    for (const key of STYLE_KEYS) {
      if (previous.styles[key] !== node.styles[key]) {
        deltas.push({
          path,
          field: key,
          before: previous.styles[key],
          after: node.styles[key],
        });
      }
    }
    if (previous.text?.lines !== node.text?.lines) {
      deltas.push({
        path,
        field: 'lines',
        before: String(previous.text?.lines ?? 0),
        after: String(node.text?.lines ?? 0),
      });
    }
  }
  for (const path of left.keys()) {
    if (!right.has(path)) {
      deltas.push({ path, field: 'node', before: 'present', after: 'absent' });
    }
  }

  return deltas.sort(
    (one, other) =>
      one.path.localeCompare(other.path) || one.field.localeCompare(other.field),
  );
}

/** `.card padding 8→12`, the line a reviewer actually reads. */
export const formatDelta = (delta: DigestDelta): string =>
  `${delta.path} ${delta.field} ${delta.before}→${delta.after}`;

/**
 * The shape of a change, with the paths removed.
 *
 * Two scenarios whose deltas differ only in which element moved are the *same*
 * decision — a border radius that went from 4 to 8 everywhere. Keying a cluster
 * on the fields and values rather than on the paths is what turns two hundred
 * queue items into one.
 */
export const deltaShape = (deltas: readonly DigestDelta[]): string =>
  [...new Set(deltas.map((delta) => `${delta.field} ${delta.before}→${delta.after}`))]
    .sort()
    .join('; ');

/* ------------------------------------------------------------------------ *
 * Versioning
 * ------------------------------------------------------------------------ */

/**
 * Whether a digest recomputed under a wider contract still says the same thing.
 *
 * Widening the style list must not send every attestation in the repository
 * back to a human. The rule: recompute, and if the only difference is in fields
 * the previous version did not record, carry the attestation forward. Without
 * it, the closed list is a decision nobody can ever revisit — which makes v1 a
 * trap rather than a starting point.
 */
export function carriesForward(
  before: LayoutDigest,
  after: LayoutDigest,
  fieldsAddedSince: readonly StyleKey[],
): boolean {
  const added = new Set<string>(fieldsAddedSince);
  return digestDelta(before, after).every((delta) => added.has(delta.field));
}

/* ------------------------------------------------------------------------ *
 * Collecting, in the page
 * ------------------------------------------------------------------------ */

export interface CollectOptions extends DigestOptions {
  /** Root to measure. Defaults to the document element. */
  readonly root?: string;
  /** Elements whose intrinsic sizes are measured. Costly, so opt-in. */
  readonly intrinsic?: readonly string[];
}

export interface DigestPage {
  evaluate<Argument, Result>(
    body: (argument: Argument) => Result,
    argument: Argument,
  ): Promise<Result>;
}

/**
 * Everything that has to run inside the page, in one self-contained function.
 *
 * One function, with its helpers declared inside it, because a driver
 * serialises it by `toString()` and anything it closed over would arrive
 * undefined — as a runtime error if you are lucky, and as a silently empty
 * measurement if you are not.
 */
export function measureInPage(options: {
  root?: string;
  intrinsic?: readonly string[];
  styleKeys: readonly string[];
}): MeasuredElement[] {
  const root: Element =
    (options.root ? document.querySelector(options.root) : null) ??
    document.documentElement;

  const addressOf = (element: Element): string => {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current !== root.parentElement) {
      const marked =
        current.getAttribute('data-testid') ?? current.getAttribute('name');
      if (marked) {
        parts.unshift(`@${marked}`);
        break;
      }
      const parent: Element | null = current.parentElement;
      const tag = current.tagName;
      const siblings = parent
        ? [...parent.children].filter((child) => child.tagName === tag)
        : [];
      const index = siblings.indexOf(current);
      parts.unshift(
        siblings.length > 1
          ? `${tag.toLowerCase()}[${index}]`
          : tag.toLowerCase(),
      );
      current = parent;
    }
    return parts.join('/');
  };

  const linesOf = (element: Element): number => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter((rect) => rect.height > 0);
    const tops = new Set(rects.map((rect) => Math.round(rect.top * 2) / 2));
    return tops.size || (element.textContent?.trim() ? 1 : 0);
  };

  const intrinsicOf = (element: HTMLElement) => {
    const previous = element.style.width;
    element.style.width = 'min-content';
    const minContent = element.getBoundingClientRect().width;
    element.style.width = 'max-content';
    const maxContent = element.getBoundingClientRect().width;
    element.style.width = previous;
    return { minContent, maxContent };
  };

  const wanted = new Set(options.intrinsic ?? []);
  const measured: MeasuredElement[] = [];

  const visit = (element: Element, parent: string | undefined): void => {
    const path = addressOf(element);
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const styles: Record<string, string> = {};
    for (const key of options.styleKeys) {
      styles[key] = computed.getPropertyValue(key).trim();
    }

    const ownText = [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();

    const children = [...element.children];
    const rows = children.map(
      (child) => Math.round(child.getBoundingClientRect().top * 2) / 2,
    );

    measured.push({
      path,
      ...(parent === undefined ? {} : { parent }),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles,
      scroll: {
        width: element.scrollWidth,
        height: element.scrollHeight,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
      },
      ...(ownText
        ? {
            text: {
              content: ownText,
              lines: linesOf(element),
              // What the box actually *hides*. Only counted when the overflow
              // is not visible: text spilling out of a visible box is a
              // different defect (`overflow.inline` catches it), and folding
              // the two together made every unbreakable word read as a
              // truncation.
              clipped:
                computed.overflowX === 'visible'
                  ? 0
                  : Math.max(0, element.scrollWidth - element.clientWidth),
            },
          }
        : {}),
      ...(wanted.has(path) && element instanceof HTMLElement
        ? { intrinsic: intrinsicOf(element) }
        : {}),
      zOrder: Number.parseInt(computed.zIndex, 10) || 0,
      ...(computed.display.includes('grid')
        ? {
            columns: computed
              .getPropertyValue('grid-template-columns')
              .trim()
              .split(/\s+/)
              .filter(Boolean).length,
          }
        : {}),
      ...(children.length > 0 ? { childRows: rows } : {}),
    });

    for (const child of children) visit(child, path);
  };

  visit(root, undefined);
  return measured;
}

/** Measures the page and turns the measurements into a digest. */
export async function collectLayoutDigest(
  page: DigestPage,
  options: CollectOptions = {},
): Promise<LayoutDigest> {
  const measured = await page.evaluate(measureInPage, {
    ...(options.root ? { root: options.root } : {}),
    ...(options.intrinsic ? { intrinsic: options.intrinsic } : {}),
    styleKeys: STYLE_KEYS as readonly string[],
  });
  return layoutDigest(measured, options);
}
