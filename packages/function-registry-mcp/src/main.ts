#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRegistryMcpServer } from './mcp-server.js';
import { connectSharedRegistryBridge } from './shared-bridge.js';

const port = Number(process.env['REGISTRY_BRIDGE_PORT'] ?? '3333');
const host = process.env['REGISTRY_BRIDGE_HOST'] ?? '127.0.0.1';
// Another AI session may already hold the port: this one then relays to it.
const bridge = await connectSharedRegistryBridge({ host, port });

const server = createRegistryMcpServer(bridge, { bridge });
await server.connect(new StdioServerTransport());

const shutdown = async (): Promise<void> => {
  await server.close();
  await bridge.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
