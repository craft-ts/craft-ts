# CraftTS local session dashboard

The dashboard is a separate CraftTS app. It reads `craft-debug-session` v7 JSON in
the browser and can browse sessions captured by the
loopback debug server. Session data stays on the local machine.

Playwright's `@craft-ts/playwright-sessions` package can attach normalized
history comparisons to failed test reports. The `sessions.compare` MCP tool
returns the comparison and a dashboard URL for the observed session. The
`#/compare?test=<id>&project=<project>&run=<sessionId>` route compares the
observed run with its green history. It shows the latest green reference beside
the observed session; selecting a finding seeks both isolated replay frames to
the corresponding elapsed time. The package can also replay the latest green
reference on the current build after a Playwright failure and attach the result.

## Run it with the demo

Start the debug server, demo, and dashboard in three terminals:

```sh
mkdir -p tmp
npm run logs:server
npx vite --config apps/demo/vite.config.ts
npx vite --config apps/debug-session-dashboard/vite.config.ts
```

## The screens

The dashboard is drawn with the Herbier design system (`@craft-ts/ui`): its
theme, its buttons, callouts, badges, tabs, switch and dialog, in light or dark.
The layout lives in `src/dashboard.style.ts`.
The floating _✦ Report_ launcher opens the AI context chat on dashboard pages;
the replay page keeps _Report_ in its playback bar instead.

- **Sessions** (`#/`) is a plain list: when it was recorded, how many tabs and
  events, visible format/replay version badges, and a warning when those
  versions cannot be replayed by this dashboard. Incompatible sessions can be
  removed together; _Importer un fichier_ opens a dialog for a JSON export.
- **The replay** (`#/sessions/<id>`) is the page: the recorded app fills the
  window, and the timeline lies over its foot, the way a video's controls do: a bar that shows how far the replay is and takes it to any moment with a
  click (or the arrow keys, an action at a time), with the clock, the step and
  the next action under it. The thumbnails the archive prepares are points on
  that bar; hover or focus one to see its picture, click it to go there. Under
  the frame, the playback bar holds a play/pause/resume button, restart, next
  action and the assistant's _Report_ button. A tab selector appears only when the
  session has several replayable tabs.
- **A gap with the recording** is the one thing that interrupts the replay: it
  shows up as a callout above the stage, with the recovery actions and the
  expected/observed values one click away.
- **The journal** is a side panel, closed by default. It lists only the errors
  of the recording (failed requests, navigations, primitives); _Tout afficher_
  shows every event, with the slow tasks marked. The _Journal_ button turns
  tonal when the recording holds errors. The **Détails** tab holds the start
  page, the replay state, the viewport, the target URL, the start mode and the
  export of the target.

Open `http://localhost:4210` and connect to the local demo in the iframe. The
demo streams each redacted session event to `ws://127.0.0.1:4319/sessions/ws`.
The server appends events under `.debug-sessions/`, updates `index.json`, and
marks sessions completed on page close/reload or interrupted if the connection
disappears. The dashboard refreshes the local session list automatically; select
a row to open its dedicated detail page and replay it. The list lives at `#/`
and archived session details at `#/sessions/<id>`, so a detail URL survives a
refresh. Manual JSON imports open a detail view too. Export remains available.

Pages on the same origin and browser profile are grouped automatically into
one archive session. The journal can show the merged timeline or filter to
one participant tab. The default replay opens a synchronized iframe for each
participant and follows the shared timeline, including participants that join
later; selecting one participant remains available for focused inspection.
Each participant keeps its own URL, viewport, initial snapshot, clips, and
best-effort browser environment profile. A hidden or blurred tab remains
attached to the session but contributes no events while idle. Different browser
profiles have isolated storage and create separate sessions.

The environment profile includes the user-agent, detected browser and version,
best-effort engine family, platform, viewport, device-pixel ratio, screen size,
language, and timezone. The dashboard warns when the current replay browser
differs from the recording. Replay runs in the browser that hosts the dashboard:
changing the iframe user-agent would not change its browser engine, so the
dashboard does not spoof it. Launching a separately installed browser with a
matching engine/version requires a local browser-driver/launcher and is not
provided yet.

