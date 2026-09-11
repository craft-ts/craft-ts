/**
 * The solver, on graphs small enough to reason about by hand.
 *
 * Every case here is built from a literal graph and a literal dump rather than
 * from a TypeScript fixture. That is not a shortcut: the two producers are
 * separately tested — `styled-elements.spec.ts` proves the AST half, the style
 * package proves the dump half — and mixing them in here would make a failure
 * ambiguous between "the solver is wrong" and "the extraction is wrong".
 *
 * The list of cases is the plan's, and the ones worth reading first are the
 * two that a plausible solver gets wrong: the button that passes at rest and
 * fails on hover (an axis nobody screenshots), and the gradient that must come
 * back `indeterminate` rather than `pass`.
 */
import { describe, expect, it } from 'vitest';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph.ts';
import type { StyleDump, StyleDumpAtom } from './style-graph.ts';
import {
  analyzeTextContrast,
  summariseTextContrast,
  type ResolvedTextContrast,
  type TextContrastResult,
} from './style-contrast.ts';

/* ------------------------------------------------------------------------ *
 * A tiny builder for graphs and dumps
 * ------------------------------------------------------------------------ */

interface ElementSpec {
  readonly id: string;
  readonly label: string;
  readonly component: string;
  readonly classes?: readonly string[];
  readonly text?: boolean;
  readonly parent?: string;
  readonly renders?: string;
}

function graphOf(
  components: readonly string[],
  elements: readonly ElementSpec[],
): DependencyGraph {
  const nodes: DependencyGraphNode[] = components.map((name) => ({
    id: `c:${name}`,
    kind: 'component',
    label: name,
  }));
  const edges: DependencyGraphEdge[] = [];
  for (const element of elements) {
    nodes.push({
      id: element.id,
      kind: 'styled-element',
      label: element.label,
      details: {
        component: element.component,
        componentId: `c:${element.component}`,
        classKeys: element.classes ?? [],
        mayContainText: element.text === true,
        textKind: element.text ? 'static' : 'none',
        branch: '',
      },
    });
    edges.push({
      from: element.parent ?? `c:${element.component}`,
      to: element.id,
      kind: 'contains',
      evidence: 'ast',
    });
    if (element.renders) {
      edges.push({
        from: element.id,
        to: `c:${element.renders}`,
        kind: 'renders',
        evidence: 'ast',
      });
    }
  }
  return {
    version: 1,
    rootDir: '/repo',
    tsConfigFilePath: '/repo/tsconfig.json',
    nodes,
    edges,
  };
}

type AtomSpec = readonly [
  className: string,
  property: string,
  value: string,
  conditions?: readonly string[],
];

function dumpOf(
  sheets: Readonly<Record<string, readonly AtomSpec[]>>,
  vars: readonly {
    name: string;
    initialValue: string;
    inherits?: boolean;
  }[] = [],
): StyleDump {
  const atoms: StyleDumpAtom[] = [];
  const classes = Object.entries(sheets).map(([key, specs]) => {
    for (const [className, property, value, conditions] of specs) {
      atoms.push({
        className,
        property,
        value,
        conditions: conditions ?? [],
        unproven: '',
      });
    }
    return {
      key,
      className: specs.map(([className]) => className).join(' '),
      axes: {},
      atoms: specs.map(([className]) => className),
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
    };
  });
  return {
    version: 2,
    classes,
    atoms,
    vars: vars.map((declaration) => ({
      name: declaration.name,
      syntax: '<color>',
      inherits: declaration.inherits ?? false,
      initialValue: declaration.initialValue,
      role: 'none',
    })),
  };
}

const resolved = (results: readonly TextContrastResult[]) =>
  results.filter(
    (result): result is ResolvedTextContrast => result.kind === 'resolved',
  );

const only = (results: readonly TextContrastResult[]) => {
  expect(results, JSON.stringify(results, null, 2)).toHaveLength(1);
  return results[0] as TextContrastResult;
};

/** 16px, weight 400 — the plain body-text case, unless a sheet says otherwise. */
const BODY = [
  ['t-size', 'font-size', '16px'],
  ['t-weight', 'font-weight', '400'],
] as const satisfies readonly AtomSpec[];

