// POC « plancher » : le plus petit renderer capable d'exécuter la fixture
// CraftTS telle qu'elle est écrite (hyperscript, génératrices, un composant
// par ligne, forNode à clés, services et DI du vrai noyau).
//
// Il garde la même structure réactive que le renderer de production : un effet
// par entrée de liste, un par composant, un par binding. Il retire tout ce
// que le renderer fait en plus : identités de rendu, cibles replay, rapports
// d'effets, traces de template, injecteur par composant sans provider, paires
// de commentaires, contextes recopiés.
//
// Ce n'est pas un renderer utilisable : pas de SSR, d'hydratation, de
// directives, d'événements ni de frontières. Il sert à mesurer ce que coûte
// le modèle d'écriture lui-même.
import {
  createBrowserPlatform,
  createComponentRegister,
  createCraftInjector,
  executeYieldable,
  isYieldableReactiveValue,
  markYieldableMethod,
  provideComponentRegister,
  provideCraftPlatform,
  provideCraftRuntimeMode,
  ɵcreateEnvironmentInjector,
  ɵgetCraftRootDefaultProviders,
  type CraftInjector,
} from '@craft-ts/core';
import { effect, setActiveSub, signal } from 'alien-signals';

export type Input<T> = (() => Generator<never, T, unknown>) & {
  readonly __input?: T;
};

type Cell<T> = { (): T; (value: T): void };
type Child = unknown;
type VNode =
  | { kind: 'element'; tag: string; props: Record<string, unknown>; children: Child }
  | { kind: 'component'; component: ComponentFn; props: Record<string, unknown> }
  | {
      kind: 'for';
      source: unknown;
      track: (item: unknown, index: number) => unknown;
      itemTemplate: (item: unknown, index: unknown) => Child;
    }
  | { kind: 'text'; value: string }
  | { kind: 'reactive-text'; binding: () => unknown };

interface Definition {
  readonly name: string;
  readonly meta: { readonly providers?: readonly unknown[] };
  readonly template: (inputs: any) => Child;
}
type ComponentFn = ((props?: Record<string, unknown>) => VNode) & {
  readonly definition: Definition;
};

interface Rendered {
  first(): Node;
  last(): Node;
  patch(node: VNode): boolean;
  destroy(removeDom: boolean): void;
}

// ---------------------------------------------------------------- authoring

function tagHelper(tag: string) {
  return (first?: unknown, second?: unknown): VNode => {
    const isProps =
      first !== null &&
      typeof first === 'object' &&
      !Array.isArray(first) &&
      !('kind' in (first as object)) &&
      !('next' in (first as object));
    return {
      kind: 'element',
      tag,
      props: isProps ? (first as Record<string, unknown>) : EMPTY_PROPS,
      children: isProps ? second : first,
    };
  };
}
const EMPTY_PROPS: Record<string, unknown> = {};
export const div = tagHelper('div') as (...args: any[]) => any;
export const span = tagHelper('span') as (...args: any[]) => any;

export function forNode(
  source: unknown,
  options: { track: (item: any, index: number) => unknown },
  itemTemplate: (item: any, index: any) => Child,
): any {
  return { kind: 'for', source, track: options.track, itemTemplate };
}

export function craftComponent(
  name: string,
  meta: Definition['meta'],
  template: Definition['template'],
): any {
  const component = ((props: Record<string, unknown> = EMPTY_PROPS): VNode => ({
    kind: 'component',
    component,
    props,
  })) as ComponentFn;
  (component as { definition: Definition }).definition = { name, meta, template };
  return component;
}

let rootComponent: ComponentFn | undefined;
export function provideCraftRootComponent(component: ComponentFn): unknown[] {
  rootComponent = component;
  return [];
}

export function bootstrapCraft(options: {
  host: Element;
  mode?: 'production' | 'development';
  config: { providers: readonly unknown[] };
}): void {
  const injector = ɵcreateEnvironmentInjector(
    [
      ...ɵgetCraftRootDefaultProviders(),
      provideCraftRuntimeMode(options.mode ?? 'production'),
      provideComponentRegister(createComponentRegister()),
      ...options.config.providers,
      provideCraftPlatform(createBrowserPlatform(window)),
    ] as never,
    createCraftInjector([]),
    'CraftApp',
  );
  mount(rootComponent!(), options.host, null, injector);
}

// ------------------------------------------------------------------ runtime

function isIterator(value: unknown): value is Iterator<unknown, unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { next?: unknown }).next === 'function'
  );
}

/**
 * Runs a binding. A generator that finishes without yielding (an input read,
 * an index read) never reaches the full driver; anything that yields a
 * service request does, with the first yield replayed.
 */
