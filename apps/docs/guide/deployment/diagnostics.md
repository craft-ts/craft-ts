# Deployment diagnostics

::: warning Experimental
Codes can be added, and their messages can change, between minor versions. Do
not match on a message in a CI script: match on the `code` field of the `--json`
report, which is the part meant to be stable.
:::

Every problem `craft-ts check` reports carries a code, the concerned runtime or
platform, a location, what is wrong and what to change. This page is the
reference for the codes; it is verified against the checker, so a code cannot
ship undocumented.

`error` fails the check and the command exits with `1`. `warning` is printed
and the command still succeeds — warnings cover the heuristics, such as
scanning sources for environment variable reads, where a false positive must
not block a deployment.

Read a report with `--json` when a machine consumes it:

```bash
npx craft-ts check --config apps/demo-ssr/craft.deploy.ts --json
```

## Codes

### `CRAFT_DEPLOY_ARTIFACT_MISSING`

The artefact directory does not exist.

- **Cause** — The directory the provider would publish has not been produced.
- **Fix** — Run the declared build command before checking the artefact.

### `CRAFT_DEPLOY_ARTIFACT_NO_ENTRY`

The artefact has no browser entry point.

- **Cause** — The public directory contains no `index.html`.
- **Fix** — Check the build output directory declared in `client.outDir`.

### `CRAFT_DEPLOY_ARTIFACT_NO_JAVASCRIPT`

The artefact contains no JavaScript.

- **Cause** — The public directory has no `.js` or `.mjs` file, which means the build produced nothing executable.
- **Fix** — Check the build command and its output directory.

### `CRAFT_DEPLOY_ARTIFACT_SOURCE_MAP`

The artefact ships source maps.

- **Cause** — The source map policy is `forbidden` and the public directory contains `.map` files.
- **Fix** — Disable source maps in the production build, or relax `artifact.sourceMaps`.

### `CRAFT_DEPLOY_CONFIG_LOAD_FAILED`

The deployment manifest could not be imported.

- **Cause** — Loading the manifest threw, or the serialised manifest is not valid JSON. A TypeScript manifest also fails when the running Node cannot strip types and TypeScript is not installed.
- **Fix** — Fix the thrown error, or run the CLI under a TypeScript loader, or commit a `craft.deploy.json` produced by the build.

### `CRAFT_DEPLOY_CONFIG_NOT_FOUND`

No deployment manifest found.

- **Cause** — No `craft.deploy.ts`, `craft.deploy.mjs`, `craft.deploy.js` or `craft.deploy.json` was found in the checked directory.
- **Fix** — Create a manifest with `defineCraftDeployment` or point the CLI at one with `--config`.

### `CRAFT_DEPLOY_CONFIG_NO_DEFAULT_EXPORT`

The deployment manifest has no default export.

- **Cause** — The module loaded but exposes no default export to read.
- **Fix** — Add `export default defineCraftDeployment({ ... })`.

### `CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED`

A deployment was requested without confirmation.

- **Cause** — `craft-ts deploy` mutates an infrastructure, so it refuses to run until the plan has been approved explicitly.
- **Fix** — Review `craft-ts deploy preview`, then pass `--yes` to apply it.

### `CRAFT_DEPLOY_ENV_NAME_INVALID`

Invalid environment variable name.

- **Cause** — A declared name is not an upper snake case identifier, which several platforms reject.
- **Fix** — Rename the variable to `UPPER_SNAKE_CASE`.

### `CRAFT_DEPLOY_ENV_UNDECLARED`

An environment variable is read but not declared.

- **Cause** — The module graph of the runtime entry reads a variable the manifest does not list, so no provider can know it must be set.
- **Fix** — Declare the variable in `env`, or stop reading it from the runtime entry.

### `CRAFT_DEPLOY_ENV_VALUE_FORBIDDEN`

An environment variable carries a value.

- **Cause** — The manifest is committed and read by every provider, so it declares names and requirements only.
- **Fix** — Remove the value and provide it through the CI or the provider secret store.

### `CRAFT_DEPLOY_FUNCTION_ID_DUPLICATE`

