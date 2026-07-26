import {
  ApplicationRef,
  createComponent,
  createEnvironmentInjector,
  ElementRef,
  EnvironmentInjector,
  Injector,
  inputBinding,
  outputBinding,
  reflectComponentType,
  Renderer2,
  RendererFactory2,
  runInInjectionContext,
  signal,
  untracked,
  type Binding,
  type ComponentRef,
  type DirectiveWithBindings,
  type EffectRef,
  type Type,
} from '@angular/core';
import {
  craftEffect,
  craftLazy,
  executeYieldable,
  isYieldableMethod,
  toYieldable,
  type CraftServiceProvider,
} from '@craft-ng/core';
import { executeCraftComponentFactory } from '../factory-runtime';
import { CraftAngularDirectiveHost } from '../angular-host';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  type CraftComponent,
} from '../types';
import {
  normalizeChildren,
  mergeHostProps,
  type AngularComponentNode,
  type AngularDirectiveNode,
  type CraftDirectiveNode,
  type CraftNode,
  type CraftNodeChildren,
  type DeferNode,
  type EachNode,
  type ElementNodeBase,
} from './vnode';
import { executeCraftComponentFactoryAsync } from '../factory-runtime';
import {
  CraftStyleRegistry,
  ɵfallbackCraftStyleRegistry,
} from './style-registry';
import { scopeCss, scopeIdFor } from './style-scope';

declare const ngDevMode: boolean | undefined;

type NativeNode = Node;
type NativeParent = Node;

interface RenderContext {
  readonly renderer: Renderer2;
  readonly injector: Injector;
  readonly componentContext?: unknown;
  readonly ownerScope?: string;
  readonly rootScope?: string;
  readonly styleRoot?: Document | ShadowRoot;
  readonly styles?: CraftStyleRegistry;
}

function childContext(
  context: RenderContext,
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return { ...context, ...overrides };
}

function scopeTokens(parent: string | undefined, own: string): string {
  return [parent, own].filter(Boolean).join(' ');
}

function styleValues(
  styles: string | readonly string[] | undefined,
): readonly string[] {
  return typeof styles === 'string' ? [styles] : (styles ?? []);
}

function acquireStyles(
  context: RenderContext,
  owners: readonly {
    readonly name: string;
    readonly styles?: string | readonly string[];
    readonly definition?: object;
  }[],
  ownerScope: string,
): (() => void)[] {
  if (!context.styleRoot || !context.styles) return [];
  const registry = context.styles;
  const releases: (() => void)[] = [];
  owners.forEach((owner, index) => {
    const scope = scopeIdFor(owner.definition ?? {}, owner.name);
    const css = styleValues(owner.styles);
    if (!css.length) return;
    releases.push(
      registry.acquire(
        context.styleRoot!,
        `craft:${ownerScope}:${scope}`,
        scopeCss(ownerScope, css.join('\n')),
        index,
      ),
    );
  });
  return releases;
}

interface RenderedNode {
  readonly kind: CraftNode['kind'] | 'fragment';
  firstNode(): NativeNode;
  lastNode(): NativeNode;
  patch(node: CraftNode): boolean;
  destroy(): void;
}

function resolveAngularValue(value: unknown): unknown {
  return typeof value === 'function' ? value() : value;
}

function resolveHostValue(value: unknown): unknown {
  return typeof value === 'function' ? value() : value;
}

function executeTemplateCallback(
  callback: (...args: any[]) => unknown,
  args: any[],
  context: RenderContext,
): unknown {
  return executeYieldable(callback, args, context.injector);
}

function resolveTemplateValue(value: unknown, context: RenderContext): unknown {
  return typeof value === 'function'
    ? executeTemplateCallback(value as (...args: any[]) => unknown, [], context)
    : value;
}

function projectYieldableTemplateContext(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (typeof value === 'function') {
    if (isYieldableMethod(value)) {
      return toYieldable(value as (...args: any[]) => any);
    }

    // State and resource refs are callable objects with exposed insertions
    // (for example `counter.disabled`). Keep the callable ref intact while
    // projecting its nested yieldable members into the template context.
    if (Object.keys(value).length === 0) return value;
    if (seen.has(value)) return seen.get(value);

    const projected = new Proxy(value, {
      get(target, property, receiver) {
        return projectYieldableTemplateContext(
          Reflect.get(target, property, receiver),
          seen,
        );
      },
    });
    seen.set(value, projected);
    return projected;
  }
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const result = value.map((item) =>
      projectYieldableTemplateContext(item, seen),
    );
    seen.set(value, result);
    return result;
  }
  if ('asReadonly' in value || 'set' in value || 'update' in value) {
    return value;
  }
  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const [key, child] of Object.entries(value)) {
    result[key] = projectYieldableTemplateContext(child, seen);
  }
  return result;
}

