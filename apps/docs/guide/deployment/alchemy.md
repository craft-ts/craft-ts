# Alchemy provider

::: warning Experimental — validate in a non-production account first
This provider is the least validated part of the deployment tooling. The
presets, the plan, the credential checks and the refusal paths are covered by
tests through a runtime port, so what CraftTS _decides_ is verified.

What is **not** verified is the last hop: the adapter that invokes Alchemy's
current CLI has never run against a real Cloudflare or AWS account from this
repository. Treat your first deployment as the validation of that adapter —
run `deploy preview` first and read the plan.
:::

`@craft-ts/deploy-alchemy` deploys a CraftTS manifest to Cloudflare or AWS
through [Alchemy](https://alchemy.run). It is an optional package: Alchemy
never appears in the dependencies of a CraftTS application, and a project that
publishes a static artefact somewhere else never installs it.

Alchemy is a **provider of infrastructure**, not a runtime. It can create the
resources, the bindings, the permissions and the state, where a publication
provider only uploads an artefact. Both read the same manifest.

## Install

```bash
npm install --save-dev @craft-ts/deploy-alchemy alchemy
```

The CLI resolves `@craft-ts/deploy-<name>` from the project being deployed, so
nothing else has to be configured. A provider living elsewhere is pointed at
with `--provider-module`.

## Credentials

Credentials are read from the environment. The tooling checks that they are
set, never reads their value beyond that, and never writes one to disk.

| Platform     | Variables                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `cloudflare` | `CLOUDFLARE_API_TOKEN` (or `CLOUDFLARE_API_KEY`), `CLOUDFLARE_ACCOUNT_ID` (or `ALCHEMY_PROFILE`)        |
| `aws`        | `AWS_ACCESS_KEY_ID` (or `AWS_PROFILE`, `AWS_ROLE_ARN`), `AWS_REGION` (or `AWS_DEFAULT_REGION`)          |

Alchemy 2 uses its provider state store and profile configuration. The adapter
does not require the legacy `ALCHEMY_PASSWORD` variable.

## State and stages

Alchemy reconciles against a recorded state, which is what lets a preview tell
a creation from an update. Every resource name carries the application **and**
the stage:

```text
demo-production-worker
demo-preview-42-worker
```

A stage is passed with `--stage`; it defaults to the `environment` of the
manifest. Two stages never share a resource, so a preview deployment cannot
overwrite production.

## Preview before mutating

```bash
npx craft-ts deploy preview --provider alchemy --stage staging
```

```text
plan: alchemy → stage staging (2 resource(s))
  create    cloudflare:KV.Namespace demo-staging-sessions
    binding: SESSIONS
  update    cloudflare:Worker demo-staging-worker
    entrypoint: dist/apps/demo/worker.js
    assets: dist/apps/demo
  note: Alchemy 2.0.0-beta.76, stage `staging`.
Preview only: nothing was created, updated or deleted.
```

The preview opens Alchemy in its read phase, so it resolves the recorded state
and creates nothing. A resource Alchemy still records that the manifest no
longer declares appears as `delete`: hiding it would understate the change.

## Deploy

```bash
npx craft-ts deploy --provider alchemy --stage staging --yes
```

`deploy` runs, in order: the manifest check, the provider check (credentials,
artefacts, presets), then the same preview. It refuses to apply until `--yes`
approves the plan, and reports `CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED` otherwise.

Outputs are printed as `<resource>.<key>`, and the first `url` output becomes
the deployment URL:

```text
url: https://demo-staging.workers.dev
output demo-staging-sessions.id: 5f1c…
output demo-staging-worker.url: https://demo-staging.workers.dev
Deployed to stage `staging` with alchemy.
```

Use `--json` to get `{ applied, plan, result, diagnostics }` for a CI step.

## What each manifest becomes

| Manifest                 | Resources                                             |
| ------------------------ | ----------------------------------------------------- |
| `static` on `cloudflare` | `Website.StaticSite`                                  |
| `worker` on `cloudflare` | binding resources, then `Worker`                     |
| `static` on `aws`        | `Website.StaticSite`                                 |
| `lambda` on `aws`        | `Lambda.Function` with its built-in Function URL     |
| `node` on `aws`          | refused; use the Docker provider or an image preset  |

Bindings map to the resource their `type` names — `kv`, `r2`, `d1`, `queue`,
`durable_object`. A binding typed `secret` is never created: its value must
already exist in the Alchemy state or the environment, and the plan says so
instead of carrying it. Any other type is refused with
`CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE` rather than silently dropped.

The Function URL keeps the `{ id, input, context }` protocol of a
server-function, so the same function behaves as it does locally.

## Rollback

Alchemy has no "undo": a rollback is a deployment of the previous artefact.

1. Check out the commit whose artefact was healthy, or restore its
   `dist/<app>/craft-deployment-manifest.json`.
2. Rebuild it: the manifest is byte-identical for a given input, so a rebuild
   of the same commit produces the same declaration.
3. `npx craft-ts deploy preview --provider alchemy --stage <stage>` and read
   the plan: a rollback shows `update` on the resources that moved forward.
4. Apply it with `--yes`.

Two things do not roll back on their own and have to be handled explicitly: a
resource deleted by a finalize is recreated empty, and a stateful binding such
as a KV namespace or a bucket keeps the data written by the newer version.
Roll a stateful change back through the data, not through the deployment.

## What stays in CraftTS, what is delegated

CraftTS owns the manifest, the checks, the resolved artefact and the plan
shape. It decides _what_ has to exist, and it refuses to deploy a manifest that
does not pass `craft-ts check`.

Alchemy owns the resources, the state, the credentials handling and the
reconciliation. It decides _how_ what CraftTS declared comes to exist.

The adapter generates a temporary Alchemy 2 stack and invokes the installed
Alchemy CLI. `ALCHEMY_RESOURCE_EXPORTS` maps each planned resource type to the
current module and nested export used in that generated stack.

## Limits

- The adapter over the Alchemy API has never run against a live account, as
  stated at the top of this page.
- The Fargate fallback runs the artefact as a container: the image build stays
  outside CraftTS.
- Alchemy has no preset here for the platforms a publication provider already
  covers (`vercel`, `netlify`, `firebase`, `github-pages`).
