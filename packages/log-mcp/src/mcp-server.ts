import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LOG_LEVELS } from './levels.js';
import type { LogReader } from './log-reader.js';

export type ResumeAssistantMcpGateway = Readonly<{
  readActiveContext(): Promise<unknown>;
  proposeOverrides(
    proposal: Readonly<{
      rationale: string;
      overrides: readonly Readonly<Record<string, unknown>>[];
    }>,
  ): Promise<unknown>;
  requestApply(proposalId: string): Promise<unknown>;
}>;

export function createLogMcpServer(
  reader: LogReader,
  resumeAssistant?: ResumeAssistantMcpGateway,
): McpServer {
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

  if (resumeAssistant) {
    server.registerTool(
      'resume_plan',
      {
        description:
          'Read the latest resume plan published by the local dashboard for an archived session. This is read-only.',
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async () => {
        const active = await resumeAssistant.readActiveContext();
        const context =
          typeof active === 'object' && active !== null
            ? (active as Record<string, unknown>)['context']
            : undefined;
        const plan =
          typeof context === 'object' && context !== null
            ? (context as Record<string, unknown>)['plan']
            : undefined;
        const sessionId =
          typeof active === 'object' && active !== null
            ? (active as Record<string, unknown>)['sessionId']
            : undefined;
        return toolResult({ sessionId: sessionId ?? null, plan: plan ?? null });
      },
    );
    server.registerTool(
      'resume_mismatch',
      {
        description:
          'Read execution mismatches and plan gaps published by the local dashboard. This is read-only.',
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async () => {
        const active = await resumeAssistant.readActiveContext();
        const context =
          typeof active === 'object' && active !== null
            ? (active as Record<string, unknown>)['context']
            : undefined;
        const mismatches =
          typeof context === 'object' && context !== null
            ? (context as Record<string, unknown>)['mismatches']
            : undefined;
        return toolResult({
          sessionId:
            typeof active === 'object' && active !== null
              ? ((active as Record<string, unknown>)['sessionId'] ?? null)
              : null,
          mismatches: Array.isArray(mismatches) ? mismatches : [],
        });
      },
    );
    server.registerTool(
      'resume_propose_overrides',
      {
        description:
          'Submit a data-only override proposal for dashboard validation. The proposal is never applied by this tool; a person must approve it in the dashboard.',
        inputSchema: {
          rationale: z.string().max(4000),
          overrides: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ rationale, overrides }) =>
        toolResult(
          await resumeAssistant.proposeOverrides({
            rationale,
            overrides,
          }),
        ),
    );
    server.registerTool(
      'resume_apply',
      {
        description:
          'Request that a proposed override be shown for human approval in the dashboard. It does not change the replay profile or call the application.',
        inputSchema: {
          proposalId: z.string().uuid(),
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ proposalId }) =>
        toolResult(await resumeAssistant.requestApply(proposalId)),
    );
  }

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
