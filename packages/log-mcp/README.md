# Logs MCP server

Exposes the JSONL files written by [`@craft-ts/log-server`](../../apps/log-server/README.md)
to an AI model over MCP stdio. Resume tools use the local log server's
short-lived assistant bridge; they do not connect to replayed application tabs.

```sh
npm run logs:mcp
```

Register it with Claude Code:

```bash
claude mcp add craft-ts-logs -- node /absolute/path/to/craft-ts/packages/log-mcp/dist/main.js
```

Run `npm run build --workspace @craft-ts/log-mcp` once beforehand, and set
`LOG_SERVER_DIR` in the MCP entry if the log server does not write to
`<cwd>/.logs`. Set `DEBUG_SESSION_ARCHIVE_URL` if the session archive does not
listen at `http://127.0.0.1:4319`.

## Tools

| Tool          | Description                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `logs.stats`  | Totals per level, per emitting host tag, known client ids, covered time range and backing files. Best first call.          |
| `logs.search` | Filters on `text`, `level`, `from`, `correlationId`, `clientId`, `since`, `until`, `limit`. Newest first, ANDed together. |
| `logs.tail`   | The `count` most recent entries, oldest first.                                                                            |
| `logs.clear`  | Delete every log file, including rotated ones, for a clean reproduction.                                                  |
| `resume_plan` | Read the latest plan published by the active dashboard session. |
| `resume_mismatch` | Read the plan gaps or execution mismatches published by the dashboard. |
| `resume_propose_overrides` | Queue JSON overrides with a rationale. The dashboard validates them against the recording. |
| `resume_apply` | Ask the dashboard to surface a proposal for approval. It never applies the override itself. |

Resume tools take no session id: the dashboard publishes its currently active
plan and mismatch context in memory. They require the local log server and a
prepared plan; it is discarded when the server stops. MCP proposals are also
temporary. The dashboard requires **Approuver** by default; an explicit local
option can approve automatically on loopback hosts. Approval adds the validated
proposal to the in-memory resume profile; **Enregistrer le profil** is a
separate action that freezes it in the session archive. No MCP tool sends a
request to the replayed application.

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
