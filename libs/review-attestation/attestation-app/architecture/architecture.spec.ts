import { beforeAll, describe, expect, it } from 'vitest';
import { assertDeclarativeArchitecture } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from './load-graph';
import { architectureWaiverList } from './waivers';
import {
  behaviorCatalogToTypeScript,
  behaviorCoverage,
  behaviorObligationsReport,
  findBehaviorTestFiles,
  readBehaviorCatalogAtBase,
  readBehaviorMutantOutcomes,
  writeBehaviorCoverage,
} from '@craft-ts/dev-tools/behavior-catalog';
import { behaviorWaiverList } from './behavior-waivers';

/** App-specific lookups. Common architecture rules live in `rules/`. */
describe('architecture', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;

  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);

  it('loads the architecture graph', () => {
    expect(graph.graph.version).toBe(1);
  });

  it('keeps the base rules, the style rules included', () => {
    assertDeclarativeArchitecture(graph.graph, {
      // Neither the AI overlay nor closing a review session changes the queue.
      allow: ['sendContextToAi', 'closeReview'],
      waivers: architectureWaiverList,
    });
  });

  it('lists what a user can trigger, and lets no new behaviour arrive without its test', async () => {
    const rootDir = graph.graph.rootDir;
    const report = behaviorObligationsReport(graph.graph, {
      sourceRoots: ['libs/review-attestation/attestation-app/src'],
      base: readBehaviorCatalogAtBase({
        rootDir,
        catalogPath: 'libs/review-attestation/attestation-app/architecture/behaviors.catalog.ts',
      }),
      waivers: behaviorWaiverList,
      testFiles: findBehaviorTestFiles(rootDir, ['libs/review-attestation/attestation-app/src']),
    });
    // Read by the log server for the dashboard's coverage page.
    const appDir = `${rootDir}/libs/review-attestation/attestation-app`;
    writeBehaviorCoverage(
      appDir,
      behaviorCoverage(report, {
        app: 'attestation-app',
        waivers: behaviorWaiverList,
        mutants: readBehaviorMutantOutcomes(appDir),
      }),
    );
    // Rewritten with `vitest -u`; in CI a stale catalog fails here.
    await expect
      .soft(behaviorCatalogToTypeScript(report.catalog))
      .toMatchFileSnapshot('./behaviors.catalog.ts');
    expect(report.violations).toEqual([]);
  });
});
