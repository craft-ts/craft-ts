// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import * as componentApi from '@craft-ts/component';
import {
  ɵwithCompiledTemplate,
  ɵwithCompiledItem,
} from '@craft-ts/component/compiler-runtime';
import {
  provideCraftProduction,
  provideCraftDevelopment,
  provideFnWrapObserver,
  provideTemplateTrace,
  provideReactiveReadObserver,
  ɵresolveCraftReplayTarget,
  ɵcaptureCraftReplayTarget,
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
import { mountInterpretedComponent } from '../../component/src/lib/render/interpreter';
import { compiledTemplateFor } from '../../component/src/lib/render/compiled-template';
import { CRAFT_COMPONENT } from '../../component/src/lib/types';
import { compileModule } from './compiler.js';

let serial = 0;
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const release of cleanup.splice(0).reverse()) release();
  document.body.replaceChildren();
});
function load(
  template: string,
  globals: Record<string, unknown> = {},
  options: { dom?: 'create' | 'clone' } = {},
) {
  const source = `import {craftComponent, div, span, type Input} from '@craft-ts/component';\nexport const Child = craftComponent('Child${serial++}', {}, ${template});`;
  const compiled = compileModule(source, 'fixture.ts', options);
  expect(compiled.components[0].status).toBe('compiled');
  const js = ts.transpileModule(compiled.code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports: any = {};
  const attach = vi.fn(ɵwithCompiledTemplate);
  new Function('require', 'exports', ...Object.keys(globals), js)(
    (name: string) =>
      name.endsWith('/compiler-runtime')
        ? { ɵwithCompiledTemplate: attach }
        : componentApi,
    exports,
    ...Object.values(globals),
  );
  const child = exports.Child;
  const plan = compiledTemplateFor(child)!;
  const create = vi.spyOn(plan, 'create');
  return { child, plan, create };
}
function mount(child: any, props: any = {}, providers: any[] = []) {
  const injector = createEnvironmentInjector(
    [provideCraftProduction(), ...providers],
    Injector.NULL as EnvironmentInjector,
    'compiled-spec',
  );
  const App = componentApi.craftComponent('Root' + serial++, {}, () =>
    child(props),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = mountInterpretedComponent(App as never, host, injector, {});
  cleanup.push(
    () => injector.destroy(),
    () => mounted.destroy(),
  );
  const flush = () => injector.get(ɵEffectScheduler).flush();
  flush();
  return { host, injector, mounted, flush };
}

describe('compiled DOM contracts', () => {
  it('mounts the emitted plan, changes one binding and preserves nodes', () => {
    const a = signal('a'),
      b = signal('b'),
      readA = vi.fn(() => a()),
      readB = vi.fn(() => b());
    const { child, create } = load(
      `() => div([span(readA), span(readB)])`
        .replace('span(readA)', 'span(() => readA())')
        .replace('span(readB)', 'span(() => readB())'),
      { readA, readB },
    );
    const { host, flush, mounted } = mount(child);
    expect(create).toHaveBeenCalledOnce();
    const nodes = [...host.querySelectorAll('span')],
      text = nodes[0].firstChild;
    readA.mockClear();
    readB.mockClear();
    a.set('A');
    flush();
    expect(host.textContent).toBe('Ab');
    expect(readA).toHaveBeenCalledOnce();
    expect(readB).not.toHaveBeenCalled();
    expect(host.querySelector('span')).toBe(nodes[0]);
    expect(nodes[0].firstChild).toBe(text);
    mounted.destroy();
    mounted.destroy();
    readA.mockClear();
    a.set('gone');
    flush();
    expect(readA).not.toHaveBeenCalled();
    expect(host.textContent).toBe('');
  });
  it('uses native input shells for direct and yielded inputs', () => {
    const current = signal({
      a: function* () {
        return 'a';
      },
      b: function* () {
        return 'b';
      },
    });
    const { child, create } = load(
      `(inputs: {a:Input<string>;b:Input<string>}) => div({title:inputs.a}, [span(inputs.a), function*(){return yield* inputs.b();}])`,
    );
    const injector = createEnvironmentInjector(
      [provideCraftProduction()],
      Injector.NULL as EnvironmentInjector,
      'inputs',
    );
    const Parent = componentApi.craftComponent('Root' + serial++, {}, () =>
      child(current()),
    );
    const host = document.createElement('div');
    const mounted = mountInterpretedComponent(
      Parent as never,
      host,
      injector,
      {},
    );
    cleanup.push(
      () => injector.destroy(),
      () => mounted.destroy(),
    );
    const flush = () => injector.get(ɵEffectScheduler).flush();
    flush();
    const root = host.firstElementChild;
    expect(host.textContent).toBe('ab');
    expect(root?.getAttribute('title')).toBe('a');
    current.set({
      a: function* () {
        return 'A';
      },
      b: current().b,
    });
    flush();
    expect(host.textContent).toBe('Ab');
    expect(host.firstElementChild).toBe(root);
    expect(root?.getAttribute('title')).toBe('A');
    expect(create).toHaveBeenCalledOnce();
  });
  it('matches scalar coercion, class removal and ARIA booleans', () => {
    const value = signal<any>(false);
    const { child } = load(
      `()=>div({class:()=>value(), 'aria-hidden':()=>value(), 'data-v':()=>value()}, ()=>value())`,
      { value },
    );
    const { host, flush } = mount(child);
    const root = host.firstElementChild!;
    expect(root.textContent).toBe('');
    expect(root.getAttribute('aria-hidden')).toBe('false');
    expect(root.hasAttribute('data-v')).toBe(false);
    value.set('');
    flush();
    expect(root.hasAttribute('class')).toBe(false);
    value.set(true);
    flush();
    expect(root.textContent).toBe('true');
    expect(root.getAttribute('data-v')).toBe('');
    value.set(null);
    flush();
    expect(root.hasAttribute('aria-hidden')).toBe(false);
  });
  it.each([
    ['development', () => provideCraftDevelopment()],
    ['factory observer', () => provideFnWrapObserver(() => undefined)],
    ['reactive observer', () => provideReactiveReadObserver(() => undefined)],
    [
      'template trace',
      () => provideTemplateTrace((_context: any, next: any) => next()),
    ],
  ])('falls back with %s', (_name, provider) => {
    const { child, create } = load(`()=>div('hello')`);
    const { host } = mount(child, {}, [provider()]);
    expect(host.textContent).toBe('hello');
    expect(create).not.toHaveBeenCalled();
  });
  it('falls back for call-site host props and a replaced template', () => {
    const first = load(`()=>div('hello')`);
    const { host } = mount(first.child, { title: 'host' });
    expect(host.textContent).toBe('hello');
    expect(first.create).not.toHaveBeenCalled();
    const second = load(`()=>div('old')`);
    second.child[CRAFT_COMPONENT].template = () =>
      componentApi.div('replacement');
    const mounted = mount(second.child);
    expect(mounted.host.textContent).toBe('replacement');
    expect(second.create).not.toHaveBeenCalled();
  });
  it('preserves injection context and cleans up when the owner is destroyed', () => {
    let owner: EnvironmentInjector | undefined;
    const value = signal('owned');
    const read = vi.fn(() => {
      owner = inject(Injector) as EnvironmentInjector;
      return value();
    });
    const { child } = load(`()=>div(()=>read())`, { read });
    const { host, flush } = mount(child);
    expect(host.textContent).toBe('owned');
    expect(owner).toBeDefined();
    owner!.destroy();
    flush();
    expect(host.textContent).toBe('');
    read.mockClear();
    value.set('after');
    flush();
    expect(read).not.toHaveBeenCalled();
  });
});

describe('compiled list ownership', () => {
  it('keeps keyed elements and reactive indexes through updates, reversals and removal', () => {
    const { child } =
      load(`(inputs: {row:Input<{id:number;name:string}>;position:Input<number>})=>div(
      {'data-row':function*(){return (yield* inputs.row()).id;}},
      [function*(){return (yield* inputs.row()).name;}, span(inputs.position)])`);
    const rows = signal([
      { id: 10, name: 'a' },
      { id: 20, name: 'b' },
    ]);
    const item = ɵwithCompiledItem(
      (row: any, position: any) => child({ row, position }),
      child,
    );
    const Parent = componentApi.craftComponent('List' + serial++, {}, () =>
      componentApi.div(
        componentApi.forNode(() => rows(), { track: (r) => r.id }, item),
      ),
    );
    const { host, flush, mounted } = mount(Parent);
    const first = host.querySelector('[data-row="10"]')!;
    expect(host.textContent).toBe('a0b1');
    rows.set([
      { id: 20, name: 'B' },
      { id: 10, name: 'A' },
    ]);
    flush();
    expect(host.textContent).toBe('B0A1');
    expect(host.querySelector('[data-row="10"]')).toBe(first);
    rows.set([rows()[0]]);
    flush();
    expect(host.textContent).toBe('B0');
    mounted.destroy();
    expect(host.textContent).toBe('');
  });
});

describe('native blueprint cloning', () => {
  it('shares only inert DOM, while inputs and text nodes remain per instance', () => {
    const { child, create } = load(
      `(inputs:{value:Input<string>})=>div(span(inputs.value))`,
      {},
      { dom: 'clone' },
    );
    const value = signal('A');
    const Parent = componentApi.craftComponent(
      'CloneParent' + serial++,
      {},
      () =>
        componentApi.div([
          child({
            value: function* () {
              return value();
            },
          }),
          child({ value: 'B' }),
        ]),
    );
    const { host, flush, mounted } = mount(Parent);
    expect(create).toHaveBeenCalledOnce();
    expect(host.textContent).toBe('AB');
    const spans = [...host.querySelectorAll('span')];
    expect(spans[0].firstChild).not.toBe(spans[1].firstChild);
    value.set('changed');
    flush();
    expect(host.textContent).toBe('changedB');
    const target = ɵcaptureCraftReplayTarget(spans[0])!;
    expect(ɵresolveCraftReplayTarget(target)).toEqual({
      status: 'resolved',
      element: spans[0],
    });
    mounted.destroy();
    expect(ɵresolveCraftReplayTarget(target).status).toBe('missing');
  });
  it('uses the original renderer for server output and hydration', async () => {
    const { child, create } = load(
      `()=>div(span('server'))`,
      {},
      { dom: 'clone' },
    );
    const App = componentApi.craftComponent('SsrCompiled' + serial++, {}, () =>
      child({}),
    );
    const config = { providers: [componentApi.provideCraftRootComponent(App)] };
    const rendered = await componentApi.renderCraft({
      config,
      url: 'http://localhost/',
      mode: 'production',
    });
    expect(rendered.html).toContain('server');
    expect(create).not.toHaveBeenCalled();
    document.body.innerHTML = rendered.html;
    const host = document.querySelector('craft-root')!;
    const span = host.querySelector('span');
    const hydrated = componentApi.hydrateCraft({
      config,
      host,
      mode: 'production',
    });
    cleanup.push(() => hydrated.destroy());
    await Promise.resolve();
    expect(host.querySelector('span')).toBe(span);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('direct input shape guards', () => {
  it('falls back for structural content and omitted optional text', () => {
    const first = load(`(inputs:any)=>div(inputs.content)`);
    const { host } = mount(first.child, {
      content: componentApi.span('projected'),
    });
    expect(host.querySelector('span')?.textContent).toBe('projected');
    expect(first.create).not.toHaveBeenCalled();
    const second = load(`(inputs:any)=>div(inputs.optional)`);
    const absent = mount(second.child, {});
    expect(second.create).not.toHaveBeenCalled();
    expect(absent.host.firstElementChild?.childNodes.length).toBe(0);
  });
});

describe('ownership and replay parity', () => {
  it('keeps the same element addresses on compiled and generic mounts', () => {
    const { child, create } = load(`()=>div([span('a'),span('b')])`);
    const App = componentApi.craftComponent('ReplayParity' + serial++, {}, () =>
      child({}),
    );
    const addresses = [];
    for (const mode of [provideCraftProduction(), provideCraftDevelopment()]) {
      const injector = createEnvironmentInjector(
        [mode],
        Injector.NULL as EnvironmentInjector,
        'replay-parity',
      );
      const host = document.createElement('div');
      document.body.append(host);
      const ref = mountInterpretedComponent(App as never, host, injector, {});
      addresses.push(
        [...host.querySelectorAll('span')].map((element) =>
          ɵcaptureCraftReplayTarget(element),
        ),
      );
      ref.destroy();
      injector.destroy();
      host.remove();
    }
    expect(create).toHaveBeenCalledOnce();
    expect(addresses[0]).toEqual(addresses[1]);
  });
  it('releases every binding and replay record even when an owner cleanup throws', () => {
    const value = signal('live');
    let owner: EnvironmentInjector | undefined;
    const read = () => {
      owner = inject(Injector) as EnvironmentInjector;
      return value();
    };
    const { child } = load(`()=>div(span(()=>read()))`, { read });
    const { host, flush, mounted } = mount(child);
    const target = ɵcaptureCraftReplayTarget(host.querySelector('span')!)!;
    owner!.get(DestroyRef).onDestroy(() => {
      throw new Error('cleanup failed');
    });
    expect(target).toBeDefined();
    expect(() => mounted.destroy()).toThrow('cleanup failed');
    value.set('after');
    flush();
    expect(host.textContent).toBe('');
    expect(ɵresolveCraftReplayTarget(target).status).toBe('missing');
  });
});
