import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  architectureCatalogToTypeScript,
  buildArchitectureCatalog,
} from '../architecture-graph.js';
import {
  analyzeDependencyGraph,
  type DependencyGraph,
} from '../dependency-graph.js';

export type MigrateArchitectureOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  write?: boolean;
  check?: boolean;
  json?: boolean;
  jsonFilePath?: string;
  log?: (message: string) => void;
};

export type MigrateArchitectureResult = {
  changedFiles: string[];
  exitCode: number;
};

type ArchitectureContext = {
  appRoot: string;
  workspaceRoot: string;
  sourceGlob: string;
  projectName: string;
  nx: boolean;
  graphTsConfigRel: string;
  workspaceFromArchitecture: string;
};

const RULES = [
  {
    file: 'craft-unique.spec.ts',
    helper: 'assertCraftUnique',
    describe: 'assertCraftUnique',
    it: 'requires craftUnique identities to appear once',
    call: 'assertCraftUnique(graph.graph)',
  },
  {
    file: 'http-endpoint-unique.spec.ts',
    helper: 'assertHttpEndpointUnique',
    describe: 'assertHttpEndpointUnique',
    it: 'owns each HTTP endpoint once',
    call: 'assertHttpEndpointUnique(graph.graph)',
  },
  {
    file: 'craft-computed-pure.spec.ts',
    helper: 'assertCraftComputedPure',
    describe: 'assertCraftComputedPure',
    it: 'keeps craftComputed free of methods and source$ writes',
    call: 'assertCraftComputedPure(graph.graph)',
  },
  {
    file: 'no-dependency-cycles.spec.ts',
    helper: 'assertNoDependencyCycles',
    describe: 'assertNoDependencyCycles',
    it: 'forbids depends-on cycles',
    call: 'assertNoDependencyCycles(graph.graph)',
  },
  {
    file: 'route-di-proofs.spec.ts',
    helper: 'assertRouteDiProofs',
    describe: 'assertRouteDiProofs',
    it: 'requires a DI proof on every routed component and app-config error screen',
    call: 'assertRouteDiProofs(graph.graph)',
  },
  {
    file: 'mutation-react-on.spec.ts',
    helper: 'assertMutationHasReactOn',
    describe: 'assertMutationHasReactOn',
    it: 'requires a query to react to each mutation',
    call: 'assertMutationHasReactOn(graph.graph)',
  },
  {
    file: 'persisted-primitive-unique.spec.ts',
    helper: 'assertPersistedPrimitiveHasUnique',
    describe: 'assertPersistedPrimitiveHasUnique',
    it: 'requires craftUnique on every persisted primitive',
    call: 'assertPersistedPrimitiveHasUnique(graph.graph)',
  },
  {
    file: 'insert-select-unique.spec.ts',
    helper: 'assertInsertSelectUnique',
    describe: 'assertInsertSelectUnique',
    it: 'keeps insertSelect keys unique on each host',
    call: 'assertInsertSelectUnique(graph.graph)',
  },
  {
    file: 'craft-effect-no-network.spec.ts',
    helper: 'assertCraftEffectNoNetwork',
    describe: 'assertCraftEffectNoNetwork',
    it: 'keeps craftEffect off HTTP and mutations',
    call: 'assertCraftEffectNoNetwork(graph.graph)',
  },
  {
    file: 'craft-effect-no-imperative-sync.spec.ts',
    helper: 'assertCraftEffectNoImperativeSync',
    describe: 'assertCraftEffectNoImperativeSync',
    it: 'keeps craftEffect from pushing into state, sources, queries or mutations',
    call: 'assertCraftEffectNoImperativeSync(graph.graph)',
  },
  {
    file: 'interactive-element-named.spec.ts',
    helper: 'assertInteractiveElementNamed',
    describe: 'assertInteractiveElementNamed',
    it: 'requires a unique literal data-craft-name on every interactive element',
    call: 'assertInteractiveElementNamed(graph.graph)',
  },
] as const;

