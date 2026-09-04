# @craft-ts/deploy-alchemy

Optional Alchemy provider for CraftTS deployments.

> **Experimental — validate in a non-production account first.** The provider
> now targets Alchemy 2 (`2.0.0-beta.76`) and delegates the final deployment to
> Alchemy's current CLI. The live Cloudflare/AWS hop is still not covered by
> this repository's tests, so run `deploy preview` first.

It consumes the manifest produced by `@craft-ts/deploy` and turns it into
Cloudflare or AWS resources. It never rebuilds routes, contracts or layers, and
it is never a dependency of a CraftTS application bundle.

```bash
npm install --save-dev @craft-ts/deploy-alchemy alchemy
npx craft-ts deploy preview --provider alchemy --stage staging
npx craft-ts deploy --provider alchemy --stage staging --yes
```

`preview` opens Alchemy in its read phase: it lists what would be created,
updated or deleted and provably mutates nothing. `deploy` runs the same checks
and the same preview, then refuses to apply until `--yes` approves the plan.

| Manifest                 | Resources                                            |
| ------------------------ | ---------------------------------------------------- |
| `static` on `cloudflare` | `Website.StaticSite`                                  |
| `worker` on `cloudflare` | `KV.Namespace`/`R2.Bucket`/… then `Worker`            |
| `static` on `aws`        | `Website.StaticSite`                                 |
| `lambda` on `aws`        | `Lambda.Function` with its built-in Function URL     |
| `node` on `aws`          | refused; use the Docker provider or an image preset  |

Credentials are read from the environment and never written anywhere:
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (or `ALCHEMY_PROFILE`), or
`AWS_ACCESS_KEY_ID`/`AWS_REGION` (or `AWS_PROFILE`). Alchemy 2 manages its state
through the configured provider state store; the legacy `ALCHEMY_PASSWORD` is
not required by this adapter.

See the [Alchemy provider guide](../../apps/docs/guide/deployment/alchemy.md)
for the state, the stages, the outputs and the rollback procedure.
