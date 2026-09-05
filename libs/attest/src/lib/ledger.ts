/**
 * The ledger: one line per attestation, sorted by subject.
 *
 * The format is JSON Lines and the sort is not cosmetic. Two branches that
 * attest different subjects have to merge without a conflict, or the mechanism
 * dies the first time two people use it in the same week. One object per line,
 * sorted by subject, with sorted keys: a new subject is an inserted line, and
 * git resolves that on its own.
 *
 * Only the *latest* attestation of a subject is kept. The chain back to the
 * original human judgement is carried in `carriedFrom`, not in file history —
 * a ledger that grew a line per renewal would conflict on every commit, which
 * is the thing this format exists to avoid.
 */
import { isAttestation, type Attestation } from './attestation.js';

export type Ledger = ReadonlyMap<string, Attestation>;

export const DEFAULT_LEDGER_PATH = '.craft/attestations.jsonl';

const KEY_ORDER: readonly (keyof Attestation)[] = [
  'subject',
  'kind',
  'fingerprint',
  'evidence',
  'verdict',
  'assumptions',
  'by',
  'at',
  'toolVersion',
  'note',
  'carriedFrom',
  'cluster',
  'bulk',
];

/** One attestation as a line: keys in a fixed order, so a diff reads. */
export function serialiseAttestation(attestation: Attestation): string {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    const value = attestation[key];
    if (value !== undefined) ordered[key] = value;
  }
  return JSON.stringify(ordered);
}

export function serialiseLedger(ledger: Ledger): string {
  const lines = [...ledger.values()]
    .sort((left, right) => left.subject.localeCompare(right.subject))
    .map(serialiseAttestation);
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export interface ParsedLedger {
  readonly ledger: Ledger;
  /** Lines that were not attestations, with their 1-based number. */
  readonly rejected: readonly { readonly line: number; readonly reason: string }[];
}

/**
 * Reads a ledger, keeping the last attestation of each subject.
 *
 * A malformed line is reported rather than thrown on: a merge that went wrong
 * must not make the whole ledger unreadable, because the recovery for that is
 * "re-attest everything", which is exactly what nobody will do.
 */
export function parseLedger(contents: string): ParsedLedger {
  const ledger = new Map<string, Attestation>();
  const rejected: { line: number; reason: string }[] = [];
  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] as string).trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      rejected.push({ line: index + 1, reason: 'not JSON' });
      continue;
    }
    if (!isAttestation(parsed)) {
      rejected.push({ line: index + 1, reason: 'not an attestation' });
      continue;
    }
    ledger.set(parsed.subject, parsed);
  }
  return { ledger, rejected };
}

/** A ledger with one attestation added or replaced. */
export function withAttestation(
  ledger: Ledger,
  attestation: Attestation,
): Ledger {
  const next = new Map(ledger);
  next.set(attestation.subject, attestation);
  return next;
}

export function withAttestations(
  ledger: Ledger,
  attestations: Iterable<Attestation>,
): Ledger {
  const next = new Map(ledger);
  for (const attestation of attestations) next.set(attestation.subject, attestation);
  return next;
}

/** Drops subjects nothing produces any more. */
export function withoutSubjects(
  ledger: Ledger,
  subjects: Iterable<string>,
): Ledger {
  const next = new Map(ledger);
  for (const subject of subjects) next.delete(subject);
  return next;
}

/**
 * The fingerprint a human actually judged.
 *
 * `carriedFrom` points at the **origin**, not at the immediately previous
 * fingerprint: only the latest attestation of a subject is kept on disk, so a
 * pointer to the previous one would break the chain at the second carry and
 * the origin would be unrecoverable. Each carry copies the pointer forward
 * rather than re-aiming it, which is what makes "when did a person last
 * actually look at this?" answerable from one line.
 */
export function originOf(attestation: Attestation): string {
  return attestation.carriedFrom ?? attestation.fingerprint;
}
