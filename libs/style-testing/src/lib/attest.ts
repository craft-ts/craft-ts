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
import type { LayoutDigest } from './digest.js';
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
