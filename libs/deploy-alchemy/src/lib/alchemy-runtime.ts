import type {
  AlchemyOpenOptions,
  AlchemyResourceRequest,
  AlchemyResourceState,
  AlchemyRuntime,
  AlchemyScope,
} from './runtime.js';

/**
 * Adapter over the real Alchemy package.
 *
 * Alchemy is an optional peer dependency, so it is imported lazily and only
 * when a preview or a deployment actually runs. Everything version-specific is
 * concentrated here: the presets and the planner never see an Alchemy type.
 */

/**
 * Where each planned resource type comes from.
 *
 * Alchemy exports its resources per platform module, so a plan type maps to a
 * module plus an export. This table is the single place to adjust when Alchemy
 * renames or moves a resource.
 */
export const ALCHEMY_RESOURCE_EXPORTS: Readonly<
  Record<string, Readonly<{ module: string; export: string }>>
> = Object.freeze({
  'cloudflare:StaticSite': {
    module: 'alchemy/cloudflare',
    export: 'StaticSite',
  },
  'cloudflare:Worker': { module: 'alchemy/cloudflare', export: 'Worker' },
  'cloudflare:KVNamespace': {
    module: 'alchemy/cloudflare',
    export: 'KVNamespace',
  },
  'cloudflare:R2Bucket': { module: 'alchemy/cloudflare', export: 'R2Bucket' },
  'cloudflare:D1Database': {
    module: 'alchemy/cloudflare',
    export: 'D1Database',
  },
  'cloudflare:Queue': { module: 'alchemy/cloudflare', export: 'Queue' },
  'cloudflare:DurableObjectNamespace': {
    module: 'alchemy/cloudflare',
    export: 'DurableObjectNamespace',
  },
  'aws:LambdaFunction': { module: 'alchemy/aws', export: 'Function' },
  'aws:LambdaFunctionUrl': { module: 'alchemy/aws', export: 'FunctionUrl' },
  'aws:Bucket': { module: 'alchemy/aws', export: 'Bucket' },
  'aws:CloudFrontDistribution': {
    module: 'alchemy/aws',
    export: 'Distribution',
  },
  'aws:EcsCluster': { module: 'alchemy/aws', export: 'Cluster' },
  'aws:EcsService': { module: 'alchemy/aws', export: 'Service' },
});

type AlchemyScopeHandle = {
  finalize(): Promise<void>;
  destroy?(): Promise<void>;
  [key: string]: unknown;
};

type AlchemyModule = {
  default: (
    application: string,
    options: Record<string, unknown>,
  ) => Promise<AlchemyScopeHandle>;
};

/** Imports the optional peer dependency, or explains why it cannot. */
export async function loadAlchemyRuntime(): Promise<AlchemyRuntime> {
  const alchemy = await importAlchemy();
  const version = await readAlchemyVersion();

  return {
    version,
    open: async (options) => await openScope(alchemy, options),
  };
}

/**
 * Imports a module whose specifier is only known at run time.
 *
 * The indirection is deliberate: `alchemy` is an optional peer dependency, so
 * a literal `import('alchemy')` would fail to type-check in every project that
 * has not installed it, and an ambient declaration would shadow the real types
 * in the projects that have.
 */
async function importOptional(specifier: string): Promise<unknown> {
  return await import(specifier);
}

async function importAlchemy(): Promise<AlchemyModule> {
  try {
    return (await importOptional('alchemy')) as AlchemyModule;
  } catch (error) {
    throw new Error(
      `\`alchemy\` is not installed in this project (${
        error instanceof Error ? error.message : String(error)
      }). Run \`npm install --save-dev alchemy\`.`,
    );
  }
}

async function readAlchemyVersion(): Promise<string> {
  try {
    const manifest = (await importOptional('alchemy/package.json')) as {
      default?: { version?: string };
      version?: string;
    };
    return manifest.default?.version ?? manifest.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function openScope(
  alchemy: AlchemyModule,
  options: AlchemyOpenOptions,
): Promise<AlchemyScope> {
  const scope = await alchemy.default(options.app, {
    stage: options.stage,
    // Alchemy's read phase resolves the recorded state without creating or
    // updating anything, which is exactly what a preview may do.
    phase: options.phase,
  });

  return {
    read: async () => readRecordedState(scope),
    apply: async (resource) => await applyResource(resource),
    finalize: async () => {
      await scope.finalize();
    },
    dispose: async () => {
      // A read scope has nothing to commit; disposing it must not delete the
      // resources it just listed, so `destroy` is deliberately not called.
    },
  };
}

function readRecordedState(
  scope: AlchemyScopeHandle,
): readonly AlchemyResourceState[] {
  const state = scope['state'];
  if (!Array.isArray(state)) return [];
  return state
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      type: String(entry['type'] ?? ''),
      name: String(entry['id'] ?? entry['name'] ?? ''),
      outputs: stringRecord(entry['output'] ?? entry['outputs']),
    }));
}

async function applyResource(
  resource: AlchemyResourceRequest,
): Promise<AlchemyResourceState> {
  const target = ALCHEMY_RESOURCE_EXPORTS[resource.type];
  if (!target) {
    throw new Error(
      `No Alchemy resource is mapped to \`${resource.type}\`. Add it to ALCHEMY_RESOURCE_EXPORTS.`,
    );
  }

  const module = (await importOptional(target.module)) as Record<
    string,
    unknown
  >;
  const factory = module[target.export];
  if (typeof factory !== 'function') {
    throw new Error(
      `\`${target.module}\` exports no \`${target.export}\`; the installed Alchemy does not match ALCHEMY_RESOURCE_EXPORTS.`,
    );
  }

  const created = (await (
    factory as (
      name: string,
      properties: Record<string, unknown>,
    ) => Promise<unknown>
  )(resource.name, { ...resource.properties })) as Record<string, unknown>;

  return {
    type: resource.type,
    name: resource.name,
    outputs: stringRecord(created),
    properties: resource.properties,
  };
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null) return {};
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'number') {
      record[key] = String(entry);
    }
  }
  return record;
}