function angularBindings(
  getInputs: () => Readonly<Record<string, unknown>>,
  getOutputs: () => Readonly<Record<string, (value: unknown) => unknown>>,
  context: RenderContext,
): Binding[] {
  return [
    ...Object.keys(getInputs()).map((name) =>
      inputBinding(name, () => resolveAngularValue(getInputs()[name])),
    ),
    ...Object.keys(getOutputs()).map((name) =>
      outputBinding(name, (value) =>
        executeTemplateCallback(getOutputs()[name]!, [value], context),
      ),
    ),
  ];
}

function angularDirectives(
  source: ReturnType<typeof signal<readonly AngularDirectiveNode[]>>,
  context: RenderContext,
): DirectiveWithBindings<unknown>[] {
  return source().map((descriptor, index) => ({
    type: descriptor.type,
    bindings: angularBindings(
      () => source()[index]?.inputs ?? {},
      () => source()[index]?.outputs ?? {},
      context,
    ),
  }));
}

class AngularMount {
  private readonly descriptorSource;
  private readonly directiveSource;
  private readonly componentRef: ComponentRef<unknown>;
  private readonly applicationRef: ApplicationRef;

  constructor(
    component: Type<unknown>,
    hostElement: Element,
    injector: Injector | undefined,
    inputs: Readonly<Record<string, unknown>>,
    outputs: Readonly<Record<string, (value: unknown) => unknown>>,
    directives: readonly AngularDirectiveNode[],
    context: RenderContext,
  ) {
    const elementInjector = injector ?? context.injector;
    this.descriptorSource = signal({ inputs, outputs, directives });
    this.directiveSource = signal(directives);
    this.applicationRef = context.injector.get(ApplicationRef);
    this.componentRef = createComponent(component, {
      environmentInjector: elementInjector.get(EnvironmentInjector),
      elementInjector,
      hostElement,
      bindings: angularBindings(
        () => this.descriptorSource().inputs,
        () => this.descriptorSource().outputs,
        context,
      ),
      directives: angularDirectives(this.directiveSource, context),
    });
    this.applicationRef.attachView(this.componentRef.hostView);
    this.componentRef.changeDetectorRef.detectChanges();
  }

  update(
    inputs: Readonly<Record<string, unknown>>,
    outputs: Readonly<Record<string, (value: unknown) => unknown>>,
    directives: readonly AngularDirectiveNode[],
  ): void {
    this.descriptorSource.set({ inputs, outputs, directives });
    this.directiveSource.set(directives);
    this.componentRef.changeDetectorRef.detectChanges();
  }

  destroy(): void {
    this.applicationRef.detachView(this.componentRef.hostView);
    this.componentRef.destroy();
  }
}

function sameDirectives(
  left: readonly AngularDirectiveNode[],
  right: readonly AngularDirectiveNode[],
): boolean {
  return (
    left.length === right.length &&
    left.every((directive, index) => directive.type === right[index]?.type)
  );
}

function sameCraftDirectives(
  left: readonly CraftDirectiveNode['directives'][number][],
  right: readonly CraftDirectiveNode['directives'][number][],
): boolean {
  return (
    left.length === right.length &&
    left.every((directive, index) => directive === right[index])
  );
}

function insertBefore(
  renderer: Renderer2,
  parent: NativeParent,
  node: NativeNode,
  before: NativeNode | null,
): void {
  renderer.insertBefore(parent, node, before);
}

function removeNode(renderer: Renderer2, node: NativeNode): void {
  const parent = node.parentNode;
  if (parent) {
    renderer.removeChild(parent, node);
  }
}

function patchRenderedChildren(
  parent: NativeParent,
  rendered: RenderedNode[],
  children: CraftNodeChildren,
  before: NativeNode | null,
  context: RenderContext,
): RenderedNode[] {
  const nextNodes = normalizeChildren(children);
  const sharedLength = Math.min(rendered.length, nextNodes.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const current = rendered[index];
    const next = nextNodes[index];

    if (!current.patch(next)) {
      const replacement = mountNode(next, parent, current.firstNode(), context);
      current.destroy();
      rendered[index] = replacement;
    }
  }

  while (rendered.length > nextNodes.length) {
    rendered.pop()?.destroy();
  }

  for (let index = rendered.length; index < nextNodes.length; index += 1) {
    rendered.push(mountNode(nextNodes[index], parent, before, context));
  }

  return rendered;
}

class TextRenderedNode implements RenderedNode {
  readonly kind = 'text';

  constructor(
    private node: Text,
    private value: string,
    private renderer: Renderer2,
  ) {}

  firstNode(): NativeNode {
    return this.node;
  }

  lastNode(): NativeNode {
    return this.node;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'text') {
      return false;
    }

    if (node.value !== this.value) {
      this.renderer.setValue(this.node, node.value);
      this.value = node.value;
    }
    return true;
  }

  destroy(): void {
    removeNode(this.renderer, this.node);
  }
}

function renderCraftDirectiveNode(
  node: CraftDirectiveNode,
  context: RenderContext,
): CraftNodeChildren {
  let template = (_componentContext: any): CraftNodeChildren => [node.node];

  for (const directive of node.directives) {
    template = directive[CRAFT_DIRECTIVE].template(template);
  }

  return template(context.componentContext);
}

