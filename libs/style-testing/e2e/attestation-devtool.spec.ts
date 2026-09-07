import { expect, test } from '@playwright/test';
import {
  buildRemovalReviewCard,
  buildTemplateReviewCard,
  type ReviewDecisionRequest,
  type TemplateEvidence,
} from '../../dev-tools/src/attestation-review.ts';
import { startReviewServer } from '../src/lib/review/server.ts';

const oldEvidence: TemplateEvidence = {
  direction: 'command',
  element: 'button',
  elementName: 'Save',
  target: 'method:user.save',
  targetKind: 'method',
};

const currentEvidence: TemplateEvidence = {
  ...oldEvidence,
  target: 'property:profile.update',
  targetKind: 'property',
};

const previousDecision = {
  verdict: 'ok' as const,
  by: 'romain',
  at: '2026-09-07T09:00:00.000Z',
  note: 'Intentional.',
};

test('navigates the four attestation views and presents a template diff', async ({
  page,
}) => {
  const template = buildTemplateReviewCard({
    subject: 'template:component:profile.ts:UserCard#command:profile.update',
    state: 'review',
    reason: 'the output changed',
    currentEvidenceHash: 'proof-2',
    component: 'component:profile.ts:UserCard',
    statement: 'button "Save" calls profile.update',
    currentEvidence,
    previousEvidence: oldEvidence,
    hadPreviousAttestation: true,
    currentLeaves: { 'property:profile.update': '2' },
    previousLeaves: { 'method:user.save': '1' },
    previousDecision,
  });
  const running = await startReviewServer({
    port: 0,
    cards: [template],
    model: {
      visualAssets: [
        { evidence: 'asset-proof', image: 'image-proof', scenarios: ['base'] },
      ],
      visualTests: [
        {
          subject: 'visual:UserCard#base',
          component: 'UserCard',
          scenario: 'base',
          state: 'current',
          evidence: 'asset-proof',
        },
      ],
      templateObligations: [
        {
          subject: template.subject,
          component: template.component,
          direction: 'command',
          statement: template.statement,
          state: 'review',
          evidence: currentEvidence,
        },
      ],
      diagnostics: [
        { code: 'template-obligation-unresolved', message: 'Dynamic target.' },
      ],
    },
  });

  try {
    await page.goto(running.url);
    await expect(
      page.getByRole('heading', { name: 'Attestations' }),
    ).toBeVisible();
    const reviewCard = page.getByRole('article');
    await expect(
      reviewCard.getByText('button "Save" calls profile.update'),
    ).toBeVisible();
    await expect(
      reviewCard
        .locator('.template-diff')
        .getByText(/method:user\.save → property:profile\.update/),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Visual assets' }).click();
    await expect(page.getByText('asset-proof')).toBeVisible();

    await page.getByRole('button', { name: 'Visual tests' }).click();
    await expect(page.locator('.inventory-panel:not([hidden])')).toContainText(
      'UserCard',
    );

    await page.getByRole('button', { name: 'Template obligations' }).click();
    await expect(page.getByText('Dynamic target.')).toBeVisible();

    await page.getByRole('button', { name: 'Review queue' }).click();
    await expect(
      page.locator('.review-card:not([hidden]) .template-diff'),
    ).toContainText('property:profile.update');
  } finally {
    await running.close();
  }
});

test('retires a removed promise with a reason and comment', async ({
  page,
}) => {
  const decisions: ReviewDecisionRequest[] = [];
  const removal = buildRemovalReviewCard({
    subject: 'template:component:profile.ts:UserCard#command:user.save',
    component: 'component:profile.ts:UserCard',
    evidenceHash: 'proof-1',
    previousEvidence: oldEvidence,
    previousDecision,
  });
  const running = await startReviewServer({
    port: 0,
    cards: [removal],
    onDecision: (decision) => {
      decisions.push(decision as ReviewDecisionRequest);
    },
  });

  try {
    await page.goto(running.url);
    await page.locator('#review-note').fill('Saving is automatic now.');
    await page.locator('#retirement-reason').selectOption('superseded');
    await page.getByRole('button', { name: 'Retire' }).click();

    await expect(page.getByText('Review complete')).toBeVisible();
    expect(decisions).toEqual([
      expect.objectContaining({
        id: removal.id,
        revision: removal.revision,
        verdict: 'retire',
        retirementReason: 'superseded',
        note: 'Saving is automatic now.',
      }),
    ]);
  } finally {
    await running.close();
  }
});
