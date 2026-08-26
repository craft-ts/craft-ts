import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runArchitectureMigration } from '../architecture/migrate-architecture.js';

export const CRAFT_TS_STARTER_VERSION = '^0.7.0-beta.13';
export const EFFECT_V4_VERSION = '^4.0.0-rc.110';

export type CreateAgent = 'codex' | 'cursor' | 'claude-code' | 'cloud-code';
export type CreateMode = 'effect' | 'plain';

export type FrontendRuntime = 'plain' | 'effect';
export type BackendRuntime = 'none' | 'promise' | 'effect';
export type WorkspaceKind = 'standalone' | 'nx';
export type ReferenceMode = 'context' | 'local' | 'source';

export type StarterConfig = {
  /** Legacy input only. Templates use the explicit runtime axes. */
  readonly mode?: CreateMode;
  readonly frontendRuntime: FrontendRuntime;
  readonly backendRuntime: BackendRuntime;
  readonly workspace: {
    readonly kind: WorkspaceKind;
    readonly projectName: string;
    readonly rootDir: string;
  };
  readonly i18n: {
    readonly enabled: boolean;
    readonly locales: readonly string[];
    readonly defaultLocale: string;
    readonly validation: 'strict' | 'loose';
  };
  readonly designSystem: 'none' | 'basic';
  readonly typedCss: boolean;
  readonly references: {
    readonly craftTs: boolean;
    readonly effectTs: boolean;
    readonly mode: ReferenceMode;
    readonly craftTsRef: string;
    readonly effectTsRef: string;
  };
  readonly agents: readonly CreateAgent[];
};

export type CreateProjectOptions = {
  readonly directory: string;
  readonly rootDir?: string;
  readonly mode?: CreateMode;
  readonly frontendRuntime?: FrontendRuntime;
  readonly backendRuntime?: BackendRuntime;
  readonly effectScope?: 'none' | 'frontend' | 'backend' | 'both';
  readonly agents?: readonly CreateAgent[];
  readonly force?: boolean;
  readonly locales?: readonly string[];
  readonly defaultLocale?: string;
  readonly i18n?: 'strict' | 'loose' | 'none';
  readonly i18nEnabled?: boolean;
  readonly designSystem?: 'none' | 'basic';
  readonly typedCss?: boolean;
  readonly workspace?: WorkspaceKind;
  readonly references?: 'none' | 'craft-ts' | 'all';
  readonly referenceMode?: ReferenceMode;
  readonly craftTsRef?: string;
  readonly effectTsRef?: string;
  readonly cloneCraftTs?: boolean;
  readonly cloneEffectTs?: boolean;
  /** Release runner override; normal users should leave this unset. */
  readonly packageVersion?: string;
};

export type CreateProjectResult = {
  readonly directory: string;
  readonly mode: CreateMode;
  readonly frontendRuntime: FrontendRuntime;
  readonly backendRuntime: BackendRuntime;
  readonly config: StarterConfig;
  readonly agents: readonly CreateAgent[];
  readonly changedFiles: readonly string[];
};

const DEFAULT_AGENTS: readonly CreateAgent[] = ['codex'];

const BASE_AGENT_SKILL = `---
name: craft-ts-project
description: Build and evolve a framework-independent CraftTS application with typed reactivity, routing, API boundaries, lint and architecture contracts. Use when adding or reviewing CraftTS state, queries, mutations, components, routes, tests, or project structure.
---

# CraftTS project

This project uses CraftTS without Angular. The renderer is @craft-ts/component,
the reactive runtime is @craft-ts/core, and the application entry point is
bootstrapCraft.

## Workflow

1. Read the existing component, route and API boundary before editing.
2. Use query for server reads, mutation for writes, and CraftHttpClient
   for transport. Yield every Craft reader.
3. Use craftComponent, craftRoutes, componentDeps and the route DI proof;
   do not introduce Angular decorators or inject().
4. Keep translations in src/i18n/catalog.ts. Add locales with
   defineLocaleLike and project-specific tokens in project-tokens.ts.
   @craft-ts/i18n is framework-independent; do not import Effect for plain
   translations. Run npm run i18n:check and npm run i18n:test after changes.
5. Keep visual rules in a *.style.ts sheet under src/app/ui/. A sheet may
   import @craft-ts/style vocabulary and nothing else; the build plugin
   evaluates it in Node. Static variation goes to a class the emitter wrote
   at build time; dynamic variation goes through a typed custom property.
   Never build a class string at render time and never bind class to a
   template literal or a function: the template sets one constant class and a
   data-* attribute, and the variant is an axis. A class assembled in the
   browser is a visual state nothing recorded, which is what no-raw-class,
   no-free-has, no-raw-css-value and style-file-boundary exist to prevent.
   Components read theme variables, never palette tokens directly.
6. Run the focused test, then npm run lint, npm run typecheck,
   npm run architecture, and npm run e2e when the browser flow changed.
7. Keep the generated development surface enabled: 'npm run logs:server'
   stores Craft 'Console.*' entries locally, 'npm run logs:mcp' exposes them
   to an MCP client, and 'npm run registry:mcp' exposes the named page surface.
   Do not replace 'Console.*' with raw 'console.*' when an entry must be
   searchable through the log MCP server.

## Architecture tests

The architecture/ suite is a graph-wide contract, not feature-level TDD. It
checks invariants such as one owner per HTTP endpoint, no dependency cycles,
declarative reactive code, named interactive elements and armed route DI.
Run it after each structural change. Do not add an architecture it() merely
because a new feature was added. Add a new rule only when a product invariant
must prevent a recurring graph smell and no baseline helper covers it.

The catalog is generated by architecture/load-graph.ts; never hand-edit
architecture/catalog.ts.
`;

const EFFECT_AGENT_SKILL = `---
name: craft-ts-effect-v4
description: Build the Effect v4 integration of a framework-independent CraftTS project with typed services, Layers, queryEffect and Effect diagnostics. Use when editing an Effect-enabled starter or introducing Effect domain code.
---

# CraftTS + Effect v4

This project deliberately uses Effect v4 (effect@${EFFECT_V4_VERSION}) and
@craft-ts/effect. Keep the boundary explicit:

- domain operations return Effect.Effect and depend on Context.Service;
- production implementations are supplied by Layer;
- UI data loading uses queryEffect, never a component-side runPromise;
- installCraftEffectBridge() is installed once at bootstrap;
- run npm run effect-check after changing an Effect generator, service or
  Layer, then run the architecture suite.

Do not silently replace Effect v4 APIs with v3 examples. Confirm a symbol in
the installed package before using it.
`;

const AGENTS_MD = (mode: CreateMode, config?: StarterConfig): string => `# CraftTS project

This project was created with \`craft create\` using frontend **${config?.frontendRuntime ?? (mode === 'effect' ? 'effect' : 'plain')}** and backend **${config?.backendRuntime ?? 'none'}** runtimes.

Read \`.agents/skills/craft-ts-project/SKILL.md\` before changing application
code. ${config?.i18n.enabled ? 'The type-safe i18n contract lives in `src/i18n/`; run `npm run i18n:check` and `npm run i18n:test` when changing it.' : ''} ${mode === 'effect' || config?.backendRuntime === 'effect' ? 'Effect-specific guidance is in `.agents/skills/craft-ts-effect-v4/SKILL.md`.' : ''}

## Runtime boundaries

Frontend runtime: ${config?.frontendRuntime ?? (mode === 'effect' ? 'effect' : 'plain')}.
Backend runtime: ${config?.backendRuntime ?? 'none'}. A backend Effect runtime
never authorizes importing Effect into browser components.

The architecture suite is a graph contract. Run \`npm run architecture\`;
do not add a test per feature. Add a rule only for a recurring product-level
dependency smell not already covered by the baseline helpers.
`;

type TemplateContext = {
  readonly projectName: string;
  readonly config: StarterConfig;
  readonly mode: CreateMode;
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly i18nStrict: boolean;
  readonly packageVersion?: string;
};

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function packageJson(context: TemplateContext): string {
  const effectFrontend = context.config.frontendRuntime === 'effect';
  const effectBackend = context.config.backendRuntime === 'effect';
  const hasEffect = effectFrontend || effectBackend;
  const hasI18n = context.config.i18n.enabled;
  const hasTypedCss = context.config.typedCss;
  const hasServer = context.config.backendRuntime !== 'none';
  const localReferences = context.config.references.mode === 'local';
  const sourceReferences = context.config.references.mode === 'source';
  const packageVersion = context.packageVersion ?? CRAFT_TS_STARTER_VERSION;
  const craftPackage = (name: string): string => (localReferences || sourceReferences) && context.config.references.craftTs
    ? `file:.references/craft-ts/${sourceReferences ? craftReferencePackagePath(name) : `dist/libs/${name}`}`
    : packageVersion;
  const effectPackage = localReferences && context.config.references.effectTs
    ? 'file:.references/effect-ts/packages/effect'
    : EFFECT_V4_VERSION;
  return json({
    name: context.projectName,
    private: true,
    type: 'module',
    engines: { node: '>=20.19.0' },
    scripts: {
      dev: 'node scripts/dev.mjs',
      build: 'vite build',
      lint: 'eslint .',
      typecheck: 'node scripts/typecheck.mjs',
      'typecheck-spec': 'tsc -p tsconfig.spec.json --noEmit',
      ...(hasI18n ? { 'i18n:check': 'craft i18n check', 'i18n:test': 'craft i18n test' } : {}),
      test: 'vitest run --config vitest.config.ts',
      e2e: 'playwright test',
      'logs:server': 'craft-ts-log-server',
      'logs:mcp': 'craft-ts-log-mcp',
      'registry:mcp': 'craft-ts-registry-mcp',
      ...(hasEffect
        ? {
            'effect-check':
              'node scripts/run-effect-tsgo.mjs diagnostics --project tsconfig.effect.json --severity error,warning',
          }
        : {}),
      ...(hasTypedCss ? { 'style:check': 'node scripts/style-check.mjs' } : {}),
      ...(hasServer ? {
        'server:test': 'vitest run --config vitest.server.config.ts',
      } : {}),
      ...(context.config.references.craftTs || context.config.references.effectTs
        ? {
            'update:references': 'node scripts/update-references.mjs',
            ...(context.config.references.craftTs ? { 'update:craft-ts': 'node scripts/update-craft-ts.mjs' } : {}),
            ...(context.config.references.effectTs ? { 'update:effect-ts': 'node scripts/update-effect-ts.mjs' } : {}),
          }
        : {}),
      architecture: 'vitest run --config vitest.architecture.config.ts',
      'typecheck-architecture':
        'tsc -p tsconfig.architecture.json --noEmit',
    },
    dependencies: {
      '@craft-ts/component': craftPackage('component'),
      '@craft-ts/core': craftPackage('core'),
      ...(hasI18n ? { '@craft-ts/i18n': craftPackage('i18n') } : {}),
      ...(hasTypedCss ? { '@craft-ts/style': craftPackage('style') } : {}),
      ...(hasEffect && hasI18n ? { '@craft-ts/i18n-effect': craftPackage('i18n-effect') } : {}),
      ...(hasEffect ? { '@craft-ts/effect': craftPackage('effect'), effect: effectPackage } : {}),
    },
    devDependencies: {
      '@craft-ts/dev-tools': craftPackage('dev-tools'),
      '@craft-ts/mcp': craftPackage('mcp'),
      '@craft-ts/function-registry-mcp': craftPackage('function-registry-mcp'),
      '@craft-ts/log-mcp': craftPackage('log-mcp'),
      '@craft-ts/log-server': craftPackage('log-server'),
      effect: effectPackage,
      ...(hasTypedCss ? { '@craft-ts/style-testing': craftPackage('style-testing') } : {}),
      '@playwright/test': '^1.52.0',
      '@types/node': '^22.0.0',
      'jsdom': '^27.1.0',
      'rxjs': '^7.8.0',
      'tslib': '^2.3.0',
      ...(hasEffect
        ? {
            '@effect/tsgo': localReferences && context.config.references.effectTs
              ? 'file:.references/effect-ts/packages/tsgo'
              : '^0.24.3',
            '@typescript/native': 'npm:typescript@7.0.2',
          }
        : {}),
      '@eslint/js': '^9.0.0',
      'eslint': '^9.0.0',
      'eslint-config-prettier': '^10.0.0',
      'eslint-plugin-playwright': '^2.0.0',
      'typescript': '^6.0.3',
      'typescript-eslint': '^8.0.0',
      'vite': '^8.0.0',
      'vitest': '^4.0.0',
    },
  });
}

