# CraftTS local session dashboard

The dashboard is a separate CraftTS app. It reads `craft-debug-session` JSON in
the browser, accepts v1 and v2 exports, and can browse sessions captured by the
loopback debug server. Session data stays on the local machine.

## Run it with the demo

Start the debug server, demo, and dashboard in three terminals:

```sh
mkdir -p tmp
npm run logs:server
npx vite --config apps/demo/vite.config.ts
npx vite --config apps/debug-session-dashboard/vite.config.ts
```

Open `http://localhost:4210` and connect to the local demo in the iframe. The
demo streams each redacted session event to `ws://127.0.0.1:4319/sessions/ws`.
The server appends events under `.debug-sessions/`, updates `index.json`, and
marks sessions completed on page close/reload or interrupted if the connection
disappears. The dashboard refreshes the local session list automatically; select
a row to open its dedicated detail page and replay it. The list lives at `#/`
and archived session details at `#/sessions/<id>`, so a detail URL survives a
refresh. Manual JSON imports open a detail view too. Export remains available.

Pages on the same origin and browser profile are grouped automatically into
one archive session. The event list can show the merged timeline or filter to
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
target URLs. The URL mode reloads the recorded start URL before replay; snapshot
mode restores the initial Craft primitive snapshot after the bridge handshake.
URL-mode replay adds the `craft-debug-replay=1` query marker. Capture stays
active in memory for comparison, but the provider does not open an archive
WebSocket for that replay page. Replay pauses archive event persistence until
it completes or is stopped. At a detected difference it remains paused so the
session cannot be polluted by replay activity and can be inspected or recovered.
The iframe must be permitted by the target app's `frame-ancestors` policy.

Exports are redacted and retain the existing event/byte limits. Truncated
sessions can be inspected but cannot be replayed. V1 files remain importable;
new files use v2 and carry monotonic elapsed offsets. Clicks on links retain the
redacted absolute `href` in the DOM event, in addition to router events. This
helps identify the intended destination even if navigation did not occur.
Input and textarea values are omitted by default. To capture a specific field
for replay, add `data-debug-session-capture-value="true"` to that element or
explicitly set `captureInputValues: true` in
`provideCraftDebugSessionCapture`. Password and secret-named fields remain
excluded. Error stacks are never retained, and error messages are scrubbed for
common secret assignments and email addresses. The dashboard can delete one
archived session; the local server also prunes sessions older than 30 days or
when the archive exceeds 100 sessions by default.

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

Craft calls are currently compared by their recorded names, phases, and order.
The replay does not invoke absent calls from exported data: session exports
are not executable input. Interaction-level causal grouping and allowlisted
replayable function identifiers are not yet provided by this bridge.
The local server binds to `127.0.0.1`; set `DEBUG_SESSION_DIR` to choose another
archive folder.
