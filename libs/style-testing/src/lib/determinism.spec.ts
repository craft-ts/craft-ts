import { describe, expect, it, vi } from 'vitest';
import {
  assertDeterministic,
  determinismScript,
  FROZEN_NOW,
  makeDeterministic,
  measureDeterminism,
  STILLNESS_CSS,
  type DeterministicPage,
} from './determinism.ts';

const fakePage = () => {
  const scripts: string[] = [];
  const media: Record<string, string>[] = [];
  const routes: string[] = [];
  const page: DeterministicPage = {
    addInitScript: async (script) => void scripts.push(String(script)),
    emulateMedia: async (options) => void media.push({ ...options }),
    route: async (pattern) => void routes.push(pattern),
    evaluate: async () => undefined,
  };
  return { page, scripts, media, routes };
};

describe('makeDeterministic', () => {
  it('pins the clock, the randomness, the motion and the network', async () => {
    const { page, scripts, media, routes } = fakePage();
    const record = await makeDeterministic(page, { browser: { name: 'chromium', version: '131' } });

    expect(scripts[0]).toContain('FrozenDate');
    expect(scripts[0]).toContain('Math.random');
    expect(scripts[0]).toContain('animation-duration');
    expect(media[0]).toEqual({ reducedMotion: 'reduce', forcedColors: 'none' });
    // Refused by default: a request that escapes makes the render depend on
    // somebody else's uptime, and the flake shows up months later.
    expect(routes[0]).toBe('**/*');
    expect(record.blockedRequests).toBe(true);
    expect(record.now).toBe(FROZEN_NOW);
    expect(record.browser).toEqual({ name: 'chromium', version: '131' });
  });

  it('records what it pinned, so a cross-browser comparison is detectable', async () => {
    const { page } = fakePage();
    const record = await makeDeterministic(page, { now: 42, seed: 7 });
    expect(record).toMatchObject({ now: 42, seed: 7, embeddedFonts: 0 });
  });
});

describe('determinismScript', () => {
  it('is self-contained: nothing it needs comes from this module at run time', () => {
    const script = determinismScript({ now: 1, seed: 2 });
    expect(script.startsWith('(() => {')).toBe(true);
    expect(script).toContain(JSON.stringify(STILLNESS_CSS));
  });

  it('freezes the clock at the value it was given', () => {
    expect(determinismScript({ now: 1234 })).toContain('const FROZEN = 1234;');
  });
});

describe('measureDeterminism', () => {
  it('is stable when a hundred runs agree', async () => {
    const report = await measureDeterminism(() => 'digest-1', 100);
    expect(report).toMatchObject({ runs: 100, distinct: 1, stable: true });
  });

  it('names the first run that differed', async () => {
    let run = 0;
    const report = await measureDeterminism(() => {
      run += 1;
      return run === 7 ? 'other' : 'digest-1';
    }, 10);
    expect(report.stable).toBe(false);
    expect(report.firstDivergence).toEqual({ run: 6, value: 'other' });
  });
});

describe('assertDeterministic', () => {
  it('passes silently on a stable capture', async () => {
    await expect(assertDeterministic(() => 'same', 5)).resolves.toBeUndefined();
  });

  it('explains why nothing downstream works until this is one', async () => {
    const capture = vi.fn().mockReturnValueOnce('a').mockReturnValue('b');
    await expect(assertDeterministic(capture, 5)).rejects.toThrow(
      /fills the review queue with/,
    );
  });
});
