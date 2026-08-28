import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runArchitectureMigration } from '../architecture/migrate-architecture.js';

export const CRAFT_TS_STARTER_VERSION = '^0.7.0-beta.15';
export const EFFECT_V4_VERSION = '^4.0.0-rc.110';

export type CreateAgent = 'codex' | 'cursor' | 'claude-code' | 'cloud-code';
export type CreateMode = 'effect' | 'plain';

export type FrontendRuntime = 'plain' | 'effect';
export type BackendRuntime = 'none' | 'promise' | 'effect';
export type WorkspaceKind = 'standalone' | 'nx';
/** Cloned repositories provide agent context; application dependencies stay on npm. */
export type ReferenceMode = 'context';

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
  readonly demoPages: boolean;
  readonly domain: string;
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
  /** Generate the explanatory demo pages (default: true). */
  readonly demoPages?: boolean;
  /** Domain/feature name used when demo pages are disabled. */
  readonly domain?: string;
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

const GENERATED_GITIGNORE = `node_modules/
dist/
coverage/
.vite/
playwright-report/
test-results/
.DS_Store
.references/*
!.references/manifest.json
`;

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
   @craft-ts/i18n integrates with CraftTS: a token may resolve a service or
   parse its parameter with a Standard Schema. Do not import Effect for plain
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
6. Run the focused test, then npm run lint and fix every lint error before
   continuing. Keep derived values on their owning Craft primitive, read
   reactive values through the documented bindings, give every button an
   explicit type, and declare Node globals in Node-only scripts. Then run
   npm run typecheck and npm run architecture; run npm run e2e only after
   those checks pass and only when the browser flow changed.
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

function referenceAgentGuidance(config?: StarterConfig): string {
  if (!config || (!config.references.craftTs && !config.references.effectTs))
    return '';
  const root =
    config.workspace.kind === 'nx' ? '../../.references' : '.references';
  const entries = [
    config.references.craftTs ? `- CraftTS source: \`${root}/craft-ts\`` : '',
    config.references.effectTs
      ? `- EffectTS source: \`${root}/effect-ts\``
      : '',
  ].filter(Boolean);
  return `
## Local source references

The following repositories are cloned for agent context only:
${entries.join('\n')}
Use them to inspect implementations, types, tests and examples when the
installed package or project documentation is not enough. The application must
always import CraftTS and EffectTS from the npm dependencies declared in
\`package.json\`; do not add TypeScript, Vite or package \`file:\` aliases to
these clones.
`;
}

function agentsMd(mode: CreateMode, config?: StarterConfig): string {
  const frontend =
    config?.frontendRuntime ?? (mode === 'effect' ? 'effect' : 'plain');
  const backend = config?.backendRuntime ?? 'none';
  const i18n = config?.i18n.enabled ?? true;
  const designSystem = config?.designSystem !== 'none';
  const typedCss = config?.typedCss ?? true;
  const effectFrontend = frontend === 'effect';
  const effectBackend = backend === 'effect';
  const effect = effectFrontend || effectBackend;
  const effectSkillPaths = (config?.agents ?? []).map((agent) =>
    agent === 'codex'
      ? '.agents/skills/craft-ts-effect-v4/SKILL.md'
      : agent === 'cursor'
        ? '.cursor/skills/craft-ts-project/SKILL.md'
        : agent === 'claude-code'
          ? '.claude/skills/craft-ts-effect-v4/SKILL.md'
          : '.gemini/skills/craft-ts-effect-v4/SKILL.md',
  );
  const effectSkillLine = effectSkillPaths.length
    ? `Read the Effect-specific guidance in ${effectSkillPaths.map((path) => `\`${path}\``).join(', ')}.`
    : 'Use the Effect v4 guidance in the project documentation when adding Effect code.';
  const verify = [
    'npm run lint',
    'npm run typecheck',
    'npm run typecheck-spec',
    ...(i18n ? ['npm run i18n:check', 'npm run i18n:test'] : []),
    ...(typedCss ? ['npm run style:check'] : []),
    ...(backend !== 'none' ? ['npm run server:test'] : []),
    ...(effect ? ['npm run effect-check'] : []),
    'npm test',
    'npm run architecture',
    'npm run typecheck-architecture',
    'npm run build',
  ];
  const effectGuidance = effect
    ? `
## Effect boundary

${effectFrontend ? '- Effect v4 is enabled in the browser; use `queryEffect` and the installed Craft Effect bridge.' : '- The browser runtime is plain; keep Effect imports out of browser components.'}
${effectBackend ? '- Effect v4 is enabled on the backend; keep server Effects in `src/server/`, provide services through `Layer`, and run `npm run effect-check` after changes.' : '- The backend does not use Effect; do not add Effect dependencies or server Effects unless the runtime choice changes.'}
${effectSkillLine}
`
    : `
## Effect boundary

Effect is not selected in this starter. Keep the application on the plain
CraftTS runtime and do not add Effect imports or dependencies incidentally.
`;
  return `# CraftTS project

This project was created with \`craft create\`. Treat this file as the project
guide for coding agents: it records the selected runtime and feature surfaces.

## Selected configuration

- Frontend runtime: **${frontend}**
- Backend runtime: **${backend}**
- Type-safe i18n: **${i18n ? 'enabled' : 'disabled'}**
- Design system: **${designSystem ? 'enabled' : 'disabled'}**
- Typed CSS: **${typedCss ? 'enabled' : 'disabled'}**
- Starter surface: **${config?.demoPages === false ? 'domain-first' : 'demo pages'}**

${config?.demoPages === false ? 'The starter is already domain-first.' : 'Before starting product development, run `npm run reset:starter` to remove the explanatory demo pages and keep only the first domain feature.'}

Read \`.agents/skills/craft-ts-project/SKILL.md\` before changing application
code. ${i18n ? 'Translation keys live in `src/i18n/`; run `npm run i18n:check` and `npm run i18n:test` after changes.' : 'This starter has no i18n surface; do not add translation files unless the project configuration changes.'}
${effectGuidance}

## Workflow

Use Craft primitives and yield every Craft reader. Keep the browser, server and
transport boundaries aligned with the selected runtimes. The architecture
suite is a graph contract: run \`npm run architecture\` after structural
changes, and do not add a test per feature or a rule for a smell already
covered by the baseline helpers.

## Verification

Run the checks relevant to this generated configuration:

${verify.map((command) => `- \`${command}\``).join('\n')}
${referenceAgentGuidance(config)}`;
}

const AGENTS_MD = agentsMd;

type TemplateContext = {
  readonly projectName: string;
  readonly config: StarterConfig;
  readonly mode: CreateMode;
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly i18nStrict: boolean;
  readonly packageVersion?: string;
};

function slugForGeneratedDomain(value: string | undefined): string {
  const slug = (value ?? 'feature')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'feature';
}

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
  const packageVersion = context.packageVersion ?? CRAFT_TS_STARTER_VERSION;
  const craftPackage = (): string => packageVersion;
  const effectPackage = EFFECT_V4_VERSION;
  return json({
    name: context.projectName,
    private: true,
    type: 'module',
    engines: { node: '>=20.19.0' },
    scripts: {
      dev: 'node scripts/dev.mjs',
      'reset:starter': 'node scripts/reset-starter.mjs',
      build: 'vite build',
      lint: 'eslint .',
      typecheck: 'node scripts/typecheck.mjs',
      'typecheck-spec': 'tsc -p tsconfig.spec.json --noEmit',
      ...(hasI18n
        ? { 'i18n:check': 'craft i18n check', 'i18n:test': 'craft i18n test' }
        : {}),
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
      ...(hasServer
        ? {
            'server:test': 'vitest run --config vitest.server.config.ts',
          }
        : {}),
      ...(context.config.references.craftTs ||
      context.config.references.effectTs
        ? {
            'update:references': 'node scripts/update-references.mjs',
            ...(context.config.references.craftTs
              ? { 'update:craft-ts': 'node scripts/update-craft-ts.mjs' }
              : {}),
            ...(context.config.references.effectTs
              ? { 'update:effect-ts': 'node scripts/update-effect-ts.mjs' }
              : {}),
          }
        : {}),
      architecture: 'vitest run --config vitest.architecture.config.ts',
      'typecheck-architecture': 'tsc -p tsconfig.architecture.json --noEmit',
    },
    dependencies: {
      '@craft-ts/component': craftPackage(),
      '@craft-ts/core': craftPackage(),
      ...(hasI18n ? { '@craft-ts/i18n': craftPackage() } : {}),
      ...(hasTypedCss ? { '@craft-ts/style': craftPackage() } : {}),
      ...(hasEffect && hasI18n
        ? { '@craft-ts/i18n-effect': craftPackage() }
        : {}),
      ...(hasEffect
        ? { '@craft-ts/effect': craftPackage(), effect: effectPackage }
        : {}),
    },
    devDependencies: {
      '@craft-ts/dev-tools': craftPackage(),
      '@craft-ts/mcp': craftPackage(),
      '@craft-ts/function-registry-mcp': craftPackage(),
      '@craft-ts/log-mcp': craftPackage(),
      '@craft-ts/log-server': craftPackage(),
      ...(hasEffect ? { effect: effectPackage } : {}),
      ...(hasTypedCss ? { '@craft-ts/style-testing': craftPackage() } : {}),
      '@playwright/test': '^1.52.0',
      '@types/node': '^22.0.0',
      'aria-query': '^5.3.2',
      jsdom: '^27.1.0',
      rxjs: '^7.8.0',
      tslib: '^2.3.0',
      ...(hasEffect
        ? {
            '@effect/tsgo': '^0.24.3',
            '@typescript/native': 'npm:typescript@7.0.2',
          }
        : {}),
      '@eslint/js': '^9.0.0',
      eslint: '^9.0.0',
      'eslint-config-prettier': '^10.0.0',
      'eslint-plugin-playwright': '^2.0.0',
      typescript: '^6.0.3',
      'typescript-eslint': '^8.0.0',
      vite: '^8.0.0',
      vitest: '^4.0.0',
    },
  });
}

function tsconfig(context: TemplateContext): string {
  const hasEffect =
    context.config.frontendRuntime === 'effect' ||
    context.config.backendRuntime === 'effect';
  const hasServer = context.config.backendRuntime !== 'none';
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
  "compilerOptions": {
    "noEmit": true,
    "plugins": [{
      "name": "@effect/language-service",
      "diagnostics": true,
      "diagnosticsName": true,
      "overrides": [{
        "include": ["src/**/*.ts"],
        "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"],
        "options": {
          "diagnosticSeverity": {
            "floatingEffect": "error",
            "missingEffectContext": "error",
            "missingEffectError": "error",
            "missingLayerContext": "error",
            "missingReturnYieldStar": "error",
            "missingStarInYieldEffectGen": "error",
            "outdatedApi": "error",
            "unsafeEffectTypeAssertion": "error",
            "asyncFunction": "warning",
            "newPromise": "warning",
            "nodeBuiltinImport": "warning",
            "preferSchemaOverJson": "warning"
          }
        }
      }]
    }]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}\n`;

