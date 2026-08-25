# Live page MCP

The running development tab publishes its named controls. A coding agent fills,
clicks, and inspects **that** page — no second browser, no DOM reverse-engineering.

**Use it when** a Cursor agent must drive or inspect the `ng serve` tab you
already have open.
**Not when** you are writing Craft away from a running app — use
[`@craft-ts/mcp`](/resources/ai-agents) for docs and skills. **Not when** you
want to mutate a primitive without the UI — use the `registry.*` tools on the
same local MCP.

## Connect the local MCP

The tool lives on `@craft-ts/function-registry-mcp`, not on the published
`@craft-ts/mcp` docs server. From the craft-ts repo:

```sh
npm run registry:mcp
```

Point Cursor at that stdio server. It already listens on `ws://127.0.0.1:3333`
for the demo tab. Each tab keeps a stable `clientId` in `sessionStorage`.

## One ready tab

Each tab has a `clientId` in `sessionStorage`. Duplicating a tab copies it; the
broker assigns a new id (`hello/ok`) so the two tabs do not fight.

Omit `clientId` when **exactly one tab is `ready`**. A ghost `reloading` card
(HMR, F5) does not count. Two `ready` tabs → pass `clientId` from
`registry.clients` (id, status, url). Never pick “latest”. The error is
`Multiple ready page clients; clientId is required. Available clients: <id> ready <url>, <id> ready <url>`.
Zero ready with several ghosts is
`No ready page client. Reloading: <id> (last url <url>), <id> (last url <url>)`.
Zero cards is `page client is not connected`.

Closing the tab sends `page/goodbye`; the card is dropped. Opening a new tab is
a new id. If `page client "<id>" is not connected`, call `registry.clients` and
retry without id when a single ready remains.

Closing without goodbye (crash) looks like reload for up to 20s.

## One tool: `page`

Omit `act` to read the current surface. The broker **always asks the live tab**
— a Craft `value:` that changed without a DOM mutation is still current. Pass
`act` to run a batch, then receive the **new** state in the same round-trip.

Default `detail` is `"controls"`: the named interactive surface (id, role,
accessible name, value, enabled, index, and `track` when the node is inside
`forNode`). Pass `detail: "dom-styles"` only to debug layout or CSS — it is large
and opt-in.

`id` is the literal local name from the helper:

<<< @/tests/snippets/guide/ai/dev-page/save-button.spec.ts#save-button

That name is unique in the app graph
(`assertInteractiveElementNamed`). The renderer writes `data-craft-name="save"`.
Do not prefix it with the component name. When `forNode` repeats the same id, pass
`match.index` or `match.track`.

## Fill, click, goto, ready

`act: [{ "goto": "/login-form" }]` navigates in the tab (Craft router).
The WebSocket stays up. Prefer `goto` over clicking `navLink` — every nav item
shares that id. Paths like `/login-form` and full URLs both work.

A `fill` sets the control and dispatches one `input` or `change` (then blur), so
`CraftFieldDirective` validation and touched state run. A click is `act` with
only `id`. The batch runs in order and stops on the first error.

While `ng serve` rebuilds, the socket drops but the broker **keeps** the client
card. `page` waits until the tab is `ready` again (up to `timeoutMs`, default
20s). You do not poll.

## See also

- [Coding agents](/resources/ai-agents) — which MCP to use for docs vs the live tab
- [Architecture rules](/guide/testing/architecture) — unique interactive names
- [Observability](/guide/advanced/observability) — primitive traces, not DOM
