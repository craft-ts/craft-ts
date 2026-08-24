import { describe, expect, it } from 'vitest';
import {
  assertRouteComponentsInSeparateFiles,
} from '../../../src/index.js';
import { loadArchitectureFixture } from '../load-graph';

describe('assertRouteComponentsInSeparateFiles', () => {
  it('allows routed components declared in another file', () => {
    const graph = loadArchitectureFixture('app');

    expect(() => assertRouteComponentsInSeparateFiles(graph.graph)).not.toThrow();
  });

  it('rejects component and route declarations in the same file', () => {
    const graph = loadArchitectureFixture('route-components-same-file');

    expect(() => assertRouteComponentsInSeparateFiles(graph.graph)).toThrow(
      /same file.*routes\.ts/s,
    );
  });

  it('rejects multiple routed page components in one shared file', () => {
    const graph = loadArchitectureFixture('route-components-shared-file');

    expect(() => assertRouteComponentsInSeparateFiles(graph.graph)).toThrow(
      /multiple page components.*shared-page\.ts/s,
    );
  });
});