function viteConfig(context: TemplateContext): string {
  const typedCss = context.config.typedCss;
  const hasServer = context.config.backendRuntime !== 'none';
  const styleImport = "import { craftStyle } from '@craft-ts/style/vite';";
  const styleAliasEntries = `    '@craft-ts/style': resolvePath(import.meta.dirname, 'node_modules/@craft-ts/style/src/index.js')`;
  const stylePlugin = typedCss
    ? `    craftStyle({ dumpPath: '.craft/style-graph.json', alias: {
${styleAliasEntries}
    } }),`
    : '';
  return `import { readFileSync } from 'node:fs';
${typedCss ? "import { resolve as resolvePath } from 'node:path';\n" : ''}
import { defineConfig, type ViteDevServer } from 'vite';
${typedCss ? styleImport : ''}

const typecheckStatusPath = new URL('./.craft/typecheck-status.json', import.meta.url);
const starterPort = Number(process.env.CRAFT_STARTER_PORT ?? 4173);

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

${
  hasServer
    ? `function serverFunctionsPlugin() {
  return {
    name: 'craft-starter-server-functions',
    async configureServer(server: ViteDevServer) {
      const module = await server.ssrLoadModule('/src/server/node-http.ts') as typeof import('./src/server/node-http');
      server.middlewares.use('/__server-functions', (request, response) => {
        void module.handleRequest(request, response).catch((error: unknown) => {
          if (response.headersSent) {
            response.destroy();
            return;
          }
          response.statusCode = 500;
          response.end('Internal Server Error');
          console.error(error);
        });
      });
    },
  };
}`
    : ''
}

export default defineConfig({
  plugins: [
    craftTypecheckStatusPlugin(),
${
  typedCss
    ? `    // Evaluates every *.style.ts in Node and emits the generated sheet.
${stylePlugin}`
    : ''
}
${hasServer ? '    serverFunctionsPlugin(),' : ''}
  ],
  server: {
    host: '127.0.0.1',
    port: starterPort,
    forwardConsole: true,
  },
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
  const projects = [
    'tsconfig.app.json',
    ...(context.config.backendRuntime !== 'none'
      ? ['tsconfig.server.json']
      : []),
  ];
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
import { relative, resolve } from 'node:path';

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
const originalArgs = process.argv.slice(2);
const projectArgument = valueAfter(originalArgs, '--project') ?? valueAfter(originalArgs, '-p');
if (originalArgs[0] === 'diagnostics' && projectArgument) {
  const projectPath = resolve(projectRoot, projectArgument);
  const listed = spawnSync(
    resolve(projectRoot, 'node_modules/.bin/tsc'),
    ['-p', projectPath, '--listFilesOnly', '--pretty', 'false'],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  const programFiles = (listed.stdout ?? '').split(/\\r?\\n/).filter((file) => /\\.(ts|tsx|mts|cts)$/.test(file));
  console.log('Effect check scope: ' + relative(projectRoot, projectPath));
  console.log('TypeScript program files: ' + programFiles.length);
  if (programFiles.length === 0) {
    console.error('Effect check refused to continue: the TypeScript program contains no files. Check --project and tsconfig include/exclude.');
    process.exitCode = 1;
    process.exit();
  }
}
const args =
  originalArgs[0] === 'diagnostics' && !originalArgs.includes('--progress')
    ? [...originalArgs, '--progress']
    : originalArgs;
const result = spawnSync(effectTsgoPath, args, {
  cwd: projectRoot,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(flag + '='));
  return inline?.slice(flag.length + 1);
}
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

const eslintConfig = (
  effect: boolean,
  backendEffect = false,
  i18n = false,
) => `import js from '@eslint/js';
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
${i18n ? '      // Visible text belongs to src/i18n, not to a template literal.\n      ...craftRules.configs.i18n.rules,\n' : ''}      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
${effect ? '' : "      'craft-ts/no-effect-import-in-frontend': 'error',"}
    },
  },
  {
    files: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
      'craft-ts/prefer-browser-boundaries': 'off',
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-ephemeral-template-form-state': 'off',
    },
  },
${
  backendEffect
    ? `  {
    files: ['src/server/**/*.ts', 'src/**/*.fn-serveur.ts', 'src/**/*.mw-serveur.ts'],
    ignores: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
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
  },`
    : ''
}
  {
    files: ['e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
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
nav { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.25rem; background: white; border-bottom: 1px solid #e3e7ef; }
.starter-experimental-badge { display: inline-flex; align-items: center; margin-left: auto; padding: .25rem .55rem; border: 1px solid #f0c36d; border-radius: 999px; color: #7a4b00; background: #fff8e6; font-size: .75rem; font-weight: 600; line-height: 1.2; white-space: nowrap; }
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
  if (context.config.designSystem === 'none' || context.config.typedCss)
    return styles;
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

function starterPluralCategories(
  locales: readonly string[],
): readonly string[] {
  return [
    ...new Set(
      locales.flatMap(
        (locale) =>
          STARTER_PLURAL_CATEGORIES[
            locale.toLowerCase().split('-')[0] ?? ''
          ] ?? ['one', 'other'],
      ),
    ),
  ];
}

/**
 * The visible copy of the starter pages. It lives in the catalogue because
 * `craft-ts/require-i18n-text` is part of the generated lint configuration as
 * soon as i18n is enabled: a starter that kept its own labels inline would fail
 * the rule it ships with.
 */
function starterUiCopy(context: TemplateContext, french: boolean) {
  const domain = context.config.domain;
  return french
    ? {
        navHome: 'Accueil',
        navServices: 'Services',
        navAbout: 'À propos',
        badge: 'Expérimental · vos retours sont bienvenus',
        homeTitle: 'Bienvenue dans CraftTS',
        homeTitleEffect: 'Bienvenue dans CraftTS + Effect v4',
        homeLoading: 'Chargement de l’API…',
        homeApiError: 'La requête API a échoué. Ouvrez l’onglet réseau.',
        aboutTitle: 'À propos de ce starter',
        aboutBody:
          'Cette page prouve que le routage Craft et le chargement paresseux des composants sont câblés.',
        servicesTitle: 'Services',
        servicesEffect:
          'Service Effect : Context.Service + Layer + provideLayer sont installés à l’échelle de l’application.',
        domainBody: `Voici la frontière du domaine ${domain}. Ajoutez-y le flux métier.`,
        componentsContinue: 'Continuer',
        componentsAlert: 'Alerte',
      }
    : {
        navHome: 'Home',
        navServices: 'Services',
        navAbout: 'About',
        badge: 'Experimental · feedback welcome',
        homeTitle: 'Welcome to CraftTS',
        homeTitleEffect: 'Welcome to CraftTS + Effect v4',
        homeLoading: 'Loading API…',
        homeApiError: 'The API request failed. Check the network tab.',
        aboutTitle: 'About this starter',
        aboutBody:
          'This page proves that Craft routing and lazy component loading are wired.',
        servicesTitle: 'Services',
        servicesEffect:
          'Effect service: Context.Service + Layer + provideLayer are installed at app scope.',
        domainBody: `This is the ${domain} feature boundary. Add the domain flow here.`,
        componentsContinue: 'Continue',
        componentsAlert: 'Alert',
      };
}

function i18nUiSectionTs(context: TemplateContext, french: boolean): string {
  const domain = context.config.domain;
  const type = typeNameForTemplate(domain);
  const copy = starterUiCopy(context, french);
  return `  ui: {
    nav: {
      home: msg\`${copy.navHome}\`,
      services: msg\`${copy.navServices}\`,
      about: msg\`${copy.navAbout}\`,
      domain: msg\`${domain}\`,
    },
    badge: msg\`${copy.badge}\`,
    home: {
      title: msg\`${copy.homeTitle}\`,
      titleEffect: msg\`${copy.homeTitleEffect}\`,
      loading: msg\`${copy.homeLoading}\`,
      apiError: msg\`${copy.homeApiError}\`,
    },
    about: {
      title: msg\`${copy.aboutTitle}\`,
      body: msg\`${copy.aboutBody}\`,
    },
    services: {
      title: msg\`${copy.servicesTitle}\`,
      effect: msg\`${copy.servicesEffect}\`,
    },
    domain: {
      title: msg\`${type}\`,
      body: msg\`${copy.domainBody}\`,
    },
    components: {
      continue: msg\`${copy.componentsContinue}\`,
      alert: msg\`${copy.componentsAlert}\`,
    },
  },`;
}

function i18nCatalogTs(context: TemplateContext): string {
  const locales = context.locales;
  const categories = starterPluralCategories(locales);
  const branches = categories
    .map(
      (category) =>
        `      ${category}: msg\`\${orderCount} ${category === 'one' ? 'item' : 'items'}\`,`,
    )
    .join('\n');
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
${i18nUiSectionTs(context, false)}
});
`;
}

function i18nLocaleTs(
  locale: string,
  index: number,
  context: TemplateContext,
): string {
  const locales = context.locales;
  const isFrench = locale.toLowerCase().startsWith('fr');
  const categories = starterPluralCategories(locales);
  const branches = categories
    .map((category) => {
      const word = isFrench
        ? category === 'one'
          ? 'article'
          : 'articles'
        : category === 'one'
          ? 'item'
          : 'items';
      return `      ${category}: msg\`\${orderCount} ${word}\`,`;
    })
    .join('\n');
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
${i18nUiSectionTs(context, isFrench)}
});
`;
}

function i18nRuntimeTs(context: TemplateContext): string {
  const localeImports = context.locales
    .map(
      (locale) =>
        `import { ${locale.replace(/[^a-zA-Z0-9]/g, '')} } from './locales/${locale}';`,
    )
    .join('\n');
  const localeValues = context.locales
    .map((locale) => locale.replace(/[^a-zA-Z0-9]/g, ''))
    .join(', ');
  return `import { createI18nRuntime } from '@craft-ts/i18n';
