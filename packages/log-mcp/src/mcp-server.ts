import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LOG_LEVELS } from './levels.js';
import type { LogReader } from './log-reader.js';

export function createLogMcpServer(reader: LogReader): McpServer {
  const server = new McpServer({ name: 'ng-craft-logs', version: '0.1.0' });

  server.registerTool(
    'logs.search',
    {
      description:
        'Search the application logs written by the ng-craft log server. Filters combine with AND. Results are newest first. Logs come from the craft Console.* boundary, so `from` is the host tag ancestry (for example App > UserCard) and `correlationId` carries the craft correlation metadata.',
      inputSchema: {
        text: z
          .string()
          .min(1)
          .optional()
          .describe('Case-insensitive substring of the message or arguments'),
        level: z
          .array(z.enum(LOG_LEVELS))
          .optional()
          .describe('Keep only these levels'),
        from: z
          .string()
          .min(1)
          .optional()
          .describe('Keep entries whose host tag ancestry contains this tag'),
        correlationId: z.string().min(1).optional(),
        clientId: z
          .string()
          .min(1)
          .optional()
          .describe('Browser tab identifier, see logs.stats'),
        since: z
          .string()
          .min(1)
          .optional()
          .describe('ISO date lower bound on the server receive time'),
        until: z
          .string()
          .min(1)
          .optional()
          .describe('ISO date upper bound on the server receive time'),
        limit: z.number().int().positive().max(500).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (params) => toolResult(reader.search(params)),
  );

  server.registerTool(
    'logs.tail',
    {
      description:
        'Return the most recent log entries, oldest first, like `tail -n`.',
      inputSchema: {
        count: z.number().int().positive().max(500).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ count }) => toolResult(reader.tail(count ?? 20)),
  );

  server.registerTool(
    'logs.stats',
    {
      description:
        'Summarise the stored logs: totals per level, per emitting host tag, connected client ids and the covered time range. Use it before logs.search to know what is available.',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () =>
      toolResult({ ...reader.stats(), files: reader.files() }),
  );

  server.registerTool(
    'logs.clear',
    {
      description:
        'Delete every stored log file, including rotated ones. Use it to start a clean reproduction.',
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async () => toolResult({ removedFiles: reader.clear() }),
  );

  return server;
}

function toolResult(result: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(result, null, 2) },
    ],
    structuredContent: { result },
  };
}
