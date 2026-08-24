import { existsSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';

export type CraftModuleImport = Readonly<{
  /** Absolute path of the importing file. */
  file: string;
  line: number;
  specifier: string;
}>;

export type CraftModuleGraph = Readonly<{
  /** Entry that could not be read, when the walk found nothing. */
  missingEntry: string | null;
  /** Absolute path of every file reachable from the entry. */
  files: readonly string[];
  /** Concatenated source of those files, comments removed. */
  source: string;
  imports: readonly CraftModuleImport[];
}>;

const EXTENSIONS = ['.ts', '.mts', '.tsx', '.js', '.mjs', '.jsx', '.cjs'];
const NODE_BUILTINS = new Set(builtinModules);

/**
 * Names every platform and every bundler already provides. Reporting them as
 * undeclared would make the diagnostic noisy enough to be ignored.
 */
const AMBIENT_ENVIRONMENT = new Set([
  'NODE_ENV',
  'PROD',
  'DEV',
  'MODE',
  'SSR',
  'BASE_URL',
]);

const IMPORT_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Walks the module graph reachable from an entry through relative imports.
 *
 * Only relative specifiers are followed: a package boundary is where the
 * application stops being responsible for the platform APIs used, and reading
 * `node_modules` would make the check unbounded and slow.
 */
export function readCraftModuleGraph(entry: string): CraftModuleGraph {
  const resolvedEntry = resolveModule(entry);
  if (!resolvedEntry) {
    return { missingEntry: entry, files: [], source: '', imports: [] };
  }

  const files: string[] = [];
  const imports: CraftModuleImport[] = [];
  const sources: string[] = [];
  const queue = [resolvedEntry];
  const seen = new Set<string>([resolvedEntry]);

  while (queue.length > 0) {
    const file = queue.shift() as string;
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const text = stripComments(raw);
    files.push(file);
    sources.push(text);

    for (const specifier of collectImports(text, file, imports)) {
      if (!specifier.startsWith('.')) continue;
      const target = resolveModule(resolve(dirname(file), specifier));
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  return {
    missingEntry: null,
    files,
    source: sources.join('\n'),
    imports,
  };
}

export function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true;
  return NODE_BUILTINS.has(specifier);
}

/**
 * Environment variables the sources read. Both shapes are collected: the Node
 * `process.env.NAME` and the Worker/Lambda `env.NAME` handed to the fetch
 * handler.
 */
export function collectEnvironmentReads(source: string): readonly string[] {
  const names = new Set<string>();
  const patterns = [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bprocess\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g,
    /\benv\.([A-Z][A-Z0-9_]*)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = match[1];
      if (name && !AMBIENT_ENVIRONMENT.has(name)) names.add(name);
    }
  }
  return [...names].sort();
}

function collectImports(
  text: string,
  file: string,
  imports: CraftModuleImport[],
): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      pushSpecifier(specifiers, specifier);
      imports.push({
        file,
        line: lineAt(text, match.index ?? 0),
        specifier,
      });
    }
  }
  return specifiers;
}

function pushSpecifier(specifiers: string[], specifier: string): void {
  if (!specifiers.includes(specifier)) specifiers.push(specifier);
}

function resolveModule(path: string): string | null {
  if (existsSync(path) && statSync(path).isFile()) return path;

  // TypeScript ESM imports name the emitted `.js`, so the source sitting next
  // to it has to be tried before giving up.
  const withoutJs = path.replace(/\.(m?)js$/, '');
  const candidates =
    withoutJs === path
      ? []
      : [`${withoutJs}.ts`, `${withoutJs}.mts`, `${withoutJs}.tsx`];

  for (const extension of EXTENSIONS) {
    candidates.push(`${path}${extension}`);
  }
  for (const extension of EXTENSIONS) {
    candidates.push(resolve(path, `index${extension}`));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (text[position] === '\n') line += 1;
  }
  return line;
}

/**
 * Removes comments while preserving line breaks, so reported line numbers stay
 * the ones of the original file.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (_all, prefix: string) => prefix);
}
