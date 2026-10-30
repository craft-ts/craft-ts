import { describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import { createArchitectureGraph, serverFunctionScenarioCatalogViolations } from '@craft-ts/dev-tools/architecture-graph';
import { ecommerceCodecs, ecommerceOperations, ecommerceScenarios } from '../src/shared/scenario-catalog';

describe('demo e-commerce scenario catalog architecture', () => {
  it('maps every server function to one known codec and keeps scenarios attached to that operation', () => {
    const rootDir = new URL('..', import.meta.url).pathname;
    const graph = createArchitectureGraph(
      analyzeDependencyGraph({ rootDir, tsConfigFilePath: 'tsconfig.json' }),
    );
    expect(serverFunctionScenarioCatalogViolations(graph.graph, {
      operations: ecommerceOperations,
      scenarios: ecommerceScenarios,
      codecNames: Object.keys(ecommerceCodecs),
    })).toEqual([]);
  }, 45_000);
});
