import { captureVisualApp } from '@craft-ts/style-testing/visual-app/playwright';
import { contrastRatio } from '@craft-ts/dev-tools/contrast';
import { resolve } from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import {
  startReviewServer,
  buildReviewQueue,
} from '@craft-ts/style-testing/review';
import {
  reviewAppHappyPathModel,
  reviewAppTemplateCard,
  reviewAttestConfig,
} from '../src/review-app.happy-path.ts';

const REQUESTED_REPORT = process.env['CRAFT_REVIEW_APP_REPORT'];

const reportPathFor = (testInfo: TestInfo): string =>
  REQUESTED_REPORT
    ? resolve(REQUESTED_REPORT)
    : testInfo.outputPath('review-app.json');

test('writes self-attestation evidence for every scenario and viewport', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const running = await startReviewServer({
    port: 0,
    cards: [reviewAppTemplateCard],
    model: reviewAppHappyPathModel,
    previousDecisions: 1,
    regenerate: async () => ({
      cards: [reviewAppTemplateCard],
      model: reviewAppHappyPathModel,
      previousDecisions: 1,
    }),
  });
  try {
    const report = await captureVisualApp({
      browser,
      config: reviewAttestConfig.visual!.app!,
      baseURL: running.url,
      reportPath: reportPathFor(testInfo),
      rootDir: resolve('.'),
      tsconfigPath:
        'libs/review-attestation/attestation-app/tsconfig.graph.json',
    });
    expect(report.captures).toHaveLength(12);
    expect(report.captures.every((c) => c.evidenceMode === 'screenshot')).toBe(
      true,
    );
  } finally {
    await running.close();
  }
});

test('keeps decision hints readable when their action is disabled', async ({
  page,
}) => {
  const running = await startReviewServer({
    port: 0,
    cards: [reviewAppTemplateCard],
    model: reviewAppHappyPathModel,
  });

  try {
    await page.goto(running.url);
    await expect(
      page.locator('.review-card:not([hidden]) .template-statement'),
    ).toBeVisible();

    const acceptWithNote = page.locator(
      '[data-craft-name="AcceptWithNoteReviewCard"]',
    );
    await expect(acceptWithNote).toBeDisabled();

    for (const theme of ['light', 'dark'] as const) {
      await page.locator('#review-theme').selectOption(theme);
      await acceptWithNote.hover();

      const styles = await acceptWithNote.evaluate((element) => {
        const hint = getComputedStyle(element, '::after');
        return {
          buttonOpacity: getComputedStyle(element).opacity,
          hintBackground: hint.backgroundColor,
          hintColor: hint.color,
        };
      });

      expect(styles.buttonOpacity, `${theme} button opacity`).toBe('1');
      expect(styles.hintBackground, `${theme} hint background`).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      expect(styles.hintColor, `${theme} hint color`).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
    }
  } finally {
    await running.close();
  }
});

