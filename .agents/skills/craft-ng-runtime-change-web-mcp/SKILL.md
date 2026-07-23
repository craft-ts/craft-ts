---
name: craft-ng-runtime-change-web-mcp
description: Explain, inspect, install, verify, and remove ng-craft runtime overrides, direct primitive value mutations, and direct function calls for state, insertSelect, query, asyncProcess, mutation, and queryParams through the function-registry MCP bridge. Use when a user asks how the registry, observable logs, WebSocket bridge, injectable primitive runtime contexts, registry.call, registry.override, registry.restore, registry.query.*, registry.mutation.*, registry.asyncProcess.*, or registry.queryParams.* works; wants a primitive method or primitive value changed without editing TypeScript or reloading the page; or needs to diagnose a call/override/primitive mutation that is unavailable, invalid, or failing.
---

# Craft NG Runtime Change Web MCP

Explain the mechanism from the browser method call to the MCP server, or operate it safely when the registry MCP tools are available. Read [references/architecture.md](references/architecture.md) before explaining implementation details, changing this mechanism, or diagnosing it.

## Fast Path: Change The Displayed Query List

Use this path when the user asks to change the rows currently displayed by a query, while keeping the current page loaded. This is an operational request, not an implementation investigation: do **not** read source files, `architecture.md`, the README, or `registry.logs` before attempting the mutation.

When `registry.query.update` is exposed, make exactly these calls in order:

1. `registry.clients` and select the page by URL.
2. `registry.list` with that `clientId`; select the root `query <= ...` entry, never a `method:*` entry.
3. `registry.get` with that `clientId` and key. For a grouped query, select one exact value from `primitive.ids` as `id`. For example, `"1-4"` is the current page query instance, not four separate ids.
4. Immediately call `registry.query.update` with the same `clientId`, key, and selected `id`. For an array list, use this source shape:

```js
(current) =>
  current.map((item) => ({
    ...item,
    name: `Rigolo ${item.id}`,
  }));
```

5. Report the value returned by `registry.query.update` as the changed list. That return value is the post-mutation value.

Do not call `registry.query.get` for individual row ids such as `"1"`, `"2"`, `"3"`, or `"4"`. Do not call `registry.get` or `registry.logs` again after a successful update. Only leave this fast path when `registry.query.update` itself returns an error; then use the failure diagnosis section below.

## Choose the workflow

- For an explanation, describe the call path, lifecycle, capabilities, and security boundary from the architecture reference. Tie each statement to the current source when implementation accuracy matters.
- For a one-shot direct function execution, follow the call workflow below.
- For an actual runtime method replacement, follow the override workflow below.
- For a direct primitive value change, follow the primitive value mutation workflow below.
- For implementation changes, inspect the source files listed in the architecture reference and update tests at the matching layer.
- For failures from a mutation tool, inspect `registry.get` and `registry.logs` before proposing a code change.
- If the session does not expose the `registry.*` MCP tools, stop pretending to operate the registry. State the limitation plainly and switch to one of these fallbacks:
  - ask the user to open a session that includes the function-registry MCP connector;
  - use the browser to inspect the local demo UI and recover the active `clientId`/entry key;
  - use the local workspace terminal to query the broker or run the affected tests.

## Select a browser registry

Before starting, verify that the session can actually call the registry tools. If `registry.clients` is unavailable, the rest of the workflow cannot proceed from the current tool surface.

1. Call `registry.clients`. Select the browser tab by `clientId`, `pageUrl`, and `connectedAt`. If several clients exist, never omit or guess `clientId`.
2. Call `registry.list` with `clientId` and select the entry by `hostName`, `ancestry`, and capabilities. Never guess a registry key.
3. If the entry is absent, ask the user to navigate to the UI path that instantiates the owning primitive, then list again. Supported insertion methods and root primitive value entries are registered at creation and do not require a first click.

## Call a function once

Use `registry.call` when the user wants to execute an existing registry entry once without changing future behavior.

