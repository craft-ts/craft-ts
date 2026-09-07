/** Pure adapter from derived template promises to attestation observations. */
import type { SubjectObservation } from '../attestation.js';
import { evidenceHashOf } from '../evidence-store.js';

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

export const templateSubjectId = (
  obligation: TemplateObligationInput,
): string => obligation.subject;

/** The promise itself, canonically hashed. Not the code behind it. */
export const templateEvidence = (obligation: TemplateObligationInput): string =>
  evidenceHashOf({
    direction: obligation.direction,
    element: obligation.element ?? null,
    elementName: obligation.elementName ?? null,
    target: obligation.target,
    targetKind: obligation.targetKind,
  });

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
