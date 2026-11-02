import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertCraftComputedPure,
  assertCraftEffectNoImperativeSync,
  assertCraftEffectNoNetwork,
  assertDeclarativeArchitecture,
  assertInteractiveElementNamed,
  assertLazyRouteTargetsStayLazy,
  assertNoDependencyCycles,
  assertPrimitiveLoaderRequirements,
} from '@craft-ts/dev-tools/architecture-graph';
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

describe('quickstart architecture', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;

  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);

  it('keeps lazy route modules outside the eager application import graph', () => {
    assertLazyRouteTargetsStayLazy(graph.graph, {
      entryPoints: ['apps/quickstart-effect/src/main.ts'],
    });
  });

  it('contains the Effect operation, service and Layer', () => {
    expect(graph.nodes('effect-operation').map((node) => node.label)).toEqual(
      expect.arrayContaining(['loadTask']),
    );
    expect(graph.nodes('effect-service').map((node) => node.label)).toEqual(
      expect.arrayContaining(['TaskRepositoryService']),
    );
    expect(graph.nodes('effect-layer').map((node) => node.label)).toEqual(
      expect.arrayContaining(['TaskRepositoryLive']),
    );
  });

  it('connects the operation to its service and Layer', () => {
    expect(
      graph
        .edges('requires-service')
        .some(
          (edge) =>
            graph.graph.nodes.find((node) => node.id === edge.to)?.label ===
            'TaskRepositoryService',
        ),
    ).toBe(true);
    expect(
      graph
        .edges('provided-by-layer')
        .some(
          (edge) =>
            graph.graph.nodes.find((node) => node.id === edge.to)?.label ===
            'TaskRepositoryLive',
        ),
    ).toBe(true);
  });

  it('requires Effect resources to declare a service boundary', () => {
    assertPrimitiveLoaderRequirements(graph.graph, {
      primitives: ['queryEffect', 'computedEffect', 'mutationEffect'],
      requirements: [
        {
          label: 'an Effect service',
          matches: ({ target }) =>
            target.kind === 'service' &&
            target.details?.['runtime'] === 'effect',
        },
      ],
    });
  });

  it('keeps the starter app declarative and named', () => {
    assertCraftComputedPure(graph.graph);
    assertCraftEffectNoNetwork(graph.graph);
    assertCraftEffectNoImperativeSync(graph.graph);
    assertInteractiveElementNamed(graph.graph);
    assertNoDependencyCycles(graph.graph);
    assertDeclarativeArchitecture(graph.graph, {
      waivers: architectureWaiverList,
      allow: ['sendContextToAi'],
    });
  });

  it('lists what a user can trigger, and lets no new behaviour arrive without its test', async () => {
    const rootDir = graph.graph.rootDir;
    const report = behaviorObligationsReport(graph.graph, {
      sourceRoots: ['apps/quickstart-effect/src'],
      base: readBehaviorCatalogAtBase({
        rootDir,
        catalogPath: 'apps/quickstart-effect/architecture/behaviors.catalog.ts',
      }),
      waivers: behaviorWaiverList,
      testFiles: findBehaviorTestFiles(rootDir, ['apps/quickstart-effect/src']),
    });
    // Read by the log server for the dashboard's coverage page.
    const appDir = `${rootDir}/apps/quickstart-effect`;
    writeBehaviorCoverage(
      appDir,
      behaviorCoverage(report, {
        app: 'quickstart-effect',
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
