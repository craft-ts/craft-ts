import { describe, expect, it } from 'vitest';

// #region emit
import { emitStyles } from '@craft-ts/style/vite';

// The same two artefacts the plugin produces, without a Vite server: `css` is
// what the browser gets, `dump` is what the graph and the MCP tools read.
export const emitOnce = () =>
  emitStyles(['src/app/ui/button.style.ts', 'src/app/ui/foundation.style.ts']);
// #endregion emit

describe('guide/style/setup.md #emit', () => {
  it('exposes the emitter outside the plugin', () => {
    expect(typeof emitStyles).toBe('function');
    expect(typeof emitOnce).toBe('function');
  });
});
