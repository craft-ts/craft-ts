---
name: craft-ts-logs-mcp
description: Inspect session recordings and application logs exposed by the CraftTS log server. Prefer session archive tools for a session shown in the debug dashboard; use logs.* for Console.* application telemetry. Use when a user refers to a recorded/replayable session, asks what the app logged, or needs to diagnose either data source.
---

# NG Craft Logs MCP

The local log server exposes two distinct evidence sources: archived debug sessions (the event timeline used by the dashboard's replay) and application log entries forwarded through Craft `Console.*`. Both are accessed through the log MCP, but they are not the same data. The archive is usually the right starting point when a user points to a session or asks to reproduce what happened; `logs.*` is for emitted application telemetry. A replay failure such as “no recorded response” belongs to the session replay path and must be checked against the archived HTTP events, not inferred from `logs.stats`.

The pipelines are documented in [apps/log-server/README.md](../../../apps/log-server/README.md), [packages/log-mcp/README.md](../../../packages/log-mcp/README.md), and [the guided-resume guide](../../../apps/docs/guide/ai/guided-resume.md). Read them before changing a mechanism or explaining its implementation.

## Choose the evidence source

- **Dashboard session / replay / reproduction:** use the session archive tools first. `session.story` reconstructs the recorded interactions, routes, calls and errors; `session.recordedCall` inspects a particular recorded request and response. Use `sessions.compare` only when the project and matching test are known. If the user wants to watch the recording again, the dashboard owns playback. If they want to resume the live app from a point, use the `craft-ts-guided-resume` skill. Do not start with `logs.stats` or treat application logs as the session timeline.
- **Application logging / Console errors / correlated runtime flow:** use the `logs.*` path below. These entries only include calls forwarded through Craft `Console.*` and have their own retention and time range.

The log server hosts both sources, so a session can exist even when `logs.stats` reports no logs for its time range, and application logs do not prove that the session archive contains a replayable response.

The two sources also classify records differently: archived session events have a `kind` (for example `dom`, `craft`, `http`, `navigation`, `route-activation`, or `snapshot`), while application log entries have a `level` (`debug`, `info`, `log`, `warn`, or `error`). `logs.search` supports filtering by `level`, not by session-event `kind`; use the `session.*` tools to inspect the archived timeline.

## Fast path: diagnose application logs

Use this path when the user asks about application logs or runtime telemetry. For a bug report that points to a recorded dashboard session, use **Choose the evidence source** first. This path reads runtime log evidence, not source code: do **not** read source files before checking the relevant logs.

1. `logs.stats` first. It tells you the total, the levels present, the emitting host tags (`byFrom`), the connected `clients`, and the covered time range. If `total` is `0`, jump to "No logs at all" below rather than searching.
2. `logs.search` with `level: ["error", "warn"]` to see failures before anything else.
3. Take the `correlationId` of the most relevant entry and search again on it alone. That returns every log of the same correlated flow, across components — this is the single highest-value filter in this pipeline.
4. Only then open the source of the host named in `from`.

Report the actual entries you found. Never describe a log you did not read.

## Know what is captured

Only calls through the craft `Console.*` boundary reach the log server. `provideLogForwarding()` in `apps/demo/src/app/app.config.ts` overrides the craft `ConsoleService`, so:

- `yield* Console.log(...)`, `Console.error(...)`, `Console.warn(...)`, `Console.info(...)`, `Console.debug(...)` are forwarded, with their craft metadata.
- Raw `console.log(...)` calls are **not** forwarded. They only appear in the browser devtools.
- `Console.trace/group/groupCollapsed/groupEnd/time/timeEnd` are not forwarded either: the boundary attaches no metadata to them.

State this explicitly when a user expects a log that never arrives — the usual cause is a raw `console.*` call, not a broken server.

## Cover a whole feature with provideFnWrapper

When the user wants logs across a feature rather than at one call site, do **not** sprinkle `Console.*` calls through the components. Add one `provideFnWrapper` in `apps/demo/src/app/app.config.ts`: it wraps every craft factory, so a single wrapper instruments the entire application at once — entry, exit, duration, and thrown errors included.

```ts
provideFnWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (factory, thisArg, args) {
    const from = yield* HostTag();
    const host = from[from.length - 1] ?? 'unknown';
    yield* Console.log('enter', host);
    try {
      return yield* factory.apply(thisArg, args);
    } catch (error) {
      yield* Console.error('failed', host, error);
      throw error;
    }
  },
),
```

`HostTag()` returns the **host tag ancestry array**, not a single name — the same value that lands in the `from` field of a stored entry. Its last element is the current host, for example `["route:list#1", "component:List#2"]`. Use it to know where the wrapper is running: log only the hosts a feature owns, put the tag in the message, or branch on the ancestry.

Two things to get right:

- Inside a wrapper, `yield* Console.*` already resolves `from`, `correlationId`, `route`, and `trace` from the injector on its own. You need `HostTag()` only to *read* the tag yourself — for filtering which factories you log, or for putting it in the message. It is not required to make `from` searchable.
- The wrapper must log through `yield* Console.*`, never raw `console.log`. The timing wrapper already in `app.config.ts` uses raw `console.log`, so its measurements never reach the store; converting it to `Console.log` makes the whole application's timings queryable through `logs.search`.

Register the wrapper, ask the user to reload, then investigate with `from` and `correlationId` as usual. Wrappers are cheap to add and cheap to remove — prefer one broad wrapper for an investigation over edits scattered across feature files, and remove it once the question is answered.

## Read an entry

Each stored entry carries:

- `level`, `message` (rendered arguments), `args` (JSON-safe originals).
- `from`: the craft host tag ancestry, for example `["service:UserQuery", "query"]` or `["App", "UserCard"]`. The last element is the emitting host.
- `correlationId`: the craft correlation metadata (`lastCorrelationId`, `mayCorrelatedIds`, `startCorrelationId`).
- `trace`: the stack with craft-internal frames already filtered out.
- `route`: the browser URL at emission time.
- `timestamp` (browser) and `receivedAt` (server, ISO 8601); `since`/`until` filter on `receivedAt`.
- `clientId`: the browser tab, stable across reloads via `sessionStorage`, shared with the function registry bridge.
- `seq`: server-side ordering.

## Choose the right filter

- `from` matches any tag in the ancestry, so `from: "UserCard"` matches an entry emitted with `["App", "UserCard"]`. Use it to scope to one component or service.
- `correlationId` matches a substring of the serialized correlation metadata. Use it to follow one flow end to end.
- `text` searches the message **and** the serialized arguments, so an id or a payload field is searchable.
- `clientId` separates browser tabs. When `logs.stats` reports more than one client, always pass it — otherwise you mix two sessions.
- `since`/`until` take ISO dates and filter on server receive time.
- Filters combine with AND. Results come back newest first; `logs.tail` returns oldest first, like `tail -n`.

Prefer one broad `logs.search` over several narrow ones. Do not call `logs.tail` and `logs.search` for the same question.

## Run a clean reproduction

When the stored logs are noisy or predate the change under investigation:

1. `logs.clear` to delete every file, rotated ones included.
2. Ask the user to perform the exact steps, or drive the demo yourself with the browser tools when authorized.
3. `logs.tail` to read the result in emission order.

Warn the user before `logs.clear`: it is destructive and there is no undo.

## No logs at all

Work down this list before suspecting the MCP server:

1. The log server is not running. It is not started by `nx serve demo`. Ask the user to run `npm run logs:server`, or check `curl -s http://127.0.0.1:4319/health`.
2. `LOG_SERVER_DIR` disagrees between the two processes. The MCP server reads `<cwd>/.logs` by default; if the log server was started from another directory or with a different `LOG_SERVER_DIR`, they point at different files. `logs.stats` reports the `files` it actually read — compare them with the server's `/health` output.
3. `LOG_SERVER_MAX_FILES` differs between the two, so rotated files are invisible to the reader.
4. The demo has not been reloaded since `provideLogForwarding()` was added.
5. The code path emits raw `console.*`, not `Console.*`. See "Know what is captured".
6. Entries are still buffered in the browser: the forwarder flushes every second or every 50 entries. A log emitted under a second ago may legitimately be absent.

## Respect the runtime contract

- The forwarder never throws into the application. A failed send drops the batch silently rather than retrying, so a log server started late will not receive what was emitted before it came up.
- The buffer is capped at 1000 entries; beyond that the oldest are dropped. A long offline session loses its beginning, not its end.
- Arguments are made JSON-safe before shipping: `Error` becomes `{name, message, stack}`, cycles become `"[Circular]"`, functions become `"[Function name]"`, and nesting is capped at depth 6 with `"[Depth limit]"`.
- A truncated trailing line — the server writing while the reader reads — is skipped, not reported as an error.
- Rotated files are read oldest first, then the active file, so ordering is stable across a rotation.
- This is a loopback development tool: CORS is wide open and there is no authentication. Do not present it as production observability.

## Verify implementation changes

Run the tests for the layer you touched:

1. `npm test --workspace @craft-ts/log-server` for ingestion, batch parsing, JSONL storage, and rotation.
2. `npm test --workspace @craft-ts/log-mcp` for the reader filters and the MCP tool surface.
3. `npx nx test demo` for the forwarder: metadata extraction, level coverage, batching, buffer bounds, and safe serialization.

When changing the wire format, update `apps/log-server/src/log-entry.ts` and `packages/log-mcp/src/log-reader.ts` together — they define the same shape on each side and are not shared code.
