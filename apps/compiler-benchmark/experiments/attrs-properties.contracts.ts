// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import ts from 'typescript';
import * as api from '@craft-ts/component';
import * as runtime from '@craft-ts/component/compiler-runtime';
import {
  createBrowserDomAdapter,
  provideCraftProduction,
  provideCraftDevelopment,
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
function mount(App: any, development = false) {
  const host = document.createElement('div'),
    injector = createEnvironmentInjector(
      [development ? provideCraftDevelopment() : provideCraftProduction()],
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
it.each(modes)(
  'flattens literal attrs and keeps live nested values independent: %j',
  (options) => {
    const a = signal('a'),
      b = signal('b'),
      readsA = vi.fn(() => a()),
      readsB = vi.fn(() => b());
    const { exports, result } = load(
      `export const Row=craftComponent('AttrsSUFFIX',{},()=>div({attrs:{role:'progressbar','aria-hidden':false,'data-gone':null,'data-a':function*(){return readsA();}},title:function*(){return readsB();}},'body'));export const App=craftComponent('OwnerSUFFIX',{},()=>Row({}));`,
      { readsA, readsB },
      options,
    );
    expect(result.components[0].status).toBe('compiled');
    expect(compiledTemplateFor(exports.Row)).toBeDefined();
    const m = mount(exports.App);
    try {
      const root = m.host.firstElementChild;
      expect(root?.getAttribute('role')).toBe('progressbar');
      expect(root?.getAttribute('aria-hidden')).toBe('false');
      expect(root?.hasAttribute('data-gone')).toBe(false);
      readsA.mockClear();
      readsB.mockClear();
      a.set('A');
      m.flush();
      expect(readsA).toHaveBeenCalledOnce();
      expect(readsB).not.toHaveBeenCalled();
      expect(root?.getAttribute('data-a')).toBe('A');
      expect(m.host.firstElementChild).toBe(root);
      const generic = mount(exports.App, true);
      try {
        expect(html(m.host)).toBe(html(generic.host));
      } finally {
        generic.destroy();
      }
      m.view.destroy();
      readsA.mockClear();
      a.set('after');
      m.flush();
      expect(readsA).not.toHaveBeenCalled();
      expect(m.host.textContent).toBe('');
    } finally {
      m.destroy();
    }
  },
);
it.each(modes)(
  'normalizes literal h helpers without named-tag semantics: %j',
  (options) => {
    const { exports, result } = load(
      `export const Row=craftComponent('HSUFFIX',{},()=>h('div',{attrs:{role:'group'}},[h('span','text'),h('span',{'data-child':'yes'},'end')]));export const App=craftComponent('HOwnerSUFFIX',{},()=>Row({}));`,
      {},
      options,
    );
    expect(result.components[0].status).toBe('compiled');
    const m = mount(exports.App),
      generic = mount(exports.App, true);
    try {
      expect(html(m.host)).toBe(html(generic.host));
      expect(m.host.querySelectorAll('span')).toHaveLength(2);
      expect(m.host.querySelector('[data-craft-name]')).toBeNull();
    } finally {
      m.destroy();
      generic.destroy();
    }
  },
);
it('resolves h import aliases by symbol and refuses lexical shadows', () => {
  const source =
    "import {craftComponent,h as element,span as text} from '@craft-ts/component';export const Row=craftComponent('Alias',{},()=>element('div',{attrs:{role:'group'}},text('child')));";
  const result = compileModule(source, 'alias.ts', { lean: true });
  expect(result.components[0].status).toBe('compiled');
  expect(result.compiledExports).toEqual(['Row']);
  for (const shadow of [
    source.replace('()=>element', '(element:any)=>element'),
    source.replace(
      'export const Row=',
      'function factory(element:any){const Row=',
    ) + '}',
  ])
    expect(
      compileModule(shadow, 'shadow.ts', { lean: true }).components[0].status,
    ).toBe('fallback');
});
it('keeps unknown attrs, accessors, computed keys, collisions and reserved properties generic', () => {
  const cases = [
    `div({attrs:record})`,
    `div({attrs:{...record}})`,
    `div({attrs:{get title(){return read();}}})`,
    `div({attrs:{['title']:'x'}})`,
    `div({attrs:{class:'x'}})`,
    `div({attrs:{style:'color:red'}})`,
    `div({attrs:{onclick:'evil()'}})`,
    `div({attrs:{href:'javascript:evil()'}})`,
    `div({attrs:{'data-craft-name':'x'}})`,
    `div({attrs:{__proto__:record}})`,
    `div({attrs:{id:'a'},id:'b'})`,
    `div({attrs:{id:'a'},attrs:{title:'b'}})`,
    `div({attrs})`,
    `h(tag,{},'child')`,
    `h('input',{value:'x'})`,
    `h('div',record)`,
    `h('div','name',{role:'group'})`,
    `h('div',{},'a','b')`,
  ];
  for (const expression of cases) {
    const source =
      header + `const Row=craftComponent('Refusal',{},()=>${expression});`;
    const result = compileModule(source, 'refusal.ts', { lean: true });
    expect(result.components[0].status, expression).toBe('fallback');
    expect(result.code, expression).toBe(source);
  }
});
it.each([
  `div(null,span(()=>read()))`,
  `div('name',null,span(()=>read()))`,
  `h('div',null,span(()=>read()))`,
])(
  'keeps null helper overloads on their actual generic semantics: %s',
  (expression) => {
    const read = vi.fn(() => 'ignored');
    const { exports, result } = load(
      `export const Row=craftComponent('NullSUFFIX',{},()=>${expression});export const App=craftComponent('NullOwnerSUFFIX',{},()=>Row({}));`,
      { read },
      { lean: true },
    );
    expect(result.components[0].status).toBe('fallback');
    const m = mount(exports.App),
      generic = mount(exports.App, true);
    try {
      expect(m.host.textContent).toBe('');
      expect(html(m.host)).toBe(html(generic.host));
      expect(read).not.toHaveBeenCalled();
    } finally {
      m.destroy();
      generic.destroy();
    }
  },
);
it('evaluates nonconstant literal attribute values once and in source order', () => {
  const run = (development: boolean) => {
    const log: string[] = [],
      value = (name: string) => {
        log.push(name);
        return name;
      };
    const { exports } = load(
      `export const Row=craftComponent('OrderSUFFIX',{},()=>div({title:value('first'),attrs:{'data-a':value('second'),'data-b':value('third')},'data-c':value('fourth')},'body'));export const App=craftComponent('OrderOwnerSUFFIX',{},()=>Row({}));`,
      { value },
      { lean: true },
    );
    const m = mount(exports.App, development);
    try {
      return log;
    } finally {
      m.destroy();
    }
  };
  expect(run(false)).toEqual(['first', 'second', 'third', 'fourth']);
  expect(run(false)).toEqual(run(true));
});
it('preserves keyed list identity and rebinds nested attribute readers', () => {
  const items = signal([
    { id: 0, label: 'zero' },
    { id: 1, label: 'one' },
  ]);
  const { exports } = load(
    `export const Row=craftComponent('ListAttrsSUFFIX',{},inputs=>h('div',{attrs:{role:'row','data-row':function*(){return (yield* inputs.row()).id;}},title:function*(){return (yield* inputs.row()).label;}},function*(){return (yield* inputs.row()).label;}));export const App=craftComponent('ListOwnerSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},row=>Row({row}))));`,
    { items },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    const first = m.host.querySelector('[data-row="0"]');
    items.set([
      { id: 0, label: 'ZERO' },
      { id: 1, label: 'one' },
    ]);
    m.flush();
    expect(m.host.querySelector('[data-row="0"]')).toBe(first);
    expect(first?.textContent).toBe('ZERO');
    expect(first?.getAttribute('title')).toBe('ZERO');
    items.update((rows) => [...rows].reverse());
    m.flush();
    expect(m.host.querySelector('[data-row="0"]')).toBe(first);
    const generic = mount(exports.App, true);
    try {
      expect(html(m.host)).toBe(html(generic.host));
    } finally {
      generic.destroy();
    }
  } finally {
    m.destroy();
  }
});
it.each([
  "div({attrs:{title:value()}},'row')",
  "div({attrs:{title:record.title}},'row')",
  "h('div',{title:value()},'row')",
  "h('div',{title:record.title},'row')",
  "h('div',{},value())",
])('preserves template-level reactive scalar reads: %s', (expression) => {
  const value = signal('first'),
    record = {
      get title() {
        return value();
      },
    };
  const { exports, result } = load(
    `export const Row=craftComponent('EagerReadSUFFIX',{},()=>${expression});export const App=craftComponent('EagerOwnerSUFFIX',{},()=>Row({}));`,
    { value, record },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    value.set('after');
    m.flush();
    expect(compiledTemplateFor(exports.Row)?.version).toBe(2);
    expect({
      status: result.components[0].status,
      value: expression.includes('{},value()')
        ? m.host.textContent
        : m.host.firstElementChild?.getAttribute('title'),
    }).toEqual({ status: 'compiled', value: 'after' });
  } finally {
    m.destroy();
  }
});
it('keeps source and deferred-binding dependencies separate while reusing DOM', () => {
  const run = (development: boolean) => {
    const a = signal('a'),
      b = signal('b'),
      readA = vi.fn(() => a()),
      readB = vi.fn(() => b());
    const { exports } = load(
      `export const Row=craftComponent('SourcesSUFFIX',{},()=>div({attrs:{role:'row'},title:readA()},span(()=>readB())));export const App=craftComponent('SourcesOwnerSUFFIX',{},()=>Row({}));`,
      { readA, readB },
      { lean: true },
    );
    const m = mount(exports.App, development);
    try {
      const root = m.host.firstElementChild,
        span = m.host.querySelector('span'),
        trace = [];
      readA.mockClear();
      readB.mockClear();
      b.set('B');
      m.flush();
      trace.push([
        readA.mock.calls.length,
        readB.mock.calls.length,
        m.host.textContent,
      ]);
      readA.mockClear();
      readB.mockClear();
      a.set('A');
      m.flush();
      trace.push([
        readA.mock.calls.length,
        readB.mock.calls.length,
        m.host.firstElementChild?.getAttribute('title'),
      ]);
      expect(m.host.firstElementChild).toBe(root);
      expect(m.host.querySelector('span')).toBe(span);
      m.view.destroy();
      readA.mockClear();
      readB.mockClear();
      a.set('after');
      b.set('after');
      m.flush();
      expect(readA).not.toHaveBeenCalled();
      expect(readB).not.toHaveBeenCalled();
      return trace;
    } finally {
      m.destroy();
    }
  };
  expect(run(false)).toEqual(run(true));
  expect(run(false)).toEqual([
    [0, 1, 'B'],
    [1, 1, 'A'],
  ]);
});
it.each(['object', 'callback'])(
  'keeps eager source updates when %s inputs require an owned component',
  (kind) => {
    const value = signal('first');
    const { exports } = load(
      `export const Row=craftComponent('OwnedSourceSUFFIX',{},()=>div({attrs:{role:'row'},title:value()},'row'));export const App=craftComponent('OwnedSourceOwnerSUFFIX',{},()=>Row({extra}));`,
      { value, extra: kind === 'object' ? {} : () => undefined },
      { lean: true },
    );
    const m = mount(exports.App);
    try {
      value.set('after');
      m.flush();
      expect(m.host.firstElementChild?.getAttribute('title')).toBe('after');
    } finally {
      m.destroy();
    }
  },
);
it('retracks conditional source dependencies', () => {
  const enabled = signal(true),
    a = signal('a'),
    b = signal('b'),
    choose = vi.fn(() => (enabled() ? a() : b()));
  const { exports } = load(
    `export const Row=craftComponent('SwitchSUFFIX',{},()=>div({attrs:{role:'row'},title:choose()},'row'));export const App=craftComponent('SwitchOwnerSUFFIX',{},()=>Row({}));`,
    { choose },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    enabled.set(false);
    m.flush();
    choose.mockClear();
    a.set('ignored');
    m.flush();
    expect(choose).not.toHaveBeenCalled();
    b.set('B');
    m.flush();
    expect(choose).toHaveBeenCalledOnce();
    expect(m.host.firstElementChild?.getAttribute('title')).toBe('B');
  } finally {
    m.destroy();
  }
});
it('tracks a scalar exposed through an ambient getter', () => {
  const value = signal('first'),
    name = '__craftAttrsGetter' + serial++;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get: () => value(),
  });
  try {
    const { exports } = load(
      `export const Row=craftComponent('AmbientSUFFIX',{},()=>div({attrs:{role:'row'},title:${name}},'row'));export const App=craftComponent('AmbientOwnerSUFFIX',{},()=>Row({}));`,
      {},
      { lean: true },
    );
    const m = mount(exports.App);
    try {
      value.set('after');
      m.flush();
      expect(m.host.firstElementChild?.getAttribute('title')).toBe('after');
    } finally {
      m.destroy();
    }
  } finally {
    Reflect.deleteProperty(globalThis, name);
  }
});
it.each(['callback', 'generator'])(
  'renders %s shortcuts in a watched hole without normalizing them twice',
  (kind) => {
    const value = signal('first');
    const record = {
      get shortcut() {
        return kind === 'callback'
          ? () => value()
          : (function* () {
              return value();
            })();
      },
    };
    const { exports, result } = load(
      `export const Row=craftComponent('ShortcutSUFFIX',{},()=>h('div',{attrs:{role:'row'},title:value()},record.shortcut));export const App=craftComponent('ShortcutOwnerSUFFIX',{},()=>Row({}));`,
      { value, record },
      { lean: true },
    );
    expect(result.components[0].status).toBe('compiled');
    const m = mount(exports.App);
    try {
      expect(m.host.textContent).toBe('first');
      const element = m.host.firstElementChild;
      value.set('after');
      m.flush();
      expect(m.host.textContent).toBe('after');
      expect(m.host.firstElementChild).toBe(element);
    } finally {
      m.destroy();
    }
  },
);
it('preserves eager expression order across attributes, listeners and holes', () => {
  const calls: string[] = [];
  const listener = () => {
    calls.push('listener');
    return () => undefined;
  };
  const attribute = () => {
    calls.push('attribute');
    return 'title';
  };
  const child = () => {
    calls.push('child');
    return api.span('body');
  };
  const { exports } = load(
    `export const Row=craftComponent('OrderSUFFIX',{},()=>h('div',{click:listener(),attrs:{title:attribute()}},[child(),h('span',{attrs:{title:attribute()}},'end')]));export const App=craftComponent('OrderOwnerSUFFIX',{},()=>Row({}));`,
    { listener, attribute, child },
    { lean: true },
  );
  const generic = mount(exports.App, true);
  const expected = [...calls];
  generic.destroy();
  calls.length = 0;
  const m = mount(exports.App);
  try {
    expect(calls).toEqual(expected);
    expect(calls).toEqual(['listener', 'attribute', 'child', 'attribute']);
  } finally {
    m.destroy();
  }
});
it('does not rerun pure reader factories for deferred updates', () => {
  const value = signal('first'),
    factory = vi.fn(() => () => value());
  const { exports } = load(
    `export const Row=craftComponent('FactorySUFFIX',{},()=>div({attrs:{role:'row'},title:factory()},'row'));export const App=craftComponent('FactoryOwnerSUFFIX',{},()=>Row({}));`,
    { factory },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    expect(factory).toHaveBeenCalledOnce();
    value.set('second');
    m.flush();
    value.set('third');
    m.flush();
    expect(factory).toHaveBeenCalledOnce();
    expect(m.host.firstElementChild?.getAttribute('title')).toBe('third');
  } finally {
    m.destroy();
  }
});
it('stops the previous source watcher when list inputs rebind or disappear', () => {
  const value = signal('first'),
    read = vi.fn(() => value()),
    items = signal([
      { id: 0, label: 'zero' },
      { id: 1, label: 'one' },
    ]);
  const { exports } = load(
    `export const Row=craftComponent('RebindSUFFIX',{},inputs=>h('div',{attrs:{role:'row'},'data-row':function*(){return (yield* inputs.row()).id;},title:read()},function*(){return (yield* inputs.row()).label;}));export const App=craftComponent('RebindOwnerSUFFIX',{},()=>div(forNode(items,{track:row=>row.id},row=>Row({row}))));`,
    { items, read },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    const first = m.host.querySelector('[data-row="0"]');
    items.update((rows) => [{ id: 0, label: 'ZERO' }, rows[1]]);
    m.flush();
    expect(m.host.querySelector('[data-row="0"]')).toBe(first);
    expect(first?.textContent).toBe('ZERO');
    read.mockClear();
    value.set('second');
    m.flush();
    expect(read).toHaveBeenCalledTimes(2);
    items.update((rows) => rows.filter((row) => row.id !== 0));
    m.flush();
    read.mockClear();
    value.set('third');
    m.flush();
    expect(read).toHaveBeenCalledOnce();
    m.view.destroy();
    read.mockClear();
    value.set('after');
    m.flush();
    expect(read).not.toHaveBeenCalled();
  } finally {
    m.destroy();
  }
});
it('keeps unbound input DOM state when eager child arrays grow', () => {
  const count = signal(1),
    children = () => [
      api.input({ type: 'text', value: 'initial', 'data-child': 'first' }),
      ...(count() > 1 ? [api.span('second')] : []),
    ];
  const { exports } = load(
    `export const Row=craftComponent('DynamicChildrenSUFFIX',{},()=>div([children(),span('tail')]));export const App=craftComponent('DynamicOwnerSUFFIX',{},()=>Row({}));`,
    { children },
    { lean: true },
  );
  const m = mount(exports.App);
  try {
    const input = m.host.querySelector('input')!;
    input.value = 'typed';
    count.set(2);
    m.flush();
    expect(m.host.querySelector('input')).toBe(input);
    expect(input.value).toBe('typed');
    expect(m.host.textContent).toBe('secondtail');
    count.set(1);
    m.flush();
    expect(m.host.querySelector('input')).toBe(input);
    expect(m.host.textContent).toBe('tail');
  } finally {
    m.destroy();
  }
});
it('cleans a source subscription when the initial bind throws', () => {
  const value = signal(0),
    read = vi.fn(() => {
      value();
      throw Error('bind failure');
    });
  const { exports } = load(
    `export const Row=craftComponent('FailureSUFFIX',{},()=>div({attrs:{role:'row'},title:read()},'row'));export const App=craftComponent('FailureOwnerSUFFIX',{},()=>Row({}));`,
    { read },
    { lean: true },
  );
  const injector = createEnvironmentInjector(
    [provideCraftProduction()],
    Injector.NULL as EnvironmentInjector,
    'failed-bind',
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
    ).toThrow('bind failure');
    read.mockClear();
    value.set(1);
    injector.get(ɵEffectScheduler).flush();
    expect(read).not.toHaveBeenCalled();
  } finally {
    injector.destroy();
  }
});
