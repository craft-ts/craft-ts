/**
 * Brings an existing CraftTS project up to date with the agent wiring the
 * generator writes today.
 *
 * `craft create --force` cannot do this. It rewrites every generated file —
 * `src/`, `package.json`, the tsconfigs — so on a project with real code it is
 * a regeneration, not an upgrade. This command only adds what is missing: the
 * agent skills and hooks, the graph MCP server, its scripts, and the line that
 * ignores its output. It never writes application code, and running it twice
 * changes nothing the second time.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AGENT_MARKER_DIRECTORIES,
  CRAFT_TS_STARTER_VERSION,
  GRAPH_GITIGNORE_ENTRY,
  GRAPH_MCP_PACKAGE,
  GRAPH_MCP_SERVER_ENTRY,
  GRAPH_MCP_SERVER_NAME,
  GRAPH_SCRIPTS,
  graphAgentFiles,
  type CreateAgent,
} from './create-project.js';

export type AgentSyncAction = 'created' | 'updated' | 'unchanged' | 'skipped';

export type AgentSyncChange = {
  /** Path relative to the project root. */
  readonly file: string;
  readonly action: AgentSyncAction;
  readonly detail: string;
};

export type AgentSyncOptions = {
  readonly rootDir: string;
  /** Defaults to the agents the project already has a directory for. */
  readonly agents?: readonly CreateAgent[];
  /** Report what would change without touching the disk. */
  readonly dryRun?: boolean;
};

export type AgentSyncResult = {
  readonly agents: readonly CreateAgent[];
  readonly changes: readonly AgentSyncChange[];
  readonly dryRun: boolean;
  /** True when at least one file would change. */
  readonly changed: boolean;
};

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function readJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** The agents a project already uses, read from the directories they own. */
export function detectAgents(rootDir: string): readonly CreateAgent[] {
  return (
    Object.entries(AGENT_MARKER_DIRECTORIES) as [CreateAgent, string][]
  ).flatMap(([agent, directory]) =>
    existsSync(join(rootDir, directory)) ? [agent] : [],
  );
}

/**
 * Adds our hook entry to an agent's configuration without disturbing the rest.
 *
 * A project may already hook the same event for its own reasons, so entries
 * are appended, and an entry that already runs `graph-first.mjs` is left alone
 * — that is what makes a second run a no-op.
 */
function mergeHookConfig(
  existing: Record<string, unknown> | undefined,
  ours: Record<string, unknown>,
): { merged: Record<string, unknown>; changed: boolean } {
  const ourHooks = (ours['hooks'] ?? {}) as Record<string, unknown[]>;
  const existingHooks = (existing?.['hooks'] ?? {}) as Record<string, unknown>;
  const hooks: Record<string, unknown> = { ...existingHooks };
  let changed = false;

  for (const [event, entries] of Object.entries(ourHooks)) {
    const current = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
    if (
      current.some((entry) => JSON.stringify(entry).includes('graph-first.mjs'))
    ) {
      continue;
    }
    hooks[event] = [...current, ...entries];
    changed = true;
  }

  const merged: Record<string, unknown> = { ...(existing ?? {}), hooks };
  if (existing?.['version'] === undefined && ours['version'] !== undefined) {
    merged['version'] = ours['version'];
    changed = changed || existing !== undefined;
  }
  return { merged, changed };
}

/** The version to request for a package, matching the project's other Craft deps. */
function craftVersion(packageJson: Record<string, unknown> | undefined): string {
  for (const field of ['devDependencies', 'dependencies']) {
    const entries = (packageJson?.[field] ?? {}) as Record<string, string>;
    for (const [name, version] of Object.entries(entries)) {
      if (name.startsWith('@craft-ts/')) return version;
    }
  }
  return CRAFT_TS_STARTER_VERSION;
}

