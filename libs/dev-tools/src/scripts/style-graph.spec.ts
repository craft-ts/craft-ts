/**
 * The style side of the graph.
 *
 * The first case is the completeness one, deliberately: every predicate below
 * it is only worth its answer if the graph it reads is whole.
 *
 * Falsifiability check (run by hand when the merge changes): drop the
 * `component-without-style-class` diagnostic and "a component nobody styles is
 * reported, not swallowed" goes green while the graph is just as incomplete.
 * Confirmed red before this file was committed, then put back.
 */
import { describe, expect, it } from 'vitest';
import type { DependencyGraph } from './dependency-graph.ts';
import { mergeStyleDump, type StyleDump } from './style-graph.ts';
import {
  dischargers,
  danglingVars,
  extractionGaps,
  impactedClasses,
  matrixSize,
  matrixSizeByComponent,
  propertiesWrittenBy,
  undischargedObligations,
  unproven,
  varsWrittenBy,
} from './style-architecture.ts';

const emptyGraph = (nodes: DependencyGraph['nodes'] = []): DependencyGraph => ({
  version: 1,
  rootDir: '/repo',
  tsConfigFilePath: '/repo/tsconfig.json',
  nodes,
  edges: [],
});

const component = (id: string, label = id) => ({
  id,
  kind: 'component' as const,
  label,
});

const dump: StyleDump = {
  classes: [
    {
      key: 'card-root',
      className: 'a b',
      axes: { viewport: ['md'], scheme: ['dark'] },
      atoms: ['a', 'b'],
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
      unusedAxes: [],
    },
    {
      key: 'backToTop-anchor',
      className: 'c',
      axes: {},
      atoms: ['c'],
      unproven: ['legacy image alignment'],
      requires: ['scrollPort.block'],
      provides: [],
      violates: [],
      unusedAxes: [],
    },
    {
      key: 'shell-main',
      className: 'd',
      axes: {},
      atoms: ['d'],
      unproven: [],
      requires: [],
      provides: ['scrollPort.block'],
      violates: [],
      unusedAxes: [],
    },
  ],
  atoms: [
    {
      className: 'a',
      property: 'padding',
      value: 'var(--ds-gutter)',
      conditions: [],
      unproven: '',
    },
    {
      className: 'b',
      property: '--ds-ink',
      value: '#f2f4f8',
      conditions: ['scheme:dark'],
      unproven: '',
    },
    {
      className: 'c',
      property: 'position',
      value: 'sticky',
      conditions: [],
      unproven: '',
    },
    {
      className: 'd',
      property: 'overflow-block',
      value: 'auto',
      conditions: [],
      unproven: '',
    },
  ],
  vars: [
    {
      name: '--ds-gutter',
      syntax: '<length>',
      inherits: true,
      initialValue: '16px',
      role: 'none',
    },
    {
      name: '--ds-ink',
      syntax: '<color>',
      inherits: true,
      initialValue: '#111318',
      role: 'text',
    },
  ],
};

describe('the graph is whole, or it says so', () => {
  it('reports a component nobody styles, rather than swallowing it', () => {
    const graph = mergeStyleDump(emptyGraph([component('c:Legacy')]), dump);

    expect(extractionGaps(graph)).toHaveLength(1);
    expect(extractionGaps(graph)[0]).toContain('Legacy');
    // The message has to offer the honest alternative, or people will just
    // delete the rule.
    expect(extractionGaps(graph)[0]).toContain('uncovered');
  });

  it('accepts a component listed as knowingly uncovered', () => {
    const graph = mergeStyleDump(emptyGraph([component('c:Legacy')]), dump, {
      uncovered: ['c:Legacy'],
    });

    expect(extractionGaps(graph)).toEqual([]);
  });

  it('reports a sheet one producer saw and the other did not', () => {
    const graph = mergeStyleDump(emptyGraph([component('c:Card')]), dump, {
      usedBy: { 'c:Card': ['card-root', 'ghost-root'] },
    });

    expect(extractionGaps(graph).join(' ')).toContain('ghost-root');
  });

  it('merges the same dump twice without changing anything', () => {
    const once = mergeStyleDump(emptyGraph([component('c:Card')]), dump, {
      usedBy: { 'c:Card': ['card-root'] },
    });
    const twice = mergeStyleDump(once, dump, {
      usedBy: { 'c:Card': ['card-root'] },
    });

    expect(twice.nodes).toHaveLength(once.nodes.length);
    expect(twice.edges).toHaveLength(once.edges.length);
  });
});

describe('what a component costs to capture', () => {
  it('multiplies the sheets it renders together', () => {
    const graph = mergeStyleDump(emptyGraph([component('c:Card')]), dump, {
      usedBy: { 'c:Card': ['card-root', 'shell-main'] },
    });

    // card-root: 2 viewports × 2 schemes = 4. shell-main: 1.
    expect(matrixSize(graph)['card-root']).toBe(4);
    expect(matrixSizeByComponent(graph)['c:Card']).toBe(4);
  });
});

describe('obligations, read off the graph', () => {
  it('names what is required and discharged nowhere', () => {
    const partial: StyleDump = {
      ...dump,
      classes: dump.classes.filter(
        (registered) => registered.key !== 'shell-main',
      ),
    };
    const graph = mergeStyleDump(emptyGraph(), partial);

    expect(undischargedObligations(graph)).toEqual(['scrollPort.block']);
  });

  it('says nothing when the layout answers', () => {
    const graph = mergeStyleDump(emptyGraph(), dump);

    expect(undischargedObligations(graph)).toEqual([]);
    // And it names who answers, which is the rule "only layout discharges".
    expect(dischargers(graph)).toEqual(['shell-main']);
  });
});

describe('what an axis is allowed to touch', () => {
  it('separates the variables it writes from the properties it sets', () => {
    const graph = mergeStyleDump(emptyGraph(), dump);

    expect(varsWrittenBy(graph)).toEqual({ scheme: ['--ds-ink'] });
    // An axis constrained to colours must be absent here. One entry means it
    // moves a box, and every reduction that assumed otherwise is wrong.
    expect(propertiesWrittenBy(graph)['scheme']).toBeUndefined();
  });
});

describe('debt and dangling ends', () => {
  it('counts every escape hatch with the reason its author gave', () => {
    const graph = mergeStyleDump(emptyGraph(), dump);

    expect(unproven(graph)).toEqual([
      'backToTop-anchor: legacy image alignment',
    ]);
  });

  it('finds variables nothing reads', () => {
    const graph = mergeStyleDump(emptyGraph(), dump);

    // `--ds-ink` is written by the dark rule and read by nobody in this dump.
    expect(danglingVars(graph).unread).toEqual(['--ds-ink']);
    expect(danglingVars(graph).undeclared).toEqual([]);
  });
});

describe('impact analysis', () => {
  it('names only what a changed variable can be seen in', () => {
    const graph = mergeStyleDump(emptyGraph(), dump);

    // The gain that pays for visual CI: one colour changes, and the suite
    // recaptures what reaches it rather than everything.
    expect(impactedClasses(graph, ['--ds-gutter'])).toEqual(['card-root']);
    expect(impactedClasses(graph, ['--nothing'])).toEqual([]);
  });
});
