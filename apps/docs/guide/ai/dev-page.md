# Live page MCP

The running development tab publishes its named controls. A coding agent fills,
clicks, and inspects **that** page — no second browser, no DOM reverse-engineering.

**Use it when** a Cursor agent must drive or inspect the `ng serve` tab you
already have open.
**Not when** you are writing Craft away from a running app — use
[`@craft-ng/mcp`](/resources/ai-agents) for docs and skills. **Not when** you
want to mutate a primitive without the UI — use the `registry.*` tools on the
same local MCP.

## Connect the local MCP

The tool lives on `@ng-craft/function-registry-mcp`, not on the published
`@craft-ng/mcp` docs server. From the ng-craft repo:

```sh
npm run registry:mcp
```

Point Cursor at that stdio server. It already listens on `ws://127.0.0.1:3333`
for the demo tab. Each tab keeps a stable `clientId` in `sessionStorage`. Call
`page` without `clientId` when exactly one tab is connected; pass it when several
are.

## One tool: `page`

Omit `act` to read the current surface. Pass `act` to run a batch, then receive
the **new** state in the same round-trip.

Default `detail` is `"controls"`: the named interactive surface (id, role,
accessible name, value, enabled, index, and `track` when the node is inside
`each`). Pass `detail: "dom-styles"` only to debug layout or CSS — it is large
and opt-in.

`id` is the literal local name from the helper:

<<< @/tests/snippets/guide/ai/dev-page/save-button.spec.ts#save-button

That name is unique in the app graph
(`assertInteractiveElementNamed`). The renderer writes `data-craft-name="save"`.
Do not prefix it with the component name. When `each` repeats the same id, pass
`match.index` or `match.track`.

## Fill, click, ready

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