/* ------------------------------------------------------------------------ *
 * The cases
 * ------------------------------------------------------------------------ */

describe('colour and background on the same element', () => {
  it('passes a readable pair and names both sides', () => {
    const results = analyzeTextContrast(
      graphOf(
        ['Label'],
        [{ id: 'e:1', label: 'p.label', component: 'Label', classes: ['s-root'], text: true }],
      ),
      dumpOf({
        's-root': [
          ...BODY,
          ['a-color', 'color', '#111318'],
          ['a-bg', 'background-color', '#ffffff'],
        ],
      }),
    );
    const result = only(results);
    expect(result).toMatchObject({
      kind: 'resolved',
      verdict: 'pass',
      required: 4.5,
      textScale: 'normal',
    });
    expect((result as ResolvedTextContrast).foreground.value).toBe('#111318');
    expect((result as ResolvedTextContrast).background.value).toBe('#ffffff');
  });

  it('fails a pair below the threshold, and by the unrounded ratio', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Label'],
          [{ id: 'e:1', label: 'p.label', component: 'Label', classes: ['s-root'], text: true }],
        ),
        dumpOf({
          's-root': [
            ...BODY,
            ['a-color', 'color', '#777777'],
            ['a-bg', 'background-color', '#ffffff'],
          ],
        }),
      ),
    ) as ResolvedTextContrast;
    // 4.478:1 — the pair a report that rounded to two decimals before
    // comparing would print as `4.48` and, if it compared the printed
    // number, still fail; `#767676` next door is 4.542 and genuinely passes.
    expect(result.verdict).toBe('fail');
    expect(result.ratio).toBeLessThan(4.5);
    expect(result.ratio).toBeGreaterThan(4.4);
  });
});

describe('inheritance and the background walk', () => {
  it('inherits colour from an ancestor and finds the background above it', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Card'],
          [
            { id: 'e:root', label: 'div.card', component: 'Card', classes: ['card-root'] },
            {
              id: 'e:body',
              label: 'p.body',
              component: 'Card',
              classes: ['card-body'],
              parent: 'e:root',
              text: true,
            },
          ],
        ),
        dumpOf({
          'card-root': [
            ['a-bg', 'background-color', '#ffffff'],
            ['a-ink', 'color', '#111318'],
          ],
          'card-body': BODY,
        }),
      ),
    ) as ResolvedTextContrast;
    expect(result.foreground.value).toBe('#111318');
    expect(result.background.value).toBe('#ffffff');
    expect(result.verdict).toBe('pass');
  });

  it('walks past two transparent levels to the painted one', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Page'],
          [
            { id: 'e:page', label: 'div.page', component: 'Page', classes: ['page-root'] },
            { id: 'e:mid', label: 'div.mid', component: 'Page', classes: ['page-mid'], parent: 'e:page' },
            {
              id: 'e:text',
              label: 'span.text',
              component: 'Page',
              classes: ['page-text'],
              parent: 'e:mid',
              text: true,
            },
          ],
        ),
        dumpOf({
          'page-root': [['a-pagebg', 'background-color', '#0b0d11']],
          'page-mid': [['a-clear', 'background-color', 'transparent']],
          'page-text': [...BODY, ['a-ink', 'color', '#f2f4f8']],
        }),
      ),
    ) as ResolvedTextContrast;
    expect(result.background.value).toBe('#0b0d11');
    expect(result.verdict).toBe('pass');
  });

  it('says so when nobody paints anything, instead of assuming a white page', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Bare'],
          [{ id: 'e:1', label: 'p.bare', component: 'Bare', classes: ['bare-root'], text: true }],
        ),
        dumpOf({ 'bare-root': [...BODY, ['a-ink', 'color', '#767676']] }),
      ),
    );
    expect(result).toMatchObject({
      kind: 'indeterminate',
      reason: 'unknown-background',
    });
  });
});

