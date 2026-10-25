# @craft-ts/playwright-sessions

Playwright fixture and versioned local history for captured Craft debug
sessions. A green test keeps its session; a red test is compared with the green
ones, and the Playwright report says where the red run leaves what every green
run has in common.

## Declaring a test

Re-export the package from a small local fixture module, then give every test
a stable id:

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

- `id`: lowercase, dot-separated, 80 characters at most, unique across every
  Playwright config of the workspace that uses the fixture.
- `keep`: how many distinct green journeys stay in the history (1 to 10).
  Above one, `reason` says why the test has several normal journeys.
- `capture: 'none'`: for a test that does not load an app with Craft capture.
- `craftSessions.newContext()`: an extra browser context that joins the same
  session (a second participant). `browser.newContext()` would not.
- `craftSessions.step(label, body)`: a Playwright step and a marker in the
  trace. The fixture records the marker itself (`Date.now()`), so a step that
  runs before the page has loaded is still placed; pages with capture also
  receive it.
- `craftSessions.runId`: the UUID of this attempt, stored in the session's test
  metadata (`GET /sessions?testId=…&runId=…` returns this attempt only).

The `craft-ts/e2e-session-contract` ESLint rule checks this form file by file
(set `fixtureFiles` to the fixture module's path). `assertE2eSessionContract`
from `@craft-ts/playwright-sessions/architecture` checks it across files:
unique ids over every config found by `findCraftSessionConfigs`, histories that
match their annotation, no orphan folder, size budgets.

## Modes

| Mode | Green test | Red test |
| --- | --- | --- |
| `update` (local default) | writes the session when its normalized trace is new | compared |
| `compare` (default when `CI` is set) | nothing | compared |
| `off` | nothing | nothing |

`CRAFT_SESSIONS=update|compare|off` overrides the default. Only `failed`,
`timedOut` and `interrupted` tests are compared; a skipped test does nothing.
To accept a new green journey, run with `CRAFT_SESSIONS=update`, review the
`__sessions__` diff and commit it with the test change. Two identical green
runs leave the files untouched.

Worker options (`use: { craftSessionsOptions }`): `serverUrl`, `dashboardUrl`,
`budgetBytes`, `update: 'never'`, `replayBaselineOnFailure`.

## Storage

Histories live next to each Playwright project, always in
`<testDir>/__sessions__/<test-id>/<project>/`: a `history.json` and one
deterministic gzip export per kept run. Each run entry records the commit, the
retry, the fixture markers, the normalizer version, and `dirty` — whether the
checkout had changes outside `__sessions__` when the worker started. Stored
trace hashes are not trusted: kept sessions are normalized again on read, so a
history written by an older normalizer is compared fairly.

## How a session is found

The fixture gives every context a fresh session UUID and the test metadata
before the app's scripts run. Each page reports its effective id (the archive
may redirect it) as soon as the archive confirms it, so a page the test closes
is still found. At the end of the test, every open page finishes first; then
each distinct id is fetched once, by that exact id — a 404 is retried on the
same id until a deadline, never replaced by another run of the test. Several
distinct ids for one test are reported: the session was split.

## Reading a failure

A compared test gets these attachments:

- `craft-session-diff.md`: the first divergence (expected and observed, with
  the fields in cause), every finding grouped by kind (absent from the run,
  changed value, new, extra occurrence, slower), the number of noise steps,
  a link to the dashboard's comparison view, and a warning when the history has
  a single reference, which cannot tell normal variation.
- `craft-session-diff.json`: the same comparison, plus the baseline replay.
- `craft-session.json.gz`: the observed session.

With `replayBaselineOnFailure`, the latest green reference is replayed on the
current build through the dashboard's worker contract (at most 60 s, added to
the test's timeout). When it replays without a gap, the difference most often
comes from the real responses (data, back end, environment). The replay runs
with `?replay-verify-state=1`: the state owned by a method it replays (a
service's state changed by `add`) is checked against the recorded change, so a
method that no longer produces it shows as a gap. It does not prove everything
about the front end: it calls those methods without going through click
handlers (an unwired button passes), and it restores the other recorded state
changes (queries, responses) instead of recomputing them. When it diverges or
stops on an error,
the front end changed the journey, and the report quotes the replay's first
gap or error. A replay that stops answering is reported as such, with no
conclusion.

The `sessions.compare` tool of the logs MCP and the dashboard's `#/compare`
view show the comparison computed by the log server with the same module.

## Not done yet

Committed sessions are not redacted. The pilot only holds demonstration data;
review sessions for credentials or personal data before using the mechanism on
an application with real data.

## Tests

```sh
npx vitest run --config libs/playwright-sessions/vitest.config.ts
```
