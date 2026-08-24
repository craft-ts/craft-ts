import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { checkCraftDeploymentArtifact } from './artifact.js';
import type {
  CraftDeploymentDiagnostic,
  CraftDeploymentSeverity,
} from './diagnostics.js';
import {
  CRAFT_DEPLOYMENT_PLATFORMS,
  CRAFT_DEPLOYMENT_RUNTIMES,
  type CraftDeploymentManifest,
} from './manifest.js';
import {
  findCraftDeploymentProvider,
  requiredCapability,
} from './providers.js';
import { resolveCraftDeploymentManifest } from './protocol.js';
import {
  collectEnvironmentReads,
  isNodeBuiltin,
  readCraftModuleGraph,
  type CraftModuleGraph,
} from './sources.js';
import { validateCraftDeploymentDefinition } from './validate.js';

export type CraftDeploymentCheckOptions = Readonly<{
  /** Directory the manifest paths are relative to. Defaults to `cwd`. */
  rootDir?: string;
  /** Raw manifest, typically the default export of `craft.deploy.ts`. */
  definition: unknown;
  /** Provider the deployment targets, checked against the capability matrix. */
  provider?: string;
  /** Asserts the manifest declares this runtime. */
  runtime?: string;
  /** Asserts the manifest declares this platform. */
  platform?: string;
  /** Also inspect the produced artefact, which requires a completed build. */
  artifact?: boolean;
}>;

export type CraftDeploymentCheckResult = Readonly<{
  passed: boolean;
  /** `null` when the manifest could not be resolved. */
  manifest: CraftDeploymentManifest | null;
  diagnostics: readonly CraftDeploymentDiagnostic[];
}>;

/**
 * Runs every deployment check that does not need a provider account.
 *
 * The order matters: nothing filesystem-related runs while the manifest itself
 * is unusable, so an author never reads a page of path errors caused by a
 * single missing field.
 */
export function checkCraftDeployment(
  options: CraftDeploymentCheckOptions,
): CraftDeploymentCheckResult {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const validation = validateCraftDeploymentDefinition(options.definition);
  const diagnostics: CraftDeploymentDiagnostic[] = [...validation.diagnostics];

  if (!validation.definition) {
    return { passed: false, manifest: null, diagnostics };
  }

  const manifest = resolveCraftDeploymentManifest(validation.definition);

  checkRequestedTarget(options, manifest, diagnostics);
  checkProvider(options.provider, manifest, diagnostics);
  checkDeclaredPaths(rootDir, manifest, options.artifact === true, diagnostics);
  checkModuleGraphs(rootDir, manifest, diagnostics);

  if (options.artifact === true) {
    diagnostics.push(...checkCraftDeploymentArtifact({ rootDir, manifest }));
  }

  return {
    passed: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    manifest,
    diagnostics,
  };
}

function checkRequestedTarget(
  options: CraftDeploymentCheckOptions,
  manifest: CraftDeploymentManifest,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  if (options.runtime !== undefined && options.runtime !== manifest.runtime) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_RUNTIME_MISMATCH',
      severity: 'error',
      path: 'runtime',
      runtime: manifest.runtime,
      message: `The check requested the \`${options.runtime}\` runtime and the manifest declares \`${manifest.runtime}\`.`,
      fix: CRAFT_DEPLOYMENT_RUNTIMES.includes(options.runtime as never)
        ? 'Drop `--runtime`, or change `runtime` in the manifest.'
        : `Use one of ${CRAFT_DEPLOYMENT_RUNTIMES.join(', ')}.`,
    });
  }
  if (
    options.platform !== undefined &&
    options.platform !== manifest.platform
  ) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PLATFORM_MISMATCH',
      severity: 'error',
      path: 'platform',
      platform: manifest.platform,
      message: `The check requested the \`${options.platform}\` platform and the manifest declares \`${manifest.platform}\`.`,
      fix: CRAFT_DEPLOYMENT_PLATFORMS.includes(options.platform as never)
        ? 'Drop `--platform`, or change `platform` in the manifest.'
        : `Use one of ${CRAFT_DEPLOYMENT_PLATFORMS.join(', ')}.`,
    });
  }
}