A server-function identifier is declared twice.

- **Cause** — The identifier is the routing key of the protocol, so a duplicate makes the exposed contract ambiguous.
- **Fix** — Keep one declaration per identifier.

### `CRAFT_DEPLOY_FUNCTION_ID_UNKNOWN`

A declared server-function identifier is not in the registry entry.

- **Cause** — The identifier does not appear in the module graph of `functions.entry`.
- **Fix** — Register the function in the entry, or remove the identifier from the manifest.

### `CRAFT_DEPLOY_HEALTH_PATH_MISSING`

The health route is not served by the SSR entry.

- **Cause** — The path declared as `server.healthPath` was not found in the module graph of the SSR entry.
- **Fix** — Serve the declared path, or align the manifest with the path the server exposes.

### `CRAFT_DEPLOY_MANIFEST_INVALID_FIELD`

A manifest field has an invalid value.

- **Cause** — The field exists but its type or its shape does not match the contract.
- **Fix** — Correct the value reported by `path`; the message states what was expected.

### `CRAFT_DEPLOY_MANIFEST_MISSING_FIELD`

A required manifest field is missing.

- **Cause** — A field the runtime or the providers need is absent.
- **Fix** — Add the field reported by `path`.

### `CRAFT_DEPLOY_MANIFEST_NOT_AN_OBJECT`

The manifest is not an object.

- **Cause** — The default export or the parsed JSON is not a plain object.
- **Fix** — Export the object returned by `defineCraftDeployment`.

### `CRAFT_DEPLOY_MANIFEST_SECTION_MISSING`

The runtime section is missing.

- **Cause** — Each runtime requires its own section: `static` and `client`, `server`, `worker` or `lambda`.
- **Fix** — Add the section the runtime requires.

### `CRAFT_DEPLOY_MANIFEST_SECTION_UNEXPECTED`

A section does not belong to this runtime.

- **Cause** — A section of another runtime is present; nothing would ever execute it.
- **Fix** — Remove the section, or change the runtime to the one that uses it.

### `CRAFT_DEPLOY_MANIFEST_UNKNOWN_PLATFORM`

Unknown platform.

- **Cause** — `platform` is not part of the documented platform list.
- **Fix** — Pick a supported platform, or open an issue to add it to the matrix.

### `CRAFT_DEPLOY_MANIFEST_UNKNOWN_RUNTIME`

Unknown runtime.

- **Cause** — `runtime` is not one of `static`, `node`, `worker` or `lambda`.
- **Fix** — Pick one of the four supported runtimes.

### `CRAFT_DEPLOY_NODE_BUILTIN_IMPORT`

A Node built-in is imported by a Worker or Lambda entry.

- **Cause** — The module graph reachable from the entry imports a Node built-in such as `node:fs` or `node:http`, which a Worker runtime does not provide.
- **Fix** — Replace the built-in with a Web API, or move the code behind a platform adapter that the Worker entry does not import.

### `CRAFT_DEPLOY_PATH_MISSING`

A declared path does not exist.

- **Cause** — An entry point, an output directory or a configuration file declared by the manifest is absent from disk.
- **Fix** — Run the build that produces it, or correct the path in the manifest.

### `CRAFT_DEPLOY_PLATFORM_MISMATCH`

The requested platform is not the manifest platform.

- **Cause** — `--platform` was passed with a value the manifest does not declare.
- **Fix** — Drop the flag, or change `platform` in the manifest.

### `CRAFT_DEPLOY_PROTOCOL_VERSION_UNSUPPORTED`

Unsupported manifest protocol version.

- **Cause** — The serialised manifest was produced by another version of the protocol.
- **Fix** — Rebuild the manifest with the current CraftTS tooling, or follow the migration notes.

### `CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING`

The provider does not support this runtime.

- **Cause** — The capability required by the runtime, and by the static mode when relevant, is not offered by the provider.
- **Fix** — Choose a provider that declares the capability, or change the runtime or the static mode.

### `CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING`

The provider has no credentials.

- **Cause** — A credential the platform requires is absent from the environment. The tooling never stores one, so it can only report the name it expected.
- **Fix** — Export the named variable in the shell or the CI secret store, then run the command again.

