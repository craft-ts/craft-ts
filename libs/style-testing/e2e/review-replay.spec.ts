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

  // The label names what will disappear, read back from the replay itself.
  // "Hide 1 overlay" asked the reviewer what an overlay is, and counted
  // covered nodes rather than the one thing sitting on them.
  const lift = page.getByRole('button', { name: /div\.pinned/ });
  await expect(lift).toHaveText('Hide div.pinned');
  await lift.click();
  await expect(lift).toHaveText('Show div.pinned');
  await expect(frame.locator('.pinned')).toBeHidden();

  // And it can be put back: lifting must not be a one-way trip, which it was
  // while the probe ran through its own `visibility: hidden`.
  await lift.click();
  await expect(lift).toHaveText('Hide div.pinned');
  await expect(frame.locator('.pinned')).toBeVisible();
});

test('the lift is not offered when nothing is covering the subject', async ({
  browser,
}) => {
  // The control used to mark every fixed element on the page, so it was there
  // on cards where it had nothing to do — and clicking it did nothing, which
  // is exactly what a broken control looks like.
  const clear = SNAPSHOT.replace(
    '.pinned { position: fixed; left: 300px; top: 120px;',
    '.pinned { position: fixed; left: 300px; top: 400px;',
  );
  const source = await browser.newPage();
  await source.setViewportSize({ width: 375, height: 200 });
  await source.setContent(clear);
  const digest = (await collectCapture(source, { root: '.host' })).digest;
  await source.close();

  const uncovered = await startReviewServer({
    port: 0,
    items: [
      {
        subject: 'visual:component:demo:Card#base',
        reason: 'the output changed',
        digest,
        approved,
        snapshot: 'a'.repeat(32),
        evidence: 'b'.repeat(32),
        metadata: {
          viewport: { width: 375, height: 200 },
          screenshot: { width: 375, height: 400 },
          target: '.host',
        },
      },
    ],
    snapshotFor: async () => clear,
    digestFor: async () => JSON.stringify(digest),
  });

  try {
    const page = await browser.newPage();
    await page.goto(uncovered.url);
    await expect(
      page.frameLocator('#craft-replay-frame').locator('.title'),
    ).toBeVisible();
    await expect(page.locator('.overlay-toggle:not([hidden])')).toHaveCount(0);
    await page.close();
  } finally {
    await uncovered.close();
  }
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

test('an unfaithful replay says what went wrong in one sentence', async ({
  browser,
}) => {
  // A snapshot whose subject is not in it at all — the shape of the failure a
  // stale capture produces. The old message answered it with "36 attested
  // node(s) are absent" and forty paths beginning `html/head/meta`: every
  // symptom of one cause, and none of them naming it.
  const stale = await startReviewServer({
    port: 0,
    items: [
      {
        subject: 'visual:component:demo:Card#base',
        reason: 'the output changed',
        digest: attested,
        approved,
        snapshot: 'c'.repeat(32),
        evidence: 'd'.repeat(32),
        metadata: {
          viewport: { width: 375, height: 200 },
          screenshot: { width: 375, height: 400 },
          target: '.host',
        },
      },
    ],
    snapshotFor: async () =>
      '<!doctype html><html><head></head><body><p>a different page</p></body></html>',
    digestFor: async () => JSON.stringify(attested),
  });

  try {
    const page = await browser.newPage();
    await page.goto(stale.url);

    const notice = page.locator('.notice.warning');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("no '.host' in it");
    // No wall of addresses, and no dump of the document's own structure.
    await expect(notice).not.toContainText('html/head');
    await expect(page.locator('.fidelity-detail')).toBeHidden();

    // The reviewer is put in front of the artefact that is still worth
    // judging, rather than left staring at a page the check has already
    // rejected — and told, in the same sentence, why they were moved.
    await expect(notice).toContainText('Showing the screenshot');
    await expect(page.locator('.replay-holder')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Screenshot' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Asking for the page anyway still works, and still says what it is.
    await page.getByRole('button', { name: 'Page', exact: true }).click();
    await expect(page.locator('.replay-holder')).toBeVisible();
    await expect(notice).toContainText('You asked for the page anyway');

    // And the verdict that follows is marked for what it is.
    await expect(page.locator('.notice.degraded')).toBeVisible();
    await page.close();
  } finally {
    await stale.close();
  }
});

test('the check measures the card on screen, not the first one', async ({
  browser,
}) => {
  // Every card in the queue renders a holder, and they all carried the same
  // id. `getElementById` returns the first match, so from card two onwards the
  // fidelity check measured card one's frame — which by then holds the blank
  // page — and reported the subject as missing from a document nobody meant to
  // look at. The check was right; its subject was wrong.
  // A different delta from the first card's, or the queue clusters the two
  // into one and there is no second card to move to.
  const second = SNAPSHOT.replace('Account settings', 'Billing').replace(
    '.body { position: absolute; left: 0; top: 60px; width: 375px; height: 60px; }',
    '.body { position: absolute; left: 0; top: 60px; width: 375px; height: 40px; }',
  );
  const source = await browser.newPage();
  await source.setViewportSize({ width: 375, height: 200 });
  await source.setContent(second);
  const secondDigest = (await collectCapture(source, { root: '.host' })).digest;
  await source.close();

  const two = await startReviewServer({
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
          target: '.host',
        },
      },
      {
        subject: 'visual:component:demo:Card#billing',
        reason: 'the output changed',
        digest: secondDigest,
        approved: attested,
        snapshot: 'e'.repeat(32),
        evidence: 'f'.repeat(32),
        metadata: {
          viewport: { width: 375, height: 200 },
          screenshot: { width: 375, height: 400 },
          target: '.host',
        },
      },
    ],
    snapshotFor: async (hash) =>
      hash === 'a'.repeat(32)
        ? SNAPSHOT
        : hash === 'e'.repeat(32)
          ? second
          : undefined,
    digestFor: async (hash) =>
      hash === 'b'.repeat(32)
        ? JSON.stringify(attested)
        : hash === 'f'.repeat(32)
          ? JSON.stringify(secondDigest)
          : undefined,
  });

  try {
    const page = await browser.newPage();
    await page.goto(two.url);
    await page.getByRole('button', { name: /Next/ }).click();

    // Exactly one frame answers to the id, and it is the one being reviewed.
    await expect(page.locator('#craft-replay-frame')).toHaveCount(1);
    await expect(
      page.frameLocator('#craft-replay-frame').locator('.title'),
    ).toHaveText('Billing');
    // Nothing to warn about: the card on screen replays faithfully.
    // Every card renders a panel, so the claim is that none of them is
    // showing a warning — not that a particular one is hidden.
    await expect(page.locator('.notice.warning:not([hidden])')).toHaveCount(0);
    await expect(page.locator('.notice.degraded:not([hidden])')).toHaveCount(0);
    await page.close();
  } finally {
    await two.close();
  }
});