When a page closes, it sends final clip metadata and a completion notice over
the WebSocket and also posts a small `keepalive`/`sendBeacon` finish request to
the local archive. The server treats this as an idempotent confirmation, so a
late WebSocket close cannot downgrade a confirmed completion to interrupted.
If the local server itself is unavailable at close, the session can still be
marked interrupted; the current page does not retain a durable offline outbox.

`npm run e2e:debug-session -- --project=chromium` runs the Chromium suite using
installed Google Chrome. The Playwright config also defines `firefox` and
`webkit` projects; install their Playwright browser builds with
`npx playwright install firefox webkit` before running the full matrix.

The demo opts into capture and the iframe bridge in
`apps/demo/src/app/app.config.ts`; other applications must explicitly install
`provideCraftDebugSessionCapture({ webSocketUrl: 'ws://127.0.0.1:4319/sessions/ws' })`
and `provideCraftDebugReplayBridge({ parentOrigins: [...] })`.

The bridge accepts only messages from its actual parent window and the exact
origins listed by the target application. The dashboard rejects non-local
target URLs. Both start modes restore recorded browser storage, Craft primitive
values, and registered persister contents. URL mode uses the recorded start
URL; snapshot mode uses the selected target URL and requires a Craft snapshot.
The dashboard sends the v7 session to a replay-marked target before application
bootstrap is released. If browser storage must be restored, the target restores
it and reloads first. The bridge primes Craft and persister snapshots and
installs recorded HTTP, fetch, WebSocket, and Worker outcomes before root
components and loaders start. A missing method, ambiguous address, unavailable
snapshot, or unrecorded transport fails explicitly without a live network
fallback. Replay uses invocation mode: captured DOM actions and scroll changes
are visual cues only; click, keyboard, pointer, input, change, and application
scroll handlers are not dispatched. Field values are assigned for display.
Capture stays active in memory for comparison, but the provider does not open an
archive WebSocket for that replay page. Replay pauses archive event persistence
until it completes or is stopped. At a detected difference it remains paused
so the session can be inspected or recovered.
The iframe must be permitted by the target app's `frame-ancestors` policy.

For two concurrent `CraftHttpClient` requests with the same method, URL,
parameters, and body, set distinct stable `replayKey` values in their request
options. The key is serialized in the archive and must not contain a secret.
The replay validator leaves sessions without distinct keys inspectable, but
refuses to replay an overlapping identical request pair.

Exports use format v7 and replay contract v1, and retain the existing
event/byte limits. The session list shows both versions and marks a replay
incompatible when the dashboard does not support its format or replay contract.
Older exports without a `replayVersion` are treated as replay v1. Truncated
sessions can be inspected but cannot be replayed. Formats v1–v5 cannot be
replayed because the required migration chain is not registered. The dashboard
explicitly migrates v6 exports to v7. The v7 schema adds versioned
reference metadata for redacted network values; migrated v6 exports remain
replayable without that metadata.
Events carry monotonic elapsed offsets. Clicks on links retain the
redacted absolute `href` in the DOM event, in addition to router events. This
helps identify the intended destination even if navigation did not occur.

The component package compiles a v1 replay plan before the controller starts.
`compileReplayPlan(session)` returns executable commands, causal dependencies,
expected observations, and preflight issues. The controller exposes its plan
through `plan()`. `executeReplayPlan` accepts application-owned command
adapters and waits for terminal observations with a bounded timeout. The
dashboard shows this plan beside the existing timeline.

Stable restart points use the versioned `craft-debug-replay-snapshot` v1
contract. Applications can call `recordReplaySnapshot(session, input)` at a
known stable boundary, or opt into automatic capture with
`captureReplaySnapshots: { appVersion }` in
`provideCraftDebugSessionCapture`. Automatic capture coalesces session and
primitive notifications, then records route, primitive registry state, and
persisted storage only when Craft invocations and resource states are settled.
Snapshot replay selects the latest validated checkpoint and restores its state
before later interactions. Validation rejects incomplete or redacted snapshots.

