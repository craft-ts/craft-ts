# Manifest reference

::: warning Experimental
Manifest fields can still be added, renamed or removed between minor versions.
The serialised form carries `protocolVersion: '1'`, and a manifest produced by
another protocol is refused rather than reinterpreted — so a change here breaks
loudly, at the check, and comes with migration notes.
:::

The manifest is what an application writes in `craft.deploy.ts`. It describes
only the facts a build and a deployment need, and it stays provider-neutral:
the provider is chosen when deploying, never to produce the artefact.

Accepted file names, in priority order: `craft.deploy.ts`, `craft.deploy.mts`,
`craft.deploy.mjs`, `craft.deploy.js`, `craft.deploy.json`.

## Common fields

| Field         | Required | Default      | Meaning                                                   |
| ------------- | -------- | ------------ | --------------------------------------------------------- |
| `name`        | yes      | —            | Name of the deployment.                                   |
| `environment` | no       | `production` | Target environment, e.g. `staging`.                       |
| `runtime`     | yes      | —            | `static`, `node`, `worker` or `lambda`.                   |
| `platform`    | yes      | —            | Technical platform executing that runtime.                |
| `client`      | depends  | —            | Browser build command and output directory.               |
| `functions`   | no       | —            | Server-functions exposed by the deployment.               |
| `env`         | no       | `[]`         | Environment variables expected, **without their values**. |
| `artifact`    | no       | derived      | What a provider ships, and the source map policy.         |

`client` is required for the `static` runtime and optional for the others.

## Runtime sections

The runtime discriminates which section is mandatory, at the type level and at
the validation level. A section belonging to another runtime is refused:
nothing would ever execute it.

### `static`

```ts
static: {
  mode: 'spa' | 'ssg',
  fallback?: string,          // spa, default `index.html`
  routes?: readonly string[], // ssg, the routes to pre-render
  serverRoutes?: readonly string[],
}
```

In `ssg` mode the route list is mandatory and every route must reduce to a
single document: `/`, `/about`, `/blog/2026` are pre-renderable, `/users/:id`
and `/blog/*` are not. Routes that need a server runtime go in `serverRoutes`,
which documents the boundary instead of hiding it.

A route is considered rendered when the artefact holds either `<route>.html`
or `<route>/index.html`.

### `server` — the `node` runtime

```ts
server: {
  entry: string,        // SSR entry produced by the build
  source?: string,      // module producing `entry`
  build?: string,
  start?: string,
  healthPath: string,   // absolute path, e.g. `/health`
  readyPath: string,    // absolute path, e.g. `/ready`
}
```

`healthPath` and `readyPath` are mandatory because an SSR deployment without a
readiness signal cannot be rolled out safely.

`source` is what makes `craft-ts check` useful _before_ a build: the checker
reads the module graph of the source, not of an output that does not exist yet.

### `worker` — the `worker` runtime

```ts
worker: {
  entry: string,        // module exporting `fetch(request, env, ctx)`
  source?: string,
  build?: string,
  bindings?: readonly { name: string; type: string; description?: string }[],
}
```

Bindings are declared, never valued. `createCraftWorkerFetch` makes the HTTP
application and the server-functions portable; it does not make an SSR entry
that reaches for `node:http` or `node:fs` portable, which is exactly what the
Node built-in check catches.

### `lambda` — the `lambda` runtime

```ts
lambda: {
  entry: string,        // Function URL handler
  source?: string,
  build?: string,
  permissions?: readonly string[],
}
```

## `functions`

```ts
functions: {
  entry: string,               // module building the server-function registry
  basePath?: string,           // default `/api`
  ids?: readonly string[],     // identifiers exposed to clients
}
```

The identifier is the routing key of the protocol, so a duplicate is refused.
An identifier that never appears in the module graph of `entry` is reported as
a warning.

## `env`

```ts
env: [
  {
    name: 'PORT',
    required: false,
    description: 'TCP port the server listens on.',
  },
];
```

