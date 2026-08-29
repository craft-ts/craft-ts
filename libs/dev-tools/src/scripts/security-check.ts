import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export type SecuritySeverity = 'error' | 'warning';

export type SecurityDiagnostic = Readonly<{
  code: string;
  file: string;
  line: number;
  message: string;
  severity: SecuritySeverity;
}>;

export type SecurityCheckOptions = Readonly<{
  rootDir?: string;
  strict?: boolean;
}>;

export type SecurityCheckResult = Readonly<{
  passed: boolean;
  diagnostics: readonly SecurityDiagnostic[];
}>;

/**
 * Fichier `craft-security.json` optionnel à la racine du projet vérifié.
 * Sans échappatoire, un contrôle bruyant finit désactivé en entier : mieux
 * vaut une exclusion nommée, visible en revue.
 */
export type SecurityCheckConfig = Readonly<{
  /** Chemins (fragments) exclus de l'analyse. */
  exclude?: readonly string[];
  /** Codes ramenés au niveau avertissement, avec une justification. */
  allow?: Readonly<Record<string, string>>;
}>;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
// `.references/` holds the CraftTS/EffectTS sources `npm run update:references`
// clones as read-only context for coding agents. It is third-party code, it is
// git-ignored, and every generated starter carries it — scanning it reports
// findings nobody in the project can act on.
const IGNORED = new Set(['node_modules', '.git', 'dist', '.nx', '.angular', '.vitepress', 'coverage', 'test-results', 'tmp', 'temp', '.references']);
const CONFIG_FILE = 'craft-security.json';
/** Commentaire d'exemption ligne à ligne : `// craft-security-ignore <code>`. */
const IGNORE_COMMENT = /craft-security-ignore(?:\s+([A-Z_]+))?/;

