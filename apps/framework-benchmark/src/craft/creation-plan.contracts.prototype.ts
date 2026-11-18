// PROTOTYPE — browser differential scenarios, always outside timed measurements.
import {bootstrapCraft,craftComponent,div,span,provideCraftRootComponent} from '@craft-ts/component';
import {craftSignal,craftAppConfig,craftUse,AppSnapshotRegistry,ɵinject,ɵInjector,ɵElementRef,ɵDestroyRef,
  CraftRenderIdentity,ɵcaptureCraftReplayTarget,ɵresolveCraftReplayTarget,provideFnWrapObserver,provideTemplateTrace,
  createYieldableReactiveValue,provideReactiveReadObserver} from '@craft-ts/core';
import {createCreationFixtures} from './creation-plan-fixtures.prototype';
export async function runCreationPlanContracts(recorded?:any){
  const assert=(ok:unknown,msg:string)=>{if(!ok)throw Error(msg);};
  const token={},cell=craftSignal<{label:string|false|null;enabled:boolean}>({label:'initial',enabled:true}),revision=craftSignal(0);
  let clicks=0,disposed=0,pairReads=[0,0],throwOnDestroy=false;const failure=Error('compiled cleanup'),owners:any[]=[],identities:string[][]=[];
  const {Value,Pair,Event}=createCreationFixtures(()=>clicks++);
  const value=function*(){
    const owner=ɵinject(ɵInjector);assert(owner.get(token)==='parent','DI parent');assert(ɵinject(token,{skipSelf:true})==='parent','skipSelf');
    assert(ɵinject(ɵElementRef).nativeElement.id==='compiled-parent','ElementRef');
    identities.push([...craftUse(CraftRenderIdentity()).path]);
    if(!owners.includes(owner)){owners.push(owner);ɵinject(ɵDestroyRef).onDestroy(()=>{disposed++;if(throwOnDestroy)throw failure;});}
    return cell();
  };
  const stableB=function*(){pairReads[1]++;return {text:'B'};};
  const Root=craftComponent('CreationPlanContractsRoot',{providers:[{provide:token,useValue:'parent'}]},()=>{
    const n=revision();return div({id:'compiled-parent'},[Value({value}),Pair({a:function*(){pairReads[0]++;return {text:'A'+n};},b:stableB}),Event()]);
  });
  const host=document.createElement('div');document.body.appendChild(host);
  const app=bootstrapCraft({host,mode:'production',config:craftAppConfig({providers:[provideCraftRootComponent(Root)]})});
  const registry=app.injector.run(()=>craftUse(AppSnapshotRegistry()));
  const element=host.querySelector('[data-compiled="value"]')!,text=host.querySelector('[data-compiled="text"]')!,textNode=text.firstChild;
  const targets=[element,text].map(n=>ɵcaptureCraftReplayTarget(n)!);
  if(recorded)assert(JSON.stringify(targets)===JSON.stringify(recorded.targets),'Compiled replay addresses changed');
  assert(element.getAttribute('aria-checked')==='true'&&element.getAttribute('data-flag')==='','Initial boolean attributes');
  cell.set({label:false,enabled:false});
  assert(text.textContent===''&&text.firstChild===textNode,'False text normalization or text identity');
  assert(element.getAttribute('aria-checked')==='false'&&!element.hasAttribute('data-flag'),'Boolean attribute normalization');
  cell.set({label:null,enabled:true});assert(text.textContent==='','Null text normalization');
  cell.set({label:'updated',enabled:true});assert(text.textContent==='updated','Fine binding update');
  pairReads=[0,0];revision.set(1);
  if((Pair as any).__prototypeFinePlan)assert(pairReads[0]===1&&pairReads[1]===0,'Independent input cells changed: '+JSON.stringify(pairReads));
  assert(host.querySelector('[data-compiled="b"]')!.textContent==='B','Unrelated input changed');
  (host.querySelector('[data-compiled="event"]') as HTMLElement).click();assert(clicks===1,'Unsupported event component lost its fallback');
  assert(!(Event as any).__prototypeFinePlan,'Event component should not compile');
  for(const [i,target] of targets.entries()){
    const resolved=ɵresolveCraftReplayTarget(target);assert(resolved.status==='resolved'&&resolved.element===[element,text][i],'Wrong replay target');
  }
  assert(owners.length===1&&identities.every(p=>p.includes('GeneratedContractValue')),'Binding owner or identity changed');
  if((Value as any).__prototypeFinePlan){
    throwOnDestroy=true;let caught;try{owners[0].destroy();}catch(error){caught=error;}
    assert(caught===failure&&disposed===1,'Direct owner destruction or cleanup error changed');
    assert(ɵresolveCraftReplayTarget(targets[0]).status==='missing','Destroyed owner replay target leaked');
  }
  app.destroy();assert(disposed===1&&registry.activeEffects().length===0,'Cleanup or reports leaked');host.remove();
  const SecondRoot=craftComponent('CreationSecondRoot',{},()=>Value({value:function*(){
    assert(ɵinject(ɵElementRef).nativeElement.id==='second-parent','Cached parent leaked');return {label:'second',enabled:true};
  }}));
  const secondHost=document.createElement('div');secondHost.id='second-parent';document.body.appendChild(secondHost);
  const second=bootstrapCraft({host:secondHost,mode:'production',config:craftAppConfig({providers:[provideCraftRootComponent(SecondRoot)]})});
  const secondScope=secondHost.querySelector('[data-compiled="value"]')!.getAttribute('data-craft-root')!;
  assert(secondScope.includes('CreationSecondRoot')&&!secondScope.includes('CreationPlanContractsRoot'),'Cached CSS parent scope leaked');
  second.destroy();secondHost.remove();
  // An observer forces the original template/factory path instead of bypassing it.
  const observed:Function[]=[];
  const ObserverRoot=craftComponent('CreationObserverRoot',{},()=>Value({value:function*(){return {label:'observed',enabled:true};}}));
  const h2=document.createElement('div');document.body.appendChild(h2);
  const app2=bootstrapCraft({host:h2,mode:'production',config:craftAppConfig({providers:[provideFnWrapObserver(fn=>observed.push(fn)),provideCraftRootComponent(ObserverRoot)]})});
  assert(h2.textContent==='observed','Observer fallback rendered incorrectly');
  const plan=(Value as any).__prototypeFinePlan;if(plan)assert(observed.includes(plan.template),'Compiled template bypassed a factory observer');
  app2.destroy();h2.remove();
  const readEvents:string[]=[],observedValue=createYieldableReactiveValue(craftSignal({label:'read-observed',enabled:true}),'ObservedCompiledInput');
  const ReadRoot=craftComponent('CreationReadObserverRoot',{},()=>Value({value:function*(){return yield* observedValue();}}));
  const readHost=document.createElement('div');document.body.appendChild(readHost);
  const readApp=bootstrapCraft({host:readHost,mode:'production',config:craftAppConfig({providers:[provideReactiveReadObserver(e=>readEvents.push(e.dependency.name)),provideCraftRootComponent(ReadRoot)]})});
  const readRegistry=readApp.injector.run(()=>craftUse(AppSnapshotRegistry()));
  assert(readHost.textContent==='read-observed'&&readEvents.includes('ObservedCompiledInput'),'Read observer lost events');
  assert(!readRegistry.activeEffects().some(e=>e.source.startsWith('effect:compiled:')),'Read observer should select the generic path');
  readApp.destroy();assert(readRegistry.activeEffects().length===0,'Observer fallback cleanup');readHost.remove();
  // A trace may replace a template. Generated creation must then fall back.
  const TraceRoot=craftComponent('CreationTraceRoot',{},()=>Value({value:function*(){return {label:'ordinary',enabled:true};}}));
  const h3=document.createElement('div');document.body.appendChild(h3);
  const app3=bootstrapCraft({host:h3,mode:'development',config:craftAppConfig({providers:[provideTemplateTrace((context,next)=>context.componentName==='GeneratedContractValue'?span('replacement'):next()),provideCraftRootComponent(TraceRoot)]})});
  assert(h3.textContent==='replacement','Compiled template bypassed template replacement');app3.destroy();h3.remove();
  return {targets,version:plan?.version??(plan?1:0),bindings:plan?.bindings.length??0,pairReads,checks:20};
}
