// PROTOTYPE — all edits, generated companions and manifests live in scratch.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lowerSyncSource } from './sync-lowering.compiler.mjs';
const app=dirname(fileURLToPath(import.meta.url));
export async function applySyncLoweringPrototype({paths,patch,scratch}){
  await writeFile(join(scratch,'libs/core/src/lib/sync-lowering.registry.ts'),await readFile(join(app,'prototype-runtime/sync-lowering.registry.ts.txt'),'utf8'));
  const generatorPath=join(scratch,paths.generator);
  await writeFile(generatorPath,(await readFile(generatorPath,'utf8'))+'\n'+await readFile(join(app,'prototype-runtime/sync-lowering.runtime.ts.txt'),'utf8'));
  await patch(paths.generator,'  const result = wrappedFactory.apply(thisArg, args);',`  const direct=prototypeGetSync(wrappedFactory);
  if(direct)return craftInjector.run(()=>prototypeRunSync(direct,thisArg,args,{
    injector,hostScope:'function',invalidYieldErrorMessage,multipleAppStartErrorMessage,
    onAppStartNotSupportedErrorMessage,onServiceResolved,
  })) as ResolveGeneratorResult<Result>;
  const result = wrappedFactory.apply(thisArg, args);`);
  await writeFile(join(scratch,paths.coreIndex),(await readFile(join(scratch,paths.coreIndex),'utf8'))+"\nexport {prototypeRegisterSync,prototypeAliasSync,prototypeDelegateCall,prototypeDelegateValue,prototypeYieldService,prototypeYieldDependency,prototypeYieldReactive} from './lib/sync-lowering.registry';\n");
  const usePath=join(scratch,paths.use);
  await writeFile(usePath,(await readFile(usePath,'utf8'))+`
import {prototypeGetSync,prototypeRunSync} from './craft-generator-runtime';
export function prototypeUseCall(factory:Function,thisArg:unknown,args:readonly unknown[]):any {
  const direct=prototypeGetSync(factory);
  if(!direct)return craftUse(Reflect.apply(factory,thisArg,args));
  let injector:Injector|undefined;
  try{injector=inject(Injector);}catch{injector=undefined;}
  const runtimeInjector=injector??Injector.create({providers:[]});
  const drive=()=>prototypeRunSync(direct,thisArg,args,{
    injector:runtimeInjector,hostScope:'function',invalidYieldErrorMessage:INVALID_YIELD_ERROR_MESSAGE,
    multipleAppStartErrorMessage:ON_APP_START_ERROR_MESSAGE,onAppStartNotSupportedErrorMessage:ON_APP_START_ERROR_MESSAGE,
    guardAwaitNotSupportedErrorMessage:GUARD_AWAIT_ERROR_MESSAGE,
  });
  return injector?runInInjectionContext(injector,drive):drive();
}
`);
  const manifest=[];
  for(const path of [paths.main,paths.coarse,paths.fanout,paths.render,paths.service,paths.reactive,paths.snapshot,'apps/framework-benchmark/src/craft/sync-lowering.contracts.prototype.ts']){
    const isCore=path.startsWith('libs/core/');
    const result=lowerSyncSource(await readFile(join(scratch,path),'utf8'),path,{
      intrinsics:path===paths.service||path===paths.reactive,
      runtimeImport:isCore?'./sync-lowering.registry':'@craft-ts/core',
      useImport:isCore?'./craft-use':'@craft-ts/core',
    });
    await writeFile(join(scratch,path),result.source);manifest.push({path,...result.stats});
  }
  await writeFile(join(scratch,'apps/framework-benchmark/src/craft/sync-lowering.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