describe('themes and states', () => {
  const themedGraph = () =>
    graphOf(
      ['Themed'],
      [
        { id: 'e:root', label: 'div.root', component: 'Themed', classes: ['t-root'] },
        {
          id: 'e:text',
          label: 'p.text',
          component: 'Themed',
          classes: ['t-text'],
          parent: 'e:root',
          text: true,
        },
      ],
    );

  it('passes in light and fails in dark, as two separate rows', () => {
    const results = resolved(
      analyzeTextContrast(
        themedGraph(),
        dumpOf({
          't-root': [
            ['a-bg', 'background-color', '#ffffff'],
            // The dark theme repaints the surface and forgets the ink, which
            // is the ordinary way a dark mode breaks: 5.98:1 becomes 1.72:1.
            ['a-bg-dark', 'background-color', '#39414f', ['scheme:dark']],
          ],
          't-text': [...BODY, ['a-ink', 'color', '#5b6472']],
        }),
      ),
    );
    const light = results.find((result) => result.scenario.id === 'base');
    const dark = results.find((result) => result.scenario.id === 'scheme=dark');
    expect(light?.verdict).toBe('pass');
    expect(dark?.verdict).toBe('fail');
  });

  it('catches a button that is readable at rest and not under the pointer', () => {
    // The case the hover axis exists for. Without `interaction.hover` in the
    // contract the `:hover` rule is invisible: the base row passes, and the
    // one state nobody screenshots is the one that fails.
    const results = resolved(
      analyzeTextContrast(
        graphOf(
          ['Button'],
          [
            {
              id: 'e:button',
              label: 'button.root',
              component: 'Button',
              classes: ['btn-root'],
              text: true,
            },
          ],
        ),
        dumpOf(
          {
            'btn-root': [
              ...BODY,
              ['a-ink', 'color', 'var(--btn-ink)'],
              ['a-bg', 'background-color', 'var(--btn-bg)'],
              ['z-hover-bg', '--btn-bg', '#f5b544', ['interaction.hover:active']],
            ],
          },
          [
            { name: '--btn-ink', initialValue: '#ffffff' },
            { name: '--btn-bg', initialValue: '#8a5a00' },
          ],
        ),
      ),
    );
    expect(
      results.find((result) => result.scenario.id === 'base')?.verdict,
    ).toBe('pass');
    const hover = results.find(
      (result) => result.scenario.id === 'interaction.hover=active',
    );
    expect(hover?.verdict).toBe('fail');
    expect(hover?.background.value).toBe('#f5b544');
  });
});

describe('the two thresholds', () => {
  it('fails the same colours at 14px and passes them at 24px', () => {
    const pair = (size: string) =>
      only(
        analyzeTextContrast(
          graphOf(
            ['Heading'],
            [{ id: 'e:1', label: 'h1.title', component: 'Heading', classes: ['h-root'], text: true }],
          ),
          dumpOf({
            'h-root': [
              ['a-size', 'font-size', size],
              ['a-weight', 'font-weight', '400'],
              ['a-ink', 'color', '#8a8a8a'],
              ['a-bg', 'background-color', '#ffffff'],
            ],
          }),
        ),
      ) as ResolvedTextContrast;

    const small = pair('14px');
    const large = pair('24px');
    expect([small.required, small.verdict]).toEqual([4.5, 'fail']);
    expect([large.required, large.verdict]).toEqual([3, 'pass']);
    // Same two colours, same ratio: only the threshold moved.
    expect(small.ratio).toBeCloseTo(large.ratio, 12);
  });

  it('turns rem into pixels against the root size', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Rem'],
          [{ id: 'e:1', label: 'p.text', component: 'Rem', classes: ['r-root'], text: true }],
        ),
        dumpOf({
          'r-root': [
            ['a-size', 'font-size', '1.5rem'],
            ['a-weight', 'font-weight', '400'],
            ['a-ink', 'color', '#8a8a8a'],
            ['a-bg', 'background-color', '#ffffff'],
          ],
        }),
      ),
    ) as ResolvedTextContrast;
    expect(result.fontSizePx).toBe(24);
    expect(result.required).toBe(3);
  });
});

