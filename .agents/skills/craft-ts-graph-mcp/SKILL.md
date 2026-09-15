---
name: craft-ts-graph-mcp
description: Query the static CraftTS dependency graph of a project through the graph MCP server (craft-ts-graph-mcp). Use when a user asks where a route, component, service or primitive is and what it depends on; what a change to a node can break; how two nodes are connected; which parts of the application are complex, central or unmeasured; or why an architecture rule fails — and when graph.status, graph.rebuild, graph.node, graph.impact or any other graph.* tool returns nothing, an error or a stale graph.
---

# CraftTS Graph MCP

Answer architecture questions from the graph the static analysis built, instead of reading files one by one. The tool surface is documented in [libs/graph-mcp/README.md](../../../libs/graph-mcp/README.md); the node and relation vocabulary in the "Extensible architecture graph" guide.

## Always start with graph.status

1. `graph.status` tells you where the graph comes from (`file` or `analysis`), when it was built, the node counts per kind and the diagnostics.
2. Read `stale` in **every** answer:
   - `false`: the graph matches the source.
   - `true`: a file of the TypeScript program changed after the graph was built. Call `graph.rebuild` before answering a question about recent code, then say you did. If `graph.rebuild` is absent the server is read-only (`CRAFT_GRAPH_READONLY=1`): tell the user the answer may be outdated and that `craft graph --format all` refreshes the file.
   - `unknown`: there is no tsconfig to compare with. Say the freshness could not be checked.

## Chain the tools

- **"Where is X / what does X use?"** — `graph.search` with the name, then `graph.node` with the `id` it returned. Pass `includeSource: true` only when you need the code: the node's relations and their proofs usually answer the question.
- **"What breaks if I change X?"** — `graph.node` to confirm the node, then `graph.impact`. Filter with `kind` (`route`, `component`) to answer "which pages?".
- **"How is A connected to B?"** — `graph.path`. `reachable: false` means no chain of relations in that direction within `maxDepth`; try the other direction before concluding they are unrelated.
- **"What surrounds X?"** — `graph.neighbors` with `depth` 1 first; widen only if needed, and restrict `edgeKinds` on large graphs.
- **"Where is the risk?"** — `graph.hotspots`, with `churnSince: "3 months ago"` when the user cares about recent activity.
- **"Is the architecture sound?"** — `graph.violations` for the rules, `graph.report` for the overall picture.

Every list reports `total` and `truncated`. When `truncated` is true, say so, and narrow the query rather than raising `limit` blindly.

## Read the answers faithfully

- A relation carries `evidence` (`ast` or `type`) and often a `proof` with a `location`. Quote the location when you state a dependency.
- A metric that is absent is **unknown, not zero**. A node without `cyclomaticTotal` has no source range the graph could measure; never describe it as simple. The `CRAFT_GRAPH_METRICS_UNKNOWN` diagnostics list which kinds are unmeasured.
- `graph.impact` follows the code-slice relations: what can change a node's output. It is not "every node that mentions X".
- Ids contain absolute paths. The tools also accept the portable form (project root removed) used by `graph.report`.
- `graph.node` with a shared `label` answers `ambiguous: true` with candidates: pick by `kind` or `location`, do not guess.

## When nothing works

1. An error mentioning `CRAFT_GRAPH_TSCONFIG`: there is neither a graph file nor a tsconfig in the root. Set `CRAFT_GRAPH_ROOT` or `CRAFT_GRAPH_TSCONFIG` in the MCP entry.
2. The node you expect is missing: the graph only models CraftTS constructs (routes, components, services, primitives, server functions…). A plain helper function is not a node. Check `nodesByKind` in `graph.status`.
3. The analysis is slow: on a large application `graph.rebuild` takes seconds. Prefer reading the JSON file written by `craft graph`.