class CraftDirectiveRenderedNode implements RenderedNode {
  readonly kind = 'directive';
  private readonly view: FragmentRenderedNode;
  private readonly styleReleases: (() => void)[];

  constructor(
    private node: CraftDirectiveNode,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    const owners = node.directives.map((directive) => ({
      name: directive[CRAFT_DIRECTIVE].name,
      styles: directive[CRAFT_DIRECTIVE].meta.styles,
      definition: directive[CRAFT_DIRECTIVE],
    }));
    this.styleReleases = acquireStyles(
      context,
      owners,
      context.ownerScope ?? '',
    );
    this.view = createFragment(
      parent,
      before,
      context,
      renderCraftDirectiveNode(node, context),
      'craft-directive',
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (
      node.kind !== 'directive' ||
      !sameCraftDirectives(this.node.directives, node.directives)
    ) {
      return false;
    }

    this.node = node;
    this.view.patchChildren(renderCraftDirectiveNode(node, this.context));
    return true;
  }

  destroy(): void {
    this.view.destroy();
    this.styleReleases.forEach((release) => release());
  }
}

const EVENT_NAMES = new Set([
  'abort',
  'blur',
  'change',
  'click',
  'contextmenu',
  'dblclick',
  'error',
  'focus',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerup',
  'reset',
  'scroll',
  'submit',
  'touchend',
  'touchmove',
  'touchstart',
]);

const PROPERTY_NAMES = new Set([
  'checked',
  'disabled',
  'multiple',
  'selected',
  'value',
]);

function eventNameFor(key: string, value: unknown): string | undefined {
  if (typeof value !== 'function') {
    return undefined;
  }
  if (EVENT_NAMES.has(key)) {
    return key;
  }
  if (/^on[A-Z]/.test(key)) {
    return `${key[2].toLowerCase()}${key.slice(3)}`;
  }
  return undefined;
}

const HOST_PROPERTY_NAMES = new Set([
  'accessKey',
  'autocapitalize',
  'autofocus',
  'class',
  'contentEditable',
  'dir',
  'draggable',
  'hidden',
  'id',
  'inert',
  'lang',
  'nonce',
  'slot',
  'spellcheck',
  'style',
  'tabIndex',
  'title',
  'translate',
  'attrs',
  'directives',
]);

function isHostProperty(key: string): boolean {
  return (
    HOST_PROPERTY_NAMES.has(key) ||
    key.startsWith('data-') ||
    key.startsWith('aria-') ||
    EVENT_NAMES.has(key) ||
    (/^on[A-Z]/.test(key) &&
      EVENT_NAMES.has(`${key[2].toLowerCase()}${key.slice(3)}`))
  );
}

function hostPropsFromComponentProps(
  props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => isHostProperty(key)),
  );
}

function className(value: unknown, context: RenderContext): string {
  if (typeof value === 'function') {
    return className(resolveTemplateValue(value, context), context);
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => className(item, context))
      .filter(Boolean)
      .join(' ');
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(' ');
  }
  return value == null ? '' : String(value);
}

function setStyleValue(
  renderer: Renderer2,
  element: Element,
  key: string,
  value: unknown,
  context: RenderContext,
): void {
  value = resolveTemplateValue(value, context);
  if (value === null || value === undefined || value === false) {
    renderer.removeStyle(element, key);
  } else {
    renderer.setStyle(element, key, String(value));
  }
}

function applyStyles(
  renderer: Renderer2,
  element: Element,
  previous: unknown,
  next: unknown,
  context: RenderContext,
): void {
  previous = resolveTemplateValue(previous, context);
  next = resolveTemplateValue(next, context);
  if (typeof previous === 'object' && previous !== null) {
    for (const key of Object.keys(previous)) {
      if (typeof next !== 'object' || next === null || !(key in next)) {
        renderer.removeStyle(element, key);
      }
    }
  } else if (typeof previous === 'string' && previous !== next) {
    renderer.removeAttribute(element, 'style');
  }

  if (typeof next === 'string') {
    renderer.setAttribute(element, 'style', next);
  } else if (typeof next === 'object' && next !== null) {
    for (const [key, value] of Object.entries(next)) {
      setStyleValue(renderer, element, key, value, context);
    }
  } else {
    renderer.removeAttribute(element, 'style');
  }
}

function flattenAttributes(
  props: Readonly<Record<string, unknown>>,
): Map<string, unknown> {
  const attributes = new Map<string, unknown>();
  for (const [key, value] of Object.entries(props)) {
    if (key === 'attrs' && typeof value === 'object' && value !== null) {
      for (const [attribute, attributeValue] of Object.entries(value)) {
        attributes.set(attribute, attributeValue);
      }
    } else if (
      key !== 'class' &&
      key !== 'style' &&
      key !== 'directives' &&
      !eventNameFor(key, value)
    ) {
      attributes.set(key, value);
    }
  }
  return attributes;
}

