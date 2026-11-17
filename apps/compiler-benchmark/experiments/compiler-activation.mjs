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
const renderer = (source, complete) => {
  const leanStart = source.indexOf(
    '    const component = compiledItemComponent(this.node.itemTemplate) as',
  );
  const leanEnd = source.indexOf('\n  }', leanStart);
  if (leanStart < 0 || leanEnd < 0) throw Error('leanItems anchor missing');
  const leanBody = source
    .slice(leanStart, leanEnd)
    .replaceAll('this.node', 'node')
    .replaceAll('this.context', 'context');
  source =
    source.slice(0, leanStart) +
    '    return compiledRenderer?.leanItems(this.node, this.context) ?? false;' +
    source.slice(leanEnd);
  const itemStart = source.indexOf(
    '    const component = compiledItemComponent(this.node.itemTemplate);',
  );
  const itemEnd = source.indexOf('\n  }', itemStart);
  if (itemStart < 0 || itemEnd < 0)
    throw Error('canCompileItem anchor missing');
  const itemBody = source
    .slice(itemStart, itemEnd)
    .replaceAll('this.node', 'node')
    .replaceAll('this.context', 'context');
  source =
    source.slice(0, itemStart) +
    '    return compiledRenderer?.canCompileItem(this.node, this.context) ?? false;' +
    source.slice(itemEnd);
  const mountStart = source.indexOf(
    "    case 'component':\n      if (canMountLeanComponent(node, context))",
  );
  const mountEnd = source.indexOf(
    '\n      return new ComponentRenderedNode(',
    mountStart,
  );
  if (mountStart < 0 || mountEnd < 0)
    throw Error('compiled mount anchor missing');
  const mountBody = source.slice(
    mountStart + "    case 'component':\n".length,
    mountEnd,
  );
  source =
    source.slice(0, mountStart) +
    `    case 'component': {
      const compiled = compiledRenderer?.mount(node, parent, before, context);
      if (compiled) return compiled;` +
    source.slice(mountEnd);
  source = replaceOnce(
    source,
    "    case 'directive':\n      return new CraftDirectiveRenderedNode",
    "    }\n    case 'directive':\n      return new CraftDirectiveRenderedNode",
  );
  source = replaceOnce(
    source,
    'const NO_COMPILED_OBSERVERS: readonly unknown[] = [];',
    `type CompiledRenderer = {
  leanItems(node: Extract<CraftNode, {kind:'for'}>, context: RenderContext): boolean;
  canCompileItem(node: Extract<CraftNode, {kind:'for'}>, context: RenderContext): boolean;
  mount(node: Extract<CraftNode, {kind:'component'}>, parent: Node, before: Node | null, context: RenderContext): RenderedNode | undefined;
};
let compiledRenderer: CompiledRenderer | undefined;

/** Internal compiler activation. Unreferenced in applications without plans. */
export function ɵenableCompiledRendering(): void {
  if (compiledRenderer) return;
  compiledRenderer = {
    leanItems(node, context) {
${leanBody}
    },
    canCompileItem(node, context) {
${itemBody}
    },
    mount(node, parent, before, context) {
${mountBody}
      return undefined;
    },
  };
}

const NO_COMPILED_OBSERVERS: readonly unknown[] = [];`,
  );
  if (complete) {
    const before = `this.rendered instanceof LeanComponentRenderedNode
        ? this.rendered.firstNode()
        : undefined`;
    if (source.split(before).length !== 3)
      throw Error('Expected two lean root checks');
    source = source.replaceAll(
      before,
      'compiledRenderer?.rootOf(this.rendered)',
    );
    source = replaceOnce(
      source,
      'type CompiledRenderer = {',
      'type CompiledRenderer = {\n  rootOf(view: RenderedNode): NativeNode | undefined;',
    );
    source = replaceOnce(
      source,
      '  compiledRenderer = {',
      '  compiledRenderer = {\n    rootOf(view) { return view instanceof LeanComponentRenderedNode ? view.firstNode() : undefined; },',
    );
  }
  return source;
};
const helper = (source) => {
  source = replaceOnce(
    source,
    "import type { Injector } from '../host-runtime';",
    "import type { Injector } from '../host-runtime';\nimport { ɵenableCompiledRendering } from './interpreter';",
  );
  return replaceOnce(
    source,
    '  if (definition && plan.version === 1) {',
    '  if (definition && plan.version === 1) {\n    ɵenableCompiledRendering();',
  );
};
for (const id of [
  'compiler-activation-reference',
  'compiler-activation',
  'compiler-activation-complete',
]) {
  const root = join(lab, 'roots', id);
  try {
    await access(join(root, 'candidate.json'));
  } catch {
    await prepareCandidate(id, [
      ...['libs/compiler/src/compiler.ts', 'libs/compiler/src/vite.ts'].map(
        (file) => ({ file, change: () => committed(file) }),
      ),
      {
        file: 'libs/component/src/lib/render/compiled-template.ts',
        change: () =>
          id !== 'compiler-activation-reference'
            ? helper(
                committed('libs/component/src/lib/render/compiled-template.ts'),
              )
            : committed('libs/component/src/lib/render/compiled-template.ts'),
      },
      ...(id !== 'compiler-activation-reference'
        ? [
            {
              file: 'libs/component/src/lib/render/interpreter.ts',
              change: (source) =>
                renderer(source, id === 'compiler-activation-complete'),
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
  await writeFile(
    join(root, 'libs/compiler/src/activation.spec.ts'),
    await readFile(new URL('./activation.contracts.ts', import.meta.url)),
  );
  console.log(root);
}
