import { expect, test } from '@playwright/test';
import type { RunningReviewServer } from '../src/lib/review/server.ts';
import { startReviewServer } from '../src/lib/review/server.ts';
import { layoutDigest, STYLE_KEYS } from '../src/lib/digest.ts';

const styles = Object.fromEntries(STYLE_KEYS.map((key) => [key, '']));
const digest = layoutDigest([
  {
    path: 'card',
    rect: { x: 0, y: 0, width: 247, height: 320 },
    styles,
    scroll: { width: 247, height: 320, clientWidth: 247, clientHeight: 320 },
    zOrder: 0,
  },
]);

let running: RunningReviewServer;
const decisions: { readonly shape: string; readonly note?: string }[] = [];

test.beforeAll(async () => {
  running = await startReviewServer({
    port: 0,
    items: [
      {
        subject: 'visual:component:demo:DesignSystem#base',
        reason: 'never attested',
        digest,
        metadata: {
          viewport: { width: 375, height: 900 },
          screenshot: { width: 247, height: 320 },
          colorScheme: 'light',
          browser: { name: 'chromium', version: 'test' },
          target: '.design-system-host',
        },
      },
      {
        subject: 'visual:component:demo:DesignSystem#scheme=dark',
        reason: 'never attested',
        digest,
        rejectionReason: 'The previous dark-mode text lacked contrast.',
        metadata: {
          viewport: { width: 375, height: 900 },
          screenshot: { width: 247, height: 320 },
          colorScheme: 'dark',
          browser: { name: 'chromium', version: 'test' },
          target: '.design-system-host',
        },
      },
    ],
    onDecision: ({ shape, note }) =>
      void decisions.push({ shape, ...(note ? { note } : {}) }),
  });
});

test.afterAll(async () => {
  await running.close();
});

test('reviews independent scenarios and updates after persistence', async ({
  page,
}) => {
  await page.goto(running.url);

  await expect(
    page.getByRole('heading', { name: 'Visual review' }),
  ).toBeVisible();
  await expect(page.getByText('Loading review…')).toHaveCount(0);
  await expect(page.getByText('2 scenarios · 2 decisions')).toBeVisible();
  await expect(page.getByRole('button', { name: /^base / })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^scheme=dark / }),
  ).toBeVisible();
  const activeCard = page.locator('article:not([hidden])');
  await expect(activeCard.getByText('Viewport 375×900')).toBeVisible();
  await expect(activeCard.getByText('Capture 247×320')).toBeVisible();

  await page.getByRole('button', { name: /Accept A/ }).click();

  await expect(page.getByText('1 scenario · 1 decision')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'scheme=dark' }),
  ).toBeVisible();
  await expect(
    page.getByText('The previous dark-mode text lacked contrast.'),
  ).toBeVisible();
  expect(decisions).toHaveLength(1);

  await page
    .getByRole('combobox', { name: 'Evidence zoom' })
    .selectOption('actual');
  await expect(page.locator('.evidence-canvas')).toHaveClass(/zoom-actual/);

  await page.keyboard.press('r');
  await expect(
    page.getByText('Explain why this rendering should be rejected.'),
  ).toBeVisible();
  await expect(page.getByLabel('Decision note')).toBeFocused();
  await expect(page.getByText('1 scenario · 1 decision')).toBeVisible();

  await page
    .getByLabel('Decision note')
    .fill('Dark mode text does not have enough contrast.');
  await page.getByRole('button', { name: /Reject R/ }).click();
  await expect(page.getByText('1 scenario · 1 decision')).toBeVisible();
  await expect(page.locator('.review-card')).toBeVisible();
  expect(decisions).toHaveLength(2);
  expect(decisions[1]?.note).toBe(
    'Dark mode text does not have enough contrast.',
  );
});
