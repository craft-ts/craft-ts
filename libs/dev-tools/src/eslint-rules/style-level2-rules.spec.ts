import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const noRawClass = require('./no-raw-class.cjs');
const noFreeHas = require('./no-free-has.cjs');

describe('no-raw-class', () => {
  it('accepts a class that came from a sheet', async () => {
    const result = await lint(
      noRawClass,
      `
      import { craftStyles } from '@craft-ts/style';
      import { div } from '@craft-ts/component';
      const sheet = craftStyles('card', {});
      export const view = div({ class: sheet.root }, []);
    `,
    );

    expect(result.messages).toEqual([]);
  });

  it('refuses a string, and says where the rule belongs', async () => {
    const result = await lint(
      noRawClass,
      `
      import { craftStyles } from '@craft-ts/style';
      import { div } from '@craft-ts/component';
      export const view = div({ class: 'card' }, []);
    `,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain(
      'Move the rule into the sheet',
    );
  });

  it('refuses a class computed at render time, and names the alternative', async () => {
    const result = await lint(
      noRawClass,
      `
      import { craftStyles } from '@craft-ts/style';
      import { div } from '@craft-ts/component';
      export const view = (tone: string) =>
        div({ class: function* () { return \`badge badge-\${tone}\`; } }, []);
    `,
    );

    // Every string this can produce is a state nobody can enumerate — which is
    // exactly what makes the matrix a fiction.
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('when(tone.danger');
  });

  it('leaves a file that does not use the design system alone', async () => {
    const result = await lint(
      noRawClass,
      `
      import { div } from '@craft-ts/component';
      export const view = div({ class: 'legacy-card' }, []);
    `,
    );

    // A component that has not been migrated is not claiming the guarantee.
    // Reporting it would teach people to disable the rule.
    expect(result.messages).toEqual([]);
  });
});

describe('no-free-has', () => {
  it('refuses :has() in a style string and points at the axis', async () => {
    const result = await lint(
      noFreeHas,
      `
      export const meta = {
        styles: \`.field:has(:user-invalid) { border-color: red; }\`,
      };
    `,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('descendant.userInvalid');
  });

  it('leaves the combinators that stay inside the component', async () => {
    const result = await lint(
      noFreeHas,
      `
      export const meta = {
        styles: '.row + .row { margin-block-start: 0.5rem; } .cell:nth-child(2) { font-weight: 700; }',
      };
    `,
    );

    // `+`, `~` and `:nth-child` cannot see past the subtree the component
    // renders itself, so they enumerate fine.
    expect(result.messages).toEqual([]);
  });
});

async function lint(rule: unknown, code: string) {
  const root = await mkdtemp(join(tmpdir(), 'craft-style-level2-'));
  try {
    await writeFile(join(root, 'input.ts'), code);
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
    const [result] = await eslint.lintFiles(['input.ts']);
    return result;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}
