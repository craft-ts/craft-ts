#!/usr/bin/env node
// PROTOTYPE — real template-to-plan compilation and prepared instance slots.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const app=dirname(fileURLToPath(import.meta.url)),workspace=resolve(app,'../..');
const output=resolve(workspace,process.env.CREATION_PLAN_OUTPUT??'tmp/creation-plan');
await mkdir(output,{recursive:true});
async function run(script,env){await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[join(app,script)],{cwd:workspace,stdio:'inherit',env:{...process.env,...env}});
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${script}: ${code}`)));
});}
if(process.env.CREATION_PLAN_SUMMARIZE_ONLY!=='true'){
 await run('creation-plan.compiler-check.mjs',{CREATION_PLAN_OUTPUT:output});
 await run('diagnose.mjs',{
  CRAFT_CREATION_PLAN:'true',CRAFT_MOUNT_DIAG_VARIANTS:'counts-fine-reference,counts-fine-grouped,counts-plan-auto,counts-plan-slots',
  CRAFT_MOUNT_DIAG_MODE:'counts',CRAFT_MOUNT_DIAG_OUTPUT:join(output,'counts'),CRAFT_MOUNT_DIAG_CASES:'[{"rows":1000,"indexes":true}]',
  CRAFT_FLOOR_CONTRACTS:'false',CRAFT_NEXT_CONTRACTS:'false',CRAFT_FINE_FANOUT:'false',
 });
 await run('diagnose.mjs',{
  CRAFT_CREATION_PLAN:'true',CRAFT_MOUNT_DIAG_VARIANTS:'fine-reference,fine-grouped,plan-auto,plan-slots',
  CRAFT_MOUNT_DIAG_MODE:'timing',CRAFT_MOUNT_DIAG_OUTPUT:join(output,'confirm'),
  CRAFT_MOUNT_DIAG_RUNS:process.env.CREATION_PLAN_RUNS??'5',CRAFT_MOUNT_DIAG_ITERATIONS:'4',
  CRAFT_MOUNT_DIAG_CASES:'[{"rows":1000,"indexes":false},{"rows":1000,"indexes":true},{"rows":5000,"indexes":false},{"rows":5000,"indexes":true}]',
  CRAFT_FLOOR_CONTRACTS:'true',CRAFT_NEXT_CONTRACTS:'true',CRAFT_FINE_FANOUT:'true',CRAFT_FINE_FANOUT_FIELDS:'[128]',CRAFT_FINE_FANOUT_RUNS:'3',
 });
 await run('verify-fine-plan.mjs',{FINE_PLAN_OUTPUT:output,VERIFY_VARIANT:'plan-slots'});
}
const timing=JSON.parse(await readFile(join(output,'confirm/timing.json'),'utf8')),
 counts=JSON.parse(await readFile(join(output,'counts/counts.json'),'utf8'));
assert.equal(timing.status,'complete');assert.equal(counts.status,'complete');
const stats=a=>{const v=[...a].sort((a,b)=>a-b),n=v.length;assert(n);return{n,median:n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2,min:v[0],max:v.at(-1)};};
for(const report of [timing,counts])for(const sample of report.samples){
 const prefix=report===counts?'counts-':'';
 const peer=report.samples.find(s=>s.variant===prefix+'fine-grouped'&&s.rows===sample.rows&&s.indexes===sample.indexes&&s.run===sample.run);
 assert(peer);assert.deepEqual(sample.contracts.descriptor,peer.contracts.descriptor);
 assert.deepEqual(sample.errors,[]);assert.equal(sample.destroyed.contracts.reports,0);
 const generic=sample.variant.endsWith('reference');
 assert.equal(sample.contracts.reports,sample.rows*(generic?(sample.indexes?5:3):(sample.indexes?3:2))+3);
 if(!generic)assert.deepEqual(sample.contracts.dom,peer.contracts.dom);
 if(sample.variant.endsWith('slots')){
  const record=report.samples.find(s=>s.variant===prefix+'plan-auto'&&s.rows===sample.rows&&s.indexes===sample.indexes&&s.run===sample.run);
  assert.equal(sample.contracts.tagsSha256,record.contracts.tagsSha256);
 }
}
const summary={commit:timing.commit,environment:timing.environment,settings:timing.settings,mount:[],fanout:[],
 counts:counts.samples.map(s=>({variant:s.variant,counts:s.startup.probe.counts,effects:s.contracts.reports,dom:s.contracts.dom})),
 validation:{mountNavigations:timing.samples.length,creationContracts:timing.creationContracts,fallbackContracts:timing.prototypeContracts.length,plannedContracts:timing.plannedContracts.length,
  fanoutNavigations:timing.fanout.samples.length+timing.fanout.counters.length,resolved:timing.fanout.crossTargets.reduce((n,x)=>n+x.resolved,0)},
 provenance:timing.variants.map(({url,...variant})=>variant),manifests:{}};
for(const scenario of timing.settings.cases)for(const {name} of timing.variants){
 const s=timing.samples.filter(s=>s.variant===name&&s.rows===scenario.rows&&s.indexes===scenario.indexes);
 summary.mount.push({...scenario,variant:name,mountMs:stats(s.map(x=>x.startup.bootstrapMs)),heapMiB:stats(s.map(x=>x.memory.usedSize/1024**2)),
 actions:Object.fromEntries(['update-one','update-tenth','reverse','filter','restore'].map(a=>[a,stats(s.flatMap(x=>x.actions.filter(y=>y.action===a).map(y=>y.domMs)))]))});
}
for(const {name} of timing.variants){
 const s=timing.fanout.samples.filter(s=>s.variant===name),counter=timing.fanout.counters.find(s=>s.variant===name);
 assert(counter);for(const read of counter.reads)assert.equal(read.fields.reduce((a,b)=>a+b,0),1);
 summary.fanout.push({variant:name,fields:128,mountMs:stats(s.map(x=>x.mountMs)),heapMiB:stats(s.map(x=>x.heapMiB)),updateMs:stats(s.flatMap(x=>x.actions.map(a=>a.domMs))),reads:counter.reads});
}
for(const name of ['plan-auto','plan-slots'])summary.manifests[name]=JSON.parse(await readFile(join(output,'confirm/prototypes',name,'apps/framework-benchmark/src/craft/creation-plan.manifest.json'),'utf8'));
summary.validation.tests=JSON.parse(await readFile(join(output,'verification-summary-plan-slots.json'),'utf8'));
try{summary.validation.compiler=JSON.parse(await readFile(join(output,'compiler-contracts.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const s of summary.counts){
 if(s.variant==='counts-plan-slots'){assert.equal(s.counts['component.generated-slots'],1000);assert.equal(s.counts['component.layout.create'],1);}
 if(s.variant==='counts-plan-auto')assert.equal(s.counts['component.generated-record'],1000);
}
await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
for(const s of summary.mount)console.log(`${s.rows} indexes=${s.indexes} ${s.variant}: ${s.mountMs.median.toFixed(1)}ms; ${s.heapMiB.median.toFixed(2)}MiB`);