function applyAttribute(
  renderer: Renderer2,
  element: Element,
  key: string,
  value: unknown,
  context: RenderContext,
): void {
  value = resolveTemplateValue(value, context);
  if (key.startsWith('data-craft-')) {
    const dev = typeof ngDevMode === 'undefined' || ngDevMode;
    if (dev) {
      throw new Error(
        'data-craft-* attributes are reserved for the Craft renderer.',
      );
    }
  }
  if (PROPERTY_NAMES.has(key)) {
    renderer.setProperty(element, key, value ?? false);
    if (value === null || value === undefined || value === false) {
      renderer.removeAttribute(element, key);
    }
    return;
  }

  if (value === null || value === undefined || value === false) {
    renderer.removeAttribute(element, key);
  } else {
    renderer.setAttribute(element, key, value === true ? '' : String(value));
  }
}

class ElementRenderedNode implements RenderedNode {
  readonly kind = 'element';
  private children: RenderedNode[] = [];
  private props: Readonly<Record<string, unknown>> = {};
  private readonly listeners = new Map<string, () => void>();
  private angularDirectiveMount: AngularMount | undefined;
  private directiveTypes: readonly AngularDirectiveNode[] = [];

  constructor(
    private readonly node: Element,
    private tag: string,
    private readonly context: RenderContext,
    initial: ElementNodeBase,
  ) {
    this.patchProperties(initial.props);
    this.children = patchRenderedChildren(
      this.node,
      this.children,
      initial.children,
      null,
      childContext(context, { rootScope: undefined }),
    );
  }

  firstNode(): NativeNode {
    return this.node;
  }

  lastNode(): NativeNode {
    return this.node;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'element' || node.tag !== this.tag) {
      return false;
    }

    this.patchProperties(node.props);
    this.children = patchRenderedChildren(
      this.node,
      this.children,
      node.children,
      null,
      childContext(this.context, { rootScope: undefined }),
    );
    return true;
  }

  private patchProperties(next: Readonly<Record<string, unknown>>): void {
    const renderer = this.context.renderer;
    const previousAttributes = flattenAttributes(this.props);
    const nextAttributes = flattenAttributes(next);

    for (const key of previousAttributes.keys()) {
      if (!nextAttributes.has(key)) {
        applyAttribute(renderer, this.node, key, null, this.context);
      }
    }
    for (const [key, value] of nextAttributes) {
      if (
        !Object.is(previousAttributes.get(key), value) ||
        typeof value === 'function'
      ) {
        applyAttribute(renderer, this.node, key, value, this.context);
      }
    }

    if (
      !Object.is(this.props['class'], next['class']) ||
      typeof next['class'] === 'function'
    ) {
      const value = className(next['class'], this.context);
      if (value) {
        renderer.setAttribute(this.node, 'class', value);
      } else {
        renderer.removeAttribute(this.node, 'class');
      }
    }

    if (
      !Object.is(this.props['style'], next['style']) ||
      typeof next['style'] === 'function'
    ) {
      applyStyles(
        renderer,
        this.node,
        this.props['style'],
        next['style'],
        this.context,
      );
    }

    const nextEvents = new Map<string, EventListener>();
    for (const [key, value] of Object.entries(next)) {
      const eventName = eventNameFor(key, value);
      if (eventName) {
        nextEvents.set(eventName, value as EventListener);
      }
    }

    for (const [eventName, dispose] of this.listeners) {
      const previousValue = Object.entries(this.props).find(
        ([key, value]) => eventNameFor(key, value) === eventName,
      )?.[1];
      if (!Object.is(previousValue, nextEvents.get(eventName))) {
        dispose();
        this.listeners.delete(eventName);
      }
    }

    for (const [eventName, listener] of nextEvents) {
      if (!this.listeners.has(eventName)) {
        this.listeners.set(
          eventName,
          renderer.listen(this.node, eventName, (event: Event) => {
            executeTemplateCallback(listener, [event], this.context);
            return undefined;
          }),
        );
      }
    }

    const directives = Array.isArray(next['directives'])
      ? (next['directives'] as readonly AngularDirectiveNode[])
      : [];
    if (!sameDirectives(this.directiveTypes, directives)) {
      this.angularDirectiveMount?.destroy();
      this.angularDirectiveMount = directives.length
        ? new AngularMount(
            CraftAngularDirectiveHost,
            this.node,
            undefined,
            {},
            {},
            directives,
            this.context,
          )
        : undefined;
    } else {
      this.angularDirectiveMount?.update({}, {}, directives);
    }
    this.directiveTypes = directives;

    this.props = next;
  }

  destroy(): void {
    this.listeners.forEach((dispose) => dispose());
    this.listeners.clear();
    this.angularDirectiveMount?.destroy();
    this.children.forEach((child) => child.destroy());
    removeNode(this.context.renderer, this.node);
  }
}

