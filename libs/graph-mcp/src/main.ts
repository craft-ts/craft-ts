#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GraphStore, graphStoreOptionsFromEnv } from './graph-store.js';
import { createGraphMcpServer } from './mcp-server.js';

// CRAFT_GRAPH_ROOT, CRAFT_GRAPH_TSCONFIG, CRAFT_GRAPH_FILE, CRAFT_GRAPH_READONLY.
const store = new GraphStore(graphStoreOptionsFromEnv());
const server = createGraphMcpServer(store);

await server.connect(new StdioServerTransport());

const shutdown = async (): Promise<void> => {
  await server.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
