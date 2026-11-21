import { it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { craftComponent, div } from '@craft-ts/component';
import {
  ɵwithCompiledTemplate,
  ɵwithCompiledItem,
  compiledItemComponent,
} from '../../component/src/lib/render/compiled-template';
import { craftCompiler } from './vite';
import { compileModule } from './compiler';
const row = `import {craftComponent,div,forNode} from '@craft-ts/component'; export const Row=craftComponent('ImportedRow',{},(inputs:any)=>div(function*(){return (yield* inputs.row()).label;}));`;
const main = `import {craftComponent,div,forNode} from '@craft-ts/component';import {Row as Item} from './row.js'; export const App=craftComponent('ImportedApp',{},()=>div(forNode([], {track:r=>r.id}, row=>Item({row}))));`;
function project(files: Record<string, string>) {
  const plugin = craftCompiler({ lean: true, imports: true }),
    hook = plugin.transform as any;
  const watched: string[] = [];
  const context: any = {
    environment: { config: { consumer: 'client' } },
    addWatchFile: (id: string) => watched.push(id),
    resolve: async (specifier: string, importer: string) => {
      if (!specifier.startsWith('.')) return { id: specifier, external: true };
      const id = resolve(dirname(importer), specifier).replace(/\.js$/, '.ts');
      return files[id] ? { id } : null;
    },
    load: async ({ id }: { id: string }) => {
      if (!files[id]) throw Error('missing ' + id);
      return await hook.call(context, files[id], id);
    },
  };
  return {
    files,
    watched,
    plugin,
    transform: async () =>
      await hook.call(context, files['/app/main.ts'], '/app/main.ts'),
  };
}
it('proves imported constant definitions and import aliases using loaded sources', async () => {
  const app = project({ '/app/main.ts': main, '/app/row.ts': row });
  const result = await app.transform();
  expect(result.code).toContain('ɵwithCompiledItem');
  expect(app.watched).toContain('/app/row.ts');
  expect(
    compileModule(row, '/app/row.ts', { lean: true }).compiledExports,
  ).toEqual(['Row']);
});
it('supports a list-only importer with no local component declaration', async () => {
  const app = project({
    '/app/main.ts': main.replace(
      /export const App=.*$/,
      'export const node=forNode([], {track:r=>r.id}, row=>Item({row}));',
    ),
    '/app/row.ts': row,
  });
  expect((await app.transform()).code).toContain('ɵwithCompiledItem');
});
it('keeps import graph loading opt-in and skips SSR', async () => {
  const plugin = craftCompiler({ lean: true }),
    transform = plugin.transform as any;
  let reads = 0;
  const context = {
    resolve() {
      reads++;
      throw Error('unexpected graph read');
    },
    load() {
      reads++;
      throw Error('unexpected graph load');
    },
  };
  expect(
    (await transform.call(context, main, '/app/main.ts')).code,
  ).not.toContain('ɵwithCompiledItem');
  const enabled = craftCompiler({ lean: true, imports: true }).transform as any;
  expect(
    await enabled.call(context, main, '/app/main.ts', { ssr: true }),
  ).toBeNull();
  expect(reads).toBe(0);
});
it.each([
  row.replace('export const Row', 'export let Row'),
  row.replace("'ImportedRow',{}", "'ImportedRow',{providers:[]}"),
  row.replace('export const Row', 'const Row') + '\nexport {Row};',
])('refuses mutable, unsupported or unproved export shapes', async (child) => {
  const result = await project({
    '/app/main.ts': main,
    '/app/row.ts': child,
  }).transform();
  expect(result.code).not.toContain('ɵwithCompiledItem');
});
it('keeps lexical shadows and opaque callback work generic', async () => {
  for (const source of [
    main.replace('()=>div(forNode', '(Item:any)=>div(forNode'),
    main.replace('row=>Item({row})', 'row=>Item({row:read(row)})'),
  ]) {
    expect(
      (
        await project({
          '/app/main.ts': source,
          '/app/row.ts': row,
        }).transform()
      ).code,
    ).not.toContain('ɵwithCompiledItem');
  }
});
it('rejects static cycles without waiting on the importer transform', async () => {
  const result = await project({
    '/app/main.ts': main,
    '/app/row.ts': row + "\nimport {App} from './main.js';",
  }).transform();
  expect(result.code).not.toContain('ɵwithCompiledItem');
});
it.each(["import {} from './main.js';", "import {type T} from './main.js';"])(
  'keeps potential side-effect cycle edges: %s',
  async (edge) => {
    const result = await project({
      '/app/main.ts': main + '\nexport type T={};',
      '/app/row.ts': row + '\n' + edge,
    }).transform();
    expect(result.code).not.toContain('ɵwithCompiledItem');
  },
);
it('refuses resolver-dependent import attributes', async () => {
  const source = main.replace(
    "from './row.js';",
    "from './row.js' with {mode:'alternate'};",
  );
  expect(
    (await project({ '/app/main.ts': source, '/app/row.ts': row }).transform())
      .code,
  ).not.toContain('ɵwithCompiledItem');
});
it('rejects unknown dependencies, dynamic imports and barrels conservatively', async () => {
  for (const child of [
    row + "\nimport './unknown.js';",
    row + "\nconst later=()=>import('./later.js');",
  ]) {
    expect(
      (
        await project({
          '/app/main.ts': main,
          '/app/row.ts': child,
        }).transform()
      ).code,
    ).not.toContain('ɵwithCompiledItem');
  }
  const result = await project({
    '/app/main.ts': main.replace('./row.js', './barrel.js'),
    '/app/barrel.ts': "export {Row} from './row.js';",
    '/app/row.ts': row,
  }).transform();
  expect(result.code).not.toContain('ɵwithCompiledItem');
});
it('does not reuse a constant-export proof across a new build', async () => {
  const app = project({ '/app/main.ts': main, '/app/row.ts': row });
  expect((await app.transform()).code).toContain('ɵwithCompiledItem');
  app.files['/app/row.ts'] = row.replace('export const Row', 'export let Row');
  (app.plugin.buildStart as any)();
  expect((await app.transform()).code).not.toContain('ɵwithCompiledItem');
});
it('does not assign item metadata to an uncompiled proxy around a compiled component', () => {
  const component = craftComponent('ImportedGuard', {}, () => div('x'));
  ɵwithCompiledTemplate(component, {
    version: 1,
    lean: true,
    create: () => [],
    bind: () => [],
    elements: [],
    bindings: [],
  });
  let probes = 0;
  const proxy = new Proxy(component, {
      get() {
        probes++;
        throw Error('unexpected proxy probe');
      },
    }),
    factory = () => proxy({});
  ɵwithCompiledItem(factory, proxy);
  expect(compiledItemComponent(factory)).toBeUndefined();
  expect(probes).toBe(0);
  const direct = () => component({});
  ɵwithCompiledItem(direct, component);
  expect(compiledItemComponent(direct)).toBe(component);
});
