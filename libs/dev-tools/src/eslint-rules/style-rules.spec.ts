import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

  it('allows the same split when the import spells the extension out', async () => {
    const result = await lint(
      boundaryRule,
      `
      import { bp } from './breakpoints.style.ts';
      export const used = bp;
    `,
      'badge.style.ts',
    );

    expect(result.messages).toEqual([]);
  });

  describe('NodeNext imports (`./tokens.style.js`)', () => {
    const card = `
      import { gap } from './tokens.style.js';
      export const used = gap;
    `;

    it('allows the .js specifier when a typed tokens.style.ts sits beside it', async () => {
      const result = await lintProject(boundaryRule, {
        'card.style.ts': card,
        'tokens.style.ts': 'export const gap = 1;',
      });

      expect(result.messages).toEqual([]);
    });

    it('allows the .js specifier when tokens.style.d.ts declares it', async () => {
      const result = await lintProject(boundaryRule, {
        'card.style.ts': card,
        'tokens.style.js': 'export const gap = 1;',
        'tokens.style.d.ts': 'export declare const gap: number;',
      });

      expect(result.messages).toEqual([]);
    });

    it('applies the same substitution to .mjs and re-exports', async () => {
      const result = await lintProject(boundaryRule, {
        'card.style.ts': `
          export { gap } from './tokens.style.mjs';
          export const load = () => import('./other.style.js');
        `,
        'tokens.style.mts': 'export const gap = 1;',
        'other.style.ts': 'export const gap = 1;',
      });

      expect(result.messages).toEqual([]);
    });

    it('refuses a .js specifier that only reaches a plain JavaScript file', async () => {
      const result = await lintProject(boundaryRule, {
        'card.style.ts': card,
        'tokens.style.js': 'export const gap = 1;',
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].message).toContain('./tokens.style.js');
      expect(result.messages[0].message).toContain('tokens.style.ts');
      expect(result.messages[0].message).toContain('tokens.style.d.ts');
      expect(result.messages[0].message).toContain('CraftTS token types');
    });

    it('refuses a .js specifier that resolves to nothing', async () => {
      const result = await lintProject(boundaryRule, { 'card.style.ts': card });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].message).toContain('resolves to no file');
    });

    it('does not accept a .js file named like a style file but outside the stem', async () => {
      const result = await lintProject(boundaryRule, {
        'card.style.ts': `
          import { gap } from './tokens.js';
          export const used = gap;
        `,
        'tokens.ts': 'export const gap = 1;',
      });

      expect(result.messages).toHaveLength(1);
    });

    describe('with a typed program (NodeNext)', () => {
      it('accepts the .js specifier TypeScript resolves to tokens.style.ts', async () => {
        const result = await lintProject(
          boundaryRule,
          {
            'card.style.ts': card,
            'tokens.style.ts': 'export const gap = 1;',
          },
          { typed: true },
        );

        expect(result.messages).toEqual([]);
      });

      it('accepts the .js specifier TypeScript resolves to tokens.style.d.ts', async () => {
        const result = await lintProject(
          boundaryRule,
          {
            'card.style.ts': card,
            'tokens.style.js': 'export const gap = 1;',
            'tokens.style.d.ts': 'export declare const gap: number;',
          },
          { typed: true },
        );

        expect(result.messages).toEqual([]);
      });

      it('refuses the .js specifier when TypeScript reads the plain JavaScript file', async () => {
        const result = await lintProject(
          boundaryRule,
          {
            'card.style.ts': card,
            'tokens.style.js': 'export const gap = 1;',
          },
          { typed: true, allowJs: true },
        );

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].message).toContain('tokens.style.js');
        expect(result.messages[0].message).toContain('CraftTS token types');
      });

      it('refuses the .js specifier when TypeScript resolves it to nothing', async () => {
        const result = await lintProject(
          boundaryRule,
          { 'card.style.ts': card },
          { typed: true },
        );

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].message).toContain('resolves to no file');
      });

      it('follows the program, not the sibling name: a paths mapping to a declaration is accepted', async () => {
        const result = await lintProject(
          boundaryRule,
          {
            'card.style.ts': `
              import { gap } from './tokens.style.js';
              export const used = gap;
            `,
            'types/tokens.style.d.ts': 'export declare const gap: number;',
          },
          { typed: true, rootDirs: ['.', 'types'] },
        );

        expect(result.messages).toEqual([]);
      });
    });
  });

  it("allows the design system's style entry, which carries sheets and no component", async () => {
    const result = await lint(
      boundaryRule,
      `
      import { craftStyles } from '@craft-ts/style';
      import { theme } from '@craft-ts/ui/style';
      export const sheet = craftStyles('page', {});
      export const used = theme;
    `,
      'page.style.ts',
    );

    expect(result.messages).toEqual([]);
  });

  it("refuses the design system's component entry in a style file", async () => {
    const result = await lint(
      boundaryRule,
      `
      import { DocBadge } from '@craft-ts/ui';
      export const used = DocBadge;
    `,
      'page.style.ts',
    );

    expect(result.messages).toHaveLength(1);
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

  it('accepts the names and numbers the foundation constructors take', async () => {
    const result = await lint(
      rawValueRule,
      `
      import { craftGlobalStyles, defineFont, easing, googleFont, keyframes, opacity, num, systemFontStack, tracks, unit } from '@craft-ts/style';
      export const body = defineFont('body', { family: 'Chivo', source: googleFont({ weights: [400] }), fallback: 'system-ui' });
      export const stack = systemFontStack(['ui-sans-serif'], 'sans-serif');
      export const columns = [tracks.equal(2), tracks.list(unit.rem(2), tracks.fr(1), 'auto')];
      export const fade = keyframes('fade', { to: [opacity(num(0))] });
      export const curve = easing.cubicBezier(0.2, 0, 0, 1);
      craftGlobalStyles('app', {});
    `,
      'foundation.style.ts',
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

/**
 * Lints `card.style.ts` (the first file) inside a real directory holding every
 * given file, optionally with a NodeNext `tsconfig.json` and a typed program.
 */
async function lintProject(
  rule: unknown,
  files: Record<string, string>,
  options: {
    typed?: boolean;
    allowJs?: boolean;
    rootDirs?: readonly string[];
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'craft-style-boundary-'));
  try {
    for (const [file, source] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), source);
    }
    if (options.typed) {
      await writeFile(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2022',
            module: 'nodenext',
            moduleResolution: 'nodenext',
            skipLibCheck: true,
            types: [],
            ...(options.allowJs ? { allowJs: true } : {}),
            ...(options.rootDirs ? { rootDirs: options.rootDirs } : {}),
          },
          include: ['card.style.ts'],
        }),
      );
    }
    const filename = Object.keys(files)[0];
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tsParser as unknown as Linter.Parser,
            parserOptions: {
              ecmaVersion: 'latest',
              sourceType: 'module',
              ...(options.typed
                ? { project: './tsconfig.json', tsconfigRootDir: root }
                : {}),
            },
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
