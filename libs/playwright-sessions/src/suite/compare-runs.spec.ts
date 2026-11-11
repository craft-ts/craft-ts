import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { compareGoldenRuns, flattenMeasure } from './compare-runs.js';
import type { GoldenCapture, GoldenReplayResult } from './golden-replay.js';
import { goldenCheckReport, renderGoldenCheckReport, writeGoldenCheckReport } from './report.js';

/** A 20×10 white picture with the given pixels painted black. */
function picture(black: readonly number[] = [], width = 20): Buffer {
  const png = new PNG({ width, height: 10 });
  png.data.fill(255);
  for (const pixel of black) png.data.fill(0, pixel * 4, pixel * 4 + 3);
  return PNG.sync.write(png);
}
const node = (path: string, box: number[], color = 'black') => ({ path, box, styles: { color } });
const capture = (replayIndex: number, png: Buffer, nodes: unknown[]): GoldenCapture =>
  ({ replayIndex, reasons: ['checkpoint'], offsetMs: replayIndex * 100, png, digest: { digestVersion: 1, nodes } });
const run = (captures: GoldenCapture[], extra: Partial<GoldenReplayResult> = {}): GoldenReplayResult => ({
  sessionId: 's1', status: 'completed', unprovenInteractions: [], notes: [], replayIndex: 4, total: 4, captures,
  determinism: { seed: 1, reducedMotion: true, stillness: true, browser: 'test' }, ...extra,
});
const page = [node('html/body', [0, 0, 20, 10]), node('html/body/h1', [0, 0, 20, 4])];

describe('compareGoldenRuns', () => {
  it('finds nothing when the head renders what the base rendered', () => {
    const base = run([capture(0, picture(), page), capture(4, picture([5]), page)]);
    const result = compareGoldenRuns({ base: [base, base], head: base });
    expect(result).toMatchObject({ verdict: 'unchanged', moments: [{ status: 'same' }, { status: 'same' }] });
  });

  it('leaves out what differs between the two base runs, and reports the rest', () => {
    // A clock in the corner (pixel 0) differs on every run; the head also moves the title.
    const base = run([capture(4, picture([0]), [...page, node('html/body/time', [0, 9, 4, 1], '12:00')])]);
    const baseAgain = run([capture(4, picture(), [...page, node('html/body/time', [0, 9, 4, 1], '12:01')])]);
    const head = run([capture(4, picture([0, 50, 51]), [node('html/body', [0, 0, 20, 10]), node('html/body/h1', [0, 2, 20, 4]), node('html/body/time', [0, 9, 4, 1], '12:02')])]);
    const result = compareGoldenRuns({ base: [base, baseAgain], head });
    expect(result.verdict).toBe('changed');
    const [moment] = result.moments;
    expect(moment).toMatchObject({ status: 'changed', noisyMeasures: 1, measureChanges: [{ path: 'nodes[html/body/h1].box[1]', base: '0', head: '2' }] });
    expect(moment!.pixelRatio).toBeCloseTo(2 / 200);
    expect(moment!.noisyPixelRatio).toBeCloseTo(1 / 200);
    // The picture a person reads: only the two changed pixels, not the clock.
    const diff = PNG.sync.read(moment!.diffPng!);
    expect([0, 50, 51].map((pixel) => diff.data[pixel * 4 + 3]! > 0)).toEqual([false, true, true]);
  });

  it('keys measured nodes by their path: a node added first does not shift the others', () => {
    const before = flattenMeasure({ nodes: [node('a', [0]), node('b', [1])] });
    const after = flattenMeasure({ nodes: [node('new', [9]), node('a', [0]), node('b', [1])] });
    expect([...after.keys()].filter((path) => before.get(path) !== after.get(path))).toEqual(['nodes[new]', 'nodes[new].path', 'nodes[new].box[0]', 'nodes[new].styles.color']);
  });

  it('reports a node added in the head as one change, not one per field', () => {
    const base = run([capture(0, picture(), page)]);
    const head = run([capture(0, picture(), [...page, node('html/body/aside', [0, 0, 5, 5])])]);
    expect(compareGoldenRuns({ base: [base, base], head }).moments[0]!.measureChanges).toEqual([
      { path: 'nodes[html/body/aside]', base: undefined, head: '(présent)' },
    ]);
  });

  it('calls a picture of another size a change', () => {
    const base = run([capture(4, picture(), page)]);
    const head = run([capture(4, picture([], 30), page)]);
    expect(compareGoldenRuns({ base: [base, base], head }).moments[0]).toMatchObject({ status: 'changed', sizeChanged: true });
  });

  it('calls a head that stops on a gap a regression, with the gap', () => {
    const base = run([capture(0, picture(), page)]);
    const difference = { eventId: 'click', expected: { calls: ['cart.add'] }, actual: { calls: [], missing: ['cart.add'] } };
    const head = run([], { status: 'diverged', replayIndex: 2, difference });
    expect(compareGoldenRuns({ base: [base, base], head })).toMatchObject({ verdict: 'regression', difference, reason: expect.stringContaining('action 3') });
  });

  it('calls an action whose element is gone from the head a regression', () => {
    const base = run([capture(0, picture(), page)]);
    const head = run([capture(0, picture(), page)], { unprovenInteractions: ['[Interaction non prouvée] Sélecteur introuvable pour click (#pay)'] });
    expect(compareGoldenRuns({ base: [base, base], head }).verdict).toBe('regression');
  });

  it('calls a session the base no longer replays stale, whatever the head does', () => {
    const base = run([], { status: 'failed', message: 'no recorded response' });
    expect(compareGoldenRuns({ base: [base, base], head: run([]) })).toMatchObject({ verdict: 'stale', moments: [] });
  });

  it('says how much of a recording ends unreplayed', () => {
    const tailCut = { reason: 'missing-result' as const, atSequence: 40, keptSteps: 4, droppedSteps: 2 };
    const cut = run([capture(0, picture(), page)], { tailCut });
    const comparison = compareGoldenRuns({ base: [cut, cut], head: cut });
    expect(comparison).toMatchObject({ verdict: 'unchanged', head: { droppedSteps: 2 } });
    expect(renderGoldenCheckReport(goldenCheckReport([comparison], { base: 'main', head: 'feature' }))).toContain('fin non rejouée (2 action(s))');
  });

  it('calls two base runs that disagree flaky', () => {
    const base = run([]);
    const stalled = run([], { status: 'stalled', replayIndex: 2 });
    expect(compareGoldenRuns({ base: [base, stalled], head: base }).verdict).toBe('flaky');
  });

  it('with a third base run, leaves out what moved in any of them', () => {
    // A blinking caret (pixel 7, a colour) that the first two runs caught in the same state.
    const caret = (color: string, black: number[]) => run([capture(4, picture(black), [...page, node('html/body/caret', [7, 0, 1, 1], color)])]);
    const base = caret('black', [7]);
    const head = caret('white', []);
    expect(compareGoldenRuns({ base: [base, base], head }).verdict).toBe('changed');
    const result = compareGoldenRuns({ base: [base, base, caret('white', [])], head });
    expect(result.verdict).toBe('unchanged');
    expect(result.moments[0]).toMatchObject({ noisyMeasures: 1, pixelRatio: 0 });
    expect(result.moments[0]!.noisyPixelRatio).toBeCloseTo(1 / 200);
  });

  it('calls a third base run that stops elsewhere flaky', () => {
    const base = run([]);
    const result = compareGoldenRuns({ base: [base, base, run([], { replayIndex: 3 })], head: base });
    expect(result).toMatchObject({ verdict: 'flaky', reason: 'les 3 rejeux de la base ne vont pas tous au même point' });
  });

  it('reports a moment the head did not reach, and one it added', () => {
    const base = run([capture(0, picture(), page), capture(2, picture(), page)]);
    const head = run([capture(0, picture(), page), capture(3, picture(), page)]);
    expect(compareGoldenRuns({ base: [base, base], head }).moments.map((moment) => [moment.replayIndex, moment.status]))
      .toEqual([[0, 'same'], [2, 'missing-in-head'], [3, 'new-in-head']]);
  });
});

