/**
 * How precise is a code slice, measured rather than asserted.
 *
 * The whole attestation mechanism rests on one bet: that the fingerprint of a
 * slice moves when — and close to only when — something that changes the
 * render moves. This file replays the repository's own history and puts two
 * numbers on that bet.
 *
 * - **invalidation rate**: the fraction of slices an average commit
 *   invalidates. Expected low. Above `INVALIDATION_BUDGET` the graph is too
 *   coarse to be worth anything: every commit would re-render everything.
 * - **false negatives**: a slice whose fingerprint did *not* move although a
 *   file its closure reaches was edited. Expected zero, because this is the
 *   dangerous direction — a missed regression, in silence, forever.
 *
 * A word on the second number, because the plan and the design pull in
 * opposite directions here. Task 2 *requires* that editing a node which merely
 * shares a file with the slice leaves the fingerprint alone; that precision is
 * the feature. So the file-level count is reported as
 * `fileScopedNonInvalidations` — the precision the design buys — and the count
 * that must be zero is `falseNegatives`, measured at node granularity: a slice
 * whose fingerprint held still although a node *inside its closure* changed
 * its own source. That one can only be an implementation defect.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  analyzeDependencyGraph,
  type DependencyGraph,
  type DependencyGraphNode,
} from './dependency-graph.js';
import {
  createSliceIndex,
  fingerprintOf,
  sliceOf,
  type CodeSlice,
} from './code-slice.js';

/** Above this, the graph is too coarse for the mechanism to pay for itself. */
export const INVALIDATION_BUDGET = 0.25;

/** What gets a slice of its own. Everything a human could look at. */
export const DEFAULT_SLICE_ROOTS = (node: DependencyGraphNode): boolean =>
  node.kind === 'component' || node.kind === 'route' || node.kind === 'service';

export interface RevisionSlices {
  readonly commit: string;
  /** Root id (repository-relative) → slice, with relative leaf ids. */
  readonly slices: ReadonlyMap<string, CodeSlice>;
}

export interface CommitMeasure {
  readonly commit: string;
  readonly changedFiles: readonly string[];
  readonly slices: number;
  readonly invalidated: number;
  readonly rate: number;
  /**
   * Slices whose fingerprint held still although a node of their closure
   * changed its own source. Must be empty.
   */
  readonly falseNegatives: readonly string[];
  /**
   * Slices whose fingerprint held still although the commit touched a file
   * their closure reaches. This is the precision the node-level hash buys, not
   * a defect — it is reported so the two are never confused.
   */
  readonly fileScopedNonInvalidations: readonly string[];
  /** Slices that exist on one side only; excluded from the rate. */
  readonly appeared: number;
  readonly disappeared: number;
}

export interface SlicePrecisionReport {
  readonly commits: readonly CommitMeasure[];
  readonly medianInvalidationRate: number;
  readonly maxInvalidationRate: number;
  readonly falseNegatives: number;
  readonly fileScopedNonInvalidations: number;
  readonly budget: number;
  readonly withinBudget: boolean;
}