describe('variables', () => {
  it('lets a local write beat an inherited theme variable', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Overridden'],
          [
            { id: 'e:root', label: 'div.theme', component: 'Overridden', classes: ['theme-root'] },
            {
              id: 'e:text',
              label: 'p.text',
              component: 'Overridden',
              classes: ['local-root'],
              parent: 'e:root',
              text: true,
            },
          ],
        ),
        dumpOf(
          {
            'theme-root': [
              ['a-theme-ink', '--ink', '#f2f4f8'],
              ['a-theme-bg', 'background-color', '#ffffff'],
            ],
            'local-root': [
              ...BODY,
              ['a-local-ink', '--ink', '#111318'],
              ['a-read', 'color', 'var(--ink)'],
            ],
          },
          [{ name: '--ink', initialValue: '#000000', inherits: true }],
        ),
      ),
    ) as ResolvedTextContrast;
    expect(result.foreground.value).toBe('#111318');
    expect(result.verdict).toBe('pass');
  });

  it('does not let a non-inheriting variable cross into a child', () => {
    // The trap the design system is full of: a theme variable inherits and a
    // component variable does not. A solver that let both through would prove
    // the wrong colour for every component under a themed wrapper.
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Scoped'],
          [
            { id: 'e:root', label: 'div.wrap', component: 'Scoped', classes: ['wrap-root'] },
            {
              id: 'e:text',
              label: 'p.text',
              component: 'Scoped',
              classes: ['child-root'],
              parent: 'e:root',
              text: true,
            },
          ],
        ),
        dumpOf(
          {
            'wrap-root': [
              ['a-write', '--ink', '#ffffff'],
              ['a-bg', 'background-color', '#ffffff'],
            ],
            'child-root': [...BODY, ['a-read', 'color', 'var(--ink)']],
          },
          [{ name: '--ink', initialValue: '#111318', inherits: false }],
        ),
      ),
    ) as ResolvedTextContrast;
    // The registered initial value applies, not the parent's write.
    expect(result.foreground.value).toBe('#111318');
  });
});

describe('a component used on two surfaces', () => {
  it('is judged once per surface, and can pass on one and fail on the other', () => {
    const graph = graphOf(
      ['Page', 'Badge'],
      [
        { id: 'e:light', label: 'div.light', component: 'Page', classes: ['light-root'], renders: 'Badge' },
        { id: 'e:dark', label: 'div.dark', component: 'Page', classes: ['dark-root'], renders: 'Badge' },
        { id: 'e:badge', label: 'span.badge', component: 'Badge', classes: ['badge-root'], text: true },
      ],
    );
    const results = resolved(
      analyzeTextContrast(
        graph,
        dumpOf({
          'light-root': [['a-light', 'background-color', '#ffffff']],
          'dark-root': [['a-dark', 'background-color', '#151922']],
          'badge-root': [...BODY, ['a-ink', 'color', '#5b6472']],
        }),
      ),
    );
    expect(results).toHaveLength(2);
    expect(new Set(results.map((result) => result.verdict))).toEqual(
      new Set(['pass', 'fail']),
    );
    expect(new Set(results.map((result) => result.background.value))).toEqual(
      new Set(['#ffffff', '#151922']),
    );
  });
});

describe('what cannot be proven', () => {
  it('reports a gradient as indeterminate and never as a pass', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Hero'],
          [
            { id: 'e:hero', label: 'div.hero', component: 'Hero', classes: ['hero-root'] },
            {
              id: 'e:text',
              label: 'h1.title',
              component: 'Hero',
              classes: ['hero-title'],
              parent: 'e:hero',
              text: true,
            },
          ],
        ),
        dumpOf({
          'hero-root': [
            ['a-grad', 'background-image', 'linear-gradient(#000000, #333333)'],
          ],
          'hero-title': [...BODY, ['a-ink', 'color', '#ffffff']],
        }),
      ),
    );
    expect(result).toMatchObject({
      kind: 'indeterminate',
      reason: 'unsupported-background',
    });
    expect(result.kind).not.toBe('resolved');
  });

  it('reports a computed class rather than proving nothing about it', () => {
    const graph = graphOf(
      ['Dynamic'],
      [{ id: 'e:1', label: 'div', component: 'Dynamic', text: true }],
    );
    const element = graph.nodes.find((node) => node.id === 'e:1');
    if (element) {
      element.details = {
        ...element.details,
        unresolvedClass: 'the class is assembled at runtime',
      };
    }
    expect(analyzeTextContrast(graph, dumpOf({}))).toMatchObject([
      { kind: 'indeterminate', reason: 'dynamic-style' },
    ]);
  });

  it('reports a semi-transparent background rather than compositing it', () => {
    const result = only(
      analyzeTextContrast(
        graphOf(
          ['Veil'],
          [
            { id: 'e:veil', label: 'div.veil', component: 'Veil', classes: ['veil-root'] },
            {
              id: 'e:text',
              label: 'p.text',
              component: 'Veil',
              classes: ['veil-text'],
              parent: 'e:veil',
              text: true,
            },
          ],
        ),
        dumpOf({
          'veil-root': [['a-veil', 'background-color', 'rgba(0, 0, 0, 0.5)']],
          'veil-text': [...BODY, ['a-ink', 'color', '#ffffff']],
        }),
      ),
    );
    expect(result).toMatchObject({
      kind: 'indeterminate',
      reason: 'unsupported-background',
    });
  });
});

