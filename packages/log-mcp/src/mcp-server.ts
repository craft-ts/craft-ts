import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LOG_LEVELS } from './levels.js';
import type { LogReader } from './log-reader.js';
import { gunzipSync } from 'node:zlib';
import { compareSessionTraces, normalizeSessionTrace } from './session-trace.js';

export function createLogMcpServer(reader: LogReader): McpServer {
  const server = new McpServer({ name: 'craft-ts-logs', version: '0.1.0' });

  server.registerTool(
    'logs.search',
    {
      description:
        'Search the application logs written by the craft-ts log server. Filters combine with AND. Results are newest first. Logs come from the craft Console.* boundary, so `from` is the host tag ancestry (for example App > UserCard) and `correlationId` carries the craft correlation metadata.',
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

  server.registerTool(
    'sessions.compare',
    {
      description: 'Compare a failed debug session with the versioned green Playwright histories for a test and project. Returns the trace findings and a dashboard link.',
      inputSchema: {
        testId: z.string().min(1).max(80),
        project: z.string().min(1).max(80),
        sessionId: z.string().uuid(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ testId, project, sessionId }) => {
      try {
        const result = await compareE2eSession({ testId, project, sessionId });
        return toolResult(result);
      } catch (error) {
        return toolResult({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  );

  return server;
}

async function compareE2eSession(input: Readonly<{ testId: string; project: string; sessionId: string }>) {
  const base = (process.env['LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319').replace(/\/$/, '');
  const listingResponse = await fetch(`${base}/e2e-sessions`);
  if (!listingResponse.ok) throw new Error(`Could not list E2E histories (HTTP ${listingResponse.status}).`);
  const listing = await listingResponse.json() as { sessions?: Array<{ root: number; id: string; project: string; runs: Array<{ file: string }> }> };
  const history = listing.sessions?.find((item) => item.id === input.testId && item.project === input.project);
  if (!history) throw new Error(`No E2E history for ${input.testId} (${input.project}).`);
  const observedResponse = await fetch(`${base}/sessions/${encodeURIComponent(input.sessionId)}`);
  if (!observedResponse.ok) throw new Error(`Observed session not found (HTTP ${observedResponse.status}).`);
  const observed = await observedResponse.json() as Record<string, unknown>;
  const baselines = await Promise.all(history.runs.map(async (run) => {
    const url = `${base}/e2e-sessions/${encodeURIComponent(input.testId)}/${encodeURIComponent(input.project)}/${encodeURIComponent(run.file)}?root=${history.root}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not read baseline ${run.file} (HTTP ${response.status}).`);
    const session = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8')) as Record<string, unknown>;
    return normalizeSessionTrace(session as never);
  }));
  const comparison = compareSessionTraces(normalizeSessionTrace(observed as never), baselines);
  const dashboard = new URL(process.env['DEBUG_SESSION_DASHBOARD_URL'] ?? 'http://localhost:4210/');
  dashboard.hash = `#/compare?${new URLSearchParams({ test: input.testId, project: input.project, run: input.sessionId })}`;
  return { testId: input.testId, project: input.project, sessionId: input.sessionId, comparison, dashboardUrl: dashboard.toString() };
}

function toolResult(result: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(result, null, 2) },
    ],
    structuredContent: { result },
  };
}
