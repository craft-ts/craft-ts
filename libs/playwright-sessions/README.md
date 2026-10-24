# @craft-ts/playwright-sessions

Playwright fixture and versioned local history for captured Craft debug sessions.

Add the workspace package to a Playwright project and re-export its API from a
local fixture module:

```ts
import { test, craftSession } from './fixtures';

test('place an order', {
  annotation: craftSession({ id: 'shop.checkout', keep: 1 }),
}, async ({ page, craftSessions }) => {
  await craftSessions.step('open checkout', async () => {
    await page.goto('/checkout');
  });
});
```

Each spec imports `test` and `craftSession` from a small local fixture module
that re-exports this package. IDs are stable, lowercase names, unique across
the Playwright configs covered by `assertE2eSessionContract`. `keep` retains up
to ten distinct normalized traces; `reason` is required above one. Use
`capture: 'none'` for tests that do not load an app with Craft capture.

The fixture injects a fresh session UUID and test metadata before app scripts
run, waits for capture to finish, and saves the portable v6 export under
`<testDir>/__sessions__/<id>/<project>/`. A successful local run writes only
when its normalized trace is new. CI defaults to comparison and never writes.

`CRAFT_SESSIONS=update|compare|off` overrides the mode. Local runs default to
`update`; CI runs default to `compare`. Set the worker option
`craftSessionsOptions` in Playwright `use` to choose a store directory, server
URL, size budgets, or `update: 'never'`.

The history contains `history.json` and deterministic gzip files. Commit these
files when intentionally updating the reference. A failed comparison attaches
Markdown, JSON, and the observed portable session to the Playwright report.

Run the contract and history unit tests with:

```sh
npx vitest run --config libs/playwright-sessions/vitest.config.ts
```

Run the cross-config and history checks with `assertE2eSessionContract` from
`@craft-ts/playwright-sessions/architecture`.

## Modes and updates

| Mode | Behavior |
| --- | --- |
| `update` | Local default. A green test writes a new normalized trace; an identical trace is left untouched. |
| `compare` | Reads the current test history and attaches a comparison when the test fails. |
| `off` | Captures and reports no session history. |

`CRAFT_SESSIONS=update|compare|off` selects a mode for a run. `CI` defaults to
`compare`, so CI never edits references. To intentionally accept a new green
journey, run `CRAFT_SESSIONS=update npx playwright test ...`, inspect the
`__sessions__` diff, then commit it with the test change. `keep` bounds how many
distinct successful journeys remain for a test and project.

## Reading a failure

The Playwright report attaches `craft-session-diff.md`, the machine-readable
`craft-session-diff.json`, and the observed `craft-session.json.gz`. The Markdown
report identifies stable missing or changed steps, newly observed errors,
timing outliers, and steps that varied among green references. A history with
one reference cannot identify normal variation. The optional `sessions.compare`
log MCP tool returns the same trace comparison and a dashboard URL. The
dashboard URL is useful for locating the run; interactive side-by-side replay
is not implemented yet.

## Storage and limits

By default files live next to each Playwright project under
`<testDir>/__sessions__/<test-id>/<project>/`. `history.json` lists normalized
trace hashes and gzip exports. `craftSessionsOptions.store` overrides this
location. The fixture checks its configured per-session and per-test byte
budgets before writing. Treat committed sessions as test fixtures: review them
for credentials or personal data before accepting history changes.
