import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import {
  behaviorCatalogToTypeScript,
  behaviorObligationsReport,
  findBehaviorTestFiles,
  readBehaviorCatalogAtBase,
} from '@craft-ts/dev-tools/behavior-catalog';
import { readReferenceTraces, readReferenceTracesAtBase } from '@craft-ts/playwright-sessions/history';
import { behaviorWaiverList } from './behavior-waivers';

const rootDir = new URL('..', import.meta.url).pathname;

describe('demo e-commerce behaviour obligations', () => {
  it('lists what a user can trigger, and lets no new behaviour arrive without its test', async () => {
    const graph = analyzeDependencyGraph({ rootDir, tsConfigFilePath: 'tsconfig.json' });
    const report = behaviorObligationsReport(graph, {
      sourceRoots: ['src'],
      base: readBehaviorCatalogAtBase({ rootDir, catalogPath: 'architecture/behaviors.catalog.ts' }),
      waivers: behaviorWaiverList,
      testFiles: findBehaviorTestFiles(rootDir, ['src']),
      // The e2e references are committed: their traces are the proofs, now
      // and at the base.
      traces: readReferenceTraces(join(rootDir, 'e2e/__sessions__')),
      baseTraces: readReferenceTracesAtBase({ cwd: rootDir, sessionsDir: 'e2e/__sessions__' }),
    });
    console.info(`[craft behaviours] ${report.coverage.proven}/${report.coverage.total} proven by e2e references`);
    for (const warning of report.warnings) console.warn(`[craft behaviours] ${warning}`);
    // Rewritten with `vitest -u`; in CI a stale catalog fails here.
    await expect.soft(behaviorCatalogToTypeScript(report.catalog)).toMatchFileSnapshot('./behaviors.catalog.ts');
    expect(report.violations).toEqual([]);
  }, 60_000);
});
