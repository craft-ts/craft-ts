# Graph MCP server

Exposes the CraftTS dependency graph of **your** project to an AI agent over MCP
stdio: find a route, a service or a primitive, read its relations with their
proofs, follow a path, measure the impact of a change, list hotspots and
architecture violations.

It runs inside the project, reads `craft-dependency-graph.json` when it exists
and otherwise analyses the TypeScript program with `@craft-ts/dev-tools`. The
analysis is static and deterministic: no runtime instrumentation, no LLM.

```sh
npm install --save-dev @craft-ts/graph-mcp
```

Add it to `.mcp.json`:

```json
{
  "mcpServers": {
    "craft-ts-graph": { "command": "npx", "args": ["craft-ts-graph-mcp"] }
  }
}
```

Or register it with Claude Code:

```bash
claude mcp add craft-ts-graph -- npx craft-ts-graph-mcp
```

## Configuration

| Variable               | Default                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `CRAFT_GRAPH_ROOT`     | The current directory.                                          |
| `CRAFT_GRAPH_TSCONFIG` | First of `tsconfig.graph.json`, `tsconfig.app.json`, `tsconfig.json`. |
| `CRAFT_GRAPH_FILE`     | `craft-dependency-graph.json`, relative to the root.            |
| `CRAFT_GRAPH_COVERAGE` | Unset. An Istanbul `coverage-final.json`: coverage per node, and per route in `graph.report`. |
| `CRAFT_GRAPH_DOCS`     | Unset. Comma-separated Markdown globs, e.g. `docs/**/*.md`: pages become `doc-page` nodes linked to what they cite. |
| `CRAFT_GRAPH_READONLY` | Unset. `1` hides `graph.rebuild`: the server only reads.        |

Write the graph file with `craft graph --format all` (it also writes the
report and the HTML explorer), or let an agent call `graph.rebuild`.

## Tools

Every answer carries `stale`: `true` when a file of the TypeScript program —
or its tsconfig — changed after the graph was built, `unknown` when no tsconfig
is available to check. Every list accepts `limit` and reports `total` and
`truncated`.

| Tool               | Description                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `graph.status`     | Where the graph comes from, when it was built, counts per kind and diagnostics. Call it first. |
| `graph.rebuild`    | Re-analyse the program and overwrite the graph file. Absent when `CRAFT_GRAPH_READONLY=1`.    |
| `graph.search`     | Nodes whose label or id contains `text`, optionally of one `kind`.                           |
| `graph.node`       | One node by `id`, or `label` (+ `kind`): metrics, details, relations with proofs, source.    |
| `graph.neighbors`  | The subgraph up to `depth` ≤ 3, filtered by `edgeKinds` and `direction`.                     |
| `graph.path`       | The shortest relation chains from `from` to `to`, with the proof of each step.               |
| `graph.impact`     | Every node whose output depends on `id`, Effect services and layers included.                |
| `graph.hotspots`   | God nodes and hotspots, optionally weighted by git churn (`churnSince`).                     |
| `graph.report`     | The full report: summary, rankings, cycles, unused methods, cross-feature relations, violations. |
| `graph.violations` | The rules `assertArchitecture` enforces, by name, with their messages.                       |

Node ids contain absolute paths. The tools also accept the portable form used
in reports, where the project root is removed.

A metric the graph could not compute is absent, never `0`: a node without a
source range has no complexity, and hotspots leave it out.
