// Executable prototype check: generated locals must not capture user bindings.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {compileCreationPlans} from './creation-plan.compiler.mjs';
const source=`import {craftComponent,div,span} from '@craft-ts/component';
let state=()=> 'state';const context=()=> 'context',value=()=> 'value',nodes=()=> 'nodes',renderer=()=> 'renderer',input=()=> 'input',unseen=()=> 'unseen';
const prototypePlanText=()=> 'user-helper';
export const Fixture=craftComponent('HygienicPlan',{},()=>div(
  span(()=>state()),span(()=>context()),span(()=>value()),span(()=>nodes()),span(()=>renderer()),span(()=>input()),span(()=>unseen()),span(()=>prototypePlanText()),
));
export function change(next:string){state=()=>next;}
`;
const text=(value)=>value==null||value===false?'':String(value);
const renderer={createElement:tag=>({tag,children:[],attrs:{}}),createText:value=>({text:value}),appendChild:(p,n)=>p.children.push(n),setValue:(n,v)=>n.text=v,setAttribute:(n,k,v)=>n.attrs[k]=v,removeAttribute:(n,k)=>delete n.attrs[k]};
const modules={craftComponent:(name,meta,template)=>({name,template}),div:(...children)=>({children}),span:(...children)=>({children}),
  prototypeAttachCreationPlan:(component,plan)=>component.plan=plan,
  prototypePlanRead:reader=>typeof reader==='function'?reader():reader,prototypePlanText:text,
  prototypePlanAttribute:value=>value==null||value===false?null:value===true?'':String(value)};
function load(source){
 const ast=ts.createSourceFile('generated.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 source=ts.createPrinter().printFile(ts.factory.updateSourceFile(ast,[...ast.statements.filter(ts.isImportDeclaration),...ast.statements.filter(s=>!ts.isImportDeclaration(s))]));
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={},context=vm.createContext({exports,module:{exports},require:name=>{assert.equal(name,'@craft-ts/component');return modules;}});
 new vm.Script(compiled).runInContext(context);return exports;
}
const native=load(source);
function nativeTexts(node){if(typeof node==='function')return [text(node())];return node.children?.flatMap(nativeTexts)??[text(node)];}
const results=[];
for(const layout of ['record','slots']){
 const compiled=compileCreationPlans(source,'hygiene.ts',{layout});assert.equal(compiled.manifest[0].status,'compiled');
 const program=load(compiled.source),plan=program.Fixture.plan;
 const state=layout==='slots'?plan.prepare({},()=>{throw Error('No input expected');}):null;
 const built=layout==='slots'?(plan.create(state,renderer),{root:state[plan.rootSlot]}):plan.create(renderer);
 const execute=()=>{for(const binding of plan.bindings)layout==='slots'?binding.run(state,renderer,{}):binding.write(binding.read(()=>{throw Error('No input expected');},{}),built.nodes,renderer,{});};
 const texts=node=>'text' in node?[node.text]:node.children.flatMap(texts);
 execute();assert.deepEqual(texts(built.root),nativeTexts(native.Fixture.template()));
 program.change('changed');native.change('changed');execute();
 assert.deepEqual(texts(built.root),nativeTexts(native.Fixture.template()));
 results.push({layout,texts:texts(built.root),liveCapture:true,helperAlias:true});native.change('state');
}
const shadowed=compileCreationPlans("import {craftComponent,div} from '@craft-ts/component'; function make(div:any){const C=craftComponent('Shadowed',{},()=>div('x'));return C;}",'shadowed.ts');
assert.equal(shadowed.manifest[0].status,'fallback');
const dynamic=compileCreationPlans("import {craftComponent,div,span,type Input} from '@craft-ts/component'; const C=craftComponent('Dynamic',{},(settings:{indexes:Input<boolean>})=>div(settings.indexes?span('x'):null));",'dynamic.ts');
assert.equal(dynamic.manifest[0].status,'fallback');
const output=resolve(process.env.CREATION_PLAN_OUTPUT??'tmp/creation-plan');await mkdir(output,{recursive:true});
await writeFile(join(output,'compiler-contracts.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
