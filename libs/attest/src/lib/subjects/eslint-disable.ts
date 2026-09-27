/**
 * An inline `eslint-disable` directive, as a subject a person decides on.
 *
 * Disabling a rule is how a deliberate bypass stays *possible*; attesting it is
 * how it stays *visible*. The subject is the directive, not the file around it:
 *
 * - its id is `eslint-disable:<file>:<rule>:<ordinal>` — the n-th directive for
 *   that rule in that file. No line number: inserting an import above it must
 *   not turn it into a new subject;
 * - its evidence is the directive, its reason and the lines it silences — not
 *   the whole file. Editing an unrelated function must not send it back to
 *   review; changing the reason or the silenced code must.
 */
import type { SubjectObservation } from '../attestation.js';
import {
  canonicalJson,
  evidenceHash,
  type EvidenceStore,
} from '../evidence-store.js';

export type EslintDisableDirective =
  | 'disable'
  | 'disable-line'
  | 'disable-next-line';

export interface EslintDisableInput {
  readonly subject: string;
  readonly filePath: string;
  readonly line: number;
  readonly highlightLine: number;
  readonly directive: EslintDisableDirective;
  /** A rule id, or `'*'` for a directive that names none. */
  readonly rule: string;
  readonly reason?: string;
  /** The whole file, for the excerpt. Not part of the evidence. */
  readonly source: string;
}

export interface EslintDisableEvidence {
  readonly filePath: string;
  readonly directive: EslintDisableDirective;
  readonly rule: string;
  readonly reason: string | null;
  /**
   * The directive line and the lines it silences, verbatim. Line *numbers*
   * are left out on purpose: they move with every edit above the directive.
   */
  readonly excerpt: readonly string[];
}

/** How many lines a file-level `eslint-disable` shows after itself. */
const BLOCK_EXCERPT_LINES = 6;

/** 1-based, inclusive: the lines the directive silences, directive included. */
export function eslintDisableExcerptRange(input: EslintDisableInput): {
  readonly start: number;
  readonly end: number;
} {
  switch (input.directive) {
    case 'disable-line':
      return { start: input.line, end: input.line };
    case 'disable-next-line':
      return { start: input.line, end: input.line + 1 };
    case 'disable':
      return { start: input.line, end: input.line + BLOCK_EXCERPT_LINES };
  }
}

export const eslintDisableExcerpt = (
  input: EslintDisableInput,
): readonly string[] => {
  const lines = input.source.split(/\r?\n/);
  const { start, end } = eslintDisableExcerptRange(input);
  return lines.slice(start - 1, Math.min(end, lines.length));
};

export const eslintDisableEvidenceValue = (
  input: EslintDisableInput,
): EslintDisableEvidence => ({
  filePath: input.filePath,
  directive: input.directive,
  rule: input.rule,
  reason: input.reason ?? null,
  excerpt: eslintDisableExcerpt(input),
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
    (candidate.directive === 'disable' ||
      candidate.directive === 'disable-line' ||
      candidate.directive === 'disable-next-line') &&
    typeof candidate.rule === 'string' &&
    (candidate.reason === null || typeof candidate.reason === 'string') &&
    Array.isArray(candidate.excerpt) &&
    candidate.excerpt.every((line) => typeof line === 'string')
  );
}

export const eslintDisableSubjectId = (input: EslintDisableInput): string =>
  input.subject;

export const eslintDisableEvidence = (input: EslintDisableInput): string =>
  evidenceHash(
    serialiseEslintDisableEvidence(eslintDisableEvidenceValue(input)),
  );

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

/**
 * The fingerprint is the evidence itself: a directive has no code slice to
 * re-run, only text a person reads. Same code, same decision.
 */
export function observeEslintDisables(
  inputs: readonly EslintDisableInput[],
): readonly SubjectObservation[] {
  return inputs
    .map((input) => {
      const evidence = eslintDisableEvidence(input);
      return {
        subject: eslintDisableSubjectId(input),
        kind: 'eslint-disable' as const,
        fingerprint: evidence,
        evidence,
        assumptions: [],
      };
    })
    .sort((left, right) => left.subject.localeCompare(right.subject));
}