Before replay, the target application checks recorded route, invocation, and
deferred activation addresses against its current router and runtime registries.
Missing and ambiguous targets are reported as preflight issues before a command
is run. Independent commands at the same timeline boundary can execute
concurrently; causal dependencies still serialize commands that depend on one
another.

Craft-rendered interaction targets use an opaque fingerprint of the interpreter
render path. The replay resolves it against the current live render index and
never substitutes a CSS match when that identity is missing or ambiguous. CSS
selectors and viewport coordinates remain diagnostic and visual fallbacks.
Input, textarea, and select values are omitted by default. To capture
non-sensitive values for replay, add `data-debug-session-capture-value="true"`
to a field or set `captureInputValues: true` in
`provideCraftDebugSessionCapture`. Password inputs and fields named or
identified with `password`, `secret`, `token`, `authorization`, or `cookie`
remain excluded unless sensitive capture is separately opted in. Set
`captureSensitiveInputValues: true` alongside `captureInputValues: true` to
include those fields, or add
`data-debug-session-capture-sensitive-value="true"` to one specific field.
Both global options default to false. The demo enables both only in its
development providers; session data goes to the configured debug server, which
defaults to loopback. Production providers do not install session capture.
Sensitive values become part of the archive and any exported session, so
review this setting before enabling it in a production build or sharing an
export.

For single native selects, the recording also keeps the pointer/keyboard
intent that opens or closes the picker. Replay displays a temporary DOM
representation of the available options for that interval; the application
control remains a native `<select>`, and replay does not invoke its handlers a
second time. The browser's own popup is not reopened because browsers require a
fresh trusted user gesture for that UI.

Opted-in checkbox and radio changes also retain their checked state. Native
`<details>`, `<dialog>`, and popover open/close transitions are recorded and
restored as presentation state. Date, time, and color picker intent gets a
temporary replay cue; the operating system/browser picker itself is not
reopened. File-picker intent gets the same cue, and a selected-file event keeps
only the file count: file names and contents are never captured, and the replay
warns that the selection cannot be restored. Other text-like controls,
including range and number inputs, use the existing opt-in value capture.

The demo also opts into `captureBrowserStorage` only when its configured debug
server URL points to loopback. This captures readable `localStorage`,
`sessionStorage`, accessible cookies, and enumerable IndexedDB databases at
startup. These values are not covered by the field redactor and can contain
secrets; treat archives and exports as sensitive. The option defaults to false
in `provideCraftDebugSessionCapture`. Replay preparation stops before app
bootstrap if local/session storage or readable cookies could not be captured,
if IndexedDB could not be enumerated, or if any database could not be captured.
A Cookie Store API warning can fall back to `document.cookie`; successful
fallback capture remains restorable. During replay, captured storage replaces
target-origin entries and databases, including entries absent from the
recording.

Browser APIs limit what can be captured: JavaScript cannot read `HttpOnly`
cookies, and `document.cookie` fallback cannot recover every cookie attribute.
The Cookie Store API preserves more attributes when the browser provides it.
IndexedDB enumeration depends on `IDBFactory.databases()`; databases that are
blocked or cannot be serialized are reported as warnings and are not silently
presented as captured. This remains a local development feature; disable the
option and sensitive input capture before using session capture outside a
trusted local environment.

Error stacks are never retained, and error messages are scrubbed for common
secret assignments and email addresses. The dashboard can delete one archived
session; the local server also prunes sessions older than 30 days or when the
archive exceeds 100 sessions by default.

