import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type {
  AlchemyOpenOptions,
  AlchemyResourceRequest,
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
 * module plus a nested export path. This table is the single place to adjust
 * when Alchemy renames or moves a resource.
 */
export const ALCHEMY_RESOURCE_EXPORTS: Readonly<
  Record<string, Readonly<{ module: string; path: readonly string[] }>>
> = Object.freeze({
  'cloudflare:Website.StaticSite': {
    module: 'alchemy/Cloudflare',
    path: ['Website', 'StaticSite'],
  },
  'cloudflare:Worker': {
    module: 'alchemy/Cloudflare',
    path: ['Worker'],
  },
  'cloudflare:KV.Namespace': {
    module: 'alchemy/Cloudflare',
    path: ['KV', 'Namespace'],
  },
  'cloudflare:R2.Bucket': {
    module: 'alchemy/Cloudflare',
    path: ['R2', 'Bucket'],
  },
  'cloudflare:D1.Database': {
    module: 'alchemy/Cloudflare',
    path: ['D1', 'Database'],
  },
  'cloudflare:Queues.Queue': {
    module: 'alchemy/Cloudflare',
    path: ['Queues', 'Queue'],
  },
  'cloudflare:Workers.DurableObject': {
    module: 'alchemy/Cloudflare',
    path: ['DurableObject'],
  },
  'aws:Website.StaticSite': {
    module: 'alchemy/AWS',
    path: ['Website', 'StaticSite'],
  },
  'aws:Lambda.Function': {
    module: 'alchemy/AWS',
    path: ['Lambda', 'Function'],
  },
  'aws:S3.Bucket': { module: 'alchemy/AWS', path: ['S3', 'Bucket'] },
  'aws:CloudFront.Distribution': {
    module: 'alchemy/AWS',
    path: ['CloudFront', 'Distribution'],
  },
  'aws:ECS.Cluster': { module: 'alchemy/AWS', path: ['ECS', 'Cluster'] },
  'aws:ECS.Service': { module: 'alchemy/AWS', path: ['ECS', 'Service'] },
});

const execFile = promisify(execFileCallback);

/** Imports the optional peer dependency, or explains why it cannot. */
export async function loadAlchemyRuntime(): Promise<AlchemyRuntime> {
  await importAlchemy();
  const version = await readAlchemyVersion();

  return {
    version,
    open: async (options) => await openScope(options),
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

async function importAlchemy(): Promise<Record<string, unknown>> {
  try {
    return (await importOptional('alchemy')) as Record<string, unknown>;
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
    const resolved =
      typeof import.meta.resolve === 'function'
        ? fileURLToPath(import.meta.resolve('alchemy'))
        : undefined;
    const starts = [
      ...(resolved ? [dirname(resolved)] : []),
      join(process.cwd(), 'node_modules', 'alchemy', 'lib'),
      join(process.cwd(), 'node_modules', 'alchemy'),
    ];
    for (const start of starts) {
      let directory = start;
      for (let index = 0; index < 5; index += 1) {
        try {
          const manifest = JSON.parse(
            await readFile(join(directory, 'package.json'), 'utf8'),
          ) as { name?: string; version?: string };
          if (manifest.name === 'alchemy') {
            return manifest.version ?? 'unknown';
          }
        } catch {
          // Continue walking towards the package root.
        }
        directory = dirname(directory);
      }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function openScope(
  options: AlchemyOpenOptions,
): Promise<AlchemyScope> {
  const resources: AlchemyResourceRequest[] = [];
  let deployedOutput: Readonly<Record<string, string>> = {};

  return {
    read: async () =>
      resources.map((resource) => ({
        type: resource.type,
        name: resource.name,
        outputs:
          resource.type === 'cloudflare:Worker' ||
          resource.type === 'cloudflare:Website.StaticSite'
            ? deployedOutput
            : {},
        properties: resource.properties,
      })),
    apply: async (resource) => {
      resources.push(resource);
      return {
        type: resource.type,
        name: resource.name,
        outputs: {},
        properties: resource.properties,
      };
    },
    finalize: async () => {
      if (options.phase !== 'up') return;
      const rootDir = options.rootDir ?? process.cwd();
      const directory = await mkdtemp(join(tmpdir(), 'craft-alchemy-'));
      const stackFile = join(directory, 'alchemy.run.mjs');
      try {
        await writeFile(
          stackFile,
          createAlchemyStackSource(
            options.app,
            options.stage,
            resources,
            rootDir,
          ),
          'utf8',
        );
        const result = await runAlchemyCli('deploy', stackFile, options, rootDir);
        deployedOutput = extractOutputs(result.stdout, result.stderr);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    dispose: async () => {
      // The generated stack is removed after each apply. Alchemy owns the
      // actual resource state and no cleanup command is ever run here.
    },
  };
}

async function runAlchemyCli(
  command: 'deploy' | 'plan',
  stackFile: string,
  options: AlchemyOpenOptions,
  rootDir: string,
): Promise<{ stdout: string; stderr: string }> {
  const bin = fileURLToPath(import.meta.resolve('alchemy/bin/alchemy.js'));
  return await execFile(
    process.execPath,
    [
      bin,
      command,
      stackFile,
      '--stage',
      options.stage,
      ...(command === 'deploy' ? ['--yes'] : []),
    ],
    { cwd: rootDir, env: process.env },
  );
}

export function createAlchemyStackSource(
  app: string,
  stage: string,
  resources: readonly AlchemyResourceRequest[],
  rootDir?: string,
): string {
  const platform = resources.some((resource) => resource.type.startsWith('aws:'))
    ? 'AWS'
    : 'Cloudflare';
  const resourceVariables = new Map<string, ResourceVariable>();
  const declarations: string[] = [];
  let index = 0;
  let endpointVariable: string | undefined;

  for (const resource of resources.filter((item) => !isWorker(item))) {
    const target = ALCHEMY_RESOURCE_EXPORTS[resource.type];
    if (!target) throw new Error(`No Alchemy resource mapping for ${resource.type}.`);
    const variable = `resource${index++}`;
    resourceVariables.set(resource.name, { variable, type: resource.type });
    declarations.push(
      `const ${variable} = yield* ${target.path.join('.')}(${json(resource.name)}, ${resourcePropertiesSource(resource, rootDir)});`,
    );
    if (resource.type === 'cloudflare:Website.StaticSite') {
      endpointVariable = variable;
    }
  }

  for (const resource of resources.filter(isWorker)) {
    const target = ALCHEMY_RESOURCE_EXPORTS[resource.type];
    if (!target) throw new Error(`No Alchemy resource mapping for ${resource.type}.`);
    const variable = `resource${index++}`;
    const props = workerPropertiesSource(resource, resourceVariables, rootDir);
    declarations.push(
      `const ${variable} = yield* ${target.path.join('.')}(${json(resource.name)}, ${props});`,
    );
    resourceVariables.set(resource.name, { variable, type: resource.type });
    endpointVariable = variable;
  }

  return `import * as Alchemy from 'alchemy';
import * as ${platform} from 'alchemy/${platform}';
import * as Effect from 'effect/Effect';

export default Alchemy.Stack(${json(app)}, {
  providers: ${platform}.providers(),
  state: ${platform}.state(),
}, Effect.gen(function* () {
  ${declarations.join('\n  ')}
  return ${endpointVariable ? `{ url: ${endpointVariable}.url }` : '{}'};
}));
// stage: ${stage}
`;
}

function isWorker(resource: AlchemyResourceRequest): boolean {
  return resource.type === 'cloudflare:Worker';
}

function resourceProperties(
  resource: AlchemyResourceRequest,
): Readonly<Record<string, unknown>> {
  const { binding: _binding, ...properties } = resource.properties;
  return properties;
}

function resourcePropertiesSource(
  resource: AlchemyResourceRequest,
  rootDir?: string,
): string {
  if (resource.type !== 'aws:Lambda.Function') {
    const properties = resourceProperties(resource);
    if (
      resource.type === 'cloudflare:Website.StaticSite' ||
      resource.type === 'aws:Website.StaticSite'
    ) {
      return json({
        ...properties,
        ...(properties['path']
          ? { path: pathFromRoot(properties['path'], rootDir) }
          : {}),
        ...(properties['outdir']
          ? { outdir: pathFromRoot(properties['outdir'], rootDir) }
          : {}),
      });
    }
    return json(properties);
  }

  const properties = resourceProperties(resource);
  const environment = String(properties['environment'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const env = environment.map(
    (name) => `${json(name)}: process.env[${json(name)}]`,
  );
  return `{ main: ${json(pathFromRoot(properties['entry'], rootDir))}, functionUrl: true, env: { ${env.join(', ')} } }`;
}

function workerPropertiesSource(
  resource: AlchemyResourceRequest,
  variables: ReadonlyMap<string, ResourceVariable>,
  rootDir?: string,
): string {
  const properties = resource.properties;
  const environment = String(properties['environment'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const bindings = Array.isArray(properties['bindings'])
    ? properties['bindings']
    : [];
  const envEntries = [
    ...environment.map(
      (name) => `${json(name)}: process.env[${json(name)}]`,
    ),
    ...bindings.flatMap((name) => {
      const binding = resourceBindingName(String(name), variables, resource);
      return binding ? [`${json(String(name))}: ${binding}`] : [];
    }),
  ];
  return `{ main: ${json(pathFromRoot(properties['entrypoint'], rootDir))}, ${
    properties['assets']
      ? `assets: { directory: ${json(pathFromRoot(properties['assets'], rootDir))} }, `
      : ''
  }env: { ${envEntries.join(', ')} } }`;
}

function pathFromRoot(value: unknown, rootDir?: string): unknown {
  return rootDir && typeof value === 'string' && !value.startsWith('/')
    ? resolve(rootDir, value)
    : value;
}

function resourceBindingName(
  bindingName: string,
  variables: ReadonlyMap<string, ResourceVariable>,
  worker: AlchemyResourceRequest,
): string | undefined {
  const targetName = `${worker.name.slice(0, worker.name.lastIndexOf('-'))}-${bindingName.toLowerCase()}`;
  const target = variables.get(targetName);
  if (!target) return undefined;
  switch (target.type) {
    case 'cloudflare:KV.Namespace':
      return `yield* Cloudflare.KV.ReadWriteNamespace(${target.variable})`;
    case 'cloudflare:R2.Bucket':
      return `yield* Cloudflare.R2.ReadWriteBucket(${target.variable})`;
    case 'cloudflare:D1.Database':
      return `yield* Cloudflare.D1.QueryDatabase(${target.variable})`;
    case 'cloudflare:Queues.Queue':
      return `yield* Cloudflare.Queues.WriteQueue(${target.variable})`;
    default:
      return target.variable;
  }
}

type ResourceVariable = Readonly<{
  variable: string;
  type: string;
}>;

function json(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function extractOutputs(
  stdout: string,
  stderr: string,
): Readonly<Record<string, string>> {
  const text = `${stdout}\n${stderr}`;
  const url = text.match(/https?:\/\/[^\s'"`]+/)?.[0]?.replace(/[),.;]+$/, '');
  return url ? { url } : {};
}
