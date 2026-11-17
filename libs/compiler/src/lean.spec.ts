// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import * as componentApi from '@craft-ts/component';
import * as compilerRuntime from '@craft-ts/component/compiler-runtime';
import * as core from '@craft-ts/core';
import {
  craftService,
  provideCraftDevelopment,
  provideCraftProduction,
  ɵreadServiceMember,
  ɵSERVICE_MEMBER_UNREAD,
} from '@craft-ts/core';
import {
  createEnvironmentInjector,
  Injector,
  type EnvironmentInjector,
  signal,
  ɵEffectScheduler,
  inject,
  DestroyRef,
} from '../../component/src/lib/host-runtime';
import { mountInterpretedComponent } from '../../component/src/lib/render/interpreter';
import {
  compiledTemplateFor,
  leanReadScope,
} from '../../component/src/lib/render/compiled-template';
import { compileModule } from './compiler.js';

let serial = 0;
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const release of cleanup.splice(0).reverse()) release();
  document.body.replaceChildren();
});

/**
 * Evaluates one module twice: compiled in light mode, and as written. Both
 * export the same components, so a mount of each can be compared.
 */
function load(
  body: string,
  globals: Record<string, unknown> = {},
  options: { lower?: boolean } = {},
) {
  // Component names are unique: each evaluation gets its own suffix.
  const sourceFor = (suffix: number) =>
    `import {craftComponent, div, span, button, forNode, ifNode, type Input} from '@craft-ts/component';\n${body.replace(/'(\w+)' \+ suffix/g, (_, name) => `'${name}${suffix}'`)}`;
  const source = sourceFor(serial++);
  const compiled = compileModule(sourceFor(serial++), 'fixture.ts', {
    lean: true,
    ...options,
  });
  const evaluate = (code: string) => {
    const js = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const exports: any = {};
    new Function('require', 'exports', ...Object.keys(globals), js)(
      (name: string) =>
        name.endsWith('/compiler-runtime')
          ? compilerRuntime
          : name === '@craft-ts/core'
            ? core
            : componentApi,
      exports,
      ...Object.values(globals),
    );
    return exports;
  };
  return {
    report: compiled.components,
    code: compiled.code,
    lean: evaluate(compiled.code),
    generic: evaluate(source),
  };
}