test('keeps primary decision labels and shortcut keys at WCAG AA contrast', async ({
  page,
}) => {
  const running = await startReviewServer({
    port: 0,
    cards: [reviewAppTemplateCard],
    model: reviewAppHappyPathModel,
  });

  try {
    await page.goto(running.url);
    const accept = page.locator('[data-craft-name="AcceptReviewCard"]');
    await expect(accept).toBeVisible();

    for (const theme of ['light', 'dark'] as const) {
      await page.locator('#review-theme').selectOption(theme);
      const contrast = await accept.evaluate((element) => {
        const button = element as HTMLElement;
        const key = button.querySelector('.key');
        if (!(key instanceof HTMLElement))
          throw new Error('Shortcut key missing');

        const buttonStyles = getComputedStyle(button);
        const keyStyles = getComputedStyle(key);
        return {
          label: {
            foreground: buttonStyles.color,
            background: buttonStyles.backgroundColor,
          },
          key: {
            foreground: keyStyles.color,
            background: buttonStyles.backgroundColor,
          },
        };
      });

      expect(
        contrastRatio(contrast.label.foreground, contrast.label.background),
        `${theme} primary label`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(contrast.key.foreground, contrast.key.background),
        `${theme} primary shortcut key`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  } finally {
    await running.close();
  }
});

test('persists the selected view and scenario in the URL', async ({
  page,
}, testInfo) => {
  const rejectedCard = {
    ...reviewAppTemplateCard,
    previousDecision: {
      verdict: 'rejected' as const,
      by: 'reviewer',
      at: '2026-09-08T10:00:00.000Z',
      note: 'The rejected scenario needs a source-level correction.',
    },
  };
  const secondCard = {
    ...reviewAppTemplateCard,
    shape: 'review-app-second-scenario',
    subject:
      'template:component:fixture.ts:SettingsCard#command:settings.commit',
  };
  const running = await startReviewServer({
    port: 0,
    cards: [rejectedCard, secondCard],
    model: reviewAppHappyPathModel,
    iteration: {
      rootDir: resolve('.'),
      reportPath: testInfo.outputPath('review-ui.json'),
      ledgerPath: testInfo.outputPath('attestations.jsonl'),
      evidenceDirectory: testInfo.outputPath('evidence'),
    },
  });

  try {
    await page.goto(`${running.url}?view=visual`);
    await page.locator('[data-craft-name="SelectVisualTest"]').click();
    await expect(page.locator('.visual-detail')).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(
        `scenario=${encodeURIComponent('visual:component:fixture.ts:ProfileCard#base')}`,
      ),
    );
    await page.locator('[data-craft-name="GenerateIterationHandoff"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(
      'Prepare the Codex iteration?',
    );
    await page.locator('[data-craft-name="ConfirmIterationHandoff"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#iteration-prompt')).toHaveValue(
      /# Codex iteration prompt/,
    );
    await expect(page.getByRole('dialog')).toContainText('1 rejected card');

    await page.goto(`${running.url}?view=template`);
    await expect(page.locator('.inventory-panel:not([hidden])')).toBeVisible();
    await expect(
      page.locator('[data-craft-name="ShowTemplateObligations"]'),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.locator('[data-craft-name="ShowReviewQueue"]').click();
    await page.locator('[data-craft-name="SelectReviewCard"]').nth(1).click();
    await expect(page).toHaveURL(/view=review/);
    await expect(page).toHaveURL(
      new RegExp(`scenario=${encodeURIComponent(secondCard.shape)}`),
    );
    await expect(
      page.locator('[data-craft-name="SelectReviewCard"]').nth(1),
    ).toHaveAttribute('aria-current', 'true');

    await page.reload();
    await expect(
      page.locator('[data-craft-name="ShowReviewQueue"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('[data-craft-name="SelectReviewCard"]').nth(1),
    ).toHaveAttribute('aria-current', 'true');
  } finally {
    await running.close();
  }
});

test('shows only the selected template review without visual evidence', async ({
  page,
}) => {
  const secondCard = {
    ...reviewAppTemplateCard,
    shape: 'review-app-second-scenario',
    subject:
      'template:component:fixture.ts:SettingsCard#command:settings.commit',
  };
  const running = await startReviewServer({
    port: 0,
    cards: [reviewAppTemplateCard, secondCard],
    model: reviewAppHappyPathModel,
  });

  try {
    await page.goto(running.url);
    await page.locator('[data-craft-name="SelectReviewCard"]').nth(1).click();

    await expect(
      page.locator('[data-craft-name="SelectReviewCard"]').nth(0),
    ).toHaveAttribute('aria-current', 'false');
    await expect(
      page.locator('[data-craft-name="SelectReviewCard"]').nth(1),
    ).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.review-card')).toHaveCount(1);
    await expect(page.locator('.review-card')).toContainText('settings.commit');
    await expect(
      page.locator('.review-card:not([hidden]) .evidence-canvas'),
    ).toHaveCount(0);
  } finally {
    await running.close();
  }
});

test('keeps accepted decisions in order and can reopen one', async ({
  page,
}) => {
  const secondCard = {
    ...reviewAppTemplateCard,
    shape: 'review-app-second-scenario',
    subject:
      'template:component:fixture.ts:SettingsCard#command:settings.commit',
  };
  const running = await startReviewServer({
    port: 0,
    cards: [reviewAppTemplateCard, secondCard],
    model: reviewAppHappyPathModel,
  });

  try {
    await page.goto(running.url);
    await page.locator('[data-craft-name="AcceptReviewCard"]').click();
    await expect(
      page.locator('[data-craft-name="ReopenReviewDecision"]'),
    ).toHaveCount(1);

    await page.locator('[data-craft-name="AcceptReviewCard"]').click();
    const history = page.locator('[data-craft-name="ReopenReviewDecision"]');
    await expect(history).toHaveCount(2);
    await expect(history.nth(0)).toContainText('profile.commit');
    await expect(history.nth(1)).toContainText('settings.commit');

    await history.nth(0).click();
    await expect(page.locator('.review-card')).toHaveCount(1);
    await expect(page.locator('.review-card')).toContainText('profile.commit');
    await expect(history).toHaveCount(1);
    await expect(history.nth(0)).toContainText('settings.commit');
  } finally {
    await running.close();
  }
});

test('explains queue and decision failures in the interface', async ({
  page,
}) => {
  const queueFailure = await startReviewServer({
    port: 0,
    cards: [reviewAppTemplateCard],
    model: reviewAppHappyPathModel,
    refreshCards: async () => {
      throw new Error('ledger is unavailable');
    },
  });

  try {
    await page.goto(queueFailure.url);
    const queueError = page.locator('[data-craft-name="ReviewQueueError"]');
    await expect(queueError).toBeVisible();
    await expect(queueError).toContainText('Review queue unavailable');
    await expect(queueError).toContainText('Reload the page to retry');
  } finally {
    await queueFailure.close();
  }

  const decisionFailure = await startReviewServer({
    port: 0,
    cards: [reviewAppTemplateCard],
    model: reviewAppHappyPathModel,
    onDecision: async () => {
      throw new Error('ledger is read-only');
    },
  });

  try {
    await page.goto(decisionFailure.url);
    await page.locator('[data-craft-name="AcceptReviewCard"]').click();
    const decisionError = page.locator(
      '[data-craft-name="ReviewDecisionError"]',
    );
    await expect(decisionError).toBeVisible();
    await expect(decisionError).toContainText('Decision not saved');
    await expect(decisionError).toContainText(
      'The scenario remains in the queue',
    );
    await expect(
      page.locator('[data-craft-name="AcceptReviewCard"]'),
    ).toBeVisible();
  } finally {
    await decisionFailure.close();
  }
});

test('reviews explicit visible application captures without changing global coverage', async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const { PNG } = await import('pngjs');
  const image = new PNG({ width: 60, height: 80 });
  image.data.fill(255);
  const hash = 'a'.repeat(32);
  const viewports = ['mobile', 'desktop', 'wide'];
  const subjects = viewports.map(
    (v) => `visual:component:fixture.ts:Page#app--page--list--initial--${v}`,
  );
  const queue = buildReviewQueue(
    subjects.map((subject) => ({
      subject,
      reason: 'never attested',
      evidenceMode: 'screenshot' as const,
      image: hash,
      evidence: hash,
      digest: {
        digestVersion: 1,
        nodes: [],
        signature: {
          columns: {},
          lines: {},
          wrapped: [],
          clipped: [],
          scrollbars: [],
          overlaps: [],
        },
      },
    })),
  );
  const entries = subjects.map((subject, index) => ({
    subject,
    page: 'Orders',
    scenario: 'list',
    label: 'Orders list',
    category: 'happy-path' as const,
    capture: 'initial',
    viewport: viewports[index]!,
    dimensions: { width: index ? 1440 : 390, height: 844 },
    state: 'missing' as const,
    image: hash,
  }));
  const running = await startReviewServer({
    port: 0,
    cards: queue.cards,
    imageFor: async () => PNG.sync.write(image),
    model: {
      ...reviewAppHappyPathModel,
      applicationCaptures: [
        ...entries,
        {
          ...entries[0]!,
          subject: 'visual:exception',
          category: 'exception',
          scenario: 'failure',
          image: undefined,
          error: 'Capture missing',
        },
      ],
    },
  });
  try {
    await page.goto(`${running.url}?view=application`);
    const progress = page.locator('.application-progress');
    await expect(progress).toContainText('0 / 4');
    await expect(page.locator('.application-capture')).toHaveCount(3);
    await expect(
      page.locator('.application-capture img').first(),
    ).toBeVisible();
    expect(
      await page
        .locator('.application-capture img')
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBe(60);
    await page
      .locator('[data-craft-name="SelectApplicationCapture"]')
      .first()
      .check();
    await page
      .locator('[data-craft-name="ApplicationViewport"]')
      .selectOption('desktop');
    await expect(
      page.locator('[data-craft-name="AcceptApplicationSelection"]'),
    ).toBeDisabled();
    await expect(progress).toContainText('0 / 4');
    await page
      .locator('[data-craft-name="ApplicationViewport"]')
      .selectOption('');
    await page
      .locator('[data-craft-name="SelectApplicationCapture"]')
      .nth(1)
      .check();
    await page
      .locator('[data-craft-name="AcceptApplicationSelection"]')
      .click();
    await expect(progress).toContainText('2 / 4');
    await expect(
      page.locator('[data-craft-name="SelectApplicationCapture"]').nth(2),
    ).toBeEnabled();
    await page
      .locator('[data-craft-name="ApplicationCategory"]')
      .selectOption('exception');
    await expect(page.locator('.application-capture')).toHaveCount(1);
    await expect(page.locator('.application-capture')).toContainText(
      'Capture missing',
    );
    await expect(progress).toContainText('2 / 4');
    expect(runtimeErrors).toEqual([]);
  } finally {
    await running.close();
  }
});
