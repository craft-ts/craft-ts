import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import {
  applyScenario,
  collectLayoutDigest,
  determinismScript,
  visualMatrix,
  visualReport,
} from '@craft-ts/style-testing';
import { dsTheme } from '../src/app/examples/design-system/foundation.style.ts';

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
  page,
}, testInfo) => {
  await page.addInitScript(determinismScript());

  const reportPath = reportPathFor(testInfo);
  await mkdir(dirname(reportPath), { recursive: true });

  const captures = [];
  for (const scenario of visualMatrix(dsTheme)) {
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
    const digest = await collectLayoutDigest(page, {
      root: '.design-system-host',
      intrinsic: ['.design-system-host'],
    });
    expect(digest.nodes.length).toBeGreaterThan(10);

    const imageName = `design-system-${scenario.id.replace(/[^a-z0-9]+/gi, '-')}.png`;
    const imagePath = imagePathFor(testInfo, reportPath, imageName);
    await root.screenshot({ path: imagePath });
    captures.push({
      component: DESIGN_SYSTEM_COMPONENT,
      scenario: scenario.id,
      digest,
      image: basename(imagePath),
    });
  }

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
