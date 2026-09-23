/**
 * The style architecture rules and the waiver mechanism.
 *
 * The graph half is exercised on literal graphs; the source half (meta CSS,
 * `.css` imports, `index.html`) on a throwaway project on disk, because it
 * reads files the way the real check does.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph.ts';
import { architectureReport } from './architecture-graph.ts';
import {
  architectureWaivers,
  defineArchitectureWaivers,
} from './architecture-waivers.ts';
import type { ArchitectureCatalog } from './architecture-graph.ts';
import { mergeStyleDump, type StyleDump } from './style-graph.ts';

const element = (
  id: string,
  component: string,
  details: Record<string, unknown>,
): DependencyGraphNode => ({
  id,
  kind: 'styled-element',
  label: `div.${id}`,
  filePath: '/repo/src/card.ts',
  line: 3,
  details: { component, componentId: `component:${component}`, ...details },
});

const graphOf = (
  nodes: DependencyGraphNode[],
  edges: DependencyGraphEdge[] = [],
  tsConfigFilePath = '/repo/does-not-exist/tsconfig.json',
): DependencyGraph => ({
  version: 1,
  rootDir: '/repo',
  tsConfigFilePath,
  nodes,
  edges,
});

const dump = (overrides: Partial<StyleDump> = {}): StyleDump => ({
  version: 2,
  classes: [
    {
      key: 'card-root',
      className: 'a1',
      axes: {},
      atoms: ['a1'],
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
    },
  ],
  atoms: [
    {
      className: 'a1',
      property: 'background-color',
      value: 'var(--card-bg)',
      conditions: [],
      unproven: '',
    },
  ],
  vars: [
    {
      name: '--card-bg',
      syntax: '<color>',
      inherits: false,
      initialValue: '#fff',
      role: 'surface',
    },
  ],
  ...overrides,
});

const rulesOf = (graph: DependencyGraph, waivers = [] as never[]) =>
  Object.fromEntries(
    architectureReport(graph, { waivers })
      .violations.filter((violation) =>
        [
          'style-only-design-system',
          'style-obligations-discharged',
          'no-dangling-css-vars',
          'no-global-stylesheet',
          'architecture-waivers',
        ].includes(violation.rule),
      )
      .map((violation) => [violation.rule, violation.messages]),
  );

describe('style-only-design-system', () => {
  it('fails an element whose class does not reach a sheet', () => {
    const graph = graphOf([
      element('raw', 'Card', {
        unresolvedClass: "'card' is not a constant sheet class.",
      }),
    ]);
    const rules = rulesOf(graph);
    expect(rules['style-only-design-system']?.[0]).toContain(
      "src/card.ts:3: Card › div.raw: 'card' is not a constant sheet class.",
    );
  });

  it('accepts a typed input and a pure composition component', () => {
    const graph = graphOf([
      element('typed', 'Chip', {
        unresolvedClass: 'inputs.tone is not a constant sheet class.',
        classTypedAsSheetClass: true,
      }),
      { id: 'component:Layout', kind: 'component', label: 'Layout' },
    ]);
    expect(rulesOf(graph)).toEqual({});
  });

  it('fails a sheet declared outside a *.style.ts, and one missing from the dump', () => {
    const graph = mergeStyleDump(
      graphOf([
        element('local', 'Card', {
          classKeys: ['local-root'],
          sheetOutsideStyleModule: ['local-root'],
        }),
        element('ok', 'Card', { classKeys: ['card-root'] }),
      ]),
      dump(),
    );
    const messages = rulesOf(graph)['style-only-design-system'] ?? [];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('declared outside a *.style.ts');
    expect(messages[1]).toContain("'local-root' is not in the style dump");
  });

  it('asks for the dump when sheet classes are bound and none is merged', () => {
    const graph = graphOf([
      element('ok', 'Card', { classKeys: ['card-root'] }),
    ]);
    expect(rulesOf(graph)['style-only-design-system']?.[0]).toContain(
      'carries no style dump',
    );
  });
});

describe('style-obligations-discharged and no-dangling-css-vars', () => {
  it('fails an undischarged obligation, an undeclared read and an unread variable', () => {
    const graph = mergeStyleDump(
      graphOf([]),
      dump({
        classes: [
          {
            ...dump().classes[0]!,
            requires: ['scrollPort.block'],
          },
        ],
        atoms: [{ ...dump().atoms[0]!, value: 'var(--nobody-declares)' }],
      }),
    );
    const rules = rulesOf(graph);
    expect(rules['style-obligations-discharged']?.[0]).toContain(
      "'scrollPort.block' is required",
    );
    expect(rules['no-dangling-css-vars']).toEqual([
      expect.stringContaining(
        "'--nobody-declares' is read by a sheet and declared by none",
      ),
      expect.stringContaining("'--card-bg' is declared and read by nothing"),
    ]);
  });

  it('counts a read from a global style', () => {
    const graph = mergeStyleDump(
      graphOf([]),
      dump({
        atoms: [{ ...dump().atoms[0]!, value: 'red' }],
        globalReads: ['--card-bg'],
      }),
    );
    expect(rulesOf(graph)['no-dangling-css-vars']).toBeUndefined();
  });
});

describe('waivers', () => {
  const failing = () =>
    graphOf([
      element('a', 'Card', { unresolvedClass: 'card is raw.' }),
      element('b', 'Markdown', { unresolvedClass: 'markdown is raw.' }),
    ]);

  it('excuses one target, with its reason, and reports it', () => {
    const report = architectureReport(failing(), {
      waivers: [
        {
          rule: 'style-only-design-system',
          target: 'Markdown',
          reason: 'HTML rendered from markdown carries its own classes',
        },
      ],
    });
    expect(
      report.violations.find((v) => v.rule === 'style-only-design-system')
        ?.messages,
    ).toEqual([expect.stringContaining('card is raw.')]);
    expect(report.waived).toEqual([
      expect.objectContaining({
        rule: 'style-only-design-system',
        target: 'Markdown',
        reason: 'HTML rendered from markdown carries its own classes',
      }),
    ]);
  });

  it("waives a whole rule with '*', which goes stale once the rule passes", () => {
    const waiver = {
      rule: 'style-only-design-system' as const,
      target: '*' as const,
      reason: 'TODO(style-only): not migrated yet',
    };
    // Read through the report: on a literal graph, `no-event-only-craft-method`
    // fails on its own for want of a tsconfig to read.
    expect(rulesOf(failing(), [waiver] as never[])).toEqual({});
    expect(
      rulesOf(graphOf([]), [waiver] as never[])['architecture-waivers'],
    ).toEqual([
      expect.stringMatching(/is stale: nothing violates it any more/),
    ]);
  });

  it('types a target against the catalog', () => {
    const catalog = { components: ['Card', 'Markdown'] } as unknown as Omit<
      ArchitectureCatalog,
      'components'
    > & { components: readonly ['Card', 'Markdown'] };
    const waivers = defineArchitectureWaivers(catalog, [
      {
        rule: 'style-only-design-system',
        target: 'Markdown',
        reason: 'vendor',
      },
      { rule: 'no-global-stylesheet', target: 'file:src/main.ts', reason: 'x' },
      // @ts-expect-error — no component of that name in the catalog.
      { rule: 'style-only-design-system', target: 'Nope', reason: 'typo' },
      // @ts-expect-error — not a rule.
      { rule: 'style-only', target: '*', reason: 'typo' },
    ]);
    expect(waivers).toHaveLength(4);
  });

  it('refuses an empty reason and a targeted waiver on a whole-graph rule', () => {
    const rules = rulesOf(failing(), [
      { rule: 'style-only-design-system', target: 'Card', reason: '  ' },
      { rule: 'no-dependency-cycles', target: 'Card', reason: 'why not' },
    ] as never[]);
    expect(rules['architecture-waivers']).toEqual([
      expect.stringContaining("only target '*' can waive it"),
      expect.stringContaining('the reason is empty'),
    ]);
    // The empty-reason waiver excused nothing.
    expect(rules['style-only-design-system']).toHaveLength(2);
  });
});

describe('the source half', () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds meta CSS, component and global .css imports, and stylesheet links', () => {
    root = mkdtempSync(join(tmpdir(), 'craft-style-arch-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ include: ['src/**/*.ts'] }),
    );
    writeFileSync(
      join(root, 'src/main.ts'),
      "import 'virtual:craft-style.css';\nimport './styles.css';\n",
    );
    writeFileSync(
      join(root, 'src/card.ts'),
      "import './card.css';\nexport const Card = craftComponent('Card', { styles: '.x{}' }, () => null);\n",
    );
    writeFileSync(
      join(root, 'index.html'),
      '<head><link rel="stylesheet" href="/legacy.css"><link rel="icon" href="/f.ico"></head>',
    );
    const graph = {
      ...graphOf([]),
      rootDir: root,
      tsConfigFilePath: join(root, 'tsconfig.json'),
    };
    const rules = rulesOf(graph);
    expect(rules['style-only-design-system']).toEqual([
      expect.stringContaining('Card: meta.styles carries CSS text'),
      expect.stringContaining("Card: imports './card.css'"),
    ]);
    expect(rules['no-global-stylesheet']).toEqual([
      expect.stringContaining("src/main.ts:2: imports './styles.css'"),
      expect.stringContaining(
        'index.html: <link rel="stylesheet" href="/legacy.css">',
      ),
    ]);
  });

  it('reads the declared waivers statically', () => {
    root = mkdtempSync(join(tmpdir(), 'craft-waivers-'));
    mkdirSync(join(root, 'architecture'));
    writeFileSync(
      join(root, 'architecture/waivers.ts'),
      `import { defineArchitectureWaivers } from '@craft-ts/dev-tools';
import { architectureCatalog } from './catalog';

export const waivers = defineArchitectureWaivers(architectureCatalog, [
  {
    rule: 'style-only-design-system',
    target: 'Markdown',
    reason: 'HTML rendered from markdown carries its own classes',
  },
]);
`,
    );
    expect(architectureWaivers(root)).toEqual([
      expect.objectContaining({
        rule: 'style-only-design-system',
        target: 'Markdown',
        reason: 'HTML rendered from markdown carries its own classes',
        line: 5,
      }),
    ]);
  });
});
