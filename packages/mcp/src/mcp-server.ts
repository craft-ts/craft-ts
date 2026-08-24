import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findPage, pageUrl, searchPages, type DocPage } from './catalog.js';
import {
  LLMS_FULL_TXT_URL,
  LLMS_TXT_URL,
  type CraftMcpResources,
} from './resources.js';

export function createCraftMcpServer(resources: CraftMcpResources): McpServer {
  const server = new McpServer({ name: 'craft-ts', version: '0.7.0' });

  server.registerTool(
    'get_best_practices',
    {
      description:
        'Return the CraftTS coding-agent guide: which primitive to use, yield* rules, the architecture/ graph contract, services, routes, ESLint, and the AGENTS.md snippet to drop into an app that imports @craft-ts/core. Call this before writing or reviewing Craft code.',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () =>
      toolResult({
        bestPractices: resources.bestPractices,
        agentsMd: resources.agentsMd,
        llmsTxt: LLMS_TXT_URL,
        llmsFullTxt: LLMS_FULL_TXT_URL,
      }),
  );

  server.registerTool(
    'search_documentation',
    {
      description:
        'Search the bundled CraftTS documentation (Learn, Guide, Reference, Resources). Use it when you need the current API, a decision page, or a recipe. Prefer this over guessing from training data.',
      inputSchema: {
        query: z.string().min(1).describe('Keywords, API names, or a task'),
        section: z
          .enum(['learn', 'guide', 'reference', 'resources', 'examples'])
          .optional()
          .describe(
            'Limit results to one docs section. `examples` covers Learn plus /resources/examples.',
          ),
        limit: z.number().int().positive().max(20).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ query, section, limit }) =>
      toolResult({
        query,
        hits: searchPages(resources.pages, query, { section, limit }),
      }),
  );

  server.registerTool(
    'get_documentation_page',
    {
      description:
        'Return one documentation page as markdown. Use a path from search_documentation, such as /guide/state/local-state or /learn/01-first-state.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('Docs path, for example /guide/concepts/mental-model'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path }) => {
      const page = findPage(resources.pages, path);
      if (!page) {
        return toolResult({
          error: `No documentation page at ${path}. Call search_documentation first.`,
        });
      }
      return toolResult(serializePage(page));
    },
  );

  server.registerTool(
    'find_examples',
    {
      description:
        'Find Learn tutorials and demo examples that match a task (list, form, pagination, routing, optimistic update, …).',
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().max(20).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ query, limit }) =>
      toolResult({
        query,
        hits: searchPages(resources.pages, query, {
          section: 'examples',
          limit,
        }),
      }),
  );

  server.registerTool(
    'list_skills',
    {
      description:
        'List Agent Skills shipped with @craft-ts/mcp (architecture tests, routes, spec translation, service migration, full-app migration). Load one with get_skill before following a workflow.',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () =>
      toolResult({
        skills: resources.skills.map(({ name, description, references }) => ({
          name,
          description,
          references: Object.keys(references),
        })),
      }),
  );

  server.registerTool(
    'get_skill',
    {
      description:
        'Return a CraftTS Agent Skill. Omit `reference` to get SKILL.md; pass a reference filename from list_skills to load that file only.',
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe(
            'Skill directory name, for example craft-ts-routes or translate-spec-to-craft-ts',
          ),
        reference: z
          .string()
          .min(1)
          .optional()
          .describe('Optional references/*.md filename'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ name, reference }) => {
      const skill = resources.skills.find((entry) => entry.name === name);
      if (!skill) {
        return toolResult({
          error: `Unknown skill "${name}". Call list_skills.`,
          available: resources.skills.map((entry) => entry.name),
        });
      }
      if (!reference) {
        return toolResult({
          name: skill.name,
          description: skill.description,
          markdown: skill.markdown,
          references: Object.keys(skill.references),
        });
      }
      const markdown = skill.references[reference];
      if (!markdown) {
        return toolResult({
          error: `Skill "${name}" has no reference "${reference}".`,
          available: Object.keys(skill.references),
        });
      }
      return toolResult({ name: skill.name, reference, markdown });
    },
  );

  server.registerTool(
    'get_llms_txt',
    {
      description:
        'Return the public llms.txt / llms-full.txt URLs and a short index of bundled documentation paths. Use llms.txt as the internet entry point; use search_documentation for offline lookup.',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () =>
      toolResult({
        llmsTxt: LLMS_TXT_URL,
        llmsFullTxt: LLMS_FULL_TXT_URL,
        markdownPages: resources.pages.map((page) => ({
          path: page.path,
          title: page.title,
          url: `${pageUrl(page.path)}.md`,
        })),
      }),
  );

  return server;
}


function serializePage(page: DocPage) {
  return {
    path: page.path,
    title: page.title,
    description: page.description,
    url: pageUrl(page.path),
    markdownUrl: `${pageUrl(page.path)}.md`,
    markdown: page.body,
  };
}

function toolResult(result: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(result, null, 2) },
    ],
    structuredContent: { result },
  };
}
