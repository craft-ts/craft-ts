import { describe, expect, it } from 'vitest';

// #region plugin
import { defineConfig } from 'vite';
import { craftStyle } from '@craft-ts/style/vite';

export default defineConfig({
  plugins: [
    craftStyle({
      // Written on every emission, so the graph never reads a picture of the
      // sheet that is older than the CSS the browser got.
      dumpPath: 'tmp/craft-style-graph.json',
    }),
  ],
});
// #endregion plugin

describe('guide/style/setup.md', () => {
  it('builds a config with the craftStyle plugin', () => {
    expect(craftStyle().name).toBe('craft-style');
  });

  it('serves the sheet under one virtual module id', () => {
    expect(craftStyle().resolveId?.('virtual:craft-style.css')).toBeDefined();
  });
});
