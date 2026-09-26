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
    await page.goto(`${running.url}?view=template`);
    const source = page
      .locator(
        '[data-testid="inventory-panel"]:not([hidden]) [data-testid="source-link"]',
      )
      .first();
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
    await expect(source).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=cursor&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts',
    );
    await page.goto(`${running.url}?view=template`);
    await expect(
      page.locator(
        '[data-testid="inventory-panel"]:not([hidden]) [data-testid="source-link"]',
      ),
    ).toHaveCount(2);
    await expect(
      page.locator('[data-testid="diagnostics"] [data-testid="source-link"]'),
    ).toHaveAttribute(
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

test('opens the source for a render obligation from the template view', async ({
  page,
}) => {
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
    iteration: { rootDir: resolve('.') },
  });

  try {
    await page.goto(`${running.url}?view=template`);
    const source = page
      .locator(
        '[data-testid="inventory-panel"]:not([hidden]) [data-testid="source-link"]',
      )
      .first();
    await expect(source).toHaveAttribute(
      'href',
      '/api/open-in-ide?ide=vscode&file=apps%2Fdemo%2Fsrc%2Fapp%2Fapp.ts',
    );
  } finally {
    await running.close();
  }
});
