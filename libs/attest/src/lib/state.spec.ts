import { describe, expect, it } from 'vitest';
import type { Attestation, SubjectObservation } from './attestation.js';
import {
  originOf,
  parseLedger,
  serialiseLedger,
  type Ledger,
} from './ledger.js';
import { applyRenewals, carryForward, reportOn, statusOf } from './state.js';

const judged: Attestation = {
  subject: 'visual:Card#viewport=md',
  kind: 'visual',
  fingerprint: 'code-1',
  evidence: 'evidence-1',
  verdict: 'ok',
  assumptions: [],
  by: 'romain',
  at: '2026-09-01T10:00:00.000Z',
  toolVersion: '0.8.3',
};

const observation = (
  overrides: Partial<SubjectObservation> = {},
): SubjectObservation => ({
  subject: judged.subject,
  kind: 'visual',
  fingerprint: 'code-1',
  evidence: 'evidence-1',
  assumptions: [],
  ...overrides,
});

const ledgerOf = (...attestations: Attestation[]): Ledger =>
  new Map(attestations.map((attestation) => [attestation.subject, attestation]));

describe('statusOf', () => {
  it('is missing when nothing was ever attested', () => {
    const status = statusOf(new Map(), observation());
    expect(status.state).toBe('missing');
  });

  it('is current when the fingerprint has not moved', () => {
    const status = statusOf(ledgerOf(judged), observation());
    expect(status.state).toBe('current');
    expect(status.carried).toBeUndefined();
  });

  it('does not look at the evidence when the code has not moved', () => {
    // A flaky render must not queue a subject nothing touched.
    const status = statusOf(
      ledgerOf(judged),
      observation({ evidence: 'flaked' }),
    );
    expect(status.state).toBe('current');
  });

  it('carries the judgement forward when only the code moved', () => {
    const status = statusOf(
      ledgerOf(judged),
      observation({ fingerprint: 'code-2' }),
    );
    expect(status.state).toBe('renewed');
    expect(status.carried).toMatchObject({
      fingerprint: 'code-2',
      carriedFrom: 'code-1',
      by: 'romain',
      at: '2026-09-01T10:00:00.000Z',
      verdict: 'ok',
    });
  });

  it('keeps the chain pointing at the original judgement across carries', () => {
    const once = carryForward(judged, observation({ fingerprint: 'code-2' }));
    const twice = carryForward(once, observation({ fingerprint: 'code-3' }));
    expect(twice.carriedFrom).toBe('code-1');
    expect(originOf(twice)).toBe('code-1');
    // The human, the date and the verdict are the point of the record and are
    // never refreshed by a carry.
    expect(twice.by).toBe('romain');
    expect(twice.at).toBe('2026-09-01T10:00:00.000Z');
  });

  it('queues a review when the output changed', () => {
    const status = statusOf(
      ledgerOf(judged),
      observation({ fingerprint: 'code-2', evidence: 'evidence-2' }),
    );
    expect(status.state).toBe('review');
    expect(status.reason).toBe('the output changed');
  });

  it('queues a review when the reductions changed, even on identical evidence', () => {
    const sampled: Attestation = {
      ...judged,
      assumptions: [
        { kind: 'sampling', axis: 'title', samples: 8, transitions: [34] },
      ],
    };
    const status = statusOf(
      ledgerOf(sampled),
      observation({
        fingerprint: 'code-2',
        assumptions: [
          { kind: 'sampling', axis: 'title', samples: 4, transitions: [34] },
        ],
      }),
    );
    expect(status.state).toBe('review');
    expect(status.reason).toContain('reductions');
  });

  it('queues a review while the last verdict was a rejection', () => {
    const status = statusOf(
      ledgerOf({ ...judged, verdict: 'rejected' }),
      observation(),
    );
    expect(status.state).toBe('review');
  });
});

describe('reportOn', () => {
  it('counts states and names orphaned subjects', () => {
    const ledger = ledgerOf(judged, {
      ...judged,
      subject: 'visual:Gone#base',
    });
    const report = reportOn(ledger, [observation({ fingerprint: 'code-2' })]);

    expect(report.counts).toEqual({
      current: 0,
      renewed: 1,
      review: 0,
      missing: 0,
    });
    expect(report.orphaned).toEqual(['visual:Gone#base']);
  });

  it('leaves the ledger untouched until renewals are applied', () => {
    const ledger = ledgerOf(judged);
    const report = reportOn(ledger, [observation({ fingerprint: 'code-2' })]);
    expect(ledger.get(judged.subject)?.fingerprint).toBe('code-1');

    const applied = applyRenewals(ledger, report);
    expect(applied.get(judged.subject)?.fingerprint).toBe('code-2');
    expect(applied.get(judged.subject)?.carriedFrom).toBe('code-1');
  });

  it('counts attestations that came out of a bulk renewal', () => {
    const report = reportOn(ledgerOf({ ...judged, bulk: true }), [
      observation(),
    ]);
    expect(report.bulk).toBe(1);
  });
});

describe('ledger format', () => {
  it('round-trips and stays sorted by subject', () => {
    const ledger = ledgerOf(
      { ...judged, subject: 'visual:Z#base' },
      { ...judged, subject: 'visual:A#base' },
    );
    const text = serialiseLedger(ledger);
    expect(text.split('\n').filter(Boolean).map((line) => JSON.parse(line).subject))
      .toEqual(['visual:A#base', 'visual:Z#base']);
    expect(parseLedger(text).ledger.size).toBe(2);
  });

  it('reports a broken line instead of losing the whole file', () => {
    const text = `${serialiseLedger(ledgerOf(judged))}{ not json\n`;
    const parsed = parseLedger(text);
    expect(parsed.ledger.size).toBe(1);
    expect(parsed.rejected).toEqual([{ line: 2, reason: 'not JSON' }]);
  });
});