Scroll capture samples movement at most every 100 ms and ignores changes of
two pixels or less between samples. Before pointer, keyboard, or form actions,
and when capture stops, it records the current final position so the next
interaction starts at the recorded content. For element scrolling, selectors
prefer a unique `id`, then a unique `data-replay-id`, `data-craft-name`,
`data-testid`, `data-test`, or `data-cy` on the actual scrolling element.
`data-replay-id` is the explicit stable hook when an element has no suitable
`id`; structural `nth-of-type` paths are the fallback.

When replay reports a difference, **Forcer l’état attendu et continuer** is
available if the recording contains a link destination or a primitive
checkpoint. It navigates through the target app's Craft router to a recorded
same-origin `href`, restores the recorded values for primitives still present,
then resumes at the next interaction. The dashboard does not hide the
difference: forcing is explicit, and the detail panel shows the expected and
observed values first. Destinations containing redacted secret parameters,
cross-origin destinations, or apps without a Craft router cannot be forced.
When a later primitive checkpoint has identities compatible with the current
registry, **Ignorer jusqu’au prochain point de reprise** can restore that
checkpoint and continue in pause. The action is hidden when an HTTP request or
Craft operation remains open before the checkpoint, or when there is no later
interaction to resume. The dashboard keeps a replay-partial annotation with
the skipped interaction interval and checkpoint; a skip does not assert that
the omitted portion matched the recording.

Craft `method:*`, read-only `query:*`, and `mutation:*` invocation counts are not
replay gates: route initialization, cache hits, missing legacy form values, and
async view settling can change their order or count. Comparable primitive state
and recorded HTTP results remain part of the replay and still report observable
divergence. The replay does not invoke absent calls from exported data:
session exports are not executable input. Interaction-level causal grouping
and allowlisted replayable function identifiers are not yet provided by this
bridge.
The local server binds to `127.0.0.1`; set `DEBUG_SESSION_DIR` to choose another
archive folder.

## Styling and checks

The dashboard has no CSS file and no inline CSS. Everything is drawn with the
design system: `src/dashboard.style.ts` declares the sheet (`craftStyles`), the
states are axes (`data-tile-focus`, `data-veil`, `data-frame-scheme`, `data-entry`)
and what only the browser can know (the scaled size of a replayed page, where a
click landed, how far the replay got) goes through typed custom properties
written with `assign(...)`.

Hooks for the end-to-end tests are `data-lab="…"` attributes, never classes.

```bash
npx nx run debug-session-dashboard:lint
npx nx run debug-session-dashboard:architecture
npx nx run debug-session-dashboard:typecheck-architecture
```

`eslint.config.mjs` takes the `style`, `a11y`, `security` and `typedCss` presets
for every file under `src`, and `recommended` for the code. `architecture/`
runs the declarative architecture rules, the design-system ones included.

No file is exempt from them: there is no ESLint override, no `eslint-disable`
and no architecture waiver. The replay engine is split by what it is:

- `session-archive.service.ts` and `replay-route.service.ts` are `craftService`s:
  the archive goes through `CraftHttpClient` (a `query` for the list and for one
  session, a `mutation` for deletion that the list reacts to), refreshed by the
  Craft temporal runtime; the route owns the address, resolves the temporal
  runtime and the `BrowserLocation`/`BrowserCrypto` boundaries once, and turns an
  answer of the archive into the open recording.
- `replay-model.ts` (pure), `replay-state.ts` (the signals), `replay-playback.ts`,
  `replay-bridge.ts` and `replay-session.ts` are the engine. They never touch the
  browser: every payload that crosses a window boundary is checked where it
  enters, so there is no type assertion and no `!` to excuse.
- `replay-browser.ts` is where the engine meets the browser, and names no global
  (`window`, `document`, `performance`, `crypto`, `location`). Time, ids and the
  hash come from the platform the route service installs; the replayed page's
  window, its frames and every DOM lookup come from the `replayHost` node
  directive, mounted on the root element, which hands over the element's DOM
  adapter and listens to `message` and `hashchange`.
- The view is a tree of small components (`dashboard.ts`, `sessions-page.ts`,
  `replay-page.ts`, …), none of which reaches the browser.
