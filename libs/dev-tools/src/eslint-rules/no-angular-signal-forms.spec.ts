import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const noAngularSignalFormsRule = require('./no-angular-signal-forms.cjs');

const tempDirectories: string[] = [];

describe('craft-ng/no-angular-signal-forms', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('allows non-signal Angular forms imports', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { FormsModule } from '@angular/forms';

        export const module = FormsModule;
      `,
    });

    expect(messages).toEqual([]);
  });

  it('reports named imports from @angular/forms/signals', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { form, FormField } from '@angular/forms/signals';

        const myForm = form({});
        const field: FormField<string> = null as never;
      `,
    });

    expect(messages).toEqual([
      '"form" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
      '"FormField" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
      '"form" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
    ]);
  });

  it('reports aliased named imports from @angular/forms/signals', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { form as ngForm } from '@angular/forms/signals';

        const myForm = ngForm({});
      `,
    });

    expect(messages).toEqual([
      '"form" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
      '"form" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
    ]);
  });

  it('reports namespace imports from @angular/forms/signals', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import * as signalForms from '@angular/forms/signals';

        const myForm = signalForms.form({});
      `,
    });

    expect(messages).toEqual([
      'Angular signal forms from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
      '"form" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
    ]);
  });

  it('reports form/FormField re-exported from @angular/forms', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { form, FormField } from '@angular/forms';

        const myForm = form({});
        const field: FormField<string> = null as never;
      `,
    });

    expect(messages).toEqual([
      '"form" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
      '"FormField" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
      '"form" from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.',
    ]);
  });

  it('ignores form imported from non-Angular modules', async () => {
    const messages = await lintFixture({
      'src/app/demo.ts': `
        import { form } from 'custom-forms';

        const myForm = form({});
      `,
    });

    expect(messages).toEqual([]);
  });
});

async function lintFixture(files: Record<string, string>): Promise<string[]> {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), 'no-angular-signal-forms-rule-'),
  );
  tempDirectories.push(tempDirectory);

  await writeFixtureFiles(tempDirectory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          experimentalDecorators: true,
          module: 'preserve',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
    ...files,
  });

  const eslint = new ESLint({
    cwd: tempDirectory,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: {
          local: {
            rules: {
              'no-angular-signal-forms': noAngularSignalFormsRule as never,
            },
          },
        },
        rules: {
          'local/no-angular-signal-forms': 'error',
        },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}

async function writeFixtureFiles(
  rootDirectory: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(rootDirectory, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, source.trimStart(), 'utf8');
  }
}
