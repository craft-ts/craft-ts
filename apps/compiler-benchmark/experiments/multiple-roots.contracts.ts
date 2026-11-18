// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import ts from 'typescript';
import * as api from '@craft-ts/component';
import * as runtime from '@craft-ts/component/compiler-runtime';
import {
  createBrowserDomAdapter,
  provideCraftProduction,
  provideCraftDevelopment,
  ɵcaptureCraftReplayTarget,
  ɵresolveCraftReplayTarget,
} from '@craft-ts/core';
import {
  createEnvironmentInjector,
  Injector,
  type EnvironmentInjector,
  signal,
  ɵEffectScheduler,
  DestroyRef,
  inject,
} from '../../component/src/lib/host-runtime';
import { mountInterpretedComponentWithOptions } from '../../component/src/lib/render/interpreter';
import { compiledTemplateFor } from '../../component/src/lib/render/compiled-template';
import { compileModule } from './compiler';
let serial = 0;
const header =
  "import {craftComponent,div,span,button,forNode,ifNode,type Input} from '@craft-ts/component';";
function load(
  body: string,
  globals: Record<string, unknown> = {},
  options: { lean?: boolean; dom?: 'create' | 'clone' } = {},
) {
  const result = compileModule(
    header + body.replaceAll('SUFFIX', String(serial++)),
    'roots.ts',
    options,
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
  return { exports, code: result.code, result };
}
function mount(
  App: any,
  development = false,
  configure?: (renderer: ReturnType<typeof createBrowserDomAdapter>) => void,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const injector = createEnvironmentInjector(
    [development ? provideCraftDevelopment() : provideCraftProduction()],
    Injector.NULL as EnvironmentInjector,
    'multiple-roots',
  );
  const renderer = createBrowserDomAdapter(document);
  configure?.(renderer);
  const setValue = vi.spyOn(renderer, 'setValue'),
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
    renderer,
    injector,
    view,
    flush,
    setValue,
    setAttribute,
    destroy() {
      try {
        view.destroy();
      } finally {
        injector.destroy();
        host.remove();
      }
    },
  };
}
function html(host: HTMLElement) {
  const copy = host.cloneNode(true) as HTMLElement;
  const walk = document.createTreeWalker(copy, 128),
    comments: Node[] = [];
  while (walk.nextNode()) comments.push(walk.currentNode);
  for (const comment of comments) comment.parentNode?.removeChild(comment);
  for (const element of copy.querySelectorAll('*')) {
    const attributes = [...element.attributes]
      .map((attribute) => [attribute.name, attribute.value] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const attribute of [...element.attributes])
      element.removeAttribute(attribute.name);
    for (const [name, value] of attributes) element.setAttribute(name, value);
  }
  return copy.innerHTML;
}
const modes = [
  { lean: false, dom: 'create' as const },
  { lean: false, dom: 'clone' as const },
  { lean: true, dom: 'create' as const },
  { lean: true, dom: 'clone' as const },
];
it.each(modes)(
  'compiles nested arrays and mixed roots, preserves root scopes and independent updates: %j',
  (options) => {
    const value = signal('live'),
      reads = vi.fn(() => value());
    const { exports } = load(
      `export const Row=craftComponent('MixedSUFFIX',{},()=>[null,div({'data-first':'yes'},'first'),[false,' / ',span(()=>reads())]]);export const App=craftComponent('OwnerSUFFIX',{},()=>Row({}));`,
      { reads },
      options,
    );
    const plan = compiledTemplateFor(exports.Row)!;
    expect(plan.roots).toEqual([0, 2, 3]);
    expect(plan.elements.map((e) => e.path)).toEqual([[0], [2]]);
    const created = vi.spyOn(plan, 'create');
    const m = mount(exports.App);
    try {
      expect(created).toHaveBeenCalledOnce();
      const elements = [...m.host.children],
        text = m.host.childNodes[1];
      expect(m.host.textContent).toBe('first / live');
      expect(elements.map((e) => e.getAttribute('data-craft-root'))).toEqual([
        elements[0].getAttribute('data-craft-root'),
        elements[0].getAttribute('data-craft-root'),
      ]);
      reads.mockClear();
      value.set('changed');
      m.flush();
      expect(reads).toHaveBeenCalledOnce();
      expect([...m.host.children]).toEqual(elements);
      expect(m.host.childNodes[1]).toBe(text);
      const actual = html(m.host),
        scopes = elements.map((e) => e.getAttribute('data-craft-root'));
      const generic = mount(exports.App, true);
      try {
        expect(html(generic.host)).toBe(actual);
        expect(
          [...generic.host.children].map((e) =>
            e.getAttribute('data-craft-root'),
          ),
        ).toEqual(scopes);
      } finally {
        generic.destroy();
      }
      m.view.destroy();
      reads.mockClear();
      value.set('after');
      m.flush();
      expect(m.host.textContent).toBe('');
      expect(reads).not.toHaveBeenCalled();
    } finally {
      m.destroy();
    }
  },
);
it.each(modes)(
  'moves the full keyed root range and keeps trailing siblings: %j',
  (options) => {
    const items = signal([
      { id: 0, label: 'zero' },
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
    ]);
    const { exports } = load(
      `export const Row=craftComponent('RangeSUFFIX',{},inputs=>[div({'data-row':function*(){return (yield* inputs.row()).id;}},function*(){return (yield* inputs.row()).label;}),' / ',span({'data-index':inputs.position},inputs.position)]);export const App=craftComponent('ListSUFFIX',{},()=>div([forNode(items,{track:row=>row.id},(row,position)=>Row({row,position})),span({'data-tail':'yes'},'end')]));`,
      { items },
      options,
    );
    const m = mount(exports.App);
    const first = m.host.querySelector('[data-row="0"]'),
      sibling = first?.nextSibling?.nextSibling,
      tail = m.host.querySelector('[data-tail]');
    try {
      const trace = [];
      const snapshot = () =>
        [...m.host.querySelectorAll('[data-row]')].map((e) => [
          e.getAttribute('data-row'),
          e.textContent,
          e.nextSibling?.nodeValue,
          (e.nextSibling?.nextSibling as Element)?.getAttribute('data-index'),
        ]);
      items.update((rows) => [...rows].reverse());
      m.flush();
      expect(m.host.querySelector('[data-row="0"]')).toBe(first);
      expect(first?.nextSibling?.nextSibling).toBe(sibling);
      expect(m.host.querySelector('[data-tail]')).toBe(tail);
      trace.push(snapshot());
      items.set([
        { id: 0, label: 'ZERO' },
        { id: 3, label: 'three' },
      ]);
      m.flush();
      expect(m.host.querySelector('[data-row="0"]')).toBe(first);
      expect(first?.nextSibling?.nextSibling).toBe(sibling);
      expect(first?.textContent).toBe('ZERO');
      trace.push(snapshot());
      items.set([]);
      m.flush();
      expect(m.host.textContent).toBe('end');
      items.set([
        { id: 4, label: 'four' },
        { id: 0, label: 'again' },
      ]);
      m.flush();
      trace.push(snapshot());
      expect(tail?.parentElement?.lastElementChild).toBe(tail);
      const generic = mount(exports.App, true);
      try {
        expect(html(generic.host)).toBe(html(m.host));
      } finally {
        generic.destroy();
      }
      expect(trace[0]).toEqual([
        ['2', 'two', ' / ', '0'],
        ['1', 'one', ' / ', '1'],
        ['0', 'zero', ' / ', '2'],
      ]);
    } finally {
      m.destroy();
    }
  },
);
it.each(['create', 'clone'] as const)(
  'preserves standard replay addresses, injector ownership and destruction: %s',
  (dom) => {
    const state = signal('a'),
      owners: EnvironmentInjector[] = [];
    const read = () => {
      owners.push(inject(Injector) as EnvironmentInjector);
      return state();
    };
    const { exports } = load(
      `export const Row=craftComponent('ReplaySUFFIX',{},()=>[div('first'),span(function*(){return read();})]);export const App=craftComponent('ReplayOwnerSUFFIX',{},()=>Row({}));`,
      { read },
      { dom },
    );
    const captures = [];
    for (const development of [false, true]) {
      const m = mount(exports.App, development);
      try {
        captures.push(
          [...m.host.children].map((element) =>
            ɵcaptureCraftReplayTarget(element),
          ),
        );
        const owner = owners.at(-1)!;
        expect(owner).not.toBe(m.injector);
        const callback = vi.fn();
        owner.get(DestroyRef).onDestroy(callback);
        const node = m.host.querySelector('span');
        state.update((value) => value + '!');
        m.flush();
        expect(m.host.querySelector('span')).toBe(node);
        expect(owners.at(-1)).toBe(owner);
        m.view.destroy();
        expect(callback).toHaveBeenCalledOnce();
        expect(m.host.textContent).toBe('');
        for (const capture of captures.at(-1)!)
          expect(ɵresolveCraftReplayTarget(capture!).status).toBe('missing');
      } finally {
        m.destroy();
      }
    }
    expect(captures[0]).toEqual(captures[1]);
  },
);
it.each(['create', 'clone'] as const)(
  'mounts holes and events within separate lean roots and removes listeners: %s',
  (dom) => {
    const count = signal(0),
      shown = signal(true),
      clicked = vi.fn(() => count.update((value) => value + 1));
    const { exports } = load(
      `export const Row=craftComponent('HolesSUFFIX',{},()=>[div([span('before'),ifNode('shown',function*(){return shown();},()=>span('inside')),span('after')]),button({click:clicked},function*(){return count();})]);export const App=craftComponent('HolesOwnerSUFFIX',{},()=>Row({}));`,
      { count, shown, clicked },
      { lean: true, dom },
    );
    const m = mount(exports.App);
    try {
      const button = m.host.querySelector('button')!;
      button.click();
      m.flush();
      expect(clicked).toHaveBeenCalledOnce();
      expect(button.textContent).toBe('1');
      shown.set(false);
      m.flush();
      expect(m.host.firstElementChild?.textContent).toBe('beforeafter');
      m.view.destroy();
      button.click();
      expect(clicked).toHaveBeenCalledOnce();
      expect(m.host.textContent).toBe('');
    } finally {
      m.destroy();
    }
  },
);
it('clones each blueprint root and falls back to creation when cloneNode is unavailable', () => {
  const { exports } = load(
    `export const Row=craftComponent('CloneSUFFIX',{},()=>[div('a'),span('b')]);export const App=craftComponent('CloneOwnerSUFFIX',{},()=>div([Row({}),Row({})]));`,
    {},
    { lean: true, dom: 'clone' },
  );
  const created = vi.spyOn(compiledTemplateFor(exports.Row)!, 'create');
  const m = mount(exports.App);
  try {
    expect(created).toHaveBeenCalledOnce();
    const divs = m.host.querySelectorAll(':scope > div > div'),
      spans = m.host.querySelectorAll('span');
    expect(divs).toHaveLength(2);
    expect(spans).toHaveLength(2);
    expect(divs[0]).not.toBe(divs[1]);
    expect(spans[0]).not.toBe(spans[1]);
  } finally {
    m.destroy();
  }
  created.mockClear();
  const fallback = mount(exports.App, false, (renderer) => {
    (renderer as { cloneNode?: unknown }).cloneNode = undefined;
  });
  try {
    expect(created).toHaveBeenCalledTimes(2);
  } finally {
    fallback.destroy();
  }
});
it.each([false, true])(
  'continues removing later roots when one DOM removal throws: lean=%s',
  (lean) => {
    const value = signal('a');
    const { exports } = load(
      `export const Row=craftComponent('CleanupSUFFIX',{},()=>[div(()=>value()),span('b')]);export const App=craftComponent('CleanupOwnerSUFFIX',{},()=>Row({}));`,
      { value },
      { lean },
    );
    let failed = false;
    const removed: Node[] = [];
    const m = mount(exports.App, false, (renderer) => {
      const remove = renderer.removeChild;
      renderer.removeChild = (parent, child) => {
        removed.push(child);
        if (!failed && (child as Element).tagName === 'DIV') {
          failed = true;
          throw Error('root removal');
        }
        remove(parent, child);
      };
    });
    try {
      const second = m.host.querySelector('span')!;
      expect(() => m.view.destroy()).toThrow('root removal');
      expect(removed).toContain(second);
      expect(second.parentNode).toBeNull();
      m.setValue.mockClear();
      value.set('after');
      m.flush();
      expect(m.setValue).not.toHaveBeenCalled();
    } finally {
      m.destroy();
    }
  },
);
it('keeps empty arrays, root structural nodes and spread root arrays generic', () => {
  for (const expression of [
    '[]',
    '[null,false]',
    '[...external]',
    '[div(),ifNode(shown,()=>span())]',
  ]) {
    const result = compileModule(
      header + `const C=craftComponent('Fallback',{},()=>${expression});`,
      'fallback.ts',
      { lean: true },
    );
    expect(result.components[0].status).toBe('fallback');
  }
});
it.each(modes)(
  'moves ranges with text as both first and last boundary: %j',
  (options) => {
    const items = signal([{ id: 0 }, { id: 1 }, { id: 2 }]);
    const { exports } = load(
      `export const Row=craftComponent('TextEdgesSUFFIX',{},inputs=>['[',span({'data-row':function*(){return (yield* inputs.row()).id;}},inputs.position),']']);export const App=craftComponent('TextListSUFFIX',{},()=>div([forNode(items,{track:row=>row.id},(row,position)=>Row({row,position})),span({'data-tail':'yes'},'end')]));`,
      { items },
      options,
    );
    const m = mount(exports.App);
    try {
      const first = m.host.querySelector('[data-row="0"]')!,
        left = first.previousSibling,
        right = first.nextSibling,
        tail = m.host.querySelector('[data-tail]');
      items.update((rows) => [...rows].reverse());
      m.flush();
      expect(m.host.textContent).toBe('[0][1][2]end');
      expect(first.previousSibling).toBe(left);
      expect(first.nextSibling).toBe(right);
      expect(tail?.parentElement?.lastChild).toBe(tail);
      items.set([{ id: 0 }]);
      m.flush();
      expect(m.host.textContent).toBe('[0]end');
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
  },
);
it.each(modes)(
  'supports one reactive text root without an element scope: %j',
  (options) => {
    const value = signal('first');
    const { exports } = load(
      `export const Row=craftComponent('OnlyTextSUFFIX',{},inputs=>inputs.value);export const App=craftComponent('TextOwnerSUFFIX',{},()=>Row({value:function*(){return value();}}));`,
      { value },
      options,
    );
    expect(compiledTemplateFor(exports.Row)?.roots).toEqual([0]);
    const m = mount(exports.App);
    try {
      const text = [...m.host.childNodes].find((node) => node.nodeType === 3);
      expect(text?.textContent).toBe('first');
      expect(m.host.children).toHaveLength(0);
      value.set('second');
      m.flush();
      expect(text?.textContent).toBe('second');
      expect([...m.host.childNodes]).toContain(text);
      const generic = mount(exports.App, true);
      try {
        expect(html(m.host)).toBe(html(generic.host));
      } finally {
        generic.destroy();
      }
      m.view.destroy();
      expect(m.host.textContent).toBe('');
    } finally {
      m.destroy();
    }
  },
);
it('demonstrates the unsupported connected-DOM observation during mounting', () => {
  const run = (development: boolean) => {
    const observe = () =>
      document.querySelectorAll('[data-marker="roots-observation"]').length;
    const { exports } = load(
      `export const Row=craftComponent('ObserveSUFFIX',{},()=>[div({'data-marker':'roots-observation'},'first'),span(()=>observe())]);export const App=craftComponent('ObserveOwnerSUFFIX',{},()=>Row({}));`,
      { observe },
      { lean: true },
    );
    const m = mount(exports.App, development);
    try {
      return m.host.querySelector('span')?.textContent;
    } finally {
      m.destroy();
    }
  };
  expect(run(false)).toBe('0');
  expect(run(true)).toBe('1');
});
