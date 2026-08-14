import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runArchitectureMigration } from './migrate-architecture';
import { runMigration } from '../migrate';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-architecture-'));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const fullPath = join(root, path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );
  return root;
}

function cliAppFiles(): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name: 'my-app',
      scripts: { test: 'ng test' },
    }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true },
      files: [],
      include: [],
      references: [{ path: './tsconfig.app.json' }],
    }),
    'tsconfig.app.json': JSON.stringify({
      extends: './tsconfig.json',
      files: ['src/main.ts'],
    }),
    'src/main.ts': 'export const app = true;\n',
  };
}

describe('architecture migration', () => {
  it('writes the baseline architecture suite into an Angular CLI app on --write', async () => {
    const root = await fixture(cliAppFiles());

    const result = await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, 'architecture/load-graph.ts'))).toBe(true);
    expect(existsSync(join(root, 'architecture/catalog.ts'))).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/craft-unique.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/http-endpoint-unique.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/craft-computed-pure.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/no-dependency-cycles.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/route-di-proofs.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/mutation-react-on.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(
        join(root, 'architecture/rules/persisted-primitive-unique.spec.ts'),
      ),
    ).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/insert-select-unique.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(join(root, 'architecture/rules/craft-effect-no-network.spec.ts')),
    ).toBe(true);
    expect(
      existsSync(
        join(root, 'architecture/rules/craft-effect-no-imperative-sync.spec.ts'),
      ),
    ).toBe(true);
    expect(existsSync(join(root, 'architecture/architecture.spec.ts'))).toBe(
      true,
    );
    expect(existsSync(join(root, 'tsconfig.graph.json'))).toBe(true);
    expect(existsSync(join(root, 'tsconfig.architecture.json'))).toBe(true);
    expect(existsSync(join(root, 'vitest.architecture.config.ts'))).toBe(true);

    const packageJson = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts.architecture).toBe(
      'vitest run --config vitest.architecture.config.ts',
    );

    const loadGraph = await readFile(
      join(root, 'architecture/load-graph.ts'),
      'utf8',
    );
    expect(loadGraph).toContain('export function loadArchitectureGraph()');
    expect(loadGraph).toContain("tsConfigFilePath: 'tsconfig.graph.json'");
    expect(loadGraph).not.toContain('nxViteTsPaths');

    const vitestConfig = await readFile(
      join(root, 'vitest.architecture.config.ts'),
      'utf8',
    );
    expect(vitestConfig).not.toContain('nxViteTsPaths');
    expect(vitestConfig).toContain("include: ['architecture/**/*.spec.ts']");
  });

  it('does not write files on dry-run and reports the planned paths', async () => {
    const root = await fixture(cliAppFiles());

    const result = await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: false,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, 'architecture/load-graph.ts'))).toBe(false);
    expect(
      result.changedFiles.some((file) =>
        file.endsWith(join('architecture', 'load-graph.ts')),
      ),
    ).toBe(true);
  });

  it('overwrites an existing architecture scaffold on --write', async () => {
    const root = await fixture({
      ...cliAppFiles(),
      'architecture/architecture.spec.ts': 'export const keep = false;\n',
    });

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      log: () => undefined,
    });

    const spec = await readFile(
      join(root, 'architecture/architecture.spec.ts'),
      'utf8',
    );
    expect(spec).toContain('loadArchitectureGraph');
    expect(spec).not.toContain('export const keep = false');
  });

  it('patches Nx project.json and uses nxViteTsPaths in the Vitest config', async () => {
    const root = await fixture({
      'nx.json': '{}',
      'project.json': JSON.stringify({
        name: 'shop',
        targets: {
          build: { executor: '@angular/build:application' },
        },
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true },
        files: [],
        include: [],
        references: [{ path: './tsconfig.app.json' }],
      }),
      'tsconfig.app.json': JSON.stringify({
        extends: './tsconfig.json',
        files: ['src/main.ts'],
      }),
      'src/main.ts': 'export const app = true;\n',
    });

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      log: () => undefined,
    });

    const project = JSON.parse(
      await readFile(join(root, 'project.json'), 'utf8'),
    ) as {
      targets: Record<string, { options?: { command?: string; cwd?: string } }>;
    };
    expect(project.targets.architecture?.options?.command).toBe(
      'npx vitest run --config vitest.architecture.config.ts',
    );
    expect(project.targets['typecheck-architecture']?.options?.command).toContain(
      'tsconfig.architecture.json',
    );

    const vitestConfig = await readFile(
      join(root, 'vitest.architecture.config.ts'),
      'utf8',
    );
    expect(vitestConfig).toContain('nxViteTsPaths');
    expect(vitestConfig).toContain('shop-architecture');
    expect(existsSync(join(root, 'package.json'))).toBe(false);
  });

  it('fails --check when the suite is missing and passes after --write', async () => {
    const root = await fixture(cliAppFiles());

    const missing = await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      check: true,
      log: () => undefined,
    });
    expect(missing.exitCode).toBe(1);
    expect(existsSync(join(root, 'architecture/load-graph.ts'))).toBe(false);

    const written = await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      check: true,
      log: () => undefined,
    });
    expect(written.exitCode).toBe(0);

    const checked = await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      check: true,
      log: () => undefined,
    });
    expect(checked.exitCode).toBe(0);
  });

  it('keeps --check green when architecture.spec.ts has app-specific lookups', async () => {
    const root = await fixture(cliAppFiles());

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      log: () => undefined,
    });
    await writeFile(
      join(root, 'architecture/architecture.spec.ts'),
      `import { beforeAll, describe, expect, it } from 'vitest';
import { loadArchitectureGraph } from './load-graph';

describe('architecture', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('indexes a feature route', () => {
    expect(graph.graph.nodes.length).toBeGreaterThanOrEqual(0);
  });
});
`,
      'utf8',
    );

    const checked = await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      check: true,
      log: () => undefined,
    });
    expect(checked.exitCode).toBe(0);
  });

  it('adds a tsconfig.architecture.json project reference', async () => {
    const root = await fixture(cliAppFiles());

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      log: () => undefined,
    });

    const tsconfig = JSON.parse(
      await readFile(join(root, 'tsconfig.json'), 'utf8'),
    ) as { references?: { path: string }[] };
    expect(tsconfig.references).toEqual(
      expect.arrayContaining([{ path: './tsconfig.architecture.json' }]),
    );
  });

  it('ignores the generated catalog in the flat ESLint config', async () => {
    const root = await fixture({
      ...cliAppFiles(),
      'eslint.config.mjs': `export default [
  { files: ['**/*.ts'], rules: {} },
];
`,
    });

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      log: () => undefined,
    });

    const eslint = await readFile(join(root, 'eslint.config.mjs'), 'utf8');
    expect(eslint).toContain('architecture/catalog.ts');

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      log: () => undefined,
    });
    const second = await readFile(join(root, 'eslint.config.mjs'), 'utf8');
    expect(second.split('architecture/catalog.ts').length).toBe(2);
  });

  it('points the Nx suite at the workspace root from a nested app', async () => {
    const root = await fixture({
      'nx.json': '{}',
      'apps/shop/project.json': JSON.stringify({
        name: 'shop',
        targets: { build: { executor: '@angular/build:application' } },
      }),
      'apps/shop/tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true },
        files: [],
        include: [],
        references: [{ path: './tsconfig.app.json' }],
      }),
      'apps/shop/tsconfig.app.json': JSON.stringify({
        extends: './tsconfig.json',
        files: ['src/main.ts'],
      }),
      'apps/shop/src/main.ts': 'export const app = true;\n',
    });

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'apps/shop/tsconfig.app.json'),
      rootDir: join(root, 'apps/shop/src'),
      write: true,
      log: () => undefined,
    });

    const loadGraph = await readFile(
      join(root, 'apps/shop/architecture/load-graph.ts'),
      'utf8',
    );
    expect(loadGraph).toContain("resolve(import.meta.dirname, '../../..')");
    expect(loadGraph).toContain(
      "tsConfigFilePath: 'apps/shop/tsconfig.graph.json'",
    );

    const project = JSON.parse(
      await readFile(join(root, 'apps/shop/project.json'), 'utf8'),
    ) as { targets: { architecture: { options: { cwd: string } } } };
    expect(project.targets.architecture.options.cwd).toBe('apps/shop');
  });

  it('adds an architecture script on the workspace package.json for a nested Angular CLI app', async () => {
    const root = await fixture({
      'package.json': JSON.stringify({
        name: 'workspace',
        scripts: { test: 'ng test' },
      }),
      'angular.json': '{}',
      'projects/my-app/tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true },
        files: [],
        include: [],
        references: [{ path: './tsconfig.app.json' }],
      }),
      'projects/my-app/tsconfig.app.json': JSON.stringify({
        extends: './tsconfig.json',
        files: ['src/main.ts'],
      }),
      'projects/my-app/src/main.ts': 'export const app = true;\n',
    });

    await runArchitectureMigration({
      tsConfigFilePath: join(root, 'projects/my-app/tsconfig.app.json'),
      rootDir: join(root, 'projects/my-app/src'),
      write: true,
      log: () => undefined,
    });

    const pkg = JSON.parse(
      await readFile(join(root, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.architecture).toBe(
      'vitest run --config projects/my-app/vitest.architecture.config.ts',
    );
    expect(pkg.scripts['typecheck-architecture']).toBe(
      'tsc -p projects/my-app/tsconfig.architecture.json --noEmit --pretty false',
    );
  });

  it('runs as the last craft-migrate step', async () => {
    const root = await fixture(cliAppFiles());

    const result = await runMigration({
      tsConfigFilePath: join(root, 'tsconfig.app.json'),
      rootDir: join(root, 'src'),
      write: true,
      eslint: false,
      log: () => undefined,
    });

    expect(result.architecture.exitCode).toBe(0);
    expect(existsSync(join(root, 'architecture/load-graph.ts'))).toBe(true);
    expect(result.changedFiles.some((file) => file.includes('architecture'))).toBe(
      true,
    );
  });
});
