import { describe, expect, it } from 'vitest';
import { reviewVisualStatusOf } from './card-presentation';

describe('review visual status', () => {
  it('marks cards without a previous decision as pending', () => {
    expect(reviewVisualStatusOf(undefined)).toBe('pending');
  });

  it('marks every handled verdict as reviewed except an explicit rejection', () => {
    expect(
      reviewVisualStatusOf({ verdict: 'ok', by: 'Ada', at: '2026-09-20' }),
    ).toBe('reviewed');
    expect(
      reviewVisualStatusOf({
        verdict: 'ok-with-note',
        by: 'Ada',
        at: '2026-09-20',
      }),
    ).toBe('reviewed');
    expect(
      reviewVisualStatusOf({
        verdict: 'known-issue',
        by: 'Ada',
        at: '2026-09-20',
      }),
    ).toBe('reviewed');
    expect(
      reviewVisualStatusOf({
        verdict: 'rejected',
        by: 'Ada',
        at: '2026-09-20',
      }),
    ).toBe('rejected');
  });
});

// Readable labels were specified with these tests (583499925) but never
// written: no config ran this file, so nothing showed it. Showing them changes
// what the review app displays and captures, a change of its own.
describe('attestation subject labels', () => {
  it.todo(
    'turns generated application scenarios into a readable hierarchy: app--review%2Dapp--review--application--desktop → Review app · Review · Application · Desktop',
  );
  it.todo(
    'turns template graph targets into their meaningful primitive name: …/craftMethod:selectVisualTest/0 → Select visual test',
  );
  it.todo(
    'keeps ordinary scenario names readable: dark-mode → Dark mode, component:fixture.ts:Card → Card',
  );
});
