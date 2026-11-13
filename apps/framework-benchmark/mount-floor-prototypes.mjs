// PROTOTYPE patches applied only to diagnose.mjs's temporary copies.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export async function applyMountFloorPrototype(
  name,
  { paths, patch, scratch },
) {
  const snippet = (file) =>
    readFile(join(here, 'prototype-runtime', file + '.ts.txt'), 'utf8');
  const append = async (path, text) =>
    writeFile(
      join(scratch, path),
      (await readFile(join(scratch, path), 'utf8')) + '\n' + text,
    );
  if (name === 'pure') {
    await patch(
      paths.main,
      `(row, index) =>\n        Row({ row, position: index }),`,
      `Object.assign((row, index) => Row({ row, position: index }), { __craftPureItemPrototype: true }),`,
    );
    await patch(
      paths.render,
      `      entry.renderEffect = createRenderEffect(this.context, 'for-item', () =>`,
      `      const render = () =>`,
    );
    await patch(
      paths.render,
      `        ),\n      );\n      entry.rendered = true;`,
      `        );
      if ((this.node.itemTemplate as any).__craftPureItemPrototype) untracked(render);
      else entry.renderEffect = createRenderEffect(this.context, 'for-item', render);
      entry.rendered = true;`,
    );
  } else if (name === 'owner') {
    await append(paths.injector, await snippet('compact-owner'));
    await patch(
      paths.injector,
      '  createChild(providers: readonly CraftProvider[]): CraftInjector;',
      '  createChild(providers: readonly CraftProvider[], compact?: boolean): CraftInjector;',
    );
    await patch(
      paths.injector,
      '    createChild(childProviders: readonly CraftProvider[]): CraftInjector {',
      '    createChild(childProviders: readonly CraftProvider[], compact = false): CraftInjector {',
    );
    await patch(
      paths.injector,
      `      const child = createNativeCraftInjector(\n        childProviders,\n        craftInjector,\n        () => {\n          children.delete(child);\n        },\n      );`,
      `      const release = () => { children.delete(child); };
      const child = compact && prototypeCompactEligible(childProviders)
        ? createPrototypeCompactOwner(childProviders, craftInjector, release)
        : createNativeCraftInjector(childProviders, craftInjector, release);`,
    );
    await patch(
      paths.compat,
      `    ...toCraftProviders(providers),\n  ]);`,
      `    ...toCraftProviders(providers),\n  ], _debugName === 'CraftComponentPrototypeCompact');`,
    );
    await patch(
      paths.render,
      `        'CraftComponent',\n      );`,
      `        definition.name === 'FrameworkBenchRow' && !(definition.meta.providers?.length)
          && !additionalProviders.length && !definition.service.length
          ? 'CraftComponentPrototypeCompact' : 'CraftComponent',\n      );`,
    );
  } else if (name === 'lazy') {
    await append(
      paths.render,
      `
function prototypeLazySource(initial: unknown): any {
  let value = initial;
  let cell: ReturnType<typeof signal> | undefined;
  const read = () => (cell ??= signal(value))();
  read.set = (next: unknown) => { value = next; cell?.set(next); };
  return read;
}`,
    );
    await patch(
      paths.render,
      `      signal((props as Record<string, unknown>)[key]),`,
      `      prototypeLazySource((props as Record<string, unknown>)[key]),`,
    );
    await patch(
      paths.render,
      '    const inputShells = this.propSources.map((source) => {',
      '    const createInputShell = (source: () => unknown) => {',
    );
    const text = await readFile(join(scratch, paths.render), 'utf8');
    const start = text.indexOf('    const createInputShell =');
    const end = text.indexOf(
      '    // A component takes its inputs as one object.',
      start,
    );
    assert(start >= 0 && end > start);
    const block = text.slice(start, end);
    assert(block.endsWith('    });\n\n'));
    await writeFile(
      join(scratch, paths.render),
      text.slice(0, start) +
        block.slice(0, -9) +
        `    };
    const shellCache: any[] = [];
    const inputShells = (index: number) => shellCache[index] ??= createInputShell(this.propSources[index]);

` +
        text.slice(end),
    );
    await patch(paths.render, 'inputShells[0]', 'inputShells(0)');
    // All remaining indexed accesses in this constructor use the same lazy accessor.
    const changed = await readFile(join(scratch, paths.render), 'utf8');
    await writeFile(
      join(scratch, paths.render),
      changed.replaceAll('inputShells[index]', 'inputShells(index)'),
    );
  } else if (name === 'ranges') {
    await append(paths.render, await snippet('single-root-range'));
    await patch(
      paths.render,
      `): FragmentRenderedNode {\n  const start = mountComment`,
      `): FragmentRenderedNode {
  if (label === 'craft-component' && context.componentName === 'FrameworkBenchRow'
      && context.mode === 'create' && !context.ssr && !context.emitHydrationKeys)
    return new PrototypeSingleRootRange(parent, before, context) as unknown as FragmentRenderedNode;
  const start = mountComment`,
    );
  } else if (name === 'plan') {
    await append(paths.render, await snippet('prepared-row'));
    await patch(
      paths.render,
      `    case 'element': {\n      const created = createElementForRender`,
      `    case 'element': {
      if ((node as any).__prototypePreparedRow) {
        if (context.mode === 'create' && !context.ssr && !context.emitHydrationKeys
          && parent.ownerDocument?.defaultView)
          return new PrototypePreparedRow(node, parent, before, context);
        node = prototypeExpandRow(node) as ElementNodeBase;
      }
      const created = createElementForRender`,
    );
    await patch(
      paths.render,
      '() => node.shortcut,',
      "() => (node as Extract<CraftNode, { kind: 'service-shortcut-text' }>).shortcut,",
    );
    const path =
      'apps/framework-benchmark/src/craft/row-by-component.prototype.ts';
    const source = await readFile(join(scratch, path), 'utf8');
    const start = source.indexOf("    return div({ 'data-row': row.id }, [");
    const end = source.indexOf('\n  },\n);', start);
    assert(start >= 0 && end > start);
    await writeFile(
      join(scratch, path),
      source.slice(0, start) +
        `    return {
      kind: 'element', tag: 'div', props: { 'data-row': row.id }, children: [],
      __prototypePreparedRow: { id: row.id, label: row.label, position, indexes: settings.indexes },
    } as any;` +
        source.slice(end),
    );
  } else throw new Error(`Unknown floor prototype: ${name}`);
}
