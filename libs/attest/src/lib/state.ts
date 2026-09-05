/**
 * Deciding, for each subject, whether a human has to be disturbed.
 *
 * This is the heart of the mechanism, and it is four lines of logic guarding
 * one rule:
 *
 *   the code moved but the evidence did not  →  carry the judgement forward.
 *
 * Without that rule the first cosmetic refactor floods the review queue, people
 * start rubber-stamping, and the ledger becomes a record of nobody having
 * looked at anything. With it, a fingerprint that is too *coarse* costs only a
 * re-render — which is why the slice is allowed to be cautious, and why only a
 * fingerprint that is too *fine* is dangerous.
 */
import {
  isAccepted,
  sameAssumptions,
  type Attestation,
  type AttestationState,
  type SubjectObservation,
} from './attestation.js';
import { withAttestations, type Ledger } from './ledger.js';

export interface SubjectStatus {
  readonly subject: string;
  readonly state: AttestationState;
  readonly observation: SubjectObservation;
  /** The attestation in the ledger, if any. */
  readonly attestation?: Attestation;
  /** Set on `renewed`: the attestation that should replace the stored one. */
  readonly carried?: Attestation;
  /** Why the subject needs a human, in one line. */
  readonly reason?: string;
}

export interface StatusOptions {
  /** Stamped on carried attestations. Defaults to the stored one. */
  readonly toolVersion?: string;
}

/**
 * The state of one subject.
 *
 * `renewed` deliberately requires the assumptions to match as well. An
 * attestation that rested on "eight samples along this axis" does not carry to
 * a run that took four, even when the evidence happens to be identical: the
 * claim being renewed would not be the claim that was made.
 */
export function statusOf(
  ledger: Ledger,
  observation: SubjectObservation,
  options: StatusOptions = {},
): SubjectStatus {
  const attestation = ledger.get(observation.subject);
  const assumptions = observation.assumptions ?? [];

  if (!attestation) {
    return {
      subject: observation.subject,
      state: 'missing',
      observation,
      reason: 'never attested',
    };
  }

  if (!isAccepted(attestation.verdict)) {
    return {
      subject: observation.subject,
      state: 'review',
      observation,
      attestation,
      reason: `last verdict was '${attestation.verdict}'`,
    };
  }

  if (attestation.fingerprint === observation.fingerprint) {
    // Same code. The evidence is not even consulted: re-deriving it was
    // already unnecessary, and comparing it here would turn a flaky render
    // into a review item for a subject nothing touched.
    return {
      subject: observation.subject,
      state: 'current',
      observation,
      attestation,
    };
  }

  if (attestation.evidence !== observation.evidence) {
    return {
      subject: observation.subject,
      state: 'review',
      observation,
      attestation,
      reason: 'the output changed',
    };
  }

  if (!sameAssumptions(attestation.assumptions, assumptions)) {
    return {
      subject: observation.subject,
      state: 'review',
      observation,
      attestation,
      reason: 'the reductions the verdict rested on changed',
    };
  }

  return {
    subject: observation.subject,
    state: 'renewed',
    observation,
    attestation,
    carried: carryForward(attestation, observation, options.toolVersion),
  };
}

/**
 * The attestation that replaces a stored one when the code moved alone.
 *
 * `by`, `at` and `verdict` are **not** refreshed. They name the human
 * judgement, and a carry-forward is precisely the absence of a new one; a
 * ledger that stamped today's date here would erase the only fact worth
 * keeping.
 */
export function carryForward(
  attestation: Attestation,
  observation: SubjectObservation,
  toolVersion?: string,
): Attestation {
  return {
    ...attestation,
    fingerprint: observation.fingerprint,
    evidence: observation.evidence,
    carriedFrom: attestation.carriedFrom ?? attestation.fingerprint,
    toolVersion: toolVersion ?? attestation.toolVersion,
  };
}

export interface LedgerReport {
  readonly statuses: readonly SubjectStatus[];
  /** Subjects in the ledger that nothing produces any more. */
  readonly orphaned: readonly string[];
  readonly counts: Readonly<Record<AttestationState, number>>;
  /** How many of the current attestations came from a bulk renewal. */
  readonly bulk: number;
}

export function reportOn(
  ledger: Ledger,
  observations: readonly SubjectObservation[],
  options: StatusOptions = {},
): LedgerReport {
  const statuses = observations
    .map((observation) => statusOf(ledger, observation, options))
    .sort((left, right) => left.subject.localeCompare(right.subject));
  const produced = new Set(observations.map((observation) => observation.subject));
  const counts: Record<AttestationState, number> = {
    current: 0,
    renewed: 0,
    review: 0,
    missing: 0,
  };
  for (const status of statuses) counts[status.state] += 1;
  return {
    statuses,
    orphaned: [...ledger.keys()].filter((subject) => !produced.has(subject)).sort(),
    counts,
    bulk: statuses.filter((status) => status.attestation?.bulk === true).length,
  };
}

/**
 * Applies every automatic carry-forward the report found.
 *
 * Separated from `reportOn` on purpose: reading the state of the world must
 * never write to the ledger, or `attest status` would silently approve things
 * by being run.
 */
export function applyRenewals(ledger: Ledger, report: LedgerReport): Ledger {
  return withAttestations(
    ledger,
    report.statuses.flatMap((status) => (status.carried ? [status.carried] : [])),
  );
}
