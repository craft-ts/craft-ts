import { expect, test } from '@playwright/test';
import {
  startReviewServer,
  type RunningReviewServer,
} from '../src/lib/review/server.ts';
import { collectCapture, type LayoutDigest } from '../src/lib/digest.ts';

/**
 * The review surface, driving a frozen page for real.
 *
 * Everything below happens through the application: the snapshot is served,
 * measured in the browser that shows it, marked, clicked, and turned into a
 * remark aimed at one node. Nothing here stubs the part under test.
 */
/**
 * A frozen page whose measurements the digest below matches exactly.
 *
 * Fixed pixel sizes, because the point of the fixture is that the replay and
 * the evidence agree — not that a layout engine reproduces a fluid design.
 */
const SNAPSHOT = `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 375px; font: 14px/1 system-ui, sans-serif; }
  .decor { height: 40px; background: #eee; }
  .host { position: absolute; left: 0; top: 40px; width: 375px; height: 120px; }
  .title { position: absolute; left: 0; top: 0; width: 375px; height: 60px; }
  .body { position: absolute; left: 0; top: 60px; width: 375px; height: 60px; }
  .pinned { position: fixed; left: 300px; top: 120px; width: 75px; height: 40px; background: #333; }
</style></head><body>
  <div class="decor">nav</div>
  <div class="host" data-craft-attested>
    <div class="title">Account settings</div>
    <div class="body">Manage your profile</div>
  </div>
  <div class="pinned">chrome</div>
</body></html>`;

// Serial, and the deciding test comes last on purpose: the four share one
// queue, and a decision removes the card the others need. Making that explicit
// beats a per-test server, which would pay for a Vite boot four times over.
test.describe.configure({ mode: 'serial' });

let running: RunningReviewServer;
let attested: LayoutDigest;
let approved: LayoutDigest;
const decisions: unknown[] = [];

test.beforeAll(async ({ browser }) => {
  decisions.length = 0;
  // The evidence is measured from the very page the review will replay, in a
  // real engine. A hand-written digest would differ from it in every computed
  // style and the fidelity check would be testing the fixture, not the code.
  const source = await browser.newPage();
  await source.setViewportSize({ width: 375, height: 200 });
  await source.setContent(SNAPSHOT);
  attested = (await collectCapture(source, { root: '.host' })).digest;

  // A genuine delta, so the card carries a readable change and a real shape.
  // The approved side is the same page with a different title height.
  await source.setContent(SNAPSHOT.replace('height: 60px', 'height: 48px'));
  approved = (await collectCapture(source, { root: '.host' })).digest;
  await source.close();

  running = await startReviewServer({
    port: 0,
    items: [
      {
        subject: 'visual:component:demo:Card#base',
        reason: 'the output changed',
        digest: attested,
        approved,
        snapshot: 'a'.repeat(32),
        evidence: 'b'.repeat(32),
        metadata: {
          viewport: { width: 375, height: 200 },
          screenshot: { width: 375, height: 400 },
          origin: { x: 0, y: 0 },
          visibleBand: { x: 0, y: 0, width: 375, height: 200 },
          coverage: { attested: 3, offScreen: 1, occluded: 1 },
          occluded: [{ path: 'div/div[1]', by: 'div.pinned' }],
          target: '.host',
        },
      },
    ],
    snapshotFor: async (hash) =>
      hash === 'a'.repeat(32) ? SNAPSHOT : undefined,
    digestFor: async (hash) =>
      hash === 'b'.repeat(32) ? JSON.stringify(attested) : undefined,
    onDecision: (decision) => void decisions.push(decision),
  });
});

test.afterAll(async () => {
  await running.close();
});

test('replays the frozen page, checks it, and marks the three tiers', async ({
  page,
}) => {
  await page.goto(running.url);
  const frame = page.frameLocator('#craft-replay-frame');

  // Attested nodes carry the address the digest gave them — computed from the
  // replayed tree, not mapped from coordinates.
  await expect(frame.locator('.title')).toHaveAttribute(
    'data-craft-path',
    /div/,
  );
  await expect(frame.locator('.title')).toHaveAttribute(
    'data-craft-tier',
    /changed|attested/,
  );
  // Decor is outside the subject: dimmed, never addressed.
  await expect(frame.locator('.decor')).not.toHaveAttribute(
    'data-craft-path',
    /./,
  );
  // The page's own chrome that sits over the subject is marked so it can be
  // lifted — the one thing a screenshot can never do.
  await expect(frame.locator('.pinned')).toHaveAttribute(
    'data-craft-chrome',
    '',
  );

  // The replay measures like the evidence, so no warning and no degraded mark
  // once the check has run.
  await expect(page.locator('.notice.warning')).toBeHidden();
  await expect(page.locator('.notice.degraded')).toBeHidden();

  // What the verdict covers against what anybody could look at.
  await expect(
    page.getByText('3 attested · 1 on screen · 1 covered'),
  ).toBeVisible();
});

test('lifting the page chrome reveals what it covered', async ({ page }) => {
  await page.goto(running.url);
  const frame = page.frameLocator('#craft-replay-frame');
  await expect(frame.locator('.pinned')).toBeVisible();

  await page.getByRole('button', { name: 'Lift page chrome' }).click();
  await expect(frame.locator('.pinned')).toBeHidden();
});

test('switching to the screenshot marks the decision as degraded', async ({
  page,
}) => {
  await page.goto(running.url);
  // Until the replay has been checked, a decision *would* be degraded; the
  // mark clears once it is verified.
  await expect(page.locator('.notice.degraded')).toBeHidden();

  await page.getByRole('button', { name: 'Screenshot' }).click();
  // A verdict reached on a picture is a different claim from one reached on
  // the document, and the ledger has to be able to tell them apart.
  await expect(page.locator('.notice.degraded')).toBeVisible();
  await expect(page.locator('.image-holder .fold')).toBeVisible();
});

test('a click becomes a remark aimed at one node', async ({ page }) => {
  await page.goto(running.url);
  const frame = page.frameLocator('#craft-replay-frame');

  await frame.locator('.title').click();
  await expect(frame.locator('[data-craft-picked]')).toHaveCount(1);

  await page.getByLabel('Decision note').fill('cut at 34px in German');
  await page
    .getByRole('button', { name: 'Add remark on the selected node' })
    .click();

  const finding = page.locator('.findings-list li').first();
  await expect(finding).toContainText('cut at 34px in German');
  await expect(finding.locator('.code')).toContainText('div');

  await page.getByLabel('Decision note').fill('the title does not fit');
  await page.getByRole('button', { name: /Reject R/ }).click();

  await expect(page.getByText('Review complete')).toBeVisible();
  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toMatchObject({
    verdict: 'rejected',
    note: 'the title does not fit',
    findings: [{ note: 'cut at 34px in German' }],
  });
});