1. Select the browser registry first.
2. Choose a callable entry, usually a `method:*` entry or another function entry with the right `hostName`/`ancestry`.
3. Call `registry.get` and inspect `originalSource`, `capabilities`, and `overrideActive`.
4. Call `registry.call` with `{ clientId, key, args }`.
5. Read `registry.logs` and confirm `call-started` followed by `call-succeeded` or `call-failed`.

Do not use `registry.call` to emulate an override. If the user asks to change what a button does on future clicks, use `registry.override`.

## Override a method

Before starting, verify that the session can actually call the registry tools and select the browser registry.

1. Use the selected `clientId`.
2. Call `registry.list` with `clientId` and select the method entry by `hostName`, `ancestry`, and capabilities. Never guess a registry key.
3. If the entry is absent, ask the user to navigate to the UI path that instantiates the owning primitive, then list again.
4. Call `registry.get` with `clientId` and `key`. Confirm that primitive capabilities are present and inspect `originalSource` and any active override.
5. Build one JavaScript expression that evaluates to a function receiving `args` and the matching primitive capability: `state`, `query`, `asyncProcess`, `mutation`, or `queryParams`.
6. Call `registry.override` once with `{ clientId, key, source }`. Do not emulate a replacement by repeatedly calling `registry.call`.
7. Ask the user to trigger the existing UI action, or use the browser when authorized. Verify the visible state change without reloading the page.
8. Call `registry.logs` with `clientId` and confirm `override-installed` followed by `override-succeeded`. Report `override-failed` exactly when execution failed.
9. Call `registry.restore` with the same `clientId` and `key` when the user asks to recover the original behavior. Trigger the UI again and verify it.

Use this minimal form for a counter override:

```js
({ state }) => state.update((current) => current + 10);
```

Use arguments when behavior depends on the original call:

```js
({ state, args }) => state.set(args[0]);
```

For a query insertion method:

```js
({ query }) => query.patch((current) => ({ page: current.page + 1 }));
```

For a queryParams insertion method:

```js
({ queryParams }) => queryParams.patch((current) => ({ page: current.page + 1 }));
```

## Mutate a primitive value directly

Use this workflow when the user wants to change the current value held by a primitive, rather than replace a method implementation. This covers root `query`, `asyncProcess`, `mutation`, and `queryParams` entries.

1. Call `registry.clients`. Select the browser tab by `clientId`, `pageUrl`, and `connectedAt`. If several clients exist, never omit or guess `clientId`.
2. Call `registry.list` with `clientId` and select the root primitive value entry, for example `query <= route:list#1 > component:List#2` or `queryParams <= route:list#1 > component:List#2`, not a `method:*` entry.
3. Call `registry.get` with `clientId` and `key`. Confirm that `primitive.kind` is present and that capabilities include `query.get/set/update/patch`, `asyncProcess.*`, `mutation.*`, or `queryParams.*`.
4. For grouped primitives, use an exact value from `primitive.ids` as `id`, equivalent to `queryRef.select(id)`. An id such as `1-4` identifies the query instance; it is not a list-item id, so do not probe `1`, `2`, `3`, or `4` separately.
5. Use:
   - `registry.query.get/set/update/patch` for `query`;
   - `registry.mutation.get/set/update/patch` for `mutation`;
   - `registry.asyncProcess.get/set/update/patch` for `asyncProcess`;
   - `registry.queryParams.get/set/update/patch` for `queryParams`.
6. Treat the return value from `set`, `update`, or `patch` as the post-mutation value. Read the primitive again only when a later asynchronous operation could have replaced it. Read `registry.logs` only to diagnose a failed mutation or when an audit trail is specifically requested.

For an array value, use `registry.query.update`: `patch` only merges object values and must not be used to replace list items.

```js
(current) =>
  current.map((item) => ({
    ...item,
    name: `AI ${item.name}`,
  }));
```