### `CRAFT_DEPLOY_PROVIDER_INVALID_MODULE`

The provider package does not export a provider.

- **Cause** — The module loaded but exposes no `createCraftDeploymentProvider` factory.
- **Fix** — Export `createCraftDeploymentProvider(options?)` returning a `CraftDeploymentProvider`.

### `CRAFT_DEPLOY_PROVIDER_NOT_INSTALLED`

The provider package is not installed.

- **Cause** — The CLI resolves a provider from `@craft-ts/deploy-<name>` at run time, and that package is absent from the project.
- **Fix** — Install the provider package, or point `--provider-module` at the module that exports it.

### `CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED`

The provider does not target this platform.

- **Cause** — The provider cannot deploy to the platform declared by the manifest.
- **Fix** — Choose a provider that targets the platform, or change the platform.

### `CRAFT_DEPLOY_PROVIDER_STATE_UNAVAILABLE`

The provider state cannot be read.

- **Cause** — An infrastructure provider reconciles against a recorded state; without it, a deployment cannot tell a creation from an update.
- **Fix** — Make the state backend reachable, or initialise it for this stage before deploying.

### `CRAFT_DEPLOY_PROVIDER_TOOLCHAIN_MISSING`

A tool the provider drives is missing.

- **Cause** — The provider shells out to a CLI or imports a runtime package that is not installed.
- **Fix** — Install the reported tool, or choose a provider that does not need it.

### `CRAFT_DEPLOY_PROVIDER_UNKNOWN`

Unknown provider.

- **Cause** — The provider name is absent from the capability matrix.
- **Fix** — Use a documented provider name, or register the provider before checking.

### `CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE`

The provider has no resource for this part of the manifest.

- **Cause** — The runtime, the platform or a declared binding maps to nothing the provider knows how to create.
- **Fix** — Remove the declaration, or deploy that part with a provider that supports it.

### `CRAFT_DEPLOY_READY_PATH_MISSING`

The readiness route is not served by the SSR entry.

- **Cause** — The path declared as `server.readyPath` was not found in the module graph of the SSR entry.
- **Fix** — Serve the declared path, or align the manifest with the path the server exposes.

### `CRAFT_DEPLOY_RUNTIME_MISMATCH`

The requested runtime is not the manifest runtime.

- **Cause** — `--runtime` was passed with a value the manifest does not declare.
- **Fix** — Drop the flag, or change `runtime` in the manifest.

### `CRAFT_DEPLOY_RUNTIME_PLATFORM_INCOMPATIBLE`

This platform cannot execute this runtime.

- **Cause** — The platform has no execution shape for the declared runtime, for instance a `lambda` runtime on Cloudflare.
- **Fix** — Change the runtime or the platform; the compatibility matrix lists the supported pairs.

### `CRAFT_DEPLOY_SPA_FALLBACK_MISSING`

The SPA fallback document is missing from the client output.

- **Cause** — A `spa` deployment answers unknown paths with the fallback document, which is absent from the built output.
- **Fix** — Build the client, or correct `static.fallback`.

### `CRAFT_DEPLOY_SSG_ROUTES_MISSING`

The SSG mode declares no route.

- **Cause** — A `ssg` deployment pre-renders one HTML file per route and the route list is empty.
- **Fix** — List the routes in `static.routes`, or switch the mode to `spa`.

### `CRAFT_DEPLOY_SSG_ROUTE_NOT_RENDERED`

A declared SSG route has no pre-rendered document.

- **Cause** — The artefact contains neither `<route>.html` nor `<route>/index.html` for a route listed in `static.routes`.
- **Fix** — Run the pre-render step for that route, or remove it from `static.routes`.

### `CRAFT_DEPLOY_SSG_ROUTE_NOT_STATIC`

An SSG route cannot be pre-rendered.

- **Cause** — The route is not an absolute literal path: it carries a `:param`, a wildcard or a query string, so no single HTML file represents it.
- **Fix** — Expand the route into its literal paths, or declare it in `static.serverRoutes`.
