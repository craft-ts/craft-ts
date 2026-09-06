/**
 * Wiring the register to the matrix that already exists.
 *
 * `visualMatrix` is not replaced and is not going to be. It stays the cheap
 * tier: out-of-flow things — modals, popovers, tooltips — have no neighbourhood
 * to speak of, and a purely pictorial axis has no layout consequence at all.
 * Both are enumerable from the sheets alone, with no page in sight.
 *
 * What changes is what gets recorded. Instead of "here are the reference
 * pixels", the pair (fingerprint of the component's code, hash of the layout
 * digest) goes into the ledger, and a scenario is only re-shown to a person
 * when the second one moves.
 */
import {
  visibleBandOf,
  type CaptureScope,
  type LayoutDigest,
} from './digest.js';
import type { VisualScenario } from './matrix.js';

/** What `@craft-ts/attest` needs, restated so this file imports nothing. */
export interface VisualObservation {
  readonly subject: string;
  readonly kind: 'visual';
  readonly fingerprint: string;
  readonly evidence: string;
  readonly assumptions: readonly unknown[];
}

export interface ScenarioCapture {
  readonly scenario: VisualScenario;
  readonly digest: LayoutDigest;
  readonly image?: Uint8Array;
  readonly assumptions?: readonly unknown[];
}

export interface ComponentCaptures {
  /**
   * The component's node id in the dependency graph.
   *
   * A graph id rather than a display name: the id survives a rename and a move,
   * which is the property the whole register is built on.
   */
  readonly component: string;
  /** Merkle of the component's code slice, sheets and variables included. */
  readonly fingerprint: string;
  readonly captures: readonly ScenarioCapture[];
}

export const VISUAL_REPORT_FORMAT = 'craft-ts-visual-report';

/** Rendering context shown to the reviewer; it is not part of the evidence hash. */
export interface VisualCaptureMetadata {
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly screenshot?: {
    readonly width: number;
    readonly height: number;
  };
  /**
   * Where the captured image sits in page coordinates.
   *
   * The one field that makes three things possible at once: drawing the fold
   * onto the picture, widening the frame past the subject, and mapping a
   * digest box — whose coordinates are the viewport's — onto the image.
   * Without it the transform is unrecoverable and every one of the three
   * becomes guesswork.
   */
  readonly origin?: { readonly x: number; readonly y: number };
  /** The part of the image that was actually on screen, in image coordinates. */
  readonly visibleBand?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /**
   * What the verdict covers against what a person could look at.
   *
   * Reported rather than hidden, on the same rule as `bulk` and `assumptions`:
   * an attestation that claimed a human judged nodes nobody could see would be
   * recording a coverage it does not have.
   */
  readonly coverage?: {
    readonly attested: number;
    readonly offScreen: number;
    readonly occluded: number;
  };
  /** Attested paths that were off screen when the capture was taken. */
  readonly offScreen?: readonly string[];
  /** Attested paths covered by something outside the subject, and by what. */
  readonly occluded?: readonly {
    readonly path: string;
    readonly by: string;
  }[];
  readonly colorScheme?: 'light' | 'dark' | 'no-preference';
  readonly browser?: {
    readonly name: string;
    readonly version: string;
  };
  readonly target?: string;
}

/** Turns a capture scope into the metadata a review card reads. */
export function metadataFromScope(
  scope: CaptureScope,
): VisualCaptureMetadata {
  const band = visibleBandOf(scope);
  return {
    viewport: scope.viewport,
    origin: { x: Math.floor(scope.region.x), y: Math.floor(scope.region.y) },
    visibleBand: band,
    coverage: {
      attested: scope.attested.length,
      offScreen: scope.offScreen.length,
      occluded: scope.occluded.length,
    },
    ...(scope.offScreen.length > 0 ? { offScreen: scope.offScreen } : {}),
    ...(scope.occluded.length > 0 ? { occluded: scope.occluded } : {}),
  };
}

export interface VisualReportCapture {
  /** Repository-relative graph node id. */
  readonly component: string;
  readonly scenario: string;
  readonly digest: LayoutDigest;
  /**
   * Snapshot file name, beside the report.
   *
   * A review aid like the screenshot, never the evidence: the evidence stays
   * the digest hash. Hashing the document would queue a human every time an
   * attribute was reordered.
   */
  readonly snapshot?: string;
  /** What the snapshot could not reproduce, carried so the card can say it. */
  readonly snapshotRisks?: readonly {
    readonly kind: string;
    readonly detail: string;
  }[];
  /** Screenshot path, relative to the report file unless absolute. */
  readonly image?: string;
  readonly metadata?: VisualCaptureMetadata;
  readonly assumptions?: readonly unknown[];
}

export interface VisualReport {
  readonly format: typeof VISUAL_REPORT_FORMAT;
  readonly version: 1;
  readonly captures: readonly VisualReportCapture[];
}

/** Builds the JSON value consumed by `craft-ts attest --report`. */
export function visualReport(
  captures: readonly VisualReportCapture[],
): VisualReport {
  const sorted = [...captures].sort((left, right) =>
    visualSubject(left.component, left.scenario).localeCompare(
      visualSubject(right.component, right.scenario),
    ),
  );
  const subjects = sorted.map((capture) =>
    visualSubject(capture.component, capture.scenario),
  );
  const duplicate = subjects.find(
    (subject, index) => index > 0 && subjects[index - 1] === subject,
  );
  if (duplicate)
    throw new Error(`visualReport: duplicate subject '${duplicate}'.`);
  return { format: VISUAL_REPORT_FORMAT, version: 1, captures: sorted };
}

export const visualSubject = (component: string, scenario: string): string =>
  `visual:${component}#${scenario}`;

/**
 * Turns captures into observations, given the hasher the register uses.
 *
 * The hasher is passed in rather than imported so `@craft-ts/style-testing`
 * does not depend on `@craft-ts/attest` — the register is meant to be
 * subject-agnostic, and a dependency in this direction would quietly make it
 * the visual package's dependency instead.
 */
export function observeCaptures(
  captured: ComponentCaptures,
  hashEvidence: (digest: LayoutDigest) => string,
): readonly VisualObservation[] {
  return captured.captures
    .map((capture) => ({
      subject: visualSubject(captured.component, capture.scenario.id),
      kind: 'visual' as const,
      fingerprint: captured.fingerprint,
      evidence: hashEvidence(capture.digest),
      assumptions: capture.assumptions ?? [],
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}

/**
 * Scenarios of a matrix that no capture covers.
 *
 * The counterpart of `assertExhaustiveVisualMatrix`, moved onto the register: a
 * scenario with no attestation is a way the component can look that nobody has
 * ever agreed to.
 */
export function uncoveredScenarios(
  scenarios: readonly VisualScenario[],
  captured: ComponentCaptures,
): readonly string[] {
  const seen = new Set(captured.captures.map((capture) => capture.scenario.id));
  return scenarios
    .map((scenario) => scenario.id)
    .filter((id) => !seen.has(id))
    .sort();
}
