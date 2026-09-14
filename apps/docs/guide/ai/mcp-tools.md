# MCP tools

CraftTS exposes separate MCP servers for documentation, a running application,
and local logs. Connect only the server required for the task.

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

## Which server should an agent use?

| Situation                              | Server                                                  |
| -------------------------------------- | ------------------------------------------------------- |
| “How should I write this Craft code?”  | Documentation MCP                                       |
| “What is visible on the running page?” | Function registry MCP → `page`                          |
| “What value does this query have?”     | Function registry MCP → `registry.query.get`            |
| “What happened during this flow?”      | Logs MCP → `logs.stats`, then `logs.search`             |
| “What context should I send to an AI?” | `provideSendContextToAi`, then copy or send the payload |
