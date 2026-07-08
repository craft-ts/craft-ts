#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RegistryBridgeBroker } from './bridge-broker.js';
import { createRegistryMcpServer } from './mcp-server.js';

const port = Number(process.env['REGISTRY_BRIDGE_PORT'] ?? '3333');
const host = process.env['REGISTRY_BRIDGE_HOST'] ?? '127.0.0.1';
const bridge = new RegistryBridgeBroker({ host, port });
await bridge.ready();

const server = createRegistryMcpServer(bridge);
await server.connect(new StdioServerTransport());

const shutdown = async (): Promise<void> => {
  await server.close();
  await bridge.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
