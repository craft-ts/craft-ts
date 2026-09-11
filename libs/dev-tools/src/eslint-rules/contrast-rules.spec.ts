/**
 * The two guard rails under the static contrast analysis.
 *
 * Both exist for the same reason and it is worth stating once: the analysis is
 * silent about what it cannot see. A `:hover` written by hand and a `color`
 * set in raw CSS do not produce a wrong answer, they produce **no** answer,
 * and the run then comes back clean on styles nobody proved. That is the worst
 * shape a check can have, so the rules are errors rather than warnings.
 *
 * They live in the `typedCss` preset and not in `recommended`, which is the
 * other half of the same judgement and is measured at the bottom of the file:
 * a project writing its CSS with `meta.styles` makes no contrast claim, and
 * failing its build over `color:` would be the preset telling people their
 * own framework is wrong.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const hoverRule = require('./prefer-hover-axis.cjs');
const textColorRule = require('./no-unmodelled-text-color.cjs');

describe('prefer-hover-axis', () => {
  it('flags a hand-written :hover and names the replacement', async () => {
    const result = await lint(
      hoverRule,
      `
      export const styles = \`
        .button:hover { background: red; }
      \`;
    `,
      'button.style.ts',
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain('when(interaction.hover');
    // The message has to say *why*, not just "no": an agent told only "no"
    // finds another way to write the same selector.
    expect(result.messages[0]?.message).toContain('visual matrix');
  });

  it('leaves the axis alone', async () => {
    const result = await lint(
      hoverRule,
      `
      import { interaction, set, when } from '@craft-ts/style';
      export const rule = when(interaction.hover, [set(v.bg, ui.accent.info)]);
    `,
      'button.style.ts',
    );

    expect(result.messages).toEqual([]);
  });
});

describe('no-unmodelled-text-color', () => {
  const component = (css: string) => `
    export const Widget = craftComponent('Widget', { styles: \`${css}\` },
      () => ({}), () => div());
  `;

  it('flags each of the four properties the proof is made of', async () => {
    for (const [css, property] of [
      ['.a { color: #333; }', 'color'],
      ['.a { background-color: #fff; }', 'background-color'],
      ['.a { font-size: 14px; }', 'font-size'],
      ['.a { font-weight: 600; }', 'font-weight'],
    ] as const) {
      const result = await lint(textColorRule, component(css), 'widget.ts');
      expect(result.messages, property).toHaveLength(1);
      expect(result.messages[0]?.message).toContain(`'${property}'`);
    }
  });

  it('does not mistake border-color for color', async () => {
    const result = await lint(
      textColorRule,
      component('.a { border-color: #333; padding: 4px; }'),
      'widget.ts',
    );
    expect(result.messages).toEqual([]);
  });

  it('says what to write instead and how to opt a surface out', async () => {
    const result = await lint(
      textColorRule,
      component('.a { color: #333; }'),
      'widget.ts',
    );
    expect(result.messages[0]?.message).toContain('color(theme.ink)');
    expect(result.messages[0]?.message).toContain('uncovered');
  });

  it('stays quiet on a surface declared as not covered', async () => {
    // The point of the option: a global stylesheet or a legacy screen is a
    // legitimate gap. What is not legitimate is for it to be
    // indistinguishable from a screen the analysis actually proved.
    const result = await lint(
      textColorRule,
      component('.a { color: #333; }'),
      'legacy-widget.ts',
      [{ uncovered: ['legacy-'] }],
    );
    expect(result.messages).toEqual([]);
  });
});

describe('where the two rules are switched on', () => {
  const plugin = require('./index.cjs');

  it('keeps them out of recommended', () => {
    // `meta.styles` is a supported way to write a component's CSS, not an
    // escape hatch. Failing every project that uses it would be this preset
    // telling people their own framework is wrong.
    expect(plugin.configs.recommended.rules).not.toHaveProperty(
      'craft-ts/prefer-hover-axis',
    );
    expect(plugin.configs.recommended.rules).not.toHaveProperty(
      'craft-ts/no-unmodelled-text-color',
    );
  });

  it('makes them errors in the typedCss preset', () => {
    // What they protect is a *claim*. Once a project runs style:check, styles
    // the analysis cannot see turn a clean run into a statement about half
    // the application — so the rules come on with the thing that makes the
    // claim, and they are errors rather than warnings.
    expect(plugin.configs.typedCss.rules).toEqual({
      'craft-ts/prefer-hover-axis': 'error',
      'craft-ts/no-unmodelled-text-color': 'error',
    });
  });
});

async function lint(
  rule: unknown,
  code: string,
  filename: string,
  options: readonly unknown[] = [],
) {
  const root = await mkdtemp(join(tmpdir(), 'craft-contrast-rules-'));
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
          rules: { 'local/localRule': ['error', ...options] as never },
        },
      ],
    });
    const [result] = await eslint.lintFiles([filename]);
    return result;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
