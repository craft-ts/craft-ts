import { describe, expect, it } from 'vitest';
import {
  assertPrimitiveMethodsUsedOnce,
  primitiveMethodUsageViolations,
} from '../../../src/scripts/architecture-graph';
import { loadArchitectureFixture } from '../load-graph';

describe('assertPrimitiveMethodsUsedOnce', () => {
  it('accepts an exposed primitive method used from one file', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertPrimitiveMethodsUsedOnce(graph.graph)).not.toThrow();
  });

  it('rejects an exposed primitive method used from multiple files', () => {
    const graph = loadArchitectureFixture('duplicate-primitive-method');
    expect(() => assertPrimitiveMethodsUsedOnce(graph.graph)).toThrow(
      /Primitive method state:counter\.increment is used at multiple call sites/,
    );
  });

  it('keeps the individual call sites in the violation', () => {
    const graph = loadArchitectureFixture('duplicate-primitive-method');
    const [violation] = primitiveMethodUsageViolations(graph.graph);

    expect(violation?.method).toBe('increment');
    expect(violation?.callSites).toHaveLength(3);
    expect(violation?.callSites.map((site) => site.filePath)).toEqual(
      expect.arrayContaining(['first-page.ts', 'second-page.ts']),
    );
  });
});
