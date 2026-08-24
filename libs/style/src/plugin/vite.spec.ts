/**
 * The end-to-end emission: real style modules, bundled in Node, CSS out.
 *
 * This is the only spec that runs the bundler, and the only one that proves the
 * property the whole approach rests on — that the class names computed while
 * emitting are the same ones the browser will see, without the two sides
 * sharing any state.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitStyles, findStyleModules } from './vite';

const root = join(process.cwd(), 'libs/style/example');
const alias = {
  '@craft-ts/style': join(process.cwd(), 'libs/style/src/index.ts'),
  '@craft-ts/core': join(process.cwd(), 'libs/core/src/index.ts'),
};

describe('the plugin evaluates the style modules and emits the sheet', () => {
  it('finds the style modules and nothing else', async () => {
    const files = await findStyleModules(root);

    expect(files.map((file) => file.split('/').pop())).toEqual([
      'back-to-top.style.ts',
      'badge.style.ts',
    ]);
  });

  it('emits one stylesheet for all of them, deduplicated', async () => {
    const files = await findStyleModules(root);
    const { css, dump } = await emitStyles(files, alias);

    expect(css).toContain(
      '@layer reset, tokens, components, variants, overrides;',
    );
    expect(css).toContain('@property --badge-ink');
    // The discharge wrote its overflow — the only path there is.
    expect(css).toContain('overflow-block:auto');
    expect(dump.classes.map((entry) => entry.key)).toEqual([
      'appShell-main',
      'backToTop-button',
      'badge-dot',
      'badge-root',
    ]);
    expect(
      dump.classes.find((entry) => entry.key === 'appShell-main')?.provides,
    ).toEqual(['scrollPort.block', 'containerType.scrollState']);
    expect(
      dump.classes.find((entry) => entry.key === 'backToTop-button')?.requires,
    ).toEqual(['scrollPort.block']);
  }, 60_000);

  it('emits the same bytes twice', async () => {
    const files = await findStyleModules(root);
    const first = await emitStyles(files, alias);
    const second = await emitStyles(files, alias);

    expect(first.css).toBe(second.css);
  }, 60_000);
});
