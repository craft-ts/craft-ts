/**
 * The coverage file the dashboard reads: each obligation with what stands
 * behind it, and how a recorded session shows it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { BehaviorObligationsReport } from './behavior-catalog.ts';
import {
  BEHAVIOR_COVERAGE_FILE,
  behaviorCoverage,
  readBehaviorMutantOutcomes,
  writeBehaviorCoverage,
} from './behavior-coverage.ts';

const report = {
  catalog: {
    version: 1,
    behaviors: [
      { id: 'method:cart.add', kind: 'method', file: 'src/cart.ts' },
      { id: 'method:cart.clear', kind: 'method' },
      { id: 'route:shop:wishlist', kind: 'route' },
    ],
  },
  proofs: {
    'src/cart.spec.ts > adds': ['method:cart.add'],
    'shop.checkout/chromium': ['method:cart.add'],
    'src/cart.spec.ts > reads': [],
  },
} as unknown as BehaviorObligationsReport;

describe('behaviorCoverage', () => {
  it('tells what proves, excuses or leaves open each obligation', () => {
    expect(
      behaviorCoverage(report, {
        app: 'shop',
        waivers: [{ rule: 'behavior-unproven', target: 'route:shop:wishlist', reason: 'Behind a flag.' }],
        mutants: { 'method:cart.add': 'killed' },
      }),
    ).toEqual({
      version: 1,
      app: 'shop',
      behaviors: [
        {
          id: 'method:cart.add',
          kind: 'method',
          file: 'src/cart.ts',
          status: 'proven',
          provenBy: ['shop.checkout/chromium', 'src/cart.spec.ts > adds'],
          mutant: 'killed',
          match: { step: 'invocation', outcome: 'succeeded', target: 'cart.add' },
        },
        {
          id: 'method:cart.clear',
          kind: 'method',
          status: 'unproven',
          provenBy: [],
          match: { step: 'invocation', outcome: 'succeeded', target: 'cart.clear' },
        },
        {
          id: 'route:shop:wishlist',
          kind: 'route',
          status: 'waived',
          provenBy: [],
          waiver: 'Behind a flag.',
          match: { step: 'route', path: 'wishlist' },
        },
      ],
    });
  });

  describe('files', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'behavior-coverage-'));
    afterAll(() => rmSync(rootDir, { recursive: true, force: true }));

    it('reads the verdicts `craft mutants` cached, none before it ran', () => {
      expect(readBehaviorMutantOutcomes(rootDir)).toEqual({});
      mkdirSync(join(rootDir, '.craft'), { recursive: true });
      writeFileSync(
        join(rootDir, '.craft/behavior-mutants.json'),
        JSON.stringify({ version: 1, results: { 'method:cart.add': { hash: 'h', outcome: 'survived' } } }),
      );
      expect(readBehaviorMutantOutcomes(rootDir)).toEqual({ 'method:cart.add': 'survived' });
    });

    it('writes the file the log server reads', () => {
      writeBehaviorCoverage(rootDir, behaviorCoverage(report, { app: 'shop' }));
      expect(JSON.parse(readFileSync(join(rootDir, BEHAVIOR_COVERAGE_FILE), 'utf8'))).toMatchObject({
        version: 1,
        app: 'shop',
      });
    });
  });
});