${localeImports}

export const locales = [${localeValues}] as const;

export const i18n = createI18nRuntime<typeof locales>({
  locales,
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

const effectI18nTs = `import { translateEffect as translateEffectRaw } from '@craft-ts/i18n-effect';
import type { StaticTranslationKey, TranslationParams } from '@craft-ts/i18n';
import { locales } from './runtime';

type AppLocales = typeof locales;

export const translateEffect = <Key extends StaticTranslationKey<AppLocales[number]>>(
  key: Key,
  ...params: keyof TranslationParams<AppLocales[number], Key & string> extends never
    ? [params?: TranslationParams<AppLocales[number], Key & string>]
    : [params: TranslationParams<AppLocales[number], Key & string>]
) => translateEffectRaw<AppLocales, Key>(key, ...params);
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
  const hasI18n = context.config.i18n.enabled;
  const i18nImport = hasI18n
    ? "\nimport { i18n } from '../../i18n';"
    : '';
  const continueLabel = hasI18n
    ? "i18n.t('ui.components.continue')"
    : "'Continue'";
  const alertLabel = hasI18n ? "i18n.t('ui.components.alert')" : "'Alert'";
  return `import { button, craftComponent, div, p } from '@craft-ts/component';
${styleImport}${i18nImport}

export const Stack = craftComponent('Stack', {}, () => ({}), () => div({ class: surface.card }, []));
export const Card = craftComponent('Card', {}, () => ({}), () => div({ class: surface.card }, []));
export const Button = craftComponent('Button', {}, () => ({}), () => button('continue', { class: surface.card, type: 'button' }, ${continueLabel}));
export const Alert = craftComponent('Alert', {}, () => ({}), () => p({ class: surface.message, 'data-tone': 'danger' }, ${alertLabel}));
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
  const spanImport = context.config.demoPages ? '  span,\n' : '';
  const uiImport = designSystem
    ? `import { appTheme } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';`
    : '';
  const themeOpen = designSystem ? 'div({ class: appTheme.root }, [' : 'div([';
  const themeClose = designSystem ? '])' : '])';
  const i18nEnabled = context.config.i18n.enabled;
  const text = (key: string, literal: string) =>
    i18nEnabled ? `i18n.t('${key}')` : `'${literal}'`;
  const i18nImport = i18nEnabled ? "import { i18n } from '../i18n';\n" : '';
  const badge = context.config.demoPages
    ? `        span({ class: 'starter-experimental-badge' }, ${text('ui.badge', 'Experimental · feedback welcome')}),`
    : '';
  const navigation = context.config.demoPages
    ? `        a('home', {}, ${text('ui.nav.home', 'Home')}).pipe(CraftRouterLink({ to: '' })),
        a('services', {}, ${text('ui.nav.services', 'Services')}).pipe(CraftRouterLink({ to: 'services' })),
        a('about', {}, ${text('ui.nav.about', 'About')}).pipe(CraftRouterLink({ to: 'about' })),`
    : `        a('${context.config.domain}', {}, ${text('ui.nav.domain', context.config.domain)}).pipe(CraftRouterLink({ to: '${context.config.domain}' })),`;
  return `import {
  a,
  CraftRouterOutlet,
  craftComponent,
  div,
  main,
  nav,
${spanImport}
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
${i18nImport}${uiImport}

export const App = craftComponent(
  'App',
  {},
  () => ({}),
  () =>
    ${themeOpen}
      nav([
${navigation}
${badge}
      ]),
      main(CraftRouterOutlet()),
    ${themeClose},
);
`;
}

function routesTs(context: TemplateContext): string {
  if (!context.config.demoPages) return domainRoutesTs(context);
  const httpErrorHandler =
    context.config.frontendRuntime === 'plain'
      ? `    HttpError: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
`
      : '';
  const welcomeErrorHandler =
    context.config.frontendRuntime === 'effect'
      ? `      ${context.config.backendRuntime === 'none' ? 'WelcomeApiError' : 'EffectFailure'}: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
`
      : '';
  const backendEffectErrorHandler =
    context.config.frontendRuntime === 'plain' &&
    context.config.backendRuntime === 'effect'
      ? `    StarterRepositoryError: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
`
      : '';
  return `/* eslint-disable require-yield -- Route exception outcomes are synchronous by design. */
import { loadCraftComponent } from '@craft-ts/component';
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
${backendEffectErrorHandler}
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

function domainRoutesTs(context: TemplateContext): string {
  const domain = context.config.domain;
  const type = typeNameForTemplate(domain);
  return `/* eslint-disable require-yield -- Route exception outcomes are synchronous by design. */
import { loadCraftComponent } from '@craft-ts/component';
import { craftRoutes, type CanRun, type ComponentDepsOf, type RouteCheckedDI } from '@craft-ts/core';

export const { appRoutes } = craftRoutes('app', [
  {
    path: '${domain}',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./features/${domain}/${domain}-page')).then(
        (module: typeof import('./features/${domain}/${domain}-page')) => module.default,
      ),
    ),
  },
]);

type _Check${type}PageDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./features/${domain}/${domain}-page'))['default']>,
  'CraftRouter',
  never,
  'component: ${domain}-page'
>;
type _CanRun${type}Page = CanRun<_Check${type}PageDI>;

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    App: typeof appRoutes.META_PATHS;
  }
}
`;
}

function typeNameForTemplate(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function plainAppConfig(context: TemplateContext): string {
  const serverTransport =
    context.config.backendRuntime !== 'none'
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
  return `import { craftSleep } from '@craft-ts/core';

export type WelcomeResponse = {
  readonly title: string;
  readonly body: string;
};

export function* loadWelcome() {
  // No backend is configured: simulate the typed API boundary locally.
  yield* craftSleep(10);
  return {
    title: 'Local welcome',
    body: 'This response is local because no backend is configured.',
  };
}
`;
}

function serverFiles(context: TemplateContext): Record<string, string> {
  if (context.config.backendRuntime === 'none') return {};
  const effect = context.config.backendRuntime === 'effect';
  const fnServer = effect
    ? `import { serverFunction, type ServerFunctionSuccess } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { StarterRepository } from './server/repository';
import { starterMiddleware } from './starter.mw-serveur';

const inputSchema = Schema.toStandardSchemaV1(Schema.Struct({ filter: Schema.String }));
const outputSchema = Schema.toStandardSchemaV1(Schema.Struct({ title: Schema.String, body: Schema.String }));

export const getStarterMessage = serverFunction(
  'starter.welcome', inputSchema, { exposure: 'client', output: outputSchema },
).use(starterMiddleware).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StarterRepository;
  return yield* repository.welcome(input.filter);
})).exposeErrors({
  StarterRepositoryError: (errorPayload) => ({
    code: 'STARTER_REPOSITORY_FAILURE',
    status: 503,
    payload: { filter: errorPayload.filter, message: errorPayload.message },
  }),
});

export type StarterResponse = ServerFunctionSuccess<typeof getStarterMessage>;
`
    : `import { flatMapContext, mapContext, portableServerFunction, type SchemaOutput, type ServerFunctionContractOutput, type ServerFunctionSuccess } from '@craft-ts/core';
