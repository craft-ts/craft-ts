#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { LogReader } from './log-reader.js';
import { createLogMcpServer } from './mcp-server.js';

// Must match the log server: same directory, same rotation depth.
const directory = resolve(
  process.env['LOG_SERVER_DIR'] ?? resolve(process.cwd(), '.logs'),
);
const maxFiles = Number(process.env['LOG_SERVER_MAX_FILES'] ?? '5');

const reader = new LogReader({ directory, maxFiles });
const server = createLogMcpServer(reader);

await server.connect(new StdioServerTransport());

const shutdown = async (): Promise<void> => {
  await server.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