function checkProvider(
  provider: string | undefined,
  manifest: CraftDeploymentManifest,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  if (provider === undefined) return;

  const descriptor = findCraftDeploymentProvider(provider);
  if (!descriptor) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PROVIDER_UNKNOWN',
      severity: 'error',
      provider,
      message: `\`${provider}\` is not in the provider capability matrix.`,
      fix: 'Use a documented provider name, or register the provider before checking.',
    });
    return;
  }

  const capability = requiredCapability(
    manifest.runtime,
    manifest.runtime === 'static' ? manifest.static.mode : undefined,
  );
  if (!descriptor.capabilities.includes(capability)) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING',
      severity: 'error',
      provider,
      runtime: manifest.runtime,
      message: `\`${provider}\` does not declare the \`${capability}\` capability.`,
      fix: `Choose a provider declaring \`${capability}\`, or change the runtime or the static mode.`,
    });
  }
  if (!descriptor.platforms.includes(manifest.platform)) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED',
      severity: 'error',
      provider,
      platform: manifest.platform,
      message: `\`${provider}\` does not deploy to \`${manifest.platform}\`.`,
      fix: `Use one of ${descriptor.platforms.join(', ')}, or change the platform.`,
    });
  }
}

type DeclaredPath = Readonly<{
  path: string;
  value: string;
  /** Sources are committed, build outputs only exist after a build. */
  kind: 'source' | 'output';
}>;

function declaredPaths(
  manifest: CraftDeploymentManifest,
): readonly DeclaredPath[] {
  const paths: DeclaredPath[] = [];
  const runtimeSection =
    manifest.runtime === 'node'
      ? { key: 'server', section: manifest.server }
      : manifest.runtime === 'worker'
        ? { key: 'worker', section: manifest.worker }
        : manifest.runtime === 'lambda'
          ? { key: 'lambda', section: manifest.lambda }
          : null;

  if (runtimeSection) {
    paths.push({
      path: `${runtimeSection.key}.entry`,
      value: runtimeSection.section.entry,
      kind: 'output',
    });
    if (runtimeSection.section.source) {
      paths.push({
        path: `${runtimeSection.key}.source`,
        value: runtimeSection.section.source,
        kind: 'source',
      });
    }
  }
  if (manifest.functions) {
    paths.push({
      path: 'functions.entry',
      value: manifest.functions.entry,
      kind: 'source',
    });
  }
  if (manifest.client) {
    paths.push({
      path: 'client.outDir',
      value: manifest.client.outDir,
      kind: 'output',
    });
  }
  for (const [index, file] of manifest.artifact.configFiles.entries()) {
    paths.push({
      path: `artifact.configFiles[${index}]`,
      value: file,
      kind: 'source',
    });
  }
  return paths;
}

function checkDeclaredPaths(
  rootDir: string,
  manifest: CraftDeploymentManifest,
  artifactMode: boolean,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  for (const declared of declaredPaths(manifest)) {
    if (existsSync(resolve(rootDir, declared.value))) continue;
    // Before the build, a missing output is expected; it only becomes an
    // error once the check claims to inspect the artefact.
    const severity: CraftDeploymentSeverity =
      declared.kind === 'source' || artifactMode ? 'error' : 'warning';
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PATH_MISSING',
      severity,
      path: declared.path,
      file: declared.value,
      runtime: manifest.runtime,
      message: `\`${declared.value}\` does not exist.`,
      fix:
        declared.kind === 'output'
          ? 'Run the declared build command, or correct the path in the manifest.'
          : 'Correct the path in the manifest.',
    });
  }
}

function checkModuleGraphs(
  rootDir: string,
  manifest: CraftDeploymentManifest,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  const runtimeEntry = analysisEntry(manifest);
  if (runtimeEntry !== null) {
    const graph = readCraftModuleGraph(resolve(rootDir, runtimeEntry));
    if (graph.missingEntry === null) {
      if (manifest.runtime === 'worker' || manifest.runtime === 'lambda') {
        checkNodeBuiltins(rootDir, manifest, graph, diagnostics);
      }
      if (manifest.runtime === 'node') {
        checkHealthRoutes(manifest, graph, diagnostics);
      }
      checkEnvironment(manifest, graph, runtimeEntry, diagnostics);
    }
  }

  checkFunctionIds(rootDir, manifest, diagnostics);
}

