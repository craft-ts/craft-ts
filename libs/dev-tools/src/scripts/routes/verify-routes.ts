import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Project, ScriptTarget, ts } from 'ts-morph';
import {
  defineAngularBrandConfig,
  transformSourceFile,
} from '../angular-brand-codemod.js';
import { listAngularProjects } from './route-command.js';

const execFileAsync = promisify(execFile);

export type RouteVerificationOptions = {
  rootDir?: string;
  project?: string;
  tsConfigFilePath?: string;
  json?: boolean;
  keepFixtures?: boolean;
  log?: (message: string) => void;
};

export type RouteVerificationCaseResult = {
  id: string;
  category: string;
  status: 'passed' | 'failed';
  expected: string[];
  matched: string[];
  output?: string;
};

export type RouteVerificationResult = {
  exitCode: number;
  project: string;
  tsConfigFilePath: string;
  sourceRoot: string;
  fixtureDirectory?: string;
  baseline: { status: 'passed' | 'failed'; output?: string };
  eslint: {
    status: 'passed' | 'failed' | 'skipped';
    output?: string;
  };
  cases: RouteVerificationCaseResult[];
  diagnostics: string[];
};

export type RouteVerificationFixture = {
  id: string;
  category: string;
  fileName: string;
  source: string;
  expected: string[];
  kind: 'positive' | 'negative';
};

type ProjectContext = {
  rootDir: string;
  project: string;
  tsConfigFilePath: string;
  sourceRoot: string;
};

const serviceName = 'VerifyMissingService';
const routeContext = 'path: "missing-provider"';

/**
 * Runs a compile-time smoke suite against the real application tsconfig.
 *
 * The suite deliberately contains both valid and invalid route definitions. A
 * valid batch must type-check cleanly; an invalid batch must fail with the
 * expected route/pending/exception context. All files are removed in finally.
 */
