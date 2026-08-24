import type {
  CraftDeploymentBinding,
  CraftDeploymentDiagnostic,
  CraftDeploymentRequest,
} from '@craft-ts/deploy';
import { alchemyResourceName } from '../naming.js';
import type { AlchemyResourceRequest } from '../runtime.js';
import {
  environmentNames,
  unsupported,
  type AlchemyPresetResult,
} from './preset.js';

/** Binding kinds Alchemy provisions, by the `type` the manifest declares. */
const BINDING_RESOURCES: Readonly<Record<string, string>> = {
  kv: 'cloudflare:KVNamespace',
  kv_namespace: 'cloudflare:KVNamespace',
  r2: 'cloudflare:R2Bucket',
  r2_bucket: 'cloudflare:R2Bucket',
  d1: 'cloudflare:D1Database',
  d1_database: 'cloudflare:D1Database',
  queue: 'cloudflare:Queue',
  durable_object: 'cloudflare:DurableObjectNamespace',
};

/**
 * Cloudflare preset.
 *
 * A `static` manifest becomes a StaticSite, a `worker` manifest becomes a
 * Worker plus the resources its bindings name. Nothing else is invented: the
 * preset reads the manifest and stops where the manifest stops.
 */
export function cloudflarePreset(
  request: CraftDeploymentRequest,
): AlchemyPresetResult {
  const manifest = request.manifest;
  const name = (suffix: string) =>
    alchemyResourceName(manifest.name, request.stage, suffix);

  if (manifest.runtime === 'static') {
    const publicDir = manifest.artifact.publicDir;
    if (!publicDir) {
      return {
        resources: [],
        notes: [],
        diagnostics: [
          unsupported(
            'The static manifest declares no public directory to upload.',
            'Declare `client.outDir`, or `artifact.publicDir`.',
            request,
          ),
        ],
      };
    }
    const spa = manifest.static.mode === 'spa';
    return {
      resources: [
        {
          type: 'cloudflare:StaticSite',
          name: name('site'),
          properties: {
            directory: publicDir,
            spa,
            ...(spa
              ? { notFoundPage: manifest.static.fallback }
              : { prerenderedRoutes: manifest.static.routes.length }),
          },
        },
      ],
      notes: spa
        ? [`Unknown paths are answered with \`${manifest.static.fallback}\`.`]
        : [
            `${manifest.static.routes.length} pre-rendered route(s) are uploaded as documents.`,
            ...(manifest.static.serverRoutes.length > 0
              ? [
                  `${manifest.static.serverRoutes.length} route(s) still need a server runtime and are not covered by this deployment.`,
                ]
              : []),
          ],
      diagnostics: [],
    };
  }

  if (manifest.runtime !== 'worker') {
    return {
      resources: [],
      notes: [],
      diagnostics: [
        unsupported(
          `Cloudflare cannot execute the \`${manifest.runtime}\` runtime.`,
          'Use the `worker` runtime on Cloudflare, or deploy this manifest to another platform.',
          request,
        ),
      ],
    };
  }

  const resources: AlchemyResourceRequest[] = [];
  const notes: string[] = [];
  const diagnostics: CraftDeploymentDiagnostic[] = [];

  for (const binding of manifest.worker.bindings) {
    const resource = bindingResource(binding, name);
    if (resource === 'secret') {
      notes.push(
        `The binding \`${binding.name}\` is a secret: its value must already exist in the Alchemy state or the environment; the plan never carries it.`,
      );
      continue;
    }
    if (resource === null) {
      diagnostics.push(
        unsupported(
          `Alchemy has no Cloudflare resource for the binding type \`${binding.type}\` declared by \`${binding.name}\`.`,
          `Use one of ${Object.keys(BINDING_RESOURCES).join(', ')} or \`secret\`, or create the resource outside CraftTS.`,
          request,
        ),
      );
      continue;
    }
    resources.push(resource);
  }

  const assets = manifest.artifact.publicDir;
  resources.push({
    type: 'cloudflare:Worker',
    name: name('worker'),
    properties: {
      entrypoint: manifest.worker.entry,
      ...(assets ? { assets } : {}),
      bindings: manifest.worker.bindings.map((binding) => binding.name),
      environment: environmentNames(request),
      ...(manifest.functions
        ? { serverFunctionsBasePath: manifest.functions.basePath }
        : {}),
    },
  });

  if (assets) {
    notes.push(`Static assets are served by the Worker from \`${assets}\`.`);
  }
  if (manifest.functions && manifest.functions.ids.length > 0) {
    notes.push(
      `${manifest.functions.ids.length} server-function(s) are exposed under \`${manifest.functions.basePath}\`.`,
    );
  }

  return { resources, notes, diagnostics };
}

function bindingResource(
  binding: CraftDeploymentBinding,
  name: (suffix: string) => string,
): AlchemyResourceRequest | 'secret' | null {
  if (binding.type === 'secret') return 'secret';
  const type = BINDING_RESOURCES[binding.type.toLowerCase()];
  if (!type) return null;
  return {
    type,
    name: name(binding.name),
    properties: { binding: binding.name },
  };
}
