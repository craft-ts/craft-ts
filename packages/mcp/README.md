# @craft-ts/mcp

MCP server, Agent Skills, and LLM entry points so a coding agent can use
`@craft-ts/core` after you import it.

This is the consumer-facing counterpart of the docs site. It does **not**
replace the runtime registry / log MCP servers used inside the craft-ts
monorepo.

## Install

```bash
npm install -D @craft-ts/mcp@beta
```

Or run it without adding a dependency:

```bash
npx -y @craft-ts/mcp@beta
```

## Cursor / Claude Code / VS Code

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

Commit that as `.mcp.json` at the app root so the whole team gets the tools.

## Tools

| Tool | Job |
| --- | --- |
| `get_best_practices` | Craft coding rules + `AGENTS.md` snippet |
| `search_documentation` | Search the bundled Learn / Guide / Reference |
| `get_documentation_page` | One page as markdown |
| `find_examples` | Learn + demo example hits |
| `list_skills` / `get_skill` | Agent Skills shipped in this package |
| `get_llms_txt` | Public `llms.txt` / `llms-full.txt` URLs |

## LLM files on the docs site

- https://craft-ts.github.io/craft/llms.txt
- https://craft-ts.github.io/craft/llms-full.txt
- Every docs page also has a `.md` sibling (for example `/guide/state/local-state.md`)

## Agent Skills

Skills follow the [Agent Skills](https://agentskills.io/specification) layout
and are packaged as an [Agent Plugin](https://agent-plugins.org/) (`plugin.json`
+ `mcp.json` + `skills/`):

- `craft-ts-architecture-tests` — scaffold or run `architecture/`, freeze a graph smell
- `craft-ts-routes` — type-safe `craftRoutes` files
- `translate-spec-to-craft-ts` — map a spec onto primitives
- `craft-ts-service-migration` — `craftService` / `toCraftService`
- `migrate-to-craft-ts` — `craft-migrate` then manual follow-up

Point your agent at `node_modules/@craft-ts/mcp/skills`, or copy the `AGENTS.md`
snippet from `get_best_practices`.

## Docs

https://craft-ts.github.io/craft/resources/ai-agents
