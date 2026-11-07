import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import {
  behaviorCatalogToTypeScript,
  behaviorObligationsReport,
  findBehaviorTestFiles,
  readBehaviorCatalogAtBase,
  behaviorCoverage,
  readBehaviorMutantOutcomes,
  readBehaviorProofIndex,
  readBehaviorProofIndexAtBase,
  writeBehaviorCoverage,
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
      // and at the base. The unit tests leave theirs in an index out of git
      // (`nx test` runs first): they prove, they are not compared to the base.
      traces: {
        ...readReferenceTraces(join(rootDir, 'e2e/__sessions__')),
        ...readBehaviorProofIndex(rootDir),
      },
      // At the base: its committed references, and the unit index its last
      // CI run published (absent locally, where unit proofs are not compared).
      baseTraces: {
        ...readReferenceTracesAtBase({ cwd: rootDir, sessionsDir: 'e2e/__sessions__' }),
        ...readBehaviorProofIndexAtBase(rootDir),
      },
    });
    console.info(`[craft behaviours] ${report.coverage.proven}/${report.coverage.total} proven by tests`);
    for (const warning of report.warnings) console.warn(`[craft behaviours] ${warning}`);
    // Read by the log server for the dashboard's coverage page.
    writeBehaviorCoverage(
      rootDir,
      behaviorCoverage(report, {
        app: 'demo-ecommerce',
        waivers: behaviorWaiverList,
        mutants: readBehaviorMutantOutcomes(rootDir),
      }),
    );
    // Rewritten with `vitest -u`; in CI a stale catalog fails here.
    await expect.soft(behaviorCatalogToTypeScript(report.catalog)).toMatchFileSnapshot('./behaviors.catalog.ts');
    expect(report.violations).toEqual([]);
  }, 180_000);
});