test('fitting to the window fits the whole picture, not just its width', async ({
  browser,
}) => {
  // Every capture here is 375 or 768 wide and over 900 tall. Bounding only the
  // width fits a picture wider than the canvas and does nothing whatsoever to a
  // narrow one, so "fit to window" showed about two thirds of the render and
  // left the rest below the fold of a scroller nobody expected — the whole
  // picture on one scenario, part of it on the next, for a reason that had
  // nothing to do with what was being judged.
  const shot = await browser.newPage();
  await shot.setViewportSize({ width: 375, height: 400 });
  await shot.setContent(
    '<div style="width:375px;height:1200px;background:linear-gradient(#fff,#333)"></div>',
  );
  const image = await shot.screenshot({ fullPage: true });
  await shot.close();

  const tall = await startReviewServer({
    port: 0,
    items: [
      {
        subject: 'visual:component:demo:Card#base',
        reason: 'the output changed',
        digest: attested,
        approved,
        image: '1'.repeat(32),
        metadata: {
          viewport: { width: 375, height: 400 },
          screenshot: { width: 375, height: 1200 },
          visibleBand: { x: 0, y: 0, width: 375, height: 400 },
          target: '.host',
        },
      },
    ],
    imageFor: async () => image,
  });

  try {
    const page = await browser.newPage();
    await page.goto(tall.url);

    const canvas = page.locator('.evidence-canvas');
    const picture = page.locator('.image-holder img');
    await expect(picture).toBeVisible();

    const fitted = await picture.boundingBox();
    const frame = await canvas.boundingBox();
    if (!fitted || !frame) throw new Error('no box');
    expect(fitted.height).toBeLessThanOrEqual(frame.height);
    // Scaled, not cropped: the aspect ratio of the capture survives.
    expect(fitted.width / fitted.height).toBeCloseTo(375 / 1200, 2);

    // And the other mode still means something: actual size is actual size.
    await page.getByLabel('Evidence zoom').selectOption('actual');
    const actual = await picture.boundingBox();
    expect(actual?.height).toBeGreaterThan(frame.height);
    await page.close();
  } finally {
    await tall.close();
  }
});