function run(callback: (...args: any[]) => unknown, injector: CraftInjector): unknown {
  const result = callback();
  if (!isIterator(result)) return result;
  const first = result.next();
  if (first.done) return first.value;
  let replayed = false;
  const replay = {
    next(value: unknown) {
      if (!replayed) {
        replayed = true;
        return first;
      }
      return result.next(value);
    },
  };
  return executeYieldable(() => replay as never, [], injector as never);
}

function resolve(value: unknown, injector: CraftInjector): unknown {
  if (typeof value !== 'function') return value;
  const resolved = run(value as () => unknown, injector);
  return isYieldableReactiveValue(resolved)
    ? run(resolved as () => unknown, injector)
    : resolved;
}

function detachedEffect(body: () => void): () => void {
  const previous = setActiveSub(undefined);
  try {
    return effect(body);
  } finally {
    setActiveSub(previous);
  }
}

function untrack<T>(body: () => T): T {
  const previous = setActiveSub(undefined);
  try {
    return body();
  } finally {
    setActiveSub(previous);
  }
}

function normalize(children: Child, into: VNode[] = []): VNode[] {
  if (Array.isArray(children)) {
    for (const child of children) normalize(child, into);
  } else if (children === null || children === undefined || children === false) {
    // nothing
  } else if (typeof children === 'function') {
    into.push({ kind: 'reactive-text', binding: children as () => unknown });
  } else if (typeof children === 'object' && 'kind' in (children as object)) {
    into.push(children as VNode);
  } else {
    into.push({ kind: 'text', value: String(children) });
  }
  return into;
}

function mount(
  node: VNode,
  parent: Node,
  before: Node | null,
  injector: CraftInjector,
): Rendered {
  switch (node.kind) {
    case 'element':
      return new ElementRendered(node, parent, before, injector);
    case 'component':
      return new ComponentRendered(node, parent, before, injector);
    case 'for':
      return new ForRendered(node, parent, before, injector);
    case 'reactive-text':
      return new ReactiveText(node, parent, before, injector);
    case 'text':
      return new StaticText(node, parent, before);
  }
}

/** A run of sibling nodes with a placeholder while it is empty. */
class Block {
  children: Rendered[] = [];
  placeholder: Comment | null = null;
  constructor(
    readonly parent: Node,
    before: Node | null,
    readonly injector: CraftInjector,
  ) {
    this.placeholder = document.createComment('');
    parent.insertBefore(this.placeholder, before);
  }
  first(): Node {
    return this.placeholder ?? this.children[0].first();
  }
  last(): Node {
    return this.placeholder ?? this.children[this.children.length - 1].last();
  }
  patch(next: Child): void {
    const nodes = normalize(next);
    const rendered = this.children;
    const anchor = this.placeholder ?? this.last().nextSibling;
    const shared = Math.min(rendered.length, nodes.length);
    for (let index = 0; index < shared; index++) {
      const current = rendered[index];
      if (!current.patch(nodes[index])) {
        rendered[index] = mount(
          nodes[index],
          this.parent,
          current.first(),
          this.injector,
        );
        current.destroy(true);
      }
    }
    for (let index = rendered.length; index < nodes.length; index++)
      rendered.push(mount(nodes[index], this.parent, anchor, this.injector));
    if (rendered.length > nodes.length) {
      if (nodes.length === 0 && !this.placeholder) {
        this.placeholder = document.createComment('');
        this.parent.insertBefore(this.placeholder, rendered[0].first());
      }
      for (const removed of rendered.splice(nodes.length)) removed.destroy(true);
    }
    if (rendered.length > 0 && this.placeholder) {
      this.parent.removeChild(this.placeholder);
      this.placeholder = null;
    }
  }
  moveBefore(before: Node | null): void {
    const last = this.last();
    let node: Node | null = this.first();
    while (node) {
      const next: Node | null = node === last ? null : node.nextSibling;
      this.parent.insertBefore(node, before);
      node = next;
    }
  }
  destroy(removeDom: boolean): void {
    for (const child of this.children) child.destroy(removeDom);
    this.children = [];
    if (removeDom && this.placeholder) this.parent.removeChild(this.placeholder);
  }
}

class StaticText implements Rendered {
  readonly node: Text;
  value: string;
  constructor(node: VNode & { kind: 'text' }, parent: Node, before: Node | null) {
    this.value = node.value;
    this.node = document.createTextNode(node.value);
    parent.insertBefore(this.node, before);
  }
  first() {
    return this.node;
  }
  last() {
    return this.node;
  }
  patch(node: VNode): boolean {
    if (node.kind !== 'text') return false;
    if (node.value !== this.value) this.node.data = this.value = node.value;
    return true;
  }
  destroy(removeDom: boolean): void {
    if (removeDom) this.node.remove();
  }
}