class FragmentRenderedNode implements RenderedNode {
  readonly kind = 'fragment';
  private children: RenderedNode[] = [];

  constructor(
    private readonly parent: NativeParent,
    private readonly start: Comment,
    private readonly end: Comment,
    private readonly context: RenderContext,
    initialChildren: CraftNodeChildren,
  ) {
    this.children = patchRenderedChildren(
      parent,
      this.children,
      initialChildren,
      end,
      context,
    );
  }

  firstNode(): NativeNode {
    return this.start;
  }

  lastNode(): NativeNode {
    return this.end;
  }

  patch(_node: CraftNode): boolean {
    return false;
  }

  patchChildren(children: CraftNodeChildren): void {
    this.children = patchRenderedChildren(
      this.parent,
      this.children,
      children,
      this.end,
      this.context,
    );
  }

  moveBefore(before: NativeNode): void {
    let current: NativeNode | null = this.start;
    const nodes: NativeNode[] = [];
    while (current) {
      nodes.push(current);
      if (current === this.end) {
        break;
      }
      current = current.nextSibling;
    }
    nodes.forEach((node) =>
      insertBefore(this.context.renderer, this.parent, node, before),
    );
  }

  destroy(): void {
    this.children.forEach((child) => child.destroy());
    removeNode(this.context.renderer, this.start);
    removeNode(this.context.renderer, this.end);
  }
}

function createFragment(
  parent: NativeParent,
  before: NativeNode | null,
  context: RenderContext,
  children: CraftNodeChildren,
  label: string,
): FragmentRenderedNode {
  const start = context.renderer.createComment(`${label}:start`) as Comment;
  const end = context.renderer.createComment(`${label}:end`) as Comment;
  insertBefore(context.renderer, parent, start, before);
  insertBefore(context.renderer, parent, end, before);
  return new FragmentRenderedNode(parent, start, end, context, children);
}

class EachRenderedNode implements RenderedNode {
  readonly kind = 'each';
  private entries = new Map<unknown, FragmentRenderedNode>();
  private ordered: FragmentRenderedNode[] = [];
  private emptyView: FragmentRenderedNode | undefined;

  constructor(
    private node: EachNode<unknown, unknown>,
    private readonly parent: NativeParent,
    private readonly start: Comment,
    private readonly end: Comment,
    private readonly context: RenderContext,
  ) {
    this.reconcile();
  }

  firstNode(): NativeNode {
    return this.start;
  }

  lastNode(): NativeNode {
    return this.end;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'each') {
      return false;
    }
    this.node = node;
    this.reconcile();
    return true;
  }

  private reconcile(): void {
    const items =
      typeof this.node.source === 'function'
        ? this.node.source()
        : this.node.source;

    if (items.length === 0) {
      this.entries.forEach((entry) => entry.destroy());
      this.entries.clear();
      this.ordered = [];

      if (this.node.empty) {
        if (this.emptyView) {
          this.emptyView.patchChildren(this.node.empty());
        } else {
          this.emptyView = createFragment(
            this.parent,
            this.end,
            this.context,
            this.node.empty(),
            'craft-empty',
          );
        }
      } else {
        this.emptyView?.destroy();
        this.emptyView = undefined;
      }
      return;
    }

    this.emptyView?.destroy();
    this.emptyView = undefined;

    const previous = this.entries;
    const next = new Map<unknown, FragmentRenderedNode>();
    const nextOrdered: FragmentRenderedNode[] = [];

    items.forEach((item, index) => {
      const key = this.node.track(item, index);
      if (next.has(key)) {
        throw new Error(`each() received the duplicate key "${String(key)}".`);
      }

      let entry = previous.get(key);
      if (entry) {
        entry.patchChildren(this.node.itemTemplate(item, index));
      } else {
        entry = createFragment(
          this.parent,
          this.end,
          this.context,
          this.node.itemTemplate(item, index),
          `craft-each:${String(key)}`,
        );
      }

      next.set(key, entry);
      nextOrdered.push(entry);
    });

    previous.forEach((entry, key) => {
      if (!next.has(key)) {
        entry.destroy();
      }
    });

    let before: NativeNode = this.end;
    for (let index = nextOrdered.length - 1; index >= 0; index -= 1) {
      const entry = nextOrdered[index];
      entry.moveBefore(before);
      before = entry.firstNode();
    }

    this.entries = next;
    this.ordered = nextOrdered;
  }

  destroy(): void {
    this.entries.forEach((entry) => entry.destroy());
    this.emptyView?.destroy();
    removeNode(this.context.renderer, this.start);
    removeNode(this.context.renderer, this.end);
  }
}

class AngularRenderedNode implements RenderedNode {
  readonly kind = 'angular';
  private readonly hostElement: Element;
  private readonly mount: AngularMount;
  private node: AngularComponentNode;

