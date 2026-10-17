import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootScript } from '@craft-ts/ui';

/**
 * `index.html` cannot import anything: the design system's boot script — the lines
 * that write `data-mode` and `data-season` before the first paint — is inlined in
 * it. This keeps the inlined text the library's own, so a change to the script (a
 * storage key, a season boundary) cannot leave the page behind.
 */
describe('the page boots the design system', () => {
  it('inlines the library boot script, unchanged', () => {
    const html = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain(`<script>${bootScript()}</script>`);
  });
});
