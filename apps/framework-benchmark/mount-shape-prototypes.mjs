// PROTOTYPE patches applied exclusively to temporary runtimes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const here = dirname(fileURLToPath(import.meta.url));
export async function applyMountShapePrototype(
  name,
  { paths, patch, scratch },
) {
  const read = (p) => readFile(join(scratch, p), 'utf8'),
    write = (p, s) => writeFile(join(scratch, p), s);
  const append = async (p, s) => write(p, (await read(p)) + '\n' + s);
  if (name === 'roots') {
    await patch(
      paths.render,
      '  private nodes: RenderedNode[] = [];',
      '  private nodes: RenderedNode[] = [];\n  private prototypeRoot: NativeNode | undefined;',
    );
    await patch(
      paths.render,
      '  private promote(): FragmentRenderedNode {\n    if (this.fallback)',
      '  private promote(): FragmentRenderedNode {\n    this.prototypeRoot = undefined;\n    if (this.fallback)',
    );
    await patch(
      paths.render,
      'firstNode(): NativeNode { return this.fallback?.firstNode()',
      'firstNode(): NativeNode { return this.prototypeRoot ?? this.fallback?.firstNode()',
    );
    await patch(
      paths.render,
      'lastNode(): NativeNode { return this.fallback?.lastNode()',
      'lastNode(): NativeNode { return this.prototypeRoot ?? this.fallback?.lastNode()',
    );
    await patch(
      paths.render,
      '    this.nodes = patchRenderedChildren(parent, this.nodes, children, before, this.context);',
      `    this.nodes = patchRenderedChildren(parent, this.nodes, children, before, this.context);
    if (this.allowPreparedComponent && this.nodes.length === 1) {
      const first = this.nodes[0].firstNode();
      this.prototypeRoot = first === this.nodes[0].lastNode() ? first : undefined;
    }`,
    );
  } else if (name === 'layout') {
    await append(
      paths.injector,
      await readFile(
        join(here, 'prototype-runtime/provider-layout.ts.txt'),
        'utf8',
      ),
    );
    await patch(
      paths.injector,
      '  createChild(providers: readonly CraftProvider[]): CraftInjector;',
      '  createChild(providers: readonly CraftProvider[], prototypeLayoutKey?: object): CraftInjector;',
    );
    await patch(
      paths.injector,
      '  detachFromParent?: () => void,\n): CraftInjector {',
      '  detachFromParent?: () => void,\n  prototypeLayoutKey?: object,\n): CraftInjector {',
    );
    await patch(
      paths.injector,
      '  const records = new Map<object, ProviderRecord>();',
      '  const records = prototypeLayoutKey ? prototypeProviderTable(providers, prototypeLayoutKey) : new Map<object, ProviderRecord>();',
    );
    await patch(
      paths.injector,
      '    createChild(childProviders: readonly CraftProvider[]): CraftInjector {',
      '    createChild(childProviders: readonly CraftProvider[], prototypeLayoutKey?: object): CraftInjector {',
    );
    await patch(
      paths.injector,
      '          children.delete(child);\n        },\n      );',
      '          children.delete(child);\n        },\n        prototypeLayoutKey,\n      );',
    );
    await patch(
      paths.compat,
      '  _debugName?: string,\n): EnvironmentInjector & CraftInjector {',
      '  _debugName?: string,\n  prototypeLayoutKey?: object,\n): EnvironmentInjector & CraftInjector {',
    );
    await patch(
      paths.compat,
      '    ...toCraftProviders(providers),\n  ]);',
      '    ...toCraftProviders(providers),\n  ], prototypeLayoutKey);',
    );
    await patch(
      paths.render,
      "    ], context.injector as EnvironmentInjector, 'CraftComponent');",
      "    ], context.injector as EnvironmentInjector, 'CraftComponent', node.component);",
    );
  } else if (name === 'slots') {
    await applyMountShapePrototype('layout', { paths, patch, scratch });
    const source = await read(paths.injector),
      tree = ts.createSourceFile(
        paths.injector,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
    const fn = tree.statements.find(
      (n) =>
        ts.isFunctionDeclaration(n) &&
        n.name?.text === 'prototypeProviderTable',
    );
    assert(fn);
    const start = source.indexOf(
      '  const indices=layout.indices;',
      fn.body.getStart(tree),
    );
    assert(start > 0);
    await write(
      paths.injector,
      source.slice(0, start) +
        `  return new PrototypeIndexedRecords(layout.indices) as unknown as Map<object,ProviderRecord>;
}` +
        source.slice(fn.end),
    );
    await append(
      paths.injector,
      await readFile(
        join(here, 'prototype-runtime/provider-slots.ts.txt'),
        'utf8',
      ),
    );
  } else if (name === 'recipes') {
    await append(
      paths.render,
      `
const prototypeHostRecipes = new WeakMap<object,{name:string;providers:ReturnType<typeof provideHostName>}>();
function prototypeHostProviders(component: object,name: string): ReturnType<typeof provideHostName> {
  const previous=prototypeHostRecipes.get(component);
  if(previous?.name===name) return previous.providers;
  const providers=provideHostName(\`component:\${name}\`);
  prototypeHostRecipes.set(component,{name,providers});return providers;
}
`,
    );
    await patch(
      paths.render,
      '...provideHostName(`component:${definition.name}`), provideCraftRenderIdentity(componentContext.identity),',
      '...prototypeHostProviders(node.component,definition.name), provideCraftRenderIdentity(componentContext.identity),',
    );
  } else if (name === 'contexts') {
    const render = await read(paths.render),
      tree = ts.createSourceFile(
        paths.render,
        render,
        ts.ScriptTarget.Latest,
        true,
      );
    const iface = tree.statements.find(
      (n) => ts.isInterfaceDeclaration(n) && n.name.text === 'RenderContext',
    );
    assert(iface);
    const fields = iface.members
      .filter(ts.isPropertySignature)
      .map((n) => n.name.getText(tree));
    assert(fields.length >= 20);
    await patch(
      paths.render,
      '  return { ...context, ...overrides };',
      `  return {\n${fields.map((f) => `    ${f}: context.${f},`).join('\n')}\n    ...overrides,\n  };`,
    );
  } else if (name === 'identities') {
    await patch(
      paths.identity,
      '  const tail = segments.map(String);',
      `  const tail = segments.length === 1 ? [String(segments[0])]
    : segments.length === 2 ? [String(segments[0]),String(segments[1])] : segments.map(String);`,
    );
    await patch(
      paths.identity,
      "  const suffix = tail.map(encodeHydrationSegment).join('/');",
      `  const suffix = tail.length === 1 ? encodeHydrationSegment(tail[0])
    : tail.length === 2 ? encodeHydrationSegment(tail[0])+'/'+encodeHydrationSegment(tail[1])
    : tail.map(encodeHydrationSegment).join('/');`,
    );
  } else throw new Error(`Unknown shape prototype: ${name}`);
}