test('a drag selects every node the box touches', async ({ page }) => {
  await page.goto(running.url);
  const frame = page.frameLocator('#craft-replay-frame');
  await expect(frame.locator('[data-craft-path]').first()).toBeVisible();

  // A box dragged over both rows of the component. One remark covering a whole
  // region is the common case; adding the nodes one at a time means retyping
  // the same sentence for each.
  await page.locator('#craft-replay-frame').scrollIntoViewIfNeeded();
  const box = await page.locator('#craft-replay-frame').boundingBox();
  if (!box) throw new Error('no frame box');
  await page.mouse.move(box.x + 8, box.y + 45);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 150, { steps: 8 });
  // Drawn beside the frame, never inside it: adding an element to the frozen
  // page would break the only claim it makes.
  await expect(page.locator('.selection-band')).toBeVisible();
  await expect(frame.locator('.selection-band')).toHaveCount(0);
  await page.mouse.up();

  await expect(page.locator('.selection-band')).toBeHidden();
  await expect(frame.locator('[data-craft-picked]')).toHaveCount(3);
  // The count is stated next to the field that is about to name the group.
  await expect(page.locator('.selection-tag')).toHaveText(
    '3 elements selected',
  );

  // Ctrl-click takes one back out without disturbing the rest.
  await frame.locator('.title').click({ modifiers: ['ControlOrMeta'] });
  await expect(frame.locator('[data-craft-picked]')).toHaveCount(2);
});

test('writing a reason does not file a verdict', async ({ page }) => {
  // The reason field is a `contenteditable`, and the hotkey guard only knew
  // about input, textarea and select. Typing "And the row is cut" pressed `a`
  // — Accept — and recorded a verdict the reviewer never reached.
  await page.goto(running.url);
  const reason = page.getByLabel('Decision note');
  await reason.click();
  await reason.pressSequentially('a card and a note, rejected nowhere');

  await expect(page.getByText('Review complete')).toBeHidden();
  expect(decisions).toHaveLength(0);
  await expect(reason).toContainText('a card and a note, rejected nowhere');
});

test('two complaints in one reason keep their own groups', async ({ page }) => {
  // The shape of a real rejection: this row is wrong, and further down that
  // other thing is wrong too. Filing them as one remark against every node
  // would record the second complaint against the first group's nodes.
  await page.goto(running.url);
  const frame = page.frameLocator('#craft-replay-frame');

  const reason = page.getByLabel('Decision note');
  await reason.fill('The title is cut at 34px in German. ');

  await frame.locator('.title').click();
  await expect(frame.locator('[data-craft-picked]')).toHaveCount(1);
  // Right-click on the selection, which is the gesture the menu exists for.
  await page.locator('#craft-replay-frame').scrollIntoViewIfNeeded();
  await frame.locator('.title').click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Add 1 node to the reason' })
    .click();

  // Referencing a group leaves the outline behind: it has been recorded.
  await expect(frame.locator('[data-craft-picked]')).toHaveCount(0);

  // The reference is an element in the reason, not the characters
  // `[#1: 1 node]` with the answer in a list somewhere else on the page: it
  // carries the addresses it stands for, and shows them on hover.
  const chip = page.locator('.mention-chip').first();
  await expect(chip).toHaveText('[#1: 1 node]');
  await expect(chip).toHaveAttribute('data-paths', /div/);
  await expect(chip).toHaveAttribute('contenteditable', 'false');

  await reason.press('End');
  await reason.pressSequentially('And the body overflows its box. ');
  await frame.locator('.body').click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Add 1 node to the reason' })
    .click();

  // Both references sit in the reason, each in its own sentence.
  await expect(page.locator('.mention-chip')).toHaveCount(2);

  await page.getByRole('button', { name: /Reject R/ }).click();
  await expect(page.getByText('Review complete')).toBeVisible();

  expect(decisions).toHaveLength(1);
  const decision = decisions[0] as {
    note: string;
    findings: { path: string; note: string }[];
  };
  // The reason is recorded as prose — the tokens were scaffolding for writing
  // it, not part of what is attested.
  expect(decision.note).not.toContain('[#');
  expect(decision.note).toContain('The title is cut at 34px in German.');
  // And each group carries the sentence it stands in, not the whole reason.
  expect(decision.findings).toHaveLength(2);
  expect(decision.findings[0]?.note).toBe(
    'The title is cut at 34px in German.',
  );
  expect(decision.findings[1]?.note).toBe('And the body overflows its box.');
  expect(decision.findings[0]?.path).not.toBe(decision.findings[1]?.path);
});