export function runSecurityCheck(
  options: SecurityCheckOptions = {},
): SecurityCheckResult {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const config = readConfig(rootDir);
  const files = collectFiles(rootDir, config);
  const diagnostics: SecurityDiagnostic[] = [];
  let hasPolicy = false;

  for (const file of files) {
    // Les commentaires décrivent souvent le risque qu'ils corrigent : les
    // analyser produirait un bruit qui ferait désactiver l'outil.
    const raw = readFileSync(file, 'utf8');
    const text = stripComments(raw);
    hasPolicy ||= /(?:provideCraftSecurityPolicy|CRAFT_SECURITY_POLICY|securityPolicy)/.test(text);
    checkPattern(diagnostics, rootDir, file, text, /\b(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"][^'"]*(?:token|jwt|password|auth|session)/gi, 'CRAFT_SECURITY_AUTH_STORAGE', 'Authentication material must not be stored in browser storage.', 'error', raw);
    checkPattern(diagnostics, rootDir, file, text, /\.(?:innerHTML|outerHTML|srcdoc)\s*=/g, 'CRAFT_SECURITY_RAW_HTML', 'Raw HTML assignment requires sanitizedHtml or an audited exception.', 'error', raw);
    checkPattern(diagnostics, rootDir, file, text, /\b(?:eval\s*\(|new\s+Function\s*\(|document\.write(?:ln)?\s*\()/g, 'CRAFT_SECURITY_DYNAMIC_CODE', 'Dynamic code evaluation and document.write are forbidden.', 'error', raw);
    checkPattern(diagnostics, rootDir, file, text, /\b(?:x-forwarded-for|x-forwarded-host|x-forwarded-proto)\b/gi, 'CRAFT_SECURITY_FORWARDED_HEADER', 'Forwarded headers must be validated at a trusted proxy boundary.', 'error', raw);
    checkPattern(diagnostics, rootDir, file, text, /\bunsafe-inline\b/g, 'CRAFT_SECURITY_CSP_UNSAFE_INLINE', "A production CSP must not rely on 'unsafe-inline'; use the request nonce.", 'error', raw);
    checkPattern(diagnostics, rootDir, file, text, /mode\s*:\s*['"]legacy['"]/g, 'CRAFT_SECURITY_TRANSFER_LEGACY', 'The legacy transfer mode ships every serializable primitive; move to an allowlist.', 'warning', raw);
    checkBlankTargets(diagnostics, rootDir, file, text, raw);
    checkTransferSnapshot(diagnostics, rootDir, file, text, raw);
    checkServerOptions(diagnostics, rootDir, file, text, raw);
    checkExpiredExceptions(diagnostics, rootDir, file, text, raw);
  }

  if (options.strict && !hasPolicy) {
    diagnostics.unshift({
      code: 'CRAFT_SECURITY_POLICY_MISSING',
      file: '.',
      line: 1,
      message: 'No Craft security policy was found in the checked source tree.',
      severity: 'error',
    });
  }

  const resolved = diagnostics.map((diagnostic) =>
    config.allow && diagnostic.code in config.allow
      ? { ...diagnostic, severity: 'warning' as const }
      : diagnostic,
  );
  const failing = resolved.filter((diagnostic) =>
    options.strict ? true : diagnostic.severity === 'error',
  );
  return {
    passed: failing.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics: resolved,
  };
}

/** Remplace les commentaires par des espaces, en gardant les positions. */
export function stripComments(text: string): string {
  let result = '';
  let index = 0;
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  while (index < text.length) {
    const character = text[index];
    const next = text[index + 1];
    if (state === 'code') {
      if (character === '/' && next === '/') {
        state = 'line';
        result += '  ';
        index += 2;
        continue;
      }
      if (character === '/' && next === '*') {
        state = 'block';
        result += '  ';
        index += 2;
        continue;
      }
      if (character === "'") state = 'single';
      else if (character === '"') state = 'double';
      else if (character === '`') state = 'template';
      result += character;
      index += 1;
      continue;
    }
    if (state === 'line') {
      if (character === '\n') {
        state = 'code';
        result += character;
      } else result += ' ';
      index += 1;
      continue;
    }
    if (state === 'block') {
      if (character === '*' && next === '/') {
        state = 'code';
        result += '  ';
        index += 2;
        continue;
      }
      result += character === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    // Chaînes : on les conserve telles quelles, en respectant l'échappement.
    if (character === '\\') {
      result += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (
      (state === 'single' && character === "'") ||
      (state === 'double' && character === '"') ||
      (state === 'template' && character === '`')
    ) {
      state = 'code';
    }
    result += character;
    index += 1;
  }
  return result;
}

function readConfig(rootDir: string): SecurityCheckConfig {
  const file = join(rootDir, CONFIG_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SecurityCheckConfig;
  } catch {
    return {};
  }
}

function collectFiles(directory: string, config: SecurityCheckConfig): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED.has(entry.name)) continue;
    const file = join(directory, entry.name);
    if ((config.exclude ?? []).some((fragment) => file.includes(fragment))) {
      continue;
    }
    if (entry.isDirectory()) result.push(...collectFiles(file, config));
    else if (
      SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.'))) &&
      !/(?:\.spec|\.test)\.[^.]+$/.test(entry.name) &&
      !/(?:dependency-graph|security-check)\.[^.]+$/.test(entry.name)
    ) result.push(file);
  }
  return result;
}

function checkPattern(
  diagnostics: SecurityDiagnostic[],
  rootDir: string,
  file: string,
  text: string,
  pattern: RegExp,
  code: string,
  message: string,
  severity: SecuritySeverity = 'error',
  raw: string = text,
): void {
  for (const match of text.matchAll(pattern)) {
    push(diagnostics, rootDir, file, raw, match.index ?? 0, code, message, severity);
  }
}

function push(
  diagnostics: SecurityDiagnostic[],
  rootDir: string,
  file: string,
  text: string,
  index: number,
  code: string,
  message: string,
  severity: SecuritySeverity = 'error',
): void {
  if (isIgnored(text, index, code)) return;
  diagnostics.push({
    code,
    file: relative(rootDir, file),
    line: lineAt(text, index),
    message,
    severity,
  });
}

/** Exemption ligne à ligne, sur la ligne concernée ou celle du dessus. */
function isIgnored(text: string, index: number, code: string): boolean {
  const lines = text.slice(0, index).split('\n');
  const current = lines[lines.length - 1] ?? '';
  const previous = lines[lines.length - 2] ?? '';
  const rest = text.slice(index).split('\n')[0] ?? '';
  for (const candidate of [current + rest, previous]) {
    const match = IGNORE_COMMENT.exec(candidate);
    if (match && (match[1] === undefined || match[1] === code)) return true;
  }
  return false;
}

/** Un `_blank` sans `rel` laisse la page ouverte piloter l'onglet d'origine. */
function checkBlankTargets(
  diagnostics: SecurityDiagnostic[],
  rootDir: string,
  file: string,
  text: string,
  raw: string,
): void {
  for (const match of text.matchAll(/\btarget\s*[:=]\s*['"]_blank['"]/g)) {
    const index = match.index ?? 0;
    const around = text.slice(Math.max(0, index - 200), index + 200);
    if (/\brel\s*[:=]\s*['"][^'"]*(?:noopener|noreferrer)/.test(around)) continue;
    push(diagnostics, rootDir, file, raw, index, 'CRAFT_SECURITY_BLANK_TARGET', 'A _blank target needs rel="noopener noreferrer".', 'warning');
  }
}

function checkTransferSnapshot(
  diagnostics: SecurityDiagnostic[],
  rootDir: string,
  file: string,
  text: string,
  raw: string,
): void {
  for (const match of text.matchAll(/\bcaptureCraftTransferSnapshot\s*\(/g)) {
    const call = text.slice(match.index ?? 0, (match.index ?? 0) + 400);
    if (!/policy/.test(call)) {
      push(diagnostics, rootDir, file, raw, match.index ?? 0, 'CRAFT_SECURITY_TRANSFER_IMPLICIT', 'SSR transfer requires an explicit policy.');
    }
  }
  for (const match of text.matchAll(/\brenderCraft\s*\(\s*\{/g)) {
    const call = text.slice(match.index ?? 0, (match.index ?? 0) + 600);
    if (!/securityPolicy/.test(call)) {
      push(diagnostics, rootDir, file, raw, match.index ?? 0, 'CRAFT_SECURITY_RENDER_POLICY_MISSING', 'renderCraft requires an explicit securityPolicy.', 'warning');
    }
  }
}

function checkServerOptions(
  diagnostics: SecurityDiagnostic[],
  rootDir: string,
  file: string,
  text: string,
  raw: string,
): void {
  for (const match of text.matchAll(/\bcreateServer\s*\(\s*\{/g)) {
    const start = match.index ?? 0;
    const end = text.indexOf('\n}', start);
    const fragment = text.slice(start, end === -1 ? start + 2_000 : end);
    // `createServer` de node:http ne prend pas de registre de fonctions.
    if (!/functions\s*:/.test(fragment)) continue;
    if (!/timeoutMs/.test(fragment) || !/maxBodyBytes/.test(fragment)) {
      push(diagnostics, rootDir, file, text, start, 'CRAFT_SECURITY_SERVER_LIMITS_MISSING', 'Server functions require timeoutMs and maxBodyBytes limits.');
    }
  }
}

function checkExpiredExceptions(
  diagnostics: SecurityDiagnostic[],
  rootDir: string,
  file: string,
  text: string,
  raw: string,
): void {
  const today = new Date().toISOString().slice(0, 10);
  for (const match of text.matchAll(/expires\s*:\s*['"](\d{4}-\d{2}-\d{2})['"]/g)) {
    if (match[1] < today) {
      push(diagnostics, rootDir, file, raw, match.index ?? 0, 'CRAFT_SECURITY_EXCEPTION_EXPIRED', `Security exception expired on ${match[1]}.`);
    }
  }
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}