describe('golden check report', () => {
  it('puts regressions first, fails on a regression or a change, and writes the pictures', () => {
    const same = run([capture(0, picture(), page)]);
    const sessions = [
      compareGoldenRuns({ base: [same, same], head: same }),
      compareGoldenRuns({ base: [{ ...same, sessionId: 's2' }, { ...same, sessionId: 's2' }], head: run([capture(0, picture([3]), page)], { sessionId: 's2' }) }),
      compareGoldenRuns({ base: [{ ...same, sessionId: 's3' }, { ...same, sessionId: 's3' }], head: run([], { sessionId: 's3', status: 'diverged' }) }),
    ];
    const report = goldenCheckReport(sessions, { base: 'main', head: 'feature' });
    expect(report.sessions.map((session) => [session.sessionId, session.verdict])).toEqual([['s3', 'regression'], ['s2', 'changed'], ['s1', 'unchanged']]);
    expect(report).toMatchObject({ passed: false, counts: { regression: 1, changed: 1, unchanged: 1, stale: 0, flaky: 0 } });
    expect(goldenCheckReport([sessions[0]!], { base: 'main', head: 'feature' }).passed).toBe(true);

    const markdown = renderGoldenCheckReport(report);
    expect(markdown).toContain('# Suite de sessions : main → feature');
    expect(markdown).toContain('🔴 régression : 1 · 🟡 changé : 1 · 🟢 inchangé : 1');
    expect(markdown).toContain('![](images/s2/000-diff.png)');

    const directory = mkdtempSync(join(tmpdir(), 'golden-report-'));
    try {
      const written = writeGoldenCheckReport(directory, report);
      expect(['base', 'head', 'diff'].map((kind) => existsSync(join(directory, `images/s2/000-${kind}.png`)))).toEqual([true, true, true]);
      const json = readFileSync(written.json, 'utf8');
      expect(json).not.toContain('Png');
      expect(JSON.parse(json)).toMatchObject({ format: 'craft-golden-check', passed: false });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
