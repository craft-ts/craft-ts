import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogReader } from './log-reader.js';
import { createLogMcpServer } from './mcp-server.js';

describe('logs MCP server', () => {
  let directory: string;
  let reader: LogReader;
  let client: Client;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'log-mcp-'));
    reader = new LogReader({ directory });
    writeFileSync(
      join(directory, 'app.jsonl'),
      [
        {
          level: 'error',
          message: 'boom',
          from: ['App', 'UserCard'],
          receivedAt: '2026-07-25T08:00:00.000Z',
          timestamp: '2026-07-25T08:00:00.000Z',
          seq: 1,
        },
        {
          level: 'log',
          message: 'hello',
          from: ['App'],
          receivedAt: '2026-07-25T08:00:01.000Z',
          timestamp: '2026-07-25T08:00:01.000Z',
          seq: 2,
        },
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n')
        .concat('\n'),
      'utf8',
    );

    const server = createLogMcpServer(reader);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('exposes the four log tools', async () => {
    const tools = await client.listTools();

    expect(tools.tools.map(({ name }) => name)).toEqual([
      'logs.search',
      'logs.tail',
      'logs.stats',
      'logs.clear',
    ]);
  });

  it('searches with filters', async () => {
    const result = await client.callTool({
      name: 'logs.search',
      arguments: { level: ['error'] },
    });

    expect(result.structuredContent).toEqual({
      result: [
        expect.objectContaining({ message: 'boom', level: 'error' }),
      ],
    });
  });

  it('tails the most recent entries', async () => {
    const result = await client.callTool({
      name: 'logs.tail',
      arguments: { count: 1 },
    });

    expect(result.structuredContent).toEqual({
      result: [expect.objectContaining({ message: 'hello' })],
    });
  });

  it('reports stats including the backing files', async () => {
    const result = await client.callTool({
      name: 'logs.stats',
      arguments: {},
    });

    expect(result.structuredContent).toEqual({
      result: expect.objectContaining({
        total: 2,
        byLevel: { error: 1, log: 1 },
        files: [reader.filePath],
      }),
    });
  });

  it('clears the stored logs', async () => {
    const result = await client.callTool({
      name: 'logs.clear',
      arguments: {},
    });

    expect(result.structuredContent).toEqual({ result: { removedFiles: 1 } });
    expect(reader.readAll()).toEqual([]);
  });
});
