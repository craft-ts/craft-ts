---
name: ng-craft-dev-page-mcp
description: Drive and inspect the already-open ng serve tab through the function-registry MCP tool `page`. Use when a coding agent must fill, click, goto a route, or read named controls on the local demo; debug layout with detail dom-styles; wait through an ng serve reload; or choose between page and registry.* primitive tools. Prefer this over Playwright or Chrome DevTools for the tab that is already open.
---

# Live page MCP

Operate the tab the developer already has open. Do **not** open Playwright, a second browser, or Chrome DevTools for this. The tool is `page` on `@ng-craft/function-registry-mcp` (`npm run registry:mcp`). It does not exist on `@craft-ng/mcp`.

Cursor loads skills from `.cursor/skills/`. This file is mirrored at `.cursor/skills/ng-craft-dev-page-mcp/SKILL.md`.

## Fast path

1. Call `page` with no `act` (omit `clientId` when **exactly one tab is `ready`**). A ghost `reloading` card (HMR, F5) does not count. That always asks the live tab — do not assume a previous dump is still true.
2. Navigate with `goto` when the control you need is on another route. Do not click `navLink` (every nav item shares that id).
3. Act with the `id` values from that surface (`data-craft-name`, the helper literal).
4. One round-trip: `act` then the new state.

```json
{
  "act": [
    { "goto": "/login-form" },
    { "id": "email", "fill": "ada@example.com" },
    { "id": "password", "fill": "secret1" },
    { "id": "submit" }
  ]
}
```

- `goto` is in-app (Craft router). The WebSocket stays up. Paths like `/login-form` and full URLs both work.
- `fill` is not key-by-key typing. Click is `act` with only `id`.
- Repeated `id` inside `each`: pass `match.index` or `match.track`. An unambiguous id needs no `match`.
- Default `detail` is `"controls"`. Use `"dom-styles"` only for a visual/CSS bug.
- `page` waits through `ng serve` reload (`reloading` → `ready`). Do not poll through `reloading`. Timeout looks like `page reloading since 12s, last url /login-form, generation 4 → still 4`.
- Closing the tab sends `page/goodbye`; the card is dropped. Opening a new tab is a new id. Duplicating a tab copies `sessionStorage`; the broker assigns a new id (`hello/ok`) so the two tabs do not fight. Closing without goodbye (crash) looks like reload for up to 20s.
- If `page client "<id>" is not connected`, call `registry.clients` and retry without id when a single ready remains.
- If `Multiple ready page clients`, pass `clientId` from `registry.clients` (id, status, url). Never guess “the latest tab”.
- Zero ready with several ghosts: `No ready page client. Reloading: <id> (last url <url>), <id> (last url <url>)`. Do not wait.

## When to switch to `registry.*`

Use `page` to behave like a user. Use `registry.query.update`, `registry.call`, `registry.override`, … to mutate primitives **without** the UI. Do not `registry.call` a button handler to click it.

See [guide/ai/dev-page](../../../apps/docs/guide/ai/dev-page.md) and the sibling skill `craft-ng-runtime-change-web-mcp` for primitive mutations.