export interface SlicePrecisionOptions {
  readonly rootDir?: string;
  readonly tsConfigFilePath?: string;
  readonly include?: readonly string[];
  /** How many commits back to replay. */
  readonly commits?: number;
  readonly isRoot?: (node: DependencyGraphNode) => boolean;
  /** Injected for tests; defaults to running `git` in `rootDir`. */
  readonly git?: (args: readonly string[]) => string;
  /** Injected for tests; defaults to checking out and analysing a revision. */
  readonly slicesAt?: (commit: string) => RevisionSlices;
  readonly onProgress?: (message: string) => void;
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : (((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
};

const gitIn =
  (rootDir: string) =>
  (args: readonly string[]): string =>
    execFileSync('git', [...args], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

/**
 * The slices of one revision, with every path made repository-relative.
 *
 * Relative, because the revision is analysed in a throwaway directory and an
 * absolute id would differ on every run for reasons that have nothing to do
 * with the code.
 */
export function sliceRevision(
  graph: DependencyGraph,
  analysedRoot: string,
  commit: string,
  isRoot: (node: DependencyGraphNode) => boolean,
): RevisionSlices {
  const index = createSliceIndex(graph);
  const strip = (id: string): string =>
    id.split(analysedRoot).join('<root>').split('\\').join('/');
  const slices = new Map<string, CodeSlice>();
  for (const node of graph.nodes) {
    if (!isRoot(node)) continue;
    const slice = sliceOf(index, node.id);
    // The fingerprint is recomputed from the stripped leaves. Keeping the one
    // `sliceOf` returned would fold the temporary directory into every leaf id
    // and make two revisions differ everywhere, always.
    const leaves = Object.fromEntries(
      Object.entries(slice.leaves).map(([id, hash]) => [strip(id), hash]),
    );
    slices.set(strip(node.id), {
      root: strip(node.id),
      nodes: slice.nodes.map(strip),
      fingerprint: fingerprintOf(leaves),
      leaves,
    });
  }
  return { commit, slices };
}

/**
 * Materialises a revision into a temporary directory and slices it.
 *
 * `git archive` rather than a second worktree: the measurement must not be
 * able to disturb the tree it is measuring, and a detached archive cannot.
 * `node_modules` is symlinked back in so the typechecker still resolves.
 */
export function checkoutAndSlice(
  rootDir: string,
  tsConfigFilePath: string,
  include: readonly string[] | undefined,
  isRoot: (node: DependencyGraphNode) => boolean,
  commit: string,
): RevisionSlices {
  // `realpathSync`, because on macOS `tmpdir()` hands back `/var/...` while
  // the typechecker resolves the same files under `/private/var/...`. Stripping
  // the wrong one leaves the temporary path inside every node id, and then
  // every fingerprint differs between revisions for no reason at all — the
  // measurement reads 100% invalidation and means nothing.
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'craft-slice-precision-')),
  );
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', commit], {
      cwd: rootDir,
      maxBuffer: 512 * 1024 * 1024,
    });
    execFileSync('tar', ['-x', '-C', directory], { input: archive });
    const modules = join(rootDir, 'node_modules');
    if (existsSync(modules) && !existsSync(join(directory, 'node_modules'))) {
      symlinkSync(modules, join(directory, 'node_modules'), 'dir');
    }
    const graph = analyzeDependencyGraph({
      rootDir: directory,
      tsConfigFilePath,
      ...(include ? { include } : {}),
    });
    return sliceRevision(graph, directory, commit, isRoot);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Files a commit changed, repository-relative and slash-separated. */
