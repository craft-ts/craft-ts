import { execFileSync } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareCandidate, replaceOnce, lab, workspace } from './prepare.mjs';
const foundation = '70a51b49e';
const committed = (file) =>
  execFileSync('git', ['show', foundation + ':' + file], {
    cwd: workspace,
    encoding: 'utf8',
  });
for (const id of [
  'ablation-full',
  'ablation-events',
  'ablation-holes',
  'ablation-lower',
  'ablation-services',
  'ablation-list-entries',
  'ablation-clone',
]) {
  const root = join(lab, 'roots', id);
  try {
    await access(join(root, 'candidate.json'));
  } catch {
    await prepareCandidate(id, [
      {
        file: 'libs/compiler/src/compiler.ts',
        change: () => {
          let source = committed('libs/compiler/src/compiler.ts');
          if (id === 'ablation-events' || id === 'ablation-holes')
            source = replaceOnce(
              source,
              '    const rootCount = tree(root, undefined, []);',
              `    const rootCount = tree(root, undefined, []);\n    if(${id === 'ablation-events' ? 'eventPlans' : 'holePlans'}.length)fail('Campaign ablation: ${id}');`,
            );
          if (id === 'ablation-services') {
            source = replaceOnce(
              source,
              '    lower?: boolean;',
              '    lower?: boolean;\n    /** @internal Measurement-only pass control. */\n    directServices?:boolean;',
            );
            source = replaceOnce(
              source,
              '          ts.isCallExpression(operand) &&',
              '          options.directServices !== false &&\n          ts.isCallExpression(operand) &&',
            );
          }
          return source;
        },
      },
      {
        file: 'libs/compiler/src/vite.ts',
        change: () => committed('libs/compiler/src/vite.ts'),
      },
      {
        file: 'libs/component/src/lib/render/compiled-template.ts',
        change: () =>
          committed('libs/component/src/lib/render/compiled-template.ts'),
      },
      {
        file: 'libs/core/src/lib/craft-service.ts',
        change: () => committed('libs/core/src/lib/craft-service.ts'),
      },
      {
        file: 'libs/component/src/lib/render/interpreter.ts',
        change: () => {
          let source = committed(
            'libs/component/src/lib/render/interpreter.ts',
          );
          if (id === 'ablation-list-entries') {
            source = replaceOnce(
              source,
              '    const lean = createInPlace && this.leanItems();',
              '    const lazyIndexes = createInPlace && this.leanItems();\n    const lean = Boolean(false);',
            );
            source = replaceOnce(
              source,
              '        const indexSignal = lean',
              '        const indexSignal = lazyIndexes',
            );
          }
          return source;
        },
      },
    ]);
  }
  await writeFile(
    join(root, 'libs/compiler/src/import-graph.ts'),
    committed('libs/compiler/src/import-graph.ts'),
  );
  console.log(root);
}
