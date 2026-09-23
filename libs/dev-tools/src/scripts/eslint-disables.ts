import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';

export type EslintDisableDirective =
  | 'disable'
  | 'disable-line'
  | 'disable-next-line';

export interface EslintDisableInput {
  readonly subject: string;
  readonly filePath: string;
  readonly line: number;
  readonly highlightLine: number;
  readonly directive: EslintDisableDirective;
  readonly rule: string;
  readonly reason?: string;
  readonly source: string;
}

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.nx',
  '.angular',
  '.agents',
  '.claude',
  '.codex',
  '.cursor',
  '.gemini',
  'coverage',
  'dist',
  'node_modules',
  'test-results',
]);

const posix = (value: string): string => value.split('\\').join('/');

const filesUnder = (rootDir: string, directory: string): readonly string[] => {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      result.push(...filesUnder(rootDir, resolve(directory, entry.name)));
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.'))))
      continue;
    result.push(posix(relative(rootDir, resolve(directory, entry.name))));
  }
  return result.sort();
};

export const sourceFilesUnder = (rootDir: string): readonly string[] =>
  filesUnder(resolve(rootDir), resolve(rootDir));

const ruleList = (value: string): readonly string[] => {
  const rules = value
    .split(',')
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);
  return rules.length > 0 ? rules : ['*'];
};

/**
 * Finds inline ESLint disable directives without executing the project's
 * config. The directive is the evidence: a rule may be disabled even when
 * the current config would not report a violation at that location.
 *
 * Only real **comments** count — read with the TypeScript scanner, so the
 * text of a rule's spec (`'// eslint-disable-next-line x'` in a string) is not
 * mistaken for a directive.
 *
 * The subject is `eslint-disable:<file>:<rule>:<ordinal>`: the n-th directive
 * for that rule in that file. No line number, so an edit above a directive
 * does not turn it into a new subject.
 *
 * The shape of `EslintDisableInput` mirrors the one in `@craft-ts/attest`.
 * It is not imported: dev-tools sits at the root of the workspace graph and
 * depends on no library. The CLI hands one to the other, which is where the
 * compiler checks that they still agree.
 */
export function scanEslintDisables(options: {
  readonly rootDir: string;
}): readonly EslintDisableInput[] {
  const rootDir = resolve(options.rootDir);
  const result: EslintDisableInput[] = [];
  for (const filePath of sourceFilesUnder(rootDir)) {
    const source = readFileSync(resolve(rootDir, filePath), 'utf8');
    if (!source.includes('eslint-disable')) continue;
    const ordinals = new Map<string, number>();
    for (const comment of commentsOf(source)) {
      const marker = /^\s*eslint-disable(?:(-next-line)|(-line))?(?=\s|$)/i.exec(
        comment.text,
      );
      if (!marker) continue;
      const directive: EslintDisableDirective = marker[1]
        ? 'disable-next-line'
        : marker[2]
          ? 'disable-line'
          : 'disable';
      const [rulesText, ...reasonParts] = comment.text
        .slice(marker[0].length)
        .split(/\s--(?:\s|$)/);
      const reasonText = reasonParts.join(' -- ').trim();
      const line = comment.line;
      const highlightLine =
        directive === 'disable-next-line' ? line + 1 : line;
      for (const rule of ruleList(rulesText ?? '')) {
        const ordinal = (ordinals.get(rule) ?? 0) + 1;
        ordinals.set(rule, ordinal);
        result.push({
          subject: `eslint-disable:${filePath}:${rule}:${ordinal}`,
          filePath,
          line,
          highlightLine,
          directive,
          rule,
          ...(reasonText ? { reason: reasonText } : {}),
          source,
        });
      }
    }
  }
  return result.sort((left, right) => left.subject.localeCompare(right.subject));
}

/**
 * Every comment of a file, its text without the delimiters, and its line.
 *
 * Read from the **parsed** file, not from a bare token scan: a bare scan loses
 * its place after the first `${` of a template literal, and then takes the
 * rest of the string for code — `// eslint-disable…` written inside a
 * template in a spec would come out as a directive. Comments are collected
 * around every node and token, deduplicated by position.
 */
function commentsOf(
  source: string,
): readonly { readonly text: string; readonly line: number }[] {
  const file = ts.createSourceFile(
    'scan.tsx',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX,
  );
  const seen = new Map<number, { text: string; line: number }>();
  const collect = (ranges: readonly ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      const raw = source.slice(range.pos, range.end);
      const text =
        range.kind === ts.SyntaxKind.SingleLineCommentTrivia
          ? raw.slice(2)
          : raw
              .slice(2, -2)
              .replace(/^\s*\*\s?/gm, ' ')
              .trim();
      seen.set(range.pos, {
        text,
        line: file.getLineAndCharacterOfPosition(range.pos).line + 1,
      });
    }
  };
  const visit = (node: ts.Node): void => {
    collect(ts.getLeadingCommentRanges(source, node.pos));
    collect(ts.getTrailingCommentRanges(source, node.end));
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return [...seen.values()].sort((left, right) => left.line - right.line);
}
