/**
 * The element-by-element half of the style graph.
 *
 * What is measured here is the shape the contrast proof needs and the old
 * component→class relation could not express: which element carries which
 * class, which element sits inside which, which of them can actually hold
 * text, and which pairs of them can never be on screen together.
 *
 * The `template-element` kind is asserted to be untouched in the same file on
 * purpose. Widening it instead of adding a kind beside it would have been the
 * obvious implementation, and it would have silently renumbered every id the
 * a11y rules and the attestation baselines key on.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from './dependency-graph.ts';
import { mergeStyleDump, type StyleDump } from './style-graph.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const STUBS = `
declare function craftComponent(...args: unknown[]): unknown;
declare function craftStyles<T>(prefix: string, sheet: T): { [K in keyof T]: string };
declare function div(...args: unknown[]): unknown;
declare function span(...args: unknown[]): unknown;
declare function p(...args: unknown[]): unknown;
declare function button(...args: unknown[]): unknown;
declare function ifNode(...args: unknown[]): unknown;
declare function forNode(...args: unknown[]): unknown;
declare const label: string;
declare const open: () => boolean;
export {};
`;

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-styled-elements-'));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['./**/*.ts'],
    }),
    'utf8',
  );
  await Promise.all([
    writeFile(join(root, 'stubs.ts'), STUBS, 'utf8'),
    ...Object.entries(files).map(([path, contents]) =>
      writeFile(join(root, path), contents, 'utf8'),
    ),
  ]);
  return root;
}

const analyse = (rootDir: string) =>
  analyzeDependencyGraph({ rootDir, tsConfigFilePath: 'tsconfig.json' });

type Graph = ReturnType<typeof analyse>;

const elements = (graph: Graph) =>
  graph.nodes.filter((node) => node.kind === 'styled-element');

const elementByLabel = (graph: Graph, label: string) => {
  const found = elements(graph).filter((node) => node.label === label);
  expect(found, `no unique styled element labelled '${label}'`).toHaveLength(1);
  return found[0]!;
};

const CARD = `
const card = craftStyles('dsCard', {
  root: [],
  title: [],
  body: [],
});

export const Card = craftComponent(
  'Card',
  {},
  () => ({}),
  () =>
    div('card', { class: card.root }, [
      p('title', { class: card.title }, 'Account settings'),
      p('body', { class: card.body }, label),
    ]),
);
`;

describe('one node per element, with its class', () => {
  it('records every hyperscript call, not only the interactive ones', async () => {
    const graph = analyse(await fixture({ 'card.ts': CARD }));
    expect(elements(graph).map((node) => node.label).sort()).toEqual([
      'div.card',
      'p.body',
      'p.title',
    ]);
    // The interactive family is untouched: nothing here is interactive.
    expect(graph.nodes.filter((node) => node.kind === 'template-element'))
      .toHaveLength(0);
  });

  it('resolves card.body to the key the sheet registered', async () => {
    const graph = analyse(await fixture({ 'card.ts': CARD }));
    const body = elementByLabel(graph, 'p.body');
    expect(body.details?.['classKeys']).toEqual(['dsCard-body']);
    expect(
      graph.edges.some(
        (edge) =>
          edge.from === body.id &&
          edge.kind === 'styled-by' &&
          edge.to === 'style-class:dsCard-body',
      ),
    ).toBe(true);
  });

  it('links each element to the one that renders it', async () => {
    const graph = analyse(await fixture({ 'card.ts': CARD }));
    const root = elementByLabel(graph, 'div.card');
    const body = elementByLabel(graph, 'p.body');
    expect(
      graph.edges.some(
        (edge) =>
          edge.from === root.id && edge.kind === 'contains' && edge.to === body.id,
      ),
    ).toBe(true);
  });

  it('separates two elements of the same tag rather than merging them', async () => {
    // `p.title` and `p.body` differ by name; two anonymous divs must still get
    // two nodes, or the tree collapses and the background walk is wrong.
    const graph = analyse(
      await fixture({
        'two.ts': `
const sheet = craftStyles('two', { a: [], b: [] });
export const Two = craftComponent('Two', {}, () => ({}), () =>
  div({ class: sheet.a }, div({ class: sheet.b }, 'text')),
);
`,
      }),
    );
    expect(elements(graph)).toHaveLength(2);
    expect(
      new Set(elements(graph).map((node) => node.id)).size,
    ).toBe(2);
  });
});

