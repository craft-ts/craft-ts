#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { LogReader } from './log-reader.js';
import {
  createLogMcpServer,
  type ResumeAssistantMcpGateway,
} from './mcp-server.js';

// Must match the log server: same directory, same rotation depth.
const directory = resolve(
  process.env['LOG_SERVER_DIR'] ?? resolve(process.cwd(), '.logs'),
);
const maxFiles = Number(process.env['LOG_SERVER_MAX_FILES'] ?? '5');

const reader = new LogReader({ directory, maxFiles });
const resumeAssistantUrl =
  process.env['DEBUG_SESSION_ARCHIVE_URL'] ?? 'http://127.0.0.1:4319';
const resumeAssistant: ResumeAssistantMcpGateway = {
  async readActiveContext() {
    return requestResumeAssistant('/resume-assistant/active');
  },
  async proposeOverrides(proposal) {
    const active = await readActiveResumeSession();
    return requestResumeAssistant(
      `/sessions/${active.sessionId}/resume-assistant/proposals`,
      { method: 'POST', body: JSON.stringify(proposal) },
    );
  },
  async requestApply(proposalId) {
    const active = await readActiveResumeSession();
    return requestResumeAssistant(
      `/sessions/${active.sessionId}/resume-assistant/proposals/${proposalId}/apply`,
      { method: 'POST', body: '{}' },
    );
  },
};
const server = createLogMcpServer(reader, resumeAssistant);

async function requestResumeAssistant(
  path: string,
  init?: Readonly<{ method?: 'POST'; body?: string }>,
): Promise<unknown> {
  const response = await fetch(`${resumeAssistantUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
    },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new Error(
      `Local resume assistant returned HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  return body;
}

async function readActiveResumeSession(): Promise<Readonly<{ sessionId: string }>> {
  const active = await requestResumeAssistant('/resume-assistant/active');
  if (
    typeof active !== 'object' ||
    active === null ||
    typeof (active as Record<string, unknown>)['sessionId'] !== 'string'
  )
    throw new Error('The dashboard has not published an active resume plan.');
  return { sessionId: (active as Record<string, string>)['sessionId']! };
}

await server.connect(new StdioServerTransport());

const shutdown = async (): Promise<void> => {
  await server.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