  constructor(
    node: AngularComponentNode,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.node = node;
    const selector = reflectComponentType(node.component)?.selector;
    const tag =
      selector && /^[a-z][a-z0-9-]*$/i.test(selector) ? selector : 'div';
    this.hostElement = context.renderer.createElement(tag) as Element;
    context.renderer.setAttribute(
      this.hostElement,
      'data-craft-root',
      scopeTokens(context.rootScope, `angular:${tag}`),
    );
    insertBefore(context.renderer, parent, this.hostElement, before);
    this.mount = new AngularMount(
      node.component,
      this.hostElement,
      node.injector,
      node.inputs,
      node.outputs,
      node.directives,
      context,
    );
  }

  firstNode(): NativeNode {
    return this.hostElement;
  }

  lastNode(): NativeNode {
    return this.hostElement;
  }

  patch(node: CraftNode): boolean {
    if (
      node.kind !== 'angular' ||
      node.component !== this.node.component ||
      node.injector !== this.node.injector ||
      !sameDirectives(node.directives, this.node.directives)
    ) {
      return false;
    }
    this.node = node;
    this.mount.update(node.inputs, node.outputs, node.directives);
    return true;
  }

  destroy(): void {
    this.mount.destroy();
    removeNode(this.context.renderer, this.hostElement);
  }
}

class ComponentRenderedNode implements RenderedNode {
  readonly kind = 'component';
  private readonly environmentInjector: EnvironmentInjector;
  private readonly propKeys: string[];
  private readonly propSources: ReturnType<typeof signal<unknown>>[];
  private readonly hostPropsSource;
  private readonly view: FragmentRenderedNode;
  private readonly effectRef: EffectRef;
  private readonly styleReleases: (() => void)[];
  private readonly templateOnly: boolean;
  private factoryContext: unknown;

  constructor(
    private component: CraftComponent<object>,
    props: object,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
    hostTarget?: Element,
    templateContext?: { readonly value: unknown },
    additionalProviders: readonly CraftServiceProvider[] = [],
  ) {
    this.templateOnly = templateContext !== undefined;
    const definition = component[CRAFT_COMPONENT];
    const ownScope = scopeIdFor(definition.scopeDefinition, definition.name);
    this.styleReleases = acquireStyles(
      context,
      definition.styleOwners,
      ownScope,
    );
    const componentRenderContext = childContext(context, {
      ownerScope: ownScope,
      rootScope: scopeTokens(context.rootScope, ownScope),
    });
    const componentElement =
      hostTarget ?? (parent instanceof Element ? parent : parent.parentElement);
    // Angular's runtime accepts any Injector as the R3Injector parent even
    // though the public helper narrows the type to EnvironmentInjector. Keep
    // the immediate parent here: unwrapping it through
    // `get(EnvironmentInjector)` would skip route-scoped providers such as
    // ActivatedRoute and ChildrenOutletContexts.
    const parentInjector = context.injector as EnvironmentInjector;
    this.environmentInjector = createEnvironmentInjector(
      [
        ...(definition.meta.providers ?? []),
        {
          provide: ElementRef,
          useValue: new ElementRef(componentElement),
        },
        ...additionalProviders,
      ],
      parentInjector,
      'CraftComponent',
    );
    this.propKeys = this.templateOnly
      ? []
      : Object.keys(props).filter((key) => !isHostProperty(key));
    this.propSources = this.propKeys.map((key) =>
      signal((props as Record<string, unknown>)[key]),
    );
    this.hostPropsSource = signal(
      hostPropsFromComponentProps(props as Readonly<Record<string, unknown>>),
    );

    const args = this.propSources.map((source) => {
      return (...callbackArgs: unknown[]) => {
        const current = source();
        if (typeof current === 'function') {
          if (callbackArgs.length > 0) {
            return toYieldable((...args: unknown[]) =>
              (current as (...innerArgs: unknown[]) => unknown)(...args),
            )(...callbackArgs);
          }
          return current(...callbackArgs);
        }
        if (callbackArgs.length > 0) {
          throw new Error(
            'An Input<T> component prop was invoked as an Output callback.',
          );
        }
        return current;
      };
    });

    const factoryContext = this.templateOnly
      ? templateContext?.value
      : executeCraftComponentFactory(
          definition.factory,
          args,
          this.environmentInjector,
        );
    if (
      !this.templateOnly &&
      typeof factoryContext === 'object' &&
      factoryContext !== null &&
      'then' in factoryContext
    ) {
      throw new Error(
        'Async component factories are not renderable directly. Move asynchronous work behind defer().',
      );
    }
    this.factoryContext = factoryContext;

    this.view = createFragment(
      parent,
      before,
      childContext(componentRenderContext, {
        injector: this.environmentInjector,
        componentContext: factoryContext,
      }),
      [],
      'craft-component',
    );

    this.effectRef = untracked(() =>
      runInInjectionContext(this.environmentInjector, () =>
        craftEffect('component-render', () => {
          const hostProps = mergeHostProps(
            definition.meta.host ?? {},
            this.hostPropsSource(),
          );
          this.view.patchChildren(
            definition.template(
              projectYieldableTemplateContext(this.factoryContext) as never,
              hostProps,
            ),
          );
          if (hostTarget) {
            applyHostProperties(
              context.renderer,
              hostTarget,
              hostProps,
              context,
            );
          }
        }),
      ),
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'component' || node.component !== this.component) {
      return false;
    }

    const props = node.props as Record<string, unknown>;
    this.propKeys.forEach((key, index) => {
      this.propSources[index].set(props[key]);
    });
    this.hostPropsSource.set(
      hostPropsFromComponentProps(props as Readonly<Record<string, unknown>>),
    );
    return true;
  }

