/**
 * The slice of code a test's verdict depends on.
 *
 * Two halves, unioned, as the plan requires:
 *
 * - **the test body** — hashed on its own `it(...)` callback, not on the whole
 *   spec file. Editing one test must not invalidate the judgement on its two
 *   hundred neighbours; a file-level hash would do exactly that and the
 *   register would be useless on the first spec file anyone touches.
 * - **the code under test** — every graph node declared in a file the spec
 *   reaches through its imports, sliced with `code-slice.ts`.
 *
 * The import closure is followed at file granularity even though the second
 * half is node-granular. That is the cautious direction and it is the correct
 * one here: a spec reaching a file it does not use costs a re-run, while a spec
 * missing a file it does use costs a regression nobody is ever asked about.
 */
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { Node, Project, type SourceFile } from 'ts-morph';
import {
  createSliceIndex,
  fingerprintOf,
  sliceOf,
  type SliceIndex,
} from './code-slice.js';
import {
  analyzeDependencyGraph,
  type DependencyGraph,
} from './dependency-graph.js';

const TEST_BLOCKS = new Set(['it', 'test']);
const SUITE_BLOCKS = new Set(['describe', 'suite']);

const sha = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 16);

const posix = (path: string): string => path.split('\\').join('/');

/**
 * `describe > describe > it` → the hash of that `it`'s callback.
 *
 * The separator matches what a runner reports, because the key has to line up
 * with the inventory read from the report — a subject that exists on one side
 * only is a subject nobody is ever asked about.
 */
export function testBodyHashes(
  sourceFile: SourceFile,
  separator = ' > ',
): ReadonlyMap<string, string> {
  const hashes = new Map<string, string>();

  const nameOf = (call: import('ts-morph').CallExpression): string | undefined => {
    const first = call.getArguments()[0];
    return first && Node.isStringLiteral(first) ? first.getLiteralValue() : undefined;
  };

  const calleeOf = (call: import('ts-morph').CallExpression): string => {
    const expression = call.getExpression();
    // `it.each`, `describe.skip`: the block is still the leading identifier.
    return Node.isPropertyAccessExpression(expression)
      ? expression.getExpression().getText()
      : expression.getText();
  };

  const walk = (node: Node, prefix: readonly string[]): void => {
    node.forEachChild((child) => {
      if (Node.isCallExpression(child)) {
        const callee = calleeOf(child);
        const name = nameOf(child);
        if (name !== undefined && SUITE_BLOCKS.has(callee)) {
          walk(child, [...prefix, name]);
          return;
        }
        if (name !== undefined && TEST_BLOCKS.has(callee)) {
          const body = child.getArguments()[1];
          hashes.set(
            [...prefix, name].join(separator),
            sha(body ? body.getText() : child.getText()),
          );
          return;
        }
      }
      walk(child, prefix);
    });
  };

  walk(sourceFile, []);
  return hashes;
}

/** Files a spec reaches through its imports, itself included. */
export function importClosure(
  sourceFile: SourceFile,
  rootDir: string,
): readonly string[] {
  const seen = new Set<string>();
  const queue = [sourceFile];
  while (queue.length > 0) {
    const current = queue.shift() as SourceFile;
    const path = current.getFilePath();
    if (seen.has(path)) continue;
    if (!path.startsWith(rootDir) || path.includes('/node_modules/')) continue;
    seen.add(path);
    for (const referenced of current.getReferencedSourceFiles()) {
      if (!seen.has(referenced.getFilePath())) queue.push(referenced);
    }
  }
  return [...seen].sort();
}

export interface TestSliceIndex {
  readonly graph: DependencyGraph;
  readonly slices: SliceIndex;
  /** `libs/core/src/lib/state.spec.ts`, `state > counts` → merkle. */
  fingerprintFor(file: string, fullName: string): string;
  /** The leaves behind a fingerprint, for `attest why`. */
  leavesFor(file: string, fullName: string): Readonly<Record<string, string>>;
  /** Every spec file the project knows about, repository-relative. */
  readonly specFiles: readonly string[];
}

export interface TestSliceOptions {
  readonly rootDir?: string;
  readonly tsConfigFilePath?: string;
  /** Globs added on top of the tsconfig, since specs are usually excluded. */
  readonly specGlobs?: readonly string[];
  readonly nameSeparator?: string;
  /** Injected by tests that already hold a graph. */
  readonly graph?: DependencyGraph;
}

