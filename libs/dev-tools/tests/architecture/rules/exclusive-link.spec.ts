import { describe, expect, it } from 'vitest';
import { noExclusiveLink } from '@craft-ng/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('noExclusiveLink', () => {
  it('keeps exclusive feature branches from linking through a shared kernel', () => {
    const graph = loadArchitectureFixture('app');
    expect(() =>
      noExclusiveLink(graph.route('/admin'), graph.route('/checkout')),
    ).not.toThrow();
  });
});
