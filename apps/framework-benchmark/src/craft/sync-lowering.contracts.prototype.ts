// PROTOTYPE — differential scenarios outside every timing window.
import {craftService,craftSignal,craftUse,createCraftInjector,ɵcreateEnvironmentInjector,
  createYieldableReactiveValue,provideReactiveReadObserver,provideServiceYieldWrapper,
  provideFnWrapper,executeGeneratorCompatibleFactory,AppSnapshotRegistry,state} from '@craft-ts/core';
const originalUse=craftUse;
export function runSyncLoweringContracts(){
  const assert=(ok:unknown,msg:string)=>{if(!ok)throw Error(msg);};
  const results:any[]=[];
  for(const compiled of [false,true]){
    const cell=craftSignal(2),trace:string[]=[],edges:any[]=[],resolved:unknown[]=[];
    const {CompilerDependency,provideCompilerDependency}=craftService(
      {name:'CompilerDependency',providedIn:'toProvide'},function*(){yield* state('value',2);});
    const {CompilerExposed,provideCompilerExposed}=craftService(
      {name:'CompilerExposed',providedIn:'toProvide'},function*(){yield* state('answer',42);});
    const bare=createCraftInjector([]);
    const owner=ɵcreateEnvironmentInjector([
      provideCompilerDependency(),provideCompilerExposed(),
      provideReactiveReadObserver(e=>edges.push(e.dependency)),
      provideServiceYieldWrapper('prototype',function*(context,next){trace.push('enter:'+context.name);const value=yield* next();trace.push('exit:'+context.name);return value;}),
    ],bare);
    const reader=createYieldableReactiveValue(cell,'CompilerField');
    const program=function*(offset:number){
      const dependency=yield* CompilerDependency();
      const value=yield* reader();
      return value+offset+(dependency?0:1000);
    };
    const run=(offset:number)=>owner.run(()=>compiled?craftUse(program(offset)):originalUse(program(offset)));
    const initial=run(3);cell.set(5);const updated=run(3);
    assert(initial===5&&updated===8,'Wrong compiled values');
    assert(edges.length===2&&edges.every(e=>e.name==='CompilerField'),'Reactive read observer lost');
    const host=owner.run(()=>executeGeneratorCompatibleFactory({factory:program,thisArg:undefined,args:[1],getInjector:()=>owner,
      invalidYieldErrorMessage:'contract invalid yield',multipleAppStartErrorMessage:'contract app start',onServiceResolved:v=>resolved.push(v)}));
    assert(host===6&&resolved.length===1,'Service resolution callback lost');
    const exposed=owner.run(()=>compiled?craftUse(CompilerExposed()):originalUse(CompilerExposed()));
    const answer=owner.run(()=>originalUse(exposed.answer()));assert(answer===42,'Named primitive exposure lost');
    trace.length=0;
    const object={get method(){trace.push('getter');return function*(this:{base:number},n:number){trace.push('body');return this.base+n;};},base:7};
    const receiver=()=>{trace.push('receiver');return object;};
    const arg=()=>{trace.push('argument');return 4;};
    const ordered=function*(){return yield* receiver().method(arg());};
    const orderValue=owner.run(()=>compiled?craftUse(ordered()):originalUse(ordered()));
    assert(orderValue===11&&trace.join(',')==='receiver,getter,argument,body','Evaluation order or receiver changed');
    const fallback=function*(){try{return yield 'unsupported';}finally{trace.push('finally');}};
    let error='';try{owner.run(()=>compiled?craftUse(fallback()):originalUse(fallback()));}catch(e){error=(e as Error).message;}
    assert(error.includes('can only yield'),'Unknown yield did not retain the native error');
    assert(!trace.includes('finally'),'The compiler changed error injection / finally semantics');
    const registry=owner.run(()=>originalUse(AppSnapshotRegistry()));
    owner.destroy();assert(registry.activeEffects().length===0,'Owner cleanup leaked effects');bare.destroy();
    results.push({compiled,initial,updated,host,answer,edges:edges.map(e=>e.name),resolved:resolved.length,orderValue,trace:[...trace],error});
  }
  const [native,direct]=results;
  assert(JSON.stringify({...native,compiled:null})===JSON.stringify({...direct,compiled:null}),'Native and compiled scenarios diverged');
  const bare=createCraftInjector([]),events:string[]=[];
  const wrapped=ɵcreateEnvironmentInjector([provideFnWrapper('prototype',function*(factory,thisArg,args){events.push('wrapper');return yield* factory.apply(thisArg,args);})],bare);
  const simple=function*(){return 19;};
  const value=wrapped.run(()=>executeGeneratorCompatibleFactory({factory:simple,thisArg:undefined,args:[],getInjector:()=>wrapped,invalidYieldErrorMessage:'invalid',multipleAppStartErrorMessage:'app start'}));
  assert(value===19&&events.join(',')==='wrapper','Factory wrapper was bypassed');wrapped.destroy();bare.destroy();
  return {results,wrapper:value,checks:12};
}
export function measureSyncLowering(iterations=10000,rounds=9){
  const samples:any[]=[];
  for(const middleware of [false,true]){
    const cell=craftSignal(3),reader=createYieldableReactiveValue(cell,'MicroField');let wrappers=0;
    const {MicroDependency,provideMicroDependency}=craftService({name:'MicroDependency',providedIn:'toProvide'},function*(){yield* state('value',1);});
    const bare=createCraftInjector([]),owner=ɵcreateEnvironmentInjector([
      provideMicroDependency(),...(middleware?[provideServiceYieldWrapper('prototype microbenchmark',function*(context,next){wrappers++;return yield* next();})]:[]),
    ],bare);
    const program=function*(offset:number){const dependency=yield* MicroDependency();return (yield* reader())+offset+(dependency?0:1000);};
    const execute=(direct:boolean,n:number)=>{
      let sum=0;
      owner.run(()=>{for(let i=0;i<n;i++)sum+=direct?craftUse(program(i%8)):originalUse(program(i%8));});
      return sum;
    };
    execute(false,2000);execute(true,2000);
    for(let round=0;round<rounds;round++)for(const direct of round%2?[true,false]:[false,true]){
      wrappers=0;const before=performance.now(),sum=execute(direct,iterations),ms=performance.now()-before;
      const expected=Array.from({length:iterations},(_,i)=>3+i%8).reduce((a,b)=>a+b,0);
      if(sum!==expected||wrappers!==(middleware?iterations:0))throw Error('Microbenchmark value or middleware changed');
      samples.push({middleware,direct,round,iterations,ms,sum,wrappers});
    }
    owner.destroy();bare.destroy();
  }
  return samples;
}