export async function runArchitectureMigration(
  options: MigrateArchitectureOptions = {},
): Promise<MigrateArchitectureResult> {
  const context = await resolveContext(options);
  const files = buildScaffoldFiles(context);
  const changedFiles = Object.keys(files).map((relativePath) =>
    join(context.appRoot, relativePath),
  );
  changedFiles.push(join(context.appRoot, 'architecture/catalog.ts'));
  const packagePath = findPackageJson(context.appRoot, context.workspaceRoot);
  const projectPath = join(context.appRoot, 'project.json');
  if (!context.nx && packagePath) {
    changedFiles.push(packagePath);
  }
  if (context.nx && existsSync(projectPath)) {
    changedFiles.push(projectPath);
  }
  const tsconfigPath = join(context.appRoot, 'tsconfig.json');
  if (existsSync(tsconfigPath)) changedFiles.push(tsconfigPath);
  const eslintPath = findEslintConfig(context.appRoot, context.workspaceRoot);
  if (eslintPath) changedFiles.push(eslintPath);

  if (options.write) {
    const graphConfig = files['tsconfig.graph.json'];
    if (graphConfig) {
      await mkdir(context.appRoot, { recursive: true });
      await writeFile(join(context.appRoot, 'tsconfig.graph.json'), graphConfig, 'utf8');
    }
  }

  files['architecture/catalog.ts'] = await generateCatalog(context);

  if (options.write) {
    for (const [relativePath, contents] of Object.entries(files)) {
      const fullPath = join(context.appRoot, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }
    if (!context.nx && packagePath) {
      await patchPackageJson(packagePath, context);
    }
    if (context.nx) {
      await patchNxProject(context);
    }
    await patchTsconfigReferences(context.appRoot);
    await patchEslintIgnore(context.appRoot, context.workspaceRoot);
  }

  const exitCode =
    options.check && !(await scaffoldMatches(context, files)) ? 1 : 0;

  const result: MigrateArchitectureResult = {
    changedFiles,
    exitCode,
  };

  if (options.jsonFilePath) {
    const path = resolve(options.jsonFilePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  const log = options.log ?? console.log;
  if (options.json) log(JSON.stringify(result, null, 2));
  else {
    log(
      `${options.write ? 'Wrote' : 'Would write'} architecture suite: ${result.changedFiles.length} file(s).`,
    );
  }

  return result;
}

async function resolveContext(
  options: MigrateArchitectureOptions,
): Promise<ArchitectureContext> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const tsConfigFilePath = options.tsConfigFilePath
    ? resolve(options.tsConfigFilePath)
    : defaultTsConfig(rootDir);
  const appRoot = dirname(tsConfigFilePath);
  const workspaceRoot = findWorkspaceRoot(appRoot);
  const nx = existsSync(join(appRoot, 'project.json'));
  const sourceRel = posixRelative(appRoot, rootDir);
  const sourceGlob =
    !sourceRel || sourceRel === '.' ? 'src' : sourceRel.replace(/\\/g, '/');
  const projectName = await readProjectName(appRoot, nx);
  return {
    appRoot,
    workspaceRoot,
    sourceGlob,
    projectName,
    nx,
    graphTsConfigRel: posixRelative(
      workspaceRoot,
      join(appRoot, 'tsconfig.graph.json'),
    ),
    workspaceFromArchitecture: posixRelative(
      join(appRoot, 'architecture'),
      workspaceRoot,
    ),
  };
}

function buildScaffoldFiles(
  context: ArchitectureContext,
): Record<string, string> {
  return {
    'tsconfig.graph.json': `${JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: { skipLibCheck: true },
        include: [`${context.sourceGlob}/**/*.ts`],
        exclude: [
          `${context.sourceGlob}/**/*.spec.ts`,
          `${context.sourceGlob}/**/*.test.ts`,
        ],
      },
      null,
      2,
    )}\n`,
    'tsconfig.architecture.json': `${JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          types: ['node', 'vitest/globals'],
          module: 'esnext',
          moduleResolution: 'bundler',
        },
        include: ['architecture/**/*.ts'],
      },
      null,
      2,
    )}\n`,
    'vitest.architecture.config.ts': vitestConfig(context),
    'architecture/load-graph.ts': loadGraphSource(context),
    'architecture/architecture.spec.ts': architectureSpecSource(),
    ...Object.fromEntries(
      RULES.map((rule) => [
        `architecture/rules/${rule.file}`,
        ruleSpecSource(rule),
      ]),
    ),
  };
}

async function generateCatalog(context: ArchitectureContext): Promise<string> {
  const header = '// Generated. Do not edit.\n';
  try {
    const graph = analyzeDependencyGraph({
      rootDir: context.workspaceRoot,
      tsConfigFilePath: context.graphTsConfigRel,
    });
    return `${header}${architectureCatalogToTypeScript(buildArchitectureCatalog(graph))}`;
  } catch {
    const empty: DependencyGraph = {
      version: 1,
      rootDir: context.workspaceRoot,
      tsConfigFilePath: join(context.workspaceRoot, context.graphTsConfigRel),
      nodes: [],
      edges: [],
    };
    return `${header}${architectureCatalogToTypeScript(buildArchitectureCatalog(empty))}`;
  }
}

function loadGraphSource(context: ArchitectureContext): string {
  return `import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  analyzeDependencyGraph,
  architectureCatalogToTypeScript,
  buildArchitectureCatalog,
  createArchitectureGraph,
} from '@craft-ng/dev-tools';
import { architectureCatalog } from './catalog';

const workspaceRoot = resolve(import.meta.dirname, '${context.workspaceFromArchitecture}');
const catalogPath = join(import.meta.dirname, 'catalog.ts');

let cached: ReturnType<typeof createArchitectureGraph> | undefined;

export function loadArchitectureGraph() {
  if (cached) return cached;
  const graph = analyzeDependencyGraph({
    rootDir: workspaceRoot,
    tsConfigFilePath: '${context.graphTsConfigRel}',
  });
  writeFileSync(
    catalogPath,
    \`// Generated. Do not edit.\\n\${architectureCatalogToTypeScript(buildArchitectureCatalog(graph))}\`,
  );
  cached = createArchitectureGraph(graph, architectureCatalog);
  return cached;
}
`;
}

function architectureSpecSource(): string {
  return `import { beforeAll, describe, expect, it } from 'vitest';
import { loadArchitectureGraph } from './load-graph';

/**
 * App-specific lookups. Common architecture rules live in \`rules/\`.
 */
describe('architecture', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;

  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);

  it('loads the architecture graph', () => {
    expect(graph.graph.version).toBe(1);
  });
});
`;
}

function ruleSpecSource(rule: (typeof RULES)[number]): string {
  return `import { beforeAll, describe, it } from 'vitest';
import { ${rule.helper} } from '@craft-ng/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('${rule.describe}', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;

  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);

  it('${rule.it}', () => {
    ${rule.call};
  });
});
`;
}

function vitestConfig(context: ArchitectureContext): string {
  if (context.nx) {
    const cacheRel = posixRelative(
      context.appRoot,
      join(
        context.workspaceRoot,
        'node_modules',
        '.vite',
        `${context.projectName}-architecture`,
      ),
    );
    return `/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: ${JSON.stringify(cacheRel)},
  plugins: [nxViteTsPaths()],
  test: {
    name: ${JSON.stringify(`${context.projectName}-architecture`)},
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ['architecture/**/*.spec.ts'],
  },
}));
`;
  }
  return `/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: ${JSON.stringify(`node_modules/.vite/${context.projectName}-architecture`)},
  test: {
    name: ${JSON.stringify(`${context.projectName}-architecture`)},
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ['architecture/**/*.spec.ts'],
  },
}));
`;
}

function defaultTsConfig(rootDir: string): string {
  for (const name of ['tsconfig.app.json', 'tsconfig.json']) {
    const candidate = join(rootDir, name);
    if (existsSync(candidate)) return candidate;
    const parent = join(dirname(rootDir), name);
    if (existsSync(parent)) return parent;
  }
  return join(rootDir, 'tsconfig.json');
}

function findWorkspaceRoot(appRoot: string): string {
  let current = appRoot;
  while (true) {
    if (
      existsSync(join(current, 'nx.json')) ||
      existsSync(join(current, 'angular.json'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return appRoot;
    current = parent;
  }
}

async function readProjectName(appRoot: string, nx: boolean): Promise<string> {
  if (nx) {
    try {
      const project = JSON.parse(
        await readFile(join(appRoot, 'project.json'), 'utf8'),
      ) as { name?: string };
      if (project.name) return sanitizeName(project.name);
    } catch {
      /* fall through */
    }
  }
  try {
    const pkg = JSON.parse(
      await readFile(join(appRoot, 'package.json'), 'utf8'),
    ) as { name?: string };
    if (pkg.name) return sanitizeName(pkg.name);
  } catch {
    /* fall through */
  }
  return sanitizeName(appRoot.split(/[\\/]/).at(-1) ?? 'app');
}

function sanitizeName(name: string): string {
  return name.replace(/^@.*\//, '').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function posixRelative(from: string, to: string): string {
  const value = relative(from, to).split('\\').join('/');
  return value === '' ? '.' : value;
}

async function patchNxProject(context: ArchitectureContext): Promise<void> {
  const projectPath = join(context.appRoot, 'project.json');
  if (!existsSync(projectPath)) return;
  const project = JSON.parse(await readFile(projectPath, 'utf8')) as {
    targets?: Record<string, unknown>;
  };
  const cwd = posixRelative(context.workspaceRoot, context.appRoot);
  project.targets = {
    ...project.targets,
    architecture: {
      executor: 'nx:run-commands',
      options: {
        command: 'npx vitest run --config vitest.architecture.config.ts',
        cwd,
      },
      inputs: [
        '{projectRoot}/src/**/*.ts',
        '{projectRoot}/architecture/**/*.ts',
        '{projectRoot}/tsconfig.graph.json',
        '{projectRoot}/tsconfig.architecture.json',
      ],
      cache: true,
    },
    'typecheck-architecture': {
      executor: 'nx:run-commands',
      options: {
        cwd,
        command: 'tsc -p tsconfig.architecture.json --noEmit --pretty false',
      },
      inputs: [
        '{projectRoot}/tsconfig.json',
        '{projectRoot}/tsconfig.architecture.json',
        '{projectRoot}/architecture/**/*.ts',
      ],
      cache: true,
    },
  };
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
}

async function patchPackageJson(
  packagePath: string,
  context: ArchitectureContext,
): Promise<void> {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const fromPkg = dirname(packagePath);
  const vitestConfig = posixRelative(
    fromPkg,
    join(context.appRoot, 'vitest.architecture.config.ts'),
  );
  const architectureTsconfig = posixRelative(
    fromPkg,
    join(context.appRoot, 'tsconfig.architecture.json'),
  );
  pkg.scripts = {
    ...pkg.scripts,
    architecture: `vitest run --config ${vitestConfig}`,
    'typecheck-architecture': `tsc -p ${architectureTsconfig} --noEmit --pretty false`,
  };
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

async function scaffoldMatches(
  context: ArchitectureContext,
  files: Record<string, string>,
): Promise<boolean> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(context.appRoot, relativePath);
    if (!existsSync(fullPath)) return false;
    if (
      relativePath === 'architecture/catalog.ts' ||
      relativePath === 'architecture/architecture.spec.ts'
    ) {
      continue;
    }
    const actual = await readFile(fullPath, 'utf8');
    if (normalize(actual) !== normalize(contents)) return false;
  }
  if (context.nx) {
    const projectPath = join(context.appRoot, 'project.json');
    if (!existsSync(projectPath)) return false;
    const project = JSON.parse(await readFile(projectPath, 'utf8')) as {
      targets?: Record<string, { options?: { command?: string } }>;
    };
    return Boolean(project.targets?.['architecture']?.options?.command);
  }
  const packagePath = findPackageJson(context.appRoot, context.workspaceRoot);
  if (!packagePath) return false;
  const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts?.['architecture']?.includes('vitest.architecture.config.ts') === true;
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

const ESLINT_CONFIG_NAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
];

async function patchTsconfigReferences(appRoot: string): Promise<void> {
  const tsconfigPath = join(appRoot, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) return;
  const text = await readFile(tsconfigPath, 'utf8');
  let parsed: { references?: { path: string }[] };
  try {
    parsed = JSON.parse(text) as { references?: { path: string }[] };
  } catch {
    return;
  }
  const references = parsed.references ?? [];
  if (references.some((ref) => ref.path === './tsconfig.architecture.json')) {
    return;
  }
  parsed.references = [...references, { path: './tsconfig.architecture.json' }];
  await writeFile(tsconfigPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

async function patchEslintIgnore(
  appRoot: string,
  workspaceRoot: string,
): Promise<void> {
  const eslintPath = findEslintConfig(appRoot, workspaceRoot);
  if (!eslintPath) return;
  const text = await readFile(eslintPath, 'utf8');
  if (text.includes('architecture/catalog.ts')) return;
  let next = text;
  if (/ignores:\s*\[/.test(next)) {
    next = next.replace(
      /ignores:\s*\[/,
      "ignores: ['**/architecture/catalog.ts', ",
    );
  } else if (/export default\s*(?:defineConfig\s*\()?\[/.test(next)) {
    next = next.replace(
      /export default\s*(?:defineConfig\s*\()?\[/,
      (match) => `${match}\n  { ignores: ['**/architecture/catalog.ts'] },`,
    );
  } else {
    return;
  }
  await writeFile(eslintPath, next, 'utf8');
}

function findEslintConfig(
  startDir: string,
  stopDir: string,
): string | undefined {
  return findUpFile(startDir, ESLINT_CONFIG_NAMES, stopDir);
}

function findPackageJson(
  startDir: string,
  stopDir: string,
): string | undefined {
  return findUpFile(startDir, ['package.json'], stopDir);
}

function findUpFile(
  startDir: string,
  names: readonly string[],
  stopDir: string,
): string | undefined {
  const stop = resolve(stopDir);
  let current = resolve(startDir);
  while (true) {
    for (const name of names) {
      const candidate = join(current, name);
      if (existsSync(candidate)) return candidate;
    }
    if (current === stop) return undefined;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