function craftReferencePackagePath(name: string): string {
  if (name === 'mcp' || name === 'function-registry-mcp' || name === 'log-mcp') {
    return `packages/${name}`;
  }
  if (name === 'log-server') return 'apps/log-server';
  return `libs/${name}`;
}

function sourceReferenceRoot(context: TemplateContext): string {
  return context.config.workspace.kind === 'nx'
    ? '../../.references/craft-ts'
    : './.references/craft-ts';
}

function sourceReferenceAliases(context: TemplateContext): Record<string, string> {
  const root = sourceReferenceRoot(context);
  const aliases: Record<string, string> = {
    '@craft-ts/core': `${root}/libs/core/src/index.ts`,
    '@craft-ts/component': `${root}/libs/component/src/index.ts`,
    '@craft-ts/i18n': `${root}/libs/i18n/src/index.ts`,
    '@craft-ts/style': `${root}/libs/style/src/index.ts`,
    '@craft-ts/style/vite': `${root}/libs/style/src/plugin/vite.ts`,
    '@craft-ts/style-testing': `${root}/libs/style-testing/src/index.ts`,
    '@craft-ts/dev-tools': `${root}/libs/dev-tools/src/index.ts`,
  };
  if (context.config.frontendRuntime === 'effect' || context.config.backendRuntime === 'effect') {
    aliases['@craft-ts/effect'] = `${root}/libs/effect/src/index.ts`;
  }
  if (context.config.i18n.enabled && (context.config.frontendRuntime === 'effect' || context.config.backendRuntime === 'effect')) {
    aliases['@craft-ts/i18n-effect'] = `${root}/libs/i18n-effect/src/index.ts`;
  }
  return aliases;
}

function tsconfig(context: TemplateContext): string {
  const hasEffect = context.config.frontendRuntime === 'effect' || context.config.backendRuntime === 'effect';
  const hasServer = context.config.backendRuntime !== 'none';
  const sourceAliases = context.config.references.mode === 'source' && context.config.references.craftTs
    ? Object.fromEntries(Object.entries(sourceReferenceAliases(context)).map(([name, path]) => [name, [path]]))
    : undefined;
  return json({
    compilerOptions: {
      target: 'ES2022',
      module: 'preserve',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      erasableSyntaxOnly: false,
      skipLibCheck: true,
      types: ['node'],
      ...(sourceAliases ? { paths: sourceAliases } : {}),
    },
    references: [
      { path: './tsconfig.app.json' },
      { path: './tsconfig.spec.json' },
      { path: './tsconfig.architecture.json' },
      ...(hasEffect ? [{ path: './tsconfig.effect.json' }] : []),
      ...(hasServer ? [{ path: './tsconfig.server.json' }] : []),
    ],
  });
}

const tsconfigApp = `{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["vite/client"] },
  "files": ["src/main.ts"],
  "include": ["src/**/*.d.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}\n`;

const tsconfigSpec = `{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node", "vitest/globals", "vite/client"] },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "e2e/**/*.ts"],
  "exclude": ["src/main.ts"]
}\n`;

const tsconfigEffect = `{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}\n`;

function viteConfig(context: TemplateContext): string {
  const typedCss = context.config.typedCss;
  const hasServer = context.config.backendRuntime !== 'none';
  const sourceReferences = context.config.references.mode === 'source' && context.config.references.craftTs;
  const sourceRoot = sourceReferenceRoot(context);
  const styleImport = sourceReferences
    ? `import { craftStyle } from '${sourceRoot}/libs/style/src/plugin/vite.ts';`
    : "import { craftStyle } from '@craft-ts/style/vite';";
  const sourceAliasEntries = Object.entries(sourceReferenceAliases(context))
    .map(([name, path]) => `    ${JSON.stringify(name)}: resolvePath(import.meta.dirname, ${JSON.stringify(path)})`)
    .join(',\n');
  const styleAliasEntries = sourceReferences
    ? sourceAliasEntries
    : `    '@craft-ts/style': resolvePath(import.meta.dirname, 'node_modules/@craft-ts/style/src/index.js')`;
  const sourceAliasConfig = sourceReferences
    ? `resolve: {
    alias: {
${sourceAliasEntries}
    },
  },`
    : '';
  const stylePlugin = typedCss
    ? `    craftStyle({ dumpPath: '.craft/style-graph.json', alias: {
${styleAliasEntries}
    } }),`
    : '';
  return `import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { defineConfig, type ViteDevServer } from 'vite';
${typedCss ? styleImport : ''}

const typecheckStatusPath = new URL('./.craft/typecheck-status.json', import.meta.url);

function readTypecheckStatus(): { status: 'running' | 'passed' | 'failed' } {
  try {
    const value = JSON.parse(readFileSync(typecheckStatusPath, 'utf8')) as { status?: string };
    if (value.status === 'running' || value.status === 'passed' || value.status === 'failed') {
      return { status: value.status };
    }
  } catch {
    // The type-check process may not have written its first status yet.
  }
  return { status: 'running' };
}

function craftTypecheckStatusPlugin() {
  return {
    name: 'craft-typecheck-status',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__craft/typecheck', (_request, response) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.setHeader('cache-control', 'no-store');
        response.end(JSON.stringify(readTypecheckStatus()));
      });
    },
  };
}

${hasServer ? `function serverFunctionsPlugin() {
  return {
    name: 'craft-starter-server-functions',
    async configureServer(server: ViteDevServer) {
      const module = await server.ssrLoadModule('/src/server/server.ts') as typeof import('./src/server/server');
      server.middlewares.use('/__server-functions', (request, response) => {
        void module.handleRequest(request, response);
      });
    },
  };
}` : ''}

export default defineConfig({
  plugins: [
    craftTypecheckStatusPlugin(),
${typedCss ? `    // Evaluates every *.style.ts in Node and emits the generated sheet.
${stylePlugin}` : ''}
${hasServer ? '    serverFunctionsPlugin(),' : ''}
  ],
  server: {
    host: '127.0.0.1',
    port: 4173,
    forwardConsole: true,
  },
${sourceAliasConfig}
  build: { target: 'es2022' },
});
`;
}

const tsconfigServer = `{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"], "noEmit": true },
  "include": ["src/server/**/*.ts", "src/**/*.fn-serveur.ts", "src/**/*.mw-serveur.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}
`;

function typecheckScript(context: TemplateContext): string {
  const projects = ['tsconfig.app.json', ...(context.config.backendRuntime !== 'none' ? ['tsconfig.server.json'] : [])];
  return `import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const statusPath = resolve(projectRoot, '.craft/typecheck-status.json');
const nonBlocking = process.argv.includes('--non-blocking');

function writeStatus(status) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, JSON.stringify({ status, updatedAt: new Date().toISOString() }) + '\\n');
}

writeStatus('running');
const projects = ${JSON.stringify(projects)};
let exitCode = 0;
for (const project of projects) {
  const result = spawnSync(resolve(projectRoot, 'node_modules/.bin/tsc'), [
    '-p', project, '--noEmit', '--pretty', 'false',
  ], { cwd: projectRoot, stdio: 'inherit' });
  if (result.status !== 0) exitCode = result.status ?? 1;
}
writeStatus(exitCode === 0 ? 'passed' : 'failed');
process.exitCode = exitCode === 0 || nonBlocking ? 0 : exitCode;
`;
}

const devScript = `import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const processes = [
  spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], {
    cwd: projectRoot,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [resolve(projectRoot, 'scripts/typecheck.mjs'), '--non-blocking'], {
    cwd: projectRoot,
    stdio: 'inherit',
  }),
];

const stop = () => {
  for (const child of processes) child.kill('SIGTERM');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
processes[0].once('exit', (code) => {
  stop();
  process.exitCode = code ?? 1;
});
`;

const effectTsgoRunner = `import { chmodSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const effectTsgoPath = resolve(projectRoot, 'node_modules/.bin/effect-tsgo');
if (process.platform !== 'win32') {
  const nativeBinary = resolve(
    projectRoot,
    'node_modules',
    '@effect',
    'tsgo-' + process.platform + '-' + process.arch,
    'lib',
    'tsc',
  );
  if (existsSync(nativeBinary)) chmodSync(nativeBinary, 0o755);
}
const result = spawnSync(effectTsgoPath, process.argv.slice(2), {
  cwd: projectRoot,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
`;

const styleCheckScript = `import { existsSync } from 'node:fs';
const root = import.meta.dirname + '/..';
if (!existsSync(root + '/vite.config.ts')) throw new Error('Missing Vite configuration');
console.log('Typed CSS configuration present.');
`;

const vitestConfig = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'craft-ts-app',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
});
`;

const eslintConfig = (effect: boolean, backendEffect = false) => `import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';
import craftRules from '@craft-ts/dev-tools/eslint-rules';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '**/architecture/catalog.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.security.rules,
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/server/**/*.ts',
      'src/**/*.fn-serveur.ts',
      'src/**/*.mw-serveur.ts',
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
    ],
    plugins: { 'craft-ts': craftRules },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...craftRules.configs.${effect ? 'effect' : 'recommended'}.rules,
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
${effect ? '' : "      'craft-ts/no-effect-import-in-frontend': 'error',"}
    },
  },
  {
    files: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    rules: {
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
      'craft-ts/prefer-browser-boundaries': 'off',
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-ephemeral-template-form-state': 'off',
    },
  },
${backendEffect ? `  {
    files: ['src/server/**/*.ts', 'src/**/*.fn-serveur.ts', 'src/**/*.mw-serveur.ts'],
    plugins: { 'craft-ts': craftRules },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.server.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...craftRules.configs.effect.rules,
    },
  },` : ''}
  {
    files: ['e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly' },
    },
  },
  prettier,
);
`;

function indexHtml(locale: string): string {
  return `<!doctype html>
<html lang="${locale}" dir="${/^ar|he|fa|ur/.test(locale) ? 'rtl' : 'ltr'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CraftTS starter</title>
  </head>
  <body>
    <craft-root></craft-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
}

