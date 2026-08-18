import { describe, expect, it } from 'vitest';
import { assertNoDependencyCycles } from '@craft-ts/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertNoDependencyCycles', () => {
  it('accepts a valid app with no depends-on cycles', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertNoDependencyCycles(graph.graph)).not.toThrow();
  });

  it('rejects a depends-on cycle between services', () => {
    const graph = loadArchitectureFixture('service-cycle');
    expect(() => assertNoDependencyCycles(graph.graph)).toThrow(
      /Dependency cycle:.*Left.*Right|Right.*Left/,
    );
  });
});
