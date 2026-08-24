import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const boundaryRule = require('./style-file-boundary.cjs');
const rawValueRule = require('./no-raw-css-value.cjs');

describe('style-file-boundary', () => {
  it('allows the style vocabulary', async () => {
    const result = await lint(
      boundaryRule,
      `
      import { craftStyles, p, space } from '@craft-ts/style';
      export const sheet = craftStyles('badge', { root: [p(space(4))] });
    `,
      'badge.style.ts',
    );

    expect(result.messages).toEqual([]);
  });

  it('allows splitting a design system across style files', async () => {
    const result = await lint(
      boundaryRule,
      `
      import { bp } from './breakpoints.style';
      export const used = bp;
    `,
      'badge.style.ts',
    );

    expect(result.messages).toEqual([]);
  });

  it('refuses an application import, including a transitive one', async () => {
    const result = await lint(
      boundaryRule,
      `
      import { craftStyles } from '@craft-ts/style';
      import { CartService } from '../app/cart.service';
      export const sheet = craftStyles('cart', {});
    `,
      'cart.style.ts',
    );

    expect(result.messages).toHaveLength(1);
    // The message has to say where to put the thing instead, or it just moves
    // the problem to the next file.
    expect(result.messages[0].message).toContain('another *.style.ts');
  });

  it('leaves ordinary files alone', async () => {
    const result = await lint(
      boundaryRule,
      `import { CartService } from '../app/cart.service';\nexport const s = CartService;`,
      'cart.component.ts',
    );

    expect(result.messages).toEqual([]);
  });
});

describe('no-raw-css-value', () => {
  it('accepts design-system values', async () => {
    const result = await lint(
      rawValueRule,
      `
      import { bg, p, palette, space } from '@craft-ts/style';
      export const rules = [p(space(4)), bg(palette.surface.raised)];
    `,
      'badge.style.ts',
    );

    expect(result.messages).toEqual([]);
  });

  it('names the exact replacement for a raw length', async () => {
    const result = await lint(
      rawValueRule,
      `
      import { p } from '@craft-ts/style';
      export const rules = [p('12px')];
    `,
      'badge.style.ts',
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('space(4)');
    // The marked way out is named too: an agent that cannot find one invents a
    // way round the design system instead.
    expect(result.messages[0].message).toContain('unsafeLength');
  });

  it('names the palette for a raw colour', async () => {
    const result = await lint(
      rawValueRule,
      `
      import { bg } from '@craft-ts/style';
      export const rules = [bg('#ff0000')];
    `,
      'badge.style.ts',
    );

    expect(result.messages[0].message).toContain('palette.surface.raised');
  });

  it('routes a CSS-wide keyword to its token', async () => {
    const result = await lint(
      rawValueRule,
      `
      import { color } from '@craft-ts/style';
      export const rules = [color('inherit')];
    `,
      'badge.style.ts',
    );

    expect(result.messages[0].message).toContain('global.inherit');
  });

  it('leaves the helpers whose argument is a name, not a value', async () => {
    const result = await lint(
      rawValueRule,
      `
      import { craftStyles, cssVars, unsafeLength } from '@craft-ts/style';
      export const v = cssVars('badge', {});
      export const sheet = craftStyles('badge', {});
      export const escape = unsafeLength('13px', 'legacy image');
    `,
      'badge.style.ts',
    );

    expect(result.messages).toEqual([]);
  });

  it('ignores helpers that did not come from the style package', async () => {
    const result = await lint(
      rawValueRule,
      `
      import { p } from './local-helpers';
      export const rules = [p('12px')];
    `,
      'badge.style.ts',
    );

    expect(result.messages).toEqual([]);
  });
});

async function lint(rule: unknown, code: string, filename: string) {
  const root = await mkdtemp(join(tmpdir(), 'craft-style-rules-'));
  try {
    await writeFile(join(root, filename), code);
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tsParser as unknown as Linter.Parser,
            parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
          },
          plugins: { local: { rules: { localRule: rule as never } } },
          rules: { 'local/localRule': 'error' },
        },
      ],
    });
    const [result] = await eslint.lintFiles([filename]);
    return result;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