/**
 * What has to stay global, and nothing else.
 *
 * The card, the muted note and the error message moved to
 * src/app/ui/ui.style.ts, where they are typed and enumerable. What is left is
 * the part a sheet cannot own: element defaults, the focus ring, the
 * locale-driven typography variables the i18n harness writes, and the dev-only
 * type-check indicator, which is built imperatively and never renders through a
 * component.
 */
const styles = `:root {
  --craft-font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  --craft-font-size-heading: 2rem;
  --craft-font-size-body: 1rem;
  --craft-font-size-label: .875rem;
  --craft-font-size-button: .9375rem;
  --craft-font-size-caption: .75rem;
  --craft-line-height-heading: 1.2;
  --craft-line-height-body: 1.5;
  --craft-line-height-label: 1.35;
  --craft-line-height-button: 1.35;
  --craft-line-height-caption: 1.35;
  font-family: var(--craft-font-family); color: #172033; background: #f7f8fb;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; }
a { color: #2457d6; }
main { max-width: 860px; margin: 0 auto; padding: 3rem 1.25rem; }
nav { display: flex; gap: 1rem; padding: 1rem 1.25rem; background: white; border-bottom: 1px solid #e3e7ef; }
button:focus-visible, a:focus-visible { outline: 3px solid #7aa2ff; outline-offset: 3px; }
.heading { font-size: var(--craft-font-size-heading); line-height: var(--craft-line-height-heading); font-weight: 700; }
body, .body { font-size: var(--craft-font-size-body); line-height: var(--craft-line-height-body); }
label, .label { font-size: var(--craft-font-size-label); line-height: var(--craft-line-height-label); font-weight: 600; }
button, .button { font: inherit; font-size: var(--craft-font-size-button); line-height: var(--craft-line-height-button); }
.caption { font-size: var(--craft-font-size-caption); line-height: var(--craft-line-height-caption); }
.craft-typecheck-indicator { position: fixed; top: .75rem; right: .75rem; z-index: 9999; display: inline-flex; align-items: center; gap: .4rem; max-width: min(24rem, calc(100vw - 1.5rem)); padding: .35rem .4rem .35rem .55rem; border: 1px solid #bfdbfe; border-radius: .45rem; color: #1e3a8a; background: #eff6ff; box-shadow: 0 4px 12px #1e3a8a1f; font-size: .7rem; font-weight: 600; }
.craft-typecheck-indicator::before { width: .55rem; height: .55rem; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; content: ''; animation: craft-typecheck-spin .8s linear infinite; }
.craft-typecheck-indicator[data-status='failed'] { border-color: #fecaca; color: #991b1b; background: #fef2f2; box-shadow: 0 4px 12px #991b1b1f; }
.craft-typecheck-indicator[data-status='failed']::before { border: 0; content: '⚠'; animation: none; font-size: .8rem; }
.craft-typecheck-indicator__dismiss { display: inline-grid; width: 1.25rem; height: 1.25rem; padding: 0; border: 0; border-radius: .25rem; color: currentColor; background: transparent; cursor: pointer; font: inherit; font-size: 1rem; line-height: 1; place-items: center; }
.craft-typecheck-indicator__dismiss:hover, .craft-typecheck-indicator__dismiss:focus-visible { background: #991b1b1a; outline: 2px solid currentColor; outline-offset: 1px; }
@keyframes craft-typecheck-spin { to { transform: rotate(360deg); } }
`;

function stylesFor(context: TemplateContext): string {
  if (context.config.designSystem === 'none' || context.config.typedCss) return styles;
  return `${styles}
.starter-theme { min-height: 100vh; }
.starter-card { padding: 1.25rem; border: 1px solid #e3e7ef; border-radius: .75rem; background: #fff; }
.starter-note { color: #5c677d; }
.starter-message { color: #b42318; }
`;
}

const projectTokensTs = `import { dateLong, money, number } from '@craft-ts/i18n';

export const orderCount = number('count');
export const orderAmount = money('amount', undefined, { currency: 'EUR', minimumFractionDigits: 2 });
export const orderDate = dateLong('date');
`;

const typographyTs = `export const typography = {
  family: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fallback: 'system-ui, sans-serif',
  roles: {
    heading: { fontSize: '2rem', lineHeight: '1.2', fontWeight: 700 },
    body: { fontSize: '1rem', lineHeight: '1.5', fontWeight: 400 },
    label: { fontSize: '.875rem', lineHeight: '1.35', fontWeight: 600 },
    button: { fontSize: '.9375rem', lineHeight: '1.35', fontWeight: 600 },
    caption: { fontSize: '.75rem', lineHeight: '1.35', fontWeight: 400 },
  },
} as const;

export type TypographyRole = keyof typeof typography.roles;
`;

const STARTER_PLURAL_CATEGORIES: Record<string, readonly string[]> = {
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  cy: ['zero', 'one', 'two', 'few', 'many', 'other'],
  ga: ['one', 'two', 'few', 'many', 'other'],
  pl: ['one', 'few', 'many', 'other'],
  ru: ['one', 'few', 'many', 'other'],
  uk: ['one', 'few', 'many', 'other'],
  cs: ['one', 'few', 'many', 'other'],
  sk: ['one', 'few', 'many', 'other'],
  sl: ['one', 'two', 'few', 'other'],
  ja: ['other'],
  zh: ['other'],
  fr: ['one', 'other'],
  en: ['one', 'other'],
};

function starterPluralCategories(locales: readonly string[]): readonly string[] {
  return [...new Set(locales.flatMap((locale) => STARTER_PLURAL_CATEGORIES[locale.toLowerCase().split('-')[0] ?? ''] ?? ['one', 'other']))];
}

function i18nCatalogTs(locales: readonly string[]): string {
  const categories = starterPluralCategories(locales);
  const branches = categories.map((category) => `      ${category}: msg\`\${orderCount} ${category === 'one' ? 'item' : 'items'}\`,`).join('\n');
  return `import { defineCatalog, msg, plural } from '@craft-ts/i18n';
import { orderAmount, orderCount, orderDate } from './project-tokens';

// Add application keys here. Every locale is checked against this shape.
export const baseCatalog = defineCatalog({
  order: {
    summary: msg\`Order ${'${'}orderAmount} on ${'${'}orderDate}: ${'${'}orderCount} item(s).\`,
    items: plural(orderCount, {
${branches}
    }),
  },
});
`;
}

function i18nLocaleTs(locale: string, index: number, locales: readonly string[]): string {
  const isFrench = locale.toLowerCase().startsWith('fr');
  const categories = starterPluralCategories(locales);
  const branches = categories.map((category) => {
    const word = isFrench ? (category === 'one' ? 'article' : 'articles') : (category === 'one' ? 'item' : 'items');
    return `      ${category}: msg\`\${orderCount} ${word}\`,`;
  }).join('\n');
  if (index === 0) {
    return `import { defineLocale } from '@craft-ts/i18n';
import { baseCatalog } from '../catalog';

export const ${locale.replace(/[^a-zA-Z0-9]/g, '')} = defineLocale('${locale}', baseCatalog);
`;
  }
  const summary = isFrench
    ? 'Le ${orderDate}, la commande contient ${orderCount} article(s) pour ${orderAmount}.'
    : 'Order ${orderAmount} on ${orderDate}: ${orderCount} item(s).';
  return `import { defineLocaleLike, msg, plural } from '@craft-ts/i18n';
import { orderAmount, orderCount, orderDate } from '../project-tokens';
import { ${locales[0].replace(/[^a-zA-Z0-9]/g, '')} } from './${locales[0]}';

export const ${locale.replace(/[^a-zA-Z0-9]/g, '')} = defineLocaleLike(${locales[0].replace(/[^a-zA-Z0-9]/g, '')}, '${locale}', {
  order: {
    summary: msg\`${summary}\`,
    items: plural(orderCount, {
${branches}
    }),
  },
});
`;
}

function i18nRuntimeTs(context: TemplateContext): string {
  const localeImports = context.locales.map((locale) => `import { ${locale.replace(/[^a-zA-Z0-9]/g, '')} } from './locales/${locale}';`).join('\n');
  const localeValues = context.locales.map((locale) => locale.replace(/[^a-zA-Z0-9]/g, '')).join(', ');
  return `import { createI18nRuntime } from '@craft-ts/i18n';
${localeImports}

export const i18n = createI18nRuntime({
  locales: [${localeValues}],
  defaultLocale: '${context.defaultLocale}',
  strict: ${context.i18nStrict},
});

export function setLocale(locale: typeof i18n.locale extends () => infer Id ? Id : never): void {
  i18n.setLocale(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.documentElement.dir = /^ar|he|fa|ur/.test(locale) ? 'rtl' : 'ltr';
  }
}

const requestedLocale = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('locale') : null;
if (requestedLocale && [${context.locales.map((locale) => `'${locale}'`).join(', ')}].includes(requestedLocale)) {
  setLocale(requestedLocale as Parameters<typeof setLocale>[0]);
}
`;
}

const i18nIndexTs = `export * from './catalog';
export * from './project-tokens';
export * from './runtime';
export * from './typography';
`;

const effectI18nTs = `import { translateEffect } from '@craft-ts/i18n-effect';
export { translateEffect };
`;

const effectLayerTs = `import { provideI18nRuntime } from '@craft-ts/i18n-effect';
import { i18n } from './runtime';

export const i18nLayer = provideI18nRuntime(i18n);
`;

/**
 * The starter's design system, in one sheet.
 *
 * It is deliberately small — a palette, one state axis, one set of typed
 * variables, three classes — but it is the real thing: every value is a token,
 * the variant is an attribute rather than a class string, and the whole file is
 * evaluated in Node by the build plugin.
 *
 * A `*.style.ts` may import vocabulary and nothing else. `style-file-boundary`
 * enforces it, and that is exactly what makes importing this file in Node safe:
 * there is no application code in it to run.
 */
