// PROTOTYPE: private graph extension in scratch copies; installed package untouched.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = dirname(fileURLToPath(import.meta.url));
export const managedKernelPath = 'libs/core/src/lib/host/managed-alien.prototype.mjs';
export async function createManagedKernel() {
  const alien = await readFile(fileURLToPath(import.meta.resolve('alien-signals')), 'utf8');
  const marker = '    notify(effect) {\n';
  assert.equal(alien.split(marker).length, 2, 'Alien notify changed');
  const flushRun = '            run(effect);';
  const flushRecover = '            effect.flags |= 2 | 8;';
  const runBody = '            e.cleanup = e.fn();';
  assert.equal(alien.split(flushRun).length, 2);
  assert.equal(alien.split(flushRecover).length, 2);
  assert.equal(alien.split(runBody).length, 2);
  return alien.replace("'./system.mjs'", "'alien-signals/system'")
    .replace(marker, marker + '        if (effect.prototypeManaged) { prototypeNotifyBinding(effect); return; }\n')
    .replace(flushRun, '            if (effect === prototypeOrderedManager) prototypeDrainOrdered(); else run(effect);')
    .replace(runBody, '            if (e.prototypeManaged !== undefined) e.fn(); else e.cleanup = e.fn();')
    .replace(flushRecover, '            if (effect === prototypeOrderedManager) prototypeCancelOrdered();\n            else if (effect === prototypeManager) prototypeCancelCoalesced();\n            else effect.flags |= 2 | 8;') + '\n' +
    await readFile(join(app, 'prototype-runtime/managed-bindings.kernel.mjs.txt'), 'utf8');
}
export async function applyBindingManagerPrototype(strategy, { scratch, paths, patch }) {
  assert(['records', 'manager'].includes(strategy));
  await writeFile(join(scratch, managedKernelPath), await createManagedKernel());
  await patch(paths.config, '    alias: {', `    alias: {\n      'alien-signals/system': resolve(workspace, 'node_modules/alien-signals/esm/system.mjs'),\n      'alien-signals': resolve(workspace, '${managedKernelPath}'),`);
  await patch(paths.effect, '/** PROTOTYPE: fixed-owner plain renderer bindings.',
    `// @ts-ignore — private export exists only in the isolated prototype kernel.\nimport {prototypeManagedBinding, prototypeBindingManagerSnapshot} from 'alien-signals';\n(globalThis as any).__bindingManagerSnapshot=prototypeBindingManagerSnapshot;\n/** PROTOTYPE: fixed-owner plain renderer bindings.`);
  await patch(paths.effect, 'const native=effect(body,{injector:ownerInjector,manualCleanup:true});',
    `const native=prototypeManagedBinding(body,${strategy === 'manager' ? "'ordered'" : 'false'});`);
  await patch(paths.effect,
    '    let destroyed=false;\n    return {destroy:()=>{if(destroyed)return;destroyed=true;runCraftCleanups([()=>unregister?.(),()=>native.destroy()]);}} as EffectRef;',
    '    native.onDispose=unregister;\n    return native as EffectRef;');
}