export const DEFAULT_SPEC_GLOBS = ['**/*.spec.ts', '**/*.test.ts'];

export function createTestSliceIndex(
  options: TestSliceOptions = {},
): TestSliceIndex {
  // `realpathSync`, because on macOS a temporary root is handed out as
  // `/var/...` and resolved by the typechecker as `/private/var/...`. Strip the
  // wrong one and every identifier keeps an absolute prefix.
  const rootDir = realpathSync(resolve(options.rootDir ?? process.cwd()));
  const tsConfigFilePath = resolve(
    rootDir,
    options.tsConfigFilePath ?? 'tsconfig.json',
  );
  const graph =
    options.graph ??
    analyzeDependencyGraph({ rootDir, tsConfigFilePath: options.tsConfigFilePath });
  const slices = createSliceIndex(graph);

  const project = new Project({ tsConfigFilePath });
  for (const glob of options.specGlobs ?? DEFAULT_SPEC_GLOBS) {
    project.addSourceFilesAtPaths([
      `${rootDir}/${glob}`,
      `!${rootDir}/node_modules/**`,
      `!${rootDir}/dist/**`,
    ]);
  }

  const nodesByFile = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!node.filePath) continue;
    const known = nodesByFile.get(node.filePath);
    if (known) known.push(node.id);
    else nodesByFile.set(node.filePath, [node.id]);
  }

  const relativeToRoot = (path: string): string => posix(relative(rootDir, path));

  /**
   * The root, removed from anywhere inside an identifier.
   *
   * A node id is `primitive:/abs/path/app.ts#owner/...`, not a path: running it
   * through `relative` produces a different string for every checkout, and two
   * recordings of the same slice would then share no leaf at all.
   */
  const stripRoot = (id: string): string =>
    posix(id).split(`${posix(rootDir)}/`).join('');

  const specFiles = project
    .getSourceFiles()
    .filter((file) => /\.(spec|test)\.tsx?$/.test(file.getFilePath()))
    .map((file) => relativeToRoot(file.getFilePath()))
    .sort();

  const bodyCache = new Map<string, ReadonlyMap<string, string>>();
  const underTestCache = new Map<string, Readonly<Record<string, string>>>();

  const sourceFileFor = (file: string): SourceFile | undefined =>
    project.getSourceFile(resolve(rootDir, file));

  const bodiesOf = (file: string): ReadonlyMap<string, string> => {
    const known = bodyCache.get(file);
    if (known) return known;
    const sourceFile = sourceFileFor(file);
    const hashes = sourceFile
      ? testBodyHashes(sourceFile, options.nameSeparator)
      : new Map<string, string>();
    bodyCache.set(file, hashes);
    return hashes;
  };

  const underTest = (file: string): Readonly<Record<string, string>> => {
    const known = underTestCache.get(file);
    if (known) return known;
    const sourceFile = sourceFileFor(file);
    const leaves: Record<string, string> = {};
    if (sourceFile) {
      for (const path of importClosure(sourceFile, rootDir)) {
        for (const nodeId of nodesByFile.get(path) ?? []) {
          for (const [id, hash] of Object.entries(sliceOf(slices, nodeId).leaves)) {
            leaves[stripRoot(id)] = hash;
          }
        }
      }
    }
    underTestCache.set(file, leaves);
    return leaves;
  };

  const leavesFor = (
    file: string,
    fullName: string,
  ): Readonly<Record<string, string>> => {
    const body = bodiesOf(file).get(fullName);
    return {
      // A test whose name is not a literal — `it(\`case ${index}\`)` — falls
      // back to its whole file. Coarser, and deliberately so: the alternative
      // is a subject with no fingerprint at all, which never gets re-reviewed.
      [`body:${file}#${fullName}`]:
        body ?? `file:${sha(sourceFileFor(file)?.getFullText() ?? '')}`,
      ...underTest(file),
    };
  };

  return {
    graph,
    slices,
    specFiles,
    leavesFor,
    fingerprintFor: (file, fullName) => fingerprintOf(leavesFor(file, fullName)),
  };
}

/** The graph nodes whose source moved between two recordings of the leaves. */
export function movedNodes(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): readonly string[] {
  return Object.keys(after)
    .filter((id) => before[id] !== undefined && before[id] !== after[id])
    .sort();
}
