import { execFileSync } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareCandidate, replaceOnce, lab, workspace } from './prepare.mjs';
const foundation = 'b6cc4a594';
const committed = (file) =>
  execFileSync('git', ['show', foundation + ':' + file], {
    cwd: workspace,
    encoding: 'utf8',
  });
const compiler = (source) => {
  source =
    "import {bindingInputDependencies} from './incremental-dependencies.js';\n" +
    source;
  source = replaceOnce(
    source,
    '      input?: string;',
    '      input?: string;\n      rebindInputs?: string[];\n      stableRebind?:boolean;',
  );
  source = replaceOnce(
    source,
    '      const indirect =',
    '      const rebindInputs=options.lean?bindingInputDependencies(n,fn.parameters[0]?.name,checker):undefined;\n      const indirect =',
  );
  source = replaceOnce(
    source,
    '        bindings.push({ slot, path, key });',
    '        bindings.push({ slot, path, key, ...(rebindInputs ? {rebindInputs:rebindInputs.inputs,stableRebind:rebindInputs.stable} : {}) });',
  );
  source = replaceOnce(
    source,
    '        ...(plain !== undefined ? { lowered: true } : {}),',
    '        ...(plain !== undefined ? { lowered: true } : {}),\n        ...(rebindInputs ? {rebindInputs:rebindInputs.inputs,stableRebind:rebindInputs.stable} : {}),',
  );
  return replaceOnce(
    source,
    "    return `{ version: 1, ${options.lean ? 'lean: true, ' : ''}",
    `    const incremental=options.lean&&setup.length===0&&eventPlans.length===0&&holePlans.length===0&&bindings.every(binding=>binding.rebindInputs!==undefined)&&new Set(bindings.flatMap(binding=>binding.rebindInputs!)).size>1;
    return \`{ version: 1, \${incremental ? 'incremental: true, ' : ''}\${options.lean ? 'lean: true, ' : ''}`,
  );
};
const renderer = (source) => {
  source = replaceOnce(
    source,
    'class LeanComponentRenderedNode implements RenderedNode {',
    'const incrementalProps = new WeakSet<object>();\n\nclass LeanComponentRenderedNode implements RenderedNode {\n  declare private incrementalInputs?: Record<string,unknown>;',
  );
  source = replaceOnce(
    source,
    '    return invokeChildrenCallback(this.context, this.node.itemTemplate, [\n      itemInput,\n      entry.indexReader,\n    ]);',
    `    const result=invokeChildrenCallback(this.context, this.node.itemTemplate, [itemInput,entry.indexReader]);
    const component=compiledItemComponent(this.node.itemTemplate);
    if(component&&compiledTemplateFor(component)?.incremental)incrementalProps.add((result as Extract<CraftNode,{kind:'component'}>).props);
    return result;`,
  );
  const start = source.indexOf('class LeanComponentRenderedNode');
  let tail = source.slice(start);
  tail = replaceOnce(
    tail,
    '      this.bind(inputs);',
    '      if(plan.incremental&&incrementalProps.has(node.props))this.incrementalInputs=inputs;\n      this.bind(inputs);',
  );
  tail = replaceOnce(
    tail,
    '  private bind(inputs: Record<string, unknown>): void {',
    '  private bind(inputs: Record<string, unknown>, changed?: Set<string>): void {',
  );
  tail = replaceOnce(
    tail,
    '        const stops: (() => void)[] = (this.stops = []);',
    '        const stops = (this.stops ??= []);',
  );
  tail = replaceOnce(
    tail,
    '          const binding = bindings[index];',
    `          const binding = bindings[index];
          if(changed&&binding.stableRebind&&binding.rebindInputs!.every(key=>Object.hasOwn(inputs,key)&&!changed.has(key)))continue;
          if(changed)stops[index]?.();`,
  );
  tail = replaceOnce(
    tail,
    '          if (stop) stops.push(stop);',
    '          if(this.incrementalInputs)stops[index]=stop;\n          else if (stop) stops.push(stop);',
  );
  tail = replaceOnce(
    tail,
    '  private stops: (() => void)[] | undefined;',
    '  private stops: ((() => void)|undefined)[] | undefined;',
  );
  tail = replaceOnce(
    tail,
    '    this.stopBindings();\n    this.props = next;',
    `    const stable=this.incrementalInputs;
    if(stable&&incrementalProps.has(next)){
      const changed=new Set<string>();
      for(const key of new Set([...Object.keys(previous),...Object.keys(next)]))if(!Object.is(previous[key],next[key]))changed.add(key);
      for(const key of Object.keys(stable))if(!Object.hasOwn(inputs,key))delete stable[key];
      Object.assign(stable,inputs);
      this.props=next;
      this.bind(stable,changed);
      return true;
    }
    this.stopBindings();
    this.incrementalInputs=undefined;
    this.props = next;`,
  );
  tail = replaceOnce(
    tail,
    '        stops[index]();',
    '        stops[index]?.();',
  );
  tail = replaceOnce(
    tail,
    '    this.nodes = undefined;',
    '    this.nodes = undefined;\n    this.incrementalInputs=undefined;',
  );
  return source.slice(0, start) + tail;
};
for (const id of ['incremental-rebind-reference', 'incremental-rebind']) {
  const root = join(lab, 'roots', id),
    enabled = id === 'incremental-rebind';
  try {
    await access(join(root, 'candidate.json'));
  } catch {
    await prepareCandidate(id, [
      {
        file: 'libs/compiler/src/compiler.ts',
        change: () =>
          enabled
            ? compiler(committed('libs/compiler/src/compiler.ts'))
            : committed('libs/compiler/src/compiler.ts'),
      },
      {
        file: 'libs/compiler/src/vite.ts',
        change: () => committed('libs/compiler/src/vite.ts'),
      },
      {
        file: 'libs/component/src/lib/render/compiled-template.ts',
        change: () => {
          let source = committed(
            'libs/component/src/lib/render/compiled-template.ts',
          );
          if (enabled) {
            source = replaceOnce(
              source,
              '  readonly lean?: boolean;',
              '  readonly lean?: boolean;\n  readonly incremental?: boolean;',
            );
            source = replaceOnce(
              source,
              '    readonly input?: string;',
              '    readonly input?: string;\n    readonly rebindInputs?: readonly string[];\n    readonly stableRebind?:boolean;',
            );
          }
          return source;
        },
      },
      ...(enabled
        ? [
            {
              file: 'libs/component/src/lib/render/interpreter.ts',
              change: renderer,
            },
          ]
        : []),
    ]);
  }
  for (const file of [
    'libs/compiler/src/import-graph.ts',
    'libs/compiler/src/imported-lists.spec.ts',
    'libs/compiler/src/local-lists.spec.ts',
  ])
    await writeFile(join(root, file), committed(file));
  if (enabled) {
    await writeFile(
      join(root, 'libs/compiler/src/incremental-dependencies.ts'),
      await readFile(new URL('./incremental-dependencies.ts', import.meta.url)),
    );
    await writeFile(
      join(root, 'libs/compiler/src/incremental-rebind.spec.ts'),
      await readFile(
        new URL('./incremental-rebind.contracts.ts', import.meta.url),
      ),
    );
  }
  console.log(root);
}
