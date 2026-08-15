---
name: ng-craft-dev-page-mcp
description: Drive and inspect the already-open ng serve tab through the function-registry MCP tool `page`. Use when a coding agent must fill, click, or read named controls on the local demo; debug layout with detail dom-styles; wait through an ng serve reload; or choose between page and registry.* primitive tools.
---

# Live page MCP

Operate the tab the developer already has open. Do **not** open Playwright or Chrome DevTools for this. The tool is `page` on `@ng-craft/function-registry-mcp` (`npm run registry:mcp`). It does not exist on `@craft-ng/mcp`.

## Fast path

1. Call `page` with no `act` (omit `clientId` when a single tab is connected).
2. Act with the `id` values from that surface (`data-craft-name`, the helper literal).
3. One round-trip: `act` then the new state.

```json
{
  "act": [
    { "id": "email", "fill": "ada@example.com" },
    { "id": "password", "fill": "secret1" },
    { "id": "submit" }
  ]
}
```

- `fill` is not key-by-key typing. Click is `act` with only `id`.
- Repeated `id` inside `each`: pass `match.index` or `match.track`. An unambiguous id needs no `match`.
- Default `detail` is `"controls"`. Use `"dom-styles"` only for a visual/CSS bug.
- `page` waits through `ng serve` reload (`reloading` → `ready`). Do not poll. Timeout looks like `page reloading since 12s, last url /login-form, generation 4 → still 4`.

If several tabs are connected, call `registry.clients` (or read the ambiguity error), pick `clientId`, and pass it to `page`. Never guess “the latest tab”.

## When to switch to `registry.*`

Use `page` to behave like a user. Use `registry.query.update`, `registry.call`, `registry.override`, … to mutate primitives **without** the UI. Do not `registry.call` a button handler to click it.

See [guide/ai/dev-page](../../../apps/docs/guide/ai/dev-page.md) and the sibling skill `craft-ng-runtime-change-web-mcp` for primitive mutations.