const uiStyleTs = `import {
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  darkOf,
  defineStateAxis,
  definePalette,
  display,
  kind,
  lineWidth,
  p,
  radii,
  radius,
  scheme,
  set,
  space,
  when,
} from '@craft-ts/style';

// ─── palette ────────────────────────────────────────────────────────────────
// Every token carries both of its values; the group it sits in gives it a role.

export const ui = definePalette({
  surface: {
    page: { light: '#f7f8fb', dark: '#0b0d11' },
    raised: { light: '#ffffff', dark: '#151922' },
  },
  text: {
    strong: { light: '#172033', dark: '#f2f4f8' },
    muted: { light: '#5c677d', dark: '#98a2b3' },
  },
  border: {
    subtle: { light: '#e3e7ef', dark: '#232936' },
  },
  accent: {
    info: { light: '#2457d6', dark: '#7aa2ff' },
    danger: { light: '#b42318', dark: '#ff6b6b' },
  },
});

// ─── axes ───────────────────────────────────────────────────────────────────
// A component may only vary along an axis declared here. The point carries the
// driver that reaches it, so a state the matrix enumerates is a state a test
// can produce.

/** Drives \`data-tone\` on the element that carries it. */
export const tone = defineStateAxis('tone', ['neutral', 'danger']);

// ─── theme ──────────────────────────────────────────────────────────────────

/**
 * \`inherits: true\` belongs to theme variables and to nothing else: they are
 * set once on a wrapper and read by everything below. The default, \`false\`,
 * is right for a variable an element both sets and reads on itself.
 */
const themed = { inherits: true } as const;

export const theme = cssVars('app', {
  ink: kind.color(ui.text.strong, themed),
  inkMuted: kind.color(ui.text.muted, themed),
  raised: kind.color(ui.surface.raised, themed),
  border: kind.color(ui.border.subtle, themed),
  accent: kind.color(ui.accent.info, themed),
});

/** Dark mode is one rule, here — not one rule per component. */
export const appTheme = craftStyles('appTheme', {
  root: [
    set(theme.ink, ui.text.strong),
    set(theme.inkMuted, ui.text.muted),
    set(theme.raised, ui.surface.raised),
    set(theme.border, ui.border.subtle),
    set(theme.accent, ui.accent.info),
    when(scheme.dark, [
      set(theme.ink, darkOf(ui.text.strong)),
      set(theme.inkMuted, darkOf(ui.text.muted)),
      set(theme.raised, darkOf(ui.surface.raised)),
      set(theme.border, darkOf(ui.border.subtle)),
      set(theme.accent, darkOf(ui.accent.info)),
    ]),
  ],
});

// ─── classes ────────────────────────────────────────────────────────────────
// A component reads theme variables, never palette tokens: that indirection is
// what keeps dark mode above, in one place.

export const surface = craftStyles('appSurface', {
  card: [
    display.block,
    p(space(5)),
    bg(theme.raised),
    color(theme.ink),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.border),
    radius(radii.md),
  ],
  note: [color(theme.inkMuted)],
  /**
   * One class, two states. The template sets \`data-tone\`; nothing here
   * produces a name a template has to assemble.
   */
  message: [
    color(theme.accent),
    when(tone.danger, [set(theme.accent, ui.accent.danger)]),
  ],
});
`;

const uiPlainTs = `export const appTheme = { root: 'starter-theme' } as const;
export const surface = {
  card: 'starter-card',
  note: 'starter-note',
  message: 'starter-message',
} as const;
`;

function uiComponentsTs(context: TemplateContext): string {
  const styleImport = context.config.typedCss
    ? "import { surface } from './ui.style';"
    : "import { surface } from './ui';";
  return `import { button, craftComponent, div, p } from '@craft-ts/component';
${styleImport}

export const Stack = craftComponent('Stack', {}, () => ({}), () => div({ class: surface.card }, []));
export const Card = craftComponent('Card', {}, () => ({}), () => div({ class: surface.card }, []));
export const Button = craftComponent('Button', {}, () => ({}), () => button('continue', { class: surface.card }, 'Continue'));
export const Alert = craftComponent('Alert', {}, () => ({}), () => p({ class: surface.message, 'data-tone': 'danger' }, 'Alert'));
`;
}

function mainTs(context: TemplateContext): string {
  return `import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { startCraftTypecheckIndicator } from './dev-typecheck-indicator';
import './styles.css';
${context.config.typedCss ? "import 'virtual:craft-style.css';" : ''}

startCraftTypecheckIndicator();
bootstrapCraft({ config: appConfig });
`;
}

const typecheckIndicatorTs = `/// <reference types="vite/client" />

/* eslint-disable craft-ts/prefer-browser-boundaries, craft-ts/no-direct-temporal-globals, craft-ts/prefer-craft-http-transport, craft-ts/no-async-await -- Dev-server bootstrap adapter, intentionally outside the Craft component tree. */
export function startCraftTypecheckIndicator(): void {
  if (!import.meta.env.DEV) return;

  const indicator = document.createElement('div');
  const message = document.createElement('span');
  const dismiss = document.createElement('button');

  indicator.className = 'craft-typecheck-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  message.textContent = 'Type checking in progress…';
  dismiss.type = 'button';
  dismiss.className = 'craft-typecheck-indicator__dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss type-check warning');
  dismiss.title = 'Dismiss';
  dismiss.textContent = '×';
  dismiss.hidden = true;
  indicator.append(message, dismiss);
  document.body.append(indicator);

  let dismissed = false;
  dismiss.addEventListener('click', () => {
    dismissed = true;
    indicator.remove();
  });

  const poll = async (): Promise<void> => {
    try {
      const response = await fetch('/__craft/typecheck', { cache: 'no-store' });
      const payload = (await response.json()) as { status?: 'running' | 'passed' | 'failed' };
      if (dismissed) return;
      if (payload.status === 'passed') {
        indicator.remove();
        return;
      }
      if (payload.status === 'failed') {
        indicator.dataset['status'] = 'failed';
        message.textContent = 'Type checking failed — app is still running';
        dismiss.hidden = false;
        return;
      }
    } catch {
      // Keep polling while Vite is starting.
    }
    window.setTimeout(() => void poll(), 250);
  };
  void poll();
}
`;

function appTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const uiImport = designSystem
    ? `import { appTheme } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';`
    : '';
  const themeOpen = designSystem
    ? 'div({ class: appTheme.root }, ['
    : 'div([';
  const themeClose = designSystem ? '])' : '])';
  return `import {
  a,
  CraftRouterOutlet,
  craftComponent,
  div,
  main,
  nav,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
${uiImport}

export const App = craftComponent(
  'App',
  {},
  () => ({}),
  () =>
    ${themeOpen}
      nav([
        a('home', { craftRouterLink: { to: '' } }, 'Home').pipe(CraftRouterLink),
        a('services', { craftRouterLink: { to: 'services' } }, 'Services').pipe(CraftRouterLink),
        a('about', { craftRouterLink: { to: 'about' } }, 'About').pipe(CraftRouterLink),
      ]),
      main(CraftRouterOutlet()),
    ${themeClose},
);
`;
}

function routesTs(context: TemplateContext): string {
  const httpErrorHandler = context.config.frontendRuntime === 'plain'
    ? `    HttpError: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
`
    : '';
  const welcomeErrorHandler = context.config.frontendRuntime === 'effect'
    ? `      ${context.config.backendRuntime === 'none' ? 'WelcomeApiError' : 'EffectFailure'}: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
`
    : '';
  return `import { loadCraftComponent } from '@craft-ts/component';
import {
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftRoute,
  craftRoutes,
  type CanRun,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';

export const { appRoutes } = craftRoutes('app', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./home-page')).then(
        (module: typeof import('./home-page')) => module.default,
      ),
    ),
  }, {
${httpErrorHandler}
${welcomeErrorHandler}  }),
  craftRoute('about', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./about-page')).then(
        (module: typeof import('./about-page')) => module.default,
      ),
    ),
  }, {
    HttpError: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
  }),
  craftRoute('services', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./services-page')).then(
        (module: typeof import('./services-page')) => module.default,
      ),
    ),
  }, {
    HttpError: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
  }),
]);

assertExhaustiveRouteExceptions(appRoutes);

type _CheckHomePageDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./home-page'))['default']>,
  'CraftRouter',
  never,
  'component: home-page'
>;
type _CanRunHomePage = CanRun<_CheckHomePageDI>;

type _CheckAboutPageDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./about-page'))['default']>,
  'CraftRouter',
  never,
  'component: about-page'
>;
type _CanRunAboutPage = CanRun<_CheckAboutPageDI>;

type _CheckServicesPageDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./services-page'))['default']>,
  'CraftRouter',
  never,
  'component: services-page'
>;
type _CanRunServicesPage = CanRun<_CheckServicesPageDI>;

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    App: typeof appRoutes.META_PATHS;
  }
}
`;
}

function plainAppConfig(context: TemplateContext): string {
  const serverTransport = context.config.backendRuntime !== 'none'
    ? '  provideDefaultServerFunctionTransport(),\n'
    : '';
  return `import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideCraftDevTools,
  provideCraftRouter,
${context.config.backendRuntime !== 'none' ? '  provideDefaultServerFunctionTransport,\n' : ''}
} from '@craft-ts/core';
import { App } from './app';
import { appRoutes } from './app.routes';

const developmentProviders = import.meta.env.DEV ? provideCraftDevTools() : [];

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_PATHS,
  providers: [
    ...developmentProviders,
    provideCraftRootComponent(App),
    provideCraftRouter(appRoutes.toRoutes()),
${serverTransport}  ],
});
`;
}

function apiTs(context: TemplateContext): string {
  if (context.config.backendRuntime !== 'none') {
    return `import { getStarterMessage } from '../starter.fn-client';
export type { StarterResponse as WelcomeResponse } from '../starter.fn-client';
export function loadWelcome() {
  return getStarterMessage({ filter: 'starter' });
}
`;
  }
  return `import { CraftHttpClient } from '@craft-ts/core';

export type WelcomeResponse = {
  readonly title: string;
  readonly body: string;
};

export function* loadWelcome() {
  return yield* CraftHttpClient.get(({ response }) => ({
    url: '/api/welcome',
    success: response<WelcomeResponse>(),
  }));
}
`;
}

