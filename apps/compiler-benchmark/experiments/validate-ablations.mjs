import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { workspace, lab } from './prepare.mjs';
const results = [];
const source = `import {craftComponent,div,button,forNode} from '@craft-ts/component';
export const Event=craftComponent('Event',{},()=>button({click(){}},'go'));
export const Hole=craftComponent('Hole',{},()=>div(forNode([],{track:x=>x},x=>div('child'))));
export const Reader=craftComponent('Reader',{},()=>div(function*(){return yield* Theme.dark();}));`;
const modules = {};
for (const id of [
  'ablation-full',
  'ablation-events',
  'ablation-holes',
  'ablation-lower',
  'ablation-services',
  'ablation-list-entries',
  'ablation-clone',
]) {
  const root = join(lab, 'roots', id);
  const check = spawnSync(
    join(workspace, 'node_modules/.bin/tsc'),
    ['-p', join(root, 'libs/compiler/tsconfig.lib.json')],
    { cwd: workspace, encoding: 'utf8' },
  );
  assert.equal(check.status, 0, check.stdout + '\n' + check.stderr);
  modules[id] = await import(
    pathToFileURL(join(root, 'dist/libs/compiler/src/compiler.js'))
  );
  const options = {
    lean: true,
    ...(id === 'ablation-lower' ? { lower: false } : {}),
    ...(id === 'ablation-services' ? { directServices: false } : {}),
    ...(id === 'ablation-clone' ? { dom: 'clone' } : {}),
  };
  const compiled = modules[id].compileModule(
    source,
    'ablation-fixture.ts',
    options,
  );
  const event = compiled.components.find((c) => c.component === 'Event');
  const hole = compiled.components.find((c) => c.component === 'Hole');
  assert.equal(
    event.status,
    id === 'ablation-events' ? 'fallback' : 'compiled',
  );
  assert.equal(hole.status, id === 'ablation-holes' ? 'fallback' : 'compiled');
  if (id === 'ablation-lower')
    assert(!compiled.code.includes('ɵys') && !compiled.code.includes('ɵy as'));
  else if (id === 'ablation-services')
    assert(compiled.code.includes('ɵy as') && !compiled.code.includes('ɵys'));
  else assert(compiled.code.includes('ɵys'));
  assert.equal(compiled.code.includes('locate:'), id === 'ablation-clone');
  results.push({
    id,
    options,
    source,
    generated: compiled.code,
    components: compiled.components,
    typecheck: {
      exitCode: check.status,
      stdout: check.stdout,
      stderr: check.stderr,
    },
    passed: true,
  });
}
await writeFile(
  join(lab, 'tests/compiler-ablations.json'),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  'Seven compiler pass-control contracts and compiler typechecks passed.',
);
