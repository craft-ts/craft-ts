/**
 * Deployment contract of a CraftTS application.
 *
 * The contract separates three notions that the tooling must never merge:
 *
 * - `runtime` — the execution shape of the bundle (`static`, `node`, `worker`
 *   or `lambda`);
 * - `platform` — the technical platform targeted by that bundle;
 * - `provider` — the integration that builds, publishes or provisions the
 *   platform. Providers live outside this module: a manifest is
 *   provider-neutral so the same artefact can be published by several of them.
 */

/** Version of the manifest protocol, bumped on any breaking field change. */
export const CRAFT_DEPLOYMENT_PROTOCOL_VERSION = '1';

export const CRAFT_DEPLOYMENT_RUNTIMES = [
  'static',
  'node',
  'worker',
  'lambda',
] as const;

export type CraftDeploymentRuntime = (typeof CRAFT_DEPLOYMENT_RUNTIMES)[number];

export const CRAFT_STATIC_MODES = ['spa', 'ssg'] as const;

export type CraftStaticMode = (typeof CRAFT_STATIC_MODES)[number];

export const CRAFT_DEPLOYMENT_PLATFORMS = [
  'node',
  'docker',
  'cloudflare',
  'aws',
  'vercel',
  'netlify',
  'firebase',
  'github-pages',
] as const;

export type CraftDeploymentPlatform =
  (typeof CRAFT_DEPLOYMENT_PLATFORMS)[number];

export const CRAFT_SOURCE_MAP_POLICIES = [
  'forbidden',
  'external',
  'allowed',
] as const;

/**
 * `forbidden` fails the artefact check when a `.map` file is shipped,
 * `external` accepts them as separate files, `allowed` accepts anything.
 */
export type CraftSourceMapPolicy = (typeof CRAFT_SOURCE_MAP_POLICIES)[number];

/**
 * An environment variable the deployment expects. The manifest is committed,
 * so it carries the name and the requirement, never the value.
 */
export type CraftDeploymentEnvironmentVariable = Readonly<{
  name: string;
  required: boolean;
  description?: string;
}>;

/** A platform resource the runtime expects to be bound at deploy time. */
export type CraftDeploymentBinding = Readonly<{
  name: string;
  type: string;
  description?: string;
}>;

export type CraftDeploymentClient = Readonly<{
  /** Command producing the browser bundle. */
  build: string;
  /** Directory produced by that command, relative to the workspace root. */
  outDir: string;
}>;

export type CraftDeploymentStaticInput = Readonly<{
  mode: CraftStaticMode;
  /** `spa` only: document served for unknown paths. Defaults to `index.html`. */
  fallback?: string;
  /** `ssg` only: the exhaustive list of routes to pre-render. */
  routes?: readonly string[];
  /** Routes that cannot be pre-rendered and still need a server runtime. */
  serverRoutes?: readonly string[];
}>;

export type CraftDeploymentStatic = Readonly<{
  mode: CraftStaticMode;
  fallback: string;
  routes: readonly string[];
  serverRoutes: readonly string[];
}>;

export type CraftDeploymentServerInput = Readonly<{
  build?: string;
  /** SSR entry point produced by the build. */
  entry: string;
  /**
   * Source module producing `entry`. Declaring it lets the checker read the
   * real module graph before the build has ever run.
   */
  source?: string;
  /** Command starting the built server. */
  start?: string;
  healthPath: string;
  readyPath: string;
}>;

export type CraftDeploymentServer = Readonly<{
  build?: string;
  entry: string;
  source?: string;
  start?: string;
  healthPath: string;
  readyPath: string;
}>;

export type CraftDeploymentWorkerInput = Readonly<{
  build?: string;
  /** Module exporting `fetch(request, env, ctx)`. */
  entry: string;
  /** Source module producing `entry`, analysed before the build. */
  source?: string;
  bindings?: readonly CraftDeploymentBinding[];
}>;

export type CraftDeploymentWorker = Readonly<{
  build?: string;
  entry: string;
  source?: string;
  bindings: readonly CraftDeploymentBinding[];
}>;

export type CraftDeploymentLambdaInput = Readonly<{
  build?: string;
  /** Module exporting the Function URL handler. */
  entry: string;
  /** Source module producing `entry`, analysed before the build. */
  source?: string;
  permissions?: readonly string[];
}>;

export type CraftDeploymentLambda = Readonly<{
  build?: string;
  entry: string;
  source?: string;
  permissions: readonly string[];
}>;

export type CraftDeploymentFunctionsInput = Readonly<{
  /** Module building the server-function registry. */
  entry: string;
  /** HTTP prefix the registry is mounted on. Defaults to `/api`. */
  basePath?: string;
  /** Identifiers exposed to clients. */
  ids?: readonly string[];
}>;

