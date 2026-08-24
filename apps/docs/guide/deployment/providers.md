# Deployment providers

A provider is the integration that builds, publishes or provisions a platform.
It is never a runtime of CraftTS, and never a dependency of the application
bundle: the CLI owns the manifest and delegates every mutation to a provider
package installed separately.

A provider implements this contract:

```ts
export type CraftDeploymentProvider = {
  readonly name: string;
  readonly capabilities: readonly CraftDeploymentCapability[];
  check?(
    request: CraftDeploymentRequest,
  ): Promise<readonly CraftDeploymentDiagnostic[]>;
  preview(request: CraftDeploymentRequest): Promise<CraftDeploymentPlan>;
  deploy(request: CraftDeploymentRequest): Promise<CraftDeploymentResult>;
};

export type CraftDeploymentRequest = {
  readonly manifest: CraftDeploymentManifest;
  readonly rootDir: string;
  readonly stage: string;
};

export type CraftDeploymentCapability =
  | 'static-spa'
  | 'static-ssg'
  | 'node-ssr'
  | 'worker'
  | 'lambda'
  | 'infrastructure'
  | 'local-preview';
```

`check` reports instead of throwing, so its diagnostics join the ones of
`craft-ts check`. `preview` returns the plan rather than printing it, because
the plan is the approval surface: `craft-ts deploy` shows it and refuses to
apply anything until `--yes` approves it.

A provider package exports one factory, and the CLI resolves it at run time
from the project being deployed:

```ts
export function createCraftDeploymentProvider(
  options?: Record<string, unknown>,
): CraftDeploymentProvider;
```

Adding a provider therefore never means changing the CLI.

Two families share that contract without sharing an implementation. A
publication provider uploads an artefact. An infrastructure provider also
creates the resources, the bindings, the permissions and the state. Both read
the same manifest.

## Capability matrix

| Provider           | static-spa | static-ssg | node-ssr | worker | lambda | infrastructure | local-preview | Platforms           |
| ------------------ | ---------- | ---------- | -------- | ------ | ------ | -------------- | ------------- | ------------------- |
| `alchemy`          | yes        | yes        | yes      | yes    | yes    | yes            | yes           | `cloudflare`, `aws` |
| `docker`           | no         | no         | yes      | no     | no     | no             | yes           | `docker`, `node`    |
| `cloudflare-pages` | yes        | yes        | no       | no     | no     | no             | no            | `cloudflare`        |
| `vercel`           | yes        | yes        | yes      | no     | no     | no             | yes           | `vercel`            |
| `netlify`          | yes        | yes        | yes      | no     | yes    | no             | no            | `netlify`           |
| `firebase`         | yes        | yes        | yes      | no     | yes    | no             | no            | `firebase`          |
| `github-pages`     | yes        | yes        | no       | no     | no     | no             | no            | `github-pages`      |

`craft-ts check --provider <name>` refuses a manifest whose runtime — and, for
the `static` runtime, whose mode — is not covered by the provider, and refuses
a provider that does not target the declared platform.

Print the same matrix from the CLI:

```bash
npx craft-ts providers --json
```

## Runtime and platform compatibility

A pair absent from this table is not a missing integration: nothing on that
platform executes that shape.

| Runtime  | Platforms                                                                              |
| -------- | -------------------------------------------------------------------------------------- |
| `static` | `node`, `docker`, `cloudflare`, `aws`, `vercel`, `netlify`, `firebase`, `github-pages` |
| `node`   | `node`, `docker`, `aws`, `vercel`, `netlify`, `firebase`                               |
| `worker` | `cloudflare`                                                                           |
| `lambda` | `aws`, `netlify`, `firebase`                                                           |

## Provider details

### `alchemy`

- **Artefact** — Public directory plus the runtime entry declared by the manifest.
- **Local preview** — `craft-ts deploy preview --provider alchemy`
- **Credentials** — Cloudflare or AWS credentials read from the environment by the Alchemy CLI.
- **Limit** — Requires the Alchemy CLI and a reachable state backend.
- **Limit** — Shipped as the separate package `@craft-ts/deploy-alchemy`.

### `docker`

- **Artefact** — Image built from the SSR entry and the client output.
- **Local preview** — `docker compose -f docker-compose.production.yml up`
- **Credentials** — Registry credentials handled by the Docker CLI.
- **Limit** — No static-only publication path: a plain bucket is cheaper.
- **Limit** — Provisioning of the host is out of scope.

### `cloudflare-pages`

- **Artefact** — Public directory uploaded as-is.
- **Local preview** — `wrangler pages dev <publicDir>`
- **Credentials** — `CLOUDFLARE_API_TOKEN` read by Wrangler.
- **Limit** — SSR and Worker runtimes need a Worker deployment, not Pages.

### `vercel`

- **Artefact** — Public directory plus an optional Node server entry.
- **Local preview** — `vercel dev`
- **Credentials** — `VERCEL_TOKEN` read by the Vercel CLI.
- **Limit** — Worker and Lambda runtimes map to platform-specific functions and are not covered by this matrix.
- **Limit** — Infrastructure provisioning is partial and platform-owned.

### `netlify`

- **Artefact** — Public directory plus a functions directory.
- **Local preview** — `netlify dev`
- **Credentials** — `NETLIFY_AUTH_TOKEN` read by the Netlify CLI.
- **Limit** — The Lambda capability is served by Netlify Functions, not by AWS Function URLs.
- **Limit** — No infrastructure provisioning.

### `firebase`

- **Artefact** — Hosting public directory plus Cloud Functions.
- **Local preview** — `firebase emulators:start`
- **Credentials** — Firebase CLI login or a service account key.
- **Limit** — No Worker runtime.
- **Limit** — Infrastructure provisioning is partial and project-scoped.

### `github-pages`

- **Artefact** — Public directory published as a Pages artefact.
- **Local preview** — none
- **Credentials** — The `GITHUB_TOKEN` of the publishing workflow.
- **Limit** — No server runtime at all.
- **Limit** — SPA fallback requires a `404.html` copy of the fallback document.

## Using a provider

```bash
npx craft-ts deploy preview --provider alchemy --stage staging
npx craft-ts deploy --provider alchemy --stage staging --yes
```

`deploy` runs the manifest check, the provider check and the preview before it
applies anything, and stops with `CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED` when the
plan has not been approved. Capabilities are verified against the provider that
was actually loaded, not against this table, so a project can deploy with a
provider CraftTS does not ship.

## Status

The matrix above is documentation, not a list of shipped integrations. One
implementation ships today: [Alchemy](./alchemy.md), as the separate package
`@craft-ts/deploy-alchemy`, so Alchemy never appears in the dependencies of the
CraftTS runtime. The other entries describe integrations a project can write
against the same contract.
