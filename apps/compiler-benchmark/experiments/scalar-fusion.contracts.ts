// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import ts from 'typescript';
import * as api from '@craft-ts/component';
import * as runtime from '@craft-ts/component/compiler-runtime';
import {
  createBrowserDomAdapter,
  provideCraftProduction,
  ɵsettledReader,
  ɵcraftBindingEffect,
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
vi.mock('@craft-ts/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@craft-ts/core')>();
  return { ...actual, ɵcraftBindingEffect: vi.fn(actual.ɵcraftBindingEffect) };
});
let serial = 0;
const header =
  "import {craftComponent,div,span,button,forNode,type Input} from '@craft-ts/component';";
const row = `export const Row=craftComponent('FusionRowSUFFIX',{},(inputs:{row:Input<{id:number}>;position:Input<number>})=>div({'data-row':function*(){return (yield* inputs.row()).id;}},[span({'data-position':inputs.position},inputs.position),span(function*(){return yield* inputs.position();})]));`;
const app = `export const App=craftComponent('FusionAppSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},(row,position)=>Row({row,position}))));`;
function load(body: string, globals: Record<string, unknown> = {}) {
  const result = compileModule(
    header + body.replaceAll('SUFFIX', String(serial++)),
    'fusion.ts',
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
  const host = document.createElement('div'),
    injector = createEnvironmentInjector(
      [provideCraftProduction()],
      Injector.NULL as EnvironmentInjector,
      'fusion',
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
it('groups only exact consecutive input reads and refuses setup, events, holes and projections', () => {
  const { exports } = load(row);
  const plan = compiledTemplateFor(exports.Row)!;
  expect(plan.scalarFusion).toBe(true);
  expect(plan.bindings.map((b) => b.fusionInput)).toEqual([
    undefined,
    'position',
    'position',
    'position',
  ]);
  const code = (template: string) =>
    compileModule(
      header + `const C=craftComponent('Refusal',{},${template});`,
      'refusal.ts',
      { lean: true },
    ).code;
  for (const template of [
    `inputs=>{const alias=inputs;return div([span(alias.a),span(inputs.a)]);}`,
    `inputs=>div([span(function*(){return (yield* inputs.row()).id;}),span(function*(){return (yield* inputs.row()).id;})])`,
    `inputs=>div([span(function*(){return (yield* inputs.a())+1;}),span(inputs.a)])`,
    `inputs=>div([span(inputs.a),button({click(){}},inputs.a)])`,
    `inputs=>div([span(inputs.a),span(inputs.a),unknown()])`,
    `inputs=>div({'class':inputs.a},inputs.a)`,
    `inputs=>div([span(function*(){try{return yield* inputs.a();}finally{cleanup();}}),span(inputs.a)])`,
  ])
    expect(code(template)).not.toContain('scalarFusion: true');
  expect(compileModule(header + row, 'standard.ts').code).not.toContain(
    'scalarFusion: true',
  );
});
it('reduces live effect owners for known numeric indexes, preserving reorder, rebind and destruction', () => {
  const run = (enabled: boolean) => {
    const items = signal([{ id: 0 }, { id: 1 }, { id: 2 }]);
    const { exports } = load(row + app, { items });
    (compiledTemplateFor(exports.Row)! as any).scalarFusion = enabled;
    vi.mocked(ɵcraftBindingEffect).mockClear();
    const m = mount(exports.App);
    try {
      const effects = vi.mocked(ɵcraftBindingEffect).mock.calls.length;
      const first = m.host.querySelector('[data-row="0"]');
      const trace = [m.host.innerHTML];
      items.update((rows) => [...rows].reverse());
      m.flush();
      trace.push(m.host.innerHTML);
      expect(m.host.querySelector('[data-row="0"]')).toBe(first);
      expect(first?.querySelector('span')?.getAttribute('data-position')).toBe(
        '2',
      );
      expect(first?.textContent).toBe('22');
      items.set([{ id: 0 }, { id: 3 }]);
      m.flush();
      expect(m.host.querySelector('[data-row="0"]')).toBe(first);
      trace.push(m.host.innerHTML);
      m.view.destroy();
      m.setValue.mockClear();
      m.setAttribute.mockClear();
      items.set([{ id: 9 }]);
      m.flush();
      expect(m.setValue).not.toHaveBeenCalled();
      expect(m.setAttribute).not.toHaveBeenCalled();
      return {
        effects,
        trace: trace.map((html) =>
          html
            .replace(/data-craft-root="[^"]*"/g, '')
            .replace(/Fusion[^"< ]*/g, ''),
        ),
      };
    } finally {
      m.destroy();
    }
  };
  const ordinary = run(false),
    fused = run(true);
  expect(fused.effects).toBe(ordinary.effects - 6);
  expect(fused.trace).toEqual(ordinary.trace);
});
it('keeps application readers and DOM-observing side effects separate', () => {
  const run = (enabled: boolean) => {
    const value = signal(0),
      log: string[] = [];
    let host: HTMLElement | undefined;
    const reader = ɵsettledReader(() => {
      const result = value();
      log.push(`${result}:${host?.textContent ?? ''}`);
      return result;
    });
    const { exports } = load(
      `export const Row=craftComponent('UnknownSUFFIX',{},inputs=>div([span(inputs.a),span(function*(){return yield* inputs.a();})]));export const App=craftComponent('OwnerSUFFIX',{},()=>Row({a:reader}));`,
      { reader },
    );
    (compiledTemplateFor(exports.Row)! as any).scalarFusion = enabled;
    vi.mocked(ɵcraftBindingEffect).mockClear();
    const m = mount(exports.App);
    host = m.host;
    try {
      const effects = vi.mocked(ɵcraftBindingEffect).mock.calls.length;
      value.set(1);
      m.flush();
      return { effects, log, html: m.host.textContent };
    } finally {
      m.destroy();
    }
  };
  const ordinary = run(false),
    fused = run(true);
  expect(fused).toEqual(ordinary);
  expect(fused.log).toEqual(['0:', '0:', '1:00', '1:10']);
  expect(fused.effects).toBe(2);
});
it('keeps binding order across a non-fusible DOM-observing reader', () => {
  const run = (enabled: boolean) => {
    const items = signal([{ id: 0 }, { id: 1 }]);
    const observed: string[] = [];
    let host: HTMLElement | undefined;
    const observe = () => {
      const text = host?.textContent ?? '';
      observed.push(text);
      return '|';
    };
    const { exports } = load(
      `export const Row=craftComponent('OrderSUFFIX',{},inputs=>div({'data-row':function*(){return (yield* inputs.row()).id;}},[span(inputs.position),span(inputs.position),span(function*(){yield* inputs.position();return observe();}),span(inputs.position),span(inputs.position)]));` +
        app,
      { items, observe },
    );
    (compiledTemplateFor(exports.Row)! as any).scalarFusion = enabled;
    const m = mount(exports.App);
    host = m.host;
    try {
      items.update((rows) => [...rows].reverse());
      m.flush();
      return { observed, text: m.host.textContent };
    } finally {
      m.destroy();
    }
  };
  expect(run(true)).toEqual(run(false));
});
it('does not add raw input Proxy probes when a known index reader is forwarded', () => {
  const run = (enabled: boolean) => {
    const log: string[] = [],
      items = signal([{ id: 0 }, { id: 1 }]);
    const proxy = (position: unknown) =>
      new Proxy(
        { position },
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
        },
      );
    const { exports } = load(
      `export const Row=craftComponent('ProxySUFFIX',{},inputs=>div([span(inputs.position),span(inputs.position)]));export const App=craftComponent('ProxyOwnerSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},(row,position)=>Row(proxy(position)))));`,
      { items, proxy },
    );
    (compiledTemplateFor(exports.Row)! as any).scalarFusion = enabled;
    const m = mount(exports.App);
    try {
      items.update((rows) => [...rows].reverse());
      m.flush();
      return { log, text: m.host.textContent };
    } finally {
      m.destroy();
    }
  };
  expect(run(true)).toEqual(run(false));
});
it('keeps primitive input rebinds and text conversions on the same DOM nodes', () => {
  const run = (enabled: boolean) => {
    const current = signal<unknown>(0);
    const { exports } = load(
      `export const Row=craftComponent('PrimitiveSUFFIX',{},inputs=>div([span(inputs.a),span(inputs.a)]));export const App=craftComponent('PrimitiveOwnerSUFFIX',{},()=>Row({a:current()}));`,
      { current },
    );
    (compiledTemplateFor(exports.Row)! as any).scalarFusion = enabled;
    const m = mount(exports.App);
    try {
      const first = m.host.querySelector('span'),
        trace: string[] = [];
      for (const value of [2, false, null, undefined, 'changed']) {
        current.set(value);
        m.flush();
        expect(m.host.querySelector('span')).toBe(first);
        trace.push(m.host.textContent ?? '');
      }
      return trace;
    } finally {
      m.destroy();
    }
  };
  expect(run(true)).toEqual(run(false));
  expect(run(true)).toEqual(['22', '', '', '', 'changedchanged']);
});
it('exposes why positive reader ownership alone is insufficient if a binding replaces an input', () => {
  const run = (enabled: boolean) => {
    const items = signal([{ id: 0 }, { id: 1 }]),
      a = signal(100),
      b = signal(200),
      reads: string[] = [];
    const replacement = ɵsettledReader(() => {
      const odd = reads.length % 2 === 0;
      reads.push(odd ? 'a' : 'b');
      return odd ? a() : b();
    });
    const { exports } = load(
      `export const Row=craftComponent('MutableSUFFIX',{},inputs=>div({'data-row':function*(){return (yield* inputs.row()).id;}},[span(inputs.position),span(inputs.position),span(function*(){inputs.position=replacement;return '|';})]));` +
        app,
      { items, replacement },
    );
    (compiledTemplateFor(exports.Row)! as any).scalarFusion = enabled;
    const m = mount(exports.App);
    try {
      items.update((rows) => [...rows].reverse());
      m.flush();
      reads.length = 0;
      a.set(101);
      m.flush();
      return { reads: [...reads], text: m.host.textContent };
    } finally {
      m.destroy();
    }
  };
  const ordinary = run(false),
    fused = run(true);
  expect(ordinary.reads).toEqual(['a', 'b']);
  expect(fused.reads).toEqual(['a', 'b', 'a', 'b']);
  expect(fused).not.toEqual(ordinary);
});