/** Module the static analysis reads: the source when declared, else the build output. */
function analysisEntry(manifest: CraftDeploymentManifest): string | null {
  if (manifest.runtime === 'node') {
    return manifest.server.source ?? manifest.server.entry;
  }
  if (manifest.runtime === 'worker') {
    return manifest.worker.source ?? manifest.worker.entry;
  }
  if (manifest.runtime === 'lambda') {
    return manifest.lambda.source ?? manifest.lambda.entry;
  }
  return null;
}

function checkNodeBuiltins(
  rootDir: string,
  manifest: CraftDeploymentManifest,
  graph: CraftModuleGraph,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  for (const moduleImport of graph.imports) {
    if (!isNodeBuiltin(moduleImport.specifier)) continue;
    diagnostics.push({
      code: 'CRAFT_DEPLOY_NODE_BUILTIN_IMPORT',
      severity: 'error',
      file: relative(rootDir, moduleImport.file),
      line: moduleImport.line,
      runtime: manifest.runtime,
      platform: manifest.platform,
      message: `\`${moduleImport.specifier}\` is a Node built-in and the \`${manifest.runtime}\` runtime does not provide it.`,
      fix: 'Replace it with a Web API, or move the code behind an adapter this entry does not import.',
    });
  }
}

function checkHealthRoutes(
  manifest: CraftDeploymentManifest & { runtime: 'node' },
  graph: CraftModuleGraph,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  const routes = [
    {
      code: 'CRAFT_DEPLOY_HEALTH_PATH_MISSING',
      path: 'server.healthPath',
      value: manifest.server.healthPath,
    },
    {
      code: 'CRAFT_DEPLOY_READY_PATH_MISSING',
      path: 'server.readyPath',
      value: manifest.server.readyPath,
    },
  ] as const;

  for (const route of routes) {
    if (graph.source.includes(`'${route.value}'`)) continue;
    if (graph.source.includes(`"${route.value}"`)) continue;
    if (graph.source.includes(`\`${route.value}\``)) continue;
    diagnostics.push({
      code: route.code,
      severity: 'error',
      path: route.path,
      runtime: 'node',
      message: `The SSR entry never mentions \`${route.value}\`.`,
      fix: 'Serve the declared path, or align the manifest with the path the server exposes.',
    });
  }
}

function checkEnvironment(
  manifest: CraftDeploymentManifest,
  graph: CraftModuleGraph,
  entry: string,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  const declared = new Set(manifest.env.map((variable) => variable.name));
  for (const name of collectEnvironmentReads(graph.source)) {
    if (declared.has(name)) continue;
    diagnostics.push({
      code: 'CRAFT_DEPLOY_ENV_UNDECLARED',
      severity: 'warning',
      path: 'env',
      file: entry,
      runtime: manifest.runtime,
      message: `\`${name}\` is read by the runtime entry and is not declared in \`env\`.`,
      fix: `Add \`{ name: '${name}', required: … }\` to \`env\`, or stop reading it from the entry.`,
    });
  }
}

function checkFunctionIds(
  rootDir: string,
  manifest: CraftDeploymentManifest,
  diagnostics: CraftDeploymentDiagnostic[],
): void {
  const functions = manifest.functions;
  if (!functions || functions.ids.length === 0) return;

  const graph = readCraftModuleGraph(resolve(rootDir, functions.entry));
  if (graph.missingEntry !== null) return;

  for (const [index, id] of functions.ids.entries()) {
    if (graph.source.includes(id)) continue;
    diagnostics.push({
      code: 'CRAFT_DEPLOY_FUNCTION_ID_UNKNOWN',
      severity: 'warning',
      path: `functions.ids[${index}]`,
      file: functions.entry,
      runtime: manifest.runtime,
      message: `\`${id}\` does not appear in the module graph of \`${functions.entry}\`.`,
      fix: 'Register the function in the entry, or remove the identifier from the manifest.',
    });
  }
}