import type { StandardSchemaV1 } from '@craft-ts/core';
import { StarterRepository } from './server/repository';

type Input = { readonly filter: string };
const inputSchema: StandardSchemaV1<Input, Input> = { '~standard': { version: 1, vendor: 'craft-starter', types: undefined,
  validate(value: unknown) { return typeof value === 'object' && value !== null && typeof (value as Input).filter === 'string'
    ? { value: value as Input } : { issues: [{ message: 'filter must be a string' }] }; } } };
const outputSchema: StandardSchemaV1<{ readonly title: string; readonly body: string }, { readonly title: string; readonly body: string }> = { '~standard': { version: 1, vendor: 'craft-starter', types: undefined,
  validate(value: unknown) { return typeof value === 'object' && value !== null && typeof (value as { title?: unknown }).title === 'string' && typeof (value as { body?: unknown }).body === 'string'
    ? { value: value as { readonly title: string; readonly body: string } } : { issues: [{ message: 'welcome response must contain title and body' }] }; } } };

export const getStarterMessage = portableServerFunction('starter.welcome', inputSchema, { exposure: 'client', output: outputSchema })
  .pipe(
    mapContext(({ input }) => ({ normalizedFilter: input.filter.trim() })),
    flatMapContext(() => StarterRepository.welcome()),
  )
  .handler(async ({ context }) => context.value as SchemaOutput<typeof outputSchema>)
  .exposeErrors({});

export type StarterResponse = ServerFunctionContractOutput<typeof getStarterMessage['contract']>;
`;
  const repository = effect
    ? `import { Context, Data, Effect, Layer } from 'effect';

export type StarterRepositoryShape = {
  readonly welcome: (filter: string) => Effect.Effect<
    { readonly title: string; readonly body: string },
    StarterRepositoryError
  >;
};
export class StarterRepository extends Context.Service<StarterRepository, StarterRepositoryShape>()('starter/StarterRepository') {}
export class StarterRepositoryError extends Data.TaggedError('StarterRepositoryError')<{
  readonly filter: string;
  readonly message: string;
}> {}

export const StarterRepositoryLive = Layer.succeed(StarterRepository, {
  welcome: (filter) => Effect.tryPromise({
    try: () => filter === 'error'
      ? Promise.reject(new Error('The starter repository failed.'))
      : Promise.resolve({ title: 'Hello from the server', body: 'Effect server function: ' + filter }),
    catch: (cause) => new StarterRepositoryError({
      filter,
      message: cause instanceof Error ? cause.message : String(cause),
    }),
  }),
});
`
    : `export const StarterRepository = {
  welcome: async () => ({ value: { title: 'Hello from the server', body: 'Promise server function works.' } }),
};
`;
  const application = effect
    ? `import { createServer, type Server } from '@craft-ts/core';
import { executeEffect } from '@craft-ts/effect';
${context.config.i18n.enabled ? "import { Layer } from 'effect';\n" : ''}
import { getStarterMessage } from '../starter.fn-serveur';
import { StarterRepositoryLive } from './repository';
${context.config.i18n.enabled ? "import { serverI18nLayer } from './i18n';\n" : ''}

export const runtimeLayer = ${context.config.i18n.enabled ? 'Layer.mergeAll(StarterRepositoryLive, serverI18nLayer)' : 'StarterRepositoryLive'};

export function createApplication(layer = runtimeLayer): Server {
  return createServer({
    functions: [getStarterMessage],
    execute: executeEffect(layer).run,
    runtimeOptions: {
      maxBodyBytes: 1_000_000,
      maxOutputBytes: 1_000_000,
      timeoutMs: 10_000,
    },
  });
}

export const application = createApplication();
`
    : `import { createServer, type Server } from '@craft-ts/core';
import { getStarterMessage } from '../starter.fn-serveur';

export function createApplication(): Server {
  return createServer({
    functions: [getStarterMessage],
    runtimeOptions: {
      maxBodyBytes: 1_000_000,
      maxOutputBytes: 1_000_000,
      timeoutMs: 10_000,
    },
  });
}

export const application = createApplication();
`;

  const nodeHttp = `/* eslint-disable craft-ts/no-async-await -- The Node adapter is an async platform boundary. */
import { application } from './application';
import type { IncomingMessage, ServerResponse } from 'node:http';

export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  const close = () => {
    if (!request.complete) abort();
  };
  request.once('aborted', abort);
  request.once('close', close);
  try {
    const webResponse = await application.handle(toWebRequest(request, abortController.signal));
    await writeWebResponse(webResponse, response, request.method === 'HEAD');
  } finally {
    request.off('aborted', abort);
    request.off('close', close);
  }
}

function toWebRequest(request: IncomingMessage, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = request.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(
    'http://' + (request.headers.host ?? '127.0.0.1') + (request.url ?? '/'),
    {
      method,
      headers,
      signal,
      ...(hasBody ? { body: request as unknown as BodyInit, duplex: 'half' } : {}),
    } as RequestInit,
  );
}

async function writeWebResponse(
  webResponse: Response,
  response: ServerResponse,
  head: boolean,
): Promise<void> {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  if (head || webResponse.body === null) {
    response.end();
    return;
  }
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
`;

  const client = `import { createServerFunctionClient, craftUnique, type ServerFunctionClient } from '@craft-ts/core';
import type { getStarterMessage as ServerGetStarterMessage, StarterResponse } from './starter.fn-serveur';

export type { StarterResponse };
const starterMessageTransport = createServerFunctionClient<typeof ServerGetStarterMessage>(craftUnique('starter.welcome'));
export const getStarterMessage = starterMessageTransport as ServerFunctionClient<typeof ServerGetStarterMessage, StarterResponse>;
`;
  const compatibilityServer = `export { application, createApplication } from './application';
${effect ? "export { runtimeLayer } from './application';\n" : ''}export { handleRequest } from './node-http';
`;
  return {
    'src/server/repository.ts': repository,
    'src/server/application.ts': application,
    'src/server/node-http.ts': nodeHttp,
    'src/server/server.ts': compatibilityServer,
    'src/starter.fn-serveur.ts': fnServer,
    'src/starter.fn-client.ts': client,
    ...(effect && context.config.i18n.enabled
      ? {
          'src/server/i18n.ts':
            "import { provideI18nRuntime } from '@craft-ts/i18n-effect';\nimport { i18n } from '../i18n/runtime';\n\nexport const serverI18nLayer = provideI18nRuntime(i18n);\n",
        }
      : {}),
    ...(effect
      ? {
          'src/starter.mw-serveur.ts':
            "import { Effect } from 'effect';\nimport { effectServerMiddleware } from '@craft-ts/effect';\n\nexport const starterMiddleware = effectServerMiddleware('starter.middleware', () =>\n  Effect.gen(function* () {\n    yield* Effect.log('starter middleware executed');\n    return { value: undefined };\n  }),\n);\n",
        }
      : {}),
    'vitest.server.config.ts': `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'craft-starter-server', globals: true, environment: 'node', include: ['src/server/**/*.spec.ts'] } });
`,
    'src/server/server.spec.ts': serverSpec(context),
  };
}

function serverSpec(context: TemplateContext): string {
  const effectFailure =
    context.config.backendRuntime === 'effect'
      ? `
  it('exposes the typed Effect repository failure', async () => {
    const response = await application.handle(new Request('http://127.0.0.1/__server-functions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'starter.welcome', input: { filter: 'error' } }),
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { _tag: 'StarterRepositoryError', code: 'STARTER_REPOSITORY_FAILURE', filter: 'error' },
    });
  });
`
      : '';
  return `import { createServer as createNodeServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createServer, serverFunction, type StandardSchemaV1 } from '@craft-ts/core';
import { application, handleRequest } from './server';

const invalidInputSchema: StandardSchemaV1<unknown, unknown> = {
  '~standard': { version: 1, vendor: 'craft-starter-test', types: undefined,
    validate(value: unknown) { return { value }; } },
};
const invalidOutputSchema: StandardSchemaV1<{ readonly required: string }, { readonly required: string }> = {
  '~standard': { version: 1, vendor: 'craft-starter-test', types: undefined,
    validate(value: unknown) {
      return typeof value === 'object' && value !== null && typeof (value as { required?: unknown }).required === 'string'
        ? { value: value as { readonly required: string } }
        : { issues: [{ message: 'required must be a string' }] };
    } },
};
const invalidOutput = serverFunction(
  'starter.invalid-output',
  invalidInputSchema,
  { exposure: 'server', output: invalidOutputSchema },
).handler(() => ({ required: 123 })).exposeErrors({});

