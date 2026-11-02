import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertDeclarativeArchitecture,
  assertLazyRouteTargetsStayLazy,
  behaviorCatalogToTypeScript,
  behaviorObligationsReport,
  findBehaviorTestFiles,
  readBehaviorCatalogAtBase,
} from '@craft-ts/dev-tools';
import { behaviorWaiverList } from './behavior-waivers';
import { loadArchitectureGraph } from './load-graph';
import { architectureWaiverList } from './waivers';

/**
 * The graph is loaded once for the whole suite: every rule, the design-system
 * ones included, runs through `assertDeclarativeArchitecture`.
 */
describe('architecture', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;

  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);

  it('loads the architecture graph', () => {
    expect(graph.graph.version).toBe(1);
  });

  it('keeps lazy route modules outside the eager application import graph', () => {
    assertLazyRouteTargetsStayLazy(graph.graph, {
      entryPoints: ['apps/debug-session-dashboard/src/main.ts'],
    });
  });

  it('keeps the base rules, the style rules included', () => {
    assertDeclarativeArchitecture(graph.graph, {
      waivers: architectureWaiverList,
      // The AI chat's own mutation is the framework's, not this app's: nothing
      // in a replay dashboard has a query to refresh after it.
      allow: ['sendContextToAi'],
      // The app follows the folder layout: a misplaced file or an upward
      // import fails here instead of warning.
      severity: {
        'folder-layout-placement': 'error',
        'folder-layout-layers': 'error',
      },
    });
  });

  it('lists what a user can trigger, and lets no new behaviour arrive without its test', async () => {
    const rootDir = graph.graph.rootDir;
    const report = behaviorObligationsReport(graph.graph, {
      sourceRoots: ['apps/debug-session-dashboard/src'],
      // URLs built at run time: the graph cannot read them, so they are named
      // here. Neither declares a typed exception, so neither owes one a test.
      httpContracts: {
        'apps/debug-session-dashboard/src/features/e2e-replay/e2e-replay-route.service.ts#sourceSession':
          { method: 'GET', url: '<portable export named by the route>', exceptions: [] },
        'apps/debug-session-dashboard/src/shared/data-access/resume-thread.service.ts#thread':
          { method: 'GET', url: '/sessions/resume-requests/:lookup', exceptions: [] },
      },
      base: readBehaviorCatalogAtBase({
        rootDir,
        catalogPath: 'apps/debug-session-dashboard/architecture/behaviors.catalog.ts',
      }),
      waivers: behaviorWaiverList,
      testFiles: findBehaviorTestFiles(rootDir, ['apps/debug-session-dashboard/src']),
    });
    // Rewritten with `vitest -u`; in CI a stale catalog fails here.
    await expect
      .soft(behaviorCatalogToTypeScript(report.catalog))
      .toMatchFileSnapshot('./behaviors.catalog.ts');
    expect(report.violations).toEqual([]);
  });
});