function mount(
  node: () => unknown,
  providers: unknown[] = [provideCraftProduction()],
  componentProviders: unknown[] = [],
) {
  const injector = createEnvironmentInjector(
    providers as never,
    Injector.NULL as EnvironmentInjector,
    'lean-spec',
  );
  const Holder = componentApi.craftComponent(
    'Holder' + serial++,
    { providers: componentProviders } as never,
    node as never,
  );
  const App = componentApi.craftComponent('Root' + serial++, {}, (() =>
    (Holder as unknown as (props: object) => unknown)({})) as never);
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

/** Markup without comments, Craft attributes or attribute order. */
const html = (host: Element) => {
  const copy = host.cloneNode(true) as Element;
  for (const element of copy.querySelectorAll('*')) {
    const attributes = [...element.attributes]
      .filter((attribute) => !attribute.name.startsWith('data-craft-'))
      .map((attribute) => [attribute.name, attribute.value] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const attribute of [...element.attributes])
      element.removeAttribute(attribute.name);
    for (const [name, value] of attributes) element.setAttribute(name, value);
  }
  return copy.innerHTML.replace(/<!--.*?-->/g, '');
};

describe('light compiled instances', () => {
  it('updates input shells forwarded by a generic parent through the owned fallback', () => {
    const value = signal('before');
    function* reader() {
      return value();
    }
    const { lean, generic } = load(`
      export const Child=craftComponent('ForwardedFallback' + suffix, {},
        (inputs:{label:Input<string>}) =>
          span(function*(){return yield* inputs.label();}));`);
    const create = vi.spyOn(compiledTemplateFor(lean.Child)!, 'create');
    const Parent = componentApi.craftComponent(
      'ForwardingParent' + serial++,
      {},
      (inputs: { label: componentApi.Input<string> }) =>
        lean.Child({ label: inputs.label }),
    );
    const GenericParent = componentApi.craftComponent(
      'GenericForwardingParent' + serial++,
      {},
      (inputs: { label: componentApi.Input<string> }) =>
        generic.Child({ label: inputs.label }),
    );
    const compiled = mount(() => Parent({ label: reader }));
    const reference = mount(() => GenericParent({ label: reader }));
    expect(create).toHaveBeenCalledOnce();
    const element = compiled.host.querySelector('span');
    expect(html(compiled.host)).toBe(html(reference.host));
    value.set('after');
    compiled.flush();
    reference.flush();
    expect(compiled.host.textContent).toBe('after');
    expect(compiled.host.querySelector('span')).toBe(element);
    expect(html(compiled.host)).toBe(html(reference.host));
    expect(leanReadScope.injector).toBeUndefined();
  });

  it('runs lowered bindings in the owned fallback when inputs cannot be light', () => {
    const value = signal('before');
    const scopes: EnvironmentInjector[] = [];
    function* reader() {
      scopes.push(inject(Injector) as EnvironmentInjector);
      return value();
    }
    const { lean } = load(`
      export const Child=craftComponent('FallbackChild' + suffix, {},
        (inputs: {label:Input<string>;unusedCallback:import('@craft-ts/component').Output<()=>void>}) =>
          span(function*(){return yield* inputs.label();}));`);
    const create = vi.spyOn(compiledTemplateFor(lean.Child)!, 'create');
    let parent: EnvironmentInjector | undefined;
    const compiled = mount(() => {
      parent = inject(Injector) as EnvironmentInjector;
      return lean.Child({ label: reader, unusedCallback: () => undefined });
    });
    expect(create).toHaveBeenCalledOnce();
    expect(compiled.host.textContent).toBe('before');
    const owner = scopes[0];
    expect(owner).toBeDefined();
    expect(owner).not.toBe(parent);
    expect(leanReadScope.injector).toBeUndefined();
    const element = compiled.host.querySelector('span');
    leanReadScope.injector = parent;
    try {
      value.set('after');
      compiled.flush();
      expect(compiled.host.textContent).toBe('after');
      expect(compiled.host.querySelector('span')).toBe(element);
      expect(scopes.every((scope) => scope === owner)).toBe(true);
      expect(leanReadScope.injector).toBe(parent);
    } finally {
      leanReadScope.injector = undefined;
    }
    expect(leanReadScope.injector).toBeUndefined();
    const destroyed = vi.fn();
    owner.get(DestroyRef).onDestroy(destroyed);
    compiled.mounted.destroy();
    const reads = scopes.length;
    value.set('released');
    compiled.flush();
    expect(scopes).toHaveLength(reads);
    expect(destroyed).toHaveBeenCalledOnce();
  });

  it('renders what the generic renderer renders, binding by binding', () => {
    const a = signal('a'),
      b = signal(1);
    const readA = vi.fn(() => a());
    const { lean, generic, report } = load(
      `export const Leaf = craftComponent('Leaf' + suffix, {}, (inputs: { n: Input<number> }) =>
        div({ class: 'leaf', title: inputs.n }, [
          span(() => readA()),
          span(function* () { return (yield* inputs.n()) + 1; }),
        ]));`,
      { readA },
    );
    expect(report[0]).toMatchObject({ status: 'compiled', bindings: 3 });
    const compiled = mount(() =>
      lean.Leaf({
        n: function* () {
          return b();
        },
      }),
    );
    const reference = mount(() =>
      generic.Leaf({
        n: function* () {
          return b();
        },
      }),
    );
    expect(html(compiled.host)).toBe(html(reference.host));
    const leaf = compiled.host.querySelector('.leaf');
    readA.mockClear();
    b.set(5);
    compiled.flush();
    reference.flush();
    expect(html(compiled.host)).toBe(html(reference.host));
    expect(compiled.host.querySelector('.leaf')).toBe(leaf);
    expect(readA).not.toHaveBeenCalled();
    compiled.mounted.destroy();
    reference.mounted.destroy();
    a.set('gone');
    compiled.flush();
    expect(readA).not.toHaveBeenCalled();
    expect(compiled.host.textContent).toBe('');
  });

  it('renders children it does not know through the generic renderer, in place', () => {
    const rows = signal([1, 2, 3]);
    const { lean, generic, report } = load(
      `
      export const Icon = craftComponent('Icon' + suffix, {}, (inputs: { name: Input<string> }) =>
        span({ class: 'icon' }, function* () { return yield* inputs.name(); }));
      export const Panel = craftComponent('Panel' + suffix, {}, (inputs: { rows: Input<number[]> }) =>
        div({ class: 'panel' }, [
          span('first'),
          Icon({ name: function* () { return 'star'; } }),
          forNode(rows, { track: (row) => row }, (row) => span(function* () { return String(yield* row()); })),
          span('last'),
        ]));`,
      { rows },
    );
    expect(report.map((c) => c.status)).toEqual(['compiled', 'compiled']);
    expect(report[1].holes).toBe(2);
    const compiled = mount(() =>
      lean.Panel({
        rows: function* () {
          return rows();
        },
      }),
    );
    const reference = mount(() =>
      generic.Panel({
        rows: function* () {
          return rows();
        },
      }),
    );
    expect(html(compiled.host)).toBe(html(reference.host));
    rows.set([3, 1]);
    compiled.flush();
    reference.flush();
    expect(html(compiled.host)).toBe(html(reference.host));
    compiled.mounted.destroy();
    expect(compiled.host.innerHTML).toBe('');
    rows.set([4]);
    compiled.flush();
    expect(compiled.host.innerHTML).toBe('');
  });

  it('dispatches events like an interpreted element', () => {
    const clicks: unknown[] = [];
    const hook = vi.fn((interaction: any, next: () => unknown) => {
      clicks.push(interaction.interactionName);
      return next();
    });
    const handler = vi.fn();
    const { lean, generic, report } = load(
      `export const Press = craftComponent('Press' + suffix, {}, (inputs: { label: Input<string> }) =>
        button('press', { type: 'button', *click(event: Event) { handler(event.type, yield* inputs.label()); } }, inputs.label));`,
      { handler },
    );
    expect(report[0]).toMatchObject({ status: 'compiled', events: 1 });
    for (const module of [lean, generic]) {
      const { host } = mount(
        () =>
          module.Press({
            label: function* () {
              return 'go';
            },
          }),
        [
          provideCraftProduction(),
          core.provideCraftDomEventHook(hook as never),
        ],
      );
      host.querySelector('button')!.click();
    }
    expect(handler.mock.calls).toEqual([
      ['click', 'go'],
      ['click', 'go'],
    ]);
    const unnumbered = (name: unknown) => String(name).replace(/\d+/g, '');
    expect(unnumbered(clicks[0])).toBe(unnumbered(clicks[1]));
    expect(unnumbered(clicks[0])).toBe('Press:button:press:click');
  });

  it('mounts list items as the instances themselves, keeping each row through moves', () => {
    const items = signal(
      [1, 2, 3, 4].map((id) => ({ id, label: `row ${id}` })),
    );
    const { lean, generic } = load(
      `
      export const Row = craftComponent('Row' + suffix, {}, (inputs: { row: Input<{ id: number; label: string }>; position: Input<number> }) =>
        div({ 'data-id': function* () { return (yield* inputs.row()).id; } }, [
          span(function* () { return String(yield* inputs.position()); }),
          function* () { return (yield* inputs.row()).label; },
        ]));
      export const List = craftComponent('List' + suffix, {}, () =>
        div(forNode(items, { track: (row) => row.id }, (row, position) => Row({ row, position }))));`,
      { items },
    );
    const compiled = mount(() => lean.List({}));
    const reference = mount(() => generic.List({}));
    const comments = (host: Element) =>
      // Entry boundaries (`craft-for:<key>:start`), not the list's own.
      host.innerHTML.match(/<!--craft-for:[^:<>]+:(start|end)-->/g)?.length ??
      0;
    expect(comments(compiled.host)).toBe(0);
    expect(comments(reference.host)).toBeGreaterThan(0);
    const third = compiled.host.querySelector('[data-id="3"]');
    const steps = [
      (rows: any[]) => [...rows].reverse(),
      (rows: any[]) => rows.filter((row) => row.id !== 2),
      (rows: any[]) => [{ id: 9, label: 'new' }, ...rows],
      (rows: any[]) =>
        rows.map((row) => (row.id === 3 ? { ...row, label: 'changed' } : row)),
    ];
    for (const step of steps) {
      items.set(step(items()));
      compiled.flush();
      reference.flush();
      expect(html(compiled.host)).toBe(html(reference.host));
      expect(compiled.host.querySelector('[data-id="3"]')).toBe(third);
    }
    compiled.mounted.destroy();
    expect(compiled.host.innerHTML).toBe('');
  });

  it('reads a light list index for the first time after earlier moves', () => {
    const items = signal([1, 2, 3]);
    const show = signal(false);
    const { lean, generic, code } = load(
      `
      export const Row = craftComponent('LateRow' + suffix, {}, (inputs: { row: Input<number>; position: Input<number> }) =>
        div({ 'data-id': inputs.row }, function* () {
          return show() ? String(yield* inputs.position()) : 'hidden';
        }));
      export const List = craftComponent('LateList' + suffix, {}, () =>
        div(forNode(items, { track: (row) => row }, (row, position) => Row({ row, position }))));`,
      { items, show },
    );
    expect(code).toContain('ɵwithCompiledItem');
    const compiled = mount(() => lean.List({}));
    const reference = mount(() => generic.List({}));
    const first = compiled.host.querySelector('[data-id="1"]');
    for (const order of [
      [3, 1, 2],
      [2, 3, 1],
    ]) {
      items.set(order);
      compiled.flush();
      reference.flush();
      expect(html(compiled.host)).toBe(html(reference.host));
    }
    show.set(true);
    compiled.flush();
    reference.flush();
    expect(compiled.host.textContent).toBe('012');
    expect(html(compiled.host)).toBe(html(reference.host));
    items.set([1, 2, 3]);
    compiled.flush();
    reference.flush();
    expect(html(compiled.host)).toBe(html(reference.host));
    expect(compiled.host.querySelector('[data-id="1"]')).toBe(first);
  });

  it('binds the same nodes again when its parent gives it other inputs', () => {
    const items = signal([{ id: 1, label: 'one' }]);
    const { lean } = load(
      `
      export const Row = craftComponent('Row' + suffix, {}, (inputs: { row: Input<{ id: number; label: string }> }) =>
        div({ 'data-id': function* () { return (yield* inputs.row()).id; } }, function* () { return (yield* inputs.row()).label; }));
      export const List = craftComponent('List' + suffix, {}, () =>
        div(forNode(items, { track: (row) => row.id }, (row) => Row({ row }))));`,
      { items },
    );
    const { host, flush } = mount(() => lean.List({}));
    const row = host.querySelector('[data-id="1"]');
    items.set([{ id: 1, label: 'uno' }]);
    flush();
    expect(host.querySelector('[data-id="1"]')).toBe(row);
    expect(row!.textContent).toBe('uno');
  });

  it('rewrites a binding generator only where both forms behave the same', () => {
    const { code, lean, generic } = load(`
      export const A = craftComponent('A' + suffix, {}, (inputs: { n: Input<number> }) =>
        span({ title: function* () { return String((yield* inputs.n()) * 2); } },
          function* () { try { return String(yield* inputs.n()); } finally { /* kept */ } }));`);
    expect(code).toContain('__craft_y_');
    expect(code).toContain('try { return String(yield* inputs.n())');
    const compiled = mount(() => lean.A({ n: 21 }));
    const reference = mount(() => generic.A({ n: 21 }));
    expect(html(compiled.host)).toBe(html(reference.host));
  });

  it('reads a service member directly, and follows it', () => {
    const instances: any[] = [];
    const { LeanTheme: Theme } = craftService(
      { name: 'LeanTheme', providedIn: 'global' },
      function* () {
        const dark = yield* core.state('dark', false, ({ update }) => ({
          toggle: () => update((v: boolean) => !v),
        }));
        instances.push(dark);
      },
    ) as any;
    const { code, lean, generic } = load(
      `export const Swatch = craftComponent('Swatch' + suffix, {}, () =>
        span({ class: function* () { return (yield* Theme.dark()) ? 'dark' : 'light'; } }, 'x'));`,
      { Theme },
    );
    expect(code).toContain('(Theme, "dark")');
    const providers = [provideCraftProduction()];
    const reference = mount(() => generic.Swatch({}), providers);
    const compiled = mount(() => lean.Swatch({}), providers);
    expect(html(compiled.host)).toBe(html(reference.host));
    for (const dark of instances) dark.toggle();
    compiled.flush();
    reference.flush();
    expect(compiled.host.querySelector('.dark')).not.toBeNull();
    expect(html(compiled.host)).toBe(html(reference.host));
    expect(ɵreadServiceMember({}, 'dark', compiled.injector)).toBe(
      ɵSERVICE_MEMBER_UNREAD,
    );
  });

  it('keeps the generic renderer in development', () => {
    const { lean } = load(
      `export const Dev = craftComponent('Dev' + suffix, {}, () => span('dev'));`,
    );
    const plan = compiledTemplateFor(lean.Dev)!;
    const create = vi.spyOn(plan, 'create');
    mount(() => lean.Dev({}), [provideCraftDevelopment()]);
    expect(create).not.toHaveBeenCalled();
    mount(() => lean.Dev({}));
    expect(create).toHaveBeenCalledOnce();
  });
});
