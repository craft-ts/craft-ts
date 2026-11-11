import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { approveGoldenChange, goldenSubject, isGoldenChangeApproved, readGoldenLedger, updateGoldenLedger } from './approval.js';
import { compareGoldenRuns } from './compare-runs.js';
import type { GoldenCapture, GoldenReplayResult } from './golden-replay.js';
import { goldenCheckReport, renderGoldenCheckReport } from './report.js';

function picture(black: readonly number[] = []): Buffer {
  const png = new PNG({ width: 20, height: 10 });
  png.data.fill(255);
  for (const pixel of black) png.data.fill(0, pixel * 4, pixel * 4 + 3);
  return PNG.sync.write(png);
}
const logo = (color: string) => [
  { path: 'html/body', box: [0, 0, 20, 10], styles: { color: 'black' } },
  { path: 'html/body/a.logo', box: [0, 0, 8, 2], styles: { color } },
];
const capture = (replayIndex: number, nodes: unknown[], png = picture()): GoldenCapture =>
  ({ replayIndex, reasons: ['checkpoint'], offsetMs: 0, png, digest: { digestVersion: 1, nodes } });
const run = (captures: GoldenCapture[], extra: Partial<GoldenReplayResult> = {}): GoldenReplayResult => ({
  sessionId: 'session-1', status: 'completed', unprovenInteractions: [], notes: [], replayIndex: 2, total: 2, captures,
  determinism: { seed: 1, reducedMotion: true, stillness: true, browser: 'test' }, ...extra,
});
const base = run([capture(0, logo('rgb(0, 0, 0)')), capture(2, logo('rgb(0, 0, 0)'))]);
/** The base against a head whose logo is `color` at every moment. */
const headWithLogo = (color: string, more: unknown[] = []) =>
  compareGoldenRuns({ base: [base, base], head: run([capture(0, [...logo(color), ...more]), capture(2, logo(color))]) });

describe('approving a change of the suite', () => {
  it('fingerprints the difference itself: the same one twice, another one otherwise', () => {
    const red = headWithLogo('rgb(255, 0, 0)');
    expect(red.change).toMatchObject({ moments: [0, 2] });
    expect(headWithLogo('rgb(255, 0, 0)').change!.fingerprint).toBe(red.change!.fingerprint);
    expect(headWithLogo('rgb(0, 128, 0)').change!.fingerprint).not.toBe(red.change!.fingerprint);
    // Every measured change counts, not only the listed ones.
    const bodyAt = (y: number) => [{ path: 'html/body', box: [0, y, 20, 10], styles: { color: 'black' } }, logo('rgb(255, 0, 0)')[1]!];
    const listedOnce = (y: number) =>
      compareGoldenRuns({ base: [base, base], head: run([capture(0, bodyAt(y)), capture(2, logo('rgb(0, 0, 0)'))]) }, { maxChanges: 1 });
    expect(listedOnce(1).moments[0]!.measureChanges).toEqual(listedOnce(2).moments[0]!.measureChanges);
    expect(listedOnce(1).change!.fingerprint).not.toBe(listedOnce(2).change!.fingerprint);
    expect(compareGoldenRuns({ base: [base, base], head: base }).change).toBeUndefined();
  });

  it('an approved difference passes the next check; a new one is reported again', () => {
    const red = headWithLogo('rgb(255, 0, 0)');
    expect(goldenCheckReport([red], { base: 'main', head: 'feature' })).toMatchObject({ passed: false, approved: 0 });

    const ledger = approveGoldenChange(new Map(), 'shop', red, { by: 'Romain', builds: { base: 'main', head: 'feature' } });
    expect(ledger.get(goldenSubject('shop', 'session-1'))).toMatchObject({ kind: 'golden-session', verdict: 'ok', by: 'Romain', note: 'moment(s) 0, 2 · main → feature' });

    const isApproved = (session: Parameters<typeof isGoldenChangeApproved>[2]) => isGoldenChangeApproved(ledger, 'shop', session);
    const again = goldenCheckReport([headWithLogo('rgb(255, 0, 0)')], { base: 'main', head: 'feature' }, { app: 'shop', isApproved });
    expect(again).toMatchObject({ passed: true, approved: 1, app: 'shop', counts: { changed: 1 }, sessions: [{ approved: true }] });
    expect(renderGoldenCheckReport(again)).toContain('✅ changement approuvé : 1');

    // The logo changes once more: not what was approved.
    const green = goldenCheckReport([headWithLogo('rgb(0, 128, 0)')], { base: 'main', head: 'feature' }, { isApproved });
    expect(green).toMatchObject({ passed: false, approved: 0 });
    expect(renderGoldenCheckReport(green)).toContain('--approve session-');
    // Another app's session of the same id is not approved by it.
    expect(isGoldenChangeApproved(ledger, 'other', red)).toBe(false);
  });

  it('never approves a regression, nor a session without a change', () => {
    const regression = compareGoldenRuns({ base: [base, base], head: run([], { status: 'diverged', replayIndex: 1 }) });
    expect(() => approveGoldenChange(new Map(), 'shop', regression, { by: 'Romain' })).toThrow(/régression/);
    // An attestation of that subject left from an earlier change does not cover it.
    const ledger = approveGoldenChange(new Map(), 'shop', headWithLogo('rgb(255, 0, 0)'), { by: 'Romain' });
    expect(goldenCheckReport([regression], { base: 'main', head: 'feature' }, { isApproved: () => true })).toMatchObject({ passed: false, approved: 0 });
    expect(isGoldenChangeApproved(ledger, 'shop', regression)).toBe(false);
    const unchanged = compareGoldenRuns({ base: [base, base], head: base });
    expect(() => approveGoldenChange(new Map(), 'shop', unchanged, { by: 'Romain' })).toThrow(/pas de changement/);
  });

  it('writes the register whole, keeping the other subjects, and leaves a broken one alone', () => {
    const directory = mkdtempSync(join(tmpdir(), 'golden-ledger-'));
    try {
      const path = join(directory, '.craft', 'attestations.jsonl');
      const other = { subject: 'template:a', kind: 'template', fingerprint: 'f', evidence: 'e', verdict: 'ok', assumptions: [], by: 'x', at: '2026-01-01', toolVersion: '1' };
      writeFileSync(join(directory, 'seed'), '');
      updateGoldenLedger(path, (ledger) => new Map([...ledger, ['template:a', other as never]]));
      updateGoldenLedger(path, (ledger) => approveGoldenChange(ledger, 'shop', headWithLogo('rgb(255, 0, 0)'), { by: 'Romain', at: '2026-11-09T00:00:00.000Z' }));
      const lines = readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line).subject);
      expect(lines).toEqual(['golden:shop:session-1', 'template:a']);
      expect(readGoldenLedger(path).size).toBe(2);

      writeFileSync(path, `${readFileSync(path, 'utf8')}<<<<<<< HEAD\n`);
      expect(() => updateGoldenLedger(path, (ledger) => ledger)).toThrow(/illisible/);
      expect(readFileSync(path, 'utf8')).toContain('<<<<<<<');
      expect(existsSync(`${path}.${process.pid}.tmp`)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
