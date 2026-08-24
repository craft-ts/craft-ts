import type { CraftDeploymentDiagnostic } from './diagnostics.js';
import {
  CRAFT_DEPLOYMENT_PROTOCOL_VERSION,
  type CraftDeploymentArtifact,
  type CraftDeploymentDefinition,
  type CraftDeploymentFunctions,
  type CraftDeploymentManifest,
} from './manifest.js';
import { validateCraftDeploymentDefinition } from './validate.js';

/** Document served for unknown paths when the static mode is `spa`. */
const DEFAULT_SPA_FALLBACK = 'index.html';
/** HTTP prefix the server-function registry is mounted on. */
const DEFAULT_FUNCTIONS_BASE_PATH = '/api';

/**
 * Applies every default of the CraftTS tooling and produces the artefact form
 * of the manifest.
 *
 * Resolution is pure and idempotent: resolving an already-resolved manifest
 * returns the same value, which is what makes the JSON round-trip safe.
 */
export function resolveCraftDeploymentManifest(
  definition: CraftDeploymentDefinition,
): CraftDeploymentManifest {
  const base = {
    protocolVersion: CRAFT_DEPLOYMENT_PROTOCOL_VERSION,
    name: definition.name,
    environment: definition.environment ?? 'production',
    platform: definition.platform,
    env: definition.env ?? [],
    ...(definition.functions
      ? { functions: resolveFunctions(definition.functions) }
      : {}),
  };

  if (definition.runtime === 'static') {
    const client = definition.client;
    return {
      ...base,
      runtime: 'static',
      client,
      static: {
        mode: definition.static.mode,
        fallback: definition.static.fallback ?? DEFAULT_SPA_FALLBACK,
        routes: definition.static.routes ?? [],
        serverRoutes: definition.static.serverRoutes ?? [],
      },
      artifact: resolveArtifact(definition, client.outDir, undefined),
    };
  }

  if (definition.runtime === 'node') {
    const server = {
      ...(definition.server.build ? { build: definition.server.build } : {}),
      entry: definition.server.entry,
      ...(definition.server.source ? { source: definition.server.source } : {}),
      ...(definition.server.start ? { start: definition.server.start } : {}),
      healthPath: definition.server.healthPath,
      readyPath: definition.server.readyPath,
    };
    return {
      ...base,
      runtime: 'node',
      ...(definition.client ? { client: definition.client } : {}),
      server,
      artifact: resolveArtifact(
        definition,
        definition.client?.outDir,
        server.entry,
        server.start,
      ),
    };
  }

  if (definition.runtime === 'worker') {
    const worker = {
      ...(definition.worker.build ? { build: definition.worker.build } : {}),
      entry: definition.worker.entry,
      ...(definition.worker.source ? { source: definition.worker.source } : {}),
      bindings: definition.worker.bindings ?? [],
    };
    return {
      ...base,
      runtime: 'worker',
      ...(definition.client ? { client: definition.client } : {}),
      worker,
      artifact: resolveArtifact(
        definition,
        definition.client?.outDir,
        worker.entry,
      ),
    };
  }

  const lambda = {
    ...(definition.lambda.build ? { build: definition.lambda.build } : {}),
    entry: definition.lambda.entry,
    ...(definition.lambda.source ? { source: definition.lambda.source } : {}),
    permissions: definition.lambda.permissions ?? [],
  };
  return {
    ...base,
    runtime: 'lambda',
    ...(definition.client ? { client: definition.client } : {}),
    lambda,
    artifact: resolveArtifact(
      definition,
      definition.client?.outDir,
      lambda.entry,
    ),
  };
}

function resolveFunctions(
  functions: NonNullable<CraftDeploymentDefinition['functions']>,
): CraftDeploymentFunctions {
  return {
    entry: functions.entry,
    basePath: functions.basePath ?? DEFAULT_FUNCTIONS_BASE_PATH,
    ids: functions.ids ?? [],
  };
}

function resolveArtifact(
  definition: CraftDeploymentDefinition,
  publicDir: string | undefined,
  serverEntry: string | undefined,
  start?: string,
): CraftDeploymentArtifact {
  const artifact = definition.artifact;
  const resolvedPublicDir = artifact?.publicDir ?? publicDir;
  const resolvedServerEntry = artifact?.serverEntry ?? serverEntry;
  const resolvedStart = artifact?.start ?? start;
  return {
    ...(resolvedPublicDir ? { publicDir: resolvedPublicDir } : {}),
    ...(resolvedServerEntry ? { serverEntry: resolvedServerEntry } : {}),
    ...(resolvedStart ? { start: resolvedStart } : {}),
    configFiles: artifact?.configFiles ?? [],
    // Shipping maps of a production bundle publishes the sources, so the
    // default refuses them and an application has to opt out explicitly.
    sourceMaps: artifact?.sourceMaps ?? 'forbidden',
  };
}

/**
 * Serialises a manifest with sorted keys so two builds of the same input
 * produce byte-identical artefacts and reviewable diffs.
 */
export function serializeCraftDeploymentManifest(
  manifest: CraftDeploymentManifest,
): string {
  return `${JSON.stringify(sortValue(manifest), null, 2)}\n`;
}

export type CraftDeploymentParseResult = Readonly<{
  manifest: CraftDeploymentManifest | null;
  diagnostics: readonly CraftDeploymentDiagnostic[];
}>;

/** Reads a serialised manifest and validates it against the current protocol. */
export function parseCraftDeploymentManifest(
  json: string,
): CraftDeploymentParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      manifest: null,
      diagnostics: [
        {
          code: 'CRAFT_DEPLOY_CONFIG_LOAD_FAILED',
          severity: 'error',
          message: `The manifest is not valid JSON: ${messageOf(error)}`,
          fix: 'Rebuild the manifest with `resolveCraftDeploymentManifest` and `serializeCraftDeploymentManifest`.',
        },
      ],
    };
  }

  const diagnostics: CraftDeploymentDiagnostic[] = [];
  const version =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)['protocolVersion']
      : undefined;
  if (version === undefined) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_MANIFEST_MISSING_FIELD',
      severity: 'error',
      path: 'protocolVersion',
      message: '`protocolVersion` is missing from the serialised manifest.',
      fix: 'Serialise the manifest with `serializeCraftDeploymentManifest`.',
    });
  } else if (version !== CRAFT_DEPLOYMENT_PROTOCOL_VERSION) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PROTOCOL_VERSION_UNSUPPORTED',
      severity: 'error',
      path: 'protocolVersion',
      message: `The manifest declares protocol \`${String(version)}\` and this tooling reads \`${CRAFT_DEPLOYMENT_PROTOCOL_VERSION}\`.`,
      fix: 'Rebuild the manifest with the current CraftTS tooling, or follow the migration notes.',
    });
  }

  const validation = validateCraftDeploymentDefinition(parsed);
  diagnostics.push(...validation.diagnostics);

  return {
    manifest:
      validation.definition && diagnostics.every((d) => d.severity !== 'error')
        ? resolveCraftDeploymentManifest(validation.definition)
        : null,
    diagnostics,
  };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
