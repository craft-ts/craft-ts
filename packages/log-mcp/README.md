# Logs MCP server

Exposes the JSONL files written by [`@craft-ts/log-server`](../../apps/log-server/README.md)
to an AI model over MCP stdio. It only reads the files — it never talks to the
browser or to the ingestion server.

```sh
npm run logs:mcp
```

Register it with Claude Code:

```bash
claude mcp add craft-ts-logs -- node /absolute/path/to/craft-ts/packages/log-mcp/dist/main.js
```

Run `npm run build --workspace @craft-ts/log-mcp` once beforehand, and set
`LOG_SERVER_DIR` in the MCP entry if the log server does not write to
`<cwd>/.logs`.

## Tools

| Tool          | Description                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `logs.stats`  | Totals per level, per emitting host tag, known client ids, covered time range and backing files. Best first call.          |
| `logs.search` | Filters on `text`, `level`, `from`, `correlationId`, `clientId`, `since`, `until`, `limit`. Newest first, ANDed together. |
| `logs.tail`   | The `count` most recent entries, oldest first.                                                                            |
| `logs.clear`  | Delete every log file, including rotated ones, for a clean reproduction.                                                  |

Because the entries come from the craft `Console.*` boundary, the useful filters
are craft-shaped:

- `from` matches any tag in the host ancestry, e.g. `from: "UserCard"` matches
  an entry emitted with `from: ["App", "UserCard"]`.
- `correlationId` matches a substring of the serialized craft correlation
  metadata, so one id finds every log of a single correlated flow.
- `text` searches the message *and* the serialized arguments.

Rotated files are read oldest first, then the active file, so ordering is stable
across a rotation. A truncated trailing line — the server writing while the
reader reads — is skipped instead of failing the read.
