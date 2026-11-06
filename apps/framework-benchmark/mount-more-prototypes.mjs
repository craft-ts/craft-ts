// PROTOTYPE transforms. Runtime mutations are restricted to diagnose.mjs snapshots.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export async function applyMountMorePrototype(name, { paths, patch, scratch }) {
  const read = (p) => readFile(join(scratch, p), 'utf8'),
    write = (p, s) => writeFile(join(scratch, p), s);
  const append = async (p, s) => write(p, (await read(p)) + '\n' + s);
  if (name === 'inputs') {
    await append(
      paths.render,
      `
// Only readers transported to an explicitly prepared, pure data row use this path.
const prototypeInputReads = new WeakMap<object,()=>unknown>();
function prototypeReadForInput(reader: any): any {
  const direct = prototypeInputReads.get(reader);
  return direct ? direct() : craftUse(reader());
}
`,
    );
    await patch(
      paths.main,
      '__craftPureItemPrototype: true',
      '__craftPureItemPrototype: true, __prototypeRawInputs: true',
    );
    await patch(
      paths.render,
      `function createForIndexReader(read: () => number): InputValue<number> {
  return function* () {
    return read();
  };
}`,
      `function createForIndexReader(read: () => number): InputValue<number> {
  const reader = function* () { return read(); };
  prototypeInputReads.set(reader, read);
  return reader;
}`,
    );
    await patch(
      paths.render,
      `    return renderBlockChildren(
      childContext(this.context, {
        traceState,
        identity,`,
      `    if ((this.node.itemTemplate as any).__prototypeRawInputs) prototypeInputReads.set(itemInput, () => item);
    return renderBlockChildren(
      childContext(this.context, {
        traceState,
        identity,`,
    );
    await patch(
      paths.render,
      'craftUse(props.row()) as {id: number; label: string}',
      'prototypeReadForInput(props.row) as {id: number; label: string}',
    );
    await patch(
      paths.render,
      '? craftUse(props.position()) : 0',
      '? prototypeReadForInput(props.position) : 0',
    );
  } else if (name === 'lazy-owner') {
    for (const [from, to] of [
      [
        '  const defaultValues = new Map<object, unknown>();',
        '  let defaultValues: Map<object, unknown> | undefined;',
      ],
      [
        '  const children = new Set<CraftInjector>();',
        '  let children: Set<CraftInjector> | undefined;',
      ],
      [
        'if (defaultValues.has(token)) return defaultValues.get(token);',
        'if (defaultValues?.has(token)) return defaultValues.get(token);',
      ],
      [
        'if (value !== ɵNOT_FOUND) defaultValues.set(token, value);',
        'if (value !== ɵNOT_FOUND) (defaultValues ??= new Map()).set(token, value);',
      ],
      ['children.delete(child);', 'children?.delete(child);'],
      ['children.add(child);', '(children ??= new Set()).add(child);'],
      [
        '...Array.from(children, (child) => () => child.destroy()),',
        '...Array.from(children ?? [], (child) => () => child.destroy()),',
      ],
      ['children.clear();', 'children?.clear();'],
      ['defaultValues.clear();', 'defaultValues?.clear();'],
    ])
      await patch(paths.injector, from, to);
  } else if (name === 'value-records') {
    await patch(
      paths.injector,
      'type ProviderRecord = {',
      'type ProviderRecord = {\n  readonly provider?: CraftProvider;',
    );
    await append(
      paths.injector,
      `
// Shared method rather than one closure per value provider; values remain live.
function prototypeProviderValue(this: ProviderRecord): unknown {
  return (this.provider as Extract<CraftProvider,{useValue:unknown}>).useValue;
}
`,
    );
    await patch(
      paths.injector,
      '      resolve: () => provider.useValue,',
      '      provider,\n      resolve: prototypeProviderValue,',
    );
    // Multi-provider composition previously detached the resolver. Preserve its receiver.
    await patch(
      paths.injector,
      '    const nextValue = createProviderRecord(provider, injector).resolve;',
      '    const nextRecord = createProviderRecord(provider, injector);\n    const nextValue = () => nextRecord.resolve();',
    );
    await patch(
      paths.injector,
      '      const previous = existing.resolve as () => unknown[];',
      '      const previous = () => existing.resolve() as unknown[];',
    );
  } else if (name === 'segments') {
    await append(
      paths.identity,
      `
// Bounded caches; failed URI encodings are deliberately never cached.
const prototypeEncodedSegments = new Map<string,string>();
const prototypeJsonSegments = new Map<string,string>();
function prototypeMemoSegment(segment: string, json: boolean): string {
  const cache = json ? prototypeJsonSegments : prototypeEncodedSegments;
  const previous = cache.get(segment);
  if (previous !== undefined) return previous;
  const value = json ? JSON.stringify(segment) : encodeURIComponent(segment).replaceAll('%2F','%252F');
  if (cache.size === 512) cache.clear();
  cache.set(segment,value);
  return value;
}
`,
    );
    await patch(
      paths.identity,
      "  return encodeURIComponent(segment).replaceAll('%2F', '%252F');",
      '  return prototypeMemoSegment(segment,false);',
    );
    await patch(
      paths.identity,
      '+JSON.stringify(segment)',
      '+prototypeMemoSegment(segment,true)',
    );
  } else if (name === 'ranges') {
    await patch(
      paths.main,
      '__craftPureItemPrototype: true',
      '__craftPureItemPrototype: true, __prototypeBorrowFor: Row',
    );
    await append(
      paths.render,
      `
function prototypeCanBorrowFor(node: ForNode<unknown,unknown>,context: RenderContext,ownsScheduler: boolean): boolean {
  const factory = (node.itemTemplate as any).__prototypeBorrowFor;
  return !!factory?.__prototypePlannedComponent && !!(node.itemTemplate as any).__craftPureItemPrototype
    && ownsScheduler && !node.schedule?.enabled && context.mode === 'create' && !context.ssr && !context.emitHydrationKeys;
}
function prototypeCreateBorrowedEntry(parent: NativeParent,before: NativeNode|null,context: RenderContext): FragmentRenderedNode {
  return new PrototypeSingleRootRange(parent,before,context,true) as unknown as FragmentRenderedNode;
}
`,
    );
    await patch(
      paths.render,
      'private context: RenderContext) {}',
      'private context: RenderContext, private allowPreparedComponent = false) {}',
    );
    await patch(
      paths.render,
      "if (next.length !== 1 || next[0].kind !== 'element')",
      "if (next.length !== 1 || (next[0].kind !== 'element' && !(this.allowPreparedComponent && next[0].kind === 'component' && prototypeCanPlanComponent(next[0], this.context, this.parent))))",
    );
    await patch(
      paths.render,
      `          view: createFragment(
            this.parent,
            this.end,
            entryContext,
            [],
            \`craft-for:\${String(key)}\`,
          ),`,
      `          view: prototypeCanBorrowFor(this.node,this.context,this.ownsScheduler)
            ? prototypeCreateBorrowedEntry(this.parent,this.end,entryContext)
            : createFragment(this.parent,this.end,entryContext,[],\`craft-for:\${String(key)}\`),`,
    );
    await patch(
      paths.render,
      '    entriesToRender.forEach((entry) => this.scheduleEntryRender(entry));',
      '    if (!earlyRender) entriesToRender.forEach((entry) => this.scheduleEntryRender(entry));',
    );
    await patch(
      paths.render,
      '    previous.forEach((entry, key) => {',
      `    const earlyRender = prototypeCanBorrowFor(this.node,this.context,this.ownsScheduler);
    if (earlyRender) {
      // The normal sync scheduler still runs the pure callback and all tracing.
      // Publish the entry map before scheduling, then commit final DOM order.
      this.entries = next;
      entriesToRender.forEach((entry) => this.scheduleEntryRender(entry));
    }
    previous.forEach((entry, key) => {`,
    );
  } else if (name === 'stage') {
    await append(
      paths.render,
      await readFile(join(here, 'prototype-runtime/staged-for.ts.txt'), 'utf8'),
    );
    await patch(
      paths.main,
      '__craftPureItemPrototype: true',
      '__craftPureItemPrototype: true, __prototypeStageFor: true',
    );
    await patch(
      paths.render,
      "    case 'for': {\n      const start = mountComment",
      "    case 'for': {\n      if (prototypeCanStageFor(node,context,parent)) return prototypeStageFor(node,parent,before,context);\n      const start = mountComment",
    );
    await patch(
      paths.render,
      'new ElementRef(isElementNode(parent) ? parent : parent.parentElement)',
      'new ElementRef(prototypeLogicalParent(parent))',
    );
  } else throw new Error(`Unknown more prototype ${name}`);
}
