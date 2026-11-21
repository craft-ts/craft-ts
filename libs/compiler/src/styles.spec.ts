// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import ts from 'typescript';
import * as api from '@craft-ts/component';
import * as runtime from '@craft-ts/component/compiler-runtime';
import {
  createBrowserDomAdapter,
  provideCraftProduction,
  provideCraftDevelopment,
  provideCraftSecurityPolicy,
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
  "import {craftComponent,div,span,h,forNode,type Input} from '@craft-ts/component';";
const modes = [
  { lean: false, dom: 'create' as const },
  { lean: false, dom: 'clone' as const },
  { lean: true, dom: 'create' as const },
  { lean: true, dom: 'clone' as const },
];
function load(
  body: string,
  globals: Record<string, unknown> = {},
  options: { lean?: boolean; dom?: 'create' | 'clone' } = {},
) {
  const source = header + body.replaceAll('SUFFIX', String(serial++)),
    result = compileModule(source, 'attrs.ts', options),
    exports: any = {};
  const js = ts.transpileModule(result.code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), js)(
    (name: string) => (name.endsWith('/compiler-runtime') ? runtime : api),
    exports,
    ...Object.values(globals),
  );
  return { exports, result, source };
}
function mount(
  App: any,
  development = false,
  extra: ReturnType<typeof provideCraftSecurityPolicy>[] = [],
) {
  const host = document.createElement('div'),
    injector = createEnvironmentInjector(
      [
        development ? provideCraftDevelopment() : provideCraftProduction(),
        ...extra,
      ],
      Injector.NULL as EnvironmentInjector,
      'attrs',
    );
  const renderer = createBrowserDomAdapter(document),
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
    setAttribute,
    destroy() {
      view.destroy();
      injector.destroy();
    },
  };
}
function html(host: HTMLElement) {
  const copy = host.cloneNode(true) as HTMLElement;
  for (const element of copy.querySelectorAll('*')) {
    const attributes = [...element.attributes]
      .map((a) => [a.name, a.value] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const attribute of [...element.attributes])
      element.removeAttribute(attribute.name);
    for (const [name, value] of attributes) element.setAttribute(name, value);
  }
  return copy.innerHTML.replace(/<!--.*?-->/g, '');
}
it.each(modes.filter((mode) => mode.lean))(
  'compiles dynamic styles with generic object/string/removal semantics: %j',
  (options) => {
    const width = signal(10),
      tone = signal('red'),
      shape = signal(0),
      styleReads = vi.fn(() =>
        shape() === 0
          ? { width: width() + 'px', '--tone': () => tone() }
          : shape() === 1
            ? 'height: 7px'
            : null,
      );
    const { exports, result } = load(
      `export const Row=craftComponent('StyleSUFFIX',{},()=>h('div',{attrs:{role:'row'},style:()=>styleReads()},'body'));export const App=craftComponent('StyleOwnerSUFFIX',{},()=>Row({}));`,
      { styleReads },
      options,
    );
    expect(result.components[0].status).toBe('compiled');
    expect(compiledTemplateFor(exports.Row)?.version).toBe(3);
    const m = mount(exports.App);
    try {
      const root = m.host.firstElementChild as HTMLElement;
      expect(root.style.width).toBe('10px');
      expect(root.style.getPropertyValue('--tone')).toBe('red');
      width.set(20);
      m.flush();
      expect(root.style.width).toBe('20px');
      tone.set('blue');
      m.flush();
      expect(root.style.getPropertyValue('--tone')).toBe('blue');
      root.style.backgroundColor = 'green';
      styleReads.mockClear();
      tone.set('blue');
      m.flush();
      expect(styleReads).not.toHaveBeenCalled();
      expect(root.style.backgroundColor).toBe('green');
      shape.set(1);
      m.flush();
      expect(root.getAttribute('style')).toBe('height: 7px');
      shape.set(2);
      m.flush();
      expect(root.hasAttribute('style')).toBe(false);
      expect(m.host.firstElementChild).toBe(root);
      const generic = mount(exports.App, true);
      try {
        expect(html(m.host)).toBe(html(generic.host));
      } finally {
        generic.destroy();
      }
      styleReads.mockClear();
      m.view.destroy();
      width.set(30);
      shape.set(0);
      m.flush();
      expect(styleReads).not.toHaveBeenCalled();
    } finally {
      m.destroy();
    }
  },
);
it('does not rewrite unchanged resolved style objects', () => {
  const tick = signal(0),
    read = vi.fn(() => {
      tick();
      return { width: '10px' };
    });
  const { exports } = load(
    `export const Row=craftComponent('StableStyleSUFFIX',{},()=>div({style:()=>read()},'row'));export const App=craftComponent('StableStyleOwnerSUFFIX',{},()=>Row({}));`,
    { read },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    const root = m.host.firstElementChild as HTMLElement;
    root.style.backgroundColor = 'red';
    tick.set(1);
    m.flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(root.style.backgroundColor).toBe('red');
  } finally {
    m.destroy();
  }
});
it('evaluates style bindings after attributes and class even when the key comes first', () => {
  const calls: string[] = [],
    style = () => {
      calls.push('style');
      return { width: '1px' };
    },
    attribute = () => {
      calls.push('attribute');
      return 'title';
    },
    klass = () => {
      calls.push('class');
      return 'row';
    };
  const { exports } = load(
    `export const Row=craftComponent('StyleOrderSUFFIX',{},()=>h('div',{style:()=>style(),class:()=>klass(),title:()=>attribute()},'row'));export const App=craftComponent('StyleOrderOwnerSUFFIX',{},()=>Row({}));`,
    { style, attribute, klass },
    { lean: true },
  );
  const generic = mount(exports.App, true),
    expected = [...calls];
  generic.destroy();
  calls.length = 0;
  const m = mount(exports.App);
  try {
    expect(calls).toEqual(expected);
    expect(calls).toEqual(['attribute', 'class', 'style']);
  } finally {
    m.destroy();
  }
});
it('rebinds styles after eager source changes without losing unrelated DOM', () => {
  const width = signal(10),
    eager = signal('first');
  const { exports } = load(
    `export const Row=craftComponent('WatchedStyleSUFFIX',{},()=>div({style:()=>({width:width()+'px'}),title:eager()},'row'));export const App=craftComponent('WatchedStyleOwnerSUFFIX',{},()=>Row({}));`,
    { width, eager },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    const root = m.host.firstElementChild as HTMLElement;
    eager.set('after');
    m.flush();
    width.set(20);
    m.flush();
    expect(root.title).toBe('after');
    expect(root.style.width).toBe('20px');
    expect(m.host.firstElementChild).toBe(root);
  } finally {
    m.destroy();
  }
});
it('uses generic styled islands for static objects and arbitrary property helpers', () => {
  const width = signal(10),
    styleRecord = { width: () => width() + 'px' };
  const { exports, result } = load(
    `export const Row=craftComponent('StyleIslandSUFFIX',{},()=>div({attrs:{role:'row'}},[span({style:styleRecord},'styled'),span('plain')]));export const App=craftComponent('StyleIslandOwnerSUFFIX',{},()=>Row({}));`,
    { styleRecord },
    { lean: true },
  );
  expect(result.components[0].status).toBe('compiled');
  expect(result.components[0].holes).toBe(1);
  const m = mount(exports.App);
  try {
    const span = m.host.querySelector('span')!;
    expect(span.style.width).toBe('10px');
    width.set(20);
    m.flush();
    expect(span.style.width).toBe('20px');
    expect(m.host.querySelector('span')).toBe(span);
  } finally {
    m.destroy();
  }
});
it('keeps unsupported root style syntax generic', () => {
  for (const expression of [
    "{width:'1px'}",
    "'width:1px'",
    'styleRecord',
    'makeStyle()',
    'async()=>styleRecord',
  ]) {
    const { result } = load(
      `export const Row=craftComponent('UnsupportedStyleSUFFIX',{},()=>div({style:${expression}},'row'));`,
      { styleRecord: {}, makeStyle: () => ({}) },
      { lean: true },
    );
    expect(result.components[0].status).toBe('fallback');
  }
});
it.each([true, false])(
  'keeps styles generic for object inputs requiring ownership (eager=%s)',
  (watched) => {
    const width = signal(10),
      eager = signal('first');
    const { exports } = load(
      `export const Row=craftComponent('OwnedStyleSUFFIX',{},()=>div({style:()=>({width:width()+'px'}),title:${watched ? 'eager()' : "'after'"}},'row'));export const App=craftComponent('OwnedStyleOwnerSUFFIX',{},()=>Row({extra:{}}));`,
      { width, eager },
      { lean: true },
    );
    const m = mount(exports.App);
    try {
      const root = m.host.firstElementChild as HTMLElement;
      eager.set('after');
      width.set(20);
      m.flush();
      expect(root.title).toBe('after');
      expect(root.style.width).toBe('20px');
    } finally {
      m.destroy();
    }
  },
);
it('cleans up a failed initial style subscriber', () => {
  const width = signal(1),
    read = vi.fn(() => {
      width();
      throw Error('style failed');
    });
  const { exports } = load(
    `export const Row=craftComponent('FailStyleSUFFIX',{},()=>div({style:()=>read()},'row'));export const App=craftComponent('FailStyleOwnerSUFFIX',{},()=>Row({}));`,
    { read },
    { lean: true },
  );
  const injector = createEnvironmentInjector(
      [provideCraftProduction()],
      Injector.NULL as EnvironmentInjector,
      'failed-style',
    ),
    host = document.createElement('div');
  try {
    expect(() =>
      mountInterpretedComponentWithOptions(
        exports.App,
        host,
        injector,
        {},
        { renderer: createBrowserDomAdapter(document) },
      ),
    ).toThrow('style failed');
    read.mockClear();
    width.set(2);
    expect(read).not.toHaveBeenCalled();
  } finally {
    injector.destroy();
  }
});
it('drives style generators without lowering them and preserves keyed list DOM', () => {
  const items = signal([
    { id: 0, width: 10 },
    { id: 1, width: 20 },
  ]);
  const { exports, result } = load(
    `export const Row=craftComponent('GeneratorStyleSUFFIX',{},inputs=>div({'data-row':function*(){return (yield* inputs.row()).id;},style:function*(){return{width:(yield* inputs.row()).width+'px'};}},'row'));export const App=craftComponent('GeneratorStyleOwnerSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},row=>Row({row}))));`,
    { items },
    { lean: true },
  );
  expect(result.components[0].status).toBe('compiled');
  const plan = compiledTemplateFor(exports.Row)!;
  expect(
    plan.bindings.find((binding) => binding.key === 'style')?.lowered,
  ).toBeUndefined();
  const m = mount(exports.App);
  try {
    const first = m.host.querySelector('[data-row="0"]') as HTMLElement;
    expect(first.style.width).toBe('10px');
    items.set([
      { id: 1, width: 30 },
      { id: 0, width: 40 },
    ]);
    m.flush();
    expect(first.style.width).toBe('40px');
    expect(m.host.querySelector('[data-row="0"]')).toBe(first);
    items.set([]);
    m.flush();
    expect(m.host.querySelector('[data-row]')).toBeNull();
  } finally {
    m.destroy();
  }
});
it.each([
  'width: expression(alert(1))',
  'behavior: url(#default#time2)',
  'background: url(//evil.test/x.png)',
  'background: url(https://cdn.evil.test/x.png)',
])('retains the CSS security guard: %s', (css) => {
  const { exports } = load(
    `export const Row=craftComponent('UnsafeStyleSUFFIX',{},()=>div({style:()=>css},'row'));export const App=craftComponent('UnsafeStyleOwnerSUFFIX',{},()=>Row({}));`,
    { css },
    { lean: true },
  );
  const injector = createEnvironmentInjector(
    [provideCraftProduction()],
    Injector.NULL as EnvironmentInjector,
    'unsafe-style',
  );
  try {
    expect(() =>
      mountInterpretedComponentWithOptions(
        exports.App,
        document.createElement('div'),
        injector,
        {},
        { renderer: createBrowserDomAdapter(document) },
      ),
    ).toThrow();
  } finally {
    injector.destroy();
  }
});
it('uses the component security policy on initial and subsequent style reads', () => {
  const url = signal('https://cdn.ok.test/one.png');
  const { exports } = load(
    `export const Row=craftComponent('PolicyStyleSUFFIX',{},()=>div({style:()=>({backgroundImage:'url('+url()+')'})},'row'));export const App=craftComponent('PolicyStyleOwnerSUFFIX',{},()=>Row({}));`,
    { url },
    { lean: true },
  );
  const m = mount(exports.App, false, [
    provideCraftSecurityPolicy({
      dom: { allowedResourceOrigins: ['https://cdn.ok.test'] },
    }),
  ]);
  try {
    const root = m.host.firstElementChild as HTMLElement;
    expect(root.style.backgroundImage).toContain('/one.png');
    url.set('https://cdn.ok.test/two.png');
    m.flush();
    expect(root.style.backgroundImage).toContain('/two.png');
  } finally {
    m.destroy();
  }
});
it.each([
  "span({get style(){return {width:read()};}},'styled')",
  "span({style:{get width(){return read();}}},'styled')",
])('keeps generic styled getter dependencies: %s', (child) => {
  const width = signal(10),
    read = () => width() + 'px';
  const { exports, result } = load(
    `export const Row=craftComponent('GetterIslandSUFFIX',{},()=>div({attrs:{role:'row'}},${child}));export const App=craftComponent('GetterIslandOwnerSUFFIX',{},()=>Row({}));`,
    { read },
    { lean: true },
  );
  expect(result.components[0].status).toBe('compiled');
  const m = mount(exports.App),
    generic = mount(exports.App, true);
  try {
    expect(
      (generic.host.querySelector('span') as HTMLElement).style.width,
    ).toBe('10px');
    width.set(20);
    m.flush();
    generic.flush();
    expect(
      (generic.host.querySelector('span') as HTMLElement).style.width,
    ).toBe('20px');
    expect(html(m.host)).toBe(html(generic.host));
  } finally {
    m.destroy();
    generic.destroy();
  }
});
it('cleans up an initial failure in a generic styled island', () => {
  const width = signal(1),
    read = vi.fn(() => {
      width();
      throw Error('island style failed');
    });
  const { exports } = load(
    `export const Row=craftComponent('FailIslandSUFFIX',{},()=>div({attrs:{role:'row'}},span({style:{width:()=>read()}},'row')));export const App=craftComponent('FailIslandOwnerSUFFIX',{},()=>Row({}));`,
    { read },
    { lean: true },
  );
  const injector = createEnvironmentInjector(
    [provideCraftProduction()],
    Injector.NULL as EnvironmentInjector,
    'failed-island',
  );
  try {
    expect(() =>
      mountInterpretedComponentWithOptions(
        exports.App,
        document.createElement('div'),
        injector,
        {},
        { renderer: createBrowserDomAdapter(document) },
      ),
    ).toThrow('island style failed');
    read.mockClear();
    width.set(2);
    expect(read).not.toHaveBeenCalled();
  } finally {
    injector.destroy();
  }
});