export function changedFilesBetween(
  git: (args: readonly string[]) => string,
  before: string,
  after: string,
): readonly string[] {
  return git(['diff', '--name-only', before, after])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<root>/${line}`);
}

export function compareRevisions(
  before: RevisionSlices,
  after: RevisionSlices,
  changedFiles: readonly string[],
): CommitMeasure {
  const touched = new Set(changedFiles);
  const shared = [...after.slices.keys()].filter((id) => before.slices.has(id));

  let invalidated = 0;
  const falseNegatives: string[] = [];
  const fileScopedNonInvalidations: string[] = [];

  for (const id of shared) {
    const left = before.slices.get(id) as CodeSlice;
    const right = after.slices.get(id) as CodeSlice;
    const moved = left.fingerprint !== right.fingerprint;
    if (moved) {
      invalidated += 1;
      continue;
    }
    // The fingerprint held still. Two very different reasons it might have.
    const nodeChanged = Object.entries(right.leaves).some(
      ([node, hash]) => left.leaves[node] !== undefined && left.leaves[node] !== hash,
    );
    if (nodeChanged) {
      falseNegatives.push(id);
      continue;
    }
    const fileTouched = right.nodes.some((node) =>
      [...touched].some((file) => node.includes(file)),
    );
    if (fileTouched) fileScopedNonInvalidations.push(id);
  }

  return {
    commit: after.commit,
    changedFiles,
    slices: shared.length,
    invalidated,
    rate: shared.length === 0 ? 0 : invalidated / shared.length,
    falseNegatives: falseNegatives.sort(),
    fileScopedNonInvalidations: fileScopedNonInvalidations.sort(),
    appeared: [...after.slices.keys()].filter((id) => !before.slices.has(id))
      .length,
    disappeared: [...before.slices.keys()].filter((id) => !after.slices.has(id))
      .length,
  };
}

export function summarise(
  commits: readonly CommitMeasure[],
): SlicePrecisionReport {
  const rates = commits.map((commit) => commit.rate);
  const medianInvalidationRate = median(rates);
  return {
    commits,
    medianInvalidationRate,
    maxInvalidationRate: rates.length ? Math.max(...rates) : 0,
    falseNegatives: commits.reduce(
      (total, commit) => total + commit.falseNegatives.length,
      0,
    ),
    fileScopedNonInvalidations: commits.reduce(
      (total, commit) => total + commit.fileScopedNonInvalidations.length,
      0,
    ),
    budget: INVALIDATION_BUDGET,
    withinBudget:
      medianInvalidationRate <= INVALIDATION_BUDGET &&
      commits.every((commit) => commit.falseNegatives.length === 0),
  };
}

export function measureSlicePrecision(
  options: SlicePrecisionOptions = {},
): SlicePrecisionReport {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const tsConfigFilePath = options.tsConfigFilePath ?? 'tsconfig.json';
  const isRoot = options.isRoot ?? DEFAULT_SLICE_ROOTS;
  const git = options.git ?? gitIn(rootDir);
  const slicesAt =
    options.slicesAt ??
    ((commit: string) =>
      checkoutAndSlice(rootDir, tsConfigFilePath, options.include, isRoot, commit));
  const report = options.onProgress ?? (() => undefined);

  const wanted = options.commits ?? 20;
  const revisions = git(['log', '-n', String(wanted + 1), '--format=%H'])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .reverse();

  const measures: CommitMeasure[] = [];
  let previous: RevisionSlices | undefined;
  for (const commit of revisions) {
    report(`slicing ${commit.slice(0, 8)}`);
    const current = slicesAt(commit);
    if (previous) {
      measures.push(
        compareRevisions(
          previous,
          current,
          changedFilesBetween(git, previous.commit, commit),
        ),
      );
    }
    previous = current;
  }
  return summarise(measures);
}

export function formatSlicePrecision(report: SlicePrecisionReport): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const lines = [
    `Slice precision over ${report.commits.length} commits`,
    `  median invalidation rate  ${percent(report.medianInvalidationRate)} (budget ${percent(report.budget)})`,
    `  max invalidation rate     ${percent(report.maxInvalidationRate)}`,
    `  false negatives           ${report.falseNegatives} (must be 0)`,
    `  file-scoped precision     ${report.fileScopedNonInvalidations} slices spared by node-level hashing`,
  ];
  if (!report.withinBudget) {
    lines.push(
      '',
      report.falseNegatives > 0
        ? '  A false negative is a regression nobody will ever be asked about. Fix the closure before going further.'
        : '  The graph is too coarse: every commit would re-render most of the suite. Narrow the closure (see provideTemplateTrace) before wave 2.',
    );
  }
  for (const commit of report.commits) {
    lines.push(
      `  ${commit.commit.slice(0, 8)}  ${String(commit.invalidated).padStart(4)}/${String(commit.slices).padEnd(4)}  ${percent(commit.rate).padStart(6)}  ${commit.changedFiles.length} files`,
    );
  }
  return lines.join('\n');
}

/** Used by the bin to print a path the reader can act on. */
export const relativeToRoot = (rootDir: string, path: string): string =>
  relative(rootDir, path).split('\\').join('/');
