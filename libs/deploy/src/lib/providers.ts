import type { CraftDeploymentDiagnostic } from './diagnostics.js';
import type {
  CraftDeploymentManifest,
  CraftDeploymentPlatform,
  CraftDeploymentRuntime,
  CraftStaticMode,
} from './manifest.js';

export const CRAFT_DEPLOYMENT_CAPABILITIES = [
  'static-spa',
  'static-ssg',
  'node-ssr',
  'worker',
  'lambda',
  'infrastructure',
  'local-preview',
] as const;

export type CraftDeploymentCapability =
  (typeof CRAFT_DEPLOYMENT_CAPABILITIES)[number];

export type CraftDeploymentResult = Readonly<{
  provider: string;
  stage: string;
  /** Public URL of the deployed application, when the provider exposes one. */
  url?: string;
  /** Provider outputs worth keeping, such as resource identifiers. */
  outputs: Readonly<Record<string, string>>;
}>;

/**
 * Everything a provider is given. The manifest alone is not enough: the same
 * artefact is deployed to several stages, and the paths it declares are only
 * meaningful against the root they were checked from.
 */
export type CraftDeploymentRequest = Readonly<{
  manifest: CraftDeploymentManifest;
  /** Directory the manifest paths are relative to. */
  rootDir: string;
  /** Target stage, e.g. `production` or `preview-42`. */
  stage: string;
}>;

export const CRAFT_DEPLOYMENT_RESOURCE_ACTIONS = [
  'create',
  'update',
  'delete',
  'unchanged',
] as const;

export type CraftDeploymentResourceAction =
  (typeof CRAFT_DEPLOYMENT_RESOURCE_ACTIONS)[number];

/** One resource a deployment would touch, as reported by a preview. */
export type CraftDeploymentPlannedResource = Readonly<{
  /** Provider-specific resource type, e.g. `cloudflare:Worker`. */
  type: string;
  name: string;
  action: CraftDeploymentResourceAction;
  /** Facts an operator needs to approve the change, never secrets. */
  details: Readonly<Record<string, string>>;
}>;

/**
 * What a deployment would do, without doing it.
 *
 * A preview is the approval surface: it has to name every resource and every
 * action before anything is created, which is why `preview` returns a plan
 * instead of printing one.
 */
export type CraftDeploymentPlan = Readonly<{
  provider: string;
  stage: string;
  resources: readonly CraftDeploymentPlannedResource[];
  /** Things an operator should know that are not failures. */
  notes: readonly string[];
}>;

/**
 * A deployment integration. The CLI owns the manifest and delegates every
 * mutation to an implementation of this contract, which is why no provider is
 * a dependency of the CraftTS runtime.
 *
 * `check` reports instead of throwing so its diagnostics join the ones of
 * `craft-ts check`; `preview` must never mutate anything.
 */
export type CraftDeploymentProvider = Readonly<{
  name: string;
  capabilities: readonly CraftDeploymentCapability[];
  check?(
    request: CraftDeploymentRequest,
  ): Promise<readonly CraftDeploymentDiagnostic[]>;
  preview(request: CraftDeploymentRequest): Promise<CraftDeploymentPlan>;
  deploy(request: CraftDeploymentRequest): Promise<CraftDeploymentResult>;
}>;

/**
 * What a provider package must export.
 *
 * The CLI resolves `@craft-ts/deploy-<name>` at run time and reads this single
 * factory, so adding a provider never means changing the CLI.
 */
export type CraftDeploymentProviderModule = Readonly<{
  createCraftDeploymentProvider(
    options?: Readonly<Record<string, unknown>>,
  ): CraftDeploymentProvider;
}>;

/** Narrows an unknown dynamic import to the provider module contract. */
export function isCraftDeploymentProviderModule(
  value: unknown,
): value is CraftDeploymentProviderModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CraftDeploymentProviderModule)
      .createCraftDeploymentProvider === 'function'
  );
}

/**
 * What a provider entry has to document. A capability list alone is not
 * actionable: an operator needs the artefact shape, the local preview command,
 * the credential mechanism and the known limits before choosing.
 */
export type CraftDeploymentProviderDescriptor = Readonly<{
  name: string;
  capabilities: readonly CraftDeploymentCapability[];
  platforms: readonly CraftDeploymentPlatform[];
  /** Artefact the provider consumes. */
  artifact: string;
  /** Local preview command, or `null` when the provider offers none. */
  previewCommand: string | null;
  /** How credentials reach the provider. */
  credentials: string;
  limits: readonly string[];
}>;

/**
 * Initial capability matrix. Adding a provider here documents it; it does not
 * make it an implementation of `CraftDeploymentProvider` in this package.
 */
