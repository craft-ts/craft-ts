# Deploying a CraftTS application

::: warning Experimental
The deployment tooling is the newest part of CraftTS and it is **not settled**.
What is written here works and is covered by tests, but the CLI surface, the
manifest fields and the diagnostic codes can still change between minor
versions. Pin the version if you build a pipeline on it.

Concretely, as of today: `craft-ts check`, `manifest`, `providers`,
`deploy preview` and `deploy` exist; `init`, `build` and `deploy init` do not
yet. One provider implementation ships, [Alchemy](./alchemy.md), and no real
deployment has been run from the CraftTS repository itself.
:::

A CraftTS application describes its deployment once, in a typed manifest, and
that description is enough to check it, to build it and to hand it to a
provider. Nothing in the manifest names a hosting company, so moving from a
container to a Worker, or from one publisher to another, does not touch the
server-functions or the routes.

## Three notions that never merge

| Notion       | Question it answers                                   | Values                                                                                   |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **runtime**  | What execution shape does the bundle take?            | `static`, `node`, `worker`, `lambda`                                                     |
| **platform** | Which technical platform executes that shape?         | `node`, `docker`, `cloudflare`, `aws`, `vercel`, `netlify`, `firebase`, `github-pages`   |
| **provider** | Which integration builds, publishes or provisions it? | `alchemy`, `docker`, `cloudflare-pages`, `vercel`, `netlify`, `firebase`, `github-pages` |

Alchemy is a provider of infrastructure, not a runtime. Cloudflare Pages is a
provider of publication for the same artefact. Both read the same manifest.

The `static` runtime carries a mode:

- **`spa`** — one document, and unknown paths fall back to it. The route table
  lives in the browser.
- **`ssg`** — one pre-rendered document per route. The route list is part of the
  contract, and any route that cannot be reduced to a single document has to be
  declared as needing a server runtime.

## The manifest

```ts
import { defineCraftDeployment } from '@craft-ts/deploy';

export default defineCraftDeployment({
  name: 'demo-ssr',
  runtime: 'node',
  platform: 'docker',
  server: {
    entry: 'dist/apps/demo-ssr/server/server.js',
    source: 'apps/demo-ssr/src/production-server.ts',
    healthPath: '/health',
    readyPath: '/ready',
  },
});
```

The runtime discriminates the type: a `worker` manifest cannot carry an SSR
entry, and a `node` manifest cannot omit its health and readiness routes. See
the [manifest reference](./manifest.md) for every field.

## The commands

```bash
npx craft-ts check --provider docker
npx craft-ts manifest --out dist/apps/demo-ssr/craft-deployment-manifest.json
npx craft-ts providers
npx craft-ts deploy preview --provider alchemy --stage staging
npx craft-ts deploy --provider alchemy --stage staging --yes
```

`check` runs before the build. It resolves the manifest, then verifies the
declared paths, the runtime/platform pair, the capabilities of the chosen
provider and the module graph of the runtime entry — a Node built-in reachable
from a Worker entry, an SSR entry that never serves its own health route, an
environment variable read but never declared. Add `--artifact` after the build
to inspect the directory a provider would actually upload.

Every path in the manifest is relative to the directory `check` runs from,
which is `--root` when given and the current directory otherwise. In a
monorepo, run the commands from the workspace root and point `--config` at the
application:

```bash
npx craft-ts check --config apps/demo-ssr/craft.deploy.ts --provider docker
```

`manifest` resolves the manifest to its artefact form: every default applied,
keys sorted, protocol version stamped. Two builds of the same input produce a
byte-identical file, which is what makes
`dist/<app>/craft-deployment-manifest.json` an immutable artefact.

`providers` prints the [capability matrix](./providers.md). A provider listed
there is documented; the integration that deploys it is installed separately.

`deploy preview` and `deploy` hand the checked manifest to that integration.
The CLI resolves `@craft-ts/deploy-<name>` from the project at run time, so it
depends on no provider itself. `preview` never mutates anything, and `deploy`
runs the same checks and the same preview before it applies, refusing until
`--yes` approves the plan. [Alchemy](./alchemy.md) is the provider that ships
today.

## What the tooling never does

- It never writes a secret. The manifest declares the _names_ of the
  environment variables and whether they are required; a declared value is a
  reported error.
- It never mutates an infrastructure by itself. Publishing and provisioning
  belong to a provider package, and applying a plan always needs `--yes`.
- It never replaces the build. `check` reads what the build declares and what
  it produced; Vite, Nx and the application scripts stay in charge.

## Where to go next

- [Manifest reference](./manifest.md) — every field, every default.
- [Diagnostics](./diagnostics.md) — every code, its cause and its fix.
- [Providers](./providers.md) — the capability matrix and the limits of each
  entry.
- [Alchemy provider](./alchemy.md) — credentials, state, stages, outputs and
  rollback for the infrastructure provider.
