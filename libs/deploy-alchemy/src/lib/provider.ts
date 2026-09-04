import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  findCraftDeploymentProvider,
  type CraftDeploymentDiagnostic,
  type CraftDeploymentPlan,
  type CraftDeploymentProvider,
  type CraftDeploymentRequest,
  type CraftDeploymentResult,
} from '@craft-ts/deploy';
import {
  checkAlchemyCredentials,
  type AlchemyEnvironment,
} from './credentials.js';
import { planAlchemyDeployment } from './plan.js';
import { loadAlchemyRuntime } from './alchemy-runtime.js';
import type {
  AlchemyRuntime,
  AlchemyRuntimeLoader,
  AlchemyScope,
} from './runtime.js';

export type AlchemyProviderOptions = Readonly<{
  /**
   * Resolves the Alchemy runtime. Defaults to importing the optional peer
   * dependency; tests and dry runs replace it.
   */
  runtime?: AlchemyRuntimeLoader;
  /** Environment the credentials are read from. Defaults to `process.env`. */
  environment?: AlchemyEnvironment;
}>;

const PROVIDER_NAME = 'alchemy';

/**
 * The Alchemy provider.
 *
 * It consumes the manifest CraftTS produced and never rebuilds routes,
 * contracts or layers. Everything platform-specific lives in a preset, and
 * every mutation goes through the runtime port, so `preview` provably touches
 * nothing.
 */
export function createAlchemyDeploymentProvider(
  options: AlchemyProviderOptions = {},
): CraftDeploymentProvider {
  const loadRuntime = options.runtime ?? loadAlchemyRuntime;
  const environment = options.environment ?? process.env;

  return {
    name: PROVIDER_NAME,
    capabilities:
      findCraftDeploymentProvider(PROVIDER_NAME)?.capabilities ?? [],

    async check(request) {
      const diagnostics: CraftDeploymentDiagnostic[] = [
        ...checkAlchemyCredentials(request.manifest.platform, environment),
        ...planAlchemyDeployment({ request, existing: [] }).diagnostics,
        ...missingArtifacts(request),
      ];

      try {
        await loadRuntime();
      } catch (error) {
        diagnostics.push({
          code: 'CRAFT_DEPLOY_PROVIDER_TOOLCHAIN_MISSING',
          severity: 'error',
          provider: PROVIDER_NAME,
          platform: request.manifest.platform,
          message: `Alchemy could not be loaded: ${messageOf(error)}`,
          fix: 'Install `alchemy` in the project, or deploy with a provider that needs no infrastructure engine.',
        });
      }

      return diagnostics;
    },

    async preview(request) {
      const runtime = await loadRuntime();
      const scope = await runtime.open({
        app: request.manifest.name,
        stage: request.stage,
        // The read phase is what makes a preview safe: Alchemy resolves the
        // recorded state and creates nothing.
        phase: 'read',
        rootDir: request.rootDir,
      });
      try {
        const { plan, diagnostics } = planAlchemyDeployment({
          request,
          existing: await scope.read(),
        });
        return withRuntimeNote(plan, runtime, diagnostics);
      } finally {
        await scope.dispose();
      }
    },

    async deploy(request) {
      const runtime = await loadRuntime();
      const scope = await runtime.open({
        app: request.manifest.name,
        stage: request.stage,
        phase: 'up',
        rootDir: request.rootDir,
      });
      try {
        return await applyPlan(request, scope);
      } catch (error) {
        await scope.dispose();
        throw error;
      }
    },
  };
}

async function applyPlan(
  request: CraftDeploymentRequest,
  scope: AlchemyScope,
): Promise<CraftDeploymentResult> {
  const { resources, diagnostics } = planAlchemyDeployment({
    request,
    existing: await scope.read(),
  });

  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (errors.length > 0) {
    throw new Error(
      `Alchemy refuses to deploy: ${errors.map((error) => `${error.code} ${error.message}`).join(' ')}`,
    );
  }

  const applied: import('./runtime.js').AlchemyResourceState[] = [];

  for (const resource of resources) {
    const state = await scope.apply(resource);
    applied.push(state);
  }

  // Finalizing is what deletes the resources the manifest no longer declares,
  // so it happens once every declared resource exists.
  await scope.finalize();
  const finalized = await scope.read();
  const states = finalized.length > 0 ? finalized : applied;
  const outputs = Object.fromEntries(
    states.flatMap((state) =>
      Object.entries(state.outputs).map(([key, value]) => [
        `${state.name}.${key}`,
        value,
      ]),
    ),
  );
  const url = states.find((state) => state.outputs['url'])?.outputs['url'];

  return {
    provider: 'alchemy',
    stage: request.stage,
    ...(url ? { url } : {}),
    outputs,
  };
}

function withRuntimeNote(
  plan: CraftDeploymentPlan,
  runtime: AlchemyRuntime,
  diagnostics: readonly CraftDeploymentDiagnostic[],
): CraftDeploymentPlan {
  return {
    ...plan,
    notes: [
      `Alchemy ${runtime.version}, stage \`${plan.stage}\`.`,
      ...plan.notes,
      ...diagnostics.map(
        (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`,
      ),
    ],
  };
}

/** Artefacts the plan would upload and that the build has not produced. */
function missingArtifacts(
  request: CraftDeploymentRequest,
): readonly CraftDeploymentDiagnostic[] {
  const manifest = request.manifest;
  const candidates = [
    manifest.artifact.publicDir
      ? { path: 'artifact.publicDir', value: manifest.artifact.publicDir }
      : null,
    manifest.artifact.serverEntry
      ? { path: 'artifact.serverEntry', value: manifest.artifact.serverEntry }
      : null,
  ].filter((candidate): candidate is { path: string; value: string } =>
    Boolean(candidate),
  );

  return candidates
    .filter(
      (candidate) => !existsSync(resolve(request.rootDir, candidate.value)),
    )
    .map((candidate) => ({
      code: 'CRAFT_DEPLOY_ARTIFACT_MISSING',
      severity: 'error',
      provider: PROVIDER_NAME,
      runtime: manifest.runtime,
      path: candidate.path,
      file: candidate.value,
      message: `Alchemy would upload \`${candidate.value}\`, which does not exist.`,
      fix: 'Run the declared build command before deploying.',
    }));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