Example for changing URL query params:

```js
(current) => ({
  ...current,
  page: current.page + 1,
});
```

## Respect the runtime contract

- Every supported method context exposes `get()`, `set(value)`, `update(updater)`, and `patch(updater)` under its own primitive name.
- Method overrides are supported for `state`, `insertSelect` state contexts, `query`, `asyncProcess`, `mutation`, and `queryParams` insertion methods.
- Root value entries from `query`, `asyncProcess`, `mutation`, and `queryParams` expose direct primitive-specific operations: `registry.query.*`, `registry.mutation.*`, `registry.asyncProcess.*`, and `registry.queryParams.*`. Grouped `query`/`asyncProcess`/`mutation` primitives accept an optional `id` to target one selected instance.
- Treat `args` as read-only input.
- Install overrides only on active entries exposing primitive capabilities.
- Always keep the selected `clientId` attached to reads and mutations when multiple tabs are connected.
- Keep the source under 20,000 characters and ensure it evaluates to a function.
- Expect an override exception to propagate. The original method is not called as fallback and no automatic rollback occurs.
- Remember that overrides live in browser memory until full page reload. Internal Angular navigation does not remove them.
- Treat dynamic source compilation as local development functionality, not a security sandbox or production feature.

## Explain observable behavior

Mention that the registry keeps private `Map` instances for active entries and overrides, while Angular read-only signals expose entry snapshots and bounded logs. Registration, cleanup, calls, bridge events, overrides, and failures all append structured observable log records.

Distinguish names by boundary:

- MCP tools use dotted names such as `registry.override`.
- WebSocket protocol methods use slash names such as `registry/override`.
- Every WebSocket request and response carries a `callId` for correlation.

## Diagnose failures

- Tooling unavailable: if the session cannot call `registry.clients`, `registry.list`, `registry.override`, or `registry.logs`, this is an environment or connector problem, not a registry bug. Report that clearly and use a fallback path.
- `entry is not available`: trigger the relevant UI path, list again, and use the returned stable key.
- `clientId is required`: call `registry.clients`, select the intended tab, and retry with its ID.
- `Registry client ... is not connected`: refresh `registry.clients`; the tab disconnected or reloaded with a different session.
- `does not expose primitive runtime capabilities`: the entry is not a supported insertion method; do not override it with this mechanism.
- `does not expose primitive value capabilities`: the entry is not a root `query`, `asyncProcess`, `mutation`, or `queryParams` value entry; use `registry.list`/`registry.get` to select the root primitive entry.
- `exposes ... capabilities, not ...`: the chosen primitive-specific tool does not match the entry kind. For example, use `registry.query.update` only on a `query` entry.
- `Grouped primitive value "... " is not available`: the selected `id` is not currently instantiated. Use the matching primitive `.set` tool with `id` to create it with a value, or trigger the UI path that creates the selected instance.
- `Invalid override source`: correct the JavaScript expression and reinstall it.
- `Invalid primitive value update source` / `Invalid primitive value patch source`: correct the JavaScript expression so it evaluates to a function.
- `must evaluate to a function`: wrap the implementation as a function expression.
- `lost its state runtime capabilities`: the active wrapper no longer has the expected state injection context; inspect registration and injector wiring.
- `has no active override`: fetch the entry before attempting restore.

Never hide an execution error by calling the original method. Use `registry.logs` to preserve the actual failure.

## Verify implementation changes

Run focused tests for all affected layers:

1. Core tests for root `state`, nested `insertSelect`, `query`, `asyncProcess`, `mutation`, and `queryParams` runtime contexts.
2. Registry tests for install, execution, failure, and restore semantics.
3. WebSocket broker tests for isolated clients, snapshots, reconnection, request correlation, and ambiguity rejection.
4. MCP server tests for client targeting, tool exposure, and mutating annotations.
5. Playwright coverage for `1 -> 11 -> 12` without page reload and registry cleanup across internal navigation.
