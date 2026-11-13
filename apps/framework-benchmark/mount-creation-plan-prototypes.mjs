// PROTOTYPE — code generation and runtime changes confined to diagnose snapshots.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileCreationPlans} from './creation-plan.compiler.mjs';
const app=dirname(fileURLToPath(import.meta.url));
export async function applyCreationPlanPrototype(layout,{paths,patch,scratch,original}){
 const main=original.get(paths.main),start=main.indexOf('const Row = craftComponent('),end=main.indexOf('const App = craftComponent(');
 assert(start>=0&&end>start);
 await patch(paths.main,"import { RowByComponentPrototype as Row } from './row-by-component.prototype';\n",main.slice(start,end));
 await patch(paths.render,'  inputs: readonly string[];','  version?:number;pureInputs?:readonly string[];valid?:()=>boolean;\n  inputs: readonly string[];');
 await patch(paths.render,'read:(input:(name:string)=>any)=>unknown;write:(value:any,nodes:Record<string,Node>,renderer:CraftDomAdapter)=>void',
  'read:(input:(name:string)=>any,context?:RenderContext)=>unknown;write:(value:any,nodes:Record<string,Node>,renderer:CraftDomAdapter,context?:RenderContext)=>void');
 await patch(paths.render,"  return !!plan && !node.injector",`  return !!plan && (!plan.valid||plan.valid())
    && prototypeGeneratedPlanAllowed(plan,d,context)
    && (!plan.pureInputs?.length||plan.pureInputs.every(key=>prototypeInputReads.has(node.props[key]))) && !node.injector`);
 await patch(paths.render,'return prototypeReadForInput(source());','return prototypePlanRead(source());');
 await patch(paths.render,'binding.read(this.readInput);','binding.read(this.readInput,this.renderContext);');
 await patch(paths.render,'binding.write(value,built.nodes,this.context.renderer);','binding.write(value,built.nodes,this.context.renderer,this.renderContext);');
 await writeFile(join(scratch,paths.render),(await readFile(join(scratch,paths.render),'utf8'))+'\n'+await readFile(join(app,'prototype-runtime/slot-planned-component.ts.txt'),'utf8'));
 await patch(paths.render,
  '      if (prototypeCanFinePlan(node,context,parent)) return new PrototypeFinePlannedComponent(node,parent,before,context);',
  `      if (prototypeCanFinePlan(node,context,parent)) return (node.component as any).__prototypeFinePlan.version===2
        ? new PrototypeSlotPlannedComponent(node,parent,before,context):new PrototypeFinePlannedComponent(node,parent,before,context);`);
 await patch(paths.render,
  'return !!factory?.__prototypePlannedComponent && !!(node.itemTemplate as any).__craftPureItemPrototype',
  'return !!(factory?.__prototypePlannedComponent||factory?.__prototypeFinePlan) && !!(node.itemTemplate as any).__craftPureItemPrototype');
 await patch(paths.render,
  'next[0].kind === \'component\' && prototypeCanPlanComponent(next[0], this.context, this.parent)',
  'next[0].kind === \'component\' && (prototypeCanPlanComponent(next[0], this.context, this.parent)||prototypeCanFinePlan(next[0],this.context,this.parent))');
  await writeFile(join(scratch,paths.componentIndex),(await readFile(join(scratch,paths.componentIndex),'utf8'))+"\nexport {prototypeAttachCreationPlan,prototypePlanRead,prototypePlanText,prototypePlanAttribute} from './lib/render/interpreter';\n");
  await writeFile(join(scratch,paths.coreIndex),(await readFile(join(scratch,paths.coreIndex),'utf8'))+"\nexport {REACTIVE_READ_OBSERVERS as ɵprototypePlanReadObservers} from './lib/reactive-read';\n");
 const manifest=[];
 for(const path of [paths.main,paths.creationFixture]){
  const result=compileCreationPlans(await readFile(join(scratch,path),'utf8'),path,{layout});
  await writeFile(join(scratch,path),result.source);manifest.push({path,components:result.manifest});
 }
 assert(manifest[0].components.some(c=>c.variable==='Row'&&c.status==='compiled'),'Row was not compiled');
 await patch(paths.main,'begin();',`(globalThis as any).__finePlanExpectedPerRow=(Row as any).__prototypeFinePlan.bindings.length;
import {runCreationPlanContracts} from './creation-plan.contracts.prototype';
(globalThis as any).__runCreationPlanContracts=runCreationPlanContracts;
begin();`);
 await writeFile(join(scratch,'apps/framework-benchmark/src/craft/creation-plan.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
