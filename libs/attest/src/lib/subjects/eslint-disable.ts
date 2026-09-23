import type { SubjectObservation } from '../attestation.js';
import {
  canonicalJson,
  evidenceHash,
  type EvidenceStore,
} from '../evidence-store.js';

export interface EslintDisableInput {
  readonly subject: string;
  readonly filePath: string;
  readonly line: number;
  readonly highlightLine: number;
  readonly directive:
    | 'disable'
    | 'disable-line'
    | 'disable-next-line';
  readonly rule: string;
  readonly reason?: string;
  readonly source: string;
}

export interface EslintDisableEvidence {
  readonly filePath: string;
  readonly line: number;
  readonly highlightLine: number;
  readonly directive: EslintDisableInput['directive'];
  readonly rule: string;
  readonly reason: string | null;
  readonly source: string;
}

export const eslintDisableEvidenceValue = (
  input: EslintDisableInput,
): EslintDisableEvidence => ({
  filePath: input.filePath,
  line: input.line,
  highlightLine: input.highlightLine,
  directive: input.directive,
  rule: input.rule,
  reason: input.reason ?? null,
  source: input.source,
});

export const serialiseEslintDisableEvidence = (
  evidence: EslintDisableEvidence,
): string => canonicalJson(evidence);

export function isEslintDisableEvidence(
  value: unknown,
): value is EslintDisableEvidence {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EslintDisableEvidence>;
  return (
    typeof candidate.filePath === 'string' &&
    typeof candidate.line === 'number' &&
    typeof candidate.highlightLine === 'number' &&
    (candidate.directive === 'disable' ||
      candidate.directive === 'disable-line' ||
      candidate.directive === 'disable-next-line') &&
    typeof candidate.rule === 'string' &&
    (candidate.reason === null || typeof candidate.reason === 'string') &&
    typeof candidate.source === 'string'
  );
}

export const eslintDisableSubjectId = (input: EslintDisableInput): string =>
  input.subject;

export const eslintDisableEvidence = (input: EslintDisableInput): string =>
  evidenceHash(serialiseEslintDisableEvidence(eslintDisableEvidenceValue(input)));

export async function storeEslintDisableEvidence(
  store: EvidenceStore,
  input: EslintDisableInput,
): Promise<string> {
  return await store.put(
    serialiseEslintDisableEvidence(eslintDisableEvidenceValue(input)),
    '.eslint-disable.json',
  );
}

export async function loadEslintDisableEvidence(
  store: EvidenceStore,
  hash: string,
): Promise<EslintDisableEvidence | undefined> {
  const body = await store.getText(hash, '.eslint-disable.json');
  if (body === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(body);
    return isEslintDisableEvidence(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function observeEslintDisables(
  inputs: readonly EslintDisableInput[],
  fingerprintOf: (input: EslintDisableInput) => string,
): readonly SubjectObservation[] {
  return inputs
    .map((input) => ({
      subject: eslintDisableSubjectId(input),
      kind: 'eslint-disable' as const,
      fingerprint: fingerprintOf(input),
      evidence: eslintDisableEvidence(input),
      assumptions: [],
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}
