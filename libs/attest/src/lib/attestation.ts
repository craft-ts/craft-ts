/**
 * What is recorded when a human looks at something and says "yes, that".
 *
 * The unit of truth is deliberately *not* a reference image. An attestation
 * says: **a person judged this output correct, and that judgement holds for as
 * long as the code producing it has not moved**. Two consequences follow, and
 * they are the whole design:
 *
 * - the thing that decides whether to **re-run** is a fingerprint of the code
 *   slice. Getting it wrong costs CPU.
 * - the thing that decides whether to **ask a human again** is a hash of the
 *   evidence produced. Getting it wrong costs somebody's afternoon.
 *
 * Confusing the two is the design mistake this module exists to prevent. When
 * the code moves and the evidence does not, the attestation carries forward on
 * its own, marked `renewed`, and nobody is disturbed — which is what makes the
 * mechanism survive a refactor, and what licenses a deliberately cautious code
 * fingerprint.
 *
 * Nothing here knows what a subject *is*. A subject is a string, a fingerprint
 * and an evidence hash. If this module ever needs to import a browser, a DOM,
 * or a style sheet, the abstraction is wrong.
 */

export type SubjectKind = 'test' | 'visual' | 'doc-example' | 'api-surface';

export type Verdict =
  | 'ok'
  | 'ok-with-note'
  | 'rejected'
  | 'known-issue'
  | 'blocked';

export type SeamDirection = 'inline' | 'block' | 'baseline' | 'order';

/**
 * A reduction that is not exactly true.
 *
 * An attestation never says "validated". It says "validated, under this
 * assumption" — and when the assumption changes, exhaustiveness fails instead
 * of the coverage quietly becoming a lie.
 */
export type Assumption =
  | {
      readonly kind: 'sampling';
      readonly axis: string;
      readonly samples: number;
      readonly transitions: readonly number[];
    }
  | {
      readonly kind: 'seam';
      readonly node: string;
      readonly closes: readonly SeamDirection[];
      readonly reason: string;
    }
  | { readonly kind: 'neighborhood'; readonly members: readonly string[] };

/**
 * A remark aimed at one node, rather than at a whole scenario.
 *
 * "The title is cut" is prose somebody has to re-read the screenshot to act
 * on. `{ path: 'userCard/title', note: 'cut at 34px' }` is a fact with an
 * address — and it is the *same* address the digest and `attest why` use, so a
 * finding can be followed back to the code that produced it.
 */
export interface Finding {
  /** A path from the subject's digest. Validated before it is recorded. */
  readonly path: string;
  readonly note: string;
}

export interface Attestation {
  /** `visual:route(/users)#viewport=md+query=error` */
  readonly subject: string;
  readonly kind: SubjectKind;
  /** Merkle of the code slice. Decides re-running. */
  readonly fingerprint: string;
  /** Hash of the evidence that was judged. Decides asking a human. */
  readonly evidence: string;
  readonly verdict: Verdict;
  readonly assumptions: readonly Assumption[];
  readonly by: string;
  readonly at: string;
  readonly toolVersion: string;
  readonly note?: string;
  /** Set when the attestation was carried forward without a human. */
  readonly carriedFrom?: string;
  /** Set when one verdict covered a cluster of identical diffs. */
  readonly cluster?: readonly string[];
  /**
   * Set when the attestation came out of a bulk renewal.
   *
   * A `renew --all` that leaves no trace turns the ledger into a rubber stamp;
   * this is the trace, and `attest status` counts it.
   */
  readonly bulk?: true;
  /** What the reviewer pointed at, when they pointed at something. */
  readonly findings?: readonly Finding[];
  /**
   * Set when the verdict was reached without a faithful replay.
   *
   * Judging a screenshot instead of the frozen document is a reduction: the
   * reviewer could not open anything the picture did not already show, and
   * could not see what the page's own chrome was covering. Same rule as `bulk`
   * — a reduction that is not exactly true is written down, so that "judged on
   * a verified replay" and "judged on a photograph" stay different claims.
   */
  readonly degraded?: true;
}

/**
 * Findings that name a node the subject does not contain.
 *
 * The point of typing a rejection is that the mistake becomes impossible to
 * record silently: a reviewer looking at a whole page can easily point at the
 * navigation, or at a neighbouring component, and file it against this
 * subject. The attested set is known exactly — it is the digest's own paths —
 * so the tool can say so instead of storing it.
 */
export function unknownFindings(
  findings: readonly Finding[],
  attestedPaths: readonly string[],
): readonly Finding[] {
  const attested = new Set(attestedPaths);
  return findings.filter((finding) => !attested.has(finding.path));
}

export type AttestationState =
  /** The fingerprint has not moved: nothing to do. */
  | 'current'
  /** Code moved, evidence did not: carried forward without a human. */
  | 'renewed'
  /** The evidence differs: a human has to look. */
  | 'review'
  /** Never attested. */
  | 'missing';

/** Everything an ordering needs, and nothing a subject adapter cannot give. */
export interface SubjectObservation {
  readonly subject: string;
  readonly kind: SubjectKind;
  readonly fingerprint: string;
  readonly evidence: string;
  readonly assumptions?: readonly Assumption[];
}

export const ATTESTATION_VERSION = 1;

const SEAM_DIRECTIONS: readonly SeamDirection[] = [
  'inline',
  'block',
  'baseline',
  'order',
];

/**
 * A stable, canonical rendering of a set of assumptions.
 *
 * Canonical because a change of assumption has to be *detectable*: two
 * attestations that differ only in the order their assumptions were collected
 * are the same attestation, and two that differ in an axis' sample count are
 * not.
 */
export function assumptionKey(assumptions: readonly Assumption[]): string {
  return assumptions
    .map((assumption) => {
      switch (assumption.kind) {
        case 'sampling':
          return `sampling:${assumption.axis}:${assumption.samples}:${[
            ...assumption.transitions,
          ]
            .sort((left, right) => left - right)
            .join(',')}`;
        case 'seam':
          return `seam:${assumption.node}:${SEAM_DIRECTIONS.filter((direction) =>
            assumption.closes.includes(direction),
          ).join(',')}`;
        case 'neighborhood':
          return `neighborhood:${[...assumption.members].sort().join(',')}`;
      }
    })
    .sort()
    .join('|');
}

/** True when two attestations rest on the same reductions. */
export const sameAssumptions = (
  left: readonly Assumption[],
  right: readonly Assumption[],
): boolean => assumptionKey(left) === assumptionKey(right);

/** A verdict that counts as "somebody looked and accepted it". */
export const isAccepted = (verdict: Verdict): boolean =>
  verdict === 'ok' || verdict === 'ok-with-note' || verdict === 'known-issue';

export function isAttestation(value: unknown): value is Attestation {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Attestation>;
  return (
    typeof candidate.subject === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.fingerprint === 'string' &&
    typeof candidate.evidence === 'string' &&
    typeof candidate.verdict === 'string' &&
    Array.isArray(candidate.assumptions) &&
    typeof candidate.by === 'string' &&
    typeof candidate.at === 'string' &&
    typeof candidate.toolVersion === 'string'
  );
}