describe('which elements can hold text', () => {
  it('marks static text, dynamic text, and structure apart', async () => {
    const graph = analyse(await fixture({ 'card.ts': CARD }));
    expect(elementByLabel(graph, 'p.title').details?.['textKind']).toBe(
      'static',
    );
    expect(elementByLabel(graph, 'p.body').details?.['textKind']).toBe(
      'dynamic',
    );
    // The card holds two paragraphs and no text of its own: checking its own
    // colour against its own background would report a failure nobody sees.
    expect(elementByLabel(graph, 'div.card').details?.['mayContainText']).toBe(
      false,
    );
  });
});

describe('branches', () => {
  it('records the arm each element sits in, and the two arms differ', async () => {
    const graph = analyse(
      await fixture({
        'toggle.ts': `
const sheet = craftStyles('toggle', { on: [], off: [] });
export const Toggle = craftComponent('Toggle', {}, () => ({}), () =>
  div({}, ifNode(open, () => span('on', { class: sheet.on }, 'on'),
                       () => span('off', { class: sheet.off }, 'off'))),
);
`,
      }),
    );
    const on = elementByLabel(graph, 'span.on');
    const off = elementByLabel(graph, 'span.off');
    expect(on.details?.['branch']).toBe('if:open=true');
    expect(off.details?.['branch']).toBe('if:open=false');
    // Same decision, opposite sides: the two can never be on screen together,
    // and the solver must not cross one's styles with the other's.
    expect(on.details?.['branch']).not.toBe(off.details?.['branch']);
  });

  it('walks into a loop body without claiming exclusivity there', async () => {
    const graph = analyse(
      await fixture({
        'list.ts': `
const sheet = craftStyles('list', { item: [] });
export const List = craftComponent('List', {}, () => ({}), () =>
  div({}, forNode(open, () => span('item', { class: sheet.item }, label))),
);
`,
      }),
    );
    // A repeated element is co-present with itself; a branch path here would
    // be a claim of exclusivity the graph cannot make.
    expect(elementByLabel(graph, 'span.item').details?.['branch']).toBe('');
  });
});

describe('what the pass cannot prove', () => {
  it('reports a computed class instead of dropping it', async () => {
    const graph = analyse(
      await fixture({
        'dynamic.ts': `
declare const tone: string;
export const Dynamic = craftComponent('Dynamic', {}, () => ({}), () =>
  div({ class: 'btn ' + tone }, label),
);
`,
      }),
    );
    expect(
      graph.diagnostics?.some(
        (diagnostic) => diagnostic.code === 'styled-element-class-unresolved',
      ),
    ).toBe(true);
    expect(
      elementByLabel(graph, 'div').details?.['unresolvedClass'],
    ).toContain('not a constant sheet class');
  });
});

describe('the two halves meet', () => {
  it('derives component usage from the elements, with no usedBy given', async () => {
    const graph = analyse(await fixture({ 'card.ts': CARD }));
    const dump: StyleDump = {
      version: 2,
      classes: ['dsCard-root', 'dsCard-title', 'dsCard-body'].map((key) => ({
        key,
        className: key,
        axes: {},
        atoms: [],
        unproven: [],
        requires: [],
        provides: [],
        violates: [],
      })),
      atoms: [],
      vars: [],
    };
    const merged = mergeStyleDump(graph, dump);
    const component = merged.nodes.find((node) => node.kind === 'component');
    expect(
      merged.edges.filter(
        (edge) => edge.from === component?.id && edge.kind === 'styled-by',
      ),
    ).toHaveLength(3);
    // And therefore no "nobody styles this component" gap, which the merge
    // used to report for every component until a caller listed it by hand.
    expect(
      merged.diagnostics?.filter(
        (diagnostic) => diagnostic.code === 'component-without-style-class',
      ),
    ).toEqual([]);
  });
});
