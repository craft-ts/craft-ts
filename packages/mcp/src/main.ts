#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCraftMcpServer } from './mcp-server.js';
import { loadCraftMcpResources } from './resources.js';

const resources = loadCraftMcpResources();
const server = createCraftMcpServer(resources);

await server.connect(new StdioServerTransport());

const shutdown = async (): Promise<void> => {
  await server.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
