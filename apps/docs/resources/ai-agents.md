---
description: Point Cursor, Claude, Copilot, and other coding agents at CraftTS docs, MCP tools, and Agent Skills after you import @craft-ts/core.
---

# Coding agents

CraftTS is unusual enough that a model trained on Angular classes will invent
the wrong API. After you import `@craft-ts/core`, give the agent three layered
entry points — the same split Angular uses with `llms.txt`, the CLI MCP server,
and Agent Skills.

| Layer | What it is | When the agent uses it |
| --- | --- | --- |
| **LLM files** | [`/llms.txt`](https://craft-ts.github.io/craft/llms.txt), [`/llms-full.txt`](https://craft-ts.github.io/craft/llms-full.txt), and a `.md` sibling for every docs page | Discovery on the internet, no install |
| **MCP server** | [`@craft-ts/mcp`](https://www.npmjs.com/package/@craft-ts/mcp) — `get_best_practices`, `search_documentation`, `find_examples`, skills | Live lookup in Cursor, Claude Code, VS Code, Copilot |
| **Agent Skills** | `skills/` inside `@craft-ts/mcp`, plus an [Agent Plugin](https://agent-plugins.org/) manifest | Multi-step workflows (architecture tests, routes, spec → primitives, migration) |
| **Live page MCP** | Local `@craft-ts/function-registry-mcp` tool `page` — fill, click, and inspect the `ng serve` tab already open | Dev only, on the running app. Not shipped in `@craft-ts/mcp`. See [Live page MCP](/guide/ai/dev-page) |

Do not scrape the HTML docs. Start from `llms.txt` or the MCP tools.

## 1. LLM files

These follow the [llms.txt](https://llmstxt.org/) spec and are generated from
this VitePress site at build time.

- Index (curated links): https://craft-ts.github.io/craft/llms.txt
- Concatenated docs: https://craft-ts.github.io/craft/llms-full.txt
- One page, as markdown: append `.md` to any docs URL, for example
  [local state](https://craft-ts.github.io/craft/guide/state/local-state.md)

Paste this into an `AGENTS.md` (or `CLAUDE.md`) at the root of the app that
imports Craft:

```md
# CraftTS

This application uses `@craft-ts/core`.

- Docs index: https://craft-ts.github.io/craft/llms.txt
- MCP: `npx -y @craft-ts/mcp@beta` (`get_best_practices`, `search_documentation`)
- Skills: `node_modules/@craft-ts/mcp/skills`

yield* every Craft reader. Do not generate Angular signal(), inject(), or
@Injectable in authored Craft code. craftRoutes files need componentDeps and
a per-file DI check. The architecture/ suite is the graph contract: scaffold
at bootstrap, run it during a feature. Do not add an architecture rule for
the feature.
```

The same snippet is returned by the MCP tool `get_best_practices` (field
`agentsMd`) and lives in the package as `content/agents.md`.

## 2. MCP server

```bash
npm install -D @craft-ts/mcp@beta
```

Add a project `.mcp.json` (Cursor, Claude Code, and VS Code all understand it):

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

Claude Code, from the app directory:

```shell
claude mcp add craft-ts -- npx -y @craft-ts/mcp@beta
```

### Tools

| Tool | Use it to |
| --- | --- |
| `get_best_practices` | Load the coding-agent guide and the `AGENTS.md` snippet |
| `search_documentation` | Find a Guide / Learn / Reference page by API or task |
| `get_documentation_page` | Read one page as markdown (`/guide/state/local-state`) |
| `find_examples` | Find Learn + demo examples |
| `list_skills` / `get_skill` | Load a workflow skill and its `references/*.md` |
| `get_llms_txt` | Get the public `llms.txt` URLs and the bundled path index |

The server is **read-only**. It searches documentation bundled at publish time,
so it works offline. It is not the runtime registry MCP used to mutate a live
demo tab, and it does not expose the `page` tool. Driving the open `ng serve`
tab is [Live page MCP](/guide/ai/dev-page) (dev only, function-registry MCP).

## 3. Agent Skills

Skills follow the [Agent Skills](https://agentskills.io/specification) layout
(`SKILL.md` + optional `references/`). The package is also an Agent Plugin
(`plugin.json` + `mcp.json` + `skills/`).

| Skill | Trigger |
| --- | --- |
| `craft-ts` | Any authored Craft code |
| `craft-ts-architecture-tests` | Scaffold or run `architecture/`, or freeze a graph smell |
| `translate-spec-to-craft-ts` | Spec / CRUD / filters / forms → primitives |
| `craft-ts-routes` | `craftRoutes`, `componentDeps`, `TS2589` |
| `craft-ts-service-migration` | `@Injectable` / `inject()` → `craftService` |
| `migrate-to-craft-ts` | `craft-migrate` then manual diagnostics |

The [architecture suite](/guide/testing/architecture) is the app's graph
contract (unique HTTP, unique identities, armed route DI proofs, folder
lanes). Scaffold it at app start or at the end of `craft-migrate`. During a
feature, run the suite that already exists. Do not add an architecture rule for the feature.
Add a new `it()` only when a bad pattern is spotted, so it cannot recur. If
`architecture/` is missing mid-feature, offer the scaffold; do not impose it.

Point the agent at `node_modules/@craft-ts/mcp/skills`, or let it call
`get_skill`. Cursor can also install a skill from that folder.

## Verify the agent can see Craft

Ask it to add a `state` counter, a paged `query`, or a `craftRoutes` file.
It should `yield*` readers, compose insertions with `craftPipe`, and put a DI
check in the routes file. If the app already has `architecture/`, it should
run that suite rather than invent a new rule. If it emits `signal()`,
`inject()`, or a plain Angular `Routes` array, the MCP server or `AGENTS.md`
snippet is not in context.

## See also

- [Which primitive should I use?](/guide/concepts/choose-primitive)
- [The mental model](/guide/concepts/mental-model)
- [Architecture rules](/guide/testing/architecture)
- [CLI automation](/guide/routing/automation)
- [Migration](/resources/migration)
