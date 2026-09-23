/**
 * The architecture rules that make `@craft-ts/style` the only way to style a
 * component.
 *
 * ESLint sees one file; these see the application. They answer the questions
 * a file cannot: does this class reach a sheet the build emits, is every
 * obligation discharged somewhere in the tree, does a variable read anywhere
 * exist, is a stylesheet loaded behind the design system's back.
 *
 * Every finding names a **target** — a component, a file, an obligation, a
 * variable — because a deliberate bypass is waived per target, with a reason,
 * and attested. A rule that could only say "something is wrong somewhere"
 * could only be waived wholesale.
 */
import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { DependencyGraph } from './dependency-graph.ts';
import { danglingVars, undischargedObligations } from './style-architecture.ts';

export interface ArchitectureFinding {
  /**
   * What a waiver names: a component label, `file:<path>`,
   * `obligation:<id>`, `css-var:<name>`, or `graph:style-dump`.
   */
  readonly target: string;
  readonly message: string;
}

const EMITTED_SHEET = 'virtual:craft-style.css';
const CSS_IMPORT = /\.css(\?.*)?$/;
const META_CSS_FIELDS = new Set(['styles', 'stylesUrl', 'contentStyles']);
const COMPONENT_FACTORIES = new Set(['craftComponent', 'craftDirective']);

const location = (graph: DependencyGraph, filePath?: string, line?: number) =>
  filePath
    ? `${relative(graph.rootDir, filePath)}${line ? `:${line}` : ''}: `
    : '';

const hasStyleDump = (graph: DependencyGraph): boolean =>
  graph.nodes.some((node) => node.kind === 'style-class');

// ─── source scan ────────────────────────────────────────────────────────────

interface SourceFacts {
  /** craftComponent / craftDirective carrying CSS text on its meta. */
  readonly metaCss: readonly {
    readonly component: string;
    readonly field: string;
    readonly filePath: string;
    readonly line: number;
  }[];
  /** `.css` imports other than the emitted sheet. */
  readonly cssImports: readonly {
    readonly source: string;
    readonly filePath: string;
    readonly line: number;
    /** Components declared in the same file; empty for an entry file. */
    readonly components: readonly string[];
  }[];
}

const sourceCache = new WeakMap<DependencyGraph, SourceFacts | undefined>();

/**
 * Reads the program's files once per graph. A graph built from a tsconfig
 * that no longer exists on disk — a literal graph in a spec — has no source
 * to read: the source half of the rules is then skipped, and only the graph
 * half runs.
 */
function sourceFacts(graph: DependencyGraph): SourceFacts | undefined {
  if (sourceCache.has(graph)) return sourceCache.get(graph);
  let facts: SourceFacts | undefined;
  if (existsSync(graph.tsConfigFilePath)) {
    const config = ts.readConfigFile(graph.tsConfigFilePath, ts.sys.readFile);
    const files = config.error
      ? []
      : ts.parseJsonConfigFileContent(
          config.config,
          ts.sys,
          dirname(graph.tsConfigFilePath),
        ).fileNames;
    const metaCss: SourceFacts['metaCss'][number][] = [];
    const cssImports: SourceFacts['cssImports'][number][] = [];
    for (const filePath of files) {
      if (filePath.endsWith('.d.ts') || /\.(spec|test)\.ts$/.test(filePath)) {
        continue;
      }
      const text = readFileSync(filePath, 'utf8');
      if (!text.includes('.css') && !/styles|contentStyles/.test(text)) {
        continue;
      }
      const source = ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const lineOf = (node: ts.Node) =>
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const components: string[] = [];
      const imports: { source: string; line: number }[] = [];
      const visit = (node: ts.Node): void => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          imports.push({
            source: node.moduleSpecifier.text,
            line: lineOf(node),
          });
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          imports.push({ source: node.arguments[0].text, line: lineOf(node) });
        }
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          COMPONENT_FACTORIES.has(node.expression.text)
        ) {
          const nameArgument = node.arguments[0];
          const name =
            nameArgument && ts.isStringLiteralLike(nameArgument)
              ? nameArgument.text
              : '(anonymous)';
          components.push(name);
          for (const argument of node.arguments) {
            if (!ts.isObjectLiteralExpression(argument)) continue;
            for (const property of argument.properties) {
              const key =
                property.name &&
                (ts.isIdentifier(property.name) ||
                  ts.isStringLiteral(property.name))
                  ? property.name.text
                  : undefined;
              if (key && META_CSS_FIELDS.has(key)) {
                metaCss.push({
                  component: name,
                  field: key,
                  filePath,
                  line: lineOf(property),
                });
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      for (const entry of imports) {
        if (entry.source === EMITTED_SHEET || !CSS_IMPORT.test(entry.source)) {
          continue;
        }
        cssImports.push({ ...entry, filePath, components });
      }
    }
    facts = { metaCss, cssImports };
  }
  sourceCache.set(graph, facts);
  return facts;
}

// ─── rules ──────────────────────────────────────────────────────────────────

/**
 * Every element's class reaches a sheet the build emits; no component carries
 * CSS text or imports a stylesheet.
 *
 * A component of pure composition — no class at all — is **not** at fault:
 * `component-without-style-class` is an extraction signal for the contrast
 * report, not a style debt.
 */
export function styleOnlyDesignSystemFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  const findings: ArchitectureFinding[] = [];
  const styleClassIds = new Set(
    graph.nodes
      .filter((node) => node.kind === 'style-class')
      .map((node) => node.id),
  );
  const dumpMerged = styleClassIds.size > 0;
  let resolvedClasses = 0;

  for (const node of graph.nodes) {
    if (node.kind !== 'styled-element') continue;
    const details = node.details ?? {};
    const component = String(details['component'] ?? node.label);
    const where = location(graph, node.filePath, node.line);
    const unresolved = details['unresolvedClass'];
    if (typeof unresolved === 'string' && !details['classTypedAsSheetClass']) {
      findings.push({
        target: component,
        message: `${where}${component} › ${node.label}: ${unresolved} Bind a class from a *.style.ts sheet, and make the variation an axis.`,
      });
    }
    const outside = details['sheetOutsideStyleModule'];
    if (Array.isArray(outside) && outside.length > 0) {
      findings.push({
        target: component,
        message: `${where}${component} › ${node.label}: the sheet class ${outside.map((key) => `'${key}'`).join(', ')} is declared outside a *.style.ts. The build only evaluates style modules, so the element gets a class with no CSS behind it.`,
      });
    }
    const keys = details['classKeys'];
    if (Array.isArray(keys)) {
      resolvedClasses += keys.length;
      if (dumpMerged) {
        for (const key of keys) {
          if (!styleClassIds.has(`style-class:${key}`)) {
            findings.push({
              target: component,
              message: `${where}${component} › ${node.label}: the sheet class '${key}' is not in the style dump. Regenerate the dump, or check that its sheet lives in a *.style.ts the build walks.`,
            });
          }
        }
      }
    }
  }

  if (!dumpMerged && resolvedClasses > 0) {
    findings.push({
      target: 'graph:style-dump',
      message: `The graph binds ${resolvedClasses} sheet classes but carries no style dump, so what they emit cannot be checked. Merge it: mergeStyleDump(graph, await loadStyleDump(appDir)) — or pass --style-dump to craft-architecture-check.`,
    });
  }

  const facts = sourceFacts(graph);
  for (const entry of facts?.metaCss ?? []) {
    findings.push({
      target: entry.component,
      message: `${location(graph, entry.filePath, entry.line)}${entry.component}: meta.${entry.field} carries CSS text outside the design system. Move it into a *.style.ts sheet.`,
    });
  }
  for (const entry of facts?.cssImports ?? []) {
    if (entry.components.length === 0) continue;
    for (const component of entry.components) {
      findings.push({
        target: component,
        message: `${location(graph, entry.filePath, entry.line)}${component}: imports '${entry.source}', a stylesheet outside the design system.`,
      });
    }
  }
  return findings;
}

/** Every `requires(...)` is answered by a `provides(...)` somewhere. */
export function styleObligationsDischargedFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  if (!hasStyleDump(graph)) return [];
  return undischargedObligations(graph).map((id) => ({
    target: `obligation:${id}`,
    message: `The obligation '${id}' is required by a sheet class and provided by none. Add provides(${id}) on the layout component that owns the area.`,
  }));
}

