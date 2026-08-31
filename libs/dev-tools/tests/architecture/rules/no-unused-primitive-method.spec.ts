import { describe, expect, it } from 'vitest';
import {
  assertNoUnusedPrimitiveMethods,
  unusedPrimitiveMethodViolations,
} from '../../../src/scripts/architecture-graph';
import { loadArchitectureFixture } from '../load-graph';

describe('assertNoUnusedPrimitiveMethods', () => {
  it('accepts a project where every exposed method is used', () => {
    const graph = loadArchitectureFixture('duplicate-primitive-method');
    expect(() => assertNoUnusedPrimitiveMethods(graph.graph)).not.toThrow();
  });

  it('rejects an exposed primitive method that has no call site', () => {
    const graph = loadArchitectureFixture('unused-primitive-method');
    expect(() => assertNoUnusedPrimitiveMethods(graph.graph)).toThrow(
      /Primitive method state:counter\.unused is never used in this project.*Remove it\./,
    );
  });

  it('keeps the declaration location in the violation', () => {
    const graph = loadArchitectureFixture('unused-primitive-method');
    const [violation] = unusedPrimitiveMethodViolations(graph.graph);

    expect(violation?.method).toBe('unused');
    expect(violation?.filePath).toBe('counter.ts');
    expect(violation?.line).toBeGreaterThan(0);
  });
});
