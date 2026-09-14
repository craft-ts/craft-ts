# AI agents

This section gathers everything that gives an AI agent access to CraftTS
knowledge, application state, runtime behavior, or debugging context.

There are three complementary layers:

1. **Knowledge**: documentation, examples, `llms.txt`, and Agent Skills.
2. **Observation and control**: MCP tools for the live browser, the runtime
   registry, and application logs.
3. **Application context**: `provideSendContextToAi`, which lets a developer
   assemble a selected screen, timeline, snapshot, and optional DOM/CSS capture
   before copying or sending it to an AI service.

## Choose the right surface

| Need                                                        | Start here                                           | Access                                     |
| ----------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Learn CraftTS conventions or find an API                    | [Coding agents](/resources/ai-agents)                | `@craft-ts/mcp`                            |
| Fill, click, navigate, or inspect the running app           | [Live page MCP](/guide/ai/dev-page)                  | `@craft-ts/function-registry-mcp` → `page` |
| Read or change a published primitive during development     | [MCP tools](/guide/ai/mcp-tools)                     | `registry.*` tools                         |
| Search logs from a reproducible flow                        | [MCP tools](/guide/ai/mcp-tools)                     | `@craft-ts/log-mcp` → `logs.*`             |
| Give an AI a human-selected debugging context               | [Send context to AI](/guide/ai/send-context-webhook) | `provideSendContextToAi`                   |
| Understand the tracing and snapshot data behind the context | [Observability](/guide/advanced/observability)       | Craft providers and runtime hooks          |

The tools are deliberately separated by boundary. The documentation MCP is
read-only and works offline. The registry MCP can mutate development state and
must only be connected to a local development app. The logs MCP reads local
JSONL files; its `logs.clear` operation is destructive.

## MCP servers

CraftTS has three MCP servers, each with a different responsibility:

- [`@craft-ts/mcp`](https://www.npmjs.com/package/@craft-ts/mcp) gives an agent
  the published documentation, examples, skills, and LLM entry points.
- [`@craft-ts/function-registry-mcp`](/guide/ai/mcp-tools) bridges a running
  browser tab to `page` and `registry.*` tools.
- [`@craft-ts/log-mcp`](/guide/ai/mcp-tools) exposes the local log store through
  `logs.*` tools.

See [MCP tools](/guide/ai/mcp-tools) for the complete tool inventory and the
boundary between read-only and mutating operations.

## Context integrations

This section is also the home for context providers and future agent-facing
integrations. `provideSendContextToAi` is the first application-facing context
surface: it turns an interaction into structured context that can be copied or
sent to a protected webhook.

Lucene and Context Workbook are not present as packages, tools, or documented
integrations in this repository yet. When they are introduced, their setup,
permissions, context model, and MCP tools should be documented under this
section and added to the table above rather than creating another AI-related
navigation branch.