describe('what the report does not repeat', () => {
  it('checks only elements that can hold text', () => {
    // A wrapper with a colour and a background but no text is not a contrast
    // question: reporting it would fail on pairs nobody can see.
    const results = analyzeTextContrast(
      graphOf(
        ['Wrapper'],
        [{ id: 'e:1', label: 'div.wrap', component: 'Wrapper', classes: ['w-root'] }],
      ),
      dumpOf({
        'w-root': [...BODY, ['a-ink', 'color', '#767676'], ['a-bg', 'background-color', '#ffffff']],
      }),
    );
    expect(results).toEqual([]);
  });

  it('folds scenarios with the same answer, and keeps their names', () => {
    const results = analyzeTextContrast(
      graphOf(
        ['Toned'],
        [{ id: 'e:1', label: 'span.chip', component: 'Toned', classes: ['chip-root'], text: true }],
      ),
      dumpOf(
        {
          'chip-root': [
            ...BODY,
            ['a-ink', 'color', '#ffffff'],
            ['a-bg', 'background-color', 'var(--chip-bg)'],
            // Two tones with the same colour: one answer, two scenarios.
            ['b-info', '--chip-bg', '#1b5fa1', ['tone:info']],
            ['b-brand', '--chip-bg', '#1b5fa1', ['tone:brand']],
          ],
        },
        [{ name: '--chip-bg', initialValue: '#0f7b4f' }],
      ),
    );
    const shared = results.find(
      (result) => result.scenario.id === 'tone=brand',
    );
    expect(shared?.equivalentScenarios).toEqual(['tone=info']);
    // Base is a different colour, so it stays its own row.
    expect(results).toHaveLength(2);
  });

  it('does not cross an axis that only moves a box', () => {
    const results = analyzeTextContrast(
      graphOf(
        ['Padded'],
        [{ id: 'e:1', label: 'p.text', component: 'Padded', classes: ['pad-root'], text: true }],
      ),
      dumpOf({
        'pad-root': [
          ...BODY,
          ['a-ink', 'color', '#111318'],
          ['a-bg', 'background-color', '#ffffff'],
          ['a-pad', 'padding', '2rem', ['viewport:md']],
        ],
      }),
    );
    // One row, not two: the breakpoint cannot change a ratio.
    expect(results).toHaveLength(1);
    expect(results[0]?.scenario.id).toBe('base');
  });
});

describe('the summary', () => {
  it('counts the three outcomes apart', () => {
    const results: readonly TextContrastResult[] = [
      ...analyzeTextContrast(
        graphOf(
          ['Mixed'],
          [
            { id: 'e:1', label: 'p.good', component: 'Mixed', classes: ['g-root'], text: true },
            { id: 'e:2', label: 'p.bad', component: 'Mixed', classes: ['b-root'], text: true },
            { id: 'e:3', label: 'p.unknown', component: 'Mixed', classes: ['u-root'], text: true },
          ],
        ),
        dumpOf({
          'g-root': [...BODY, ['a-g-ink', 'color', '#000000'], ['a-g-bg', 'background-color', '#ffffff']],
          'b-root': [...BODY, ['a-b-ink', 'color', '#bbbbbb'], ['a-b-bg', 'background-color', '#ffffff']],
          'u-root': [...BODY, ['a-u-ink', 'color', '#000000']],
        }),
      ),
    ];
    expect(summariseTextContrast(results)).toEqual({
      total: 3,
      pass: 1,
      fail: 1,
      indeterminate: 1,
    });
  });
});
