import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  clipOf,
  collectCapture,
  determinismScript,
  metadataFromScope,
  replayFidelity,
  snapshotPage,
  visualAppHappyPaths,
  visualReport,
  type VisualReportCapture,
} from '@craft-ts/style-testing';
import { startReviewServer } from '@craft-ts/style-testing/review';
import {
  REVIEW_APP_COMPONENT,
  reviewAppHappyPathModel,
  reviewAppTemplateCard,
  reviewAttestConfig,
} from '../src/review-app.happy-path.ts';

const REQUESTED_REPORT = process.env['CRAFT_REVIEW_APP_REPORT'];
const VIEWPORT = { width: 1440, height: 1000 };

const reportPathFor = (testInfo: TestInfo): string =>
  REQUESTED_REPORT
    ? resolve(REQUESTED_REPORT)
    : testInfo.outputPath('review-app.json');

const artifactPathFor = (
  testInfo: TestInfo,
  reportPath: string,
  artifactName: string,
): string =>
  REQUESTED_REPORT
    ? join(dirname(reportPath), artifactName)
    : testInfo.outputPath(artifactName);

const captureScenario = async (
  page: Page,
  testInfo: TestInfo,
  reportPath: string,
  scenario: string,
  assumptions: Record<string, string>,
  browser: { readonly name: string; readonly version: string },
): Promise<VisualReportCapture> => {
  // A Playwright click leaves the pointer over the selected tab. Hover is an
  // interaction state, not part of these deterministic application scenarios.
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Let Angular's rendered state and the browser's computed styles converge
    // before the digest and the portable snapshot observe the page.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    document.documentElement.getBoundingClientRect();
  });

  const root = page.locator('.app-shell');
  await expect(root).toBeVisible();
  const { digest, scope } = await collectCapture(page, {
    root: '.app-shell',
    intrinsic: ['.app-shell'],
  });
  const clip = clipOf(scope.region);
  const stem = `review-app-${scenario.replace(/[^a-z0-9]+/gi, '-')}`;
  const imageName = `${stem}.png`;
  const snapshotName = `${stem}.snapshot.html`;

  await page.screenshot({
    path: artifactPathFor(testInfo, reportPath, imageName),
    clip,
    fullPage: true,
  });
  const snapshot = await snapshotPage(page, { root: '.app-shell' });
  await writeFile(
    artifactPathFor(testInfo, reportPath, snapshotName),
    snapshot.html,
    'utf8',
  );

  return {
    component: REVIEW_APP_COMPONENT,
    scenario,
    digest,
    image: basename(imageName),
    snapshot: snapshotName,
    ...(snapshot.risks.length > 0 ? { snapshotRisks: snapshot.risks } : {}),
    metadata: {
      ...metadataFromScope(scope),
      screenshot: { width: clip.width, height: clip.height },
      colorScheme: assumptions['theme'] === 'dark' ? 'dark' : 'light',
      browser,
      target: '.app-shell',
    },
    assumptions: [
      {
        fixture: 'review-app-self-attestation-v1',
        ...assumptions,
      },
    ],
  };
};