function serverFiles(context: TemplateContext): Record<string, string> {
  if (context.config.backendRuntime === 'none') return {};
const effect = context.config.backendRuntime === 'effect';
  const fnServer = effect
    ? `import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { StarterRepository } from './server/repository';

const inputSchema = Schema.toStandardSchemaV1(Schema.Struct({ filter: Schema.String }));
const outputSchema = Schema.toStandardSchemaV1(Schema.Struct({ title: Schema.String, body: Schema.String }));

export type StarterResponse = { readonly title: string; readonly body: string };

export const getStarterMessage = serverFunction(
  'starter.welcome', inputSchema, { exposure: 'client', output: outputSchema },
).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StarterRepository;
  return yield* repository.welcome(input.filter);
})).exposeErrors({});
`
    : `import { flatMapContext, mapContext, portableServerFunction } from '@craft-ts/core';
import type { StandardSchemaV1 } from '@craft-ts/core';
import { StarterRepository } from './server/repository';

type Input = { readonly filter: string };
const inputSchema: StandardSchemaV1<Input, Input> = { '~standard': { version: 1, vendor: 'craft-starter', types: undefined,
  validate(value: unknown) { return typeof value === 'object' && value !== null && typeof (value as Input).filter === 'string'
    ? { value: value as Input } : { issues: [{ message: 'filter must be a string' }] }; } } };
export type StarterResponse = { readonly title: string; readonly body: string };

export const getStarterMessage = portableServerFunction('starter.welcome', inputSchema, { exposure: 'client' })
  .pipe(
    mapContext(({ input }) => ({ normalizedFilter: input.filter.trim() })),
    flatMapContext(() => StarterRepository.welcome()),
  )
  .handler(async ({ context }) => context.value)
  .exposeErrors({});
`;
  const repository = effect
    ? `import { Context, Effect, Layer } from 'effect';

export type StarterRepositoryShape = {
  readonly welcome: (filter: string) => Effect.Effect<{ readonly title: string; readonly body: string }>;
};
export class StarterRepository extends Context.Service<StarterRepository, StarterRepositoryShape>()('starter/StarterRepository') {}
export const StarterRepositoryLive = Layer.succeed(StarterRepository, {
  welcome: (filter) => Effect.succeed({ title: 'Hello from the server', body: 'Effect server function: ' + filter }),
});
`
    : `export const StarterRepository = {
  welcome: async () => ({ value: { title: 'Hello from the server', body: 'Promise server function works.' } }),
};
`;
  let server = '';
  if (effect) {
    server = `import { createServer } from '@craft-ts/core';
import { executeEffect } from '@craft-ts/effect';
import { getStarterMessage } from '../starter.fn-serveur';
import { StarterRepositoryLive } from './repository';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const application = createServer({ functions: [getStarterMessage], execute: executeEffect(StarterRepositoryLive).run });
export const runtime = StarterRepositoryLive;
export async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const host = typeof request.headers.host === 'string' ? request.headers.host : '127.0.0.1';
  const webResponse = await application.handle(new Request('http://' + host + '/__server-functions', {
    method: request.method,
    headers: Object.entries(request.headers).flatMap(([name, value]) => value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]]),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  }));
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
`;
  }

  if (!effect) {
    server = `import { createServer } from '@craft-ts/core';
import { getStarterMessage } from '../starter.fn-serveur';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const application = createServer({ functions: [getStarterMessage] });
export async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const host = typeof request.headers.host === 'string' ? request.headers.host : '127.0.0.1';
  const webResponse = await application.handle(new Request('http://' + host + '/__server-functions', {
    method: request.method,
    headers: Object.entries(request.headers).flatMap(([name, value]) => value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value]]),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  }));
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
`;
  }

  const client = `import { createServerFunctionClient, craftUnique } from '@craft-ts/core';
import type { getStarterMessage as ServerGetStarterMessage, StarterResponse } from './starter.fn-serveur';

export type { StarterResponse };
export const getStarterMessage = createServerFunctionClient<typeof ServerGetStarterMessage>(craftUnique('starter.welcome'));
`;
  return {
    'src/server/repository.ts': repository,
    'src/server/server.ts': server,
    'src/starter.fn-serveur.ts': fnServer,
    'src/starter.fn-client.ts': client,
    ...(effect && context.config.i18n.enabled
      ? { 'src/server/i18n.ts': "import { provideI18nRuntime, translateEffect } from '@craft-ts/i18n-effect';\nimport { i18n } from '../i18n/runtime';\nexport const serverI18nLayer = provideI18nRuntime(i18n);\nexport { translateEffect };\n" }
      : {}),
    ...(effect ? { 'src/starter.mw-serveur.ts': "import { Effect } from 'effect';\nimport { effectServerMiddleware } from '@craft-ts/effect';\nexport const starterMiddleware = effectServerMiddleware('starter.middleware', () => Effect.succeed({ value: undefined }));\n" } : {}),
    'vitest.server.config.ts': `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'craft-starter-server', globals: true, environment: 'node', include: ['src/server/**/*.spec.ts'] } });
`,
    'src/server/server.spec.ts': `import { describe, expect, it } from 'vitest';
import { application } from './server';

describe('server function registry', () => {
  it('registers the starter function', () => expect(application).toBeDefined());
});
`,
  };
}

export const EFFECT_REFERENCE_PATHS = [
  'apps/demo-effect',
  'apps/quickstart-effect',
  'apps/demo-with-server-function',
  'apps/docs/learn-effect',
  'apps/docs/tsconfig.learn-effect.json',
  'apps/docs/tests/snippets/learn-effect',
  'apps/docs/guide/advanced/effect.md',
  'apps/docs/guide/i18n/effect.md',
  'apps/docs/guide/reactivity/craft-effect.md',
  'apps/docs/guide/testing/architecture/craft-effect-imperative-sync.md',
  'apps/docs/guide/testing/architecture/craft-effect-network.md',
  'apps/docs/resources/effect-adoption.md',
  'apps/docs/resources/effect-compatibility.md',
  'apps/docs/public/assets/effect-logo-black.png',
  'apps/docs/public/assets/effect-craft-ts-hover.png',
  'apps/docs/public/assets/effect-craft-mark-hover.png',
  'libs/effect',
  'libs/i18n-effect',
  'packages/mcp/skills/craft-ts-effect-v4',
  'tools/effect-diagnostics',
  'tools/compile-learn-effect-examples.mjs',
  'tools/run-effect-tsgo.mjs',
  'tools/effect-typecost',
];

function referenceFiles(context: TemplateContext): Record<string, string> {
  if (!context.config.references.craftTs && !context.config.references.effectTs) return {};
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    mode: context.config.references.mode,
    effectEnabled: context.config.frontendRuntime === 'effect' || context.config.backendRuntime === 'effect',
  };
  if (context.config.references.craftTs) manifest['craftTs'] = {
    url: 'https://github.com/craft-ts/craft-ts.git', requestedRef: context.config.references.craftTsRef,
    resolvedSha: '', path: '.references/craft-ts',
  };
  if (context.config.references.effectTs) manifest['effectTs'] = {
    url: 'https://github.com/Effect-TS/effect.git', requestedRef: context.config.references.effectTsRef,
    resolvedSha: '', path: '.references/effect-ts',
  };
  const resolver = "export function resolveReferencePath(root, name) { const manifest = resolveReferenceManifest(root); return manifest[name] ? resolve(root, manifest[name].path) : undefined; }\nexport function resolveReferenceManifest(root) { return JSON.parse(readFileSync(join(root, '.references/manifest.json'), 'utf8')); }\nimport { readFileSync } from 'node:fs'; import { join, resolve } from 'node:path';\n";
  const updater = `import { execFileSync } from 'node:child_process'; import { readFileSync, rmSync, writeFileSync } from 'node:fs'; import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'); const manifestPath = join(root, '.references/manifest.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const effectReferencePaths = ${JSON.stringify(EFFECT_REFERENCE_PATHS)};
function pruneEffectReference(referenceRoot) { for (const relativePath of effectReferencePaths) rmSync(join(referenceRoot, relativePath), { recursive: true, force: true }); }
for (const [name, entry] of Object.entries(manifest).filter(([key, value]) => !['schemaVersion', 'mode', 'effectEnabled'].includes(key) && value && value.path)) { const path = resolve(root, entry.path); if (execFileSync('git', ['status', '--short'], { cwd: path, encoding: 'utf8' }).trim()) throw new Error('Modified reference: ' + path); execFileSync('git', ['fetch', '--depth', '1', 'origin', entry.requestedRef], { cwd: path, stdio: 'inherit' }); execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: path, stdio: 'inherit' }); if (manifest.mode === 'local' || (manifest.mode === 'source' && name === 'effectTs')) { execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: path, stdio: 'inherit' }); execFileSync('npm', ['run', 'build'], { cwd: path, stdio: 'inherit' }); } if (name === 'craftTs' && manifest.effectEnabled === false) pruneEffectReference(path); entry.resolvedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path, encoding: 'utf8' }).trim(); }
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');
`;
  return {
    '.gitignore': '.references/*\n!.references/manifest.json\n',
    '.references/manifest.json': json(manifest),
    'scripts/reference-resolver.mjs': resolver,
    'scripts/update-references.mjs': updater,
    ...(context.config.references.craftTs ? { 'scripts/update-craft-ts.mjs': updater } : {}),
    ...(context.config.references.effectTs ? { 'scripts/update-effect-ts.mjs': updater } : {}),
  };
}

function cloneReferenceIfRequested(root: string, config: StarterConfig): void {
  const entries = [
    config.references.craftTs ? ['https://github.com/craft-ts/craft-ts.git', config.references.craftTsRef, '.references/craft-ts'] : undefined,
    config.references.effectTs ? ['https://github.com/Effect-TS/effect.git', config.references.effectTsRef, '.references/effect-ts'] : undefined,
  ].filter((entry): entry is [string, string, string] => entry !== undefined);
  for (const [url, ref, relativePath] of entries) {
    const target = join(root, relativePath);
    if (!existsSync(join(target, '.git'))) {
      mkdirSync(dirname(target), { recursive: true });
      execFileSync('git', ['clone', '--depth', '1', '--branch', ref, url, target], { cwd: root, stdio: 'inherit' });
    }
    if (relativePath === '.references/craft-ts' && config.frontendRuntime !== 'effect' && config.backendRuntime !== 'effect') {
      pruneEffectReference(target);
    }
    if (config.references.mode === 'local' || (config.references.mode === 'source' && relativePath === '.references/effect-ts')) {
      execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: target, stdio: 'inherit' });
      execFileSync('npm', ['run', 'build'], { cwd: target, stdio: 'inherit' });
    }
  }
  const manifestPath = join(root, '.references', 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, { path: string; resolvedSha?: string }>;
    for (const entry of Object.values(manifest)) {
      if (!entry.path) continue;
      const target = resolve(root, entry.path);
      entry.resolvedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8' }).trim();
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
}

export function pruneEffectReference(root: string): void {
  for (const relativePath of EFFECT_REFERENCE_PATHS) {
    rmSync(join(root, relativePath), { recursive: true, force: true });
  }
}

function aboutPageTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const surfaceImport = designSystem
    ? `import { surface } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';\n`
    : '';
  const card = designSystem ? "{ class: surface.card }, " : '';
  const translated = context.config.i18n.enabled && context.config.frontendRuntime === 'effect'
    ? "p(function* () { return 'i18n: ' + (yield* translateEffect('order.summary', { amount: 1234.5, count: 2, date: Date.UTC(2026, 0, 15) })); }),"
    : context.config.i18n.enabled
    ? "p('i18n: ' + i18n.t('order.summary', { amount: 1234.5, count: 2, date: Date.UTC(2026, 0, 15) })),"
    : "p('This page proves that Craft routing and lazy component loading are wired.'),";
  const i18nImport = context.config.i18n.enabled && context.config.frontendRuntime !== 'effect'
    ? "import { i18n } from '../i18n';\n"
    : context.config.i18n.enabled ? "import { translateEffect } from '@craft-ts/i18n-effect';\n" : '';
  return `import { craftComponent, div, heading, p } from '@craft-ts/component';
${surfaceImport}${i18nImport}

export const AboutPage = craftComponent(
  'AboutPage',
  {},
  () => ({}),
  () =>
    div(${card}[
      heading('About this starter'),
      ${translated}
      p('This page proves that Craft routing and lazy component loading are wired.'),
    ]),
);

export default AboutPage;
`;
}

function servicesPageTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const uiImport = designSystem
    ? `import { surface } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';\n`
    : '';
  const card = designSystem ? "{ class: surface.card }, " : '';
  const i18n = context.config.i18n.enabled && context.config.frontendRuntime !== 'effect'
    ? "import { i18n } from '../i18n';\n"
    : '';
  const effectI18n = context.config.frontendRuntime === 'effect' && context.config.i18n.enabled
    ? "import { translateEffect } from '@craft-ts/i18n-effect';\n"
    : '';
  const body = context.config.frontendRuntime === 'effect'
    ? `p('Effect service: Context.Service + Layer + provideLayer are installed at app scope.'),
      ${context.config.i18n.enabled ? "p(function* () { return 'i18n: ' + (yield* translateEffect('order.items', { count: 2 })); })," : "p('The service contract is isolated from the page.'),"}`
    : `p(function* () { return 'Plain service: ' + (yield* StarterService()).label; }),
      ${context.config.i18n.enabled ? "p('i18n: ' + i18n.t('order.items', { count: 2 }))," : "p('The service is resolved through Craft DI.'),"}`;
  const service = context.config.frontendRuntime === 'effect'
    ? ''
    : `import { craftService } from '@craft-ts/core';

const { StarterService } = craftService({ name: 'StarterService', providedIn: 'global' }, function* () {
  return { label: 'resolved through Craft DI' };
});
`;
  return `import { craftComponent, div, heading, p } from '@craft-ts/component';
${uiImport}${i18n}${effectI18n}${service}
export const ServicesPage = craftComponent(
  'ServicesPage',
  {},
  () => ({}),
  () => div(${card}[
    heading('Services'),
    ${body}
  ]),
);

export default ServicesPage;
`;
}

function plainHomePageTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const surfaceImport = designSystem
    ? `import { surface } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';\n`
    : '';
  const card = designSystem ? "{ class: surface.card }, " : '';
  const note = designSystem ? "{ class: surface.note }, " : '';
  const message = designSystem ? "{ class: surface.message, 'data-tone': 'danger' }, " : '';
  const i18n = context.config.i18n.enabled
    ? "import { i18n } from '../i18n';\n"
    : '';
  const summary = context.config.i18n.enabled
    ? "p('i18n: ' + i18n.t('order.summary', { amount: 1234.5, count: 2, date: Date.UTC(2026, 0, 15) })),"
    : "p('A framework-independent starter with a typed API boundary.'),";
  const loadExpression = context.config.backendRuntime === 'none'
    ? 'return yield* loadWelcome();'
    : 'return loadWelcome();';
  return `import {
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  span,
} from '@craft-ts/component';
import { craftComputed, query } from '@craft-ts/core';
${i18n}${surfaceImport}
import { loadWelcome } from './api';
export const HomePage = craftComponent(
  'HomePage',
  {},
  function* () {
    const welcomeQuery = yield* query(
      'welcomeQuery',
      {
        params: () => true,
        loader: function* () {
          ${loadExpression}
        },
      },
      ({ resource }) => ({
        hasWelcome: craftComputed('hasWelcome', () => resource.hasValue()),
      }),
    );
    return { welcomeQuery };
  },
  ({ welcomeQuery }) =>
    div(${card}[
      heading('Welcome to CraftTS'),
      ${summary}
      ifNode(welcomeQuery.isLoading, () => p(${note}'Loading API…')),
      ifNode(welcomeQuery.hasWelcome, () =>
        div([
          p(function* () {
            const welcome = yield* welcomeQuery.value();
            return 'API title: ' + (welcome?.title ?? '');
          }),
          p(function* () {
            const welcome = yield* welcomeQuery.value();
            return 'API body: ' + (welcome?.body ?? '');
          }),
        ]),
      ),
      ifNode(welcomeQuery.hasException, () =>
        p(${message}[
          span('The API request failed. Check the network tab.'),
        ]),
      ),
    ]),
);

export default HomePage;
`;
}

const effectDomainTs = `/* eslint-disable craft-ts/prefer-craft-http-transport, craft-ts/no-async-await, craft-ts/no-throw -- Effect owns this typed transport boundary. */
import { Context, Data, Effect, Layer } from 'effect';

export type WelcomeResponse = {
  readonly title: string;
  readonly body: string;
};

export class WelcomeApiError extends Data.TaggedError('WelcomeApiError')<{
  readonly message: string;
}> {}

export type WelcomeRepository = {
  readonly load: () => Effect.Effect<WelcomeResponse, WelcomeApiError>;
};

export class WelcomeRepositoryService extends Context.Service<
  WelcomeRepositoryService,
  WelcomeRepository
>()('starter/WelcomeRepository') {}

export const WelcomeRepositoryLive = Layer.succeed(WelcomeRepositoryService, {
  load: () =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch('/api/welcome');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return (await response.json()) as WelcomeResponse;
      },
      catch: (cause) => new WelcomeApiError({ message: String(cause) }),
    }),
});

export const loadWelcome = () => Effect.gen(function* () {
  const repository = yield* WelcomeRepositoryService;
  return yield* repository.load();
});
`;

function effectHomePageTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const surfaceImport = designSystem
    ? `import { surface } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';\n`
    : '';
  const card = designSystem ? "{ class: surface.card }, " : '';
  const note = designSystem ? "{ class: surface.note }, " : '';
  const message = designSystem ? "{ class: surface.message, 'data-tone': 'danger' }, " : '';
  const i18nImports = context.config.i18n.enabled
    ? "import { translateEffect } from '@craft-ts/i18n-effect';\n"
    : '';
  const summary = context.config.i18n.enabled
    ? "p(function* () { return 'i18n: ' + (yield* translateEffect('order.summary', { amount: 1234.5, count: 2, date: Date.UTC(2026, 0, 15) })); }),"
    : "p('The page uses queryEffect over a typed repository Layer.'),";
  const effectLoader = context.config.backendRuntime === 'none'
    ? 'loadWelcome()'
    : "Effect.tryPromise({ try: () => loadWelcome(), catch: (cause) => new Error(String(cause)) })";
  const effectErrorTag = context.config.backendRuntime === 'none' ? 'WelcomeApiError' : 'EffectFailure';
  return `import {
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  span,
} from '@craft-ts/component';
import { computedEffect, queryEffect, SyncOp } from '@craft-ts/effect';
import { Effect } from 'effect';
${i18nImports}${surfaceImport}
import { loadWelcome } from './api';
export const HomePage = craftComponent(
  'HomePage',
  {},
  function* () {
    const welcomeQuery = yield* queryEffect(
      'welcomeQuery',
      {
        method: (request: boolean) => request,
        loader: () => ${effectLoader},
      },
      ({ resource, exceptions }) => ({
        hasWelcome: computedEffect('hasWelcome', () => Effect.gen(function* () {
          yield* SyncOp;
          return resource.hasValue();
        })),
        errorMessage: computedEffect('errorMessage', function* () {
          const loaderError = (yield* exceptions()).loader;
          return Effect.flatMap(
            SyncOp,
            () => Effect.succeed(loaderError?.${effectErrorTag}?.message ?? 'Unknown API error'),
          );
        }),
      }),
    );
    yield* welcomeQuery.call(true);
    return { welcomeQuery };
  },
  ({ welcomeQuery }) =>
    div(${card}[
      heading('Welcome to CraftTS + Effect v4'),
      ${summary}
      ifNode(welcomeQuery.isLoading, () => p(${note}'Loading API…')),
      ifNode(welcomeQuery.hasWelcome, () =>
        div([
          p(function* () {
            const welcome = yield* welcomeQuery.value();
            return 'API title: ' + (welcome && 'title' in welcome ? welcome.title : '');
          }),
          p(function* () {
            const welcome = yield* welcomeQuery.value();
            return 'API body: ' + (welcome && 'body' in welcome ? welcome.body : '');
          }),
        ]),
      ),
      ifNode(welcomeQuery.hasException, () =>
        p(${message}[
          span(function* () {
            return 'API error: ' + (yield* welcomeQuery.errorMessage());
          }),
        ]),
      ),
    ]),
);

export type HomePageError = unknown;

export default HomePage;
`;
}

function effectAppConfig(context: TemplateContext): string {
  const i18n = context.config.i18n.enabled;
  return `import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideCraftDevTools,
  provideCraftRouter,
${context.config.backendRuntime !== 'none' ? '  provideDefaultServerFunctionTransport,\n' : ''}
} from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
} from '@craft-ts/effect';
import { App } from './app';
import { appRoutes } from './app.routes';
${i18n ? "import { i18nLayer } from '../i18n/effect-layer';" : ''}
import {
  WelcomeRepositoryLive,
} from './domain';

const effectProviders = [provideLayer(WelcomeRepositoryLive)${i18n ? ', provideLayer(i18nLayer)' : ''}] as const;
const developmentProviders = import.meta.env.DEV ? provideCraftDevTools() : [];

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_PATHS,
  providers: [
    ...developmentProviders,
    provideCraftRootComponent(App),
    provideCraftRouter(appRoutes.toRoutes()),
${context.config.backendRuntime !== 'none' ? '    provideDefaultServerFunctionTransport(),\n' : ''}
    ...effectProviders,
    provideAppInitializer(() => installCraftEffectBridge()),
  ],
});

// effectProviders is a typed tuple: removing the Layer makes the app config
// fail at the provider boundary before the application can boot.
`;
}

function unitTestTs(context: TemplateContext): string {
  const effect = context.mode === 'effect';
  const serverMock = context.config.backendRuntime !== 'none'
    ? `vi.mock('../starter.fn-client', () => ({
  getStarterMessage: vi.fn().mockResolvedValue({ title: 'Hello from the API', body: 'Server function works.' }),
}));
`
    : '';
  return `// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
${effect ? "import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';\nimport { WelcomeRepositoryLive } from './domain';" : ''}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
${serverMock}import { HomePage } from './home-page';

describe('HomePage', () => {
  ${effect ? 'let disposeBridge: () => void;' : ''}
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    ${effect ? 'disposeBridge = installCraftEffectBridge();' : ''}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: 'Hello from the API', body: 'Typed transport works.' }), {
        headers: { 'content-type': 'application/json' },
      }),
    ));
  });

  afterEach(() => {
    ${effect ? 'disposeBridge();' : ''}
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('renders the API result', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const injector = ${effect ? 'TestBed.rootInjector.createChild([provideLayer(WelcomeRepositoryLive)])' : 'TestBed.rootInjector'};
    const mounted = mountCraftComponent(HomePage, host, injector as unknown as Injector);
    TestBed.tick();
    await vi.waitFor(() => expect(host.textContent).toContain('Hello from the API'));
    mounted.destroy();
  });
});
`;
}

function e2eTestTs(context: TemplateContext): string {
  const hasServer = context.config.backendRuntime !== 'none';
  const expectedTitle = hasServer ? 'Hello from the server' : 'Hello from the API';
  const routeMock = hasServer
    ? ''
    : `test.beforeEach(async ({ page }) => {
  await page.route('**/api/welcome', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ title: 'Hello from the API', body: 'E2E transport works.' }),
    }),
  );
});
`;
  return `import { expect, test } from '@playwright/test';

${routeMock}

test('loads the API page and navigates to About', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome to CraftTS/ })).toBeVisible();
  await expect(page.getByText('${expectedTitle}')).toBeVisible();
  await page.getByRole('link', { name: 'Services' }).click();
  await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('heading', { name: 'About this starter' })).toBeVisible();
});
`;
}

function i18nE2eTestTs(context: TemplateContext): string {
  return `import { expect, test } from '@playwright/test';

const locales = ${JSON.stringify(context.locales)} as const;

for (const locale of locales) {
  test(\`renders the real starter page without layout overflow in \${locale}\`, async ({ page }) => {
    await page.goto('/?locale=' + locale);
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByText('i18n:')).toBeVisible();
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
      rootFont: getComputedStyle(document.documentElement).fontSize,
      bodyFont: getComputedStyle(document.body).fontFamily,
      bodyLineHeight: getComputedStyle(document.body).lineHeight,
    }));
    expect(layout.body).toBeLessThanOrEqual(layout.viewport);
    expect(layout.rootFont).toBeTruthy();
    expect(layout.bodyFont).toContain('system-ui');
    expect(layout.bodyLineHeight).not.toBe('normal');
  });
}
`;
}

