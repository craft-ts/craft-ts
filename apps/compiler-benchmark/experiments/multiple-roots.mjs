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
    '    const locations: string[] = [];',
    '    const locations: string[] = [];\n    const rootSlots: number[] = [];\n    const rootArray=ts.isArrayLiteralExpression(unwrap(root));\n    const nativeRoot=ts.isCallExpression(unwrap(root))&&ts.isIdentifier((unwrap(root) as ts.CallExpression).expression)&&helpers.has(((unwrap(root) as ts.CallExpression).expression as ts.Identifier).text);\n    const rootsMode=rootArray||!nativeRoot;',
  );
  source = replaceOnce(
    source,
    '      const slot = count++;',
    '      const slot = count++;\n      if(parent===undefined)rootSlots.push(slot);',
  );
  source = replaceOnce(
    source,
    'parent === undefined ? locateRoot : previous === undefined',
    'parent === undefined ? (rootsMode?`${locateRoot}[${rootSlots.length-1}]`:locateRoot) : previous === undefined',
  );
  source = replaceOnce(
    source,
    "      if (parent === undefined) fail('requires one native element root');",
    '',
  );
  source = replaceOnce(
    source,
    `      creation.push(
        \`\${renderer}.appendChild(\${nodes}[\${parent}], \${nodes}[\${slot}]);\`,
      );
      if (constant === undefined) binding(n, slot, path);`,
    `      if(parent!==undefined)creation.push(
        \`\${renderer}.appendChild(\${nodes}[\${parent}], \${nodes}[\${slot}]);\`,
      );
      if (constant === undefined) binding(n, slot, path);`,
  );
  source = replaceOnce(
    source,
    '    const rootCount = tree(root, undefined, []);',
    '    const rootCount = tree(root, undefined, rootsMode?[0]:[]);',
  );
  source = replaceOnce(
    source,
    `    if (rootCount !== 1 || elements[0]?.slot !== 0 || elements[0].path.length)
      fail('requires one native element root');`,
    `    if(rootCount===0||rootSlots.length!==rootCount)fail('requires a nonempty fixed root range');`,
  );
  source = replaceOnce(
    source,
    "? `locate: (${locateRoot}: Node) => {const ${nodes}: Node[] = []; ${locations.join('\\n')} return ${nodes};},`",
    "? `${rootsMode?'locateRoots':'locate'}: (${locateRoot}: ${rootsMode?'readonly Node[]':'Node'}) => {const ${nodes}: Node[] = []; ${locations.join('\\n')} return ${nodes};},`",
  );
  return replaceOnce(
    source,
    "    return `{ version: 1, ${options.lean ? 'lean: true, ' : ''}",
    "    return `{ version: 1, ${rootsMode?`roots: ${q(rootSlots)}, `:''}${options.lean ? 'lean: true, ' : ''}",
  );
}
function templates(source) {
  source = replaceOnce(
    source,
    '  readonly locate?: (root: Node) => Node[];',
    '  readonly locate?: (root: Node) => Node[];\n  readonly roots?: readonly number[];\n  readonly locateRoots?: (roots: readonly Node[]) => Node[];',
  );
  source = replaceOnce(
    source,
    '  WeakMap<CompiledTemplatePlan, Node>',
    '  WeakMap<CompiledTemplatePlan, Node | readonly Node[]>',
  );
  source = replaceOnce(
    source,
    '  if (!plan.locate || !renderer.cloneNode) return plan.create(renderer);',
    '  if ((!plan.locate&&!plan.locateRoots) || !renderer.cloneNode) return plan.create(renderer);',
  );
  source = replaceOnce(
    source,
    '    root = plan.create(renderer)[0];',
    '    const nodes=plan.create(renderer);\n    root=plan.locateRoots?plan.roots!.map(slot=>nodes[slot]):nodes[0];',
  );
  return replaceOnce(
    source,
    '  return plan.locate(renderer.cloneNode(root));',
    '  return plan.locateRoots?plan.locateRoots((root as readonly Node[]).map(node=>renderer.cloneNode!(node))):plan.locate!(renderer.cloneNode(root as Node));',
  );
}
function renderer(source) {
  source = replaceOnce(
    source,
    'const NO_COMPILED_OBSERVERS: readonly unknown[] = [];',
    'const NO_COMPILED_OBSERVERS: readonly unknown[] = [];\nconst SINGLE_COMPILED_ROOT: readonly number[] = [0];',
  );
  // Root-relative replay paths already include the flattened root ordinal.
  const start = source.indexOf('class CompiledComponentRenderedNode'),
    end = source.indexOf('class ComponentRenderedNode');
  let body = source.slice(start, end);
  body = replaceOnce(
    body,
    `          context.renderer.setAttribute(
            root,
            'data-craft-root',
            componentContext.rootScope!,
          );`,
    `          for(const slot of this.plan.roots??SINGLE_COMPILED_ROOT){
            const element=this.nodes[slot];
            if(isElementNode(element))context.renderer.setAttribute(element,'data-craft-root',componentContext.rootScope!);
          }`,
  );
  body = replaceOnce(
    body,
    '          const root = this.nodes[0] as Element;',
    '',
  );
  body = body
    .replaceAll(
      '              0,\n              ...target.path,',
      '              ...(this.plan.roots?target.path:[0,...target.path]),',
    )
    .replaceAll(
      '                0,\n                ...binding.path,',
      '                ...(this.plan.roots?binding.path:[0,...binding.path]),',
    )
    .replaceAll(
      '          0,\n          ...plan.path,',
      '          ...(this.plan.roots?plan.path:[0,...plan.path]),',
    );
  body = replaceOnce(
    body,
    '          insertBefore(context.renderer, parent, root, before);',
    '          for(const slot of this.plan.roots??SINGLE_COMPILED_ROOT)insertBefore(context.renderer,parent,this.nodes[slot],before);',
  );
  body = replaceOnce(
    body,
    '  lastNode(): NativeNode {\n    return this.nodes[0];\n  }',
    '  lastNode(): NativeNode {\n    const roots=this.plan.roots;\n    return this.nodes[roots?roots[roots.length-1]:0];\n  }',
  );
  body = replaceOnce(
    body,
    `    if (!detached && this.nodes[0]) {
      try {
        removeNode(this.context.renderer, this.nodes[0]);
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }`,
    `    if(!detached)for(const slot of this.plan.roots??SINGLE_COMPILED_ROOT){
      try{if(this.nodes[slot])removeNode(this.context.renderer,this.nodes[slot]);}
      catch(error){errors=keepCleanupError(errors,error);}
    }`,
  );
  body = replaceOnce(
    body,
    `      const root = nodes[0] as Element;
      renderer.setAttribute(root, 'data-craft-root', rootScope);`,
    `      for(const slot of plan.roots??SINGLE_COMPILED_ROOT){
        const element=nodes[slot];
        if(isElementNode(element))renderer.setAttribute(element,'data-craft-root',rootScope);
      }`,
  );
  body = replaceOnce(
    body,
    '      insertBefore(renderer, parent, root, before);',
    '      for(const slot of plan.roots??SINGLE_COMPILED_ROOT)insertBefore(renderer,parent,nodes[slot],before);',
  );
  body = replaceOnce(
    body,
    '  lastNode(): NativeNode {\n    return this.nodes![0] as NativeNode;\n  }',
    '  lastNode(): NativeNode {\n    const roots=this.plan.roots;\n    return this.nodes![roots?roots[roots.length-1]:0] as NativeNode;\n  }\n  singleRoot(): NativeNode|undefined {return (this.plan.roots?.length??1)===1?this.firstNode():undefined;}',
  );
  body = replaceOnce(
    body,
    `    const root = this.nodes?.[0];
    if (!detached && root) {
      try {
        removeNode(this.context.renderer, root as NativeNode);
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }`,
    `    if(!detached)for(const slot of this.plan.roots??SINGLE_COMPILED_ROOT){
      try{const root=this.nodes?.[slot];if(root)removeNode(this.context.renderer,root as NativeNode);}
      catch(error){errors=keepCleanupError(errors,error);}
    }`,
  );
  source = source.slice(0, start) + body + source.slice(end);
  source = source.replaceAll(
    'this.rendered instanceof LeanComponentRenderedNode\n        ? this.rendered.firstNode()',
    'this.rendered instanceof LeanComponentRenderedNode\n        ? this.rendered.singleRoot()',
  );
  return source;
}
for (const id of [
  'multiple-roots-reference',
  'multiple-roots',
  'multiple-roots-no-list',
  'multiple-roots-clone',
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
          if (id !== 'multiple-roots-reference') {
            if (file.endsWith('/compiler.ts')) source = compiler(source);
            if (file.endsWith('/interpreter.ts')) source = renderer(source);
            if (file.endsWith('/compiled-template.ts'))
              source = templates(source);
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
    await writeFile(
      join(root, file),
      id !== 'multiple-roots-reference' && file.endsWith('/compiler.spec.ts')
        ? replaceOnce(committed(file), "()=>[div('a'),div('b')]", '()=>[]')
        : committed(file),
    );
  if (id === 'multiple-roots')
    await writeFile(
      join(root, 'libs/compiler/src/multiple-roots.spec.ts'),
      await readFile(
        new URL('multiple-roots.contracts.ts', import.meta.url),
        'utf8',
      ),
    );
  await writeFile(
    join(root, 'libs/compiler/src/dom-observation.spec.ts'),
    await readFile(
      new URL('dom-observation.contracts.ts', import.meta.url),
      'utf8',
    ),
  );
  console.log(root);
}
