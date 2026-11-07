import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runGoldenCheck, writeGoldenCheckReport, type GoldenBuild } from '@craft-ts/playwright-sessions/suite';
import { test, craftSession, expect } from './fixtures';
import { DISCONNECT_CONFIRM_BUTTON, RESTYLE_HEADINGS, harness, measurePage, recordPurchaseByHand } from './golden-helpers';

/**
 * The suite's check of a change: a recorded session replayed twice on the
 * base (what differs between the two runs is noise) and once on the head, then
 * compared. The base and the heads are the harness's app; a head's change is
 * installed in the replayed page, as a pull request would have changed the
 * code. Served one after the other, a real base would come from
 * `gitWorktreeServer` and the head from `commandServer`.
 */
test('compare la base et la tête d’un changement sur une session enregistrée', {
  annotation: craftSession({ id: 'shop.golden-check', capture: 'none' }),
}, async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(300_000);
  const { server, dashboard, app } = harness(baseURL);
  const sessionId = await test.step('un parcours fait à la main, archivé et terminé', () => recordPurchaseByHand(browser, app, server));
  const base: GoldenBuild = { name: 'base' };
  const changed = (name: string, script: string): GoldenBuild => ({ name, prepareContext: (context) => context.addInitScript(script) });
  const check = (head: GoldenBuild) => test.step(`base → ${head.name}`, async () => {
    const report = await runGoldenCheck({
      browser,
      dashboardUrl: dashboard,
      sessionIds: [sessionId],
      base,
      head,
      replay: { maxPoints: 8, measure: measurePage },
    });
    const directory = testInfo.outputPath(head.name.replace(/\W+/g, '-'));
    const written = writeGoldenCheckReport(directory, report);
    await testInfo.attach(`${head.name}.md`, { body: readFileSync(written.markdown), contentType: 'text/markdown' });
    return { report, directory };
  });

  const same = await check({ name: 'tête identique' });
  // Two runs of the same code: nothing outside the noise, so no false alarm.
  expect(same.report.sessions[0], JSON.stringify(same.report.sessions[0], null, 2)).toMatchObject({ verdict: 'unchanged' });
  expect(same.report.passed).toBe(true);

  const restyled = await check(changed('tête restylée', RESTYLE_HEADINGS));
  const restyledSession = restyled.report.sessions[0]!;
  expect(restyledSession.verdict, restyledSession.reason).toBe('changed');
  expect(restyled.report.passed).toBe(false);
  const changedMoments = restyledSession.moments.filter((moment) => moment.status === 'changed');
  expect(changedMoments.length).toBeGreaterThan(0);
  // The change is named in the measures (a heading's colour), and drawn.
  expect(changedMoments.flatMap((moment) => moment.measureChanges.map((change) => change.path)).some((path) => /h[12].*styles\.color/.test(path))).toBe(true);
  const markdown = readFileSync(join(restyled.directory, 'report.md'), 'utf8');
  expect(markdown).toMatch(/images\/.+-diff\.png/);

  const broken = await check(changed('tête bouton débranché', DISCONNECT_CONFIRM_BUTTON));
  expect(broken.report.sessions[0]).toMatchObject({
    verdict: 'regression',
    difference: { actual: { missing: expect.arrayContaining(['service:cart / mutation:syncServerCart / method:mutate']) } },
  });
});
