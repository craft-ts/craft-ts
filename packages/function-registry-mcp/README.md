# Function registry MCP bridge

This package exposes the demo application's function registry through MCP over
stdio. It also listens on `ws://127.0.0.1:3333` for the browser application.

```sh
npm run start --workspace @ng-craft/function-registry-mcp
```

Set `REGISTRY_BRIDGE_HOST` and `REGISTRY_BRIDGE_PORT` to override the WebSocket
listener. MCP tools are `page`, `registry.clients`, `registry.list`, `registry.get`,
`registry.call`, primitive-specific value tools such as `registry.query.get`,
`registry.query.update`, `registry.mutation.patch`,
`registry.asyncProcess.set`, `registry.queryParams.update`,
`registry.override`, `registry.restore`, and `registry.logs`. Their WebSocket
methods use slash forms internally (`page`, `registry/list`, `registry/resource/update`,
etc.), and each request and response carries a `callId`.

`page` reads the named interactive surface (`data-craft-name`) on the connected
tab and can `act` (goto, fill, click, press) in the same round-trip. A read
without `act` still asks the live tab. Omit `clientId` when exactly one tab is
`ready`. A ghost `reloading` card (HMR, F5) does not count. Default `detail` is
`controls`; `dom-styles` is opt-in debug. The broker keeps the client card while
`ng serve` rebuilds and `page` waits until the tab is `ready` again. See the
demo docs page `/guide/ai/dev-page`.

Each browser tab keeps a stable `clientId` in `sessionStorage`. Duplicating a
tab copies it; the broker assigns a new id (`hello/ok`) so the two tabs do not
fight. Closing the tab sends `page/goodbye` and drops the card; opening a new
tab is a new id. Closing without goodbye (crash) looks like reload for up to
20s. The broker keeps one socket and one snapshot per client instead of
choosing a global "latest" socket. Call `registry.clients` to list every card
(id, status, url). Two `ready` tabs require `clientId` — the error is
`Multiple ready page clients; clientId is required. Available clients: <id> ready <url>, <id> ready <url>`. If
`page client "<id>" is not connected`, list clients and retry without id when a
single ready remains. Never pick “latest”.

Runtime overrides are supported for insertion methods from `state`,
`insertSelect`, `query`, `asyncProcess`, `mutation`, and `queryParams`. The
override receives the matching primitive capability (`state`, `query`,
`asyncProcess`, `mutation`, or `queryParams`) plus `args`. Insertion methods are
published when their primitive is created, before their first UI invocation.

Primitive values from `query`, `asyncProcess`, `mutation`, and `queryParams` are
also published directly. Use the primitive-specific tools on the root primitive
entry, for example `registry.query.update` on
`query <= route:list#1 > component:List#2`, or `registry.queryParams.patch` on
`queryParams <= route:list#1 > component:List#2`. For `query`, `asyncProcess`,
and `mutation` primitives with identifiers, pass `id` to target the selected
instance; without `id`, the operation targets the by-id state record.