/**
 * No variable is read without being declared, and none is declared for
 * nothing. A read from a global style (`craftGlobalStyles`, keyframes) counts.
 */
export function noDanglingCssVarsFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  if (!hasStyleDump(graph)) return [];
  const readGlobally = new Set(
    graph.nodes
      .filter(
        (node) => node.kind === 'css-var' && node.details?.['readByGlobal'],
      )
      .map((node) => node.label),
  );
  const { unread, undeclared } = danglingVars(graph);
  return [
    ...undeclared.map((name) => ({
      target: `css-var:${name}`,
      message: `'${name}' is read by a sheet and declared by none. Declare it with cssVars(...) — a read of an undeclared variable resolves to nothing, silently.`,
    })),
    ...unread
      .filter((name) => !readGlobally.has(name))
      .map((name) => ({
        target: `css-var:${name}`,
        message: `'${name}' is declared and read by nothing. Remove it, or read it: a reader takes a declared variable for a real variation.`,
      })),
  ];
}

const STYLESHEET_LINK = /<link\b[^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*>/gi;

/**
 * No stylesheet reaches the document except the one the build emits: no
 * `.css` import from an entry file, no `<link rel="stylesheet">` in
 * `index.html`. Font links are injected by the build, not written there.
 */
export function noGlobalStylesheetFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  const findings: ArchitectureFinding[] = [];
  const facts = sourceFacts(graph);
  for (const entry of facts?.cssImports ?? []) {
    if (entry.components.length > 0) continue;
    const file = relative(graph.rootDir, entry.filePath);
    findings.push({
      target: `file:${file}`,
      message: `${file}:${entry.line}: imports '${entry.source}', a global stylesheet. The only stylesheet an app loads is '${EMITTED_SHEET}'; document-level rules belong in craftGlobalStyles, fonts in defineFont.`,
    });
  }
  const projectDir = dirname(graph.tsConfigFilePath);
  for (const candidate of [
    join(projectDir, 'index.html'),
    join(projectDir, 'src', 'index.html'),
  ]) {
    if (!existsSync(candidate)) continue;
    const html = readFileSync(candidate, 'utf8');
    for (const link of html.match(STYLESHEET_LINK) ?? []) {
      const file = relative(graph.rootDir, candidate);
      findings.push({
        target: `file:${file}`,
        message: `${file}: ${link.replace(/\s+/g, ' ')} loads a stylesheet outside the design system.`,
      });
    }
  }
  return findings;
}

export const STYLE_ARCHITECTURE_RULES = [
  ['style-only-design-system', styleOnlyDesignSystemFindings],
  ['style-obligations-discharged', styleObligationsDischargedFindings],
  ['no-dangling-css-vars', noDanglingCssVarsFindings],
  ['no-global-stylesheet', noGlobalStylesheetFindings],
] as const;
