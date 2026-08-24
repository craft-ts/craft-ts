# @craft-ts/deploy

Provider-neutral deployment contract for CraftTS applications.

> **Experimental.** Manifest fields, diagnostic codes and the provider contract
> can still change between minor versions. The serialised manifest carries
> `protocolVersion: '1'`, and one produced by another protocol is refused rather
> than reinterpreted, so a change breaks loudly at the check. Pin the version if
> you build a pipeline on it.

The package holds the typed manifest an application writes in
`craft.deploy.ts`, the checks that run before a build, and the capability
matrix of the deployment providers. It never deploys anything: publishing and
provisioning belong to a provider package.

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

Three notions stay distinct everywhere:

| Notion     | Question it answers                              | Examples                             |
| ---------- | ------------------------------------------------ | ------------------------------------ |
| `runtime`  | What shape does the bundle execute in?           | `static`, `node`, `worker`, `lambda` |
| `platform` | Which technical platform runs it?                | `cloudflare`, `aws`, `docker`        |
| provider   | Which integration builds, publishes, provisions? | `alchemy`, `vercel`, `docker`        |

See the [deployment guide](../../apps/docs/guide/deployment/index.md) for the
manifest reference, the diagnostics and the provider matrix.