test('writes self-attestation evidence for the review application', async ({
  browser,
  page,
}, testInfo) => {
  await page.addInitScript(determinismScript());
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

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

  const reportPath = reportPathFor(testInfo);
  await mkdir(dirname(reportPath), { recursive: true });
  const captures: VisualReportCapture[] = [];
  const browserMetadata = {
    name: browser.browserType().name(),
    version: browser.version(),
  };

  try {
    const visualApp = reviewAttestConfig.visual?.app;
    if (!visualApp) throw new Error('review-attest config has no visual app.');
    for (const scenario of visualAppHappyPaths(visualApp)) {
      await page.setViewportSize(scenario.viewport);
      await page.goto(running.url + scenario.page.url);
      await expect(page.getByText('Loading review…')).toHaveCount(0);
      await expect(
        page.locator('.review-card:not([hidden]) .template-statement'),
      ).toBeVisible();
      captures.push(
        await captureScenario(
          page,
          testInfo,
          reportPath,
          scenario.id,
          {
            view: 'review-happy-path',
            viewport: scenario.viewportName,
            locale: 'en',
            theme: 'light',
          },
          browserMetadata,
        ),
      );
    }

    await page.setViewportSize(VIEWPORT);

    await page.locator('[data-craft-name="OpenRegenerationDialog"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    captures.push(
      await captureScenario(
        page,
        testInfo,
        reportPath,
        'regeneration-confirmation-light-en',
        { view: 'regeneration-confirmation', locale: 'en', theme: 'light' },
        browserMetadata,
      ),
    );
    await page.locator('[data-craft-name="CancelRegeneration"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.locator('[data-craft-name="ShowVisualTests"]').click();
    await expect(page.locator('.inventory-panel:not([hidden])')).toContainText(
      'ProfileCard',
    );
    await page.locator('[data-craft-name="SelectVisualTest"]').click();
    await expect(page.locator('.visual-detail')).toBeVisible();
    await expect(page.locator('.visual-detail')).toContainText('ProfileCard');
    const visualLayout = await page
      .locator('.visual-inventory-panel')
      .evaluate((panel) => {
        const list = panel.querySelector('.inventory-list');
        const detail = panel.querySelector('.visual-detail');
        const active = panel.querySelector('.inventory-list > li.active');
        if (!list || !detail || !active) {
          throw new Error('Visual inventory layout is incomplete');
        }

        const listRect = list.getBoundingClientRect();
        const detailRect = detail.getBoundingClientRect();
        return {
          detailIsOnRight: detailRect.left > listRect.right,
          activeBackground: getComputedStyle(active).backgroundColor,
        };
      });
    expect(visualLayout.detailIsOnRight).toBe(true);
    expect(visualLayout.activeBackground).not.toBe('rgba(0, 0, 0, 0)');
    captures.push(
      await captureScenario(
        page,
        testInfo,
        reportPath,
        'inventory-visual-light-en',
        { view: 'visual', locale: 'en', theme: 'light' },
        browserMetadata,
      ),
    );

    await page.locator('[data-craft-name="ShowTemplateObligations"]').click();
    await expect(
      page.getByText('One dynamic fixture target still needs a proof.'),
    ).toBeVisible();
    captures.push(
      await captureScenario(
        page,
        testInfo,
        reportPath,
        'inventory-template-light-en',
        { view: 'template', locale: 'en', theme: 'light' },
        browserMetadata,
      ),
    );

    await page.locator('#review-theme').selectOption('dark');
    await page.locator('#review-locale').selectOption('fr');
    await page.locator('[data-craft-name="ShowReviewQueue"]').click();
    await expect(
      page.getByRole('heading', { name: 'Attestations' }),
    ).toBeVisible();
    await expect(
      page.locator('.review-card:not([hidden]) .template-statement strong'),
    ).toHaveText(
      'button « Save » dans le template de ProfileCard appelle profile.commit.',
    );
    await expect(
      page.locator('.review-card:not([hidden]) .reason'),
    ).toHaveText('La preuve a changé depuis la dernière attestation acceptée.');
    captures.push(
      await captureScenario(
        page,
        testInfo,
        reportPath,
        'review-template-dark-fr',
        { view: 'review', locale: 'fr', theme: 'dark' },
        browserMetadata,
      ),
    );
  } finally {
    await running.close();
  }

  const auditor = await browser.newPage({ viewport: VIEWPORT });
  try {
    for (const capture of captures) {
      if (capture.metadata?.viewport) {
        await auditor.setViewportSize(capture.metadata.viewport);
      }
      const snapshotPath = artifactPathFor(
        testInfo,
        reportPath,
        capture.snapshot ?? '',
      );
      await auditor.goto(`file://${snapshotPath}`);
      const replayed = await collectCapture(auditor, { root: '.app-shell' });
      const fidelity = replayFidelity(replayed.digest, capture.digest);
      expect(
        fidelity.report.join('\n'),
        `replay of '${capture.scenario}'`,
      ).toBe('');
    }
  } finally {
    await auditor.close();
  }

  const report = visualReport(captures);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await testInfo.attach('review-app-self-attestation-report', {
    path: reportPath,
    contentType: 'application/json',
  });

  expect(report.captures.map((capture) => capture.scenario)).toEqual([
    'inventory-template-light-en',
    'inventory-visual-light-en',
    'regeneration-confirmation-light-en',
    'review-app--happy-path--desktop',
    'review-app--happy-path--mobile',
    'review-template-dark-fr',
  ]);
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
