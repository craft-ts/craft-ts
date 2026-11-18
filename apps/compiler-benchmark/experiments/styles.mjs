import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareCandidate, replaceOnce, lab, workspace } from './prepare.mjs';
import { guardInitialBindings } from './render-initial-guard.mjs';
import {
  trackedStyleCompiler,
  trackedStyleTemplate,
  trackedStyleRenderer,
} from './tracked-style-holes.mjs';
export function styleCompiler(source, direct, tracked = false) {
  source = replaceOnce(
    source,
    '    const rootCount = tree(root, undefined, []);',
    `    const rootCount = tree(root, undefined, []);
    if(hasStyles){
      const order=bindings.map((binding,index)=>({binding,index})).sort((a,b)=>a.binding.slot-b.binding.slot||priority(a.binding.key)-priority(b.binding.key));
      function priority(key: string|undefined){return key==='style'?2:key==='class'?1:0;}
      const nextReaders=order.map(entry=>readers[entry.index]),nextPositions=order.map(entry=>readerPositions[entry.index]);
      bindings.splice(0,bindings.length,...order.map(entry=>entry.binding));readers.splice(0,readers.length,...nextReaders);readerPositions.splice(0,readerPositions.length,...nextPositions);
    }`,
  );
  source = replaceOnce(
    source,
    '    function tree(\n',
    `    let hasStyles=false;
    function directStyle(n: ts.Expression): boolean {
      n=unwrap(n);return (ts.isArrowFunction(n)||ts.isFunctionExpression(n))&&!n.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.AsyncKeyword);
    }
    function styleOf(call: ts.CallExpression): {value?:ts.Expression}|undefined {
      const helper=helpers.get((call.expression as ts.Identifier).text),args=[...call.arguments];
      if(helper==='h')args.shift();
      else if(args.length>=2&&ts.isStringLiteral(args[0])&&(ts.isObjectLiteralExpression(unwrap(args[1]))||args[1].kind===ts.SyntaxKind.NullKeyword))args.shift();
      const props=args[0]&&unwrap(args[0]);if(!props||!ts.isObjectLiteralExpression(props))return undefined;
      const property=props.properties.find(prop=>prop.name&&(ts.isIdentifier(prop.name)||ts.isStringLiteral(prop.name))&&prop.name.text==='style');
      return property?{value:ts.isPropertyAssignment(property)?property.initializer:undefined}:undefined;
    }
    function tree(
`,
  );
  source = replaceOnce(
    source,
    '      if (!isTag && !isText && parent !== undefined && options.lean) {',
    `      const style=isTag&&ts.isCallExpression(n)?styleOf(n):undefined;
      const styleIsland=${direct ? '!!style&&!(style.value&&directStyle(style.value))' : '!!style'};
      if (((!isTag && !isText)||styleIsland) && parent !== undefined && options.lean) {`,
  );
  source = replaceOnce(
    source,
    '          propertyKeys.add(key);\n          if (',
    `          propertyKeys.add(key);
          ${
            direct
              ? `if(options.lean&&key==='style'&&directStyle(prop.initializer)){
            hasStyles=true;binding(prop.initializer,slot,path,key);continue;
          }`
              : ''
          }
          if (`,
  );
  source = replaceOnce(
    source,
    'options.lean && options.lower !== false && ts.isFunctionExpression(n)',
    "options.lean && key !== 'style' && options.lower !== false && ts.isFunctionExpression(n)",
  );
  source = replaceOnce(
    source,
    'version: ${watchBind ? 2 : 1}',
    'version: ${hasStyles ? 3 : watchBind ? 2 : 1}',
  );
  return tracked ? trackedStyleCompiler(source) : source;
}
export function styleTemplate(source, tracked = false) {
  source = replaceOnce(
    source,
    'readonly version: 1 | 2;',
    'readonly version: 1 | 2 | 3;',
  );
  source = replaceOnce(
    source,
    'plan.version === 1 || plan.version === 2',
    'plan.version === 1 || plan.version === 2 || plan.version === 3',
  );
  return tracked ? trackedStyleTemplate(source) : source;
}
export function styleRenderer(source, tracked = false) {
  source = replaceOnce(
    source,
    '    plan.watchBind ||\n    plan.events?.length ||',
    '    plan.watchBind ||\n    plan.version === 3 ||\n    plan.events?.length ||',
  );
  const anchor = '          const key = binding.key;';
  assert.equal(source.split(anchor).length, 3);
  source = source.replaceAll(
    anchor,
    anchor +
      `
          if(key==='style'){
            const stop=compiledStyleBinding(reader,target as Element,context);
            if(stop)this.stops!.push(stop);continue;
          }`,
  );
  source = replaceOnce(
    source,
    'class LeanComponentRenderedNode implements RenderedNode {',
    `function compiledStyleBinding(reader: unknown,element: Element,context: RenderContext): (()=>void)|undefined {
  let seen=false,previous:unknown,initial=true,failed=false,failure:unknown;
  const run=()=>context.injector.run(()=>{
    const value=resolveStyleBindingValue(reader,context);
    if(seen&&sameStyleValue(previous,value))return;
    context.renderer.removeAttribute(element,'style');
    applyStyles(context.renderer,element,undefined,value,context);
    previous=value;seen=true;
  });
  const stop=ɵcraftBindingEffect(()=>{
    if(!initial){run();return;}
    try{run();}catch(error){failed=true;failure=error;}
  });
  initial=false;
  if(failed){try{stop?.();}catch{/* Preserve the style failure. */}throw failure;}
  return stop;
}
class LeanComponentRenderedNode implements RenderedNode {`,
  );
  return tracked ? trackedStyleRenderer(source) : source;
}
if (process.argv[1] === import.meta.filename) {
  const foundation = '2ee9bb74a';
  const committed = (file) =>
    execFileSync('git', ['show', foundation + ':' + file], {
      cwd: workspace,
      encoding: 'utf8',
    });
  const sourceFor = (id, file) => {
    const source = committed(file),
      tracked = id.startsWith('style-final');
    if (id === 'style-reference') return source;
    if (id === 'style-cleanup')
      return file.endsWith('/interpreter.ts')
        ? guardInitialBindings(source)
        : source;
    if (file.endsWith('/compiler.ts'))
      return styleCompiler(
        source,
        id !== 'style-islands' && id !== 'style-final-islands',
        tracked,
      );
    if (id === 'style-islands' || id === 'style-legacy-runtime') return source;
    if (id === 'style-final-legacy')
      return file.endsWith('/interpreter.ts')
        ? guardInitialBindings(source)
        : source;
    if (file.endsWith('/compiled-template.ts'))
      return styleTemplate(source, tracked);
    if (file.endsWith('/interpreter.ts'))
      return styleRenderer(
        tracked ? guardInitialBindings(source) : source,
        tracked,
      );
    return source;
  };
  for (const id of [
    'style-reference',
    'style-islands',
    'style-bindings',
    'style-no-lists',
    'style-legacy-runtime',
    'style-cleanup',
    'style-final',
    'style-final-islands',
    'style-final-no-lists',
    'style-final-legacy',
  ]) {
    const root = join(lab, 'roots', id);
    try {
      await access(join(root, 'candidate.json'));
      if (process.argv.includes('--refresh')) {
        const path = join(root, 'candidate.json'),
          candidate = JSON.parse(await readFile(path, 'utf8'));
        for (const change of candidate.changes) {
          const current = await readFile(join(root, change.file), 'utf8');
          assert.equal(
            createHash('sha256').update(current).digest('hex'),
            change.afterSha256,
            'Unrecorded edits: ' + change.file,
          );
          change.after = sourceFor(id, change.file);
          change.afterSha256 = createHash('sha256')
            .update(change.after)
            .digest('hex');
          await writeFile(join(root, change.file), change.after);
        }
        await writeFile(path, JSON.stringify(candidate, null, 2) + '\n');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await prepareCandidate(
        id,
        [
          'libs/compiler/src/compiler.ts',
          'libs/compiler/src/vite.ts',
          'libs/component/src/lib/render/compiled-template.ts',
          'libs/component/src/lib/render/interpreter.ts',
          'libs/core/src/lib/craft-service.ts',
        ].map((file) => ({
          file,
          change: () => sourceFor(id, file),
        })),
      );
    }
    await writeFile(
      join(root, 'libs/compiler/src/import-graph.ts'),
      committed('libs/compiler/src/import-graph.ts'),
    );
    if (id === 'style-cleanup' || id.startsWith('style-final'))
      await writeFile(
        join(
          root,
          'libs/component/src/lib/render/initial-binding-error.spec.ts',
        ),
        await readFile(
          join(
            workspace,
            'libs/component/src/lib/render/initial-binding-error.spec.ts',
          ),
          'utf8',
        ),
      );
    for (const file of execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', foundation, 'libs/compiler/src'],
      { cwd: workspace, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter((file) => file.endsWith('.spec.ts')))
      await writeFile(join(root, file), committed(file));
    try {
      await writeFile(
        join(root, 'libs/compiler/src/styles.spec.ts'),
        await readFile(new URL('styles.contracts.ts', import.meta.url), 'utf8'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    console.log(root);
  }
}
