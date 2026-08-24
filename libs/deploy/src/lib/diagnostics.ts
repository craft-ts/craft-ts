import type {
  CraftDeploymentPlatform,
  CraftDeploymentRuntime,
} from './manifest.js';

export type CraftDeploymentSeverity = 'error' | 'warning';

export const CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES = [
  'CRAFT_DEPLOY_CONFIG_NOT_FOUND',
  'CRAFT_DEPLOY_CONFIG_LOAD_FAILED',
  'CRAFT_DEPLOY_CONFIG_NO_DEFAULT_EXPORT',
  'CRAFT_DEPLOY_MANIFEST_NOT_AN_OBJECT',
  'CRAFT_DEPLOY_MANIFEST_MISSING_FIELD',
  'CRAFT_DEPLOY_MANIFEST_INVALID_FIELD',
  'CRAFT_DEPLOY_MANIFEST_UNKNOWN_RUNTIME',
  'CRAFT_DEPLOY_MANIFEST_UNKNOWN_PLATFORM',
  'CRAFT_DEPLOY_MANIFEST_SECTION_MISSING',
  'CRAFT_DEPLOY_MANIFEST_SECTION_UNEXPECTED',
  'CRAFT_DEPLOY_PROTOCOL_VERSION_UNSUPPORTED',
  'CRAFT_DEPLOY_RUNTIME_MISMATCH',
  'CRAFT_DEPLOY_PLATFORM_MISMATCH',
  'CRAFT_DEPLOY_RUNTIME_PLATFORM_INCOMPATIBLE',
  'CRAFT_DEPLOY_PROVIDER_UNKNOWN',
  'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING',
  'CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED',
  'CRAFT_DEPLOY_PROVIDER_NOT_INSTALLED',
  'CRAFT_DEPLOY_PROVIDER_INVALID_MODULE',
  'CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING',
  'CRAFT_DEPLOY_PROVIDER_STATE_UNAVAILABLE',
  'CRAFT_DEPLOY_PROVIDER_TOOLCHAIN_MISSING',
  'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
  'CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED',
  'CRAFT_DEPLOY_PATH_MISSING',
  'CRAFT_DEPLOY_NODE_BUILTIN_IMPORT',
  'CRAFT_DEPLOY_HEALTH_PATH_MISSING',
  'CRAFT_DEPLOY_READY_PATH_MISSING',
  'CRAFT_DEPLOY_SSG_ROUTES_MISSING',
  'CRAFT_DEPLOY_SSG_ROUTE_NOT_STATIC',
  'CRAFT_DEPLOY_SPA_FALLBACK_MISSING',
  'CRAFT_DEPLOY_ENV_NAME_INVALID',
  'CRAFT_DEPLOY_ENV_VALUE_FORBIDDEN',
  'CRAFT_DEPLOY_ENV_UNDECLARED',
  'CRAFT_DEPLOY_FUNCTION_ID_DUPLICATE',
  'CRAFT_DEPLOY_FUNCTION_ID_UNKNOWN',
  'CRAFT_DEPLOY_ARTIFACT_MISSING',
  'CRAFT_DEPLOY_ARTIFACT_NO_ENTRY',
  'CRAFT_DEPLOY_ARTIFACT_NO_JAVASCRIPT',
  'CRAFT_DEPLOY_ARTIFACT_SOURCE_MAP',
  'CRAFT_DEPLOY_SSG_ROUTE_NOT_RENDERED',
] as const;

export type CraftDeploymentDiagnosticCode =
  (typeof CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES)[number];

/**
 * A single deployment problem. The shape mirrors the reference page: a reader
 * must find the concerned runtime or platform, the file, the cause and the
 * expected correction without opening the source of the checker.
 */
export type CraftDeploymentDiagnostic = Readonly<{
  code: CraftDeploymentDiagnosticCode;
  severity: CraftDeploymentSeverity;
  /** What is wrong, stated as a fact. */
  message: string;
  /** What the author has to change. */
  fix: string;
  /** Dotted path inside the manifest, e.g. `server.entry`. */
  path?: string;
  /** Path relative to the checked root. */
  file?: string;
  line?: number;
  runtime?: CraftDeploymentRuntime;
  platform?: CraftDeploymentPlatform;
  provider?: string;
}>;

