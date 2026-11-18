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
        ...(process.env.CAMPAIGN_LOCAL_FIXTURE === 'true' || process.env.CAMPAIGN_SCALAR_FIXTURE === 'true' || process.env.CAMPAIGN_IMPORTED_FIXTURE === 'true' || process.env.CAMPAIGN_WIDE_INDEX === 'true' || process.env.CAMPAIGN_SERVICE_FIXTURE === 'true' || process.env.CAMPAIGN_FUSION_FIXTURE === 'true' || process.env.CAMPAIGN_MULTIPLE_ROOTS === 'true' || process.env.CAMPAIGN_ATTRS_FIXTURE === 'true' || process.env.CAMPAIGN_H_FIXTURE === 'true' || process.env.CAMPAIGN_EAGER_ATTRS === 'true' || ['root-dynamic','nested-static','nested-dynamic','root-static'].includes(process.env.CAMPAIGN_STYLE_FIXTURE) ? [{
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
            if(process.env.CAMPAIGN_WIDE_INDEX === 'true') {
              const start=source.indexOf('const IndexedRow = craftComponent('),end=source.indexOf('const Leaf = craftComponent(');
              if(start<0||end<0)throw Error('Wide index anchors missing');
              const cells=Array.from({length:16},()=>"span({'data-position':inputs.position},function*(){return (yield* inputs.position())+1;})");
              source=source.slice(0,start)+"const IndexedRow=craftComponent('CompilerBenchIndexedRow',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>div({'data-row':function*(){return (yield* inputs.row()).id;}},["+cells.join(',')+",function*(){return (yield* inputs.row()).label;}]));\\n"+source.slice(end);
            }
            if(process.env.CAMPAIGN_SERVICE_FIXTURE === 'true') {
              const start=source.indexOf('const Row = craftComponent('),end=source.indexOf('const IndexedRow = craftComponent(');
              if(start<0||end<0)throw Error('Service fixture anchors missing');
              source=source.slice(0,start)+"const Row=craftComponent('CompilerBenchRow',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>div({'data-row':function*(){return (yield* inputs.row()).id;}},function*(){return (yield* inputs.row()).label+' / '+(yield* __benchCounter.value());}));\\n"+source.slice(end);
              source="import {craftService as __benchService,state as __benchState} from '@craft-ts/core';\\nlet __benchBump:()=>void=()=>{throw Error('Counter not resolved');};\\nconst {BenchCounter:__benchCounter}=__benchService({name:'BenchCounter',providedIn:'global'},function*(){yield* __benchState('value',0,({update})=>{__benchBump=()=>update(value=>value+1);return {bump:__benchBump};});});\\n"+source;
              source=source.replace("  else if (action === 'update-one' || action === 'update-tenth')","  else if(action === 'update-tenth') __benchBump();\\n  else if (action === 'update-one')");
            }
            if(process.env.CAMPAIGN_FUSION_FIXTURE === 'true') {
              const start=source.indexOf('const IndexedRow = craftComponent('),end=source.indexOf('const Leaf = craftComponent(');
              if(start<0||end<0)throw Error('Fusion fixture anchors missing');
              const cells=Array.from({length:16},()=>"span({'data-position':inputs.position},inputs.position)");
              source=source.slice(0,start)+"const IndexedRow=craftComponent('CompilerBenchIndexedRow',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>div({'data-row':function*(){return (yield* inputs.row()).id;}},["+cells.join(',')+",function*(){return (yield* inputs.row()).label;}]));\\n"+source.slice(end);
            }
            if(process.env.CAMPAIGN_MULTIPLE_ROOTS === 'true') {
              const start=source.indexOf('const Row = craftComponent('),end=source.indexOf('const IndexedRow = craftComponent(');
              if(start<0||end<0)throw Error('Multiple roots fixture anchors missing');
              source=source.slice(0,start)+"const Row=craftComponent('CompilerBenchRow',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>[div({'data-row':function*(){return (yield* inputs.row()).id;}},function*(){return (yield* inputs.row()).label;}),' / ',span({'data-position':inputs.position},inputs.position)]);\\n"+source.slice(end);
            }
            if(process.env.CAMPAIGN_ATTRS_FIXTURE === 'true') {
              const start=source.indexOf('const Row = craftComponent('),end=source.indexOf('const IndexedRow = craftComponent(');
              if(start<0||end<0)throw Error('Attrs fixture anchors missing');
              const attributes=Array.from({length:8},(_,index)=>JSON.stringify('data-column-'+index)+':'+JSON.stringify('column-'+index)).join(',');
              source=source.slice(0,start)+"const Row=craftComponent('CompilerBenchRow',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>div({attrs:{role:'row',"+attributes+"},'data-row':function*(){return (yield* inputs.row()).id;}},function*(){return (yield* inputs.row()).label;}));\\n"+source.slice(end);
            }
            if(process.env.CAMPAIGN_H_FIXTURE === 'true') {
              const start=source.indexOf('const Row = craftComponent('),end=source.indexOf('const IndexedRow = craftComponent(');
              if(start<0||end<0)throw Error('h fixture anchors missing');
              const row=source.slice(start,end);if(!row.includes('    div('))throw Error('h row anchor missing');
              source="import {h as __benchH} from '@craft-ts/component';\\n"+source.slice(0,start)+row.replace('    div(',"    __benchH('div',")+source.slice(end);
            }
            if(process.env.CAMPAIGN_EAGER_ATTRS === 'true') {
              const start=source.indexOf('const Row = craftComponent('),end=source.indexOf('const IndexedRow = craftComponent(');
              if(start<0||end<0)throw Error('Eager attrs fixture anchors missing');
              source="import {ɵsignal as __benchSignal} from '@craft-ts/core';\\nconst __benchEager=__benchSignal(0);\\n"+source.slice(0,start)+"const Row=craftComponent('CompilerBenchRow',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>div({attrs:{role:'row'},'data-row':function*(){return (yield* inputs.row()).id;},'data-eager':__benchEager()},function*(){return (yield* inputs.row()).label;}));\\n"+source.slice(end);
              source=source.replace("  else if (action === 'update-one' || action === 'update-tenth')","  else if(action === 'update-tenth') __benchEager.update(value=>value+1);\\n  else if (action === 'update-one')");
            }
            if(process.env.CAMPAIGN_OWNED_INPUT === 'true') source=source.replace('(row, position) => Row({ row, position })','(row, position) => Row({ row, position, extra: {} })').replace("position:Input<number>})=>div({attrs:{role:'row'}", "position:Input<number>;extra?:unknown})=>div({attrs:{role:'row'}");
            if(['root-dynamic','nested-static','nested-dynamic','root-static'].includes(process.env.CAMPAIGN_STYLE_FIXTURE)) {
              const start=source.indexOf('const Row = craftComponent('),end=source.indexOf('const IndexedRow = craftComponent(');
              if(start<0||end<0)throw Error('Style fixture anchors missing');
              const mode=process.env.CAMPAIGN_STYLE_FIXTURE;
              const dynamic="function*(){const row=yield* inputs.row();return {width:(row.id%20+1)+'px',color:row.label.endsWith('!')?'blue':'red'};}";
              const record="{display:'inline-block',height:'12px',width:function*(){return (yield* inputs.row()).label.length+'px';}}";
              const style=mode.endsWith('dynamic')?dynamic:record;
              const label="function*(){return (yield* inputs.row()).label;}";
              const child=mode.startsWith('nested')?"span({style:"+style+"},"+label+")":label;
              const rootStyle=mode.startsWith('root')?",style:"+style:'';
              source=source.slice(0,start)+"const Row=craftComponent('CompilerBenchRow',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>div({'data-row':function*(){return (yield* inputs.row()).id;}"+rootStyle+"},"+child+"));\\n"+source.slice(end);
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
if (process.env.CAMPAIGN_COMMENT_COUNTS === 'true') {
  runner = replaceOnce(
    runner,
    "      await page.evaluate(() => window.__compilerBench.run('destroy'));",
    `      const comments = await page.evaluate(() => {
        const walker=document.createTreeWalker(document.getElementById('mount'),NodeFilter.SHOW_COMMENT);
        let all=0,forComments=0;while(walker.nextNode()){all++;if(walker.currentNode.nodeValue.startsWith('craft-for:'))forComments++;}
        return {all,forComments};
      });
      await page.evaluate(() => window.__compilerBench.run('destroy'));`,
  );
  runner = replaceOnce(
    runner,
    '      traces.push({ label, trace });',
    '      traces.push({ label, trace, comments });',
  );
  runner = replaceOnce(
    runner,
    'contracts.push({ case: kind, passed: true, steps: traces[0].trace.length });',
    'contracts.push({ case: kind, passed: true, steps: traces[0].trace.length, variants: traces.map(({label,comments})=>({label,comments})) });',
  );
}
if (process.env.CAMPAIGN_BLOCKED === 'true') {
  runner = replaceOnce(
    runner,
    `  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }`,
    `  // Randomized blocks keep both variants of a case adjacent; their order
  // alternates by run to balance order effects during this confirmation.
  const blocks=[];
  for(const job of jobs){
    const previous=blocks.at(-1);
    if(previous&&previous[0].run===job.run&&previous[0].kind===job.kind&&previous[0].count===job.count)previous.push(job);
    else blocks.push([job]);
  }
  for(const block of blocks)if(block[0].run%2)block.reverse();
  for(let i=blocks.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[blocks[i],blocks[j]]=[blocks[j],blocks[i]];}
  jobs.splice(0,jobs.length,...blocks.flat());`,
  );
}
await writeFile(runnerPath, runner);
process.env.COMPILER_VARIANTS = ids
  .map(
    (id) =>
      id +
      '=' +
      (JSON.parse(process.env.CAMPAIGN_MODES ?? '{}')[id] ??
        process.env.CAMPAIGN_MODE ??
        'lean') +
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
