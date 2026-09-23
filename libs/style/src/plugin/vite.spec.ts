/**
 * The end-to-end emission: real style modules, bundled in Node, CSS out.
 *
 * This is the only spec that runs the bundler, and the only one that proves the
 * property the whole approach rests on — that the class names computed while
 * emitting are the same ones the browser will see, without the two sides
 * sharing any state.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  craftStyle,
  emitStyles,
  findStyleModules,
  loadStyleDump,
} from './vite.ts';

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
      '@layer craft.reset, craft.base, craft.tokens, craft.global, craft.components, craft.variants, craft.overrides;',
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

  it('ships the reset and the base by default, and lets an app opt out', async () => {
    const files = await findStyleModules(root);
    const shipped = await emitStyles(files, alias);
    expect(shipped.css).toContain('@layer craft.reset{');
    expect(shipped.css).toContain('@layer craft.base{');
    expect(shipped.css).toContain('@property --craft-focusRing');

    const bare = await emitStyles(files, alias, { reset: false, base: false });
    expect(bare.css).not.toContain('@layer craft.reset{');
    expect(bare.css).not.toContain('@layer craft.base{');
    expect(bare.css).not.toContain('--craft-focusRing');
  }, 60_000);

  it('loads a project dump for the architecture graph, without a server', async () => {
    const dump = await loadStyleDump(root, { alias });
    expect(dump.classes.map((entry) => entry.key)).toContain('badge-root');
    // The foundation's variables are listed, so a sheet reading one does not
    // look like it reads an undeclared variable.
    expect(dump.vars.map((entry) => entry.name)).toContain('--craft-focusRing');
    // …and what the foundation itself reads counts as a read.
    expect(dump.globalReads).toContain('--craft-focusRing');

    // A project with no sheet yet has an empty dump, not a build error.
    const bare = await mkdtemp(join(tmpdir(), 'craft-style-empty-'));
    try {
      expect(await loadStyleDump(bare, { alias })).toEqual({
        version: 2,
        classes: [],
        atoms: [],
        vars: [],
        globalReads: [],
      });
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  }, 60_000);

  it('serves the font head tags to the HTML and to a server renderer', async () => {
    const plugin = craftStyle({ alias });
    plugin.configResolved?.({ root });

    // The example declares no font: nothing to inject, and a valid module.
    expect(await plugin.transformIndexHtml?.()).toEqual([]);
    const id = plugin.resolveId?.('virtual:craft-style-head');
    expect(await plugin.load?.(id ?? '')).toBe('export default "";\n');
  }, 60_000);

  it('serves the sheet as CSS to a server renderer that links it with ?direct', async () => {
    const plugin = craftStyle({ alias });
    plugin.configResolved?.({ root });

    const id = plugin.resolveId?.('virtual:craft-style.css?direct');
    expect(id).toBe('\0virtual:craft-style.css?direct');
    expect(await plugin.load?.(id ?? '')).toContain('@layer craft.reset');
  }, 60_000);
});

describe('the plugin refreshes the virtual sheet during development', () => {
  it('requests a full reload when a style module changes', () => {
    const plugin = craftStyle();
    const messages: unknown[] = [];

    plugin.handleHotUpdate?.({
      file: join(root, 'back-to-top.style.ts'),
      server: {
        ws: {
          send(message) {
            messages.push(message);
          },
        },
      },
    });

    expect(messages).toEqual([{ type: 'full-reload', path: '*' }]);
  });

  it('ignores non-style module changes', () => {
    const plugin = craftStyle();
    const messages: unknown[] = [];

    plugin.handleHotUpdate?.({
      file: join(root, 'back-to-top.ts'),
      server: {
        ws: {
          send(message) {
            messages.push(message);
          },
        },
      },
    });

    expect(messages).toEqual([]);
  });
});