export type CraftDeploymentDiagnosticDescription = Readonly<{
  code: CraftDeploymentDiagnosticCode;
  title: string;
  cause: string;
  fix: string;
}>;

/**
 * Documentation of every code the checker can emit. The reference page and
 * this table are verified against each other, so a new code cannot ship
 * undocumented.
 */
export const CRAFT_DEPLOYMENT_DIAGNOSTICS: Readonly<
  Record<CraftDeploymentDiagnosticCode, CraftDeploymentDiagnosticDescription>
> = Object.freeze({
  CRAFT_DEPLOY_CONFIG_NOT_FOUND: {
    code: 'CRAFT_DEPLOY_CONFIG_NOT_FOUND',
    title: 'No deployment manifest found',
    cause:
      'No `craft.deploy.ts`, `craft.deploy.mjs`, `craft.deploy.js` or `craft.deploy.json` was found in the checked directory.',
    fix: 'Create a manifest with `defineCraftDeployment` or point the CLI at one with `--config`.',
  },
  CRAFT_DEPLOY_CONFIG_LOAD_FAILED: {
    code: 'CRAFT_DEPLOY_CONFIG_LOAD_FAILED',
    title: 'The deployment manifest could not be imported',
    cause:
      'Loading the manifest threw, or the serialised manifest is not valid JSON. A TypeScript manifest also fails when the running Node cannot strip types and TypeScript is not installed.',
    fix: 'Fix the thrown error, or run the CLI under a TypeScript loader, or commit a `craft.deploy.json` produced by the build.',
  },
  CRAFT_DEPLOY_CONFIG_NO_DEFAULT_EXPORT: {
    code: 'CRAFT_DEPLOY_CONFIG_NO_DEFAULT_EXPORT',
    title: 'The deployment manifest has no default export',
    cause: 'The module loaded but exposes no default export to read.',
    fix: 'Add `export default defineCraftDeployment({ ... })`.',
  },
  CRAFT_DEPLOY_MANIFEST_NOT_AN_OBJECT: {
    code: 'CRAFT_DEPLOY_MANIFEST_NOT_AN_OBJECT',
    title: 'The manifest is not an object',
    cause: 'The default export or the parsed JSON is not a plain object.',
    fix: 'Export the object returned by `defineCraftDeployment`.',
  },
  CRAFT_DEPLOY_MANIFEST_MISSING_FIELD: {
    code: 'CRAFT_DEPLOY_MANIFEST_MISSING_FIELD',
    title: 'A required manifest field is missing',
    cause: 'A field the runtime or the providers need is absent.',
    fix: 'Add the field reported by `path`.',
  },
  CRAFT_DEPLOY_MANIFEST_INVALID_FIELD: {
    code: 'CRAFT_DEPLOY_MANIFEST_INVALID_FIELD',
    title: 'A manifest field has an invalid value',
    cause:
      'The field exists but its type or its shape does not match the contract.',
    fix: 'Correct the value reported by `path`; the message states what was expected.',
  },
  CRAFT_DEPLOY_MANIFEST_UNKNOWN_RUNTIME: {
    code: 'CRAFT_DEPLOY_MANIFEST_UNKNOWN_RUNTIME',
    title: 'Unknown runtime',
    cause: '`runtime` is not one of `static`, `node`, `worker` or `lambda`.',
    fix: 'Pick one of the four supported runtimes.',
  },
  CRAFT_DEPLOY_MANIFEST_UNKNOWN_PLATFORM: {
    code: 'CRAFT_DEPLOY_MANIFEST_UNKNOWN_PLATFORM',
    title: 'Unknown platform',
    cause: '`platform` is not part of the documented platform list.',
    fix: 'Pick a supported platform, or open an issue to add it to the matrix.',
  },
  CRAFT_DEPLOY_MANIFEST_SECTION_MISSING: {
    code: 'CRAFT_DEPLOY_MANIFEST_SECTION_MISSING',
    title: 'The runtime section is missing',
    cause:
      'Each runtime requires its own section: `static` and `client`, `server`, `worker` or `lambda`.',
    fix: 'Add the section the runtime requires.',
  },
  CRAFT_DEPLOY_MANIFEST_SECTION_UNEXPECTED: {
    code: 'CRAFT_DEPLOY_MANIFEST_SECTION_UNEXPECTED',
    title: 'A section does not belong to this runtime',
    cause:
      'A section of another runtime is present; nothing would ever execute it.',
    fix: 'Remove the section, or change the runtime to the one that uses it.',
  },
  CRAFT_DEPLOY_PROTOCOL_VERSION_UNSUPPORTED: {
    code: 'CRAFT_DEPLOY_PROTOCOL_VERSION_UNSUPPORTED',
    title: 'Unsupported manifest protocol version',
    cause:
      'The serialised manifest was produced by another version of the protocol.',
    fix: 'Rebuild the manifest with the current CraftTS tooling, or follow the migration notes.',
  },
  CRAFT_DEPLOY_RUNTIME_MISMATCH: {
    code: 'CRAFT_DEPLOY_RUNTIME_MISMATCH',
    title: 'The requested runtime is not the manifest runtime',
    cause: '`--runtime` was passed with a value the manifest does not declare.',
    fix: 'Drop the flag, or change `runtime` in the manifest.',
  },
  CRAFT_DEPLOY_PLATFORM_MISMATCH: {
    code: 'CRAFT_DEPLOY_PLATFORM_MISMATCH',
    title: 'The requested platform is not the manifest platform',
    cause:
      '`--platform` was passed with a value the manifest does not declare.',
    fix: 'Drop the flag, or change `platform` in the manifest.',
  },
  CRAFT_DEPLOY_RUNTIME_PLATFORM_INCOMPATIBLE: {
    code: 'CRAFT_DEPLOY_RUNTIME_PLATFORM_INCOMPATIBLE',
    title: 'This platform cannot execute this runtime',
    cause:
      'The platform has no execution shape for the declared runtime, for instance a `lambda` runtime on Cloudflare.',
    fix: 'Change the runtime or the platform; the compatibility matrix lists the supported pairs.',
  },
  CRAFT_DEPLOY_PROVIDER_UNKNOWN: {
    code: 'CRAFT_DEPLOY_PROVIDER_UNKNOWN',
    title: 'Unknown provider',
    cause: 'The provider name is absent from the capability matrix.',
    fix: 'Use a documented provider name, or register the provider before checking.',
  },
  CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING: {
    code: 'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING',
    title: 'The provider does not support this runtime',
    cause:
      'The capability required by the runtime, and by the static mode when relevant, is not offered by the provider.',
    fix: 'Choose a provider that declares the capability, or change the runtime or the static mode.',
  },
  CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED: {
    code: 'CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED',
    title: 'The provider does not target this platform',
    cause:
      'The provider cannot deploy to the platform declared by the manifest.',
    fix: 'Choose a provider that targets the platform, or change the platform.',
  },
  CRAFT_DEPLOY_PROVIDER_NOT_INSTALLED: {
    code: 'CRAFT_DEPLOY_PROVIDER_NOT_INSTALLED',
    title: 'The provider package is not installed',
    cause:
      'The CLI resolves a provider from `@craft-ts/deploy-<name>` at run time, and that package is absent from the project.',
    fix: 'Install the provider package, or point `--provider-module` at the module that exports it.',
  },
  CRAFT_DEPLOY_PROVIDER_INVALID_MODULE: {
    code: 'CRAFT_DEPLOY_PROVIDER_INVALID_MODULE',
    title: 'The provider package does not export a provider',
    cause:
      'The module loaded but exposes no `createCraftDeploymentProvider` factory.',
    fix: 'Export `createCraftDeploymentProvider(options?)` returning a `CraftDeploymentProvider`.',
  },
  CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING: {
    code: 'CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING',
    title: 'The provider has no credentials',
    cause:
      'A credential the platform requires is absent from the environment. The tooling never stores one, so it can only report the name it expected.',
    fix: 'Export the named variable in the shell or the CI secret store, then run the command again.',
  },
  CRAFT_DEPLOY_PROVIDER_STATE_UNAVAILABLE: {
    code: 'CRAFT_DEPLOY_PROVIDER_STATE_UNAVAILABLE',
    title: 'The provider state cannot be read',
    cause:
      'An infrastructure provider reconciles against a recorded state; without it, a deployment cannot tell a creation from an update.',
    fix: 'Make the state backend reachable, or initialise it for this stage before deploying.',
  },
  CRAFT_DEPLOY_PROVIDER_TOOLCHAIN_MISSING: {
    code: 'CRAFT_DEPLOY_PROVIDER_TOOLCHAIN_MISSING',
    title: 'A tool the provider drives is missing',
    cause:
      'The provider shells out to a CLI or imports a runtime package that is not installed.',
    fix: 'Install the reported tool, or choose a provider that does not need it.',
  },
  CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE: {
    code: 'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
    title: 'The provider has no resource for this part of the manifest',
    cause:
      'The runtime, the platform or a declared binding maps to nothing the provider knows how to create.',
    fix: 'Remove the declaration, or deploy that part with a provider that supports it.',
  },
  CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED: {
    code: 'CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED',
    title: 'A deployment was requested without confirmation',
    cause:
      '`craft-ts deploy` mutates an infrastructure, so it refuses to run until the plan has been approved explicitly.',
    fix: 'Review `craft-ts deploy preview`, then pass `--yes` to apply it.',
  },
  CRAFT_DEPLOY_PATH_MISSING: {
    code: 'CRAFT_DEPLOY_PATH_MISSING',
    title: 'A declared path does not exist',
    cause:
      'An entry point, an output directory or a configuration file declared by the manifest is absent from disk.',
    fix: 'Run the build that produces it, or correct the path in the manifest.',
  },
  CRAFT_DEPLOY_NODE_BUILTIN_IMPORT: {
    code: 'CRAFT_DEPLOY_NODE_BUILTIN_IMPORT',
    title: 'A Node built-in is imported by a Worker or Lambda entry',
    cause:
      'The module graph reachable from the entry imports a Node built-in such as `node:fs` or `node:http`, which a Worker runtime does not provide.',
    fix: 'Replace the built-in with a Web API, or move the code behind a platform adapter that the Worker entry does not import.',
  },
  CRAFT_DEPLOY_HEALTH_PATH_MISSING: {
    code: 'CRAFT_DEPLOY_HEALTH_PATH_MISSING',
    title: 'The health route is not served by the SSR entry',
    cause:
      'The path declared as `server.healthPath` was not found in the module graph of the SSR entry.',
    fix: 'Serve the declared path, or align the manifest with the path the server exposes.',
  },
  CRAFT_DEPLOY_READY_PATH_MISSING: {
    code: 'CRAFT_DEPLOY_READY_PATH_MISSING',
    title: 'The readiness route is not served by the SSR entry',
    cause:
      'The path declared as `server.readyPath` was not found in the module graph of the SSR entry.',
    fix: 'Serve the declared path, or align the manifest with the path the server exposes.',
  },
  CRAFT_DEPLOY_SSG_ROUTES_MISSING: {
    code: 'CRAFT_DEPLOY_SSG_ROUTES_MISSING',
    title: 'The SSG mode declares no route',
    cause:
      'A `ssg` deployment pre-renders one HTML file per route and the route list is empty.',
    fix: 'List the routes in `static.routes`, or switch the mode to `spa`.',
  },
  CRAFT_DEPLOY_SSG_ROUTE_NOT_STATIC: {
    code: 'CRAFT_DEPLOY_SSG_ROUTE_NOT_STATIC',
    title: 'An SSG route cannot be pre-rendered',
    cause:
      'The route is not an absolute literal path: it carries a `:param`, a wildcard or a query string, so no single HTML file represents it.',
    fix: 'Expand the route into its literal paths, or declare it in `static.serverRoutes`.',
  },
  CRAFT_DEPLOY_SPA_FALLBACK_MISSING: {
    code: 'CRAFT_DEPLOY_SPA_FALLBACK_MISSING',
    title: 'The SPA fallback document is missing from the client output',
    cause:
      'A `spa` deployment answers unknown paths with the fallback document, which is absent from the built output.',
    fix: 'Build the client, or correct `static.fallback`.',
  },
  CRAFT_DEPLOY_ENV_NAME_INVALID: {
    code: 'CRAFT_DEPLOY_ENV_NAME_INVALID',
    title: 'Invalid environment variable name',
    cause:
      'A declared name is not an upper snake case identifier, which several platforms reject.',
    fix: 'Rename the variable to `UPPER_SNAKE_CASE`.',
  },
  CRAFT_DEPLOY_ENV_VALUE_FORBIDDEN: {
    code: 'CRAFT_DEPLOY_ENV_VALUE_FORBIDDEN',
    title: 'An environment variable carries a value',
    cause:
      'The manifest is committed and read by every provider, so it declares names and requirements only.',
    fix: 'Remove the value and provide it through the CI or the provider secret store.',
  },
  CRAFT_DEPLOY_ENV_UNDECLARED: {
    code: 'CRAFT_DEPLOY_ENV_UNDECLARED',
    title: 'An environment variable is read but not declared',
    cause:
      'The module graph of the runtime entry reads a variable the manifest does not list, so no provider can know it must be set.',
    fix: 'Declare the variable in `env`, or stop reading it from the runtime entry.',
  },
  CRAFT_DEPLOY_FUNCTION_ID_DUPLICATE: {
    code: 'CRAFT_DEPLOY_FUNCTION_ID_DUPLICATE',
    title: 'A server-function identifier is declared twice',
    cause:
      'The identifier is the routing key of the protocol, so a duplicate makes the exposed contract ambiguous.',
    fix: 'Keep one declaration per identifier.',
  },
  CRAFT_DEPLOY_FUNCTION_ID_UNKNOWN: {
    code: 'CRAFT_DEPLOY_FUNCTION_ID_UNKNOWN',
    title: 'A declared server-function identifier is not in the registry entry',
    cause:
      'The identifier does not appear in the module graph of `functions.entry`.',
    fix: 'Register the function in the entry, or remove the identifier from the manifest.',
  },
  CRAFT_DEPLOY_ARTIFACT_MISSING: {
    code: 'CRAFT_DEPLOY_ARTIFACT_MISSING',
    title: 'The artefact directory does not exist',
    cause: 'The directory the provider would publish has not been produced.',
    fix: 'Run the declared build command before checking the artefact.',
  },
  CRAFT_DEPLOY_ARTIFACT_NO_ENTRY: {
    code: 'CRAFT_DEPLOY_ARTIFACT_NO_ENTRY',
    title: 'The artefact has no browser entry point',
    cause: 'The public directory contains no `index.html`.',
    fix: 'Check the build output directory declared in `client.outDir`.',
  },
  CRAFT_DEPLOY_ARTIFACT_NO_JAVASCRIPT: {
    code: 'CRAFT_DEPLOY_ARTIFACT_NO_JAVASCRIPT',
    title: 'The artefact contains no JavaScript',
    cause:
      'The public directory has no `.js` or `.mjs` file, which means the build produced nothing executable.',
    fix: 'Check the build command and its output directory.',
  },
  CRAFT_DEPLOY_ARTIFACT_SOURCE_MAP: {
    code: 'CRAFT_DEPLOY_ARTIFACT_SOURCE_MAP',
    title: 'The artefact ships source maps',
    cause:
      'The source map policy is `forbidden` and the public directory contains `.map` files.',
    fix: 'Disable source maps in the production build, or relax `artifact.sourceMaps`.',
  },
  CRAFT_DEPLOY_SSG_ROUTE_NOT_RENDERED: {
    code: 'CRAFT_DEPLOY_SSG_ROUTE_NOT_RENDERED',
    title: 'A declared SSG route has no pre-rendered document',
    cause:
      'The artefact contains neither `<route>.html` nor `<route>/index.html` for a route listed in `static.routes`.',
    fix: 'Run the pre-render step for that route, or remove it from `static.routes`.',
  },
});
