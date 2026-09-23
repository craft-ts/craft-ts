import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

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
 */
export function scanEslintDisables(options: {
  readonly rootDir: string;
}): readonly EslintDisableInput[] {
  const rootDir = resolve(options.rootDir);
  const result: EslintDisableInput[] = [];
  for (const filePath of sourceFilesUnder(rootDir)) {
    const source = readFileSync(resolve(rootDir, filePath), 'utf8');
    const lines = source.split(/\r?\n/);
    lines.forEach((lineText, index) => {
      const marker = /(?:^|\/\/|\/\*|\*)\s*eslint-disable(?:(-next-line)|(-line))?/i.exec(
        lineText,
      );
      if (!marker || marker.index === undefined) return;
      const directive = marker[1]
        ? 'disable-next-line'
        : marker[2]
          ? 'disable-line'
          : 'disable';
      const remainder = lineText
        .slice(marker.index + marker[0].length)
        .replace(/\*\/.*$/, '')
        .trim();
      const [rulesText, reasonText] = remainder.split(/\s+--\s*/, 2);
      const line = index + 1;
      const highlightLine =
        directive === 'disable-next-line' ? line + 1 : line;
      for (const rule of ruleList(rulesText ?? '')) {
        result.push({
          subject: `eslint-disable:${filePath}:${line}:${directive}:${rule}`,
          filePath,
          line,
          highlightLine,
          directive,
          rule,
          ...(reasonText?.trim() ? { reason: reasonText.trim() } : {}),
          source,
        });
      }
    });
  }
  return result.sort((left, right) => left.subject.localeCompare(right.subject));
}