class ReactiveText implements Rendered {
  readonly node: Text;
  binding: () => unknown;
  stop: () => void;
  value = '';
  constructor(
    node: VNode & { kind: 'reactive-text' },
    parent: Node,
    before: Node | null,
    readonly injector: CraftInjector,
  ) {
    this.binding = node.binding;
    this.node = document.createTextNode('');
    parent.insertBefore(this.node, before);
    this.stop = this.bind();
  }
  bind(): () => void {
    return detachedEffect(() => {
      const resolved = resolve(this.binding, this.injector);
      const next =
        resolved === null || resolved === undefined || resolved === false
          ? ''
          : String(resolved);
      if (next !== this.value) this.node.data = this.value = next;
    });
  }
  first() {
    return this.node;
  }
  last() {
    return this.node;
  }
  patch(node: VNode): boolean {
    if (node.kind !== 'reactive-text') return false;
    if (node.binding !== this.binding) {
      this.stop();
      this.binding = node.binding;
      this.stop = this.bind();
    }
    return true;
  }
  destroy(removeDom: boolean): void {
    this.stop();
    if (removeDom) this.node.remove();
  }
}

class ElementRendered implements Rendered {
  readonly element: Element;
  props: Record<string, unknown> = EMPTY_PROPS;
  bindings: Map<string, { source: unknown; stop: () => void }> | null = null;
  children: Rendered[] = [];
  constructor(
    node: VNode & { kind: 'element' },
    parent: Node,
    before: Node | null,
    readonly injector: CraftInjector,
  ) {
    this.element = document.createElement(node.tag);
    this.applyProps(node.props);
    const children = normalize(node.children);
    for (const child of children)
      this.children.push(mount(child, this.element, null, injector));
    parent.insertBefore(this.element, before);
  }
  applyProps(next: Record<string, unknown>): void {
    const previous = this.props;
    if (previous === next) return;
    for (const key in previous) {
      if (!(key in next)) {
        this.unbind(key);
        this.element.removeAttribute(key);
      }
    }
    for (const key in next) {
      const value = next[key];
      if (typeof value === 'function') {
        const current = this.bindings?.get(key);
        if (current?.source === value) continue;
        current?.stop();
        let initialized = false;
        let last: unknown;
        const stop = detachedEffect(() => {
          const resolved = resolve(value, this.injector);
          if (!initialized || !Object.is(last, resolved)) {
            setAttribute(this.element, key, resolved);
            last = resolved;
            initialized = true;
          }
        });
        (this.bindings ??= new Map()).set(key, { source: value, stop });
      } else {
        this.unbind(key);
        if (!Object.is(previous[key], value)) setAttribute(this.element, key, value);
      }
    }
    this.props = next;
  }
  unbind(key: string): void {
    const current = this.bindings?.get(key);
    if (!current) return;
    current.stop();
    this.bindings!.delete(key);
  }
  first() {
    return this.element;
  }
  last() {
    return this.element;
  }
  patch(node: VNode): boolean {
    if (node.kind !== 'element' || node.tag !== this.element.localName) return false;
    this.applyProps(node.props);
    const nodes = normalize(node.children);
    const shared = Math.min(this.children.length, nodes.length);
    for (let index = 0; index < shared; index++) {
      const current = this.children[index];
      if (!current.patch(nodes[index])) {
        this.children[index] = mount(
          nodes[index],
          this.element,
          current.first(),
          this.injector,
        );
        current.destroy(true);
      }
    }
    for (let index = this.children.length; index < nodes.length; index++)
      this.children.push(mount(nodes[index], this.element, null, this.injector));
    for (const removed of this.children.splice(nodes.length)) removed.destroy(true);
    return true;
  }
  destroy(removeDom: boolean): void {
    if (this.bindings) for (const binding of this.bindings.values()) binding.stop();
    for (const child of this.children) child.destroy(false);
    if (removeDom) this.element.remove();
  }
}

function setAttribute(element: Element, key: string, value: unknown): void {
  if (value === null || value === undefined || value === false)
    element.removeAttribute(key);
  else element.setAttribute(key, value === true ? '' : String(value));
}

