import { prepareCandidate, replaceOnce, lab } from './prepare.mjs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const id = 'local-lists';
const root = join(lab, 'roots', id);
try {
  await access(join(root, 'candidate.json'));
} catch {
  await prepareCandidate(id, [
    {
      file: 'libs/compiler/src/compiler.ts',
      change: (source) => {
        source = replaceOnce(
          source,
          'new Map<string, ts.VariableDeclaration>()',
          'new Map<ts.Symbol, ts.VariableDeclaration>()',
        );
        source = replaceOnce(
          source,
          'compiledDefinitions.set(n.parent.name.text, n.parent);',
          'compiledDefinitions.set(checker.getSymbolAtLocation(n.parent.name)!, n.parent);',
        );
        source = replaceOnce(
          source,
          'compiledDefinitions.get(body.expression.text)',
          'compiledDefinitions.get(checker.getSymbolAtLocation(body.expression)!)',
        );
        source = replaceOnce(
          source,
          `          // Restrict to module constants, and refuse any lexical shadow of the
          // component or forNode import along the callback's scope chain.`,
          `          // Read metadata only after the constant's initialization. A hoisted
          // function can be called earlier than its source position suggests.
          const statement = declaration.parent.parent;
          function initializedBeforeCall(): boolean {
            if (!ts.isVariableStatement(statement)) return false;
            const container = statement.parent;
            if (!ts.isSourceFile(container) && !ts.isBlock(container)) return false;
            let cursor: ts.Node = n;
            while (cursor.parent && cursor.parent !== container) {
              if (ts.isFunctionDeclaration(cursor)) return false;
              cursor = cursor.parent;
            }
            return !ts.isFunctionDeclaration(cursor) && cursor.parent === container && cursor.getStart(ast) >= statement.end;
          }`,
        );
        source = replaceOnce(
          source,
          `            ts.isVariableStatement(declaration.parent.parent) &&
            ts.isSourceFile(declaration.parent.parent.parent) &&`,
          `            initializedBeforeCall() &&`,
        );
        return source;
      },
    },
  ]);
}
await writeFile(
  join(root, 'libs/compiler/src/performance-local.spec.ts'),
  await readFile(new URL('./local-lists.contracts.ts', import.meta.url)),
);
console.log(root);
