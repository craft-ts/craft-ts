/**
 * An architecture waiver, as a subject a person decides on.
 *
 * A waiver in `architecture/waivers.ts` excuses one rule for one target, with
 * a reason. The architecture check only makes sure the reason is not empty and
 * the waiver is not stale; whether the reason is *good* is a human judgement,
 * and this subject is where it is recorded.
 *
 * The id is `architecture-waiver:<project>:<rule>:<target>` — stable across
 * edits of the file. The evidence is the rule, the target and the reason: a
 * new reason is a new decision.
 */
import type { SubjectObservation } from '../attestation.js';
import {
  canonicalJson,
  evidenceHash,
  type EvidenceStore,
} from '../evidence-store.js';

export interface ArchitectureWaiverInput {
  /** Repository-relative directory holding `architecture/waivers.ts`. */
  readonly project: string;
  readonly rule: string;
  readonly target: string;
  readonly reason: string;
  /** Repository-relative path of the waivers file. */
  readonly filePath: string;
  readonly line: number;
}

export interface ArchitectureWaiverEvidence {
  readonly project: string;
  readonly rule: string;
  readonly target: string;
  readonly reason: string;
}

export const architectureWaiverSubjectId = (
  input: Pick<ArchitectureWaiverInput, 'project' | 'rule' | 'target'>,
): string =>
  `architecture-waiver:${input.project}:${input.rule}:${input.target}`;

export const architectureWaiverEvidenceValue = (
  input: ArchitectureWaiverInput,
): ArchitectureWaiverEvidence => ({
  project: input.project,
  rule: input.rule,
  target: input.target,
  reason: input.reason,
});

export const serialiseArchitectureWaiverEvidence = (
  evidence: ArchitectureWaiverEvidence,
): string => canonicalJson(evidence);

export function isArchitectureWaiverEvidence(
  value: unknown,
): value is ArchitectureWaiverEvidence {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ArchitectureWaiverEvidence>;
  return (
    typeof candidate.project === 'string' &&
    typeof candidate.rule === 'string' &&
    typeof candidate.target === 'string' &&
    typeof candidate.reason === 'string'
  );
}

export const architectureWaiverEvidence = (
  input: ArchitectureWaiverInput,
): string =>
  evidenceHash(
    serialiseArchitectureWaiverEvidence(architectureWaiverEvidenceValue(input)),
  );

export async function storeArchitectureWaiverEvidence(
  store: EvidenceStore,
  input: ArchitectureWaiverInput,
): Promise<string> {
  return await store.put(
    serialiseArchitectureWaiverEvidence(architectureWaiverEvidenceValue(input)),
    '.architecture-waiver.json',
  );
}

export async function loadArchitectureWaiverEvidence(
  store: EvidenceStore,
  hash: string,
): Promise<ArchitectureWaiverEvidence | undefined> {
  const body = await store.getText(hash, '.architecture-waiver.json');
  if (body === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(body);
    return isArchitectureWaiverEvidence(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Like a directive, a waiver has no code slice: the evidence is the fingerprint. */
export function observeArchitectureWaivers(
  inputs: readonly ArchitectureWaiverInput[],
): readonly SubjectObservation[] {
  return inputs
    .map((input) => {
      const evidence = architectureWaiverEvidence(input);
      return {
        subject: architectureWaiverSubjectId(input),
        kind: 'architecture-waiver' as const,
        fingerprint: evidence,
        evidence,
        assumptions: [],
      };
    })
    .sort((left, right) => left.subject.localeCompare(right.subject));
}