export function planAgentSync(options: AgentSyncOptions): AgentSyncResult {
  const { rootDir } = options;
  const agents = options.agents?.length
    ? options.agents
    : detectAgents(rootDir);
  const changes: AgentSyncChange[] = [];
  const writes: { path: string; contents: string }[] = [];

  const record = (
    file: string,
    contents: string,
    detail: string,
  ): void => {
    const path = join(rootDir, file);
    const before = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    if (before === contents) {
      changes.push({ file, action: 'unchanged', detail });
      return;
    }
    changes.push({
      file,
      action: before === undefined ? 'created' : 'updated',
      detail,
    });
    writes.push({ path, contents });
  };

  for (const agent of agents) {
    const { documents, hookConfig } = graphAgentFiles(agent);
    for (const [file, contents] of Object.entries(documents)) {
      record(file, contents, `${agent} agent file`);
    }
    if (hookConfig) {
      const path = join(rootDir, hookConfig.file);
      const existing = readJson(path);
      const { merged, changed } = mergeHookConfig(existing, hookConfig.value);
      if (existing !== undefined && !changed) {
        changes.push({
          file: hookConfig.file,
          action: 'unchanged',
          detail: `${agent} hook already registered`,
        });
      } else {
        record(hookConfig.file, json(merged), `${agent} hook`);
      }
    }
  }

  // .mcp.json: add our server, keep every other one.
  const mcpPath = join(rootDir, '.mcp.json');
  const mcp = readJson(mcpPath) ?? {};
  const servers = (mcp['mcpServers'] ?? {}) as Record<string, unknown>;
  if (servers[GRAPH_MCP_SERVER_NAME] === undefined) {
    record(
      '.mcp.json',
      json({
        ...mcp,
        mcpServers: { ...servers, [GRAPH_MCP_SERVER_NAME]: GRAPH_MCP_SERVER_ENTRY },
      }),
      'graph MCP server',
    );
  } else {
    changes.push({
      file: '.mcp.json',
      action: 'unchanged',
      detail: 'graph MCP server already registered',
    });
  }

  // package.json: add the scripts and the dependency, never replace a value
  // the project already chose.
  const packagePath = join(rootDir, 'package.json');
  const packageJson = readJson(packagePath);
  if (!packageJson) {
    changes.push({
      file: 'package.json',
      action: 'skipped',
      detail: 'no package.json in this directory',
    });
  } else {
    const scripts = (packageJson['scripts'] ?? {}) as Record<string, string>;
    const devDependencies = (packageJson['devDependencies'] ?? {}) as Record<
      string,
      string
    >;
    const nextScripts = { ...scripts };
    for (const [name, command] of Object.entries(GRAPH_SCRIPTS)) {
      if (nextScripts[name] === undefined) nextScripts[name] = command;
    }
    const nextDevDependencies = { ...devDependencies };
    if (nextDevDependencies[GRAPH_MCP_PACKAGE] === undefined) {
      nextDevDependencies[GRAPH_MCP_PACKAGE] = craftVersion(packageJson);
    }
    record(
      'package.json',
      json({
        ...packageJson,
        scripts: nextScripts,
        devDependencies: nextDevDependencies,
      }),
      'graph scripts and devDependency',
    );
  }

  // .gitignore: one line, appended.
  const gitignorePath = join(rootDir, '.gitignore');
  const gitignore = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf8')
    : '';
  if (
    gitignore
      .split(/\r?\n/)
      .some((line) => line.trim() === GRAPH_GITIGNORE_ENTRY)
  ) {
    changes.push({
      file: '.gitignore',
      action: 'unchanged',
      detail: 'graph output already ignored',
    });
  } else {
    const separator = gitignore === '' || gitignore.endsWith('\n') ? '' : '\n';
    record(
      '.gitignore',
      `${gitignore}${separator}${GRAPH_GITIGNORE_ENTRY}\n`,
      'graph output',
    );
  }

  if (!options.dryRun) {
    for (const { path, contents } of writes) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, 'utf8');
    }
  }

  return {
    agents,
    changes,
    dryRun: options.dryRun === true,
    changed: writes.length > 0,
  };
}

/** Applies the plan. `dryRun` reports it instead. */
export function runAgentSync(options: AgentSyncOptions): AgentSyncResult {
  return planAgentSync(options);
}