describe('server function registry', () => {
  it('invokes the starter function through the registry', async () => {
    await expect(application.invoke('starter.welcome', { filter: 'Ada' })).resolves.toMatchObject({
      title: 'Hello from the server',
    });
  });

  it('rejects invalid input', async () => {
    await expect(application.invoke('starter.welcome', { filter: 123 })).rejects.toThrow(
      'CRAFT_SERVER_FUNCTION_INPUT_INVALID',
    );
  });

  it('rejects invalid output', async () => {
    const server = createServer({ functions: [invalidOutput] });
    await expect(server.invoke('starter.invalid-output', undefined)).rejects.toThrow(
      'CRAFT_SERVER_FUNCTION_OUTPUT_INVALID',
    );
  });
${effectFailure}

  it('serves a real HTTP request through the Node adapter', async () => {
    const nodeServer = createNodeServer((request, response) => {
      void handleRequest(request, response).catch((error: unknown) => {
        if (!response.headersSent) response.statusCode = 500;
        response.end('Internal Server Error');
        throw error;
      });
    });
    await new Promise<void>((resolve) => nodeServer.listen(0, '127.0.0.1', resolve));
    const address = nodeServer.address();
    if (!address || typeof address === 'string') throw new Error('Server did not start.');
    try {
      const response = await fetch('http://127.0.0.1:' + address.port + '/__server-functions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'starter.welcome', input: { filter: 'Ada' } }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ title: 'Hello from the server' });
    } finally {
      await new Promise<void>((resolve, reject) => nodeServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('rejects unsupported method and content type', async () => {
    await expect(application.handle(new Request('http://127.0.0.1/__server-functions'))).resolves.toHaveProperty('status', 405);
    await expect(application.handle(new Request('http://127.0.0.1/__server-functions', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }))).resolves.toHaveProperty('status', 415);
  });
});
`;
}

function referenceFiles(context: TemplateContext): Record<string, string> {
  if (!context.config.references.craftTs && !context.config.references.effectTs)
    return {};
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    mode: 'context',
    effectEnabled:
      context.config.frontendRuntime === 'effect' ||
      context.config.backendRuntime === 'effect',
  };
  if (context.config.references.craftTs)
    manifest['craftTs'] = {
      url: 'https://github.com/craft-ts/craft-ts.git',
      requestedRef: context.config.references.craftTsRef,
      resolvedSha: '',
      path: '.references/craft-ts',
    };
  if (context.config.references.effectTs)
    manifest['effectTs'] = {
      url: 'https://github.com/Effect-TS/effect.git',
      requestedRef: context.config.references.effectTsRef,
      resolvedSha: '',
      path: '.references/effect-ts',
    };
  const resolver =
    "import { readFileSync } from 'node:fs'; import { join, resolve } from 'node:path';\nexport function resolveReferenceManifest(root) { return JSON.parse(readFileSync(join(root, '.references/manifest.json'), 'utf8')); }\nexport function resolveReferencePath(root, name) { const manifest = resolveReferenceManifest(root); return manifest[name] ? resolve(root, manifest[name].path) : undefined; }\n";
  const updater = `import { execFileSync } from 'node:child_process'; import { existsSync, readFileSync, writeFileSync } from 'node:fs'; import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const manifestPath = join(root, '.references/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const [name, entry] of Object.entries(manifest).filter(([key, value]) => !['schemaVersion', 'mode', 'effectEnabled'].includes(key) && value && value.path)) {
  const path = resolve(root, entry.path);
  if (!existsSync(join(path, '.git'))) throw new Error('Missing reference clone: ' + path);
  if (execFileSync('git', ['status', '--short'], { cwd: path, encoding: 'utf8' }).trim()) throw new Error('Modified reference: ' + path);
  execFileSync('git', ['fetch', '--depth', '1', 'origin', entry.requestedRef], { cwd: path, stdio: 'inherit' });
  execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: path, stdio: 'inherit' });
  entry.resolvedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path, encoding: 'utf8' }).trim();
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');
`;
  return {
    '.gitignore': GENERATED_GITIGNORE,
    '.references/manifest.json': json(manifest),
    'scripts/reference-resolver.mjs': resolver,
    'scripts/update-references.mjs': updater,
    ...(context.config.references.craftTs
      ? { 'scripts/update-craft-ts.mjs': updater }
      : {}),
    ...(context.config.references.effectTs
      ? { 'scripts/update-effect-ts.mjs': updater }
      : {}),
  };
}

function cloneReferenceIfRequested(root: string, config: StarterConfig): void {
  const entries = [
    config.references.craftTs
      ? [
          'https://github.com/craft-ts/craft-ts.git',
          config.references.craftTsRef,
          '.references/craft-ts',
        ]
      : undefined,
    config.references.effectTs
      ? [
          'https://github.com/Effect-TS/effect.git',
          config.references.effectTsRef,
          '.references/effect-ts',
        ]
      : undefined,
  ].filter((entry): entry is [string, string, string] => entry !== undefined);
  for (const [url, ref, relativePath] of entries) {
    const target = join(root, relativePath);
    if (!existsSync(join(target, '.git'))) {
      mkdirSync(dirname(target), { recursive: true });
      execFileSync(
        'git',
        ['clone', '--depth', '1', '--branch', ref, url, target],
        { cwd: root, stdio: 'inherit' },
      );
    }
  }
  const manifestPath = join(root, '.references', 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      { path: string; resolvedSha?: string }
    >;
    for (const entry of Object.values(manifest)) {
      if (!entry.path) continue;
      const target = resolve(root, entry.path);
      entry.resolvedSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: target,
        encoding: 'utf8',
      }).trim();
    }
    writeFileSync(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  }
}

function ensureGitignore(root: string): void {
  const gitignorePath = join(root, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GENERATED_GITIGNORE, 'utf8');
    return;
  }
  const existing = readFileSync(gitignorePath, 'utf8');
  const existingLines = new Set(
    existing.split(/\r?\n/).map((line) => line.trim()),
  );
  const missing = GENERATED_GITIGNORE.trimEnd()
    .split('\n')
    .filter((line) => !existingLines.has(line));
  if (missing.length > 0) {
    writeFileSync(
      gitignorePath,
      `${existing.trimEnd()}\n\n# CraftTS generated project\n${missing.join('\n')}\n`,
      'utf8',
    );
  }
}

function initialiseGitRepository(root: string): void {
  if (existsSync(join(root, '.git'))) return;
  try {
    const parentRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (parentRoot && resolve(parentRoot) !== resolve(root)) return;
  } catch {
    // The destination is not inside an existing Git worktree.
  }
  execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'ignore' });
}

function aboutPageTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const surfaceImport = designSystem
    ? `import { surface } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';\n`
    : '';
  const card = designSystem ? '{ class: surface.card }, ' : '';
  const sample = context.config.i18n.enabled
    ? ["p(i18n.t('order.summary', { amount: 1234.5, count: 2, date: Date.UTC(2026, 0, 15) })),"]
    : [];
  const title = context.config.i18n.enabled
    ? "i18n.t('ui.about.title')"
    : "'About this starter'";
  const body = context.config.i18n.enabled
    ? "i18n.t('ui.about.body')"
    : "'This page proves that Craft routing and lazy component loading are wired.'";
  const i18nImport = context.config.i18n.enabled
    ? "import { i18n } from '../i18n';\n"
    : '';
  const children = [`heading(${title}),`, ...sample, `p(${body}),`].join(
    '\n      ',
  );
  return `import { craftComponent, div, heading, p } from '@craft-ts/component';
${surfaceImport}${i18nImport}

export const AboutPage = craftComponent(
  'AboutPage',
  {},
  () => ({}),
  () =>
    div(${card}[
      ${children}
    ]),
);

export default AboutPage;
`;
}

function domainPageTs(context: TemplateContext): string {
  const domain = context.config.domain;
  const type = typeNameForTemplate(domain);
  const i18nEnabled = context.config.i18n.enabled;
  const i18nImport = i18nEnabled
    ? "import { i18n } from '../../../i18n';\n"
    : '';
  const title = i18nEnabled ? "i18n.t('ui.domain.title')" : `'${type}'`;
  const body = i18nEnabled
    ? "i18n.t('ui.domain.body')"
    : `'This is the ${domain} feature boundary. Add the domain flow here.'`;
  return `import { craftComponent, div, heading, p } from '@craft-ts/component';
${i18nImport}
/** Domain-first entry point. Add queries, mutations and forms in this feature. */
export const ${type}Page = craftComponent(
  '${type}Page',
  {},
  () => ({}),
  () => div([
    heading(${title}),
    p(${body}),
  ]),
);

export default ${type}Page;
`;
}

function resetStarterScript(context: TemplateContext): string {
  const minimalContext: TemplateContext = {
    ...context,
    config: { ...context.config, demoPages: false },
  };
  const files = {
    'src/app/app.ts': appTs(minimalContext),
    'src/app/app.routes.ts': routesTs(minimalContext),
    [`src/app/features/${context.config.domain}/${context.config.domain}-page.ts`]:
      domainPageTs(minimalContext),
    [`src/app/features/${context.config.domain}/${context.config.domain}-page.spec.ts`]: `import { describe, expect, it } from 'vitest';
import ${typeNameForTemplate(context.config.domain)}Page from './${context.config.domain}-page';

describe('${context.config.domain} feature', () => {
  it('exports the domain entry point', () => expect(${typeNameForTemplate(context.config.domain)}Page).toBeDefined());
});
`,
    [`src/app/features/${context.config.domain}/README.md`]: `# ${context.config.domain} feature

This is the domain boundary generated by craft create. Add the query, mutation, form and server function for this feature here.
`,
    '.craft/starter.json': starterManifest(minimalContext),
    'README.md': readme(minimalContext),
  };
  const removed = [
    'src/app/api.ts',
    'src/app/domain.ts',
    'src/app/home-page.ts',
    'src/app/home-page.spec.ts',
    'src/app/about-page.ts',
    'src/app/services-page.ts',
    'e2e/starter.spec.ts',
    'e2e/i18n.spec.ts',
  ];
  return `import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = join(root, '.craft/starter.json');
if (!existsSync(manifestPath)) {
  throw new Error('This project was not generated by craft create.');
}
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.status !== 'demo') {
  console.log('Starter is already in domain-first state; nothing to reset.');
  process.exit(0);
}

for (const file of ${JSON.stringify(removed)}) {
  await rm(join(root, file), { recursive: true, force: true });
}
for (const [file, contents] of Object.entries(${JSON.stringify(files)})) {
  const target = join(root, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
}
console.log('Reset complete: demo pages removed; domain feature is ready.');
`;
}

function servicesPageTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const uiImport = designSystem
    ? `import { surface } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';\n`
    : '';
  const card = designSystem ? '{ class: surface.card }, ' : '';
  const i18n =
    context.config.i18n.enabled && context.config.frontendRuntime !== 'effect'
      ? "import { i18n } from '../i18n';\n"
      : '';
  const effectI18n =
    context.config.frontendRuntime === 'effect' && context.config.i18n.enabled
      ? "import { i18n } from '../i18n';\n"
      : '';
  const hasI18n = context.config.i18n.enabled;
  const title = hasI18n ? "i18n.t('ui.services.title')" : "'Services'";
  const effectLead = hasI18n
    ? "p(i18n.t('ui.services.effect')),"
    : "p('Effect service: Context.Service + Layer + provideLayer are installed at app scope.'),";
  const body =
    context.config.frontendRuntime === 'effect'
      ? `${effectLead}
      ${hasI18n ? "p(i18n.t('order.items', { count: 2 }))," : "p('The service contract is isolated from the page.'),"}`
      : `p(function* () { return 'Plain service: ' + (yield* StarterService()).label; }),
      ${hasI18n ? "p(i18n.t('order.items', { count: 2 }))," : "p('The service is resolved through Craft DI.'),"}`;
  const service =
    context.config.frontendRuntime === 'effect'
      ? ''
      : `import { craftService } from '@craft-ts/core';

const { StarterService } = craftService({ name: 'StarterService', providedIn: 'global' }, function* () {
  return { label: 'resolved through Craft DI' };
});
`;
  const lintComment =
    context.config.frontendRuntime === 'effect'
      ? ''
      : '/* eslint-disable require-yield -- Synchronous DI factory is intentional in this starter. */\n';
  return `${lintComment}import { craftComponent, div, heading, p } from '@craft-ts/component';
${uiImport}${i18n}${effectI18n}${service}
export const ServicesPage = craftComponent(
  'ServicesPage',
  {},
  () => ({}),
  () => div(${card}[
    heading(${title}),
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
  const card = designSystem ? '{ class: surface.card }, ' : '';
  const note = designSystem ? '{ class: surface.note }, ' : '';
  const message = designSystem
    ? "{ class: surface.message, 'data-tone': 'danger' }, "
    : '';
  const i18n = context.config.i18n.enabled
    ? "import { i18n } from '../i18n';\n"
    : '';
  const hasI18n = context.config.i18n.enabled;
  const summary = hasI18n
    ? "p(i18n.t('order.summary', { amount: 1234.5, count: 2, date: Date.UTC(2026, 0, 15) })),"
    : "p('A framework-independent starter with a typed API boundary.'),";
  const title = hasI18n ? "i18n.t('ui.home.title')" : "'Welcome to CraftTS'";
  const loading = hasI18n ? "i18n.t('ui.home.loading')" : "'Loading API…'";
  const apiError = hasI18n
    ? "i18n.t('ui.home.apiError')"
    : "'The API request failed. Check the network tab.'";
  const loadLoader =
    context.config.backendRuntime === 'none'
      ? 'function* () { return yield* loadWelcome(); }'
      : '() => loadWelcome()';
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
        loader: ${loadLoader},
      },
      ({ resource }) => ({
        hasWelcome: craftComputed('hasWelcome', () => resource.hasValue()),
      }),
    );
    return { welcomeQuery };
  },
  ({ welcomeQuery }) =>
    div(${card}[
      heading(${title}),
      ${summary}
      ifNode(welcomeQuery.isLoading, () => p(${note}${loading})),
      ifNode(welcomeQuery.hasWelcome, () =>
        div([
          p(function* () {
            return 'API title: ' + String((yield* welcomeQuery.value())?.title);
          }),
          p(function* () {
            return 'API body: ' + String((yield* welcomeQuery.value())?.body);
          }),
        ]),
      ),
      ifNode(welcomeQuery.hasException, () =>
        p(${message}[
          span(${apiError}),
        ]),
      ),
    ]),
);

export default HomePage;
`;
}

function effectDomainTs(context: TemplateContext): string {
  const loadImplementation =
    context.config.backendRuntime === 'none'
      ? `  load: () => Effect.gen(function* () {
    // No backend is configured: simulate the typed API boundary locally.
    yield* Effect.sleep('10 millis');
    return {
      title: 'Local welcome',
      body: 'This response is local because no backend is configured.',
    };
  }),`
      : `  load: () =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch('/api/welcome');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return (await response.json()) as WelcomeResponse;
      },
      catch: (cause) => new WelcomeApiError({ message: String(cause) }),
    }),`;
  return `/* eslint-disable craft-ts/prefer-craft-http-transport, craft-ts/no-async-await, craft-ts/no-throw -- Effect owns this typed transport boundary. */
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
${loadImplementation}
});

export const loadWelcome = () => Effect.gen(function* () {
  const repository = yield* WelcomeRepositoryService;
  return yield* repository.load();
});
`;
}

