/**
 * Documentation attached to graph nodes: the JSDoc of a declaration, the
 * comments that justify its code, and the Markdown pages that describe it.
 *
 * Deterministic on purpose. A comment belongs to the innermost node whose
 * declaration contains it, exactly like a decision point. A page documents a
 * node only when it names it in inline code and that name designates exactly
 * one node; any doubt becomes a diagnostic, never a guessed relation.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { Node, SyntaxKind, ts, type SourceFile } from 'ts-morph';
import { matchPathGlob } from './architecture-graph.js';
import type {
  DependencyGraph,
  DependencyGraphCollector,
  DependencyGraphContribution,
  DependencyGraphDiagnostic,
  DependencyGraphEdge,
  DependencyGraphNode,
  DependencyGraphNodeKind,
} from './dependency-graph.js';
import {
  containsDepths,
  createInnermostLocator,
  type OwnedRange,
} from './graph-metrics.js';

export type DependencyGraphNodeDoc = {
  /** First paragraph of the JSDoc description. */
  summary?: string;
  /** JSDoc tags by name, e.g. `{ deprecated: ['Use OrdersBoard.'] }`. */
  tags?: Record<string, string[]>;
  /** `WHY:`, `NOTE:` and `HACK:` comments credited to this node. */
  rationale?: string[];
};

export const DOC_AMBIGUOUS_DIAGNOSTIC = 'CRAFT_GRAPH_DOC_AMBIGUOUS';

/** The kinds a Markdown page can document, and a documentation rule checks. */
export const DOCUMENTED_KINDS: readonly DependencyGraphNodeKind[] = [
  'service',
  'component',
  'route',
  'primitive',
];

/*
 * Syntax that only wraps a declaration: `export const x = yield* state(…)`
 * carries its JSDoc on the statement, three levels above the call the node
 * stands for. Anything else — an array, a call argument — ends the climb, so a
 * template element never inherits the JSDoc of its component.
 */
const WRAPPER_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.VariableDeclaration,
  SyntaxKind.VariableDeclarationList,
  SyntaxKind.VariableStatement,
  SyntaxKind.ExportAssignment,
  SyntaxKind.ParenthesizedExpression,
  SyntaxKind.AsExpression,
  SyntaxKind.SatisfiesExpression,
  SyntaxKind.NonNullExpression,
  SyntaxKind.YieldExpression,
  SyntaxKind.AwaitExpression,
  SyntaxKind.PropertyAssignment,
]);

function declarationChain(source: Node): Node[] {
  const chain = [source];
  let current = source.getParent();
  while (current && WRAPPER_KINDS.has(current.getKind())) {
    chain.push(current);
    current = current.getParent();
  }
  return chain;
}

/** Where a declaration begins once the comments on the lines above it count. */
function leadingStart(node: Node): number {
  const text = node.getSourceFile().getFullText();
  for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) {
    const lineStart = text.lastIndexOf('\n', range.pos - 1) + 1;
    if (/^[ \t]*$/.test(text.slice(lineStart, range.pos))) return range.pos;
  }
  return node.getStart();
}

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();

export type DeclarationDoc = {
  /** Offset where the declaration starts, comments above it included. */
  readonly start: number;
  readonly summary?: string;
  readonly tags?: Record<string, string[]>;
};

export function declarationDocOf(source: Node): DeclarationDoc {
  const chain = declarationChain(source);
  const top = chain[chain.length - 1] as Node;
  let summary: string | undefined;
  const tags: Record<string, string[]> = {};
  const host = chain.find(
    (node) => Node.isJSDocable(node) && node.getJsDocs().length > 0,
  );
  if (host && Node.isJSDocable(host)) {
    const jsDoc = host.getJsDocs().at(-1);
    const description = jsDoc?.getDescription().trim();
    if (description) summary = collapse(description.split(/\n\s*\n/)[0] ?? '');
    for (const tag of jsDoc?.getTags() ?? []) {
      // Read the tag's own text: `@see Target` parses `Target` as a name, not
      // a comment, so getCommentText() would come back empty.
      const text = tag
        .getText()
        .replace(/^@[\w-]+/, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\*+/, ''))
        .join(' ');
      (tags[tag.getTagName()] ??= []).push(collapse(text));
    }
  }
  return {
    start: leadingStart(top),
    ...(summary ? { summary } : {}),
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
  };
}

export type RationaleComment = {
  readonly position: number;
  /** `WHY: …`, `NOTE: …` or `HACK: …`, whitespace collapsed. */
  readonly text: string;
};

const RATIONALE = /^(WHY|NOTE|HACK):\s*([\s\S]+)$/;

function rationaleText(raw: string): string | undefined {
  const body = raw.startsWith('//')
    ? raw.slice(2)
    : raw
        .slice(2, -2)
        .split('\n')
        .map((line) => line.replace(/^\s*\*+/, ''))
        .join(' ');
  const match = RATIONALE.exec(body.trim());
  return match ? `${match[1]}: ${collapse(match[2] ?? '')}` : undefined;
}

/**
 * The justification comments of a file, read from the comment ranges the
 * TypeScript scanner reports — a `// WHY:` inside a string is not a comment.
 */
export function rationaleComments(
  sourceFile: SourceFile,
): readonly RationaleComment[] {
  const text = sourceFile.getFullText();
  const found = new Map<number, string | undefined>();
  const collect = (position: number): void => {
    for (const range of ts.getLeadingCommentRanges(text, position) ?? []) {
      if (!found.has(range.pos)) {
        found.set(range.pos, rationaleText(text.slice(range.pos, range.end)));
      }
    }
  };
  const visit = (node: ts.Node): void => {
    collect(node.pos);
    collect(node.end);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile.compilerNode);
  return [...found]
    .flatMap(([position, value]) => (value ? [{ position, text: value }] : []))
    .sort((left, right) => left.position - right.position);
}

