import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCraftMcpServer } from './mcp-server.js';
import type { CraftMcpResources } from './resources.js';

const resources: CraftMcpResources = {
  pages: [
    {
      path: '/guide/state/local-state',
      title: 'Local state',
      description: 'state() for UI you own',
      body: '# Local state\n\nUse `state` and yield* the reader.',
    },
    {
      path: '/learn/08-forms',
      title: 'Build a form',
      body: '# Build a form\n\ninsertForm and insertFormSubmit.',
    },
  ],
  skills: [
    {
      name: 'ng-craft-routes',
      description: 'Type-safe craftRoutes files.',
      markdown: '# Creating ng-craft routes\n',
      references: {
        'di-checks.md': '# DI checks\n',
      },
    },
  ],
  bestPractices: '# Best practices\nyield* every reader.\n',
  agentsMd: '# Craft NG\nDo not generate signal().\n',
};

describe('craft-ng MCP server', () => {
  let client: Client;

  beforeEach(async () => {
    const server = createCraftMcpServer(resources);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it('exposes the documentation and skill tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toEqual([
      'get_best_practices',
      'search_documentation',
      'get_documentation_page',
      'find_examples',
      'list_skills',
      'get_skill',
      'get_llms_txt',
    ]);
  });

  it('returns best practices and the AGENTS.md snippet', async () => {
    const result = await client.callTool({
      name: 'get_best_practices',
      arguments: {},
    });
    expect(result.structuredContent).toEqual({
      result: expect.objectContaining({
        bestPractices: resources.bestPractices,
        agentsMd: resources.agentsMd,
        llmsTxt: 'https://ng-angular-stack.github.io/craft/llms.txt',
      }),
    });
  });

  it('searches bundled documentation', async () => {
    const result = await client.callTool({
      name: 'search_documentation',
      arguments: { query: 'state' },
    });
    expect(result.structuredContent).toEqual({
      result: {
        query: 'state',
        hits: [
          expect.objectContaining({ path: '/guide/state/local-state' }),
        ],
      },
    });
  });

  it('loads a skill and a named reference', async () => {
    const skill = await client.callTool({
      name: 'get_skill',
      arguments: { name: 'ng-craft-routes' },
    });
    expect(skill.structuredContent).toEqual({
      result: expect.objectContaining({
        name: 'ng-craft-routes',
        references: ['di-checks.md'],
      }),
    });

    const reference = await client.callTool({
      name: 'get_skill',
      arguments: {
        name: 'ng-craft-routes',
        reference: 'di-checks.md',
      },
    });
    expect(reference.structuredContent).toEqual({
      result: {
        name: 'ng-craft-routes',
        reference: 'di-checks.md',
        markdown: '# DI checks\n',
      },
    });
  });
});