export type CraftDeploymentFunctions = Readonly<{
  entry: string;
  basePath: string;
  ids: readonly string[];
}>;

export type CraftDeploymentArtifactInput = Readonly<{
  /** Directory uploaded as-is by a publication provider. */
  publicDir?: string;
  /** Entry a runtime provider has to execute. */
  serverEntry?: string;
  /** Command starting the artefact locally or on the platform. */
  start?: string;
  /** Files the provider must ship next to the artefact. */
  configFiles?: readonly string[];
  sourceMaps?: CraftSourceMapPolicy;
}>;

export type CraftDeploymentArtifact = Readonly<{
  publicDir?: string;
  serverEntry?: string;
  start?: string;
  configFiles: readonly string[];
  sourceMaps: CraftSourceMapPolicy;
}>;

type DefinitionBase = Readonly<{
  name: string;
  /** Target environment, e.g. `production` or `staging`. */
  environment?: string;
  platform: CraftDeploymentPlatform;
  functions?: CraftDeploymentFunctionsInput;
  env?: readonly CraftDeploymentEnvironmentVariable[];
  artifact?: CraftDeploymentArtifactInput;
}>;

/**
 * The runtime discriminates which section is mandatory. Forbidding the other
 * sections at the type level keeps `craft.deploy.ts` honest: a worker
 * deployment cannot silently carry an SSR entry that nothing will execute.
 */
export type CraftStaticDeploymentDefinition = DefinitionBase &
  Readonly<{
    runtime: 'static';
    static: CraftDeploymentStaticInput;
    client: CraftDeploymentClient;
    server?: never;
    worker?: never;
    lambda?: never;
  }>;

export type CraftNodeDeploymentDefinition = DefinitionBase &
  Readonly<{
    runtime: 'node';
    server: CraftDeploymentServerInput;
    client?: CraftDeploymentClient;
    static?: never;
    worker?: never;
    lambda?: never;
  }>;

export type CraftWorkerDeploymentDefinition = DefinitionBase &
  Readonly<{
    runtime: 'worker';
    worker: CraftDeploymentWorkerInput;
    client?: CraftDeploymentClient;
    static?: never;
    server?: never;
    lambda?: never;
  }>;

export type CraftLambdaDeploymentDefinition = DefinitionBase &
  Readonly<{
    runtime: 'lambda';
    lambda: CraftDeploymentLambdaInput;
    client?: CraftDeploymentClient;
    static?: never;
    server?: never;
    worker?: never;
  }>;

/** What an application author writes in `craft.deploy.ts`. */
export type CraftDeploymentDefinition =
  | CraftStaticDeploymentDefinition
  | CraftNodeDeploymentDefinition
  | CraftWorkerDeploymentDefinition
  | CraftLambdaDeploymentDefinition;

type ManifestBase = Readonly<{
  protocolVersion: string;
  name: string;
  environment: string;
  platform: CraftDeploymentPlatform;
  functions?: CraftDeploymentFunctions;
  env: readonly CraftDeploymentEnvironmentVariable[];
  artifact: CraftDeploymentArtifact;
}>;

export type CraftStaticDeploymentManifest = ManifestBase &
  Readonly<{
    runtime: 'static';
    static: CraftDeploymentStatic;
    client: CraftDeploymentClient;
  }>;

export type CraftNodeDeploymentManifest = ManifestBase &
  Readonly<{
    runtime: 'node';
    server: CraftDeploymentServer;
    client?: CraftDeploymentClient;
  }>;

export type CraftWorkerDeploymentManifest = ManifestBase &
  Readonly<{
    runtime: 'worker';
    worker: CraftDeploymentWorker;
    client?: CraftDeploymentClient;
  }>;

export type CraftLambdaDeploymentManifest = ManifestBase &
  Readonly<{
    runtime: 'lambda';
    lambda: CraftDeploymentLambda;
    client?: CraftDeploymentClient;
  }>;

/**
 * The resolved, serialisable form written to
 * `dist/<app>/craft-deployment-manifest.json`. Every default is applied, so a
 * provider never has to know the defaults of the CraftTS tooling.
 */
export type CraftDeploymentManifest =
  | CraftStaticDeploymentManifest
  | CraftNodeDeploymentManifest
  | CraftWorkerDeploymentManifest
  | CraftLambdaDeploymentManifest;

/**
 * Declares the deployment of a CraftTS application.
 *
 * The call is pure: it neither reads the filesystem nor resolves defaults, so
 * importing `craft.deploy.ts` stays free of side effects. Defaults belong to
 * {@link resolveCraftDeploymentManifest}.
 */
export function defineCraftDeployment<
  const Definition extends CraftDeploymentDefinition,
>(definition: Definition): Definition {
  return Object.freeze(definition);
}
