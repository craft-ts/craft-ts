import assert from 'node:assert/strict';
import { join } from 'node:path';
import ts from 'typescript';
import { workspace } from './prepare.mjs';
/** Replay the exact pre-transform saved with a measured runner, without launching it. */
export function attrsFixture(runner, main, environment) {
  const ast = ts.createSourceFile(
      'recorded-runner.mjs',
      runner,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    ),
    methods = [];
  const visit = (node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'transform')
      methods.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(methods.length, 1, 'One recorded fixture pre-transform');
  const transform = new Function(
    'join',
    'app',
    'process',
    'return function(source,id) ' + methods[0].body.getText(ast),
  )(join, join(workspace, 'apps/compiler-benchmark'), { env: environment });
  const source = transform(
    main,
    join(workspace, 'apps/compiler-benchmark/main.ts'),
  );
  assert.equal(typeof source, 'string');
  return source;
}
