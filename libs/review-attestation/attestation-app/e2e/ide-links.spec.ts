import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { startReviewServer } from '@craft-ts/style-testing/review';
import {
  reviewAppHappyPathModel,
  reviewAppTemplateCard,
} from '../src/review-app.happy-path.ts';

test('opens a review subject in the selected editor and remembers the choice', async ({
  page,
}, testInfo) => {
  const rootDir = resolve('.');
  const subject =
    'template:component:apps/demo/src/app/app.ts:App#command:primitive:apps/demo/src/app/app.ts';
  const running = await startReviewServer({
    port: 0,
    cards: [{ ...reviewAppTemplateCard, subject }],
    model: {
      ...reviewAppHappyPathModel,
      templateObligations: reviewAppHappyPathModel.templateObligations.map(
        (obligation) => ({ ...obligation, subject }),
      ),
      diagnostics: [
        {
          code: 'source-check',
          message: 'Inspect this source location.',
          filePath: 'apps/demo/src/app/app.ts',
          line: 42,
        },
      ],
    },
    iteration: {
      rootDir,
      ledgerPath: testInfo.outputPath('attestations.jsonl'),
      evidenceDirectory: testInfo.outputPath('evidence'),
    },
  });

  try {
    await page.goto(`${running.url}?view=review`);
    const source = page.locator('.review-heading .source-link');
    await expect(source).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=vscode&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts',
    );
    await page.locator('#review-ide').selectOption('cursor');
    await expect(source).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=cursor&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts',
    );
    const redirect = await page.request.get(
      new URL(
        (await source.getAttribute('href')) ?? '',
        running.url,
      ).toString(),
      { maxRedirects: 0 },
    );
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()['location']).toBe(
      `cursor://file/${rootDir}/apps/demo/src/app/app.ts`,
    );
    const opened = page.waitForRequest((request) =>
      request.url().includes('/api/open-in-ide?ide=cursor'),
    );
    await source.click();
    await opened;
    await page.reload();
    await expect(page.locator('#review-ide')).toHaveValue('cursor');
    await expect(page.locator('.review-heading .source-link')).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=cursor&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts',
    );
    await page.goto(`${running.url}?view=template`);
    await expect(
      page.locator('.inventory-panel:not([hidden]) .source-link'),
    ).toHaveCount(2);
    await expect(page.locator('.diagnostics .source-link')).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=cursor&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts&line=42',
    );
    const invalid = await page.request.get(
      new URL(
        '/api/open-in-ide?ide=cursor&file=..%2Fprivate.ts',
        running.url,
      ).toString(),
      { maxRedirects: 0 },
    );
    expect(invalid.status()).toBe(400);
  } finally {
    await running.close();
  }
});

test('shows render code and opens the exact template line', async ({ page }, testInfo) => {
  const subject =
    'template:component:apps/demo/src/app/app.ts:App#render:primitive:apps/demo/src/app/app.ts';
  const running = await startReviewServer({
    port: 0,
    cards: [{ ...reviewAppTemplateCard, subject }],
    model: {
      ...reviewAppHappyPathModel,
      templateObligations: reviewAppHappyPathModel.templateObligations.map(
        (obligation) => ({ ...obligation, subject }),
      ),
    },
    templateDetailFor: () => ({
      subject,
      renderSites: [
        {
          file: 'apps/demo/src/app/app.ts',
          line: 225,
          code: "button('navToggle', {\n  'aria-expanded': navOpen,\n}, navOpen.navToggleLabel)",
        },
        {
          file: 'apps/demo/src/app/app.ts',
          line: 230,
          code: 'ifNode(navOpen, () => div(...))',
        },
      ],
    }),
    iteration: {
      rootDir: resolve('.'),
      ledgerPath: testInfo.outputPath('attestations.jsonl'),
      evidenceDirectory: testInfo.outputPath('evidence'),
    },
  });

  try {
    await page.goto(`${running.url}?view=review`);
    await expect(page.locator('.review-heading .subject')).toContainText(
      'app.ts:App:225',
    );
    await expect(page.locator('.review-heading .source-link')).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=vscode&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts&line=225',
    );
    await expect(page.locator('.template-source-site')).toHaveCount(2);
    await expect(page.locator('.template-source-site').first()).toContainText(
      "'aria-expanded': navOpen",
    );
    await expect(page.locator('.template-source-site').nth(1)).toContainText(
      'ifNode(navOpen',
    );
    await expect(page.locator('.template-source-site').nth(1).locator('a')).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=vscode&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts&line=230',
    );
  } finally {
    await running.close();
  }
});
