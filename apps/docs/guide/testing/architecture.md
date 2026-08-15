# Architecture rules

Service and component tests prove a unit behaves. Architecture rules prove the
**shape of the app**: this feature must not talk to that one, this HTTP endpoint
is owned once, this persisted identity appears once. They analyze TypeScript
without starting Angular — the same role as `e2e/`, on the static Craft graph
instead of a browser.

**Use them when** a constraint is about who may depend on whom, not about what
the user sees.
**Not instead of** [service](/guide/testing/services) or
[component](/guide/testing/components) tests — a green architecture suite does
not mean a button works.

::: tip A rule is an ordinary `it()`
Look a node up, walk its edges, assert. The helpers below are the declarative
baseline — unique identities, unique HTTP, pure `craftComputed`, no
`depends-on` cycles — plus `assertRouteDiProofs` for the routing DI contract
and insertion rules (`insertReactOnMutation`, persisted `craftUnique`,
`insertSelect` keys, `craftEffect` off the network and off imperative sync).
Everything else is Vitest.
:::

## Import

```typescript
import {
  analyzeDependencyGraph,
  architectureCatalogToTypeScript,
  assertCraftComputedPure,
  assertCraftEffectNoImperativeSync,
  assertCraftEffectNoNetwork,
  assertCraftUnique,
  assertDeclarativeArchitecture,
  assertHttpEndpointUnique,
  assertInsertSelectUnique,
  assertInteractiveElementNamed,
  assertMutationHasReactOn,
  assertNoDependencyCycles,
  assertPathBoundaries,
  assertPersistedPrimitiveHasUnique,
  assertRouteDiProofs,
  buildArchitectureCatalog,
  createArchitectureGraph,
  noExclusiveLink,
} from '@craft-ng/dev-tools';
```

## Mental model

`analyzeDependencyGraph` reads the application sources with the TypeScript
program — routes, services, components, HTTP calls, `craftUnique` identities,
route DI proofs (`CanRun`, `ValidateCascadeRoutesFile`, `RouteCheckedDI`) —
and builds a graph of nodes and edges.

`createArchitectureGraph` wraps that graph with typed lookups. Names come from
a generated **catalog** (`as const`): autocomplete, and a type error when a
renamed symbol disappears.

A rule is then a Vitest assertion on those lookups. The suite lives next to
`e2e/`, in an `architecture/` folder, and runs in Node — no `TestBed`, no
browser.

ESLint already forbids local slips (`inject`, raw `HttpClient`) and can generate
the route proof blocks. Architecture tests catch **graph-wide** slips those
rules cannot see: a feature leaking into another, an endpoint called from two
APIs, a duplicate storage key, a route or `app.config` error screen whose DI
proof was never armed. See [ESLint rules](/guide/routing/eslint-rules).

## Setting it up

The demo app is the working reference: `apps/demo/architecture/`, run with
`npx nx architecture demo`. Commands are listed in `apps/demo/README.md`.
Copy that layout, or scaffold it with the migrator (Vitest, Node):

```shell
npx craft-migrate-architecture \
  --project tsconfig.app.json \
  --root src \
  --write
```

That writes `tsconfig.graph.json`, `tsconfig.architecture.json`,
`vitest.architecture.config.ts`, the `architecture/` suite (loader, catalog,
baseline rules, and an `architecture.spec.ts` for app-specific lookups), an
Nx `architecture` target or a `package.json` script, and ignores the generated
catalog in the nearest flat ESLint config. `--write` overwrites the scaffold.
`--check` fails when the suite is missing or the generated tooling files
drifted. `craft-migrate --write` runs this as its last step.

Common rules each get a file under `architecture/rules/`; app-specific lookups
stay in `architecture.spec.ts`.

### 1. Analysis tsconfig

Point analysis at **every application source file**. `tsconfig.app.json` often
lists only `main.ts`; the graph would then miss routes, services and components.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}
```

### 2. Suite tsconfig

A second project compiles only the architecture folder, with Node and Vitest
types:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "vitest/globals"],
    "module": "esnext",
    "moduleResolution": "bundler"
  },
  "include": ["architecture/**/*.ts"]
}
```

