# Runtime override architecture

## Purpose

The development-only override path changes the runtime behavior of an insertion method returned by `state`, `insertSelect`, `query`, `asyncProcess`, `mutation`, or `queryParams`. It does not edit TypeScript, replace the callback reference, or reload the browser. The existing wrapper checks the override table on every invocation.

## Call path

1. A supported primitive creates a scoped `PrimitiveMethodRuntimeContext` with its `kind`, `get`, `set`, `update`, `patch`, and the original method source.
2. `provideFnWrapObserver` reads that context when the method is wrapped and registers the active entry before its first invocation.
3. The entry uses its `hostName` and ancestry-derived key. Component ancestry already contains the global component counter suffix such as `component:Counter#3`; no separate method `entryId` is added.
4. `provideFnWrapper` looks up the existing entry and calls `functionRegistry.executeOverride(key, args, runtimeContext)` on every invocation.
5. With no override, the original factory runs normally.
6. With an override, the registry invokes the compiled function with a frozen `{ state, args }` object and returns its result instead.
7. If the override throws or rejects, the error propagates. The original factory does not run.

The stable key is the host name alone when ancestry is empty, otherwise:

```text
<hostName> <= <ancestor 1> > <ancestor 2>
```

## Registry model

The browser registry owns:

- a private `Map<string, InternalEntry>` for fast active-entry lookup;
- a private `Map<string, InternalOverride>` independent of entry registration;
- a read-only entries signal containing serializable snapshots;
- a read-only logs signal retaining the latest 500 structured events.

An entry snapshot contains `key`, `hostName`, `ancestry`, `capabilities`, and `overrideActive`. Detailed reads add `originalSource` and, when present, the override `source` and `installedAt` timestamp.

Overrides remain in their independent map when an Angular component is destroyed and its entry is removed. Because a recreated component receives a new global counter suffix, its new key does not accidentally inherit the previous instance's override. A full page reload clears browser memory and therefore all overrides.

## Method runtime context

The common public context type is defined in `libs/core/src/lib/primitive-method-runtime-context.ts` and injected into each generated insertion-method scope. `state` keeps its compatibility API in `state-method-runtime-context.ts`. Root `state` methods operate on the root state. Methods from `insertSelect` receive the selected item or selected property context. `query`, `asyncProcess`, and `mutation` insertion methods receive a same-named context operating on that primitive state. `queryParams` insertion methods receive a `queryParams` context operating on the current query-params state and URL synchronization methods.

The override receives `args` and exactly one primitive capability matching the entry kind. For a query, the effective shape is:

```ts
{
  args: readonly unknown[];
  query: {
    get(): unknown;
    set(value: unknown): unknown;
    update(updater: (current: unknown) => unknown): unknown;
    patch(updater: (current: unknown) => object): unknown;
  };
}
```

The registry compiles source with `new Function`. This is capability-limited by convention but is not a secure JavaScript sandbox.

## Primitive value runtime context

Root primitive values from `query`, `asyncProcess`, `mutation`, and `queryParams` are published through `libs/core/src/lib/primitive-resource-runtime-context.ts`. The demo app registers these contexts as active registry entries with the same ancestry-derived key as the root primitive, for example:

```text
query <= route:list-with-pagination#6 > component:ListWithPagination#7
queryParams <= route:list-with-pagination#6 > component:ListWithPagination#7
```

`registry.get` exposes this metadata under `primitive`. These entries expose direct primitive value capabilities:

```ts
{
  kind: 'query' | 'asyncProcess' | 'mutation' | 'queryParams';
  grouped: boolean;
  ids(): readonly string[];
  get(id?: string): unknown;
  set(value: unknown, id?: string): unknown;
  update(updater: (current: unknown) => unknown, id?: string): unknown;
  patch(updater: (current: unknown) => object, id?: string): unknown;
}
```

For non-identified primitives, including `queryParams`, `id` is rejected. For identified primitives, `id` targets the selected instance, equivalent to `queryRef.select(id)` / `asyncProcessRef.select(id)` / `mutationRef.select(id)`. Omitting `id` targets the whole by-id state record.

## Transport boundaries

Each browser tab is a WebSocket client with a `clientId` persisted in `sessionStorage`. The separate Node package listens by default at `ws://127.0.0.1:3333`, keeps a connection and snapshot per client, and exposes an MCP server over stdio. A reconnect with the same `clientId` replaces only that client's socket and starts with an empty snapshot.

| MCP tool            | WebSocket method    | Mutates runtime |
| ------------------- | ------------------- | --------------- |
| `registry.clients`  | Broker-local        | No              |
| `registry.list`     | `registry/list`     | No              |
| `registry.get`      | `registry/get`      | No              |
| `registry.call`     | `registry/call`     | Yes             |
| `registry.query.get/set/update/patch` | `registry/resource/get/set/update/patch` with `kind: "query"` | set/update/patch |
| `registry.mutation.get/set/update/patch` | `registry/resource/get/set/update/patch` with `kind: "mutation"` | set/update/patch |
| `registry.asyncProcess.get/set/update/patch` | `registry/resource/get/set/update/patch` with `kind: "asyncProcess"` | set/update/patch |
| `registry.queryParams.get/set/update/patch` | `registry/resource/get/set/update/patch` with `kind: "queryParams"` | set/update/patch |
| `registry.override` | `registry/override` | Yes             |
| `registry.restore`  | `registry/restore`  | Yes             |
| `registry.logs`     | `registry/logs`     | No              |

WebSocket request and response messages use the same `callId`. Responses contain either `result` or `{ error: { message } }`. Registry snapshots publish both entries and logs whenever their signals change.

Call `registry.clients` before selecting a registry. When exactly one client is connected, `clientId` may be omitted for compatibility. When several are connected, all other tools reject calls without an explicit `clientId`; the broker never chooses the latest socket implicitly.

## Observable events

The registry records:

- `registered`, `removed`;
- `call-started`, `call-succeeded`, `call-failed`;
- `override-installed`, `override-removed`;
- `override-succeeded`, `override-failed`;
- `primitive-read`, `primitive-mutated`, `primitive-failed`;
- `bridge` connection and transport events.

## Source map

- `libs/core/src/lib/primitive-method-runtime-context.ts`: common injectable primitive capability contract.
- `libs/core/src/lib/primitive-resource-runtime-context.ts`: direct primitive value capability observer contract.
- `libs/core/src/lib/state-method-runtime-context.ts`: compatible state-specific API.
- `libs/core/src/lib/state.ts`: root state-method provider.
- `libs/core/src/lib/insert-select.ts`: selected item/property providers.
- `libs/core/src/lib/query.ts`: query insertion-method provider.
- `libs/core/src/lib/async-process.ts`: asyncProcess insertion-method provider.
- `libs/core/src/lib/mutation.ts`: mutation insertion-method provider.
- `apps/demo/src/app/app.config.ts`: dynamic wrapper dispatch.
- `apps/demo/src/app/function-registry.ts`: entry, override, compilation, and log storage.
- `apps/demo/src/app/function-registry-bridge.ts`: browser WebSocket protocol.
- `packages/function-registry-mcp/src/bridge-broker.ts`: Node bridge correlation and snapshots.
- `packages/function-registry-mcp/src/mcp-server.ts`: MCP tool definitions.
- `apps/demo/e2e/function-registry-override.spec.ts`: no-reload end-to-end scenario.
