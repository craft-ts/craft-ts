import { describe, expect, it } from 'vitest';
import {
  buildRemovalReviewCard,
  buildTemplateReviewCard,
  clusterTemplateReviewCards,
  codeLeavesDiff,
  reviewRevision,
  templateEvidenceDiff,
  validateReviewDecision,
  type TemplateEvidence,
} from './attestation-review.js';

const previous: TemplateEvidence = {
  direction: 'command',
  element: 'button',
  elementName: 'Save',
  target: 'method:user.save',
  targetKind: 'method',
};

const current: TemplateEvidence = {
  ...previous,
  target: 'property:profile.update',
  targetKind: 'property',
};

const card = (subject: string, before: TemplateEvidence | null = previous) =>
  buildTemplateReviewCard({
    subject,
    state: 'review',
    reason: 'the output changed',
    currentEvidenceHash: 'proof-2',
    component: subject.split(':').at(-1) ?? subject,
    statement: 'button Save calls profile.update',
    currentEvidence: current,
    ...(before ? { previousEvidence: before } : {}),
    hadPreviousAttestation: before !== undefined,
    currentLeaves: { 'property:profile.update': '2' },
    previousLeaves: { 'method:user.save': '1' },
  });

describe('attestation review core', () => {
  it('explains semantic proof and code-leaf changes', () => {
    expect(templateEvidenceDiff(previous, current)).toEqual([
      {
        field: 'target',
        before: 'method:user.save',
        after: 'property:profile.update',
      },
      { field: 'targetKind', before: 'method', after: 'property' },
    ]);
    expect(
      codeLeavesDiff(
        { 'method:user.save': '1', stable: 'same', changed: '1' },
        { 'property:profile.update': '2', stable: 'same', changed: '2' },
      ),
    ).toMatchObject({
      added: [{ leaf: 'property:profile.update' }],
      removed: [{ leaf: 'method:user.save' }],
      changed: [{ leaf: 'changed', before: '1', after: '2' }],
    });
  });

  it('groups identical before/after changes and retains every subject', () => {
    const clustered = clusterTemplateReviewCards([
      card('template:UserCard'),
      card('template:AdminCard'),
    ]);

    expect(clustered).toHaveLength(1);
    expect(clustered[0]?.cluster).toEqual([
      'template:AdminCard',
      'template:UserCard',
    ]);
    expect(clustered[0]?.reviewMembers).toHaveLength(2);
  });

  it('never groups new subjects without a previous proof', () => {
    expect(
      clusterTemplateReviewCards([
        card('template:UserCard', null),
        card('template:AdminCard', null),
      ]),
    ).toHaveLength(2);
  });

  it('makes revisions stable and sensitive to subject evidence and state', () => {
    const value = { subject: 'template:a', evidence: 'one', state: 'review' };
    expect(reviewRevision(value)).toBe(reviewRevision(value));
    expect(reviewRevision(value)).not.toBe(
      reviewRevision({ ...value, evidence: 'two' }),
    );
  });

  it('requires comments for rejection and retirement and rejects stale cards', () => {
    const template = card('template:UserCard');
    expect(
      validateReviewDecision(template, {
        id: template.id,
        revision: template.revision,
        verdict: 'rejected',
      }),
    ).toContain('comment');
    expect(
      validateReviewDecision(template, {
        id: template.id,
        revision: 'stale',
        verdict: 'ok',
      }),
    ).toContain('changed');

    const removal = buildRemovalReviewCard({
      subject: 'template:old',
      component: 'OldCard',
      evidenceHash: 'proof-1',
      previousEvidence: previous,
      previousDecision: {
        verdict: 'ok',
        by: 'romain',
        at: '2026-09-07T10:00:00.000Z',
      },
    });
    expect(
      validateReviewDecision(removal, {
        id: removal.id,
        revision: removal.revision,
        verdict: 'retire',
        retirementReason: 'superseded',
        note: '',
      }),
    ).toContain('comment');
  });
});
