# Local log server

Receives logs from the demo application over HTTP and appends them to a local
JSONL file. It also archives debug sessions sent over a dedicated WebSocket and
serves their index and exports to the local dashboard. It does nothing else —
reading the technical logs back is the job of
[`@craft-ts/log-mcp`](../../packages/log-mcp/README.md).

```sh
npm run logs:server
```

## Endpoints

| Method   | Path            | Description                                     |
| -------- | --------------- | ----------------------------------------------- |
| `POST`   | `/logs`         | Ingest a batch. Answers `202 {"accepted": n}`.  |
| `DELETE` | `/logs`         | Delete the active and rotated log files.        |
| `GET`    | `/health`       | Target file and its current size.               |
| `GET`    | `/sessions`     | List archived sessions, newest update first.    |
| `GET`    | `/sessions/:id` | Load one session in replay export format.       |
| `DELETE` | `/sessions/:id` | Delete one archived session and its event file. |
| `GET`    | `/sessions/:id/thumbnails` | Manifest of the session's replay thumbnails.   |
| `POST`   | `/sessions/:id/thumbnails` | Prepare them (`?force=1` to start over).        |
| `GET`    | `/sessions/:id/thumbnails/:file` | One thumbnail, WebP.                      |
| `DELETE` | `/sessions/:id/thumbnails` | Cancel the preparation, drop the pictures.      |
| `WS`     | `/sessions/ws`  | Stream session start, events, and finish.       |

`POST /logs` accepts three body shapes: a `{ clientId, entries: [...] }`
envelope (what the demo sends), a bare array of entries, or a single entry.
Entries missing a known `level` are dropped individually — one bad entry never
rejects the whole batch. Browser access is limited to exact configured origins.
Defaults cover the local demo and dashboard on ports 4200, 4210, and 4301; set
`LOG_SERVER_ALLOWED_ORIGINS` to a comma-separated list when using other ports.
Requests without an `Origin` header remain available to local CLI tools.

## Storage

One JSON object per line in `.logs/app.jsonl`, oldest first. Each stored entry
keeps the browser `timestamp` and adds a server-side `receivedAt` plus an
incrementing `seq`. Once the active file exceeds `LOG_SERVER_MAX_FILE_SIZE` it
is rotated to `app.jsonl.1`, existing rotated files shift down one slot, and
anything past `LOG_SERVER_MAX_FILES` is dropped.

## Environment

| Variable                       | Default                      | Description                                         |
| ------------------------------ | ---------------------------- | --------------------------------------------------- |
| `LOG_SERVER_HOST`              | `127.0.0.1`                  | Listen address                                      |
| `LOG_SERVER_PORT`              | `4319`                       | Listen port                                         |
| `LOG_SERVER_DIR`               | `./.logs`                    | Storage directory                                   |
| `LOG_SERVER_MAX_FILE_SIZE`     | `5242880`                    | Rotation threshold, in bytes                        |
| `LOG_SERVER_MAX_FILES`         | `5`                          | Rotated files kept                                  |
| `LOG_SERVER_QUIET`             | unset                        | Set to `1` to silence ingest echo                   |
| `LOG_SERVER_ALLOWED_ORIGINS`   | local demo/dashboard origins | Exact browser origins allowed to access the server. |
| `DEBUG_SESSION_MAX_SESSIONS`   | `100`                        | Maximum archived sessions retained.                 |
| `DEBUG_SESSION_RETENTION_DAYS` | `30`                         | Delete sessions older than this many days.          |
| `DEBUG_SESSION_DASHBOARD_URL`  | `http://localhost:4210/`     | Dashboard the thumbnail worker opens to replay.     |
| `DEBUG_SESSION_THUMBNAILS`     | enabled                      | Set to `0` to disable the thumbnail worker.         |
| `DEBUG_SESSION_THUMBNAIL_MAX`  | `20`                         | Most thumbnails kept per session.                   |
| `DEBUG_SESSION_THUMBNAIL_WIDTH`| `480`                        | Thumbnail width, in pixels.                         |

`LOG_SERVER_DIR` and `LOG_SERVER_MAX_FILES` must match what the MCP server uses,
otherwise it reads a different set of files.

Debug sessions are kept separately in `apps/log-server/.debug-sessions/` when
started with `npm run logs:server` from the repository root. The dashboard can
delete an individual session; old sessions are pruned automatically by age and
count. `index.json`
contains list metadata, while each `<session-id>.events.jsonl` stores the
redacted events incrementally. Live sessions are marked `interrupted` after a
server restart or abnormal socket close; a page close or reload sends a finish
message. Pages sharing an origin and browser profile automatically share a
session id through local storage and join as separate participants. Each event
keeps its participant id and local sequence alongside the archive-wide
sequence, so concurrent pages append to one timeline instead of replacing one
another. Closing one page leaves the session recording while other participants
remain. After the last page closes, a short reconnect grace period allows a
reload to resume the same session. Hidden or blurred pages remain participants
without generating synthetic heartbeat events; their visibility state is
captured as participant metadata. Separate browser profiles have separate
local storage and therefore start separate sessions. Session event histories
are append-only and are not truncated by a per-session event-count or byte
limit. Whole sessions are still pruned by the configured age and session-count
limits.

The session WebSocket accepts only configured origins. The HTTP server binds to
loopback by default. Set `DEBUG_SESSION_DIR` to choose another archive folder.

## Replay thumbnails

When the dashboard opens a finished session it asks the server to prepare
thumbnails of the replay. The server drives a hidden Chromium (Playwright, loaded
on first use — install it next to the server, or the feature answers
`unavailable`) in a context of its own: it opens the dashboard on the session in
worker mode (`?replay-worker=1`), asks the dashboard for the capture plan, has
the replay advance to each moment, waits until the replayed page has stopped
mutating (400 ms of quiet, 4 s at most), and photographs that page's frame at
its recorded viewport. Pictures are scaled to the configured width and stored
as WebP, one file each, with a `manifest.json`, under
`<DEBUG_SESSION_DIR>/thumbnails/<session-id>/`.

- One recording is prepared at a time; the others queue.
- The cache key hashes the recording and the capture settings: a changed
  recording or setting prepares again, an unchanged one is served as is.
- A replay that diverges or fails keeps the pictures already taken and the
  manifest says where it stopped (`stoppedAtReplayIndex`); `POST ?force=1`
  retries.
- Sessions that are still recording or truncated answer `unavailable`.
- Deleting a session, or pruning it by age or count, removes its pictures.
- Thumbnails can show anything the application displayed: they stay on this
  machine, with the archive, and carry the same privacy caveats as the session.