  updateProps(props: object): void {
    if (this.templateOnly) {
      return;
    }

    this.patch({
      kind: 'component',
      component: this.component,
      props,
    });
  }

  updateContext(context: unknown): void {
    if (!this.templateOnly) {
      throw new Error('Cannot update the context of a logic-backed component.');
    }

    this.factoryContext = context;
    const definition = this.component[CRAFT_COMPONENT];
    const hostProps = mergeHostProps(
      definition.meta.host ?? {},
      this.hostPropsSource(),
    );
    this.view.patchChildren(
      definition.template(
        projectYieldableTemplateContext(context) as never,
        hostProps,
      ),
    );
  }

  destroy(): void {
    this.effectRef.destroy();
    this.view.destroy();
    this.styleReleases.forEach((release) => release());
    this.environmentInjector.destroy();
  }
}

class DeferRenderedNode implements RenderedNode {
  readonly kind = 'defer';
  private view: FragmentRenderedNode;
  private state: 'placeholder' | 'loading' | 'loaded' | 'error' = 'placeholder';
  private destroyed = false;
  private triggerCleanup: (() => void) | undefined;
  private loadedValue: unknown;
  private loadError: unknown;

  constructor(
    private node: DeferNode<unknown>,
    private readonly parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.view = createFragment(
      parent,
      before,
      context,
      node.placeholder?.() ?? [],
      'craft-defer',
    );
    this.installTrigger();
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'defer' || node.loader !== this.node.loader) {
      return false;
    }
    this.node = node;
    if (this.state === 'loaded') {
      this.view.patchChildren(this.node.resolve(this.loadedValue));
    } else if (this.state === 'error') {
      this.view.patchChildren(this.node.error?.(this.loadError) ?? []);
    } else if (this.state === 'loading') {
      this.view.patchChildren(
        this.node.loading?.() ?? this.node.placeholder?.() ?? [],
      );
    } else {
      this.view.patchChildren(this.node.placeholder?.() ?? []);
    }
    return true;
  }

  private installTrigger(): void {
    if (this.node.trigger === 'immediate') {
      this.startLoad();
      return;
    }

    if (this.node.trigger === 'idle') {
      const windowRef = this.parent.ownerDocument?.defaultView;
      const idleWindow = windowRef as
        | (Window & {
            requestIdleCallback?: (callback: () => void) => number;
            cancelIdleCallback?: (handle: number) => void;
          })
        | undefined;
      if (idleWindow?.requestIdleCallback) {
        const handle = idleWindow.requestIdleCallback(() => this.startLoad());
        this.triggerCleanup = () => idleWindow.cancelIdleCallback?.(handle);
      } else {
        const handle = setTimeout(() => this.startLoad(), 0);
        this.triggerCleanup = () => clearTimeout(handle);
      }
      return;
    }

    if (
      this.node.trigger === 'viewport' &&
      typeof IntersectionObserver !== 'undefined'
    ) {
      const target = this.firstElementInView();
      if (target) {
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            this.startLoad();
          }
        });
        observer.observe(target);
        this.triggerCleanup = () => observer.disconnect();
        return;
      }
    }

    if (this.node.trigger === 'interaction') {
      const target = this.firstElementInView() ?? this.parent;
      const start = () => this.startLoad();
      const clickCleanup = this.context.renderer.listen(target, 'click', start);
      const keyCleanup = this.context.renderer.listen(target, 'keydown', start);
      this.triggerCleanup = () => {
        clickCleanup();
        keyCleanup();
      };
      return;
    }

    const handle = setTimeout(() => this.startLoad(), 0);
    this.triggerCleanup = () => clearTimeout(handle);
  }

  private firstElementInView(): Element | undefined {
    let current = this.view.firstNode().nextSibling;
    while (current && current !== this.view.lastNode()) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        return current as Element;
      }
      current = current.nextSibling;
    }
    return undefined;
  }

  private startLoad(): void {
    if (this.state !== 'placeholder' || this.destroyed) {
      return;
    }
    this.state = 'loading';
    this.triggerCleanup?.();
    this.triggerCleanup = undefined;
    this.view.patchChildren(
      this.node.loading?.() ?? this.node.placeholder?.() ?? [],
    );

    const loader = this.node.loader;
    executeCraftComponentFactoryAsync(
      function* () {
        return yield* craftLazy(() => loader());
      },
      [],
      this.context.injector,
    )
      .then((settled) => {
        if (this.destroyed) {
          return;
        }
        if (settled.kind === 'shortCircuit') {
          this.state = 'error';
          this.loadError = settled.exception;
          this.view.patchChildren(this.node.error?.(settled.exception) ?? []);
          return;
        }

        this.state = 'loaded';
        this.loadedValue = settled.value;
        this.view.patchChildren(this.node.resolve(settled.value));
      })
      .catch((error: unknown) => {
        if (!this.destroyed) {
          this.state = 'error';
          this.loadError = error;
          this.view.patchChildren(this.node.error?.(error) ?? []);
        }
      });
  }

  destroy(): void {
    this.destroyed = true;
    this.triggerCleanup?.();
    this.view.destroy();
  }
}

