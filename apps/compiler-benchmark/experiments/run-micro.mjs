import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lab, workspace, replaceOnce } from './prepare.mjs';
const ids = process.argv.slice(2);
if (!ids.length) throw Error('Pass candidate IDs');
await mkdir(lab, { recursive: true });
const importedFixture = join(lab, 'imported-fixture/rows.ts');
if (process.env.CAMPAIGN_IMPORTED_FIXTURE === 'true') {
  const source = await readFile(
    join(workspace, 'apps/compiler-benchmark/main.ts'),
    'utf8',
  );
  const start = source.indexOf('const Row = craftComponent('),
    end = source.indexOf('const Leaf = craftComponent(');
  if (start < 0 || end < 0) throw Error('Imported fixture anchors missing');
  await mkdir(join(lab, 'imported-fixture'), { recursive: true });
  await writeFile(
    importedFixture,
    "import {craftComponent,div,span,type Input} from '@craft-ts/component';\n" +
      source
        .slice(start, end)
        .replace('const Row =', 'export const Row =')
        .replace('const IndexedRow =', 'export const IndexedRow ='),
  );
}
for (const id of ids) {
  const result = spawnSync(
    join(workspace, 'node_modules/.bin/tsc'),
    ['-p', join(lab, 'roots', id, 'libs/compiler/tsconfig.lib.json')],
    { cwd: workspace, encoding: 'utf8' },
  );
  if (result.status !== 0) throw Error(result.stdout + '\n' + result.stderr);
}
let runner = await readFile(
  join(workspace, 'apps/compiler-benchmark/run.mjs'),
  'utf8',
);
runner = replaceOnce(
  runner,
  "import { craftCompiler } from '../../dist/libs/compiler/src/vite.js';",
  "import { pathToFileURL } from 'node:url';",
);
runner = replaceOnce(
  runner,
  "const app = dirname(fileURLToPath(import.meta.url)),\n  root = resolve(app, '../..');",
  'const app = ' +
    JSON.stringify(join(workspace, 'apps/compiler-benchmark')) +
    ', root = ' +
    JSON.stringify(workspace) +
    ';',
);
runner = replaceOnce(
  runner,
  "    const enabled = mode !== 'runtime';",
  `    const {craftCompiler} = await import(pathToFileURL(join(libraryRoot,'dist/libs/compiler/src/vite.js')));
    const enabled = mode !== 'runtime';`,
);
runner = replaceOnce(
  runner,
  "      lean: mode === 'lean',",
  "      lean: mode === 'lean',\n      ...(JSON.parse(process.env.CAMPAIGN_COMPILER_OPTIONS ?? '{}')[label] ?? {}),",
);
// Same application for both compilers; deliberately local definitions exercise
// the coverage change, while all state, actions and browser assertions stay put.
runner = replaceOnce(
  runner,
  '      plugins: enabled',
  `      plugins: [
        ...(process.env.CAMPAIGN_LOCAL_FIXTURE === 'true' || process.env.CAMPAIGN_SCALAR_FIXTURE === 'true' || process.env.CAMPAIGN_IMPORTED_FIXTURE === 'true' ? [{
          name:'campaign-local-fixture', enforce:'pre',
          resolveId(specifier){if(specifier==='campaign-imported-rows')return ${JSON.stringify(importedFixture)};},
          transform(source,id) {
            if(id !== join(app,'main.ts')) return null;
            if(process.env.CAMPAIGN_IMPORTED_FIXTURE === 'true') {
              const start=source.indexOf('const Row = craftComponent('),end=source.indexOf('const Leaf = craftComponent(');
              source="import {Row,IndexedRow} from 'campaign-imported-rows';\\n"+source.slice(0,start)+source.slice(end);
            }
            if(process.env.CAMPAIGN_SCALAR_FIXTURE === 'true') {
              const start=source.indexOf('const Row = craftComponent('), end=source.indexOf('const IndexedRow = craftComponent(');
              source=source.slice(0,start)+"const Row=craftComponent('CompilerBenchRow',{},(inputs:{row:Input<string>;position:Input<number>})=>div({'data-row':inputs.row},inputs.row));\\n"+source.slice(end);
              source=source.replace('(row, position) => Row({ row, position })','(row, position) => Row({ row: row.label, position })');
            }
            if(process.env.CAMPAIGN_LOCAL_FIXTURE === 'true') source=source.replace('const Row = craftComponent(', 'function fixture() {\\nconst Row = craftComponent(').replace('const start = performance.now();','return App; }\\nconst App = fixture();\\nconst start = performance.now();');
            return source;
          },
        }] : []),
        ...(enabled`,
);
runner = replaceOnce(
  runner,
  '        : [],\n      resolve:',
  '        : []),\n      ],\n      resolve:',
);
const runnerPath = join(lab, 'micro.mjs');
await writeFile(runnerPath, runner);
process.env.COMPILER_VARIANTS = ids
  .map(
    (id) =>
      id +
      '=' +
      (process.env.CAMPAIGN_MODE ?? 'lean') +
      '@' +
      join(lab, 'roots', id),
  )
  .join(',');
process.env.COMPILER_RUNS ??= '5';
process.env.COMPILER_ITERATIONS ??= '5';
process.env.COMPILER_OUTPUT ??= join(
  lab,
  process.env.CAMPAIGN_OUTPUT ?? 'local-micro',
);
await import(pathToFileURL(runnerPath));
