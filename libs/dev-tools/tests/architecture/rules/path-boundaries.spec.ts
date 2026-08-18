import { describe, expect, it } from 'vitest';
import { assertPathBoundaries } from '@craft-ts/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertPathBoundaries', () => {
  const graph = () => loadArchitectureFixture('path-boundaries');

  it('rejects a feature that depends on another feature', () => {
    expect(() =>
      assertPathBoundaries(graph().graph, {
        constraints: [
          {
            source: 'features/:feature/**',
            onlyDependOn: [
              'features/:feature/**',
              'shared/**',
              'ui/**',
            ],
          },
        ],
      }),
    ).toThrow(/Path boundary:.*Users.*Cart/s);
  });

  it('rejects a UI node that depends on data', () => {
    expect(() =>
      assertPathBoundaries(graph().graph, {
        constraints: [
          {
            source: 'ui/**',
            onlyDependOn: ['ui/**', 'shared/**'],
            forbidTarget: ['data/**'],
          },
        ],
      }),
    ).toThrow(/Path boundary:.*LeakyWidget.*UsersApi/s);
  });

  it('allows UI to depend on shared when data is not involved', () => {
    expect(() =>
      assertPathBoundaries(graph().graph, {
        constraints: [
          {
            source: 'ui/widget.ts',
            onlyDependOn: ['ui/**', 'shared/**'],
            forbidTarget: ['data/**'],
          },
        ],
      }),
    ).not.toThrow();
  });
});
