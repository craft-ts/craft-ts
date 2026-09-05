/**
 * The `visual` subject: one component in one scenario.
 *
 * The evidence judged is the **layout digest**, not the PNG. A digest is
 * stable, diffable, and — the part that pays for the whole approach — it can be
 * asserted on: overflow, truncation, overlap and contrast stop needing an eye.
 * The PNG is kept beside it in the store because a reviewer still wants to see
 * the thing, but it is a review aid, never the reference.
 *
 * Everything visual about this file is in its name. The digest arrives as an
 * opaque value and is canonically hashed; if this module ever needs to know
 * what a `LayoutNode` is, the boundary has moved to the wrong place.
 */
import {
  canonicalJson,
  evidenceHashOf,
  type EvidenceStore,
} from '../evidence-store.js';
import type { Assumption, SubjectObservation } from '../attestation.js';

export interface VisualScenarioRef {
  /** What is being rendered. A graph node id, so it survives a move. */
  readonly component: string;
  /** `viewport=md+scheme=dark`, from the matrix. */
  readonly scenario: string;
}

export interface VisualCapture extends VisualScenarioRef {
  /** The layout digest. Opaque here; hashed canonically. */
  readonly digest: unknown;
  /** Merkle of the component's code slice. */
  readonly fingerprint: string;
  /** Optional screenshot, kept for the reviewer only. */
  readonly image?: Uint8Array;
  readonly assumptions?: readonly Assumption[];
}

export const VISUAL_REPORT_FORMAT = 'craft-ts-visual-report';

/**
 * Portable output of a browser run.
 *
 * The code fingerprint is deliberately absent: the CLI derives it from the
 * current dependency graph. A report that could supply its own fingerprint
 * could accidentally keep a stale slice current forever.
 */
export interface VisualRunCapture extends VisualScenarioRef {
  readonly digest: unknown;
  /** Screenshot path, relative to the report file unless absolute. */
  readonly image?: string;
  readonly assumptions?: readonly Assumption[];
}

export interface VisualRunReport {
  readonly format: typeof VISUAL_REPORT_FORMAT;
  readonly version: 1;
  readonly captures: readonly VisualRunCapture[];
}

export function isVisualRunReport(value: unknown): value is VisualRunReport {
  if (typeof value !== 'object' || value === null) return false;
  const report = value as Partial<VisualRunReport>;
  return (
    report.format === VISUAL_REPORT_FORMAT &&
    report.version === 1 &&
    Array.isArray(report.captures) &&
    report.captures.every((capture) => {
      if (typeof capture !== 'object' || capture === null) return false;
      const candidate = capture as Partial<VisualRunCapture>;
      return (
        typeof candidate.component === 'string' &&
        candidate.component.length > 0 &&
        typeof candidate.scenario === 'string' &&
        candidate.scenario.length > 0 &&
        'digest' in candidate &&
        (candidate.image === undefined ||
          typeof candidate.image === 'string') &&
        (candidate.assumptions === undefined ||
          Array.isArray(candidate.assumptions))
      );
    })
  );
}

export function parseVisualRunReport(value: unknown): VisualRunReport {
  if (!isVisualRunReport(value)) {
    throw new Error(
      `visual report: expected { format: '${VISUAL_REPORT_FORMAT}', version: 1, captures: [...] }.`,
    );
  }
  const subjects = new Set<string>();
  for (const capture of value.captures) {
    const subject = visualSubjectId(capture);
    if (subjects.has(subject)) {
      throw new Error(`visual report: duplicate subject '${subject}'.`);
    }
    subjects.add(subject);
  }
  return value;
}

/** Derives observations from a run and the current graph, never stale input. */
export function observeVisualRun(
  report: VisualRunReport,
  fingerprintFor: (component: string) => string,
): readonly SubjectObservation[] {
  return observeVisuals(
    report.captures.map((capture) => ({
      component: capture.component,
      scenario: capture.scenario,
      digest: capture.digest,
      fingerprint: fingerprintFor(capture.component),
      assumptions: capture.assumptions ?? [],
    })),
  );
}

export const visualSubjectId = (ref: VisualScenarioRef): string =>
  `visual:${ref.component}#${ref.scenario}`;

export const visualEvidence = (digest: unknown): string =>
  evidenceHashOf(digest);

export function observeVisuals(
  captures: readonly VisualCapture[],
): readonly SubjectObservation[] {
  return captures
    .map((capture) => ({
      subject: visualSubjectId(capture),
      kind: 'visual' as const,
      fingerprint: capture.fingerprint,
      evidence: visualEvidence(capture.digest),
      assumptions: capture.assumptions ?? [],
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}

export interface StoredVisual {
  readonly subject: string;
  readonly evidence: string;
  /** Hash of the screenshot, when there is one. */
  readonly image?: string;
}

/**
 * Writes the digest, and the screenshot beside it under its own hash.
 *
 * Two objects rather than one bundle: two hundred scenarios that differ only in
 * their screenshot still share one digest, and a border-radius change that
 * moves every screenshot writes one digest per distinct layout instead of two
 * hundred near-identical blobs.
 */
export async function storeVisual(
  store: EvidenceStore,
  capture: VisualCapture,
): Promise<StoredVisual> {
  // The bytes are the same canonical bytes `visualEvidence` hashes. If the
  // store used pretty JSON here, the ledger's evidence address would point at
  // an object that does not exist and the next review could not load it.
  const evidence = await store.put(
    canonicalJson(capture.digest),
    '.digest.json',
  );
  const image = capture.image
    ? await store.put(capture.image, '.png')
    : undefined;
  return {
    subject: visualSubjectId(capture),
    evidence,
    ...(image ? { image } : {}),
  };
}

/**
 * Groups review items by the *shape* of their diff.
 *
 * One border-radius change produces two hundred scenarios with an identical
 * delta. Asking two hundred questions to collect one answer is how a review
 * queue gets abandoned, and an abandoned queue is a ledger full of stamps. The
 * cluster is written into every attestation it covers, so a single decision is
 * still auditable as having covered all of them.
 *
 * The shape is supplied by the caller — this module cannot diff two digests
 * without knowing what one is.
 */
export function clusterByDiffShape<Item extends { readonly subject: string }>(
  items: readonly Item[],
  shapeOf: (item: Item) => string,
): readonly (readonly string[])[] {
  const byShape = new Map<string, string[]>();
  for (const item of items) {
    const shape = shapeOf(item);
    const known = byShape.get(shape);
    if (known) known.push(item.subject);
    else byShape.set(shape, [item.subject]);
  }
  return [...byShape.values()]
    .map((subjects) => subjects.sort())
    .sort(
      (left, right) =>
        right.length - left.length ||
        (left[0] ?? '').localeCompare(right[0] ?? ''),
    );
}
