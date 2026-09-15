import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  analyzeDependencyGraph,
  type AnalyzeDependencyGraphOptions,
  type DependencyGraph,
} from '@craft-ts/dev-tools/dependency-graph';
import { churnFromGitLog } from '@craft-ts/dev-tools/graph-metrics';
import {
  applyCoverage,
  type IstanbulCoverageMap,
} from '@craft-ts/dev-tools/graph-coverage';
import { ts } from 'ts-morph';

export const DEFAULT_GRAPH_FILE = 'craft-dependency-graph.json';

/**
 * File modification times come from the filesystem clock, `builtAt` from
 * `Date.now()`, and on macOS the former runs up to a millisecond ahead: a file
 * written just before an analysis would otherwise make the fresh graph stale.
 */
const MTIME_TOLERANCE_MS = 5;

/** Looked up in this order when `CRAFT_GRAPH_TSCONFIG` is not set. */
export const TSCONFIG_CANDIDATES = [
  'tsconfig.graph.json',
  'tsconfig.app.json',
  'tsconfig.json',
] as const;

export type GraphStoreOptions = {
  readonly rootDir: string;
  /** Absolute. Absent when no candidate exists: the graph can then only be read. */
  readonly tsConfigFilePath?: string;
  /** Absolute path of the JSON graph, read when present and written by rebuild. */
  readonly graphFile: string;
  /** Refuse to rebuild: for CI and shared environments that must only read. */
  readonly readonly: boolean;
  /** Absolute path of an Istanbul `coverage-final.json`, applied on every load. */
  readonly coverageFile?: string;
  /** Replaces the analysis, for tests. */
  readonly analyze?: (options: AnalyzeDependencyGraphOptions) => DependencyGraph;
};

const truthy = (value: string | undefined): boolean =>
  value !== undefined && ['1', 'true', 'yes'].includes(value.toLowerCase());

export function graphStoreOptionsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd: string = process.cwd(),
): GraphStoreOptions {
  const rootDir = resolve(cwd, env['CRAFT_GRAPH_ROOT'] ?? '.');
  const tsConfig =
    env['CRAFT_GRAPH_TSCONFIG'] ??
    TSCONFIG_CANDIDATES.find((candidate) =>
      existsSync(resolve(rootDir, candidate)),
    );
  return {
    rootDir,
    ...(tsConfig === undefined
      ? {}
      : { tsConfigFilePath: resolve(rootDir, tsConfig) }),
    graphFile: resolve(rootDir, env['CRAFT_GRAPH_FILE'] ?? DEFAULT_GRAPH_FILE),
    readonly: truthy(env['CRAFT_GRAPH_READONLY']),
    ...(env['CRAFT_GRAPH_COVERAGE']
      ? { coverageFile: resolve(rootDir, env['CRAFT_GRAPH_COVERAGE']) }
      : {}),
  };
}

export type LoadedGraph = {
  readonly graph: DependencyGraph;
  /** `file`: read from `graphFile`. `analysis`: built in memory at start-up. */
  readonly source: 'file' | 'analysis';
  /** Epoch milliseconds: the file's mtime, or when the analysis started. */
  readonly builtAt: number;
};

/**
 * `unknown` when there is no tsconfig to list the program from: a graph whose
 * freshness cannot be checked is not reported as fresh.
 */
export type GraphStaleness = boolean | 'unknown';

export type GraphFreshness = {
  readonly stale: GraphStaleness;
  /** The most recently modified program file, when it is newer than the graph. */
  readonly newestSource?: string;
};

/**
 * Loads the dependency graph once and keeps it in memory.
 *
 * Staleness is deliberately minimal: the graph is stale when a file of the
 * TypeScript program — or its tsconfig — was modified after the graph was
 * built. No manifest, no watcher: an agent is told, and decides to rebuild.
 */
export class GraphStore {
  readonly options: GraphStoreOptions;
  #loaded: LoadedGraph | undefined;
  #programFiles: readonly string[] | undefined;

  constructor(options: GraphStoreOptions) {
    this.options = options;
  }

  get(): LoadedGraph {
    this.#loaded ??= this.#load();
    return this.#loaded;
  }

