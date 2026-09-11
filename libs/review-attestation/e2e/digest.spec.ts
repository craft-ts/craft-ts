import { expect, test, type Page } from '@playwright/test';
import {
  assertDeterministic,
  assertNoLayoutViolations,
  collectLayoutDigest,
  determinismScript,
  findViolations,
  measureDeterminism,
} from '../src/index.ts';
import { CARD_DE, CARD_EN, LOW_CONTRAST } from './fixtures.ts';

const digestOf = async (page: Page, html: string) => {
  await page.setContent(html);
  return await collectLayoutDigest(page, { root: 'body' });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(determinismScript());
});

test('a hundred renders of one scenario produce a hundred identical digests', async ({
  page,
}) => {
  // The gate for everything visual. Until this is one, the carry-forward reads
  // "the output changed" on renders nobody touched, and the bisection reports
  // transitions that do not exist.
  const report = await measureDeterminism(
    async () => JSON.stringify(await digestOf(page, CARD_EN)),
    100,
  );
  expect(report.distinct).toBe(1);
  expect(report.stable).toBe(true);

  await assertDeterministic(
    async () => JSON.stringify(await digestOf(page, CARD_EN)),
    20,
  );
});

test('the digest reads a real layout engine', async ({ page }) => {
  const digest = await digestOf(page, CARD_EN);
  const title = digest.nodes.find((node) => node.path.endsWith('@userCard/title'));

  expect(title).toBeDefined();
  expect(title?.box[2]).toBeGreaterThan(0);
  expect(title?.text?.content).toBe('Account settings');
  expect(digest.signature.lines[title?.path ?? '']).toBe(1);
});

test('the German title overflows, and the message names the node and the pixels', async ({
  page,
}) => {
  // The mandatory witness. `Benutzerkontoeinstellungen` does not fit the card,
  // the ellipsis makes that look deliberate, and only the number tells the two
  // apart — so this is a failure, not a review item.
  const digest = await digestOf(page, CARD_DE);
  const violations = findViolations(digest);
  const clipped = violations.find((violation) => violation.rule === 'text-clipped');

  expect(clipped).toBeDefined();
  expect(clipped?.path).toContain('userCard/title');
  expect(clipped?.amount).toBeGreaterThan(0);
  expect(clipped?.message).toMatch(/hides \d+px of "Benutzerkontoeinstellungen"/);

  expect(() => assertNoLayoutViolations(digest, { scenario: 'locale=de-DE' })).toThrow(
    /userCard\/title hides \d+px/,
  );
});

test('the same card in English raises nothing', async ({ page }) => {
  const digest = await digestOf(page, CARD_EN);
  expect(
    findViolations(digest).filter((violation) => violation.rule !== 'contrast'),
  ).toEqual([]);
});

test('grey on white is reported without anybody looking at it', async ({ page }) => {
  const digest = await digestOf(page, LOW_CONTRAST);
  const contrast = findViolations(digest).filter(
    (violation) => violation.rule === 'contrast',
  );
  expect(contrast).toHaveLength(1);
  expect(contrast[0]?.message).toMatch(/contrast of \d\.\d+:1/);
});
