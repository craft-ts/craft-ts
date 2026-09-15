# MCP tools

CraftTS exposes separate MCP servers for documentation, a running application,
local logs, and the static dependency graph. Connect only the server required
for the task.

## Documentation MCP: `@craft-ts/mcp`

Install it in an application or run it without adding a dependency:

```bash
npm install -D @craft-ts/mcp@beta
npx -y @craft-ts/mcp@beta
```

Register it in `.mcp.json`:

```json
{
  "mcpServers": {
    "craft-ts": {
      "command": "npx",
      "args": ["-y", "@craft-ts/mcp@beta"]
    }
  }
}
```

| Tool                     | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `get_best_practices`     | Load CraftTS rules and the `AGENTS.md` snippet         |
| `search_documentation`   | Search Learn, Guide, Reference, Resources, or examples |
| `get_documentation_page` | Read one documentation page as Markdown                |
| `find_examples`          | Find tutorial and demo examples for a task             |
| `list_skills`            | List the Agent Skills shipped with the package         |
| `get_skill`              | Load a skill or one of its reference files             |
| `get_llms_txt`           | Get the public `llms.txt` URLs and bundled page index  |

This server is read-only and searches the documentation bundled at publish
time. It is the right starting point when an agent needs to understand the
CraftTS API or conventions.

## Live page and registry MCP

`@craft-ts/function-registry-mcp` connects over stdio to an MCP client and over
WebSocket to the running development tab:

```bash
npm run registry:mcp
```

The [Live page MCP](/guide/ai/dev-page) page explains the named-control
contract, client selection, and `page` actions.

### Browser surface

| Tool               | Purpose                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| `page`             | Read named controls, then `goto`, `fill`, `click`, or `press` and return the new state |
| `registry.clients` | List connected tabs and their `ready`, `connecting`, or `reloading` state              |

If multiple tabs are ready, pass the explicit `clientId`. Never guess based on
which tab connected most recently.

### Registry surface

| Tool                     | Purpose                                                                      |
| ------------------------ | ---------------------------------------------------------------------------- |
| `registry.list`          | List active registry entries                                                 |
| `registry.get`           | Read one registry entry                                                      |
| `registry.call`          | Invoke an active registry entry                                              |
| `registry.logs`          | Read registry and bridge events                                              |
| `registry.override`      | Replace a primitive method at runtime for development                        |
| `registry.restore`       | Remove a runtime override                                                    |
| `registry.<primitive>.*` | Read or mutate `query`, `mutation`, `asyncProcess`, and `queryParams` values |

The primitive-specific tools are:

```text
registry.query.get / set / update / patch
registry.mutation.get / set / update / patch
registry.asyncProcess.get / set / update / patch
registry.queryParams.get / set / update / patch
```

`query`, `mutation`, and `asyncProcess` support an optional `id` for grouped
instances. `queryParams` does not use grouped instance IDs. Runtime overrides
and mutating value tools are development-only operations and should never be
connected to an untrusted or production browser.

## Logs MCP: `@craft-ts/log-mcp`

The logs server reads JSONL files written by the Craft log server. It does not
talk to the browser or ingest logs itself:

```bash
npm run logs:mcp
```

| Tool          | Purpose                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| `logs.stats`  | Summarise levels, host tags, client IDs, files, and time range              |
| `logs.search` | Filter by text, level, host ancestry, correlation ID, client, or time range |
| `logs.tail`   | Read the most recent entries                                                |
| `logs.clear`  | Delete all active and rotated log files                                     |

Use `logs.stats` before `logs.search` to understand what is available. The
`from` filter follows Craft host-tag ancestry, and `correlationId` finds all
entries from one correlated flow.

`logs.clear` is the only destructive tool in this server. Use it only when a
clean reproduction is intentional.

## Graph MCP: `@craft-ts/graph-mcp`

The graph server answers architecture questions about **your** project from the
same static analysis as the [architecture rules](/guide/testing/architecture):
routes, components, services, primitives and the proven relations between them.
It needs no running application. It reads `craft-dependency-graph.json` when the
file exists and otherwise analyses the TypeScript program.

```bash
npm install -D @craft-ts/graph-mcp
```

Projects created with `craft create` already register it. In an existing
project, add it to `.mcp.json`:

```json
{
  "mcpServers": {
    "craft-ts-graph": { "command": "npx", "args": ["craft-ts-graph-mcp"] }
  }
}
```

| Tool               | Purpose                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `graph.status`     | Source and build time of the graph, counts per kind, diagnostics                 |
| `graph.rebuild`    | Re-analyse the program and overwrite the graph file                              |
| `graph.search`     | Find nodes by label or id                                                        |
| `graph.node`       | One node: metrics, relations with their proofs, optionally its source            |
| `graph.neighbors`  | The subgraph around a node, up to three relations away                           |
| `graph.path`       | The shortest relation chains between two nodes                                   |
| `graph.impact`     | Every node whose output may change when this node changes                        |
| `graph.hotspots`   | God nodes and hotspots, optionally weighted by git churn                         |
| `graph.report`     | The [graph report](/guide/testing/graph-insights#report) as JSON                 |
| `graph.violations` | The rules `assertArchitecture` enforces, by name, with their messages            |

Every answer carries `stale`: `true` when a source file changed after the graph
was built, `unknown` when no tsconfig is available to check. An agent calls
`graph.rebuild` before answering about recent code.

| Variable               | Default                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `CRAFT_GRAPH_ROOT`     | The current directory                                                 |
| `CRAFT_GRAPH_TSCONFIG` | First of `tsconfig.graph.json`, `tsconfig.app.json`, `tsconfig.json` |
| `CRAFT_GRAPH_FILE`     | `craft-dependency-graph.json`                                         |
| `CRAFT_GRAPH_COVERAGE` | Unset; a `coverage-final.json` to attach coverage per node and route  |
| `CRAFT_GRAPH_DOCS`     | Unset; comma-separated Markdown globs linked to the nodes they cite   |
| `CRAFT_GRAPH_READONLY` | Unset; `1` removes `graph.rebuild`, for CI or shared environments     |

All tools except `graph.rebuild` are read-only, and `graph.rebuild` only writes
the graph file.

## Which server should an agent use?

| Situation                                   | Server                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| “How should I write this Craft code?”       | Documentation MCP                                       |
| “What is visible on the running page?”      | Function registry MCP → `page`                          |
| “What value does this query have?”          | Function registry MCP → `registry.query.get`            |
| “What happened during this flow?”           | Logs MCP → `logs.stats`, then `logs.search`             |
| “What does this service depend on?”         | Graph MCP → `graph.search`, then `graph.node`           |
| “What can this change break?”               | Graph MCP → `graph.impact`                              |
| “What context should I send to an AI?”      | `provideSendContextToAi`, then copy or send the payload |
