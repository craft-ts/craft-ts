# @craft-ts/deploy-alchemy

Optional Alchemy provider for CraftTS deployments.

> **Experimental — never run against a live account.** The presets, the plan,
> the credential checks and the refusal paths are covered by tests through a
> runtime port. The adapter that calls Alchemy itself has never run against a
> real Cloudflare or AWS account from the CraftTS repository: treat your first
> deployment as its validation, and run `deploy preview` first.

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

| Manifest                 | Resources                                          |
| ------------------------ | -------------------------------------------------- |
| `static` on `cloudflare` | `StaticSite`                                       |
| `worker` on `cloudflare` | the bound `KVNamespace`/`R2Bucket`/… then `Worker` |
| `static` on `aws`        | `Bucket` behind a `CloudFrontDistribution`         |
| `lambda` on `aws`        | `Function` plus its `FunctionUrl`                  |
| `node` on `aws`          | Fargate `Cluster` and `Service`                    |

Credentials are read from the environment and never written anywhere:
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or `AWS_ACCESS_KEY_ID` and
`AWS_REGION`, plus `ALCHEMY_PASSWORD` for the state.

See the [Alchemy provider guide](../../apps/docs/guide/deployment/alchemy.md)
for the state, the stages, the outputs and the rollback procedure.