const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
`;

const mcpConfig = `{
  "mcpServers": {
    "craft-ts": { "command": "npx", "args": ["craft-ts-mcp"] },
    "craft-ts-logs": { "command": "npx", "args": ["craft-ts-log-mcp"] },
    "craft-ts-registry": { "command": "npx", "args": ["craft-ts-registry-mcp"] }
  }
}
`;

function githubWorkflow(context: TemplateContext): string {
  const effect = context.config.frontendRuntime === 'effect' || context.config.backendRuntime === 'effect';
  const i18n = context.config.i18n.enabled;
  const typedCss = context.config.typedCss;
  const server = context.config.backendRuntime !== 'none';
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run typecheck-spec
${i18n ? '      - run: npm run i18n:check\n      - run: npm run i18n:test\n' : ''}${typedCss ? '      - run: npm run style:check\n' : ''}${server ? '      - run: npm run server:test\n' : ''}
${effect ? '      - run: npm run effect-check\n' : ''}      - run: npm test
      - run: npm run architecture
      - run: npm run typecheck-architecture
      - run: npm run build
`;
}

function readme(context: TemplateContext): string {
  const effect = context.config.frontendRuntime === 'effect' || context.config.backendRuntime === 'effect';
  const i18n = context.config.i18n.enabled;
  const typedCss = context.config.typedCss;
  const designSystem = context.config.designSystem !== 'none';
  const server = context.config.backendRuntime !== 'none';
  const references = context.config.references.craftTs || context.config.references.effectTs;
  const referencePath = context.config.workspace.kind === 'nx' ? '../../.references' : '.references';
  return [
    `# ${context.projectName}`,
    '',
    'A framework-independent CraftTS starter generated by craft create.',
    '',
    'This project includes:',
    '',
    '- a routed Craft component page;',
    `- a ${server ? 'server-function' : 'typed CraftHttpClient'} API boundary${effect ? ' with an Effect v4 repository service and Layer' : ''};`,
    '- three lazy routes: `/`, `/services` and `/about`;',
    ...(designSystem ? [`- a ${typedCss ? 'typed CSS' : 'plain CSS'} design-system composition;`] : []),
    '- development logs forwarded from Craft Console.* to a local JSONL server;',
    '- MCP configuration for Craft guidance, logs and the browser page surface;',
    '- flat-config ESLint with Craft rules;',
    '- unit tests, graph-wide architecture tests and a Playwright E2E flow.',
    ...(i18n ? ['- a type-safe i18n catalogue with locale parity, semantic tokens and strict plural checks.'] : []),
    ...(references ? [`- local CraftTS/EffectTS references under \`${referencePath}/\`; run \`npm run update:references\` to refresh them.`] : []),
    '',
    '## Start',
    '',
    'npm install',
    'npm run logs:server',
    'npm run registry:mcp',
    'npm run dev',
    '',
    'The browser type-check runs beside Vite. Its status is visible in the page;',
    'the same command writes the status used by CI. Raw console.* calls are not',
    'forwarded to the log MCP server: use Craft Console.* for searchable entries.',
    '',
    '## MCP',
    '',
    'The generated .mcp.json registers the Craft documentation server, the local',
    'log reader and the browser registry/page server. Start logs:server and',
    'registry:mcp when using the corresponding MCP tools.',
    '',
    '## Verify',
    '',
    'npm run lint',
    'npm run typecheck',
    'npm run typecheck-spec',
    ...(i18n ? ['npm run i18n:check', 'npm run i18n:test'] : []),
    ...(typedCss ? ['npm run style:check'] : []),
    ...(server ? ['npm run server:test'] : []),
    ...(effect ? ['npm run effect-check'] : []),
    'npm test',
    'npm run architecture',
    'npm run typecheck-architecture',
    'npm run e2e',
    'npm run build',
    '',
    ...(i18n ? ['## i18n', '',
    '',
    'Add or change translation keys in src/i18n/catalog.ts. Add a locale under',
    'src/i18n/locales/ with defineLocaleLike so keys, parameters and token kinds',
    'stay aligned. Define application tokens in project-tokens.ts with',
    'defineToken or defineTokenFactory; the plain i18n package does not require',
    'Effect. Strict plural categories and locale parity are checked by',
    'npm run i18n:check. Use npm run i18n:test for runtime and page fixtures.'] : []),
    ...(references ? ['## References', '',
      `The \`${referencePath}/manifest.json\` file records the requested refs and resolved SHAs.`,
      'The `context` mode keeps npm dependencies portable; `local` is reserved for build artifacts.',
      'Run `npm run update:references` after reviewing local changes in a clone.'] : []),
    '',
    '### Architecture tests',
    '',
    'architecture/ is the dependency-graph contract. It runs without booting the',
    'browser and catches duplicate HTTP ownership, dependency cycles, declarative',
    'graph violations, unnamed interactive elements and missing route DI proofs.',
    'Run it after structural changes. Add a rule only for a recurring product',
    'invariant that the baseline helpers do not cover; do not add one test per',
    'feature.',
    '',
    'The generated catalog is refreshed by architecture/load-graph.ts; do not edit',
    'architecture/catalog.ts by hand.',
    '',
  ].join('\n');
}

function agentFiles(
  mode: CreateMode,
  agent: CreateAgent,
  config?: StarterConfig,
): Record<string, string> {
  const effectEnabled = config?.frontendRuntime === 'effect' || config?.backendRuntime === 'effect' || mode === 'effect';
  const baseSkill = config?.i18n.enabled === false
    ? BASE_AGENT_SKILL.replace(/4\. Keep translations[\s\S]*?5\. Keep visual/, '5. Keep visual')
    : BASE_AGENT_SKILL;
  const skill = `${baseSkill}${effectEnabled ? `\n${EFFECT_AGENT_SKILL}` : ''}`;
  if (agent === 'codex') {
    return {
      'AGENTS.md': AGENTS_MD(mode, config),
      '.agents/skills/craft-ts-project/SKILL.md': skill,
      ...(effectEnabled
        ? { '.agents/skills/craft-ts-effect-v4/SKILL.md': EFFECT_AGENT_SKILL }
        : {}),
    };
  }
  if (agent === 'cursor') {
    return {
      '.cursor/skills/craft-ts-project/SKILL.md': skill,
      '.cursor/rules/craft-ts.mdc': `---\ndescription: CraftTS project rules\nglobs: **/*.ts\nalwaysApply: true\n---\n\nRead .cursor/skills/craft-ts-project/SKILL.md before editing CraftTS code.\n`,
    };
  }
  if (agent === 'claude-code') {
    return {
      'CLAUDE.md': AGENTS_MD(mode, config),
      '.claude/skills/craft-ts-project/SKILL.md': skill,
      ...(effectEnabled
        ? { '.claude/skills/craft-ts-effect-v4/SKILL.md': EFFECT_AGENT_SKILL }
        : {}),
    };
  }
  return {
    'GEMINI.md': AGENTS_MD(mode, config),
    '.gemini/skills/craft-ts-project/SKILL.md': skill,
      ...(effectEnabled
      ? { '.gemini/skills/craft-ts-effect-v4/SKILL.md': EFFECT_AGENT_SKILL }
      : {}),
  };
}

function templates(context: TemplateContext): Record<string, string> {
  const effect = context.config.frontendRuntime === 'effect';
  const hasEffect = effect || context.config.backendRuntime === 'effect';
  const hasServer = context.config.backendRuntime !== 'none';
  const hasI18n = context.config.i18n.enabled;
  const hasDesignSystem = context.config.designSystem !== 'none';
  const typedCss = context.config.typedCss;
  const localeFiles = Object.fromEntries(
    hasI18n
      ? context.locales.map((locale, index) => [
          `src/i18n/locales/${locale}.ts`,
          i18nLocaleTs(locale, index, context.locales),
        ])
      : [],
  );
  const files: Record<string, string> = {
    'package.json': packageJson(context),
    'tsconfig.json': tsconfig(context),
    'tsconfig.app.json': tsconfigApp,
    'tsconfig.spec.json': tsconfigSpec,
    ...(hasEffect ? { 'tsconfig.effect.json': tsconfigEffect, 'scripts/run-effect-tsgo.mjs': effectTsgoRunner } : {}),
    ...(typedCss ? { 'scripts/style-check.mjs': styleCheckScript } : {}),
    ...(hasServer ? { 'tsconfig.server.json': tsconfigServer } : {}),
    'scripts/typecheck.mjs': typecheckScript(context),
    'scripts/dev.mjs': devScript,
    'vite.config.ts': viteConfig(context),
    'vitest.config.ts': vitestConfig,
    'eslint.config.mjs': eslintConfig(effect, context.config.backendRuntime === 'effect'),
    'playwright.config.ts': playwrightConfig,
    'index.html': indexHtml(context.defaultLocale),
    '.mcp.json': mcpConfig,
    '.github/workflows/ci.yml': githubWorkflow(context),
    'README.md': readme(context),
    'src/main.ts': mainTs(context),
    'src/dev-typecheck-indicator.ts': typecheckIndicatorTs,
    'src/styles.css': stylesFor(context),
    ...(hasI18n
      ? {
          'src/i18n/catalog.ts': i18nCatalogTs(context.locales),
          'src/i18n/project-tokens.ts': projectTokensTs,
          'src/i18n/runtime.ts': i18nRuntimeTs(context),
          'src/i18n/typography.ts': typographyTs,
          'src/i18n/index.ts': i18nIndexTs,
        }
      : {}),
    ...localeFiles,
    ...(effect && hasI18n
      ? { 'src/i18n/effect.ts': effectI18nTs, 'src/i18n/effect-layer.ts': effectLayerTs }
      : {}),
    'src/types.d.ts': '/// <reference types="vite/client" />\n' +
      (typedCss ? "\n// Served by the craftStyle plugin; it has no file on disk to resolve.\ndeclare module 'virtual:craft-style.css';\n" : ''),
    'src/app/app.ts': appTs(context),
    'src/app/app.config.ts': effect ? effectAppConfig(context) : plainAppConfig(context),
    'src/app/app.routes.ts': routesTs(context),
    'src/app/api.ts': effect && !hasServer
      ? "export { loadWelcome } from './domain';\nexport type { WelcomeResponse } from './domain';\n"
      : apiTs(context),
    ...(effect ? { 'src/app/domain.ts': effectDomainTs, 'src/app/home-page.ts': effectHomePageTs(context) } : { 'src/app/home-page.ts': plainHomePageTs(context) }),
    'src/app/about-page.ts': aboutPageTs(context),
    'src/app/services-page.ts': servicesPageTs(context),
    'src/app/home-page.spec.ts': unitTestTs(context),
    'e2e/starter.spec.ts': e2eTestTs(context),
    ...(hasI18n ? { 'e2e/i18n.spec.ts': i18nE2eTestTs(context) } : {}),
  };
  if (hasDesignSystem) {
    files[`src/app/ui/${typedCss ? 'ui.style.ts' : 'ui.ts'}`] = typedCss ? uiStyleTs : uiPlainTs;
    files['src/app/ui/components.ts'] = uiComponentsTs(context);
  }
  Object.assign(files, serverFiles(context));
  return files;
}