export const CRAFT_DEPLOYMENT_PROVIDERS: readonly CraftDeploymentProviderDescriptor[] =
  Object.freeze([
    Object.freeze({
      name: 'alchemy',
      capabilities: [
        'static-spa',
        'static-ssg',
        'node-ssr',
        'worker',
        'lambda',
        'infrastructure',
        'local-preview',
      ],
      platforms: ['cloudflare', 'aws'],
      artifact:
        'Public directory plus the runtime entry declared by the manifest.',
      previewCommand: 'craft-ts deploy preview --provider alchemy',
      credentials:
        'Cloudflare or AWS credentials read from the environment by the Alchemy CLI.',
      limits: [
        'Requires the Alchemy CLI and a reachable state backend.',
        'Shipped as the separate package `@craft-ts/deploy-alchemy`.',
      ],
    } as const),
    Object.freeze({
      name: 'docker',
      capabilities: ['node-ssr', 'local-preview'],
      platforms: ['docker', 'node'],
      artifact: 'Image built from the SSR entry and the client output.',
      previewCommand: 'docker compose -f docker-compose.production.yml up',
      credentials: 'Registry credentials handled by the Docker CLI.',
      limits: [
        'No static-only publication path: a plain bucket is cheaper.',
        'Provisioning of the host is out of scope.',
      ],
    } as const),
    Object.freeze({
      name: 'cloudflare-pages',
      capabilities: ['static-spa', 'static-ssg'],
      platforms: ['cloudflare'],
      artifact: 'Public directory uploaded as-is.',
      previewCommand: 'wrangler pages dev <publicDir>',
      credentials: '`CLOUDFLARE_API_TOKEN` read by Wrangler.',
      limits: ['SSR and Worker runtimes need a Worker deployment, not Pages.'],
    } as const),
    Object.freeze({
      name: 'vercel',
      capabilities: ['static-spa', 'static-ssg', 'node-ssr', 'local-preview'],
      platforms: ['vercel'],
      artifact: 'Public directory plus an optional Node server entry.',
      previewCommand: 'vercel dev',
      credentials: '`VERCEL_TOKEN` read by the Vercel CLI.',
      limits: [
        'Worker and Lambda runtimes map to platform-specific functions and are not covered by this matrix.',
        'Infrastructure provisioning is partial and platform-owned.',
      ],
    } as const),
    Object.freeze({
      name: 'netlify',
      capabilities: ['static-spa', 'static-ssg', 'node-ssr', 'lambda'],
      platforms: ['netlify'],
      artifact: 'Public directory plus a functions directory.',
      previewCommand: 'netlify dev',
      credentials: '`NETLIFY_AUTH_TOKEN` read by the Netlify CLI.',
      limits: [
        'The Lambda capability is served by Netlify Functions, not by AWS Function URLs.',
        'No infrastructure provisioning.',
      ],
    } as const),
    Object.freeze({
      name: 'firebase',
      capabilities: ['static-spa', 'static-ssg', 'node-ssr', 'lambda'],
      platforms: ['firebase'],
      artifact: 'Hosting public directory plus Cloud Functions.',
      previewCommand: 'firebase emulators:start',
      credentials: 'Firebase CLI login or a service account key.',
      limits: [
        'No Worker runtime.',
        'Infrastructure provisioning is partial and project-scoped.',
      ],
    } as const),
    Object.freeze({
      name: 'github-pages',
      capabilities: ['static-spa', 'static-ssg'],
      platforms: ['github-pages'],
      artifact: 'Public directory published as a Pages artefact.',
      previewCommand: null,
      credentials: 'The `GITHUB_TOKEN` of the publishing workflow.',
      limits: [
        'No server runtime at all.',
        'SPA fallback requires a `404.html` copy of the fallback document.',
      ],
    } as const),
  ]);

export function findCraftDeploymentProvider(
  name: string,
): CraftDeploymentProviderDescriptor | undefined {
  return CRAFT_DEPLOYMENT_PROVIDERS.find((provider) => provider.name === name);
}

/**
 * Capability a manifest requires from a provider. The static runtime splits
 * into two capabilities because pre-rendering and SPA fallback are different
 * publication contracts.
 */
export function requiredCapability(
  runtime: CraftDeploymentRuntime,
  staticMode?: CraftStaticMode,
): CraftDeploymentCapability {
  if (runtime === 'static') {
    return staticMode === 'ssg' ? 'static-ssg' : 'static-spa';
  }
  if (runtime === 'node') return 'node-ssr';
  return runtime;
}

/**
 * Platforms able to execute a given runtime. A pair absent from this table is
 * not a missing integration: nothing on that platform runs that shape.
 */
export const CRAFT_RUNTIME_PLATFORMS: Readonly<
  Record<CraftDeploymentRuntime, readonly CraftDeploymentPlatform[]>
> = Object.freeze({
  static: [
    'node',
    'docker',
    'cloudflare',
    'aws',
    'vercel',
    'netlify',
    'firebase',
    'github-pages',
  ],
  node: ['node', 'docker', 'aws', 'vercel', 'netlify', 'firebase'],
  worker: ['cloudflare'],
  lambda: ['aws', 'netlify', 'firebase'],
});

export function isRuntimeSupportedByPlatform(
  runtime: CraftDeploymentRuntime,
  platform: CraftDeploymentPlatform,
): boolean {
  return CRAFT_RUNTIME_PLATFORMS[runtime].includes(platform);
}
