/**
 * The guard rail under the static contrast analysis.
 *
 * The analysis is silent about what it cannot see. A `:hover` written by hand
 * does not produce a wrong answer, it produces **no** answer, and the run then
 * comes back clean on styles nobody proved. That is the worst shape a check can
 * have, so the rule is an error rather than a warning.
 *
 * It lives in the `typedCss` preset and not in `recommended`, which is the other
 * half of the same judgement and is measured at the bottom of the file.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const hoverRule = require('./prefer-hover-axis.cjs');

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

describe('where the rule is switched on', () => {
  const plugin = require('./index.cjs');

  it('keeps it out of recommended', () => {
    expect(plugin.configs.recommended.rules).not.toHaveProperty(
      'craft-ts/prefer-hover-axis',
    );
  });

  it('makes it an error in the typedCss preset', () => {
    // What it protects is a *claim*. Once a project runs style:check, styles
    // the analysis cannot see turn a clean run into a statement about half
    // the application — so the rule comes on with the thing that makes the
    // claim, and it is an error rather than a warning.
    expect(plugin.configs.typedCss.rules).toEqual({
      'craft-ts/prefer-hover-axis': 'error',
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
