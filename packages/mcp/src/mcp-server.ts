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

  registerStyleTools(server);

  return server;
}

const DEFAULT_STYLE_DUMP = 'tmp/craft-style-graph.json';

/**
 * The shape of `@craft-ts/dev-tools/style-report`, declared here rather than
 * imported.
 *
 * This package builds and publishes on its own, and does not resolve workspace
 * libraries at build time; a type import would tie its build to a sibling's
 * sources. What is declared is three signatures — the *logic* still lives in one
 * place and is called, never copied. The results are serialised to JSON, so
 * describing them further would buy nothing.
 */
interface StyleReportModule {
  styleImpact(dump: unknown, changed: readonly string[]): unknown;
  styleMatrix(dump: unknown): unknown;
  styleDebt(dump: unknown): unknown;
}

const STYLE_REPORT_MODULE = '@craft-ts/dev-tools/style-report';

const styleReport = async (): Promise<StyleReportModule> => {
  // Resolved at call time, through a specifier this package's own build does
  // not need to see: `@craft-ts/dev-tools` is a peer of the workspace, not of
  // the published bundle. An installation without it fails here, with a
  // message, rather than failing to start.
  const loaded = (await import(/* @vite-ignore */ STYLE_REPORT_MODULE).catch(
    () => {
      throw new Error(
        `The style tools need '${STYLE_REPORT_MODULE}'. Install @craft-ts/dev-tools alongside this server, or use \`craft-graph --style-matrix\` from the repository instead.`,
      );
    },
  )) as StyleReportModule;
  return loaded;
};

const DUMP_INPUT = {
  dumpPath: z
    .string()
    .optional()
    .describe(
      `Path to the style dump the build plugin writes. Defaults to ${DEFAULT_STYLE_DUMP}.`,
    ),
};

/**
 * The style questions, read-only, answered from the emitted dump.
 *
 * They call the same functions the CLI calls rather than reimplementing the
 * queries: one question must not have two answers depending on who asked. The
 * import is dynamic so that opening the server does not pull the graph
 * machinery into memory for an agent that only wanted the documentation.
 */
function registerStyleTools(server: McpServer): void {
  const loadDump = async (dumpPath?: string) => {
    const path = dumpPath ?? DEFAULT_STYLE_DUMP;
    const { readFile } = await import('node:fs/promises');
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw new Error(
        `No style dump at '${path}'. It is written by the build plugin: give craftStyle({ dumpPath }) a path and run a build, or pass dumpPath.`,
      );
    }
  };

  server.registerTool(
    'style_impact',
    {
      description:
        'Which sheet classes a change to one or more CSS custom properties can be seen in. Use it before rerunning a visual suite: changing one token should recapture what reaches it, not everything. Answers `narrowed: false` when a name is unknown to the graph, in which case the answer is the whole application on purpose.',
      inputSchema: {
        changed: z
          .array(z.string().min(1))
          .min(1)
          .describe('Custom property names, e.g. --ds-accent'),
        ...DUMP_INPUT,
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ changed, dumpPath }) => {
      const { styleImpact } = await styleReport();
      return toolResult(styleImpact(await loadDump(dumpPath), changed));
    },
  );

  server.registerTool(
    'style_matrix',
    {
      description:
        'What the application costs to capture: the number of visual states per sheet class, the total, the median and the largest. The median and the largest are the two numbers that decide whether matrix reduction is worth opening at all.',
      inputSchema: { ...DUMP_INPUT },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ dumpPath }) => {
      const { styleMatrix } = await styleReport();
      return toolResult(styleMatrix(await loadDump(dumpPath)));
    },
  );

  server.registerTool(
    'style_debt',
    {
      description:
        'What the style system is owed: escape hatches taken with their stated reason, context obligations required and discharged nowhere, variables declared and never read, and the components no sheet is known to style. Read `extractionGaps` first — the rest is only worth its answer on a complete graph.',
      inputSchema: { ...DUMP_INPUT },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ dumpPath }) => {
      const { styleDebt } = await styleReport();
      return toolResult(styleDebt(await loadDump(dumpPath)));
    },
  );
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
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: { result },
  };
}