export async function runRouteVerification(
  options: RouteVerificationOptions = {},
): Promise<RouteVerificationResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const context = resolveProjectContext(rootDir, options);
  const log = options.log ?? (options.json ? () => undefined : console.log);
  const diagnostics: string[] = [];
  const compiler = findLocalBinary(rootDir, 'ngc') ?? findLocalBinary(rootDir, 'tsc');

  if (!compiler) {
    return failedResult(
      context,
      'No local ngc or tsc binary was found. Install the project dependencies before running route verification.',
    );
  }

  log(`[route verify] Project: ${context.tsConfigFilePath}`);
  log('[route verify] 1/5 Checking the existing project...');
  const baselineOutput = await runTypeCheck(compiler, context, log, 'baseline');
  const baseline = {
    status: baselineOutput.ok ? ('passed' as const) : ('failed' as const),
    ...(baselineOutput.output ? { output: baselineOutput.output } : {}),
  };
  if (!baselineOutput.ok) {
    log('[route verify] Baseline failed; fixtures were not created.');
    return {
      exitCode: 1,
      ...context,
      baseline,
      eslint: { status: 'skipped' },
      cases: [],
      diagnostics: [
        'The project already has type-check errors. Fix the baseline before running route verification.',
      ],
    };
  }

  let fixtureDirectory: string | undefined;
  let eslint: RouteVerificationResult['eslint'] = { status: 'skipped' };
  const cases: RouteVerificationCaseResult[] = [];

  try {
    log('[route verify] 2/5 Generating temporary fixtures...');
    fixtureDirectory = await mkdtemp(join(context.sourceRoot, 'craft-route-verify-'));
    const fixtures = createRouteVerificationFixtures();
    const positive = fixtures.filter((fixture) => fixture.kind === 'positive');
    const negative = fixtures.filter((fixture) => fixture.kind === 'negative');

    await writeFixtures(fixtureDirectory, positive);
    await prepareAngularBrandFixture(fixtureDirectory);

    log(`[route verify] 3/5 Running ESLint on ${positive.length} positive fixtures...`);
    eslint = await runFixtureLint(rootDir, context.sourceRoot, fixtureDirectory, log);
    if (eslint.status === 'failed') {
      diagnostics.push('The temporary route fixtures failed the ESLint bookkeeping pass.');
    }

    log('[route verify] 4/5 Compiling valid fixtures...');
    const positiveCheck = await runTypeCheck(compiler, context, log, 'valid fixtures');
    for (const fixture of positive) {
      cases.push({
        id: fixture.id,
        category: fixture.category,
        status: positiveCheck.ok ? 'passed' : 'failed',
        expected: [],
        matched: positiveCheck.ok ? [] : [],
        ...(positiveCheck.output ? { output: positiveCheck.output } : {}),
      });
    }

    if (!positiveCheck.ok) {
      diagnostics.push('Valid route verification fixtures do not compile.');
    }

    log('[route verify] 5/5 Compiling invalid fixtures and matching expected diagnostics...');
    log('[route verify] The compiler errors printed in this phase are intentional.');
    await writeFixtures(fixtureDirectory, negative);
    const negativeCheck = await runTypeCheck(compiler, context, log, 'invalid fixtures');
    const output = negativeCheck.output;
    for (const fixture of negative) {
      const matched = matchRouteVerificationDiagnostics(output, fixture.expected);
      const passed = !negativeCheck.ok && matched.length === fixture.expected.length;
      cases.push({
        id: fixture.id,
        category: fixture.category,
        status: passed ? 'passed' : 'failed',
        expected: fixture.expected,
        matched,
        ...(output ? { output } : {}),
      });
      if (!passed) {
        diagnostics.push(
          `${fixture.id}: expected ${fixture.expected.join(' / ')} in the compiler diagnostics.`,
        );
      }
    }

    const failedCases = cases.filter((item) => item.status === 'failed');
    const result: RouteVerificationResult = {
      exitCode: diagnostics.length === 0 ? 0 : 1,
      ...context,
      fixtureDirectory: options.keepFixtures ? fixtureDirectory : undefined,
      baseline,
      eslint,
      cases,
      diagnostics,
    };
    if (result.exitCode === 0) {
      log(`[route verify] Passed (${cases.length} fixture(s)).`);
    } else {
      log(
        `[route verify] Failed (${failedCases.length} fixture(s), ${diagnostics.length} diagnostic(s)).`,
      );
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(message);
    return {
      exitCode: 1,
      ...context,
      fixtureDirectory: options.keepFixtures ? fixtureDirectory : undefined,
      baseline,
      eslint,
      cases,
      diagnostics,
    };
  } finally {
    if (fixtureDirectory && !options.keepFixtures) {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  }
}

export function matchRouteVerificationDiagnostics(
  output: string,
  expected: readonly string[],
): string[] {
  const normalizedOutput = output.replace(/\\"/g, '"');
  return expected.filter((value) => normalizedOutput.includes(value));
}

function resolveProjectContext(
  rootDir: string,
  options: RouteVerificationOptions,
): ProjectContext {
  const tsConfigFilePath = resolveTsConfig(
    rootDir,
    options.tsConfigFilePath ?? options.project,
  );
  const project = options.project ?? relative(rootDir, dirname(tsConfigFilePath));
  const projectRoot = dirname(tsConfigFilePath);
  const sourceRoot = basename(tsConfigFilePath) === 'tsconfig.app.json'
    ? existsSync(join(projectRoot, 'src'))
      ? join(projectRoot, 'src')
      : projectRoot
    : rootDir;
  return {
    rootDir,
    project: project || '.',
    tsConfigFilePath,
    sourceRoot,
  };
}

function resolveTsConfig(rootDir: string, projectOption?: string): string {
  if (projectOption) {
    const direct = resolve(rootDir, projectOption);
    if (existsSync(direct) && direct.endsWith('.json')) return direct;
    for (const candidate of [
      join(direct, 'tsconfig.app.json'),
      join(rootDir, 'apps', projectOption, 'tsconfig.app.json'),
      join(rootDir, 'projects', projectOption, 'tsconfig.app.json'),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }

  const detected = listAngularProjects(rootDir)
    .map((project) => join(rootDir, project, 'tsconfig.app.json'))
    .filter((candidate) => existsSync(candidate));
  if (detected.length === 1) return detected[0];
  for (const candidate of [
    join(rootDir, 'tsconfig.app.json'),
    join(rootDir, 'tsconfig.json'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return join(rootDir, 'tsconfig.json');
}

async function writeFixtures(
  directory: string,
  fixtures: readonly RouteVerificationFixture[],
) {
  await Promise.all(
    fixtures.map(async (fixture) => {
      const target = join(directory, fixture.fileName);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, fixture.source.trimStart(), 'utf8');
    }),
  );
}

/** Generate the Angular GenDeps alias using the same codemod as the project. */
async function prepareAngularBrandFixture(directory: string): Promise<void> {
  const componentPath = join(directory, 'template-missing.component.ts');
  if (!existsSync(componentPath)) return;
  const project = new Project({
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ScriptTarget.ES2022,
    },
  });
  const sourceFile = project.createSourceFile(
    componentPath,
    await readFile(componentPath, 'utf8'),
    { overwrite: true },
  );
  transformSourceFile(sourceFile, {
    config: defineAngularBrandConfig({
      importAugmentations: [
        {
          match: {
            module: './template-pipe',
            symbols: ['VerifyTemplatePipe'],
            metadata: ['imports'],
          },
          deps: [
            {
              key: serviceName,
              symbol: serviceName,
              module: './support',
              typeText: `typeof ${serviceName}`,
            },
          ],
          missingProvider: [
            {
              key: serviceName,
              symbol: serviceName,
              module: './support',
              typeText: `typeof ${serviceName}`,
            },
          ],
        },
      ],
    }),
  });
  const supportImport = sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === './support');
  if (supportImport) {
    const hasServiceImport = supportImport
      .getNamedImports()
      .some((namedImport) => namedImport.getName() === serviceName);
    if (!hasServiceImport) supportImport.addNamedImports([{ name: serviceName }]);
  } else {
    sourceFile.addImportDeclaration({
      moduleSpecifier: './support',
      namedImports: [{ name: serviceName }],
    });
  }
  sourceFile.insertText(0, '/* eslint-disable @typescript-eslint/no-empty-object-type */\n');
  await writeFile(componentPath, sourceFile.getFullText(), 'utf8');
}

async function runFixtureLint(
  rootDir: string,
  sourceRoot: string,
  directory: string,
  log: (message: string) => void,
): Promise<RouteVerificationResult['eslint']> {
  const eslint = findLocalBinary(rootDir, 'eslint');
  if (!eslint) {
    log('[route verify] ESLint not found; bookkeeping pass skipped.');
    return { status: 'skipped' };
  }
  const files = await listFiles(
    directory,
    (file) => file.endsWith('.routes.ts') || file.endsWith('.component.ts'),
  );
  if (files.length === 0) return { status: 'skipped' };
  try {
    const { stdout, stderr } = await execFileAsync(
      eslint,
      ['--fix', '--format', 'json', ...files],
      { cwd: sourceRoot, maxBuffer: 20 * 1024 * 1024 },
    );
    log('[route verify] ESLint bookkeeping passed.');
    return {
      status: 'passed',
      output: `${stdout}${stderr}`.trim() || undefined,
    };
  } catch (error) {
    log('[route verify] ESLint bookkeeping reported errors.');
    for (const line of commandOutput(error).split(/\r?\n/)) {
      if (line.trim()) log(`[route verify] eslint: ${line}`);
    }
    return {
      status: 'failed',
      output: commandOutput(error),
    };
  }
}

async function runTypeCheck(
  compiler: string,
  context: ProjectContext,
  log: (message: string) => void,
  label: string,
): Promise<{ ok: boolean; output: string }> {
  const args = [
    '--project',
    context.tsConfigFilePath,
    '--noEmit',
    '--pretty',
    'false',
  ];
  return await new Promise((resolveResult) => {
    const child = spawn(compiler, args, { cwd: context.rootDir });
    let stdout = '';
    let stderr = '';
    let pendingLine = '';

    const stream = (chunk: Buffer, target: 'stdout' | 'stderr') => {
      const text = chunk.toString();
      if (target === 'stdout') stdout += text;
      else stderr += text;
      pendingLine += text;
      const lines = pendingLine.split(/\r?\n/);
      pendingLine = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) log(`[route verify] ${label}: ${line}`);
      }
    };

    child.stdout.on('data', (chunk: Buffer) => stream(chunk, 'stdout'));
    child.stderr.on('data', (chunk: Buffer) => stream(chunk, 'stderr'));
    child.on('error', (error) => {
      resolveResult({ ok: false, output: [stdout, stderr, error.message].filter(Boolean).join('\n') });
    });
    child.on('close', (code) => {
      if (pendingLine.trim()) log(`[route verify] ${label}: ${pendingLine}`);
      const output = [stdout, stderr].filter(Boolean).join('\n');
      log(`[route verify] ${label}: ${code === 0 ? 'passed' : `failed (exit ${code ?? 1})`}`);
      resolveResult({ ok: code === 0, output });
    });
  });
}

async function listFiles(
  directory: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFiles(filePath, predicate)));
    } else if (entry.isFile() && predicate(filePath)) {
      result.push(filePath);
    }
  }
  return result;
}

