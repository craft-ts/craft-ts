import { expect, test } from '@playwright/test';
import {
  startReviewServer,
  type ReviewDecisionRequest,
  type AttestationReviewCard,
} from '@craft-ts/style-testing/review';
import { buildTemplateReviewCard } from '@craft-ts/dev-tools/attestation-review';

const makeCard = (
  name: string,
  policy: 'human-required' | 'agent-allowed' = 'agent-allowed',
) =>
  buildTemplateReviewCard({
    subject: `template:Profile#render:${name}`,
    component: 'Profile',
    state: 'missing',
    reason: 'New promise',
    statement: `Profile displays ${name}.`,
    statementParts: { direction: 'render', component: 'Profile', target: name },
    currentEvidenceHash: name,
    contextHash: 'context-1',
    validationPolicy: policy,
    conditions: [{ kind: 'if', name: 'loaded', expectation: 'true' }],
    currentEvidence: {
      direction: 'render',
      element: null,
      elementName: null,
      target: name,
      targetKind: 'state',
    },
    hadPreviousAttestation: false,
    currentLeaves: {},
  });

test('agent review persists authorized decisions and leaves human obligations for the reviewer', async ({
  page,
}) => {
  const allowed = makeCard('Name');
  const human = makeCard('Permissions', 'human-required');
  const uncertain = makeCard('Address');
  let cards: readonly AttestationReviewCard[] = [allowed, human, uncertain];
  let saved: readonly ReviewDecisionRequest[] = [];
  const running = await startReviewServer({
    port: 0,
    cards,
    refreshCards: async () => cards,
    templateAgent: {
      name: 'Review agent',
      run: async (selected) =>
        selected.map((card) => ({
          id: card.id,
          outcome: card.id === uncertain.id ? 'needs-human' : 'accepted',
          rationale:
            card.id === uncertain.id
              ? 'Address is not specified.'
              : 'The requirement explicitly covers this promise.',
          references: ['requirements.md'],
        })),
    },
    onDecisions: async (decisions) => {
      saved = decisions;
      cards = cards.map((card) => {
        const decision = decisions.find((item) => item.id === card.id);
        return decision
          ? {
              ...card,
              state: 'current',
              previousDecision: {
                verdict: 'ok-with-note',
                by: decision.agentReview!.name,
                at: '2026-09-22',
                note: decision.note,
                agentReview: decision.agentReview,
              },
            }
          : card;
      });
      return cards;
    },
  });
  try {
    await page.goto(running.url);
    await page.locator('#review-locale').selectOption('fr');
    await expect(page.locator('.template-group-header')).toContainText(
      'Le composant affiche',
    );
    await expect(
      page.locator('.template-obligation-copy > strong').first(),
    ).toHaveText('Address');
    await page.locator('[data-craft-name="SelectTemplateGroup"]').check();
    await expect(
      page.locator('[data-craft-name="DelegateTemplateGroup"]'),
    ).toBeEnabled({ timeout: 3000 });
    await page.locator('[data-craft-name="DelegateTemplateGroup"]').click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]?.id).toBe(allowed.id);
    expect(saved[0]?.agentReview?.name).toBe('Review agent');
    await expect(
      page.locator('.template-agent-result:not([hidden])'),
    ).toContainText([
      'Agent : à examiner par un humain',
      'Agent : conforme au contexte',
    ]);
    await page
      .locator('[data-craft-name="SelectHumanTemplateObligations"]')
      .click();
    await expect(
      page.locator('[data-craft-name="SelectTemplateObligation"]:checked'),
    ).toHaveCount(2);
    await page.screenshot({
      path: test.info().outputPath('template-agent-review.png'),
      fullPage: true,
    });
  } finally {
    await running.close();
  }
});

test('keeps common context and actions stationary while obligations scroll, including narrow layouts', async ({
  page,
}) => {
  const cards = Array.from({ length: 35 }, (_, i) =>
    makeCard(`Field ${String(i).padStart(2, '0')}`),
  );
  const running = await startReviewServer({ port: 0, cards });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(running.url);
    const header = page.locator('.template-group-header');
    await expect(header).toBeVisible();
    const before = await header.boundingBox();
    await page.locator('.template-obligation-list').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect((await header.boundingBox())?.y).toBe(before?.y);
    await expect(
      page.locator('[data-craft-name="AcceptTemplateGroup"]'),
    ).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath('template-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath('template-mobile.png'),
      fullPage: true,
    });
  } finally {
    await running.close();
  }
});

test('refuses stale in-flight results, malformed batches and forged agent authorship', async ({
  request,
}) => {
  let current = makeCard('Name');
  let writes = 0;
  const running = await startReviewServer({
    port: 0,
    cards: [current],
    refreshCards: async () => [current],
    templateAgent: {
      name: 'Reviewer',
      run: async (cards) => {
        current = { ...current, revision: 'changed', contextHash: 'context-2' };
        return cards.map((card) => ({
          id: card.id,
          outcome: 'accepted',
          rationale: 'Matches requirements.',
          references: ['requirements.md'],
        }));
      },
    },
    onDecisions: async () => {
      writes++;
    },
  });
  try {
    const card = current;
    const result = await request.post(`${running.url}/api/template-agent`, {
      data: { cards: [{ id: card.id, revision: card.revision }] },
    });
    expect(result.status()).toBe(400);
    expect(writes).toBe(0);
    const forged = await request.post(`${running.url}/api/decisions`, {
      data: {
        shape: current.shape,
        id: current.id,
        revision: current.revision,
        verdict: 'ok',
        agentReview: {
          kind: 'agent',
          name: 'fake',
          contextHash: 'context-2',
          references: ['requirements.md'],
        },
      },
    });
    expect(forged.status()).toBe(400);
    const duplicate = await request.post(`${running.url}/api/template-agent`, {
      data: { cards: [current, current] },
    });
    expect(duplicate.status()).toBe(400);
    expect(writes).toBe(0);
  } finally {
    await running.close();
  }
});
