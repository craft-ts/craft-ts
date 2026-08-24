# @craft-ts/cli

Deployment CLI of CraftTS.

```bash
npx craft-ts check --provider docker
npx craft-ts manifest --out dist/apps/demo-ssr/craft-deployment-manifest.json
npx craft-ts providers
```

`check` validates the manifest, the declared paths, the runtime/platform pair,
the provider capabilities and the module graph of the runtime entry — before
any build has run. `manifest` resolves the manifest to the provider-neutral
artefact form. `providers` prints the capability matrix.

The CLI never creates a secret and never mutates an infrastructure: publishing
and provisioning belong to a provider package.
