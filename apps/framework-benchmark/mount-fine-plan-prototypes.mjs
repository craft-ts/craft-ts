// PROTOTYPE transforms for a reusable creation plan with fine reactive bindings.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBindingManagerPrototype } from './mount-binding-manager-prototypes.mjs';
const here = dirname(fileURLToPath(import.meta.url));
export async function applyFinePlanPrototype(name, { paths, patch, scratch }) {
  const append = async (path, file) =>
    writeFile(
      join(scratch, path),
      (await readFile(join(scratch, path), 'utf8')) +
        '\n' +
        (await readFile(join(here, 'prototype-runtime', file), 'utf8')),
    );
  await append(paths.effect, 'fine-binding-factory.ts.txt');
  await append(paths.render, 'fine-planned-component.ts.txt');
  await patch(
    paths.render,
    "    case 'component':\n      if (prototypeCanPlanComponent",
    "    case 'component':\n      if (prototypeCanFinePlan(node,context,parent)) return new PrototypeFinePlannedComponent(node,parent,before,context);\n      if (!(node.component as any).__prototypeFinePlan && prototypeCanPlanComponent",
  );
  await patch(
    paths.render,
    `  return untracked(() =>
    runInInjectionContext(injector, () =>
      prototypeCreateEffectRef(name, effectFn, { manualCleanup: true }),
    ),
  );`,
    `  const factory=prototypeFineEffectFactories.get(injector);
  if(factory)return untracked(()=>runInInjectionContext(injector,()=>factory(name,effectFn)));
  return untracked(() =>runInInjectionContext(injector,()=>prototypeCreateEffectRef(name,effectFn,{manualCleanup:true})));`,
  );
  const shared = name !== 'direct',
    grouped = ['grouped', 'records', 'manager', 'watch'].includes(name);
  if (['records', 'manager'].includes(name))
    await applyBindingManagerPrototype(name, { paths, patch, scratch });
  if (name === 'watch') {
    await patch(paths.effect, '/** PROTOTYPE: fixed-owner plain renderer bindings.',
      "import {craftWatch as prototypePlainWatch} from './host/craft-signal';\n/** PROTOTYPE: fixed-owner plain renderer bindings.");
    await patch(paths.effect, 'const native=effect(body,{injector:ownerInjector,manualCleanup:true});',
      'const native=prototypePlainWatch(()=>{body();},{manualCleanup:true});');
  }
  const path = join(scratch, paths.coarse);
  await writeFile(
    path,
    (await readFile(path, 'utf8')) +
      `\nimport {rowFinePlan} from './fine-plan.prototype';\nconst prototypeRowPlan=rowFinePlan(settings.indexes,${shared},${grouped});
Object.defineProperty(RowByComponentPrototype,'__prototypeFinePlan',{value:prototypeRowPlan});
(globalThis as any).__finePlanExpectedPerRow=prototypeRowPlan.bindings.length;\n`,
  );
}
