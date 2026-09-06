import { describe, expect, it } from 'vitest';
import { unknownFindings, type Attestation } from './attestation.js';
import { parseLedger, serialiseAttestation, serialiseLedger } from './ledger.js';

const rejected: Attestation = {
  subject: 'visual:userCard#viewport=md',
  kind: 'visual',
  fingerprint: 'code-1',
  evidence: 'evidence-1',
  verdict: 'rejected',
  assumptions: [],
  by: 'romain',
  at: '2026-09-06T09:00:00.000Z',
  toolVersion: '0.8.3',
  note: 'the German string does not fit',
  findings: [{ path: 'userCard/title', note: 'cut at 34px' }],
  degraded: true,
};

describe('unknownFindings', () => {
  it('accepts a finding that names a node of the subject', () => {
    expect(
      unknownFindings(rejected.findings ?? [], ['userCard', 'userCard/title']),
    ).toEqual([]);
  });

  it('catches a finding filed against a neighbour', () => {
    // A reviewer looking at a whole page points at the navigation. The mistake
    // has to be refusable, not storable.
    const stray = unknownFindings(
      [{ path: 'demo-nav/toggle', note: 'misaligned' }],
      ['userCard', 'userCard/title'],
    );
    expect(stray).toEqual([{ path: 'demo-nav/toggle', note: 'misaligned' }]);
  });
});

describe('the ledger keeps what the reviewer pointed at', () => {
  it('writes findings and the degraded mark', () => {
    const line = JSON.parse(serialiseAttestation(rejected));
    expect(line.findings).toEqual([
      { path: 'userCard/title', note: 'cut at 34px' },
    ]);
    expect(line.degraded).toBe(true);
  });

  it('round-trips them', () => {
    const ledger = new Map([[rejected.subject, rejected]]);
    const back = parseLedger(serialiseLedger(ledger)).ledger.get(
      rejected.subject,
    );
    expect(back?.findings).toEqual(rejected.findings);
    expect(back?.degraded).toBe(true);
  });

  it('drops a field nobody added to the key order', () => {
    // The failure mode this test exists for: an unlisted field survives being
    // read and disappears at the next rewrite, silently losing a remark.
    const line = JSON.parse(
      serialiseAttestation({
        ...rejected,
        somethingNew: 'lost',
      } as unknown as Attestation),
    );
    expect(line.somethingNew).toBeUndefined();
    expect(line.findings).toBeDefined();
  });
});