function mountNode(
  node: CraftNode,
  parent: NativeParent,
  before: NativeNode | null,
  context: RenderContext,
): RenderedNode {
  switch (node.kind) {
    case 'text': {
      const text = context.renderer.createText(node.value) as Text;
      insertBefore(context.renderer, parent, text, before);
      return new TextRenderedNode(text, node.value, context.renderer);
    }
    case 'element': {
      const element = context.renderer.createElement(node.tag) as Element;
      if (context.rootScope) {
        context.renderer.setAttribute(
          element,
          'data-craft-root',
          context.rootScope,
        );
      }
      insertBefore(context.renderer, parent, element, before);
      return new ElementRenderedNode(element, node.tag, context, node);
    }
    case 'component':
      return new ComponentRenderedNode(
        node.component,
        node.props,
        parent,
        before,
        context,
      );
    case 'angular':
      return new AngularRenderedNode(node, parent, before, context);
    case 'directive':
      return new CraftDirectiveRenderedNode(node, parent, before, context);
    case 'each': {
      const start = context.renderer.createComment(
        'craft-each:start',
      ) as Comment;
      const end = context.renderer.createComment('craft-each:end') as Comment;
      insertBefore(context.renderer, parent, start, before);
      insertBefore(context.renderer, parent, end, before);
      return new EachRenderedNode(node, parent, start, end, context);
    }
    case 'defer':
      return new DeferRenderedNode(node, parent, before, context);
  }
}

function applyHostProperties(
  renderer: Renderer2,
  host: Element,
  props: Readonly<Record<string, unknown>>,
  context: RenderContext,
): void {
  const attributes = flattenAttributes(props);
  attributes.forEach((value, key) =>
    applyAttribute(renderer, host, key, value, context),
  );
  const classes = className(props['class'], context);
  if (classes) {
    renderer.setAttribute(host, 'class', classes);
  }
  applyStyles(renderer, host, undefined, props['style'], context);
}

export interface MountedCraftComponent<Props extends object> {
  updateProps(props: Props): void;
  destroy(): void;
}

export interface MountedCraftTemplate<Context> {
  updateContext(context: Context): void;
  destroy(): void;
}

export function mountInterpretedComponent<Props extends object>(
  component: CraftComponent<Props>,
  host: Element,
  injector: Injector,
  props: Props,
): MountedCraftComponent<Props> {
  const renderer = injector.get(RendererFactory2).createRenderer(host, null);
  const rootNode = host.getRootNode();
  const styleRoot: Document | ShadowRoot =
    (typeof Document !== 'undefined' && rootNode instanceof Document) ||
    (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot)
      ? (rootNode as Document | ShadowRoot)
      : (host.ownerDocument ?? document);
  const styles = injector.get(CraftStyleRegistry, ɵfallbackCraftStyleRegistry);
  const instance = new ComponentRenderedNode(
    component as unknown as CraftComponent<object>,
    props,
    host,
    null,
    { renderer, injector, styleRoot, styles },
    host,
  );

  return {
    updateProps(nextProps) {
      instance.updateProps(nextProps);
    },
    destroy() {
      instance.destroy();
    },
  };
}

export function mountInterpretedComponentTemplate<Context>(
  component: CraftComponent<any>,
  host: Element,
  injector: Injector,
  context: Context,
  additionalProviders: readonly CraftServiceProvider[] = [],
): MountedCraftTemplate<Context> {
  const renderer = injector.get(RendererFactory2).createRenderer(host, null);
  const rootNode = host.getRootNode();
  const styleRoot: Document | ShadowRoot =
    (typeof Document !== 'undefined' && rootNode instanceof Document) ||
    (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot)
      ? (rootNode as Document | ShadowRoot)
      : (host.ownerDocument ?? document);
  const styles = injector.get(CraftStyleRegistry, ɵfallbackCraftStyleRegistry);
  const instance = new ComponentRenderedNode(
    component as CraftComponent<object>,
    {},
    host,
    null,
    { renderer, injector, styleRoot, styles },
    host,
    { value: context },
    additionalProviders,
  );

  return {
    updateContext(nextContext) {
      instance.updateContext(nextContext);
    },
    destroy() {
      instance.destroy();
    },
  };
}