function effectHomePageTs(context: TemplateContext): string {
  const designSystem = context.config.designSystem !== 'none';
  const surfaceImport = designSystem
    ? `import { surface } from './ui/${context.config.typedCss ? 'ui.style' : 'ui'}';\n`
    : '';
  const card = designSystem ? '{ class: surface.card }, ' : '';
  const note = designSystem ? '{ class: surface.note }, ' : '';
  const message = designSystem
    ? "{ class: surface.message, 'data-tone': 'danger' }, "
    : '';
  const i18nImports = context.config.i18n.enabled
    ? "import { i18n } from '../i18n';\n"
    : '';
  const hasI18n = context.config.i18n.enabled;
  const summary = hasI18n
    ? "p(i18n.t('order.summary', { amount: 1234.5, count: 2, date: Date.UTC(2026, 0, 15) })),"
    : "p('The page uses queryEffect over a typed repository Layer.'),";
  const title = hasI18n
    ? "i18n.t('ui.home.titleEffect')"
    : "'Welcome to CraftTS + Effect v4'";
  const loading = hasI18n ? "i18n.t('ui.home.loading')" : "'Loading API…'";
  const effectLoader =
    context.config.backendRuntime === 'none'
      ? 'loadWelcome()'
      : 'Effect.tryPromise({ try: () => loadWelcome(), catch: (cause) => new Error(String(cause)) })';
  const effectErrorTag =
    context.config.backendRuntime === 'none'
      ? 'WelcomeApiError'
      : 'EffectFailure';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readWelcomeField(value: unknown, field: 'title' | 'body'): string {
  if (!isRecord(value) || !(field in value)) {
    return '';
  }
  const fieldValue = value[field];
  return typeof fieldValue === 'string' ? fieldValue : '';
}

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
      heading(${title}),
      ${summary}
      ifNode(welcomeQuery.isLoading, () => p(${note}${loading})),
      ifNode(welcomeQuery.hasWelcome, () =>
        div([
          p(function* () {
            return 'API title: ' + readWelcomeField(yield* welcomeQuery.value(), 'title');
          }),
          p(function* () {
            return 'API body: ' + readWelcomeField(yield* welcomeQuery.value(), 'body');
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
${i18n ? "import { Layer } from 'effect';" : ''}
import { App } from './app';
import { appRoutes } from './app.routes';
${i18n ? "import { i18nLayer } from '../i18n/effect-layer';" : ''}
import {
  WelcomeRepositoryLive,
} from './domain';

const effectProviders = provideLayer(${i18n ? 'Layer.mergeAll(WelcomeRepositoryLive, i18nLayer)' : 'WelcomeRepositoryLive'});
const developmentProviders = import.meta.env.DEV ? provideCraftDevTools() : [];

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_PATHS,
  providers: [
    ...developmentProviders,
    provideCraftRootComponent(App),
    provideCraftRouter(appRoutes.toRoutes()),
${context.config.backendRuntime !== 'none' ? '    provideDefaultServerFunctionTransport(),\n' : ''}
    effectProviders,
    provideAppInitializer(() => installCraftEffectBridge()),
  ],
});

// Keep all application layers inside one provider: provideLayer replaces the
// level when registered twice, so separate providers would drop one layer.
`;
}

function unitTestTs(context: TemplateContext): string {
  const effect = context.mode === 'effect';
  const hasServer = context.config.backendRuntime !== 'none';
  const expectedTitle = hasServer ? 'Hello from the API' : 'Local welcome';
  const serverMock = hasServer
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
    await vi.waitFor(() => expect(host.textContent).toContain('${expectedTitle}'));
    mounted.destroy();
  });
});
`;
}

function e2eTestTs(context: TemplateContext): string {
  const hasServer = context.config.backendRuntime !== 'none';
  const expectedTitle = hasServer ? 'Hello from the server' : 'Local welcome';
  const routeMock = hasServer ? '' : '';
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
  const effect = context.config.frontendRuntime === 'effect';
  // Read from the same copy the catalogue is generated from: the assertion
  // fails if a locale stops translating the page, not if a string moves.
  const titles = Object.fromEntries(
    context.locales.map((locale) => {
      const copy = starterUiCopy(context, locale.toLowerCase().startsWith('fr'));
      return [locale, effect ? copy.homeTitleEffect : copy.homeTitle];
    }),
  );
  return `import { expect, test } from '@playwright/test';

const locales = ${JSON.stringify(context.locales)} as const;
const titles: Record<string, string> = ${JSON.stringify(titles)};

for (const locale of locales) {
  test(\`renders the real starter page without layout overflow in \${locale}\`, async ({ page }) => {
    await page.goto('/?locale=' + locale);
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByRole('heading', { name: titles[locale] }),
    ).toBeVisible();
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

const starterPort = Number(process.env.CRAFT_STARTER_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:' + starterPort, ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:' + starterPort,
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
  const effect =
    context.config.frontendRuntime === 'effect' ||
    context.config.backendRuntime === 'effect';
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
  const effect =
    context.config.frontendRuntime === 'effect' ||
    context.config.backendRuntime === 'effect';
  const i18n = context.config.i18n.enabled;
  const typedCss = context.config.typedCss;
  const designSystem = context.config.designSystem !== 'none';
  const server = context.config.backendRuntime !== 'none';
  const demoPages = context.config.demoPages;
  const references =
    context.config.references.craftTs || context.config.references.effectTs;
  const referencePath =
    context.config.workspace.kind === 'nx'
      ? '../../.references'
      : '.references';
  return [
    `# ${context.projectName}`,
    '',
    'A framework-independent CraftTS starter generated by craft create.',
    '',
    'This project includes:',
    '',
    demoPages
      ? '- a routed Craft component page;'
      : `- a domain-first ${'`'}${context.config.domain}${'`'} feature boundary;`,
    `- a ${server ? 'server-function' : 'typed CraftHttpClient'} API boundary${effect ? ' with an Effect v4 repository service and Layer' : ''};`,
    ...(demoPages
      ? ['- three lazy routes: `/`, `/services` and `/about`;']
      : [
          `- one lazy route: ${'`'}/${context.config.domain}${'`'};`,
          '- no explanatory demo pages; add a form with `craft add form <name>`.',
        ]),
    ...(designSystem
      ? [
          `- a ${typedCss ? 'typed CSS' : 'plain CSS'} design-system composition;`,
        ]
      : []),
    '- development logs forwarded from Craft Console.* to a local JSONL server;',
    '- MCP configuration for Craft guidance, logs and the browser page surface;',
    '- flat-config ESLint with Craft rules;',
    '- unit tests, graph-wide architecture tests and a Playwright E2E flow.',
    ...(i18n
      ? [
          '- a type-safe i18n catalogue with locale parity, semantic tokens and strict plural checks.',
        ]
      : []),
    ...(references
      ? [
          `- cloned CraftTS/EffectTS source references for coding agents under \`${referencePath}/\`; run \`npm run update:references\` to refresh them.`,
        ]
      : []),
    '',
    '## Start',
    '',
    'npm install',
    'npm run logs:server',
    'npm run registry:mcp',
    'npm run dev',
    '',
    demoPages
      ? 'Before product development, run `npm run reset:starter` to remove the explanatory demo pages and keep the generated domain feature.'
      : 'The starter is already in its minimal domain-first state.',
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
    ...(demoPages ? ['npm run e2e'] : []),
    'npm run build',
    '',
    ...(i18n
      ? [
          '## i18n',
          '',
          '',
          'Add or change translation keys in src/i18n/catalog.ts. Add a locale under',
          'src/i18n/locales/ with defineLocaleLike so keys, parameters and token kinds',
          'stay aligned. Define application tokens in project-tokens.ts with',
          'defineToken or defineTokenFactory; the plain i18n package does not require',
          'Effect. Strict plural categories and locale parity are checked by',
          'npm run i18n:check. Use npm run i18n:test for runtime and page fixtures.',
        ]
      : []),
    ...(references
      ? [
          '## References',
          '',
          `The \`${referencePath}/manifest.json\` file records the requested refs and resolved SHAs.`,
          'The cloned repositories are read-only context for coding agents; the application always uses the npm dependencies declared in package.json.',
          'Do not add file: dependencies or TypeScript/Vite aliases to the clones.',
          'Run `npm run update:references` after reviewing local changes in a clone.',
        ]
      : []),
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

function starterManifest(context: TemplateContext): string {
  return json({
    schemaVersion: 1,
    status: context.config.demoPages ? 'demo' : 'domain',
    domain: context.config.domain,
    frontendRuntime: context.config.frontendRuntime,
    backendRuntime: context.config.backendRuntime,
    i18n: context.config.i18n.enabled ? context.config.i18n.validation : 'none',
    locales: context.locales,
    defaultLocale: context.defaultLocale,
    designSystem: context.config.designSystem,
    typedCss: context.config.typedCss,
  });
}

function agentFiles(
  mode: CreateMode,
  agent: CreateAgent,
  config?: StarterConfig,
): Record<string, string> {
  const effectEnabled =
    config?.frontendRuntime === 'effect' ||
    config?.backendRuntime === 'effect' ||
    mode === 'effect';
  const baseSkill =
    config?.i18n.enabled === false
      ? BASE_AGENT_SKILL.replace(
          /4\. Keep translations[\s\S]*?5\. Keep visual/,
          '5. Keep visual',
        )
      : BASE_AGENT_SKILL;
  const skill = `${baseSkill}${effectEnabled ? `\n${EFFECT_AGENT_SKILL}` : ''}${referenceAgentGuidance(config)}`;
  if (agent === 'codex') {
    return {
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
  const demoPages = context.config.demoPages;
  const localeFiles = Object.fromEntries(
    hasI18n
      ? context.locales.map((locale, index) => [
          `src/i18n/locales/${locale}.ts`,
          i18nLocaleTs(locale, index, context),
        ])
      : [],
  );
  const files: Record<string, string> = {
    'package.json': packageJson(context),
    'AGENTS.md': AGENTS_MD(context.mode, context.config),
    '.gitignore': GENERATED_GITIGNORE,
    'tsconfig.json': tsconfig(context),
    'tsconfig.app.json': tsconfigApp,
    'tsconfig.spec.json': tsconfigSpec,
    ...(hasEffect
      ? {
          'tsconfig.effect.json': tsconfigEffect,
          'scripts/run-effect-tsgo.mjs': effectTsgoRunner,
        }
      : {}),
    ...(typedCss ? { 'scripts/style-check.mjs': styleCheckScript } : {}),
    ...(hasServer ? { 'tsconfig.server.json': tsconfigServer } : {}),
    'scripts/typecheck.mjs': typecheckScript(context),
    'scripts/dev.mjs': devScript,
    'scripts/reset-starter.mjs': resetStarterScript(context),
    'vite.config.ts': viteConfig(context),
    'vitest.config.ts': vitestConfig,
    'eslint.config.mjs': eslintConfig(
      effect,
      context.config.backendRuntime === 'effect',
      context.config.i18n.enabled,
    ),
    'playwright.config.ts': playwrightConfig,
    'index.html': indexHtml(context.defaultLocale),
    '.mcp.json': mcpConfig,
    '.github/workflows/ci.yml': githubWorkflow(context),
    'README.md': readme(context),
    'src/main.ts': mainTs(context),
    'src/dev-typecheck-indicator.ts': typecheckIndicatorTs,
    'src/styles.css': stylesFor(context),
    '.craft/starter.json': starterManifest(context),
    ...(hasI18n
      ? {
          'src/i18n/catalog.ts': i18nCatalogTs(context),
          'src/i18n/project-tokens.ts': projectTokensTs,
          'src/i18n/runtime.ts': i18nRuntimeTs(context),
          'src/i18n/typography.ts': typographyTs,
          'src/i18n/index.ts': i18nIndexTs,
        }
      : {}),
    ...localeFiles,
    ...(effect && hasI18n
      ? {
          'src/i18n/effect.ts': effectI18nTs,
          ...(effect ? { 'src/i18n/effect-layer.ts': effectLayerTs } : {}),
        }
      : {}),
    'src/types.d.ts':
      '/// <reference types="vite/client" />\n' +
      (typedCss
        ? "\n// Served by the craftStyle plugin; it has no file on disk to resolve.\ndeclare module 'virtual:craft-style.css';\n"
        : ''),
    'src/app/app.ts': appTs(context),
    'src/app/app.config.ts': effect
      ? effectAppConfig(context)
      : plainAppConfig(context),
    'src/app/app.routes.ts': routesTs(context),
    ...(demoPages
      ? {
          'src/app/api.ts':
            effect && !hasServer
              ? "export { loadWelcome } from './domain';\nexport type { WelcomeResponse } from './domain';\n"
              : apiTs(context),
          ...(effect
            ? {
                'src/app/domain.ts': effectDomainTs(context),
                'src/app/home-page.ts': effectHomePageTs(context),
              }
            : { 'src/app/home-page.ts': plainHomePageTs(context) }),
          'src/app/about-page.ts': aboutPageTs(context),
          'src/app/services-page.ts': servicesPageTs(context),
          'src/app/home-page.spec.ts': unitTestTs(context),
          'e2e/starter.spec.ts': e2eTestTs(context),
          ...(hasI18n ? { 'e2e/i18n.spec.ts': i18nE2eTestTs(context) } : {}),
        }
      : {
          [`src/app/features/${context.config.domain}/${context.config.domain}-page.ts`]:
            domainPageTs(context),
          [`src/app/features/${context.config.domain}/${context.config.domain}-page.spec.ts`]: `import { describe, expect, it } from 'vitest';\nimport ${typeNameForTemplate(context.config.domain)}Page from './${context.config.domain}-page';\n\ndescribe('${context.config.domain} feature', () => {\n  it('exports the domain entry point', () => expect(${typeNameForTemplate(context.config.domain)}Page).toBeDefined());\n});\n`,
          [`src/app/features/${context.config.domain}/README.md`]: `# ${context.config.domain} feature\n\nThis is the domain boundary generated by craft create --no-demos. Add the query, mutation, form and server function for this feature here.\n`,
        }),
  };
  if (hasDesignSystem) {
    files[`src/app/ui/${typedCss ? 'ui.style.ts' : 'ui.ts'}`] = typedCss
      ? uiStyleTs
      : uiPlainTs;
    files['src/app/ui/components.ts'] = uiComponentsTs(context);
  }
  Object.assign(files, serverFiles(context));
  return files;
}

function nxProjectJson(context: TemplateContext): string {
  const projectRoot = `apps/${context.config.workspace.projectName}`;
  const run = (command: string) => ({
    executor: 'nx:run-commands',
    options: {
      command: `npm run ${context.config.workspace.projectName}:${command}`,
      cwd: '.',
    },
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
      ...(context.config.references.craftTs ||
      context.config.references.effectTs
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
  if (value === 'cloud-code' || value === 'cloudcode' || value === 'gemini')
    return 'cloud-code';
  throw new Error(
    `Unknown agent "${agent}". Use codex, cursor, claude-code, or cloud-code.`,
  );
}

export function parseCreateAgents(
  value: string | undefined,
): readonly CreateAgent[] {
  if (!value) return DEFAULT_AGENTS;
  if (value.trim() === '' || value.trim().toLowerCase() === 'none') return [];
  return [...new Set(value.split(',').map(normaliseAgent))];
}

function projectNameForDirectory(directory: string): string {
  return (
    directory
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/[^a-zA-Z0-9._-]/g, '-') || 'craft-app'
  );
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
  const rootDir =
    !options.rootDir && isAbsolute(options.directory)
      ? dirname(resolve(options.directory))
      : requestedRootDir;
  const requestedMode = options.mode;
  let frontendRuntime = options.frontendRuntime ?? requestedMode ?? 'plain';
  let backendRuntime = options.backendRuntime ?? 'none';

  if (options.effectScope) {
    const scoped = {
      none: ['plain', 'none'],
      frontend: ['effect', 'none'],
      backend: ['plain', 'effect'],
      both: ['effect', 'effect'],
    } as const;
    const selectedScope = scoped[options.effectScope];
    if (!selectedScope)
      throw new Error(`Unknown effect scope "${options.effectScope}".`);
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

  if (
    frontendRuntime === 'effect' &&
    requestedMode === 'plain' &&
    options.frontendRuntime === undefined
  ) {
    frontendRuntime = 'plain';
  }
  if (!['plain', 'effect'].includes(frontendRuntime)) {
    throw new Error(`Unknown frontend runtime "${frontendRuntime}".`);
  }
  if (!['none', 'promise', 'effect'].includes(backendRuntime)) {
    throw new Error(`Unknown backend runtime "${backendRuntime}".`);
  }
  if (
    options.i18n !== undefined &&
    !['strict', 'loose', 'none'].includes(options.i18n)
  ) {
    throw new Error(`Unknown i18n mode "${options.i18n}".`);
  }
  if (
    options.designSystem !== undefined &&
    !['none', 'basic'].includes(options.designSystem)
  ) {
    throw new Error(`Unknown design system "${options.designSystem}".`);
  }
  if (
    options.workspace !== undefined &&
    !['standalone', 'nx'].includes(options.workspace)
  ) {
    throw new Error(`Unknown workspace "${options.workspace}".`);
  }

  const i18nEnabled = options.i18nEnabled ?? options.i18n !== 'none';
  const hasExplicitLocaleOptions =
    options.locales !== undefined || options.defaultLocale !== undefined;
  if (!i18nEnabled && hasExplicitLocaleOptions) {
    throw new Error(
      '--locales and --default-locale require i18n to be enabled.',
    );
  }
  const locales = i18nEnabled
    ? [...new Set(options.locales ?? ['en-US', 'fr-FR'])]
    : [];
  if (i18nEnabled && locales.length === 0) {
    throw new Error('At least one i18n locale is required.');
  }
  const defaultLocale = options.defaultLocale ?? locales[0] ?? 'en-US';
  if (i18nEnabled && !locales.includes(defaultLocale)) {
    throw new Error(`Default locale "${defaultLocale}" is not in --locales.`);
  }

  const references = options.references ?? 'none';
  if (!['none', 'craft-ts', 'all'].includes(references)) {
    throw new Error(`Unknown references selection "${references}".`);
  }
  if (
    options.referenceMode !== undefined &&
    options.referenceMode !== 'context'
  ) {
    throw new Error(
      `Reference mode "${options.referenceMode}" is no longer supported; cloned references are context only and npm packages remain the runtime dependencies.`,
    );
  }
  const craftTs =
    options.cloneCraftTs ?? (references === 'craft-ts' || references === 'all');
  const effectTs = options.cloneEffectTs ?? references === 'all';
  if (effectTs && frontendRuntime !== 'effect' && backendRuntime !== 'effect') {
    throw new Error(
      'EffectTS references require an Effect frontend or backend runtime.',
    );
  }
  const directory = resolve(rootDir, options.directory);
  const workspaceKind =
    options.workspace ??
    (existsSync(join(rootDir, 'nx.json')) ? 'nx' : 'standalone');
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
      mode: 'context',
      craftTsRef: options.craftTsRef ?? 'main',
      effectTsRef: options.effectTsRef ?? 'main',
    },
    agents: options.agents ?? DEFAULT_AGENTS,
    demoPages: options.demoPages ?? true,
    domain: slugForGeneratedDomain(options.domain),
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
    packageVersion:
      options.packageVersion ?? process.env['CRAFT_RELEASE_VERSION'],
  };

  if (
    existsSync(directory) &&
    !options.force &&
    (await readdir(directory)).length > 0
  ) {
    throw new Error(
      `Refusing to create in non-empty directory: ${directory}. Use --force to merge.`,
    );
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
      config: {
        ...config,
        workspace: {
          ...config.workspace,
          projectName: config.workspace.projectName,
        },
      },
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
      ? (JSON.parse(await readFile(rootPackagePath, 'utf8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          scripts?: Record<string, string>;
        })
      : ({
          name: config.workspace.projectName,
          private: true,
          type: 'module',
        } as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          scripts?: Record<string, string>;
        });
    const generatedPackage = JSON.parse(packageJson(context)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    rootPackage.dependencies = {
      ...rootPackage.dependencies,
      ...generatedPackage.dependencies,
    };
    rootPackage.devDependencies = {
      ...rootPackage.devDependencies,
      ...generatedPackage.devDependencies,
    };
    rootPackage.scripts = {
      ...rootPackage.scripts,
      ...Object.fromEntries(
        Object.entries(generatedPackage.scripts ?? {}).map(([name]) => [
          `${config.workspace.projectName}:${name}`,
          `npm --prefix ${relative(rootDir, directory)} run ${name.replace(/:/g, '\\:')}`,
        ]),
      ),
    };
    await writeFile(rootPackagePath, json(rootPackage), 'utf8');
    const nxJsonPath = join(rootDir, 'nx.json');
    if (!existsSync(nxJsonPath))
      await writeFile(nxJsonPath, json({ plugins: [] }), 'utf8');
    const rootReferenceFiles = referenceFiles(context);
    await Promise.all(
      Object.entries(rootReferenceFiles).map(async ([file, contents]) => {
        const target = join(rootDir, file);
        if (file === '.gitignore' && existsSync(target)) return;
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, contents, 'utf8');
      }),
    );
  }

  const gitRoot = config.workspace.kind === 'nx' ? rootDir : directory;
  ensureGitignore(gitRoot);

  if (config.references.craftTs || config.references.effectTs) {
    cloneReferenceIfRequested(
      config.workspace.kind === 'nx' ? rootDir : directory,
      config,
    );
  }

  // Reuse the same deterministic scaffold as migration, but with a standalone
  // project root. It also adds architecture/typecheck scripts to package.json.
  await runArchitectureMigration({
    rootDir: join(directory, 'src'),
    tsConfigFilePath: join(directory, 'tsconfig.app.json'),
    write: true,
  });
  initialiseGitRepository(gitRoot);

  return {
    directory,
    mode,
    frontendRuntime: config.frontendRuntime,
    backendRuntime: config.backendRuntime,
    config,
    agents,
    changedFiles: Object.keys(files).map((file) =>
      relative(directory, join(directory, file)),
    ),
  };
}

export function createModeFromFlag(
  value: string | undefined,
): CreateMode | undefined {
  if (!value) return undefined;
  if (value === 'v4' || value === 'effect' || value === 'true') return 'effect';
  if (value === 'none' || value === 'plain' || value === 'false')
    return 'plain';
  throw new Error(`Unknown --effect value "${value}". Use v4 or none.`);
}
