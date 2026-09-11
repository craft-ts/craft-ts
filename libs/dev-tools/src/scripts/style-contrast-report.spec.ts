/**
 * What `craft-graph --style-contrast` actually decides.
 *
 * The bin is a thin wrapper over these three functions, which is why they are
 * here and not in it: the exit-code policy is the part of the tool that has to
 * be right, and a policy that can only be exercised by spawning a process is a
 * policy nobody covers.
 *
 * The end-to-end case at the bottom runs both producers together — the AST
 * pass over a real TypeScript fixture, then the solver over the merge. It is
 * slower than the unit cases and it is the only one that would catch the two
 * halves drifting apart on the shape of an id.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from './dependency-graph.ts';
import { mergeStyleDump, type StyleDump } from './style-graph.ts';
import {
  analyzeTextContrast,
  formatTextContrastReport,
  textContrastExitCode,
  textContrastReport,
  type TextContrastResult,
} from './style-contrast.ts';

const scenario = { id: 'base', axes: {} };

const passing: TextContrastResult = {
  kind: 'resolved',
  component: 'Card',
  element: 'p.body',
  scenario,
  equivalentScenarios: [],
  foreground: { value: '#111318', source: 'card-body' },
  background: { value: '#ffffff', source: 'card-root' },
  fontSizePx: 16,
  fontWeight: 400,
  textScale: 'normal',
  ratio: 17.4,
  required: 4.5,
  verdict: 'pass',
};

const failing: TextContrastResult = {
  ...passing,
  element: 'p.muted',
  ratio: 3.91,
  verdict: 'fail',
};

const unknown: TextContrastResult = {
  kind: 'indeterminate',
  component: 'Hero',
  element: 'h1.title',
  scenario,
  equivalentScenarios: [],
  reason: 'unsupported-background',
  detail: 'the hero paints a gradient',
};

describe('the exit-code policy', () => {
  it('passes a clean run', () => {
    expect(textContrastExitCode(textContrastReport([passing]))).toBe(0);
  });

  it('fails on a violation', () => {
    expect(textContrastExitCode(textContrastReport([passing, failing]))).toBe(1);
  });

  it('fails on an unproven result by default', () => {
    // The default has to be this way round. A tool that treats "I could not
    // tell" as "fine" reports a clean bill on the half of the application it
    // understood, and the half it did not is exactly where the gradients and
    // the runtime colours are.
    expect(textContrastExitCode(textContrastReport([passing, unknown]))).toBe(1);
  });

  it('downgrades unproven results only when asked in so many words', () => {
    const report = textContrastReport([passing, unknown], {
      allowIndeterminate: true,
    });
    expect(report.policy.indeterminate).toBe('warning');
    expect(textContrastExitCode(report)).toBe(0);
  });

  it('still fails on a violation when indeterminates are allowed', () => {
    expect(
      textContrastExitCode(
        textContrastReport([failing, unknown], { allowIndeterminate: true }),
      ),
    ).toBe(1);
  });
});

describe('what the report says', () => {
  it('leads with the counts, then the violations, then the unknowns', () => {
    const text = formatTextContrastReport(
      textContrastReport([passing, failing, unknown]),
    );
    expect(text.split('\n')[0]).toBe(
      'Text contrast: 1 pass, 1 fail, 1 indeterminate (3 checked).',
    );
    expect(text.indexOf('contrast/fail')).toBeLessThan(
      text.indexOf('contrast/indeterminate'),
    );
  });

  it('names the source of both colours and the render context', () => {
    const text = formatTextContrastReport(textContrastReport([failing]));
    expect(text).toContain('component: Card');
    expect(text).toContain('element: p.muted');
    expect(text).toContain('foreground: #111318 (card-body)');
    expect(text).toContain('background: #ffffff (card-root)');
    expect(text).toContain('ratio: 3.91:1');
    expect(text).toContain('required: 4.5:1');
  });

  it('says that no violations plus open unknowns is not a proof', () => {
    const text = formatTextContrastReport(
      textContrastReport([passing, unknown], { allowIndeterminate: true }),
    );
    expect(text).toContain('is not a proof of accessibility');
  });

  it('refuses to call an empty run a success', () => {
    // Zero checked is nearly always a wiring problem — the dump and the
    // program describing different applications, most often.
    expect(formatTextContrastReport(textContrastReport([]))).toContain(
      'Nothing was checked',
    );
  });
});

/* ------------------------------------------------------------------------ *
 * Both producers, on a real program
 * ------------------------------------------------------------------------ */

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
declare function p(...args: unknown[]): unknown;
export {};
`;

const APP = `
const card = craftStyles('dsCard', { root: [], body: [] });

export const Card = craftComponent('Card', {}, () => ({}), () =>
  div('card', { class: card.root }, p('body', { class: card.body }, 'Readable?')),
);
`;

const DUMP: StyleDump = {
  version: 2,
  classes: [
    {
      key: 'dsCard-root',
      className: 'bg',
      axes: {},
      atoms: ['bg'],
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
    },
    {
      key: 'dsCard-body',
      className: 'ink size weight',
      axes: {},
      atoms: ['ink', 'size', 'weight'],
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
    },
  ],
  atoms: [
    { className: 'bg', property: 'background-color', value: '#ffffff', conditions: [], unproven: '' },
    { className: 'ink', property: 'color', value: '#bbbbbb', conditions: [], unproven: '' },
    { className: 'size', property: 'font-size', value: '0.875rem', conditions: [], unproven: '' },
    { className: 'weight', property: 'font-weight', value: '400', conditions: [], unproven: '' },
  ],
  vars: [],
};

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-contrast-cli-'));
  temporaryDirectories.push(root);
  await Promise.all([
    writeFile(
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
    ),
    writeFile(join(root, 'stubs.ts'), STUBS, 'utf8'),
    writeFile(join(root, 'app.ts'), APP, 'utf8'),
  ]);
  return root;
}

const run = (rootDir: string) => {
  const graph = mergeStyleDump(
    analyzeDependencyGraph({ rootDir, tsConfigFilePath: 'tsconfig.json' }),
    DUMP,
  );
  return textContrastReport(analyzeTextContrast(graph, DUMP));
};

describe('the two producers, end to end', () => {
  it('finds the failing paragraph through the real graph', async () => {
    const report = run(await project());
    expect(report.summary).toMatchObject({ fail: 1, pass: 0 });
    const failure = report.results[0];
    expect(failure).toMatchObject({
      kind: 'resolved',
      component: 'Card',
      element: 'p.body',
      verdict: 'fail',
      // 14px at weight 400 earns no discount: 4.5:1, and #bbbbbb on white is
      // 1.92:1. The background came from the card, one level up.
      required: 4.5,
      fontSizePx: 14,
    });
    expect(textContrastExitCode(report)).toBe(1);
  });

  it('produces byte-identical JSON on two runs of the same sources', async () => {
    // The determinism the plan asks for, measured rather than asserted: the
    // AST pass, the scenario enumeration and the deduplication all have to be
    // order-stable, and any one of them slipping shows up here.
    const root = await project();
    expect(JSON.stringify(run(root), null, 2)).toBe(
      JSON.stringify(run(root), null, 2),
    );
  });
});