Names are upper snake case. A `value` or a `default` is refused: the manifest
is committed and read by every provider, so it carries the contract, not the
secret. Variables read by the runtime entry but absent from this list are
reported as warnings.

## `artifact`

```ts
artifact: {
  publicDir?: string,          // default: client.outDir
  serverEntry?: string,        // default: the runtime entry
  start?: string,              // default: server.start
  configFiles?: readonly string[],
  sourceMaps?: 'forbidden' | 'external' | 'allowed', // default: forbidden
}
```

The default source map policy is `forbidden`: shipping the maps of a production
bundle publishes the sources, so an application has to opt out explicitly.

## The resolved manifest

`craft-ts manifest` applies every default and stamps the protocol version:

```bash
npx craft-ts manifest --config apps/demo-ssr/craft.deploy.ts \
  --out dist/apps/demo-ssr/craft-deployment-manifest.json
```

The output has sorted keys, so two builds of the same input are byte-identical
and a diff is reviewable. `protocolVersion` is `1`; a manifest produced by
another protocol is refused rather than reinterpreted.

## A complete example

The SSR demonstrator of this repository, `apps/demo-ssr/craft.deploy.ts`,
checked on every production run:

```ts
import { defineCraftDeployment } from '@craft-ts/deploy';

/**
 * Deployment of the SSR demo.
 *
 * Every path is relative to the workspace root, which is the directory
 * `craft-ts check` runs from. The manifest stays provider-neutral: it says
 * what the artefact is, never who publishes it.
 */
export default defineCraftDeployment({
  name: 'demo-ssr',
  environment: 'production',
  runtime: 'node',
  platform: 'docker',
  client: {
    build: 'nx run demo-ssr:build:production',
    outDir: 'dist/apps/demo-ssr',
  },
  server: {
    build: 'nx run demo-ssr:build:production',
    entry: 'dist/apps/demo-ssr/server/server.js',
    // The build output only exists after a build; declaring the source lets
    // `craft-ts check` read the real module graph before that.
    source: 'apps/demo-ssr/src/production-server.ts',
    start: 'node dist/apps/demo-ssr/server/server.js',
    healthPath: '/health',
    readyPath: '/ready',
  },
  functions: {
    entry: 'apps/demo-with-server-function/src/server/server.ts',
    basePath: '/api',
    ids: [
      'demo.products.list',
      'demo.users.list',
      'demo.users.authenticated-list',
      'demo.users.portable-list',
      'demo.users.effect-middleware-list',
    ],
  },
  env: [
    {
      name: 'HOST',
      required: false,
      description: 'Interface the server binds to.',
    },
    {
      name: 'PORT',
      required: false,
      description: 'TCP port the server listens on.',
    },
    {
      name: 'GRACEFUL_SHUTDOWN_TIMEOUT_MS',
      required: false,
      description: 'Delay granted to in-flight requests on SIGTERM.',
    },
    {
      name: 'RATE_LIMIT_MAX',
      required: false,
      description: 'Requests allowed per window on API routes.',
    },
    {
      name: 'RATE_LIMIT_WINDOW_MS',
      required: false,
      description: 'Length of the rate limiting window.',
    },
    {
      name: 'FORCE_HTTPS',
      required: false,
      description: 'Treat requests as HTTPS behind a trusted proxy.',
    },
    {
      name: 'CORS_ORIGINS',
      required: false,
      description: 'Comma-separated list of allowed origins.',
    },
    {
      name: 'TRUSTED_HOSTS',
      required: false,
      description: 'Comma-separated list of accepted Host headers.',
    },
    {
      name: 'PUBLIC_ORIGIN',
      required: false,
      description: 'Origin used to build canonical and Open Graph URLs.',
    },
  ],
  artifact: {
    publicDir: 'dist/apps/demo-ssr',
    configFiles: ['apps/demo-ssr/Dockerfile', 'docker-compose.production.yml'],
    sourceMaps: 'forbidden',
  },
});
```