function nxProjectJson(context: TemplateContext): string {
  const projectRoot = `apps/${context.config.workspace.projectName}`;
  const run = (command: string) => ({
    executor: 'nx:run-commands',
    options: { command: `npm run ${context.config.workspace.projectName}:${command}`, cwd: '.' },
  });
  return json({
    name: context.config.workspace.projectName,
    $schema: '../../node_modules/nx/schemas/project-schema.json',
    sourceRoot: `${projectRoot}/src`,
    projectType: 'application',
    targets: {
      typecheck: run('typecheck'),
      test: run('test'),
      architecture: run('architecture'),
      'typecheck-architecture': run('typecheck-architecture'),
      build: run('build'),
      e2e: run('e2e'),
      ...(context.config.references.craftTs || context.config.references.effectTs
        ? { 'update-references': run('update:references') }
        : {}),
    },
  });
}

function normaliseAgent(agent: string): CreateAgent {
  const value = agent.trim().toLowerCase();
  if (value === 'codex') return 'codex';
  if (value === 'cursor') return 'cursor';
  if (value === 'claude' || value === 'claude-code') return 'claude-code';
  if (value === 'cloud-code' || value === 'cloudcode' || value === 'gemini') return 'cloud-code';
  throw new Error(`Unknown agent "${agent}". Use codex, cursor, claude-code, or cloud-code.`);
}

export function parseCreateAgents(value: string | undefined): readonly CreateAgent[] {
  if (!value) return DEFAULT_AGENTS;
  if (value.trim() === '' || value.trim().toLowerCase() === 'none') return [];
  return [...new Set(value.split(',').map(normaliseAgent))];
}

function projectNameForDirectory(directory: string): string {
  return directory
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[^a-zA-Z0-9._-]/g, '-') || 'craft-app';
}

/**
 * Turns CLI, legacy and interactive values into the one renderer contract.
 * Keeping this pure is intentional: prompts and filesystem writes live at the
 * edges, while all contradictions are caught before a single file is written.
 */
export function normalizeCreateOptions(
  options: CreateProjectOptions,
): StarterConfig {
  const requestedRootDir = resolve(options.rootDir ?? process.cwd());
  const rootDir = !options.rootDir && isAbsolute(options.directory)
    ? dirname(resolve(options.directory))
    : requestedRootDir;
  const requestedMode = options.mode;
  let frontendRuntime = options.frontendRuntime ?? (requestedMode ?? 'plain');
  let backendRuntime = options.backendRuntime ?? 'none';

  if (options.effectScope) {
    const scoped = {
      none: ['plain', 'none'],
      frontend: ['effect', 'none'],
      backend: ['plain', 'effect'],
      both: ['effect', 'effect'],
    } as const;
    const selectedScope = scoped[options.effectScope];
    if (!selectedScope) throw new Error(`Unknown effect scope "${options.effectScope}".`);
    const [scopedFrontend, scopedBackend] = selectedScope;
    if (options.frontendRuntime && options.frontendRuntime !== scopedFrontend) {
      throw new Error('--effect-scope conflicts with --frontend-runtime.');
    }
    if (options.backendRuntime && options.backendRuntime !== scopedBackend) {
      throw new Error('--effect-scope conflicts with --backend-runtime.');
    }
    frontendRuntime = scopedFrontend;
    backendRuntime = scopedBackend;
  }

  if (frontendRuntime === 'effect' && requestedMode === 'plain' && options.frontendRuntime === undefined) {
    frontendRuntime = 'plain';
  }
  if (!['plain', 'effect'].includes(frontendRuntime)) {
    throw new Error(`Unknown frontend runtime "${frontendRuntime}".`);
  }
  if (!['none', 'promise', 'effect'].includes(backendRuntime)) {
    throw new Error(`Unknown backend runtime "${backendRuntime}".`);
  }
  if (options.i18n !== undefined && !['strict', 'loose', 'none'].includes(options.i18n)) {
    throw new Error(`Unknown i18n mode "${options.i18n}".`);
  }
  if (options.designSystem !== undefined && !['none', 'basic'].includes(options.designSystem)) {
    throw new Error(`Unknown design system "${options.designSystem}".`);
  }
  if (options.workspace !== undefined && !['standalone', 'nx'].includes(options.workspace)) {
    throw new Error(`Unknown workspace "${options.workspace}".`);
  }

  const i18nEnabled = options.i18nEnabled ?? options.i18n !== 'none';
  const hasExplicitLocaleOptions = options.locales !== undefined || options.defaultLocale !== undefined;
  if (!i18nEnabled && hasExplicitLocaleOptions) {
    throw new Error('--locales and --default-locale require i18n to be enabled.');
  }
  const locales = i18nEnabled
    ? [...new Set(options.locales ?? ['en-US', 'fr-FR'])]
    : [];
  if (i18nEnabled && locales.length === 0) {
    throw new Error('At least one i18n locale is required.');
  }
  const defaultLocale = options.defaultLocale ?? (locales[0] ?? 'en-US');
  if (i18nEnabled && !locales.includes(defaultLocale)) {
    throw new Error(`Default locale "${defaultLocale}" is not in --locales.`);
  }

  const references = options.references ?? 'none';
  if (!['none', 'craft-ts', 'all'].includes(references)) {
    throw new Error(`Unknown references selection "${references}".`);
  }
  if (options.referenceMode !== undefined && !['context', 'local', 'source'].includes(options.referenceMode)) {
    throw new Error(`Unknown reference mode "${options.referenceMode}".`);
  }
  const craftTs = options.cloneCraftTs ?? (references === 'craft-ts' || references === 'all');
  const effectTs = options.cloneEffectTs ?? (references === 'all');
  if (effectTs && frontendRuntime !== 'effect' && backendRuntime !== 'effect') {
    throw new Error('EffectTS references require an Effect frontend or backend runtime.');
  }
  if (options.referenceMode === 'local' && !craftTs && !effectTs) {
    throw new Error('--reference-mode=local requires at least one cloned reference.');
  }

  const directory = resolve(rootDir, options.directory);
  const workspaceKind = options.workspace ?? (existsSync(join(rootDir, 'nx.json')) ? 'nx' : 'standalone');
  const projectName = projectNameForDirectory(directory);
  return {
    ...(requestedMode ? { mode: requestedMode } : {}),
    frontendRuntime,
    backendRuntime,
    workspace: { kind: workspaceKind, projectName, rootDir },
    i18n: {
      enabled: i18nEnabled,
      locales,
      defaultLocale,
      validation: options.i18n === 'loose' ? 'loose' : 'strict',
    },
    designSystem: options.designSystem ?? 'basic',
    typedCss: options.typedCss ?? true,
    references: {
      craftTs,
      effectTs,
      mode: options.referenceMode ?? 'context',
      craftTsRef: options.craftTsRef ?? 'main',
      effectTsRef: options.effectTsRef ?? 'main',
    },
    agents: options.agents ?? DEFAULT_AGENTS,
  };
}

export async function createCraftProject(
  options: CreateProjectOptions,
): Promise<CreateProjectResult> {
  const config = normalizeCreateOptions(options);
  const rootDir = config.workspace.rootDir;
  const directory = resolve(rootDir, options.directory);
  const mode: CreateMode = config.frontendRuntime;
  const agents = config.agents;
  const context: TemplateContext = {
    projectName: config.workspace.projectName,
    config,
    mode,
    locales: config.i18n.locales,
    defaultLocale: config.i18n.defaultLocale,
    i18nStrict: config.i18n.validation === 'strict',
    packageVersion: options.packageVersion ?? process.env['CRAFT_RELEASE_VERSION'],
  };

  if (existsSync(directory) && !options.force && (await readdir(directory)).length > 0) {
    throw new Error(`Refusing to create in non-empty directory: ${directory}. Use --force to merge.`);
  }

  const files: Record<string, string> = {
    ...templates(context),
    ...referenceFiles(context),
    ...agents.reduce<Record<string, string>>(
      (all, agent) => Object.assign(all, agentFiles(mode, agent, config)),
      {},
    ),
  };
  if (config.workspace.kind === 'nx') {
    delete files['package.json'];
    delete files['.references/manifest.json'];
    delete files['.gitignore'];
    delete files['scripts/reference-resolver.mjs'];
    delete files['scripts/update-references.mjs'];
    delete files['scripts/update-craft-ts.mjs'];
    delete files['scripts/update-effect-ts.mjs'];
    files['project.json'] = nxProjectJson({
      ...context,
      config: { ...config, workspace: { ...config.workspace, projectName: config.workspace.projectName } },
    });
  }
  await Promise.all(
    Object.entries(files).map(async ([file, contents]) => {
      const target = join(directory, file);
      if (file === '.gitignore' && existsSync(target)) return;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
    }),
  );

  if (config.workspace.kind === 'nx') {
    const rootPackagePath = join(rootDir, 'package.json');
    const rootPackage = existsSync(rootPackagePath)
      ? JSON.parse(await readFile(rootPackagePath, 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }
      : { name: config.workspace.projectName, private: true, type: 'module' } as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
    const generatedPackage = JSON.parse(packageJson(context)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
    rootPackage.dependencies = { ...rootPackage.dependencies, ...generatedPackage.dependencies };
    rootPackage.devDependencies = { ...rootPackage.devDependencies, ...generatedPackage.devDependencies };
    rootPackage.scripts = { ...rootPackage.scripts, ...Object.fromEntries(Object.entries(generatedPackage.scripts ?? {}).map(([name]) => [`${config.workspace.projectName}:${name}`, `npm --prefix ${relative(rootDir, directory)} run ${name.replace(/:/g, '\\:')}`])) };
    await writeFile(rootPackagePath, json(rootPackage), 'utf8');
    const nxJsonPath = join(rootDir, 'nx.json');
    if (!existsSync(nxJsonPath)) await writeFile(nxJsonPath, json({ plugins: [] }), 'utf8');
    const rootReferenceFiles = referenceFiles(context);
    await Promise.all(Object.entries(rootReferenceFiles).map(async ([file, contents]) => {
      const target = join(rootDir, file);
      if (file === '.gitignore' && existsSync(target)) return;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
    }));
  }

  if (config.references.craftTs || config.references.effectTs) {
    cloneReferenceIfRequested(config.workspace.kind === 'nx' ? rootDir : directory, config);
  }

  // Reuse the same deterministic scaffold as migration, but with a standalone
  // project root. It also adds architecture/typecheck scripts to package.json.
  await runArchitectureMigration({
    rootDir: join(directory, 'src'),
    tsConfigFilePath: join(directory, 'tsconfig.app.json'),
    write: true,
  });

  return {
    directory,
    mode,
    frontendRuntime: config.frontendRuntime,
    backendRuntime: config.backendRuntime,
    config,
    agents,
    changedFiles: Object.keys(files).map((file) => relative(directory, join(directory, file))),
  };
}

export function createModeFromFlag(value: string | undefined): CreateMode | undefined {
  if (!value) return undefined;
  if (value === 'v4' || value === 'effect' || value === 'true') return 'effect';
  if (value === 'none' || value === 'plain' || value === 'false') return 'plain';
  throw new Error(`Unknown --effect value "${value}". Use v4 or none.`);
}
