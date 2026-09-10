import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import {
  applyScenario,
  clipOf,
  collectCapture,
  determinismScript,
  metadataFromScope,
  replayFidelity,
  snapshotPage,
  visualReport,
} from '@craft-ts/style-testing';
import { reviewAttestConfig } from '../review-attest.config.ts';

const DESIGN_SYSTEM_COMPONENT =
  'component:apps/demo/src/app/examples/design-system/design-system-demo.ts:designSystemDemo';
const REQUESTED_REPORT = process.env['CRAFT_VISUAL_REPORT'];

const reportPathFor = (testInfo: TestInfo): string =>
  REQUESTED_REPORT
    ? resolve(REQUESTED_REPORT)
    : testInfo.outputPath('visual-report.json');

const imagePathFor = (
  testInfo: TestInfo,
  reportPath: string,
  imageName: string,
): string =>
  REQUESTED_REPORT
    ? join(dirname(reportPath), imageName)
    : testInfo.outputPath(imageName);

test('writes CLI-ready visual evidence from a real demo route', async ({
  browser,
  page,
}, testInfo) => {
  await page.addInitScript(determinismScript());

  const reportPath = reportPathFor(testInfo);
  await mkdir(dirname(reportPath), { recursive: true });

  const captures = [];
  const matrix = reviewAttestConfig.visual?.matrices[0];
  if (!matrix || Array.isArray(matrix)) {
    throw new Error(
      'review-attest.config.ts must declare the design-system matrix.',
    );
  }
  for (const scenario of matrix.scenarios) {
    // Reset the implicit base cell before every scenario. Desktop Chrome is
    // wider than `md`, so relying on its default would make `base` and
    // `viewport=md` two names for the same render — false coverage.
    await page.setViewportSize({ width: 375, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/design-system');
    await applyScenario(page, scenario, {
      target: '.design-system-host',
      height: 900,
    });

    const root = page.locator('.design-system-host');
    await expect(root).toBeVisible();
    const { digest, scope } = await collectCapture(page, {
      root: '.design-system-host',
      intrinsic: ['.design-system-host'],
    });
    expect(digest.nodes.length).toBeGreaterThan(10);

    const imageName = `design-system-${scenario.id.replace(/[^a-z0-9]+/gi, '-')}.png`;
    const imagePath = imagePathFor(testInfo, reportPath, imageName);

    // The region, not the element. An element screenshot starts inside the
    // shell's padding and slices whatever overlaps its edge — the fixed
    // "Clear cache" button, here — so the reviewer compares a picture that
    // never existed against a page that does.
    const clip = clipOf(scope.region);
    await page.screenshot({ path: imagePath, clip, fullPage: true });

    // The frozen document, beside the picture. It is what lets a reviewer
    // point at a node instead of at pixels, and it is checkable — see below.
    const snapshot = await snapshotPage(page, { root: '.design-system-host' });
    const snapshotName = imageName.replace(/\.png$/, '.snapshot.html');
    await writeFile(
      imagePathFor(testInfo, reportPath, snapshotName),
      snapshot.html,
      'utf8',
    );

    captures.push({
      snapshot: snapshotName,
      ...(snapshot.risks.length > 0 ? { snapshotRisks: snapshot.risks } : {}),
      component: DESIGN_SYSTEM_COMPONENT,
      scenario: scenario.id,
      digest,
      image: basename(imagePath),
      metadata: {
        ...metadataFromScope(scope),
        screenshot: { width: clip.width, height: clip.height },
        colorScheme: scenario.id.includes('scheme=dark') ? 'dark' : 'light',
        browser: {
          name: browser.browserType().name(),
          version: browser.version(),
        },
        target: '.design-system-host',
      },
    });
  }

  // Fidelity, verified rather than assumed: the frozen document is replayed in
  // a window that disagrees with the capture on both axes, re-measured, and
  // compared with the digest the ledger will hold. A replay that measures
  // differently is a replay a reviewer would judge instead of the real thing.
  const auditor = await browser.newPage();
  for (const capture of captures) {
    // The captured width, not the reviewer's. A snapshot freezes the styles,
    // not the box the page lays itself out in: this route is fluid, so
    // replaying it at 1280 gives a 1152px component instead of a 247px one.
    // The colour scheme *is* flipped, because that one must be frozen — it is
    // a media query, and re-evaluating it is what would silently turn a dark
    // scenario light.
    await auditor.setViewportSize(capture.metadata.viewport);
    await auditor.emulateMedia({
      colorScheme: capture.metadata.colorScheme === 'dark' ? 'light' : 'dark',
    });
    await auditor.setContent(
      await readFile(
        imagePathFor(testInfo, reportPath, capture.snapshot as string),
        'utf8',
      ),
    );
    const replayed = await collectCapture(auditor, {
      root: '.design-system-host',
    });
    const fidelity = replayFidelity(replayed.digest, capture.digest);
    expect(fidelity.report.join('\n'), `replay of '${capture.scenario}'`).toBe(
      '',
    );
  }
  await auditor.close();

  const report = visualReport(captures);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await testInfo.attach('visual-report', {
    path: reportPath,
    contentType: 'application/json',
  });

  expect(report.captures.map((capture) => capture.scenario)).toEqual([
    'base',
    'scheme=dark',
    'scheme=dark+viewport=md',
    'viewport=md',
  ]);
});
