# Local log server

Receives logs from the demo application over HTTP and appends them to a local
JSONL file. It does nothing else — reading the logs back is the job of
[`@craft-ts/log-mcp`](../../packages/log-mcp/README.md).

```sh
npm run logs:server
```

## Endpoints

| Method   | Path      | Description                                        |
| -------- | --------- | -------------------------------------------------- |
| `POST`   | `/logs`   | Ingest a batch. Answers `202 {"accepted": n}`.      |
| `DELETE` | `/logs`   | Delete the active and rotated files.                |
| `GET`    | `/health` | Target file and its current size.                   |

`POST /logs` accepts three body shapes: a `{ clientId, entries: [...] }`
envelope (what the demo sends), a bare array of entries, or a single entry.
Entries missing a known `level` are dropped individually — one bad entry never
rejects the whole batch. CORS is wide open: this is a loopback dev tool.

## Storage

One JSON object per line in `.logs/app.jsonl`, oldest first. Each stored entry
keeps the browser `timestamp` and adds a server-side `receivedAt` plus an
incrementing `seq`. Once the active file exceeds `LOG_SERVER_MAX_FILE_SIZE` it
is rotated to `app.jsonl.1`, existing rotated files shift down one slot, and
anything past `LOG_SERVER_MAX_FILES` is dropped.

## Environment

| Variable                   | Default     | Description                       |
| -------------------------- | ----------- | --------------------------------- |
| `LOG_SERVER_HOST`          | `127.0.0.1` | Listen address                    |
| `LOG_SERVER_PORT`          | `4319`      | Listen port                       |
| `LOG_SERVER_DIR`           | `./.logs`   | Storage directory                 |
| `LOG_SERVER_MAX_FILE_SIZE` | `5242880`   | Rotation threshold, in bytes      |
| `LOG_SERVER_MAX_FILES`     | `5`         | Rotated files kept                |
| `LOG_SERVER_QUIET`         | unset       | Set to `1` to silence ingest echo |

`LOG_SERVER_DIR` and `LOG_SERVER_MAX_FILES` must match what the MCP server uses,
otherwise it reads a different set of files.
