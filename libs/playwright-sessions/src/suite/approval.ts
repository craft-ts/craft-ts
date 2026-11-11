import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  parseLedger,
  serialiseLedger,
  statusOf,
  withAttestation,
  type Attestation,
  type Ledger,
  type SubjectObservation,
} from '@craft-ts/attest';
import type { GoldenSessionComparison } from './compare-runs.js';

/**
 * Approving a change the suite found, in the `@craft-ts/attest` register.
 *
 * A `changed` session is a difference a person has to look at: approved, it
 * stops failing the check — that difference, and only it. The attestation's
 * subject is the session (`golden:<app>:<session>`), its evidence the
 * fingerprint of the difference (`GoldenChange`: the moments that differ, and
 * every measured change in them). The next run that finds the same
 * difference finds it approved; one that finds another — a further change,
 * the same moments differing otherwise — is reported again.
 *
 * A regression is never approved: the head lost a call, a state, an element
 * the recording had. It is fixed, or the session recorded again.
 */
export const GOLDEN_ATTESTATION_KIND = 'golden-session';

export function goldenSubject(app: string, sessionId: string): string {
  return `golden:${app}:${sessionId}`;
}

/**
 * What the register is asked about a session: its difference, as fingerprint
 * and as evidence both — the code that produced it is two builds, and only
 * the difference itself says whether a person has already seen it.
 */
function observationOf(app: string, session: GoldenSessionComparison): SubjectObservation | undefined {
  if (session.verdict !== 'changed' || !session.change) return undefined;
  return {
    subject: goldenSubject(app, session.sessionId),
    kind: GOLDEN_ATTESTATION_KIND,
    fingerprint: session.change.fingerprint,
    evidence: session.change.fingerprint,
  };
}

/** Whether a person approved this very difference. Anything but a `changed` session: no. */
export function isGoldenChangeApproved(ledger: Ledger, app: string, session: GoldenSessionComparison): boolean {
  const observation = observationOf(app, session);
  return observation !== undefined && statusOf(ledger, observation).state === 'current';
}

export type GoldenApproval = Readonly<{
  /** Who approves: a person's name. */
  by: string;
  /** When, as an ISO date; now by default. */
  at?: string;
  /** What was compared, for whoever reads the register later. */
  builds?: Readonly<{ base: string; head: string }>;
}>;

/**
 * The register with this session's difference approved. Throws, for the
 * person, on a session that is not a change to approve.
 */
export function approveGoldenChange(
  ledger: Ledger,
  app: string,
  session: GoldenSessionComparison,
  approval: GoldenApproval,
): Ledger {
  if (session.verdict === 'regression')
    throw new Error(`La session ${session.sessionId.slice(0, 8)} est une régression (${session.reason}) : elle se corrige, elle ne s’approuve pas.`);
  if (session.verdict !== 'changed')
    throw new Error(`La session ${session.sessionId.slice(0, 8)} n’a pas de changement à approuver (${session.verdict}).`);
  const observation = observationOf(app, session);
  const change = session.change;
  if (!observation || !change)
    throw new Error(`Le rapport ne donne pas l’empreinte du changement de ${session.sessionId.slice(0, 8)} : relancez la vérification.`);
  const attestation: Attestation = {
    subject: observation.subject,
    kind: GOLDEN_ATTESTATION_KIND,
    fingerprint: observation.fingerprint,
    evidence: observation.evidence,
    verdict: 'ok',
    assumptions: [],
    by: approval.by,
    at: approval.at ?? new Date().toISOString(),
    toolVersion: 'sessions-check/1',
    note: `moment(s) ${change.moments.join(', ')}${approval.builds ? ` · ${approval.builds.base} → ${approval.builds.head}` : ''}`,
  };
  return withAttestation(ledger, attestation);
}

/** The register at `path`; empty when there is none yet. */
export function readGoldenLedger(path: string): Ledger {
  return existsSync(path) ? parseLedger(readFileSync(path, 'utf8')).ledger : new Map();
}

/**
 * Applies `change` to the register at `path`, read just before and written
 * whole: the register is shared with other subjects (templates, layouts), so
 * nothing is kept in memory between the read and the write. A register with
 * lines that are not attestations (a merge gone wrong) is left alone: writing
 * it again would drop them.
 */
export function updateGoldenLedger(path: string, change: (ledger: Ledger) => Ledger): Ledger {
  const parsed = existsSync(path) ? parseLedger(readFileSync(path, 'utf8')) : { ledger: new Map(), rejected: [] };
  if (parsed.rejected.length > 0)
    throw new Error(`${path} a ${parsed.rejected.length} ligne(s) illisible(s) (ligne ${parsed.rejected[0]?.line}) : réparez-le avant d’approuver.`);
  const next = change(parsed.ledger);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, serialiseLedger(next));
  renameSync(temporary, path);
  return next;
}
