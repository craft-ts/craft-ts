#!/usr/bin/env node
// PROTOTYPE: real AST lowering, differential behavior, production browser timing.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const app=dirname(fileURLToPath(import.meta.url)),workspace=resolve(app,'../..');
const output=resolve(workspace,process.env.SYNC_LOWERING_OUTPUT??'tmp/sync-lowering');
await mkdir(output,{recursive:true});
async function run(script,env){await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[join(app,script)],{cwd:workspace,stdio:'inherit',env:{...process.env,...env}});
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${script}: ${code}`)));
});}
if(process.env.SYNC_LOWERING_SUMMARIZE_ONLY!=='true'){
 await run('diagnose.mjs',{
  CRAFT_SYNC_LOWERING:'true',CRAFT_MOUNT_DIAG_VARIANTS:'counts-fine-reference,counts-lower-generic,counts-fine-grouped,counts-lower-fine',
  CRAFT_MOUNT_DIAG_MODE:'counts',CRAFT_MOUNT_DIAG_OUTPUT:join(output,'counts'),
  CRAFT_MOUNT_DIAG_CASES:'[{"rows":1000,"indexes":true}]',CRAFT_FLOOR_CONTRACTS:'false',CRAFT_NEXT_CONTRACTS:'false',CRAFT_FINE_FANOUT:'false',
 });
 await run('diagnose.mjs',{
  CRAFT_SYNC_LOWERING:'true',CRAFT_MOUNT_DIAG_VARIANTS:'fine-reference,lower-generic,fine-grouped,lower-fine',
  CRAFT_MOUNT_DIAG_MODE:'timing',CRAFT_MOUNT_DIAG_OUTPUT:join(output,'confirm'),
  CRAFT_MOUNT_DIAG_RUNS:process.env.SYNC_LOWERING_RUNS??'5',CRAFT_MOUNT_DIAG_ITERATIONS:'4',
  CRAFT_MOUNT_DIAG_CASES:'[{"rows":1000,"indexes":false},{"rows":1000,"indexes":true},{"rows":5000,"indexes":false},{"rows":5000,"indexes":true}]',
  CRAFT_FLOOR_CONTRACTS:'true',CRAFT_NEXT_CONTRACTS:'true',CRAFT_FINE_FANOUT:'false',
 });
 await run('verify-fine-plan.mjs',{FINE_PLAN_OUTPUT:output,VERIFY_VARIANT:'lower-fine'});
 await run('diagnose.mjs',{
  CRAFT_SYNC_LOWERING:'true',CRAFT_SYNC_MICRO:'true',CRAFT_MOUNT_DIAG_VARIANTS:'fine-grouped,lower-fine',
  CRAFT_MOUNT_DIAG_MODE:'timing',CRAFT_MOUNT_DIAG_OUTPUT:join(output,'micro'),CRAFT_MOUNT_DIAG_RUNS:'1',CRAFT_MOUNT_DIAG_ITERATIONS:'2',
  CRAFT_MOUNT_DIAG_CASES:'[]',CRAFT_FLOOR_CONTRACTS:'false',CRAFT_NEXT_CONTRACTS:'false',CRAFT_FINE_FANOUT:'false',
 });
 await run('diagnose.mjs',{
  CRAFT_SYNC_LOWERING:'true',CRAFT_MOUNT_DIAG_VARIANTS:'counts-fine-grouped,counts-lower-fine,counts-target-fast,counts-lower-target',
  CRAFT_MOUNT_DIAG_MODE:'counts',CRAFT_MOUNT_DIAG_OUTPUT:join(output,'target-counts'),CRAFT_MOUNT_DIAG_CASES:'[{"rows":1000,"indexes":true}]',
  CRAFT_FLOOR_CONTRACTS:'false',CRAFT_NEXT_CONTRACTS:'false',CRAFT_FINE_FANOUT:'false',
 });
 await run('diagnose.mjs',{
  CRAFT_SYNC_LOWERING:'true',CRAFT_MOUNT_DIAG_VARIANTS:'fine-grouped,lower-fine,target-fast,lower-target',
  CRAFT_MOUNT_DIAG_MODE:'timing',CRAFT_MOUNT_DIAG_OUTPUT:join(output,'target'),CRAFT_MOUNT_DIAG_RUNS:process.env.SYNC_LOWERING_RUNS??'5',CRAFT_MOUNT_DIAG_ITERATIONS:'4',
  CRAFT_MOUNT_DIAG_CASES:'[{"rows":5000,"indexes":false},{"rows":5000,"indexes":true}]',CRAFT_FLOOR_CONTRACTS:'true',CRAFT_NEXT_CONTRACTS:'true',CRAFT_FINE_FANOUT:'false',
 });
 await run('verify-fine-plan.mjs',{FINE_PLAN_OUTPUT:output,VERIFY_VARIANT:'lower-target',VERIFY_STAGE:'target'});
}
const timing=JSON.parse(await readFile(join(output,'confirm/timing.json'),'utf8')),
 counts=JSON.parse(await readFile(join(output,'counts/counts.json'),'utf8'));
assert.equal(timing.status,'complete');assert.equal(counts.status,'complete');
const stats=a=>{const v=[...a].sort((a,b)=>a-b),n=v.length;assert(n);return{n,median:n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2,min:v[0],max:v.at(-1)};};
for(const report of [timing,counts])for(const sample of report.samples){
 const prefix=report===counts?'counts-':'';
 const base=sample.variant.includes('generic')||sample.variant.endsWith('reference')?'fine-reference':'fine-grouped';
 const reference=report.samples.find(s=>s.variant===prefix+base&&s.rows===sample.rows&&s.indexes===sample.indexes&&s.run===sample.run);
 assert(reference);assert.equal(sample.contracts.tagsSha256,reference.contracts.tagsSha256);
 assert.deepEqual(sample.contracts.descriptor,reference.contracts.descriptor);assert.deepEqual(sample.contracts.dom,reference.contracts.dom);
 assert.deepEqual(sample.errors,[]);assert.equal(sample.destroyed.contracts.reports,0);
}
const summary={commit:timing.commit,environment:timing.environment,settings:timing.settings,mount:[],counts:counts.samples.map(s=>({variant:s.variant,counts:s.startup.probe.counts})),
 validation:{mountNavigations:timing.samples.length,loweringContracts:timing.loweringContracts,fallbackContracts:timing.prototypeContracts.length,plannedContracts:timing.plannedContracts.length},
 provenance:timing.variants.map(({url,...variant})=>variant),manifests:{}};
for(const scenario of timing.settings.cases)for(const {name} of timing.variants){
 const s=timing.samples.filter(s=>s.variant===name&&s.rows===scenario.rows&&s.indexes===scenario.indexes);
 summary.mount.push({...scenario,variant:name,mountMs:stats(s.map(x=>x.startup.bootstrapMs)),heapMiB:stats(s.map(x=>x.memory.usedSize/1024**2)),
 actions:Object.fromEntries(['update-one','update-tenth','reverse','filter','restore'].map(a=>[a,stats(s.flatMap(x=>x.actions.filter(y=>y.action===a).map(y=>y.domMs)))]))});
}
for(const name of ['lower-generic','lower-fine'])summary.manifests[name]=JSON.parse(await readFile(join(output,'confirm/prototypes',name,'apps/framework-benchmark/src/craft/sync-lowering.manifest.json'),'utf8'));
summary.validation.tests=JSON.parse(await readFile(join(output,'verification-summary-lower-fine.json'),'utf8'));
try{
 const a=JSON.parse(await readFile(join(output,'attribution/counts.json'),'utf8'));
 const sample=a.samples[0];summary.attribution={variant:sample.variant,generators:sample.startup.probe.counts['generator.run'],
  targetWrappers:Object.entries(sample.startup.probe.stacks??{}).filter(([stack])=>stack.includes('ɵrunCraftTargetWrappers')).reduce((n,[,count])=>n+count,0)};
}catch(error){if(error.code!=='ENOENT')throw error;}
try{
 const report=JSON.parse(await readFile(join(output,'target/timing.json'),'utf8'));assert.equal(report.status,'complete');
 const tc=JSON.parse(await readFile(join(output,'target-counts/counts.json'),'utf8'));assert.equal(tc.status,'complete');
 summary.target=[];
 for(const scenario of report.settings.cases)for(const {name} of report.variants){
  const s=report.samples.filter(s=>s.variant===name&&s.rows===scenario.rows&&s.indexes===scenario.indexes);
  for(const sample of s){const base=report.samples.find(x=>x.variant==='fine-grouped'&&x.rows===sample.rows&&x.indexes===sample.indexes&&x.run===sample.run);assert.equal(sample.contracts.tagsSha256,base.contracts.tagsSha256);assert.deepEqual(sample.contracts.descriptor,base.contracts.descriptor);assert.deepEqual(sample.contracts.dom,base.contracts.dom);}
  summary.target.push({...scenario,variant:name,mountMs:stats(s.map(x=>x.startup.bootstrapMs)),heapMiB:stats(s.map(x=>x.memory.usedSize/1024**2))});
 }
 summary.targetCounts=tc.samples.map(s=>({variant:s.variant,generators:s.startup.probe.counts['generator.run'],compiled:s.startup.probe.counts['compiler.run']??0}));
 summary.provenanceTarget=report.variants.map(({url,...v})=>v);
 summary.validation.targetNavigations=report.samples.length;
 summary.validation.targetContracts=report.prototypeContracts.length+report.plannedContracts.length;
 summary.validation.targetTests=JSON.parse(await readFile(join(output,'verification-summary-lower-target.json'),'utf8'));
}catch(error){if(error.code!=='ENOENT')throw error;}
try{
 const micro=JSON.parse(await readFile(join(output,'micro/timing.json'),'utf8'));assert.equal(micro.status,'complete');
 summary.micro=[];
 for(const {variant,result} of micro.micro)for(const middleware of [false,true])for(const direct of [false,true])
  summary.micro.push({variant,middleware,direct,iterations:result[0].iterations,ms:stats(result.filter(s=>s.middleware===middleware&&s.direct===direct).map(s=>s.ms))});
 summary.provenanceMicro=micro.variants.map(({url,...variant})=>variant);
}catch(error){if(error.code!=='ENOENT')throw error;}
for(const s of summary.counts)if(s.variant.includes('lower-'))assert((s.counts['compiler.run']??0)>0,'Compiler did not execute');
await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
for(const s of summary.mount)console.log(`${s.rows} indexes=${s.indexes} ${s.variant}: ${s.mountMs.median.toFixed(1)}ms; ${s.heapMiB.median.toFixed(2)}MiB`);
