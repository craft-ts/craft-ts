import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./require-primitive-derived-property.cjs');
const tempDirectories: string[] = [];

describe('require-primitive-derived-property', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it('reports a computed that only depends on a query in the same component', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from '@angular/core';
        import { craftComponent, query } from '@craft-ts/core';

        const Demo = craftComponent('Demo', {}, function* () {
          const userQuery = yield* query('userQuery', {});
          const total = computed(() => userQuery.value()?.length ?? 0);
          return { userQuery, total };
        }, () => null);
      `,
    });

    expect(messages).toEqual([
      "'total' only depends on the 'userQuery' primitive in the same Craft entity. Define it in that primitive's insertion instead of creating a separate computed.",
    ]);
  });

  it('reports craftComputed as well', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { craftComponent, craftComputed, query } from '@craft-ts/core';

        const Demo = craftComponent('Demo', {}, function* () {
          const userQuery = yield* query('userQuery', {});
          const total = yield* craftComputed('total', () => userQuery.value()?.length ?? 0);
          return { userQuery, total };
        }, () => null);
      `,
    });

    expect(messages).toHaveLength(1);
  });

  it('also reports values derived in a craft service', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from '@angular/core';
        import { craftService, query } from '@craft-ts/core';

        const { UserService } = craftService({ name: 'UserService', scope: 'global' }, function* () {
          const userQuery = yield* query('userQuery', {});
          const total = computed(() => userQuery.value()?.length ?? 0);
          return { userQuery, total };
        });
      `,
    });

    expect(messages).toHaveLength(1);
  });

  it('ignores computations with multiple primitive dependencies', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from '@angular/core';
        import { craftComponent, query, state } from '@craft-ts/core';

        const Demo = craftComponent('Demo', {}, function* () {
          const userQuery = yield* query('userQuery', {});
          const page = yield* state('page', 1);
          const total = computed(() => (userQuery.value()?.length ?? 0) + page());
          return { userQuery, page, total };
        }, () => null);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('does not report a computed outside a Craft entity or inside an insertion', async () => {
    const { messages } = await lintFixture({
      'src/app/demo.ts': `
        import { computed } from '@angular/core';
        import { craftComponent, query } from '@craft-ts/core';

        const queryOutside = query('queryOutside', {});
        const outside = computed(() => queryOutside.value());
        const Demo = craftComponent('Demo', {}, function* () {
          const userQuery = yield* query(
            'userQuery',
            {},
            ({ state }) => ({ total: computed(() => state()?.length ?? 0) }),
          );
          return { userQuery };
        }, () => null);
      `,
    });

    expect(messages).toEqual([]);
  });

  it('autofixes a query insertion and keeps the local property available', async () => {
    const { output, messages } = await lintFixture(
      {
        'src/app/demo.ts': `
          import { computed } from '@angular/core';
          import { craftComponent, query } from '@craft-ts/core';

          const Demo = craftComponent('Demo', {}, function* () {
            const userQuery = yield* query('userQuery', {});
            const total = computed(() => userQuery.value()?.length ?? 0);
            return { userQuery, total };
          }, () => null);
        `,
      },
      { fix: true },
    );

    expect(messages).toEqual([]);
    expect(output).toContain(
      "const userQuery = yield* query('userQuery', {}, ({ state }) => ({ total: computed(() => state()?.length ?? 0) }));",
    );
    expect(output).toContain('const total = userQuery.total;');
  });

  it('composes with an existing insertion and adds missing imports', async () => {
    const { output, messages } = await lintFixture(
      {
        'src/app/demo.ts': `
          import { craftComponent, craftComputed, insertStoragePersister, query } from '@craft-ts/core';

          const Demo = craftComponent('Demo', {}, function* () {
            const userQuery = yield* query('userQuery', {}, insertStoragePersister(craftUnique({
              key: 'user',
            })));
            const total = craftComputed('total', () => userQuery.value()?.length ?? 0);
            return { userQuery, total };
          }, () => null);
        `,
      },
      { fix: true },
    );

    expect(messages).toEqual([]);
    expect(output).toContain(
      "import { craftComponent, craftComputed, insertStoragePersister, query, insertQueryPipe } from '@craft-ts/core';",
    );
    expect(output).toContain(
      "insertQueryPipe(insertStoragePersister(craftUnique({\n              key: 'user',\n            })), ({ state }) => ({ total: computed(() => state()?.length ?? 0) }))",
    );
    expect(output).toContain("import { computed } from '@angular/core';");
  });
});

async function lintFixture(
  files: Record<string, string>,
  options: { fix?: boolean } = {},
): Promise<{ messages: string[]; output: string }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'require-primitive-derived-property-rule-'),
  );
  tempDirectories.push(directory);

  await writeFixtureFiles(directory, {
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: { module: 'preserve', strict: true, target: 'ES2022' },
      },
      null,
      2,
    ),
    ...files,
  });

  const eslint = new ESLint({
    cwd: directory,
    fix: options.fix,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const results = await eslint.lintFiles(['src/**/*.ts']);
  const result = results[0];
  return {
    messages: results.flatMap((item) =>
      item.messages.map((message) => message.message),
    ),
    output:
      result.output ??
      (await readFile(join(directory, 'src/app/demo.ts'), 'utf8')),
  };
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