Reference it from the app `tsconfig.json` `references` array so the IDE
typechecks the suite.

### 3. Vitest, at the app root

Keep the config next to `project.json` — **not** inside `architecture/`. A nested
`vitest.config.ts` is picked up by the Nx Vitest plugin and breaks the app's
unit-test target.

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/demo-architecture',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'demo-architecture',
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ['architecture/**/*.spec.ts'],
  },
}));
```

Analysis of a real app takes seconds, not milliseconds. Size the timeouts
accordingly; `beforeAll` uses `hookTimeout`.

### 4. Load the graph, rewrite the catalog

```typescript
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  analyzeDependencyGraph,
  architectureCatalogToTypeScript,
  buildArchitectureCatalog,
  createArchitectureGraph,
} from '@craft-ng/dev-tools';
import { architectureCatalog } from './catalog';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const catalogPath = join(import.meta.dirname, 'catalog.ts');

export function loadArchitectureGraph() {
  const graph = analyzeDependencyGraph({
    rootDir: workspaceRoot,
    tsConfigFilePath: 'apps/your-app/tsconfig.graph.json',
  });
  writeFileSync(
    catalogPath,
    `// Generated. Do not edit.\n${architectureCatalogToTypeScript(buildArchitectureCatalog(graph))}`,
  );
  return createArchitectureGraph(graph, architectureCatalog);
}
```

The imported catalog is what TypeScript autocompletes against. The rewrite
keeps it in sync with the sources: after a rename, the next typecheck of the
suite fails until the lookups are updated.

Ignore the generated catalog in ESLint. Commit it so the first clone
typechecks.

Bootstrap with `npx craft-graph --project apps/your-app/tsconfig.graph.json --root . --out apps/your-app/architecture/catalog --format json`.
Rename the generated `catalog.architecture.ts` to `catalog.ts`. After that,
loading the graph keeps it current.

### 5. Nx target

```json
{
  "architecture": {
    "executor": "nx:run-commands",
    "options": {
      "command": "npx vitest run --config vitest.architecture.config.ts",
      "cwd": "apps/your-app"
    },
    "inputs": [
      "{projectRoot}/src/**/*.ts",
      "{projectRoot}/architecture/**/*.ts",
      "{projectRoot}/tsconfig.graph.json"
    ],
    "cache": true
  }
}
```

```shell
npx nx architecture your-app
```

## Looking up nodes

Pass the catalog into `createArchitectureGraph` and names become unions.
A missing name throws `Unknown service '…'`. Two nodes sharing a name throw
until you pass a relative file path.

```typescript
graph.route('craft/query/:userId');
graph.service('UsersApiOnError');
graph.service('ApiService', 'users/api.service.ts'); // homonym
graph.component('ListWithPagination');
graph.providedOn('UserList');
graph.httpEndpoint('GET', 'users');
graph.unique('{"key":"user-query","storeName":"demo-app"}');
graph.services({ browserBoundary: true, scope: 'global' });
graph.usingHttp();
graph.dependingOnBrowserBoundary();
graph.craftMethods();
```

| Lookup                         | Returns                                              |
| ------------------------------ | ---------------------------------------------------- |
| `route(path, file?)`           | one route node                                       |
| `service(name, file?)`         | one service node                                     |
| `component(name, file?)`       | one component node                                   |
| `providedOn(name)`             | every node that `provides` that service              |
| `httpEndpoint(method, url)`    | one HTTP endpoint                                    |
| `unique(canonicalJson)`        | one `craftUnique` identity                           |
| `services({ browserBoundary, scope })` | filtered services                          |
| `usingHttp()`                  | nodes that call `CraftHttpClient`                    |
| `dependingOnBrowserBoundary()` | nodes that depend on a `browserBoundary` service     |
| `uniques()` / `httpEndpoints()` / `craftMethods()` | all nodes of that kind            |

Each node exposes `providers()`, `provider(name)`, `outgoing(kind?)`,
`incoming(kind?)` and `httpEndpoints()`. Edge kinds include `depends-on`,
`provides`, `calls`, `loads`, `renders`, `reads`, `writes`, `checks`,
`triggers`.

`unique(...)` takes the **canonical JSON** of the identity object: keys sorted
in depth. `{ storeName, key }` and `{ key, storeName }` index as the same
string.

## Built-in helpers

The declarative baseline is five graph-wide checks. Import them all, then
either call each one or `assertDeclarativeArchitecture` for the five together.
The demo suite keeps one file per rule in `apps/demo/architecture/rules/` —
run it with `npx nx architecture demo`.

| Helper | Fails when |
| --- | --- |
| `assertCraftUnique` | the same `craftUnique` identity appears twice, or the argument is not a static literal |
| `assertHttpEndpointUnique` | the same HTTP verb+URL is called from more than one site |
| `assertCraftComputedPure` | a `craftComputed` `calls` a method or `writes` a `source$` |
| `assertNoDependencyCycles` | a directed cycle exists on `depends-on` (services, components, computeds) |
| `assertMutationHasReactOn` | a `mutation` has no query `insertReactOnMutation` edge (`allow` skips named fire-and-forget mutations) |
| `assertDeclarativeArchitecture` | any of the five above fail |
| `assertRouteDiProofs` | a routed component, pending UI or error screen has no armed `CanRun` mapper, a collection is missing `assertExhaustiveRouteExceptions`, or `app.config.ts` registers a global / route-load error screen without its `RouteExceptionComponentCheckedDI` |
| `assertPathBoundaries` | a `depends-on` (or opted-in `calls`) crosses a folder allowlist / denylist |
| `noExclusiveLink(a, b)` | the only path between two branches is a leak, not a shared kernel |
| `assertPersistedPrimitiveHasUnique` | `insertStoragePersister` is used without wrapping the identity in `craftUnique` |
| `assertInsertSelectUnique` | the same `insertSelect` key appears twice on one host primitive |
| `assertCraftEffectNoNetwork` | a `craftEffect` `calls` HTTP or a `mutation` |
| `assertCraftEffectNoImperativeSync` | a `craftEffect` writes a `state` / `source$` or triggers a `query` / `mutation` / `asyncProcess` |
| `assertInteractiveElementNamed` | an interactive helper (`button`, `a`, `input` except `hidden`, `textarea`, `select`, or any node with `click` / `input` / `change` / `submit`) is missing a literal first-argument name, the name is not static, or the same `data-craft-name` appears twice in the app |

### `noExclusiveLink`

Forbids edges that exist only because two branches touch each other. A shared
kernel — auth, HTTP client, browser boundaries — is allowed. Membership stops
at other `provides` sites, so a leak into a third feature is not reclassified
as shared.

```typescript
it('keeps exclusive feature branches from linking', () => {
  const [userList] = graph.providedOn('UserList');
  const [userMutation] = graph.providedOn('UserMutation');
  expect(userList).toBeDefined();
  expect(userMutation).toBeDefined();
  noExclusiveLink(userList, userMutation);
});
```

The same helper works on routes: `noExclusiveLink(graph.route('/admin'), graph.route('/checkout'))`.

### `assertPathBoundaries`

Nx `depConstraints` tag **projects** and forbid TypeScript imports. This helper
tags **folders** on the Craft graph and forbids `depends-on` (optionally
`calls`) between them — including inside one app, where module-boundary ESLint
does not run. Same intention, different altitude: [Craft graph vs
Nx](/guide/testing/craft-graph-vs-nx).

Paths are relative to `graph.rootDir`. `*` is one segment, `**` is any depth,
`:name` captures a segment. The same capture in `source` and `onlyDependOn` /
`forbidTarget` must match, so a feature can depend on itself but not on
siblings.

`onlyDependOn` is an allowlist; `forbidTarget` is a denylist. When both are
set, the target must match the allowlist **and** miss the denylist. Nodes whose
path matches no `source` are unconstrained. Edges without a `filePath` on
either end, and structural edges (`provides`, `loads`, `renders`, `contains`),
are ignored.

```typescript
it('keeps features and UI in their folders', () => {
  assertPathBoundaries(graph.graph, {
    constraints: [
      {
        source: 'src/app/features/:feature/**',
        onlyDependOn: [
          'src/app/features/:feature/**',
          'src/app/shared/**',
          'src/app/ui/**',
        ],
      },
      {
        source: 'src/app/ui/**',
        onlyDependOn: ['src/app/ui/**', 'src/app/shared/**'],
        forbidTarget: ['src/app/data/**'],
      },
    ],
  });
});
```

Sibling features are an allowlist job (`onlyDependOn` includes
`features/:feature/**`). A denylist `features/**` would also forbid self.

### `assertCraftUnique`

Each `craftUnique(...)` identity must appear once, and the argument must be a
static literal — otherwise the graph cannot tell two call sites apart. Used
with [persistence](/guide/state/persistence) so two queries cannot silently
share a storage key.

```typescript
it('requires craftUnique identities to appear once', () => {
  assertCraftUnique(graph.graph);
});
```

A duplicate or a non-literal argument fails the test with the file:line of
each call site.

### `assertHttpEndpointUnique`

A `GET users` node is one verb + one URL. Two call sites — two services, or
the same service twice — fail the test. Distinct pairs (`GET users` and
`POST users`, or `GET orders`) are allowed.

```typescript
it('owns each HTTP endpoint once', () => {
  assertHttpEndpointUnique(graph.graph);
});
```

This is the graph-wide counterpart of `craftUnique`. Wrapping `CraftHttpClient`
in `craftUnique` is not required: the identity is the verb+URL.

### `assertCraftComputedPure`

A `craftComputed` may only **read**. Outgoing `calls` (a `craftMethod`,
`increment`, `mutate`, …) and `writes` (`source$.emit` / `.set`) fail.

Local slips are also caught by ESLint
`craft-ng/no-craft-computed-side-effects`. The graph catches a computed that
calls a method declared in another binding.

```typescript
it('keeps craftComputed free of methods and source$ writes', () => {
  assertCraftComputedPure(graph.graph);
});
```

### `assertNoDependencyCycles`

Directed cycles on `depends-on` only: service A → B → A, two `craftComputed`
that yield each other, a self-`yield*`. `provides`, `contains`, `loads` and
`renders` are structure, not a cycle of use. A shared kernel (Left → Auth,
Right → Auth) is not a cycle.

```typescript
it('forbids depends-on cycles', () => {
  assertNoDependencyCycles(graph.graph);
});
```

### `assertDeclarativeArchitecture`

Runs the five checks above and joins their messages. Pass `{ allow }` through
to `assertMutationHasReactOn` for fire-and-forget mutations.

```typescript
it('keeps the app declarative', () => {
  assertDeclarativeArchitecture(graph.graph, { allow: ['logout'] });
});
```

### `assertRouteDiProofs`

The routing DI contract is type-level by design. `CanRun`,
`ValidateCascadeRoutesFile`, `RouteCheckedDI` and
`RouteExceptionComponentCheckedDI` are unused aliases unless they stay in the
file: comment one out and TypeScript still compiles. That is the one fragile
step in an otherwise compile-time guarantee.

This helper makes that step a test failure. It walks the static graph and
requires every routed component — including lazy `loadChildren` collections,
which a parent proof never covers — every pending or error screen, and every
`craftAppConfig` error surface to be hooked to an armed mapper. A mapper
without `CanRun` is dead: the graph indexes it, then this rule fails.
TypeScript still judges whether a dependency is provided; the architecture
suite judges whether that judgement was invoked.

```typescript
it('requires a DI proof on every routed component and app-config error screen', () => {
  assertRouteDiProofs(graph.graph);
});
```

A missing proof, an unarmed mapper, a pending/error screen without its own
`RouteCheckedDI`, a collection without `assertExhaustiveRouteExceptions`, or an
`app.config.ts` that registers `provideCraftGlobalErrorComponent` /
`provideCraftRouteLoadErrorComponent` (or `withErrorComponent` /
`withRouteLoadError`) without an armed `RouteExceptionComponentCheckedDI` fails
with the file:line of the hole.

### `assertMutationHasReactOn`

A mutation that no query reacts to is the graph-wide form of
[the button that knows which lists to refresh](/guide/state/react-on-mutation).
The analyzer records `insertReactOnMutation` as a `triggers` edge from the
mutation to the query — including when the insertion is nested in
`insertQueryPipe`. This helper fails on every `mutation` primitive that has no
such edge.

Fire-and-forget writes (logout, a form submit with no cache, a demo that
refreshes by incrementing local state) pass an `allow` list of mutation names:

```typescript
it('requires a query to react to each mutation', () => {
  assertMutationHasReactOn(graph.graph, { allow: ['logout'] });
});
```

### `assertPersistedPrimitiveHasUnique`

`assertCraftUnique` says an identity appears once. This helper says a persisted
primitive *has* an identity: `insertStoragePersister` / `insertLocalStoragePersister`
must take `craftUnique(...)`. A raw `{ key, storeName }` indexes the primitive
as persisted and fails here.

```typescript
it('requires craftUnique on every persisted primitive', () => {
  assertPersistedPrimitiveHasUnique(graph.graph);
});
```

See [Persistence](/guide/state/persistence).

### `assertInsertSelectUnique`

`insertSelect('cell')` names a slice on its host `state` / `query`. Two
siblings with the same key on the same host stomp each other. The same key on
two different hosts is allowed — each list can have a `cell`.

```typescript
it('keeps insertSelect keys unique on each host', () => {
  assertInsertSelectUnique(graph.graph);
});
```

See [Selecting](/guide/state/select).

### `assertCraftEffectNoNetwork`

A `craftEffect` that `calls` `CraftHttpClient` or a `mutation` is a `query` or
`mutation` in disguise. Reads of local `state` stay valid.

```typescript
it('keeps craftEffect off HTTP and mutations', () => {
  assertCraftEffectNoNetwork(graph.graph);
});
```

### `assertCraftEffectNoImperativeSync`

A `craftEffect` that writes another `state` or `source$`, or that calls
`query.call` / `mutation.mutate` / `asyncProcess.method`, is glue that should
be a sourced `state` or reactive `params` instead. Logging, focus, and other
I/O that does not push into a Craft primitive stay valid. ESLint
`craft-ng/no-imperative-craft-resource-trigger` catches the resource-trigger
half in the editor; this helper is the graph-wide counterpart, including
state writes.

```typescript
it('keeps craftEffect from pushing into other primitives', () => {
  assertCraftEffectNoImperativeSync(graph.graph);
});
```

### `assertInteractiveElementNamed`

`button('increment', {}, '+')` stamps `data-craft-name="increment"`. Type-level
proofs and DOM tests already key off that name. This helper makes the first
string **mandatory** on clickable and fillable elements, and **unique in the
app**: two `button('save')` in two components fail, and so does
`button({ click() {} }, 'Save')`. ESLint `craft-ng/require-interactive-local-name`
is the editor counterpart for the missing / non-static cases.

```typescript
it('requires a unique literal data-craft-name on every interactive element', () => {
  assertInteractiveElementNamed(graph.graph);
});
```

## Writing your own rules

Start from a node you care about and assert what should be true of its
neighbourhood. The demo suite does this for routes and HTTP; the same pattern
covers any invariant you can see on the graph.

### A route provides the feature service

```typescript
it('indexes demo routes and provided feature services', () => {
  expect(graph.route('craft/query/:userId').kind).toBe('route');
  expect(graph.providedOn('UserList').map((node) => node.label)).toEqual(
    expect.arrayContaining([expect.stringMatching(/ListWithPagination/)]),
  );
});
```

### An HTTP endpoint has a single owner

```typescript
it('indexes the users HTTP endpoint', () => {
  expect(graph.httpEndpoint('GET', 'users').label).toBe('GET users');
  expect(graph.usingHttp().map((node) => node.label)).toEqual(
    expect.arrayContaining(['UsersApiOnError']),
  );
});
```

### HTTP only from a browser boundary

[Browser boundaries](/guide/testing/browser-boundaries) are the line to the
network. A rule can require that `CraftHttpClient` is only yielded from a
service marked `browserBoundary: true`:

```typescript
it('only browser-boundary services call HTTP', () => {
  const boundaryIds = new Set(
    graph.services({ browserBoundary: true }).map((node) => node.id),
  );
  const leaked = graph
    .usingHttp()
    .filter((node) => node.kind === 'service' && !boundaryIds.has(node.id));
  expect(leaked.map((node) => node.label)).toEqual([]);
});
```

### A persisted identity exists

```typescript
it('looks up a persisted unique identity', () => {
  expect(
    graph.unique('{"key":"user-query","storeName":"demo-app"}').kind,
  ).toBe('unique');
});
```

If the lookup throws, the identity left the graph — the key changed, or
`craftUnique` was removed.

Anything you can express with `outgoing` / `incoming` is a rule: “this
`craftMethod` is either called or writes a `source$`, never both”, “this
component does not `depends-on` that service”, “only `scope: 'global'` services
appear under `usingTemporal()`”. Keep the assertion next to a comment that
states the product invariant, not the graph traversal.

## Inspecting the graph

`npx craft-graph` (also `npx craft graph`) writes the same analysis to disk
without running tests:

```shell
npx craft-graph \
  --project apps/your-app/tsconfig.graph.json \
  --root . \
  --out craft-dependency-graph \
  --format all
```

| `--format` | Writes                                                              |
| ---------- | ------------------------------------------------------------------- |
| `json`     | the raw graph + a `.architecture.ts` catalog                        |
| `mermaid`  | a `.mmd` diagram                                                    |
| `html`     | a standalone explorer (no server, no runtime)                       |
| `both`     | JSON + catalog + Mermaid                                            |
| `all`      | JSON + catalog + Mermaid + HTML                                     |

`--include <text>` restricts analysis to matching source paths. Use the HTML
explorer to see a route expand into components and services before you write
the assertion.

## Pitfalls

**The analysis tsconfig must include the app, not just `main.ts`.** An empty
graph with a passing `usingHttp()` is the usual symptom.

**Do not nest `vitest.config.ts` under `architecture/`.** Put
`vitest.architecture.config.ts` at the app root.

**The catalog lags by one run.** Lookups are typed against the committed file.
After adding a route or service, run the suite once so the rewrite lands, then
the new name typechecks.

**Homonyms need a file path.** `graph.service('ApiService')` throws
`Ambiguous service 'ApiService'` when two files export that name. Pass
`'users/api.service.ts'`.

**`craftUnique` must be a literal.** A computed `{ storeName, key }` indexes as
`static: false` and `assertCraftUnique` fails — the graph cannot prove
uniqueness.

**A commented `CanRun` still type-checks.** Unused aliases are not errors.
`assertRouteDiProofs` is the CI counterpart — that is the whole point of the
helper.

**These tests are not e2e.** They never boot the app. Pair them with
[service](/guide/testing/services) and [component](/guide/testing/components)
tests for behaviour, and with ESLint for local architecture.

## See Also

- [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx) — what each graph can
  and cannot see
- [Testing services](/guide/testing/services) — the runtime graph of one service
- [Browser boundaries](/guide/testing/browser-boundaries) — the nodes
  `browserBoundary: true` refers to
- [Persistence](/guide/state/persistence) — why `craftUnique` identities must be
  unique
- [ESLint rules](/guide/routing/eslint-rules) — local architecture, autofixed
- [Routing setup](/guide/routing/setup) — the proofs this helper keeps armed
- [Learn: test what you wrote](/learn/10-testing)
