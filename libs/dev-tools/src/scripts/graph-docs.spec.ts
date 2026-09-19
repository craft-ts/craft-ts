import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertNodesDocumented,
  graphHash,
  undocumentedNodeViolations,
} from './architecture-graph';
import {
  analyzeDependencyGraph,
  type DependencyGraph,
} from './dependency-graph';
import {
  createMarkdownDocsCollector,
  DOC_AMBIGUOUS_DIAGNOSTIC,
  rationaleComments,
} from './graph-docs';
import { graphReport } from './graph-report';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const STUBS = `declare function craftComponent(...args: unknown[]): unknown;
declare function state(...args: unknown[]): unknown;
declare function craftComputed(...args: unknown[]): unknown;
declare function div(...args: unknown[]): unknown;
declare function span(...args: unknown[]): unknown;
`;

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-graph-docs-'));
  temporaryDirectories.push(root);
  const files: Record<string, string> = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['./**/*.ts'],
    }),
    'orders.ts': `${STUBS}
/**
 * Lists the open orders.
 *
 * A longer explanation that is not the summary.
 * @deprecated Use OrdersBoard.
 * @see OrdersBoard
 */
export const Orders = craftComponent('Orders', {}, function* () {
  // WHY: kept local so the URL stays clean.
  /** Filter typed by the user. */
  const filter = yield* state('filter', '');
  // NOTE: recomputed on every keystroke.
  const visible = craftComputed('visible', function* () {
    return (yield* filter()) !== '';
  });
  return div([span('orders')]);
});
`,
    'card-a.ts': `${STUBS}
export const CardA = craftComponent('Card', {}, function* () {
  return div([span('a')]);
});
`,
    'card-b.ts': `${STUBS}
export const CardB = craftComponent('Card', {}, function* () {
  return div([span('b')]);
});
`,
    'docs/orders.md': [
      '# Orders page',
      '',
      'The `Orders` component lists orders, next to a `Card`.',
      '',
      '```ts',
      'const example = `Orders`;',
      '```',
      '',
    ].join('\n'),
    'notes/ignored.md': 'Mentions `Orders` outside the included folder.\n',
  };
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), contents, 'utf8');
    }),
  );
  return root;
}

const byLabel = (graph: DependencyGraph, label: string) =>
  graph.nodes.filter((node) => node.label === label);

describe('node documentation', () => {
  it('reads JSDoc and credits justification comments to the innermost node', async () => {
    const graph = analyzeDependencyGraph({
      rootDir: await fixture(),
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(byLabel(graph, 'Orders')[0]?.doc).toEqual({
      summary: 'Lists the open orders.',
      tags: { deprecated: ['Use OrdersBoard.'], see: ['OrdersBoard'] },
    });
    expect(byLabel(graph, 'state:filter')[0]?.doc).toEqual({
      summary: 'Filter typed by the user.',
      rationale: ['WHY: kept local so the URL stays clean.'],
    });
    expect(byLabel(graph, 'craftComputed:visible')[0]?.doc).toEqual({
      rationale: ['NOTE: recomputed on every keystroke.'],
    });
    expect(byLabel(graph, 'Card').map((node) => node.doc)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('ignores ordinary comments and comment-like strings', () => {
    const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
      'notes.ts',
      [
        '// plain comment',
        "const text = '// WHY: not a comment';",
        '/* HACK: block',
        ' * continues here */',
        'export const value = text;',
        '// NOTE: at the end of the file',
      ].join('\n'),
    );

    expect(rationaleComments(file).map((comment) => comment.text)).toEqual([
      'HACK: block continues here',
      'NOTE: at the end of the file',
    ]);
  });

  it('does not change graphHash', async () => {
    const graph = analyzeDependencyGraph({
      rootDir: await fixture(),
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(graphHash(graph)).toBe(
      graphHash({
        ...graph,
        nodes: graph.nodes.map(({ doc: _doc, ...node }) => node),
      }),
    );
  });
});

describe('Markdown documentation collector', () => {
  async function documentedGraph() {
    return analyzeDependencyGraph({
      rootDir: await fixture(),
      tsConfigFilePath: 'tsconfig.json',
      collectors: [createMarkdownDocsCollector({ include: ['docs/**/*.md'] })],
    });
  }

  it('links a page to the node it cites and reports ambiguous names', async () => {
    const graph = await documentedGraph();
    const page = graph.nodes.find((node) => node.kind === 'doc-page');
    const orders = byLabel(graph, 'Orders')[0];

    expect(graph.nodes.filter((node) => node.kind === 'doc-page')).toHaveLength(
      1,
    );
    expect(page).toMatchObject({ label: 'Orders page', line: 1 });
    expect(graph.edges.filter((edge) => edge.kind === 'documents')).toEqual([
      expect.objectContaining({
        from: page?.id,
        to: orders?.id,
        proof: expect.objectContaining({ line: 3, pattern: '`Orders`' }),
      }),
    ]);
    expect(graph.diagnostics).toContainEqual(
      expect.objectContaining({
        // The collector contract namespaces diagnostic codes by collector name.
        code: `markdown-docs/${DOC_AMBIGUOUS_DIAGNOSTIC}`,
        message:
          'docs/orders.md:3 cites `Card`, which names 2 nodes (component): no relation drawn.',
      }),
    );
    expect(
      graph.diagnostics?.some((diagnostic) =>
        diagnostic.message.includes('doc-page'),
      ),
    ).toBe(false);
  });

  it('reports undocumented nodes, unless allowed', async () => {
    const graph = await documentedGraph();
    const options = { kinds: ['component'] as const, requireDocPage: true };

    expect(
      undocumentedNodeViolations(graph, options)
        .map((violation) => `${violation.label}:${violation.missing}`)
        .sort(),
    ).toEqual(['Card:doc-page', 'Card:doc-page', 'Card:jsdoc', 'Card:jsdoc']);
    expect(() => assertNodesDocumented(graph, options)).toThrow(
      'Undocumented component Card: no JSDoc summary (card-a.ts:7).',
    );
    expect(
      undocumentedNodeViolations(graph, { ...options, allow: ['card-*.ts'] }),
    ).toEqual([]);
  });

  it('summarises documentation in the report', async () => {
    const report = graphReport(await documentedGraph());

    expect(report.documentation).toContainEqual({
      kind: 'component',
      nodes: 3,
      measured: 3,
      withJsDoc: 1,
      withDocPage: 1,
    });
  });
});