function findLocalBinary(rootDir: string, name: string): string | undefined {
  let current = rootDir;
  while (true) {
    const candidate = join(current, 'node_modules', '.bin', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function commandOutput(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const record = value as { stdout?: unknown; stderr?: unknown; message?: unknown };
    return [record.stdout, record.stderr, record.message]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join('\n');
  }
  return String(value);
}

function failedResult(
  context: ProjectContext,
  message: string,
): RouteVerificationResult {
  return {
    exitCode: 1,
    ...context,
    baseline: { status: 'failed' },
    eslint: { status: 'skipped' },
    cases: [],
    diagnostics: [message],
  };
}

export function createRouteVerificationFixtures(): RouteVerificationFixture[] {
  const support = `
import { craftService, type GetDeps, type GetServiceDependencies } from '@craft-ng/core';

export const { VerifyMissingService, provideVerifyMissingService } = craftService(
  { name: '${serviceName}', scope: 'toProvide' },
  () => ({ value: 1 }),
);

export class VerifyComponent {}
export class VerifyPendingComponent {}
export class VerifyErrorComponent {}

export type MissingDeps = GetDeps<{
  deps: { ${serviceName}: GetServiceDependencies<typeof VerifyMissingService> };
  provided: {};
  missingProvider: { ${serviceName}: GetServiceDependencies<typeof VerifyMissingService> };
  publicProperties: {};
}>;

export type ProvidedDeps = GetDeps<{
  deps: {};
  provided: { ${serviceName}: ReturnType<typeof provideVerifyMissingService> };
  publicProperties: {};
}>;

export type InputDeps = GetDeps<{
  deps: {};
  provided: {};
  publicProperties: { verifyId: () => string };
}>;
`;

  const validRoutes = `
import type { Router } from '@angular/router';
import {
  assertExhaustiveRouteExceptions,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftRoute,
  craftRoutes,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import { ProvidedDeps } from './support';

const verifyFailure = craftGen(function* () {
  return craftException({ code: 'VERIFY_FAILURE' });
});

export const { validRoutes } = craftRoutes('valid', [
  craftRoute('app-provider', {
    loadComponent: ({ withRetry }: import('@craft-ng/core').CraftRouteLazyLoadHelpers) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as import('./support').MissingDeps,
  }),
  craftRoute('exceptions', {
    loadComponent: ({ withRetry }: import('@craft-ng/core').CraftRouteLazyLoadHelpers) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as ProvidedDeps,
    canMatch: function* () { return yield* verifyFailure(); },
    canActivate: function* () { return yield* verifyFailure(); },
    resolve: function* () { return yield* verifyFailure(); },
  }, { VERIFY_FAILURE: craftExceptionHandler(function* ({ noop }) { return noop(); }) }),
]);

assertExhaustiveRouteExceptions(validRoutes);
type _CheckValidDI = ValidateCascadeRoutesFile<'${serviceName}', Router, typeof validRoutes>;
type _CanRunValid = CanRun<_CheckValidDI>;
`;

  const lazyParent = `
import type { Router } from '@angular/router';
import { craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';

export const { lazyParentRoutes } = craftRoutes('lazyParent', [
  {
    path: 'lazy',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./lazy-child.routes')).then((module) => module.lazyChildRoutes),
  },
]);

type _CheckLazyParentDI = ValidateCascadeRoutesFile<never, Router, typeof lazyParentRoutes>;
type _CanRunLazyParent = CanRun<_CheckLazyParentDI>;
`;

  const routeProvider = `
import type { Router } from '@angular/router';
import { craftRoute, craftRoutes, type CanRun, type RouteCheckedDI } from '@craft-ng/core';
import { MissingDeps, provideVerifyMissingService } from './support';

export const { routeProviderRoutes } = craftRoutes('routeProvider', [
  craftRoute('provided', {
    loadComponent: ({ withRetry }: import('@craft-ng/core').CraftRouteLazyLoadHelpers) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as MissingDeps,
    providers: [provideVerifyMissingService()],
  }),
]);

type _CheckRouteProviderDI = RouteCheckedDI<
  MissingDeps,
  'VerifyMissingService',
  Router,
  'path: "provided"'
>;
type _CanRunRouteProvider = CanRun<_CheckRouteProviderDI>;
`;

  const lazyChild = `
import type { Router } from '@angular/router';
import { craftRoute, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
import { ProvidedDeps } from './support';

export const { lazyChildRoutes } = craftRoutes('lazyChild', [
  craftRoute('page', {
    loadComponent: ({ withRetry }) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as ProvidedDeps,
  }),
]);

type _CheckLazyChildDI = ValidateCascadeRoutesFile<never, Router, typeof lazyChildRoutes>;
type _CanRunLazyChild = CanRun<_CheckLazyChildDI>;
`;

  const pending = `
import type { Router } from '@angular/router';
import { craftRoute, craftRoutes, type CanRun, type RouteCheckedDI, type ValidateCascadeRoutesFile } from '@craft-ng/core';
import { ProvidedDeps } from './support';

export const { pendingRoutes } = craftRoutes('pending', [
  craftRoute('page', {
    loadComponent: ({ withRetry }) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as ProvidedDeps,
    pendingComponent: () => import('./pending-component'),
  }),
]);

type _CheckPendingDI = ValidateCascadeRoutesFile<never, Router, typeof pendingRoutes>;
type _CanRunPending = CanRun<_CheckPendingDI>;
type _CheckPendingComponentDI = RouteCheckedDI<
  import('./pending-component').GenDeps_VerifyPendingComponent,
  never,
  Router,
  'pending component: page'
>;
type _CanRunPendingComponent = CanRun<_CheckPendingComponentDI>;
`;

  const exceptionComponents = `
import type { Router } from '@angular/router';
import {
  RouteExceptionComponentCheckedDI,
  craftExceptionHandler,
  craftRoute,
  craftRoutes,
  withErrorComponent,
  withRouteLoadError,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import { ProvidedDeps, VerifyErrorComponent } from './support';

export const { exceptionRoutes } = craftRoutes('exception', [
  craftRoute('page', {
    loadComponent: ({ withRetry }) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as ProvidedDeps,
    errorComponent: {
      component: VerifyErrorComponent,
      componentDeps: {} as ProvidedDeps,
    },
  }),
]);

const globalError = withErrorComponent({
  component: VerifyErrorComponent,
  componentDeps: {} as ProvidedDeps,
});
const routeLoadError = withRouteLoadError({
  component: VerifyErrorComponent,
  componentDeps: {} as ProvidedDeps,
});
const renderedError = craftExceptionHandler(function* ({ renderComponent }) {
  return renderComponent({
    loadComponent: () => import('./support').then(({ VerifyErrorComponent }) => VerifyErrorComponent),
    componentDeps: {} as ProvidedDeps,
  });
});
void globalError;
void routeLoadError;
void renderedError;

type _CheckExceptionDI = ValidateCascadeRoutesFile<never, Router, typeof exceptionRoutes>;
type _CanRunException = CanRun<_CheckExceptionDI>;
type _CheckRouteErrorDI = RouteExceptionComponentCheckedDI<
  ProvidedDeps,
  'CraftGlobalError',
  Router,
  'error component: page'
>;
type _CanRunRouteError = CanRun<_CheckRouteErrorDI>;
`;

const templatePipe = `
import { Pipe } from '@angular/core';
import type { GetDeps } from '@craft-ng/core';

@Pipe({ name: 'verifyTemplate', standalone: true })
export class VerifyTemplatePipe {
  transform(value: string): string {
    return value;
  }
}

export type GenDeps_VerifyTemplatePipe = GetDeps<{
  deps: {};
  provided: {};
  publicProperties: {};
}>;
`;

const templateComponent = `
/* eslint-disable @typescript-eslint/no-empty-object-type */
import { Component } from '@angular/core';
import { VerifyTemplatePipe } from './template-pipe';
import { VerifyMissingService } from './support';

@Component({
  standalone: true,
  imports: [VerifyTemplatePipe],
  template: '{{ value | verifyTemplate }}',
})
export class TemplateMissingComponent {
  readonly value = 'verify';
}
`;

const templateRoutes = `
import type { Router } from '@angular/router';
import { craftRoute, craftRoutes, type CanRun, type RouteCheckedDI } from '@craft-ng/core';

export const { templateRoutes } = craftRoutes('template', [
  craftRoute('missing-template-provider', {
    loadComponent: ({ withRetry }) => withRetry(import('./template-missing.component')).then(({ TemplateMissingComponent }) => TemplateMissingComponent),
    componentDeps: {} as import('./template-missing.component').GenDeps_TemplateMissingComponent,
  }),
]);

type _CheckTemplateDI = RouteCheckedDI<
  import('./template-missing.component').GenDeps_TemplateMissingComponent,
  never,
  Router,
  'path: "missing-template-provider"'
>;
type _CanRunTemplate = CanRun<_CheckTemplateDI>;
`;

  const missingProvider = `
import type { Router } from '@angular/router';
import { craftRoute, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
import { MissingDeps } from './support';

export const { missingProviderRoutes } = craftRoutes('missingProvider', [
  craftRoute('missing-provider', {
    loadComponent: ({ withRetry }) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as MissingDeps,
  }),
]);

type _CheckMissingProviderDI = ValidateCascadeRoutesFile<never, Router, typeof missingProviderRoutes>;
type _CanRunMissingProvider = CanRun<_CheckMissingProviderDI>;
`;

  const missingInput = `
import type { Router } from '@angular/router';
import { craftRoute, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
import { InputDeps } from './support';

export const { missingInputRoutes } = craftRoutes('missingInput', [
  craftRoute('missing-input', {
    loadComponent: ({ withRetry }) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as InputDeps,
  }),
]);

type _CheckMissingInputDI = ValidateCascadeRoutesFile<never, Router, typeof missingInputRoutes>;
type _CanRunMissingInput = CanRun<_CheckMissingInputDI>;
`;

  const pendingMissing = `
import type { Router } from '@angular/router';
import { craftRoute, craftRoutes, type CanRun, type RouteCheckedDI, type ValidateCascadeRoutesFile } from '@craft-ng/core';
import { ProvidedDeps } from './support';

export const { pendingMissingRoutes } = craftRoutes('pendingMissing', [
  craftRoute('pending-missing', {
    loadComponent: ({ withRetry }) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as ProvidedDeps,
    pendingComponent: () => import('./pending-missing-component'),
  }),
]);

type _CheckPendingMissingDI = ValidateCascadeRoutesFile<never, Router, typeof pendingMissingRoutes>;
type _CanRunPendingMissing = CanRun<_CheckPendingMissingDI>;
type _CheckPendingMissingComponentDI = RouteCheckedDI<
  import('./pending-missing-component').GenDeps_VerifyPendingMissingComponent,
  never,
  Router,
  'pending component: pending-missing'
>;
type _CanRunPendingMissingComponent = CanRun<_CheckPendingMissingComponentDI>;
`;

  const exceptionMissing = `
import type { Router } from '@angular/router';
import { RouteExceptionComponentCheckedDI, type CanRun } from '@craft-ng/core';
import { MissingDeps } from './support';

type _CheckExceptionComponentDI = RouteExceptionComponentCheckedDI<
  MissingDeps,
  never,
  Router,
  'exception component: missing-render'
>;
type _CanRunExceptionComponent = CanRun<_CheckExceptionComponentDI>;
`;

  const exceptionMissingRoutes = `
import type { Router } from '@angular/router';
import { assertExhaustiveRouteExceptions, craftException, craftGen, craftRoute, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
import { ProvidedDeps } from './support';

const verifyFailure = craftGen(function* () {
  return craftException({ code: 'VERIFY_UNHANDLED' });
});

export const { exceptionMissingRoutes } = craftRoutes('exceptionMissing', [
  craftRoute('missing-handler', {
    loadComponent: ({ withRetry }) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as ProvidedDeps,
    canActivate: function* () {
      return yield* verifyFailure();
    },
  }),
]);

assertExhaustiveRouteExceptions(exceptionMissingRoutes);
type _CheckExceptionMissingDI = ValidateCascadeRoutesFile<never, Router, typeof exceptionMissingRoutes>;
type _CanRunExceptionMissing = CanRun<_CheckExceptionMissingDI>;
`;

const exceptionExtraRoutes = `
import type { Router } from '@angular/router';
import { assertExhaustiveRouteExceptions, craftException, craftExceptionHandler, craftGen, craftRoute, craftRoutes, type CanRun, type ValidateCascadeRoutesFile } from '@craft-ng/core';
import { ProvidedDeps } from './support';

const verifyFailure = craftGen(function* () {
  return craftException({ code: 'VERIFY_HANDLED' });
});

export const { exceptionExtraRoutes } = craftRoutes('exceptionExtra', [
  craftRoute('extra-handler', {
    loadComponent: ({ withRetry }: import('@craft-ng/core').CraftRouteLazyLoadHelpers) => withRetry(import('./support')).then(({ VerifyComponent }) => VerifyComponent),
    componentDeps: {} as ProvidedDeps,
    canActivate: function* () {
      return yield* verifyFailure();
    },
  }, {
    VERIFY_HANDLED: craftExceptionHandler(function* ({ noop }) {
      return noop();
    }),
    VERIFY_EXTRA: craftExceptionHandler(function* ({ noop }) {
      return noop();
    }),
  }),
]);

assertExhaustiveRouteExceptions(exceptionExtraRoutes);
type _CheckExceptionExtraDI = ValidateCascadeRoutesFile<never, Router, typeof exceptionExtraRoutes>;
type _CanRunExceptionExtra = CanRun<_CheckExceptionExtraDI>;
`;

  const pendingComponent = `
import { GetDeps, GetServiceDependencies } from '@craft-ng/core';

export default class VerifyPendingComponent {}
export type GenDeps_VerifyPendingComponent = GetDeps<{
  deps: {};
  provided: {};
  publicProperties: {};
}>;
`;

const pendingMissingComponent = `
import type { GetDeps, GetServiceDependencies } from '@craft-ng/core';

export default class VerifyPendingMissingComponent {}
export type GenDeps_VerifyPendingMissingComponent = GetDeps<{
  deps: { ${serviceName}: GetServiceDependencies<typeof import('./support').VerifyMissingService> };
  provided: {};
  missingProvider: { ${serviceName}: GetServiceDependencies<typeof import('./support').VerifyMissingService> };
  publicProperties: {};
}>;
`;

  return [
    fixture('support', 'support.ts', support, [], 'positive'),
    fixture('valid-routes', 'valid.routes.ts', validRoutes, [], 'positive'),
    fixture('route-provider', 'route-provider.routes.ts', routeProvider, [], 'positive'),
    fixture('lazy-parent', 'lazy-parent.routes.ts', lazyParent, [], 'positive'),
    fixture('lazy-child', 'lazy-child.routes.ts', lazyChild, [], 'positive'),
    fixture('pending', 'pending.routes.ts', pending, [], 'positive'),
    fixture('exception-components', 'exception-components.routes.ts', exceptionComponents, [], 'positive'),
    fixture('template-pipe', 'template-pipe.ts', templatePipe, [], 'positive'),
    fixture('template-component', 'template-missing.component.ts', templateComponent, [], 'positive'),
    fixture('template-routes', 'template.routes.ts', templateRoutes, [`The ${serviceName} service is not provided in path: "missing-template-provider"`], 'negative', true),
    fixture('missing-provider', 'missing-provider.routes.ts', missingProvider, [`The ${serviceName} service is not provided in ${routeContext}`], 'negative'),
    fixture('missing-input', 'missing-input.routes.ts', missingInput, ['Input "verifyId" is not provided in path: "missing-input"'], 'negative'),
    fixture('pending-missing', 'pending-missing.routes.ts', pendingMissing, [`The ${serviceName} service is not provided in pending component: pending-missing`], 'negative'),
    fixture('exception-component-missing', 'exception-component-missing.routes.ts', exceptionMissing, [`The ${serviceName} service is not provided in exception component: missing-render`], 'negative'),
    fixture('exception-missing-handler', 'exception-missing-handler.routes.ts', exceptionMissingRoutes, ['VERIFY_UNHANDLED', 'missingHandlers'], 'negative'),
    fixture('exception-extra-handler', 'exception-extra-handler.routes.ts', exceptionExtraRoutes, ['VERIFY_EXTRA', 'ERROR_unhandled_or_extra_route_exceptions'], 'negative'),
    fixture('pending-component', 'pending-component.ts', pendingComponent, [], 'positive'),
    fixture('pending-missing-component', 'pending-missing-component.ts', pendingMissingComponent, [], 'positive'),
  ];
}

function fixture(
  id: string,
  fileName: string,
  source: string,
  expected: string[],
  kind: 'positive' | 'negative',
  template = false,
): RouteVerificationFixture {
  return {
    id,
    category: template ? 'template' : id.includes('exception') ? 'exceptions' : 'routing',
    fileName,
    source,
    expected,
    kind,
  };
}