export type NodeDocSource = DeclarationDoc & {
  readonly filePath: string;
  /** Exclusive end offset of the declaration. */
  readonly end: number;
};

/** Sets `node.doc` on every node that has a JSDoc or a justification comment. */
export function attachNodeDocs(
  graph: DependencyGraph,
  sources: ReadonlyMap<string, NodeDocSource>,
  commentsOf: (filePath: string) => readonly RationaleComment[],
): void {
  const rangesByFile = new Map<string, OwnedRange[]>();
  for (const [id, source] of sources) {
    rangesByFile.set(source.filePath, [
      ...(rangesByFile.get(source.filePath) ?? []),
      { id, start: source.start, end: source.end },
    ]);
  }
  const depthOf = containsDepths(graph);
  const rationale = new Map<string, string[]>();
  for (const [filePath, ranges] of rangesByFile) {
    const locate = createInnermostLocator(ranges, depthOf);
    for (const comment of commentsOf(filePath)) {
      const owner = locate(comment.position);
      if (owner) rationale.set(owner, [...(rationale.get(owner) ?? []), comment.text]);
    }
  }
  for (const node of graph.nodes) {
    const source = sources.get(node.id);
    const notes = rationale.get(node.id);
    const doc: DependencyGraphNodeDoc = {
      ...(source?.summary ? { summary: source.summary } : {}),
      ...(source?.tags ? { tags: source.tags } : {}),
      ...(notes ? { rationale: notes } : {}),
    };
    if (Object.keys(doc).length > 0) node.doc = doc;
  }
}

/* ------------------------------------------------------------------------ *
 * Markdown pages
 * ------------------------------------------------------------------------ */

export type MarkdownPage = {
  readonly filePath: string;
  readonly text: string;
};

/**
 * A `doc-page` node per page, and a `documents` relation to every node the
 * page cites in inline code when that label names exactly one node of
 * {@link DOCUMENTED_KINDS}. Fenced code blocks are ignored.
 */
export function markdownDocsContribution(
  graph: Pick<DependencyGraph, 'nodes' | 'rootDir'>,
  pages: readonly MarkdownPage[],
): DependencyGraphContribution {
  const documented = new Set<string>(DOCUMENTED_KINDS);
  const byLabel = new Map<string, DependencyGraphNode[]>();
  for (const node of graph.nodes) {
    if (!documented.has(node.kind)) continue;
    byLabel.set(node.label, [...(byLabel.get(node.label) ?? []), node]);
  }

  const nodes: DependencyGraphNode[] = [];
  const edges: DependencyGraphEdge[] = [];
  const diagnostics: DependencyGraphDiagnostic[] = [];
  for (const page of [...pages].sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  )) {
    const lines = page.text.split(/\r?\n/);
    const title = lines
      .find((line) => /^#\s+\S/.test(line))
      ?.replace(/^#\s+/, '')
      .trim();
    const id = `doc-page:${page.filePath}`;
    nodes.push({
      id,
      kind: 'doc-page',
      label: title ?? basename(page.filePath),
      filePath: page.filePath,
      line: 1,
      endLine: lines.length,
      details: title ? { title } : {},
    });

    const cited = new Map<string, number>();
    let fenced = false;
    lines.forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return;
      }
      if (fenced) return;
      for (const match of line.matchAll(/`([^`]+)`/g)) {
        const label = (match[1] ?? '').trim();
        if (label && !cited.has(label)) cited.set(label, index + 1);
      }
    });

    const location = relative(graph.rootDir, page.filePath).split('\\').join('/');
    for (const [label, line] of cited) {
      const matches = byLabel.get(label) ?? [];
      if (matches.length === 1) {
        edges.push({
          from: id,
          to: (matches[0] as DependencyGraphNode).id,
          kind: 'documents',
          evidence: 'ast',
          proof: { filePath: page.filePath, line, pattern: `\`${label}\`` },
        });
      } else if (matches.length > 1) {
        diagnostics.push({
          code: DOC_AMBIGUOUS_DIAGNOSTIC,
          message: `${location}:${line} cites \`${label}\`, which names ${matches.length} nodes (${[
            ...new Set(matches.map((node) => node.kind)),
          ].join(', ')}): no relation drawn.`,
          proof: { filePath: page.filePath, line },
        });
      }
    }
  }
  return { nodes, edges, diagnostics };
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', 'tmp']);

/** Markdown files under `rootDir` whose relative path matches a glob. */
export function findMarkdownPages(
  rootDir: string,
  include: readonly string[],
): MarkdownPage[] {
  const pages: MarkdownPage[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(path);
        }
        continue;
      }
      if (!/\.mdx?$/.test(entry.name)) continue;
      const relativePath = relative(rootDir, path).split('\\').join('/');
      if (include.some((glob) => matchPathGlob(glob, relativePath) !== null)) {
        pages.push({ filePath: path, text: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(rootDir);
  return pages;
}

/**
 * Opt-in collector linking Markdown pages to the nodes they describe.
 *
 * ```ts
 * analyzeDependencyGraph({ collectors: [createMarkdownDocsCollector({ include: ['docs/**\/*.md'] })] });
 * ```
 */
export function createMarkdownDocsCollector(options: {
  readonly include: readonly string[];
}): DependencyGraphCollector {
  return {
    name: 'markdown-docs',
    collect: ({ rootDir, graph }) =>
      markdownDocsContribution(graph, findMarkdownPages(rootDir, options.include)),
  };
}
