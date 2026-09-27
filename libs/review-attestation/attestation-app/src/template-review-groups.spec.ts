import { describe, expect, it } from 'vitest';
import {
  buildTemplateReviewCard,
  type TemplateCondition,
} from '@craft-ts/dev-tools/attestation-review';
import {
  groupTemplateReviewCards,
  templateReviewGroupKey,
} from './template-review-groups';

const makeCard = (
  subject: string,
  conditions: readonly TemplateCondition[] = [],
) =>
  buildTemplateReviewCard({
    subject,
    state: 'review',
    reason: 'the template promise changed',
    currentEvidenceHash: `evidence:${subject}`,
    component: 'ProfileCard',
    statement: `${subject} renders profile content`,
    statementParts: {
      direction: 'render',
      component: 'ProfileCard',
      target: subject,
    },
    conditions,
    currentEvidence: {
      direction: 'render',
      element: null,
      elementName: null,
      target: subject,
      targetKind: 'component',
    },
    hadPreviousAttestation: false,
    currentLeaves: { [subject]: '1' },
  });

describe('template review groups', () => {
  it('groups by component, direction, and structural context', () => {
    const cards = [
      makeCard('profile.header'),
      makeCard('profile.body'),
      makeCard('profile.footer', [
        { kind: 'if', name: 'isCompact', expectation: 'true' },
      ]),
    ];

    const groups = groupTemplateReviewCards(cards);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.cards).toHaveLength(2);
    expect(groups[1]?.cards).toHaveLength(1);
  });

  it('normalises condition ordering into a stable key', () => {
    const first = makeCard('a', [
      { kind: 'if', name: 'a', expectation: 'true' },
      { kind: 'for', name: 'b', expectation: 'non-empty' },
    ]);
    const second = makeCard('b', [
      { kind: 'for', name: 'b', expectation: 'non-empty' },
      { kind: 'if', name: 'a', expectation: 'true' },
    ]);

    expect(templateReviewGroupKey(first)).toBe(templateReviewGroupKey(second));
  });
});