class ComponentRendered implements Rendered {
  readonly component: ComponentFn;
  readonly keys: string[];
  readonly cells: Cell<unknown>[];
  readonly block: Block;
  readonly stop: () => void;
  constructor(
    node: VNode & { kind: 'component' },
    parent: Node,
    before: Node | null,
    parentInjector: CraftInjector,
  ) {
    this.component = node.component;
    const definition = node.component.definition;
    const injector = definition.meta.providers?.length
      ? ɵcreateEnvironmentInjector(
          [...definition.meta.providers] as never,
          parentInjector as never,
          'CraftComponent',
        )
      : parentInjector;
    this.keys = Object.keys(node.props);
    this.cells = this.keys.map((key) => signal(node.props[key]) as Cell<unknown>);
    const inputs: Record<string, unknown> = {};
    for (let index = 0; index < this.keys.length; index++)
      inputs[this.keys[index]] = inputShell(this.cells[index]);
    this.block = new Block(parent, before, injector);
    this.stop = detachedEffect(() => {
      this.block.patch(injector.run(() => definition.template(inputs)));
    });
  }
  first() {
    return this.block.first();
  }
  last() {
    return this.block.last();
  }
  patch(node: VNode): boolean {
    if (node.kind !== 'component' || node.component !== this.component) return false;
    for (let index = 0; index < this.keys.length; index++)
      this.cells[index](node.props[this.keys[index]]);
    return true;
  }
  destroy(removeDom: boolean): void {
    this.stop();
    this.block.destroy(removeDom);
  }
}

function inputShell(cell: Cell<unknown>): unknown {
  return markYieldableMethod((...args: unknown[]) => {
    const current = cell();
    if (args.length > 0 && typeof current === 'function')
      return (current as (...inner: unknown[]) => unknown)(...args);
    const value = typeof current === 'function' ? (current as () => unknown)() : current;
    return isIterator(value) ? value : new Settled(value);
  });
}

/** An already-settled read: `yield*` gets the value without a generator. */
class Settled<T> {
  readonly done = true;
  constructor(readonly value: T) {}
  next(): this {
    return this;
  }
  [Symbol.iterator](): this {
    return this;
  }
}

interface Entry {
  readonly key: unknown;
  item: unknown;
  index: number;
  readonly indexCell: Cell<number>;
  readonly indexReader: () => Generator<never, number, unknown>;
  readonly block: Block;
  stop: (() => void) | undefined;
}

class ForRendered implements Rendered {
  readonly start: Comment;
  readonly end: Comment;
  entries = new Map<unknown, Entry>();
  readonly stop: () => void;
  node: VNode & { kind: 'for' };
  constructor(
    node: VNode & { kind: 'for' },
    readonly parent: Node,
    before: Node | null,
    readonly injector: CraftInjector,
  ) {
    this.node = node;
    this.start = document.createComment('for');
    this.end = document.createComment('/for');
    parent.insertBefore(this.start, before);
    parent.insertBefore(this.end, before);
    this.stop = detachedEffect(() => {
      const items = resolve(this.node.source, injector) as readonly unknown[];
      untrack(() => this.reconcile(items ?? []));
    });
  }
  reconcile(items: readonly unknown[]): void {
    const previous = this.entries;
    const next = new Map<unknown, Entry>();
    const ordered: Entry[] = [];
    const toRender: Entry[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const key = this.node.track(item, index);
      if (next.has(key)) throw new Error(`duplicate key ${String(key)}`);
      let entry = previous.get(key);
      if (entry) {
        if (!Object.is(entry.item, item)) {
          entry.item = item;
          toRender.push(entry);
        }
        if (entry.index !== index) entry.indexCell((entry.index = index));
      } else {
        const indexCell = signal(index) as Cell<number>;
        entry = {
          key,
          item,
          index,
          indexCell,
          indexReader: function* () {
            return indexCell();
          },
          block: new Block(this.parent, this.end, this.injector),
          stop: undefined,
        };
        toRender.push(entry);
      }
      next.set(key, entry);
      ordered.push(entry);
    }
    for (const [key, entry] of previous) {
      if (!next.has(key)) {
        entry.stop?.();
        entry.block.destroy(true);
      }
    }
    let before: Node = this.end;
    for (let index = ordered.length - 1; index >= 0; index--) {
      const block = ordered[index].block;
      if (block.last().nextSibling !== before) block.moveBefore(before);
      before = block.first();
    }
    this.entries = next;
    for (const entry of toRender) {
      entry.stop?.();
      const item = entry.item;
      const itemReader = function* () {
        return item;
      };
      entry.stop = detachedEffect(() =>
        entry.block.patch(this.node.itemTemplate(itemReader, entry.indexReader)),
      );
    }
  }
  first() {
    return this.start;
  }
  last() {
    return this.end;
  }
  patch(node: VNode): boolean {
    if (node.kind !== 'for') return false;
    this.node = node;
    return true;
  }
  destroy(removeDom: boolean): void {
    this.stop();
    for (const entry of this.entries.values()) {
      entry.stop?.();
      entry.block.destroy(removeDom);
    }
    if (removeDom) {
      this.start.remove();
      this.end.remove();
    }
  }
}
