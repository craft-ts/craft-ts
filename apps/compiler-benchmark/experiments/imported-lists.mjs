import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { prepareCandidate, replaceOnce, lab, workspace } from './prepare.mjs';
const root = join(lab, 'roots/imported-lists');
const current = execFileSync(
  'git',
  ['show', 'cd3d220e9:libs/compiler/src/compiler.ts'],
  { cwd: workspace, encoding: 'utf8' },
);
const compiler = (source) => {
  source = replaceOnce(
    source,
    'export interface CompilationResult {',
    `export interface ImportedComponentProof {module:string;local:string;exported:string;}
export interface CompilationResult {\n  /** @internal Build graph facts; not runtime exports. */\n  compiledExports?: readonly string[];\n  hasForNode?:boolean;`,
  );
  source = replaceOnce(
    source,
    '    lower?: boolean;',
    '    lower?: boolean;\n    /** @internal Facts proved by the bundler for this module. */\n    importedComponents?:readonly ImportedComponentProof[];',
  );
  source = replaceOnce(
    source,
    '  let optimizedLists = 0;',
    '  let optimizedLists = 0;\n  const compiledExports:string[]=[];',
  );
  source = replaceOnce(
    source,
    '  const sameBinding =',
    `  const importedDefinitions=new Map<ts.Symbol,ts.ImportSpecifier>();
  if(options.importedComponents?.length)for(const statement of ast.statements){
    if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)||statement.importClause?.isTypeOnly)continue;
    const named=statement.importClause?.namedBindings;
    if(!named||!ts.isNamedImports(named))continue;
    const moduleName=statement.moduleSpecifier.text;
    for(const item of named.elements){
      if(item.isTypeOnly)continue;
      if(!options.importedComponents?.some(proof=>proof.module===moduleName&&proof.local===item.name.text&&proof.exported===(item.propertyName??item.name).text))continue;
      const symbol=checker.getSymbolAtLocation(item.name);if(symbol)importedDefinitions.set(symbol,item);
    }
  }
  const sameBinding =`,
  );
  source = replaceOnce(
    source,
    '          if (symbol) compiledDefinitions.set(symbol, n.parent);',
    `          if (symbol) compiledDefinitions.set(symbol, n.parent);
          const statement=n.parent.parent.parent;
          if(ts.isVariableStatement(statement)&&ts.isSourceFile(statement.parent)&&statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))compiledExports.push(n.parent.name.text);`,
  );
  source = replaceOnce(
    source,
    '        let declaration: ts.VariableDeclaration | undefined;',
    `        let declaration: ts.VariableDeclaration | undefined;
        let imported:ts.ImportSpecifier|undefined;`,
  );
  source = replaceOnce(
    source,
    '          if (symbol) declaration = compiledDefinitions.get(symbol);',
    '          if (symbol) {declaration = compiledDefinitions.get(symbol);imported=importedDefinitions.get(symbol);}',
  );
  source = replaceOnce(
    source,
    '        if (\n          declaration &&\n          ts.isCallExpression(body)',
    `        const bindingName=declaration?.name??imported?.name;
        if (
          bindingName && ts.isIdentifier(bindingName) &&
          ts.isCallExpression(body)`,
  );
  source = replaceOnce(
    source,
    '          const statement = declaration.parent.parent;',
    '          const statement = declaration?.parent.parent;',
  );
  source = replaceOnce(
    source,
    '            if (!ts.isVariableStatement(statement)) return false;',
    '            if(imported)return true;\n            if (!statement||!ts.isVariableStatement(statement)) return false;',
  );
  source = replaceOnce(
    source,
    '          const name = (declaration.name as ts.Identifier).text;',
    '          const name = bindingName.text;',
  );
  source = replaceOnce(
    source,
    '            sameBinding(body.expression, declaration.name) &&',
    '            sameBinding(body.expression, bindingName) &&',
  );
  source = replaceOnce(
    source,
    "  if (components.some((c) => c.status === 'compiled')) {",
    "  if (optimizedLists||components.some((c) => c.status === 'compiled')) {",
  );
  source = replaceOnce(
    source,
    '  return {\n    code: output.toString(),',
    '  return {\n    compiledExports,\n    hasForNode:!!forImport,\n    code: output.toString(),',
  );
  return source;
};
const vite = (source) => {
  source = replaceOnce(
    source,
    "import type { Plugin } from 'vite';",
    "import type { Plugin } from 'vite';\nimport {ImportedComponentGraph} from './import-graph.js';",
  );
  source = replaceOnce(
    source,
    '  lists?: boolean;',
    '  lists?: boolean;\n  /** Opt in to build-graph proof of direct named component imports (default false). */\n  imports?:boolean;',
  );
  source = replaceOnce(
    source,
    'export function craftCompiler(options: CraftCompilerOptions = {}): Plugin {\n  return {',
    'export function craftCompiler(options: CraftCompilerOptions = {}): Plugin {\n  const graph=options.imports?new ImportedComponentGraph():undefined;\n  return {\n    buildStart(){graph?.clear();},',
  );
  source = replaceOnce(
    source,
    "        !/\\.[cm]?ts$/.test(id) ||\n        !source.includes('@craft-ts/component')",
    '        !/\\.[cm]?ts$/.test(id)',
  );
  source = replaceOnce(
    source,
    '      const result = compileModule(source, id, options);',
    `      graph?.record(id,source);
      if(!source.includes('@craft-ts/component'))return null;
      const result = compileModule(source, id, options);
      graph?.record(id,source,result.compiledExports);
      const finish=(result:ReturnType<typeof compileModule>)=>{`,
  );
  source = replaceOnce(
    source,
    "      return result.components.some((c) => c.status === 'compiled')",
    "      return (result.optimizedLists||result.components.some((c) => c.status === 'compiled'))",
  );
  source = replaceOnce(
    source,
    '        : null;\n    },',
    `        : null;
      };
      if(graph&&options.lists!==false&&result.hasForNode&&this?.resolve&&this?.load){
        return graph.prove(id,async(specifier,importer)=>{
          const resolved=await this.resolve(specifier,importer,{skipSelf:true});
          return resolved&&!resolved.external?resolved.id:undefined;
        },async(moduleId)=>{await this.load({id:moduleId});},moduleId=>this.addWatchFile?.(moduleId)).catch(()=>[]).then(proofs=>finish(proofs.length?compileModule(source,id,{...options,importedComponents:proofs}):result));
      }
      return finish(result);
    },`,
  );
  return source;
};
try {
  await access(join(root, 'candidate.json'));
} catch {
  await prepareCandidate('imported-lists', [
    { file: 'libs/compiler/src/compiler.ts', change: () => compiler(current) },
    { file: 'libs/compiler/src/vite.ts', change: vite },
    {
      file: 'libs/component/src/lib/render/compiled-template.ts',
      change: (source) =>
        replaceOnce(
          source,
          '  itemComponents.set(factory, component);',
          '  if(templates.has(component))itemComponents.set(factory, component);',
        ),
    },
  ]);
}
const graph = await readFile(
  new URL('./import-graph.fixture.ts', import.meta.url),
  'utf8',
);
await writeFile(join(root, 'libs/compiler/src/import-graph.ts'), graph);
await writeFile(
  join(root, 'libs/compiler/src/imported-lists.spec.ts'),
  await readFile(new URL('./imported-lists.contracts.ts', import.meta.url)),
);
await writeFile(
  join(root, 'libs/compiler/src/local-lists.spec.ts'),
  await readFile(join(workspace, 'libs/compiler/src/local-lists.spec.ts')),
);
const path = join(root, 'candidate.json'),
  candidate = JSON.parse(await readFile(path, 'utf8'));
candidate.extensions = [
  {
    file: 'libs/compiler/src/import-graph.ts',
    sha256: createHash('sha256').update(graph).digest('hex'),
  },
];
await writeFile(path, JSON.stringify(candidate, null, 2) + '\n');
console.log(root);
