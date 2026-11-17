import { execFileSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareCandidate, replaceOnce, lab, workspace } from './prepare.mjs';
const foundation = '70a51b49e';
const committed = (file) =>
  execFileSync('git', ['show', foundation + ':' + file], {
    cwd: workspace,
    encoding: 'utf8',
  });
function compiler(source) {
  source = replaceOnce(
    source,
    '      input?: string;',
    '      input?: string;\n      fusionInput?: string;',
  );
  source = replaceOnce(
    source,
    '      const indirect =',
    `      let fusionInput: string|undefined;
      if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text===input)fusionInput=n.name.text;
      else if(ts.isFunctionExpression(n)&&n.asteriskToken&&n.parameters.length===0&&n.body.statements.length===1){
        const statement=n.body.statements[0];
        const value=ts.isReturnStatement(statement)&&statement.expression;
        const call=value&&ts.isYieldExpression(value)&&value.asteriskToken&&value.expression;
        if(call&&ts.isCallExpression(call)&&call.arguments.length===0&&ts.isPropertyAccessExpression(call.expression)&&ts.isIdentifier(call.expression.expression)&&call.expression.expression.text===input)fusionInput=call.expression.name.text;
      }
      if(key!==undefined&&!key.startsWith('data-')&&!key.startsWith('aria-'))fusionInput=undefined;
      const indirect =`,
  );
  source = replaceOnce(
    source,
    '        bindings.push({ slot, path, key });',
    '        bindings.push({ slot, path, key, ...(fusionInput?{fusionInput}:{}) });',
  );
  source = replaceOnce(
    source,
    '        ...(plain !== undefined ? { lowered: true } : {}),',
    '        ...(plain !== undefined ? { lowered: true } : {}),\n        ...(fusionInput?{fusionInput}:{}),',
  );
  return replaceOnce(
    source,
    "    return `{ version: 1, ${options.lean ? 'lean: true, ' : ''}",
    `    const scalarFusion=options.lean&&setup.length===0&&eventPlans.length===0&&holePlans.length===0&&bindings.some((binding,index)=>binding.fusionInput!==undefined&&index>0&&bindings[index-1].fusionInput===binding.fusionInput);
    return \`{ version: 1, \${scalarFusion?'scalarFusion: true, ':''}\${options.lean ? 'lean: true, ' : ''}`,
  );
}
function renderer(source, gated = false) {
  source = replaceOnce(
    source,
    'function createForIndexReader(read: () => number): InputValue<number> {\n  return ɵsettledReader(read) as InputValue<number>;\n}',
    `const fusionScalars = new WeakSet<Function>();
function createForIndexReader(read: () => number): InputValue<number> {
  const reader=ɵsettledReader(read) as InputValue<number>;
  fusionScalars.add(reader);
  return reader;
}`,
  );
  source = replaceOnce(
    source,
    '      inputs[key] = ɵsettledValueReader(value);',
    '      inputs[key] = ɵsettledValueReader(value);\n      fusionScalars.add(inputs[key] as Function);',
  );
  const start = source.indexOf('class LeanComponentRenderedNode');
  let tail = source.slice(start);
  const originalLoop = tail.slice(
    tail.indexOf(
      '        for (let index = 0; index < bindings.length; index++) {',
    ),
    tail.indexOf('        const events = plan.events;'),
  );
  tail = replaceOnce(
    tail,
    '        for (let index = 0; index < bindings.length; index++) {',
    '        const applyBinding = (index: number) => {',
  );
  tail = replaceOnce(
    tail,
    '          const stop = ɵcraftBindingEffect(() => {',
    '          return () => {',
  );
  tail = replaceOnce(
    tail,
    `          });
          if (stop) stops.push(stop);
        }
        const events = plan.events;`,
    `          };
        };
        for(let index=0;index<bindings.length;index++){
          const key=bindings[index].fusionInput;
          let end=index+1;
          if(plan.scalarFusion&&key!==undefined&&fusionScalars.has(inputs[key] as Function)){
            while(end<bindings.length&&bindings[end].fusionInput===key)end++;
          }
          let stop: (()=>void)|undefined;
          if(end>index+1){
            const group: (()=>void)[]=[];
            for(let member=index;member<end;member++)group.push(applyBinding(member));
            // Keep each read and write in source order; only the effect owner is shared.
            stop=ɵcraftBindingEffect(()=>{for(const apply of group)apply();});
            index=end-1;
          }else stop=ɵcraftBindingEffect(applyBinding(index));
          if(stop)stops.push(stop);
        }
        const events = plan.events;`,
  );
  if (gated) {
    const loopStart = tail.indexOf('        const applyBinding ='),
      loopEnd = tail.indexOf('        const events = plan.events;');
    tail =
      tail.slice(0, loopStart) +
      `        if(plan.scalarFusion&&bindings.some((binding,index)=>binding.fusionInput!==undefined&&bindings[index+1]?.fusionInput===binding.fusionInput&&fusionScalars.has(inputs[binding.fusionInput] as Function))){\n` +
      tail.slice(loopStart, loopEnd) +
      `        }else{\n` +
      originalLoop +
      `        }\n` +
      tail.slice(loopEnd);
  }
  source = source.slice(0, start) + tail;
  if (gated) {
    source = replaceOnce(
      source,
      'function createForIndexReader(read: () => number): InputValue<number> {',
      'function createForIndexReader(read: () => number, fusion=false): InputValue<number> {',
    );
    source = replaceOnce(
      source,
      '  fusionScalars.add(reader);',
      '  if(fusion)fusionScalars.add(reader);',
    );
    source = replaceOnce(
      source,
      '    const lean = createInPlace && this.leanItems();',
      '    const lean = createInPlace && this.leanItems();\n    const fusionIndex=lean&&compiledTemplateFor(compiledItemComponent(this.node.itemTemplate)!)?.scalarFusion===true;',
    );
    source = replaceOnce(
      source,
      'createForIndexReader(indexSignal);',
      'createForIndexReader(indexSignal,fusionIndex);',
    );
    source = replaceOnce(
      source,
      'function leanInputs(props: object): Record<string, unknown> | undefined {',
      'function leanInputs(props: object, fusion=false): Record<string, unknown> | undefined {',
    );
    source = replaceOnce(
      source,
      '      fusionScalars.add(inputs[key] as Function);',
      '      if(fusion)fusionScalars.add(inputs[key] as Function);',
    );
    source = replaceOnce(
      source,
      '    const inputs = leanInputs(next);',
      '    const inputs = leanInputs(next,this.plan.scalarFusion);',
    );
    source = replaceOnce(
      source,
      '        const inputs = leanInputs(node.props);',
      '        const inputs = leanInputs(node.props,compiledTemplateFor(node.component)?.scalarFusion);',
    );
  }
  return source;
}
for (const id of [
  'scalar-fusion-reference',
  'scalar-fusion',
  'scalar-fusion-gated',
]) {
  const root = join(lab, 'roots', id);
  try {
    await access(join(root, 'candidate.json'));
  } catch {
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
        change: () => {
          let source = committed(file);
          if (id !== 'scalar-fusion-reference') {
            if (file.endsWith('/compiler.ts')) source = compiler(source);
            if (file.endsWith('/interpreter.ts'))
              source = renderer(source, id === 'scalar-fusion-gated');
            if (file.endsWith('/compiled-template.ts'))
              source = replaceOnce(
                source,
                '  readonly lean?: boolean;',
                '  readonly lean?: boolean;\n  readonly scalarFusion?: boolean;',
              ).replace(
                '    readonly input?: string;',
                '    readonly input?: string;\n    readonly fusionInput?: string;',
              );
          }
          return source;
        },
      })),
    );
  }
  await writeFile(
    join(root, 'libs/compiler/src/import-graph.ts'),
    committed('libs/compiler/src/import-graph.ts'),
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
  if (id !== 'scalar-fusion-reference')
    await writeFile(
      join(root, 'libs/compiler/src/scalar-fusion.spec.ts'),
      await readFile(
        new URL('scalar-fusion.contracts.ts', import.meta.url),
        'utf8',
      ),
    );
  console.log(root);
}
