import ts from 'typescript';
import type { ImportedComponentProof } from './compiler.js';

type Record = { source: string; exports: readonly string[] };
type Resolve = (
  specifier: string,
  importer: string,
) => Promise<string | undefined>;
type Load = (id: string) => Promise<void>;
const framework = new Set([
  '@craft-ts/component',
  '@craft-ts/core',
  '@craft-ts/style',
  '@craft-ts/component/compiler-runtime',
]);

/** Build-only proof graph, seeded with the source actually seen by this plugin. */
export class ImportedComponentGraph {
  private readonly modules = new Map<string, Record>();
  clear() {
    this.modules.clear();
  }
  record(id: string, source: string, exports: readonly string[] = []) {
    this.modules.set(id, { source, exports });
  }
  async prove(
    id: string,
    resolve: Resolve,
    load: Load,
    watch: (id: string) => void = () => undefined,
  ): Promise<ImportedComponentProof[]> {
    const root = this.modules.get(id);
    if (!root) return [];
    const parsed = new Map<
      string,
      { imports: string[]; bindings: ImportedComponentProof[]; unsafe: boolean }
    >();
    const metadata = async (moduleId: string) => {
      if (!this.modules.has(moduleId)) await load(moduleId);
      return this.modules.get(moduleId);
    };
    const parse = (moduleId: string, record: Record) => {
      let result = parsed.get(moduleId);
      if (result) return result;
      const ast = ts.createSourceFile(
        moduleId,
        record.source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const imports: string[] = [],
        bindings: ImportedComponentProof[] = [];
      const diagnostics = (
        ast as unknown as { parseDiagnostics?: readonly unknown[] }
      ).parseDiagnostics;
      let unsafe = !diagnostics || diagnostics.length > 0;
      for (const statement of ast.statements) {
        if (
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          if (statement.attributes) unsafe = true;
          const clause = statement.importClause;
          if (clause?.isTypeOnly) continue;
          const named = clause?.namedBindings;
          // Keep empty imports and inline type-only specifiers in the graph:
          // verbatimModuleSyntax may preserve their runtime side effects.
          const module = statement.moduleSpecifier.text;
          imports.push(module);
          if (named && ts.isNamedImports(named))
            for (const item of named.elements)
              if (!item.isTypeOnly)
                bindings.push({
                  module,
                  local: item.name.text,
                  exported: (item.propertyName ?? item.name).text,
                });
        } else if (
          ts.isExportDeclaration(statement) &&
          !statement.isTypeOnly &&
          statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          if (statement.attributes) unsafe = true;
          imports.push(statement.moduleSpecifier.text);
        }
      }
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === 'require'))
        )
          unsafe = true;
        ts.forEachChild(node, visit);
      };
      visit(ast);
      result = { imports, bindings, unsafe };
      parsed.set(moduleId, result);
      return result;
    };
    const resolutions = new Map<string, Promise<string | undefined>>();
    const resolveModule = (specifier: string, importer: string) => {
      const key = importer + '\0' + specifier;
      let pending = resolutions.get(key);
      if (!pending) {
        pending = resolve(specifier, importer);
        resolutions.set(key, pending);
      }
      return pending;
    };
    const walk = async (
      moduleId: string,
      active: Set<string>,
      visited: Set<string>,
    ): Promise<boolean> => {
      if (active.has(moduleId)) return false;
      if (visited.has(moduleId)) return true;
      if (
        moduleId.startsWith('\0') ||
        moduleId.includes('?') ||
        moduleId.includes('/node_modules/') ||
        !/\.[cm]?ts$/.test(moduleId)
      )
        return false;
      const record = await metadata(moduleId);
      if (!record) return false;
      watch(moduleId);
      const info = parse(moduleId, record);
      if (info.unsafe) return false;
      active.add(moduleId);
      for (const specifier of info.imports) {
        if (framework.has(specifier)) continue;
        const next = await resolveModule(specifier, moduleId);
        if (!next || !(await walk(next, active, visited))) {
          active.delete(moduleId);
          return false;
        }
      }
      active.delete(moduleId);
      visited.add(moduleId);
      return true;
    };
    // Acyclic static application imports mean dependencies have initialized
    // before this module's eager metadata argument is evaluated.
    if (!(await walk(id, new Set(), new Set()))) return [];
    const proofs: ImportedComponentProof[] = [];
    for (const binding of parse(id, root).bindings) {
      if (framework.has(binding.module)) continue;
      const next = await resolveModule(binding.module, id);
      const target = next && this.modules.get(next);
      if (target && target.exports.includes(binding.exported))
        proofs.push(binding);
    }
    return proofs;
  }
}