  rebuild(): LoadedGraph {
    if (this.options.readonly) {
      throw new Error(
        'craft-ts-graph-mcp: rebuilding is disabled by CRAFT_GRAPH_READONLY.',
      );
    }
    const analysed = this.#analyze();
    mkdirSync(dirname(this.options.graphFile), { recursive: true });
    writeFileSync(
      this.options.graphFile,
      `${JSON.stringify(analysed.graph, null, 2)}\n`,
      'utf8',
    );
    this.#loaded = { ...analysed, source: 'file' };
    this.#programFiles = undefined;
    return this.#loaded;
  }

  freshness(): GraphFreshness {
    const { builtAt } = this.get();
    const tsConfig = this.options.tsConfigFilePath;
    if (!tsConfig || !existsSync(tsConfig)) return { stale: 'unknown' };
    this.#programFiles ??= [tsConfig, ...programFiles(tsConfig)];
    let newest: { path: string; mtime: number } | undefined;
    for (const path of this.#programFiles) {
      let mtime: number;
      try {
        mtime = statSync(path).mtimeMs;
      } catch {
        continue;
      }
      if (!newest || mtime > newest.mtime) newest = { path, mtime };
    }
    return newest && newest.mtime > builtAt + MTIME_TOLERANCE_MS
      ? { stale: true, newestSource: newest.path }
      : { stale: false };
  }

  /** Commits per file since a date, read from git in the project root. */
  churnSince(since: string): ReadonlyMap<string, number> {
    const git = (args: readonly string[], cwd: string): string => {
      const result = spawnSync('git', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
      }
      return result.stdout;
    };
    const repositoryRoot = git(
      ['rev-parse', '--show-toplevel'],
      this.options.rootDir,
    ).trim();
    return churnFromGitLog(
      git(
        ['log', `--since=${since}`, '--name-only', '--pretty=format:'],
        repositoryRoot,
      ),
      repositoryRoot,
    );
  }

  #load(): LoadedGraph {
    const file = this.options.graphFile;
    if (!existsSync(file)) return this.#analyze();
    const graph = JSON.parse(readFileSync(file, 'utf8')) as DependencyGraph;
    if (
      graph?.version !== 1 ||
      !Array.isArray(graph.nodes) ||
      !Array.isArray(graph.edges)
    ) {
      throw new Error(
        `craft-ts-graph-mcp: ${file} is not a CraftTS dependency graph (version 1).`,
      );
    }
    return {
      graph: this.#withCoverage(graph),
      source: 'file',
      builtAt: statSync(file).mtimeMs,
    };
  }

  /** Coverage is re-applied on every load, so a new report needs no rebuild. */
  #withCoverage(graph: DependencyGraph): DependencyGraph {
    const file = this.options.coverageFile;
    if (!file) return graph;
    if (!existsSync(file)) {
      throw new Error(
        `craft-ts-graph-mcp: CRAFT_GRAPH_COVERAGE points to ${file}, which does not exist. Write it with 'vitest run --coverage --coverage.reporter=json'.`,
      );
    }
    return applyCoverage(
      graph,
      JSON.parse(readFileSync(file, 'utf8')) as IstanbulCoverageMap,
    );
  }

  #analyze(): LoadedGraph {
    const { rootDir, tsConfigFilePath, graphFile } = this.options;
    if (!tsConfigFilePath) {
      throw new Error(
        `craft-ts-graph-mcp: no graph at ${graphFile} and no tsconfig in ${rootDir} (looked for ${TSCONFIG_CANDIDATES.join(', ')}). Set CRAFT_GRAPH_TSCONFIG or CRAFT_GRAPH_FILE.`,
      );
    }
    const builtAt = Date.now();
    const analyze = this.options.analyze ?? analyzeDependencyGraph;
    return {
      graph: this.#withCoverage(analyze({ rootDir, tsConfigFilePath })),
      source: 'analysis',
      builtAt,
    };
  }
}

/** The files a tsconfig selects, without parsing or type-checking them. */
function programFiles(tsConfigFilePath: string): readonly string[] {
  const read = ts.readConfigFile(tsConfigFilePath, ts.sys.readFile);
  if (read.error) return [];
  return ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(tsConfigFilePath),
  ).fileNames;
}
