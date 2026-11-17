// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import ts from 'typescript';
import * as api from '@craft-ts/component';
import * as runtime from '@craft-ts/component/compiler-runtime';
import {
  createBrowserDomAdapter,
  provideCraftProduction,
} from '@craft-ts/core';
import {
  createEnvironmentInjector,
  Injector,
  type EnvironmentInjector,
  signal,
  ɵEffectScheduler,
} from '../../component/src/lib/host-runtime';
import { mountInterpretedComponentWithOptions } from '../../component/src/lib/render/interpreter';
import { compiledTemplateFor } from '../../component/src/lib/render/compiled-template';
import { compileModule } from './compiler';
let serial = 0;
const header =
  "import {craftComponent,div,span,button,forNode,type Input} from '@craft-ts/component';";
const row = `export const Row=craftComponent('PartialRowSUFFIX',{},(inputs:{row:Input<{id:number;label:string}>;position:Input<number>})=>div({'data-row':function*(){return (yield* inputs.row()).id;}},[span({'data-position':inputs.position},function*(){return (yield* inputs.position())+1;}),function*(){return (yield* inputs.row()).label;}]));`;
function load(body: string, globals: Record<string, unknown> = {}) {
  const result = compileModule(
    header + body.replaceAll('SUFFIX', String(serial++)),
    'partial-fixture.ts',
    { lean: true },
  );
  const exports: any = {};
  const code = ts.transpileModule(result.code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)(
    (name: string) => (name.endsWith('/compiler-runtime') ? runtime : api),
    exports,
    ...Object.values(globals),
  );
  return { exports, code: result.code };
}
function mount(App: any) {
  const host = document.createElement('div');
  const injector = createEnvironmentInjector(
    [provideCraftProduction()],
    Injector.NULL as EnvironmentInjector,
    'partial-rebind',
  );
  const renderer = createBrowserDomAdapter(document),
    setValue = vi.spyOn(renderer, 'setValue'),
    setAttribute = vi.spyOn(renderer, 'setAttribute');
  const view = mountInterpretedComponentWithOptions(
    App,
    host,
    injector,
    {},
    { renderer },
  );
  const flush = () => injector.get(ɵEffectScheduler).flush();
  flush();
  return {
    host,
    view,
    flush,
    setValue,
    setAttribute,
    destroy() {
      view.destroy();
      injector.destroy();
    },
  };
}
it('annotates independent literal readers and keeps setup, events, holes, calls and aliases whole', () => {
  expect(compileModule(header + row, 'standard.ts').code).not.toContain(
    'rebindInputs',
  );
  const { exports } = load(row);
  expect(compiledTemplateFor(exports.Row)?.incremental).toBe(true);
  expect(
    compiledTemplateFor(exports.Row)?.bindings.map(
      (binding) => binding.rebindInputs,
    ),
  ).toEqual([['row'], ['position'], ['position'], ['row']]);
  for (const template of [
    `(inputs:any)=>{const alias=inputs;return div([span(alias.a),span(inputs.b)]);}`,
    `(inputs:any)=>div([span(()=>external(inputs.a)),span(inputs.b)])`,
    `(inputs:any)=>div([span(function*(){return yield* inputs[key]();}),span(inputs.b)])`,
    `(inputs:any)=>div([button({click(){}},inputs.a),span(inputs.b)])`,
    `(inputs:any)=>div([unknownChild(),span(inputs.a),span(inputs.b)])`,
    `(inputs:any)=>div([span(function*(){try{return yield* inputs.a();}finally{}}),span(inputs.b)])`,
  ])
    expect(
      compileModule(
        header + `const C=craftComponent('Refusal',{},${template});`,
        'refusal.ts',
        { lean: true },
      ).code,
    ).not.toContain('incremental: true');
});
it('rebinds the changed row while preserving the index binding and row identity', () => {
  const items = signal([
    { id: 0, label: 'zero' },
    { id: 1, label: 'one' },
  ]);
  const { exports } = load(
    row +
      `export const App=craftComponent('PartialAppSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},(row,position)=>Row({row,position}))));`,
    { items },
  );
  const mounted = mount(exports.App);
  try {
    const first = mounted.host.querySelector('[data-row="0"]');
    mounted.setValue.mockClear();
    mounted.setAttribute.mockClear();
    items.set([
      { id: 0, label: 'ZERO' },
      { id: 1, label: 'one' },
    ]);
    mounted.flush();
    expect(mounted.host.querySelector('[data-row="0"]')).toBe(first);
    expect(first?.textContent).toBe('1ZERO');
    expect(
      mounted.setAttribute.mock.calls.filter(
        (call) => call[1] === 'data-position',
      ),
    ).toHaveLength(0);
    expect(mounted.setValue.mock.calls.map((call) => call[1])).toEqual([
      'ZERO',
      'one',
    ]);
    items.update((rows) => [...rows].reverse());
    mounted.flush();
    expect(mounted.host.textContent).toBe('1one2ZERO');
    expect(mounted.host.querySelector('[data-row="0"]')).toBe(first);
    mounted.view.destroy();
    mounted.setValue.mockClear();
    items.set([{ id: 0, label: 'after destroy' }]);
    mounted.flush();
    expect(mounted.setValue).not.toHaveBeenCalled();
  } finally {
    mounted.destroy();
  }
});
it('does not scan an unproved Proxy more often than a full rebind', () => {
  const run = (incremental: boolean) => {
    const log: string[] = [],
      items = signal([{ id: 0, label: 'zero' }]);
    const proxyFor = (row: unknown, position: unknown) =>
      new Proxy(
        { row, position },
        {
          get(target, key, receiver) {
            log.push('get:' + String(key));
            return Reflect.get(target, key, receiver);
          },
          ownKeys(target) {
            log.push('keys');
            return Reflect.ownKeys(target);
          },
          getOwnPropertyDescriptor(target, key) {
            log.push('desc:' + String(key));
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
          has(target, key) {
            log.push('has:' + String(key));
            return Reflect.has(target, key);
          },
        },
      );
    const { exports } = load(
      row +
        `export const App=craftComponent('ProxyAppSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},(row,position)=>Row(proxyFor(row,position)))));`,
      { items, proxyFor },
    );
    const plan = compiledTemplateFor(exports.Row)!;
    if (!incremental) (plan as any).incremental = false;
    const mounted = mount(exports.App);
    try {
      log.length = 0;
      items.set([{ id: 0, label: 'ZERO' }]);
      mounted.flush();
      return { log: [...log], text: mounted.host.textContent };
    } finally {
      mounted.destroy();
    }
  };
  expect(run(true)).toEqual(run(false));
});
it('does not treat a property getter as a stable primitive projection', () => {
  const run = (unsafe: boolean) => {
    let probe = 'before';
    Object.defineProperty(Number.prototype, 'incrementalProbe', {
      configurable: true,
      get: () => probe,
    });
    const items = signal([{ id: 0, label: 'zero' }]);
    const custom = row.replace(
      'return (yield* inputs.position())+1;',
      'return (yield* inputs.position()).incrementalProbe;',
    );
    const { exports } = load(
      custom +
        `export const App=craftComponent('GetterAppSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},(row,position)=>Row({row,position}))));`,
      { items },
    );
    const plan = compiledTemplateFor(exports.Row)!;
    if (unsafe)
      for (const binding of plan.bindings) (binding as any).stableRebind = true;
    const mounted = mount(exports.App);
    try {
      probe = 'after';
      items.set([{ id: 0, label: 'ZERO' }]);
      mounted.flush();
      return mounted.host.textContent;
    } finally {
      mounted.destroy();
      delete (Number.prototype as any).incrementalProbe;
    }
  };
  expect(run(true)).toBe('beforeZERO'); // Reproduces the naive dependency-only bug.
  expect(run(false)).toBe('afterZERO');
});
it('keeps index writes ordered before an observing row getter on reorder', () => {
  const run = (partial: boolean) => {
    let host: Element | undefined;
    const records = [0, 1].map((id) => ({
      id,
      get label() {
        return `observed:${host?.querySelector(`[data-row="${id}"] span`)?.textContent ?? 'initial'}`;
      },
    }));
    const items = signal(records);
    const { exports } = load(
      row +
        `export const App=craftComponent('OrderAppSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},(row,position)=>Row({row,position}))));`,
      { items },
    );
    if (!partial) (compiledTemplateFor(exports.Row) as any).incremental = false;
    const mounted = mount(exports.App);
    host = mounted.host;
    try {
      items.update((rows) => [...rows].reverse());
      mounted.flush();
      return mounted.host.textContent;
    } finally {
      mounted.destroy();
    }
  };
  expect(run(true)).toEqual(run(false));
});
