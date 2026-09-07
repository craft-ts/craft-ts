/** Pure adapter from derived template promises to attestation observations. */
import type { SubjectObservation } from '../attestation.js';
import {
  canonicalJson,
  evidenceHash,
  type EvidenceStore,
} from '../evidence-store.js';

export type TemplateObligationDirection = 'render' | 'command';

/** Data-only boundary: this package deliberately knows nothing about ts-morph. */
export interface TemplateObligationInput {
  readonly subject: string;
  readonly direction: TemplateObligationDirection;
  readonly component: string;
  readonly target: string;
  readonly targetKind: string;
  readonly element?: string;
  readonly elementName?: string;
  readonly statement: string;
}

/** Stable proof behind a template attestation; presentation prose is excluded. */
export interface TemplateEvidence {
  readonly direction: TemplateObligationDirection;
  readonly element: string | null;
  readonly elementName: string | null;
  readonly target: string;
  readonly targetKind: string;
}

export const templateEvidenceValue = (
  obligation: TemplateObligationInput,
): TemplateEvidence => ({
  direction: obligation.direction,
  element: obligation.element ?? null,
  elementName: obligation.elementName ?? null,
  target: obligation.target,
  targetKind: obligation.targetKind,
});

export const serialiseTemplateEvidence = (evidence: TemplateEvidence): string =>
  canonicalJson(evidence);

export function isTemplateEvidence(value: unknown): value is TemplateEvidence {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TemplateEvidence>;
  return (
    (candidate.direction === 'render' || candidate.direction === 'command') &&
    (candidate.element === null || typeof candidate.element === 'string') &&
    (candidate.elementName === null ||
      typeof candidate.elementName === 'string') &&
    typeof candidate.target === 'string' &&
    typeof candidate.targetKind === 'string'
  );
}

export const templateSubjectId = (
  obligation: TemplateObligationInput,
): string => obligation.subject;

/** The promise itself, canonically hashed. Not the code behind it. */
export const templateEvidence = (obligation: TemplateObligationInput): string =>
  evidenceHash(serialiseTemplateEvidence(templateEvidenceValue(obligation)));

/** Store a readable proof under the exact hash written to the ledger. */
export async function storeTemplateEvidence(
  store: EvidenceStore,
  obligation: TemplateObligationInput,
): Promise<string> {
  return await store.put(
    serialiseTemplateEvidence(templateEvidenceValue(obligation)),
    '.template.json',
  );
}

/** Historical attestations may legitimately have no readable proof object. */
export async function loadTemplateEvidence(
  store: EvidenceStore,
  hash: string,
): Promise<TemplateEvidence | undefined> {
  const body = await store.getText(hash, '.template.json');
  if (body === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(body);
    return isTemplateEvidence(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function observeTemplateObligations(
  obligations: readonly TemplateObligationInput[],
  fingerprintOf: (obligation: TemplateObligationInput) => string,
): readonly SubjectObservation[] {
  return obligations
    .map((obligation) => ({
      subject: templateSubjectId(obligation),
      kind: 'template' as const,
      fingerprint: fingerprintOf(obligation),
      evidence: templateEvidence(obligation),
      assumptions: [],
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}
