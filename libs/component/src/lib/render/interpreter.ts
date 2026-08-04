import {
  ApplicationRef,
  computed,
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
  type Provider,
  type Type,
} from '@angular/core';
import {
  CraftGenShortCircuit,
  CRAFT_SERVICE_PROVIDER_BRAND,
  ComponentRegister,
  craftEffect,
  craftLazy,
  executeYieldable,
  HOST_TAG_LIST,
  isCraftException,
  isCraftGenShortCircuit,
  isGeneratorFunction,
  markYieldableValue,
  isYieldableValue,
  isYieldableMethod,
  toYieldable,
  ɵfallbackComponentRegister,
  ɵregisterCraftTarget,
  type CraftServiceProvider,
  type AnyCraftException,
  YIELDABLE_VALUE,
} from '@craft-ng/core';
import { executeCraftComponentFactory } from '../factory-runtime';
import { CraftAngularDirectiveHost } from '../angular-host';
import type { HostProps } from '../hyperscript';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  CONTENT_DECLARATION_CONTEXT,
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
  type IfBlockNode,
  type ElementNodeBase,
  type CatchBlockNode,
  type MatchBlockNode,
  type ProjectionNode,
  type TemplateNode,
  withCraftRenderContext,
} from './vnode';
import {
  CraftUnhandledExceptionError,
  resolveCatchBlockHandler,
  type CatchBlockPosition,
} from '../block';
import { executeCraftComponentFactoryAsync } from '../factory-runtime';
import {
  CraftStyleRegistry,
  ɵfallbackCraftStyleRegistry,
} from './style-registry';
import { scopeCss, scopeIdFor } from './style-scope';
import {
  CRAFT_LOCATOR_CONTENT_NAMES,
  directCraftContentNames,
  findCraftTemplateLocator,
  type RuntimeLocatorCriteria,
} from '../locator';

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
  /** Styles exposed by the currently rendered Craft component, by slot. */
  readonly contentStyles?: Readonly<Partial<Record<string, string>>>;
  /** Marker applied to ordinary nodes in an opted-in projection. */
  readonly contentScope?: string;
  readonly exceptionBoundary?: (exception: AnyCraftException) => boolean;
  readonly exceptionBoundaryResolved?: () => void;
  readonly handledResourceExceptionCodes?: Set<string>;
  /** Lexical context of content declared by the parent component. */
  readonly declarationContext?: RenderContext;
}

let templateGeneratorDepth = 0;

function childContext(
  context: RenderContext,
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return { ...context, ...overrides };
}

function lexicalContext(context: RenderContext): RenderContext {
  return context.declarationContext ?? context;
}

function preserveContentDeclarationContext(
  value: unknown,
  context: unknown,
): unknown {
  if (typeof value !== 'function') return value;
  if (
    (value as Partial<Record<typeof CONTENT_DECLARATION_CONTEXT, unknown>>)[
      CONTENT_DECLARATION_CONTEXT
    ] !== undefined
  ) {
    return value;
  }
  const wrapped = (...args: unknown[]) =>
    (value as (...innerArgs: unknown[]) => unknown)(...args);
  Object.defineProperty(wrapped, CONTENT_DECLARATION_CONTEXT, {
    value: context,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return wrapped;
}

function renderChildrenCallback(
  context: RenderContext,
  callback: (...args: any[]) => CraftNodeChildren,
  args: readonly unknown[] = [],
): CraftNodeChildren {
  return runInInjectionContext(context.injector, () =>
    withCraftRenderContext(context, () => callback(...args)),
  );
}

function eagerlyResolveBrandedProviders(
  providers: readonly CraftServiceProvider[],
  injector: EnvironmentInjector,
  branded = false,
): {
  readonly exception?: AnyCraftException;
  readonly overrides: readonly Provider[];
  readonly trackers: readonly (() => unknown)[];
} {
  const overrides: Provider[] = [];
  const trackers: (() => unknown)[] = [];

  for (const provider of providers) {
    if (Array.isArray(provider)) {
      const result = eagerlyResolveBrandedProviders(
        provider,
        injector,
        branded || CRAFT_SERVICE_PROVIDER_BRAND in provider,
      );
      overrides.push(...result.overrides);
      trackers.push(...result.trackers);
      if (result.exception) {
        return { exception: result.exception, overrides, trackers };
      }
      continue;
    }

    if (!branded || typeof provider !== 'object' || provider === null) {
      continue;
    }

    const token = Reflect.get(provider, 'provide');
    const useFactory = Reflect.get(provider, 'useFactory');
    if (token !== undefined && branded && typeof useFactory === 'function') {
      // Resolve Craft providers through a computed so signals read by their
      // factories remain dependencies of the component render effect.
      const resolved = computed(() =>
        runInInjectionContext(injector, useFactory as () => unknown),
      );
      trackers.push(resolved);
      const value = resolved();
      if (isCraftException(value)) {
        return { exception: value, overrides, trackers };
      }
      overrides.push({ provide: token, useValue: value });
    }
  }

  return { overrides, trackers };
}

function findResourceException(
  value: unknown,
  seen = new Set<object>(),
): AnyCraftException | undefined {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  const candidate = value as {
    readonly exceptions?: () => { readonly list?: readonly unknown[] };
  };
  if (typeof candidate.exceptions === 'function') {
    const exceptions = candidate.exceptions();
    const exception = exceptions.list?.find(isCraftException);
    if (exception) return exception;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      const exception = findResourceException(child, seen);
      if (exception) return exception;
    }
    return undefined;
  }

  for (const child of Object.values(value)) {
    const exception = findResourceException(child, seen);
    if (exception) return exception;
  }
  return undefined;
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
    const css = styleValues(owner.styles);
    if (!css.length) return;
    const scope = scopeIdFor(owner.definition ?? {}, owner.name);
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

function contentScopeId(ownerScope: string, slotName: string): string {
  return `${ownerScope}::content::${slotName}`;
}

function acquireContentStyle(
  context: RenderContext,
  slotName: string | undefined,
  stylePolicy: ProjectionNode['stylePolicy'],
): { readonly scope?: string; readonly release: () => void } {
  if (
    stylePolicy !== 'allow-container-styles' ||
    !slotName ||
    !context.ownerScope ||
    !context.contentStyles?.[slotName] ||
    !context.styleRoot ||
    !context.styles
  ) {
    return { release: () => undefined };
  }

  const scope = contentScopeId(context.ownerScope, slotName);
  const css = scopeCss(scope, context.contentStyles[slotName], {
    rootAttribute: 'data-craft-content',
    limitSelector: '[data-craft-root]',
  });
  const release = context.styles.acquire(
    context.styleRoot,
    `craft:content:${scope}`,
    css,
    1000,
  );
  return { scope, release };
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
  const isGeneratorCallback = isGeneratorFunction(callback);
  if (isGeneratorCallback) templateGeneratorDepth++;
  try {
    return executeYieldable(callback, args, context.injector);
  } finally {
    if (isGeneratorCallback) templateGeneratorDepth--;
  }
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
  if (isYieldableValue(value)) {
    const projected = (...args: any[]) => {
      const result = Reflect.apply(
        value as unknown as (...args: any[]) => unknown,
        undefined,
        args,
      );
      if (templateGeneratorDepth === 0) return result;
      return toYieldable(() => result)();
    };

    const namedProjected = markYieldableValue(
      projected,
      value[YIELDABLE_VALUE] as string,
    );

    if (typeof value === 'function' && Object.keys(value).length > 0) {
      return new Proxy(namedProjected, {
        get(_target, property) {
          return projectYieldableTemplateContext(
            Reflect.get(value, property),
            seen,
          );
        },
      });
    }

    return namedProjected;
  }

  if (typeof value === 'function') {
    if (isYieldableMethod(value)) {
      return (...args: any[]) => {
        const result = Reflect.apply(value, undefined, args);
        if (templateGeneratorDepth === 0) return result;
        return toYieldable(() => result)();
      };
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

  // Craft nodes carry runtime objects such as RenderContext and Renderer2
  // through their declaration context. Copying them as plain objects would
  // strip prototype methods from those runtime services before projection.
  if (
    'kind' in value &&
    typeof (value as { readonly kind?: unknown }).kind === 'string'
  ) {
    return value;
  }

  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) {
      result.push(projectYieldableTemplateContext(item, seen));
    }
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

  return withCraftRenderContext(context, () =>
    template(context.componentContext),
  );
}

class CraftDirectiveRenderedNode implements RenderedNode {
  readonly kind = 'directive';
  private readonly view: FragmentRenderedNode;
  private readonly styleReleases: (() => void)[];
  private readonly registrationReleases: (() => void)[];

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
    this.registrationReleases = node.directives.map((directive) =>
      ɵregisterCraftTarget(
        context.injector,
        directive,
        context.componentContext,
        allocateCraftHostName(
          context.injector,
          'directive',
          directive[CRAFT_DIRECTIVE].name,
        ),
        false,
      ),
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
    this.registrationReleases.forEach((release) => release());
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
  private localName: string | undefined;

  constructor(
    private readonly node: Element,
    private tag: string,
    private context: RenderContext,
    initial: ElementNodeBase,
  ) {
    this.patchProperties(initial);
    this.children = patchRenderedChildren(
      this.node,
      this.children,
      initial.children,
      null,
      childContext(context, {
        rootScope: undefined,
        contentScope: undefined,
      }),
    );
  }

  firstNode(): NativeNode {
    return this.node;
  }

  lastNode(): NativeNode {
    return this.node;
  }

  patch(node: CraftNode): boolean {
    if (
      node.kind !== 'element' ||
      node.tag !== this.tag ||
      node.localName !== this.localName
    ) {
      return false;
    }

    this.patchProperties(node);
    this.children = patchRenderedChildren(
      this.node,
      this.children,
      node.children,
      null,
      childContext(this.context, {
        rootScope: undefined,
        contentScope: undefined,
      }),
    );
    return true;
  }

  private patchProperties(nextNode: ElementNodeBase): void {
    const next = nextNode.props;
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

    if (this.localName !== nextNode.localName) {
      if (nextNode.localName === undefined) {
        renderer.removeAttribute(this.node, 'data-craft-name');
      } else {
        renderer.setAttribute(this.node, 'data-craft-name', nextNode.localName);
      }
      this.localName = nextNode.localName;
    }

    const contentNames = directCraftContentNames(nextNode.children);
    if (contentNames.length > 0) {
      (
        this.node as Element & {
          [CRAFT_LOCATOR_CONTENT_NAMES]?: readonly string[];
        }
      )[CRAFT_LOCATOR_CONTENT_NAMES] = contentNames;
    } else {
      delete (
        this.node as Element & {
          [CRAFT_LOCATOR_CONTENT_NAMES]?: readonly string[];
        }
      )[CRAFT_LOCATOR_CONTENT_NAMES];
    }

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
    private context: RenderContext,
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

  updateContext(context: RenderContext): void {
    this.context = context;
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

class ProjectionRenderedNode implements RenderedNode {
  readonly kind = 'projection';
  private readonly view: FragmentRenderedNode;
  private readonly styleRelease: () => void;
  private node: ProjectionNode;
  private readonly declarationContext: RenderContext;
  private readonly projectionContext: RenderContext;

  constructor(
    node: ProjectionNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.declarationContext =
      (node.declarationContext as RenderContext | undefined) ??
      lexicalContext(context);
    const contentStyle = acquireContentStyle(
      context,
      node.slotName,
      node.stylePolicy,
    );
    this.styleRelease = contentStyle.release;
    this.projectionContext = childContext(this.declarationContext, {
      contentScope: contentStyle.scope,
    });
    this.view = createFragment(
      parent,
      before,
      this.projectionContext,
      this.children(),
      'craft-projection',
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'projection') {
      return false;
    }
    this.node = node;
    this.view.patchChildren(this.children());
    return true;
  }

  private children(): CraftNodeChildren {
    return runInInjectionContext(this.declarationContext.injector, () =>
      withCraftRenderContext(this.declarationContext, () =>
        this.node.render(),
      ),
    );
  }

  destroy(): void {
    this.view.destroy();
    this.styleRelease();
  }
}

class TemplateRenderedNode implements RenderedNode {
  readonly kind = 'template';
  private readonly view: FragmentRenderedNode;
  private node: TemplateNode;
  private readonly declarationContext: RenderContext;

  constructor(
    node: TemplateNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.declarationContext =
      (node.declarationContext as RenderContext | undefined) ??
      lexicalContext(context);
    this.view = createFragment(
      parent,
      before,
      this.declarationContext,
      this.children(),
      'craft-template',
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'template' || node.template !== this.node.template) {
      return false;
    }
    this.node = node;
    this.view.patchChildren(this.children());
    return true;
  }

  private children(): CraftNodeChildren {
    return runInInjectionContext(this.declarationContext.injector, () =>
      withCraftRenderContext(this.declarationContext, () =>
        this.node.template(this.node.context),
      ),
    );
  }

  destroy(): void {
    this.view.destroy();
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
    const items = (
      typeof this.node.source === 'function'
        ? this.node.source()
        : this.node.source
    ) as readonly unknown[];

    if (items.length === 0) {
      this.entries.forEach((entry) => entry.destroy());
      this.entries.clear();
      this.ordered = [];

      if (this.node.empty) {
        if (this.emptyView) {
          this.emptyView.patchChildren(
            renderChildrenCallback(this.context, this.node.empty),
          );
        } else {
          this.emptyView = createFragment(
            this.parent,
            this.end,
            this.context,
            renderChildrenCallback(this.context, this.node.empty),
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
        entry.patchChildren(
          renderChildrenCallback(this.context, this.node.itemTemplate, [
            item,
            index,
          ]),
        );
      } else {
        entry = createFragment(
          this.parent,
          this.end,
          this.context,
          renderChildrenCallback(this.context, this.node.itemTemplate, [
            item,
            index,
          ]),
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

class IfBlockRenderedNode implements RenderedNode {
  readonly kind = 'if';
  private readonly view: FragmentRenderedNode;
  private active: boolean;

  constructor(
    private node: IfBlockNode,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.active = this.isTrue();
    this.view = createFragment(
      parent,
      before,
      context,
      this.children(),
      `craft-if:${node.conditionName}`,
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'if' || node.conditionName !== this.node.conditionName) {
      return false;
    }
    this.node = node;
    const nextActive = this.isTrue();
    if (nextActive !== this.active) {
      this.active = nextActive;
      this.view.patchChildren(this.children());
    } else {
      this.view.patchChildren(this.children());
    }
    return true;
  }

  private isTrue(): boolean {
    return Boolean(resolveTemplateValue(this.node.condition, this.context));
  }

  private children(): CraftNodeChildren {
    return this.active
      ? renderChildrenCallback(this.context, this.node.whenTrue)
      : this.node.whenFalse
        ? renderChildrenCallback(this.context, this.node.whenFalse)
        : [];
  }

  destroy(): void {
    this.view.destroy();
  }
}

class MatchBlockRenderedNode implements RenderedNode {
  readonly kind = 'match-block';
  private readonly view: FragmentRenderedNode;
  private handledExceptionCode: string | undefined;

  constructor(
    private node: MatchBlockNode,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.view = createFragment(
      parent,
      before,
      context,
      this.children(),
      'craft-match-block',
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'match-block' || node.key !== this.node.key) {
      return false;
    }
    this.node = node;
    this.view.patchChildren(this.children());
    return true;
  }

  private children(): CraftNodeChildren {
    if (this.handledExceptionCode) {
      this.context.handledResourceExceptionCodes?.delete(
        this.handledExceptionCode,
      );
      this.handledExceptionCode = undefined;
    }
    const exception = this.node.source();
    if (!exception) return [];
    const code = (exception as Record<PropertyKey, unknown>)[this.node.key];
    // Resource exception buckets use an empty object when no exception is
    // present. Do not turn that implementation detail into an exception with
    // an `undefined` discriminator during a later component rerender.
    if (code === undefined || code === null) return [];
    const handler = this.node.handlers[String(code)];
    if (!handler) {
      throw new CraftUnhandledExceptionError(exception as AnyCraftException);
    }
    this.handledExceptionCode = String(code);
    this.context.handledResourceExceptionCodes?.add(this.handledExceptionCode);
    return handler(exception as AnyCraftException);
  }

  destroy(): void {
    this.view.destroy();
  }
}

class CatchBlockRenderedNode implements RenderedNode {
  readonly kind = 'catch-block';
  private readonly view: FragmentRenderedNode;
  private handling = false;
  private fallbackVisible = false;
  private sourceVisible = true;
  private fallbackPosition: CatchBlockPosition;
  private fallbackChildren: CraftNodeChildren = [];

  constructor(
    private node: CatchBlockNode,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.fallbackPosition = node.position;
    this.view = createFragment(
      parent,
      before,
      this.boundaryContext(),
      [],
      'craft-catch-block',
    );
    try {
      this.view.patchChildren(this.layout(this.node.source));
    } catch (error) {
      if (!isCraftGenShortCircuit(error)) throw error;
      this.handle(error.exception);
    }
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'catch-block' || node.position !== this.node.position) {
      return false;
    }
    this.node = node;
    try {
      this.view.patchChildren(this.layout(node.source));
    } catch (error) {
      if (!isCraftGenShortCircuit(error)) throw error;
      this.handle(error.exception);
    }
    return true;
  }

  private boundaryContext(): RenderContext {
    return childContext(this.context, {
      exceptionBoundary: (exception) => this.handle(exception),
      exceptionBoundaryResolved: () => this.resolved(),
    });
  }

  private layout(source: CraftNode): CraftNodeChildren {
    if (!this.fallbackVisible) return [source];
    if (!this.sourceVisible) return this.fallback();
    return this.fallbackPosition === 'before'
      ? [this.fallback(), source]
      : [source, this.fallback()];
  }

  private fallback(): CraftNodeChildren {
    return this.fallbackChildren;
  }

  private handle(exception: AnyCraftException): boolean {
    if (this.handling) {
      return (
        this.context.exceptionBoundary?.(exception) ?? this.unhandled(exception)
      );
    }

    const handler = this.node.handlers[exception.code];
    if (!handler) {
      return (
        this.context.exceptionBoundary?.(exception) ?? this.unhandled(exception)
      );
    }

    this.handling = true;
    this.fallbackVisible = true;
    try {
      const resolved = resolveCatchBlockHandler(
        handler,
        exception,
        true,
        this.node.position,
      );
      this.sourceVisible = resolved.showSource;
      this.fallbackPosition = resolved.position;
      this.fallbackChildren = resolved.children;
      try {
        this.view.patchChildren(this.layout(this.node.source));
      } catch (error) {
        if (!isCraftGenShortCircuit(error)) throw error;
        this.view.patchChildren(this.fallbackChildren);
      }
    } finally {
      this.handling = false;
    }
    return true;
  }

  private resolved(): void {
    if (this.handling || !this.fallbackVisible) return;
    this.fallbackVisible = false;
    this.sourceVisible = true;
    this.fallbackPosition = this.node.position;
    this.fallbackChildren = [];
    this.view.patchChildren([this.node.source]);
  }

  private unhandled(exception: AnyCraftException): never {
    throw new CraftUnhandledExceptionError(exception);
  }

  destroy(): void {
    this.view.destroy();
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

function componentHostName(injector: Injector, name: string): string {
  const tags = injector.get(HOST_TAG_LIST, []);
  const current = tags[tags.length - 1];
  if (current?.startsWith('component:')) {
    return current;
  }
  return allocateCraftHostName(injector, 'component', name);
}

function allocateCraftHostName(
  injector: Injector,
  kind: 'component' | 'directive',
  name: string,
): string {
  const register =
    injector.get(ComponentRegister, null) ?? ɵfallbackComponentRegister;
  return `${kind}:${name}#${register.next()}`;
}

class ComponentRenderedNode implements RenderedNode {
  readonly kind = 'component';
  private environmentInjector: EnvironmentInjector | undefined;
  private readonly propKeys: string[];
  private readonly propSources: ReturnType<typeof signal<unknown>>[];
  private readonly hostPropsSource;
  private readonly view: FragmentRenderedNode;
  private readonly effectRef: EffectRef;
  private composedTemplateEffect: EffectRef | undefined;
  private componentExceptionEffect: EffectRef | undefined;
  private componentFallbackVisible = false;
  private componentFallbackException: AnyCraftException | undefined;
  private readonly styleReleases: (() => void)[];
  private providerTrackers: readonly (() => unknown)[] = [];
  private readonly templateOnly: boolean;
  private factoryContext: unknown;
  private latestTemplate: CraftNodeChildren = [];
  private registrationReleases: (() => void)[] = [];

  constructor(
    private component: CraftComponent<object>,
    props: object,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
    hostTarget?: Element,
    templateContext?: { readonly value: unknown },
    additionalProviders: readonly CraftServiceProvider[] = [],
    declarationContext?: RenderContext,
  ) {
    this.templateOnly = templateContext !== undefined;
    const definition = component[CRAFT_COMPONENT];
    const composition = definition.composition;
    const ownScope = scopeIdFor(definition.scopeDefinition, definition.name);
    this.styleReleases = acquireStyles(
      context,
      definition.styleOwners,
      ownScope,
    );
    const componentRenderContext = childContext(context, {
      ownerScope: ownScope,
      rootScope: scopeTokens(context.rootScope, ownScope),
      contentStyles: definition.meta.contentStyles,
      contentScope: undefined,
      declarationContext: declarationContext ?? context,
    });
    const componentElement =
      hostTarget ?? (parent instanceof Element ? parent : parent.parentElement);
    // Angular's runtime accepts any Injector as the R3Injector parent even
    // though the public helper narrows the type to EnvironmentInjector. Keep
    // the immediate parent here: unwrapping it through
    // `get(EnvironmentInjector)` would skip route-scoped providers such as
    // ActivatedRoute and ChildrenOutletContexts.
    const parentInjector = context.injector as EnvironmentInjector;
    if (!composition) {
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
    }
    this.propKeys = this.templateOnly
      ? []
      : Object.keys(props).filter((key) => !isHostProperty(key));
    this.propSources = this.propKeys.map((key) =>
      signal((props as Record<string, unknown>)[key]),
    );
    this.hostPropsSource = signal(
      hostPropsFromComponentProps(props as Readonly<Record<string, unknown>>),
    );

    const inputShells = this.propSources.map((source) => {
      const input = (...callbackArgs: unknown[]) => {
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

      // Content inputs are object-shaped at the call site but component
      // factories receive callable input shells. Expose object properties on
      // the shell so the factory can use `content.header` without eagerly
      // evaluating a slot.
      return new Proxy(input, {
        get(target, property, receiver) {
          const current = source();
          if (
            typeof current === 'object' &&
            current !== null &&
            property in current
          ) {
            return Reflect.get(current, property);
          }
          return Reflect.get(target, property, receiver);
        },
        has(target, property) {
          const current = source();
          return (
            (typeof current === 'object' &&
              current !== null &&
              property in current) ||
            property in target
          );
        },
        ownKeys(target) {
          const current = source();
          return [
            ...new Set([
              ...Reflect.ownKeys(target),
              ...(typeof current === 'object' && current !== null
                ? Reflect.ownKeys(current)
                : []),
            ]),
          ];
        },
        getOwnPropertyDescriptor(target, property) {
          const current = source();
          if (
            typeof current === 'object' &&
            current !== null &&
            property in current
          ) {
            return {
              configurable: true,
              enumerable: true,
              value: Reflect.get(current, property),
            };
          }
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      });
    });

    // A one-argument logic factory may model its complete input as one typed
    // object. The callable shell keeps the historical Input<T> invocation
    // while exposing the object's properties for the contract-based API.
    const args =
      !this.templateOnly && definition.factory.length === 1
        ? [
            new Proxy(
              ((...callbackArgs: unknown[]) =>
                (inputShells[0] as (...args: unknown[]) => unknown)(
                  ...callbackArgs,
                )) as (...args: unknown[]) => unknown,
              {
                get: (target, property, receiver) => {
                  const index = this.propKeys.indexOf(String(property));
                  if (index !== -1) {
                    return preserveContentDeclarationContext(
                      this.propSources[index](),
                      declarationContext ?? context,
                    );
                  }
                  return Reflect.get(target, property, receiver);
                },
                has: (target, property) =>
                  this.propKeys.includes(String(property)) ||
                  Reflect.has(target, property),
                ownKeys: (target) => [
                  ...new Set([
                    ...Reflect.ownKeys(target),
                    ...this.propKeys,
                  ]),
                ],
                getOwnPropertyDescriptor: (target, property) => {
                  const index = this.propKeys.indexOf(String(property));
                  return index === -1
                    ? Reflect.getOwnPropertyDescriptor(target, property)
                    : {
                        configurable: true,
                        enumerable: true,
                        value: preserveContentDeclarationContext(
                          this.propSources[index](),
                          declarationContext ?? context,
                        ),
                      };
                },
              },
            ),
          ]
        : inputShells;

    const factoryContext = composition
      ? undefined
      : this.templateOnly
        ? templateContext?.value
        : untracked(() =>
            executeCraftComponentFactory(
              definition.factory,
              args,
              this.environmentInjector!,
            ),
          );
    if (
      !composition &&
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
    if (!composition) {
      this.registerRuntimeTargets(
        definition,
        factoryContext,
        this.environmentInjector!,
      );
    }

    this.view = createFragment(
      parent,
      before,
      childContext(componentRenderContext, {
        injector: composition ? parentInjector : this.environmentInjector,
        componentContext: factoryContext,
      }),
      composition ? [] : [],
      'craft-component',
    );

    this.effectRef = untracked(() =>
      runInInjectionContext(
        composition ? parentInjector : this.environmentInjector!,
        () =>
          craftEffect(
            'component-render',
            composition
              ? (onCleanup: (cleanup: () => void) => void) => {
                  // Composition providers and public inputs are the only
                  // dependencies that should recreate the component scope.
                  // Template signals (for example a query status) are tracked
                  // by the dedicated template effect created by
                  // refreshComposedComponent().
                  this.propSources.forEach((source) => source());
                  this.hostPropsSource();
                  untracked(() =>
                    this.refreshComposedComponent(
                      definition,
                      args,
                      componentElement,
                      parentInjector,
                      additionalProviders,
                      hostTarget,
                      context,
                      componentRenderContext,
                      onCleanup,
                    ),
                  );
                  this.providerTrackers.forEach((tracker) => tracker());
                }
              : () => {
                  try {
                    const hostProps = mergeHostProps(
                      definition.meta.host ?? {},
                      this.hostPropsSource(),
                    );
                    this.latestTemplate = withCraftRenderContext(
                      childContext(componentRenderContext, {
                        injector: this.environmentInjector!,
                        componentContext: this.factoryContext,
                      }),
                      () =>
                        definition.template(
                          projectYieldableTemplateContext(
                            this.factoryContext,
                          ) as never,
                          hostProps,
                        ),
                    );
                    this.view.patchChildren(this.latestTemplate);
                    if (hostTarget) {
                      applyHostProperties(
                        context.renderer,
                        hostTarget,
                        hostProps,
                        context,
                      );
                    }
                    context.exceptionBoundaryResolved?.();
                  } catch (error) {
                    if (
                      isCraftGenShortCircuit(error) &&
                      context.exceptionBoundary?.(error.exception)
                    ) {
                      return;
                    }
                    if (isCraftGenShortCircuit(error)) {
                      throw new CraftUnhandledExceptionError(error.exception);
                    }
                    throw error;
                  }
                },
          ),
      ),
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  private refreshComposedComponent(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    args: readonly ((...callbackArgs: unknown[]) => unknown)[],
    componentElement: Element | null,
    parentInjector: EnvironmentInjector,
    additionalProviders: readonly CraftServiceProvider[],
    hostTarget: Element | undefined,
    context: RenderContext,
    componentRenderContext: RenderContext,
    onCleanup: (cleanup: () => void) => void,
  ): void {
    const composition = definition.composition;
    if (!composition) {
      return;
    }

    this.view.patchChildren([]);
    this.environmentInjector = createEnvironmentInjector(
      [
        ...(definition.meta.providers ?? []),
        ...(composition.providers ?? []),
        {
          provide: ElementRef,
          useValue: new ElementRef(componentElement),
        },
        ...additionalProviders,
      ],
      parentInjector,
      'CraftComponent',
    );

    const environmentInjector = this.environmentInjector;
    let renderInjector = environmentInjector;
    onCleanup(() => {
      this.registrationReleases.forEach((release) => release());
      this.registrationReleases = [];
      this.composedTemplateEffect?.destroy();
      this.composedTemplateEffect = undefined;
      this.componentExceptionEffect?.destroy();
      this.componentExceptionEffect = undefined;
      this.componentFallbackVisible = false;
      this.componentFallbackException = undefined;
      this.view.patchChildren([]);
      renderInjector.destroy();
      if (renderInjector !== environmentInjector) {
        environmentInjector.destroy();
      }
      this.providerTrackers = [];
      if (this.environmentInjector === renderInjector) {
        this.environmentInjector = undefined;
        this.factoryContext = undefined;
      }
    });

    let factoryContext: unknown;
    let renderContext: RenderContext;
    const handledResourceExceptionCodes = new Set<string>();
    const componentBoundary = composition.catchBlockPosition
      ? (exception: AnyCraftException): boolean => {
          if (!composition.catchHandlers?.[exception.code]) {
            return context.exceptionBoundary?.(exception) ?? false;
          }
          this.renderComposedException(
            definition,
            exception,
            renderInjector,
            renderContext,
            context,
            hostTarget,
          );
          return true;
        }
      : undefined;
    renderContext = childContext(componentRenderContext, {
      injector: environmentInjector,
      handledResourceExceptionCodes,
      ...(componentBoundary
        ? {
            exceptionBoundary: componentBoundary,
          }
        : {}),
    });
    try {
      const providerResolution = eagerlyResolveBrandedProviders(
        composition.providers ?? [],
        environmentInjector,
      );
      this.providerTrackers = providerResolution.trackers;
      if (providerResolution.exception) {
        renderContext = childContext(componentRenderContext, {
          injector: environmentInjector,
        });
        this.view.updateContext(renderContext);
        this.renderComposedException(
          definition,
          providerResolution.exception,
          environmentInjector,
          renderContext,
          context,
          hostTarget,
        );
        return;
      }
      if (providerResolution.overrides.length > 0) {
        renderInjector = createEnvironmentInjector(
          [...providerResolution.overrides],
          environmentInjector,
          'CraftComponentProviders',
        );
        this.environmentInjector = renderInjector;
      }
      renderContext = childContext(componentRenderContext, {
        injector: renderInjector,
        handledResourceExceptionCodes,
      });
      this.view.updateContext(renderContext);
      factoryContext = untracked(() =>
        executeCraftComponentFactory(
          definition.factory,
          args as ((...callbackArgs: unknown[]) => unknown)[],
          renderInjector,
        ),
      );
      if (
        typeof factoryContext === 'object' &&
        factoryContext !== null &&
        'then' in factoryContext
      ) {
        throw new Error(
          'Async component factories are not renderable directly. Move asynchronous work behind defer().',
        );
      }
      this.registerRuntimeTargets(definition, factoryContext, renderInjector);
    } catch (error) {
      if (!isCraftGenShortCircuit(error)) {
        throw error;
      }

      if (this.context.exceptionBoundary?.(error.exception)) {
        return;
      }

      this.renderComposedException(
        definition,
        error.exception,
        renderInjector,
        renderContext,
        context,
        hostTarget,
      );
      return;
    }

    if (isCraftException(factoryContext)) {
      this.renderComposedException(
        definition,
        factoryContext,
        renderInjector,
        renderContext,
        context,
        hostTarget,
      );
      return;
    }

    this.composedTemplateEffect = untracked(() =>
      runInInjectionContext(renderInjector, () =>
        craftEffect('component-template', () => {
          this.renderComposedTemplate(
            definition,
            factoryContext,
            renderInjector,
            renderContext,
            context,
            hostTarget,
          );
        }),
      ),
    );

    if (composition.catchBlockPosition) {
      const trackedFactoryContext = factoryContext;
      this.componentExceptionEffect = untracked(() =>
        runInInjectionContext(renderInjector, () =>
          craftEffect(
            'component-catch-block-resource-exceptions',
            () => {
              const exception = findResourceException(trackedFactoryContext);
              if (exception) {
                if (
                  renderContext.handledResourceExceptionCodes?.has(
                    exception.code,
                  )
                ) {
                  if (this.componentFallbackVisible) {
                    this.componentFallbackVisible = false;
                    this.componentFallbackException = undefined;
                    untracked(() =>
                      this.renderComposedTemplate(
                        definition,
                        trackedFactoryContext,
                        renderInjector,
                        renderContext,
                        context,
                        hostTarget,
                      ),
                    );
                  }
                  return;
                }
                if (
                  this.componentFallbackVisible &&
                  this.componentFallbackException === exception
                ) {
                  return;
                }
                this.componentFallbackVisible = true;
                this.componentFallbackException = exception;
                untracked(() =>
                  this.renderComposedException(
                    definition,
                    exception,
                    renderInjector,
                    renderContext,
                    context,
                    hostTarget,
                    true,
                  ),
                );
              } else if (this.componentFallbackVisible) {
                this.componentFallbackVisible = false;
                this.componentFallbackException = undefined;
                untracked(() =>
                  this.renderComposedTemplate(
                    definition,
                    trackedFactoryContext,
                    renderInjector,
                    renderContext,
                    context,
                    hostTarget,
                  ),
                );
              }
            },
            { manualCleanup: true },
          ),
        ),
      );
    }
  }

  private registerRuntimeTargets(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    factoryContext: unknown,
    injector: EnvironmentInjector,
  ): void {
    this.registrationReleases.forEach((release) => release());
    this.registrationReleases = [
      ɵregisterCraftTarget(
        injector,
        this.component,
        factoryContext,
        componentHostName(injector, definition.name),
      ),
      ...definition.styleOwners.flatMap((owner) =>
        owner.registrationTarget === undefined
          ? []
          : [
              ɵregisterCraftTarget(
                injector,
                owner.registrationTarget,
                factoryContext,
                allocateCraftHostName(injector, 'directive', owner.name),
              ),
            ],
      ),
    ];
  }

  private renderComposedTemplate(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    factoryContext: unknown,
    renderInjector: EnvironmentInjector,
    renderContext: RenderContext,
    context: RenderContext,
    hostTarget: Element | undefined,
  ): void {
    if (this.componentFallbackVisible) return;
    try {
      const rendered = this.composedTemplateChildren(
        definition,
        factoryContext,
        renderContext,
      );
      this.latestTemplate = rendered.children;
      this.view.patchChildren(rendered.children);
      if (hostTarget) {
        applyHostProperties(
          context.renderer,
          hostTarget,
          rendered.hostProps,
          context,
        );
      }
    } catch (error) {
      if (!isCraftGenShortCircuit(error)) throw error;
      if (renderContext.exceptionBoundary?.(error.exception)) return;
      this.renderComposedException(
        definition,
        error.exception,
        renderInjector,
        renderContext,
        context,
        hostTarget,
      );
      return;
    }
    renderContext.exceptionBoundaryResolved?.();
  }

  private composedTemplateChildren(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    factoryContext: unknown,
    renderContext: RenderContext,
  ): { readonly children: CraftNodeChildren; readonly hostProps: HostProps } {
    this.factoryContext = factoryContext;
    this.view.updateContext(
      childContext(renderContext, { componentContext: factoryContext }),
    );
    const hostProps = mergeHostProps(
      definition.meta.host ?? {},
      this.hostPropsSource(),
    );
    return {
      children: withCraftRenderContext(renderContext, () =>
        definition.template(
          projectYieldableTemplateContext(factoryContext) as never,
          hostProps,
        ),
      ),
      hostProps,
    };
  }

  private renderComposedException(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    exception: AnyCraftException,
    environmentInjector: EnvironmentInjector,
    renderContext: RenderContext,
    context: RenderContext,
    hostTarget: Element | undefined,
    preserveFactoryContext = false,
  ): void {
    const blockHandler =
      definition.composition?.catchHandlers?.[exception.code];
    const tagHandler =
      definition.composition?.catchTagHandlers?.[exception.code];
    if (!blockHandler && !tagHandler) {
      if (this.context.exceptionBoundary?.(exception)) {
        return;
      }
      throw new CraftUnhandledExceptionError(exception);
    }

    if (!preserveFactoryContext) {
      this.factoryContext = undefined;
    }
    this.view.updateContext(renderContext);
    const hostProps = mergeHostProps(
      definition.meta.host ?? {},
      this.hostPropsSource(),
    );
    if (tagHandler) {
      try {
        executeCraftComponentFactory(
          function* () {
            return yield* tagHandler(exception);
          },
          [],
          environmentInjector,
        );
      } catch (error) {
        if (!isCraftGenShortCircuit(error)) throw error;
        if (context.exceptionBoundary?.(error.exception)) return;
        throw new CraftUnhandledExceptionError(error.exception);
      }
      this.view.patchChildren([]);
    } else {
      const resolved = runInInjectionContext(environmentInjector, () =>
        resolveCatchBlockHandler(
          blockHandler!,
          exception,
          false,
          definition.composition?.catchBlockPosition ?? 'after',
        ),
      );
      if (preserveFactoryContext && resolved.showSource) {
        try {
          const source = untracked(() =>
            this.composedTemplateChildren(
              definition,
              this.factoryContext,
              renderContext,
            ),
          );
          const children =
            resolved.position === 'before'
              ? [resolved.children, source.children]
              : [source.children, resolved.children];
          this.view.patchChildren(children);
          if (hostTarget) {
            applyHostProperties(
              context.renderer,
              hostTarget,
              source.hostProps,
              context,
            );
          }
        } catch (error) {
          if (!isCraftGenShortCircuit(error)) throw error;
          this.view.patchChildren(resolved.children);
        }
      } else {
        this.view.patchChildren(resolved.children);
      }
    }
    if (hostTarget) {
      applyHostProperties(context.renderer, hostTarget, hostProps, context);
    }
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
    } as unknown as CraftNode);
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
      (this.latestTemplate = definition.template(
        projectYieldableTemplateContext(context) as never,
        hostProps,
      )),
    );
  }

  locator(
    host: Element,
    tag: string,
    criteria: RuntimeLocatorCriteria,
  ): Element | undefined {
    return findCraftTemplateLocator(host, this.latestTemplate, tag, criteria);
  }

  destroy(): void {
    this.effectRef.destroy();
    this.view.destroy();
    this.styleReleases.forEach((release) => release());
    this.environmentInjector?.destroy();
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
      node.placeholder ? renderChildrenCallback(context, node.placeholder) : [],
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
      this.view.patchChildren(
        renderChildrenCallback(this.context, this.node.resolve, [
          this.loadedValue,
        ]),
      );
    } else if (this.state === 'error') {
      this.view.patchChildren(
        this.node.error
          ? renderChildrenCallback(this.context, this.node.error, [
              this.loadError,
            ])
          : [],
      );
    } else if (this.state === 'loading') {
      this.view.patchChildren(
        this.node.loading
          ? renderChildrenCallback(this.context, this.node.loading)
          : this.node.placeholder
            ? renderChildrenCallback(this.context, this.node.placeholder)
            : [],
      );
    } else {
      this.view.patchChildren(
        this.node.placeholder
          ? renderChildrenCallback(this.context, this.node.placeholder)
          : [],
      );
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
      this.node.loading
        ? renderChildrenCallback(this.context, this.node.loading)
        : this.node.placeholder
          ? renderChildrenCallback(this.context, this.node.placeholder)
          : [],
    );

    const loader = this.node.loader;
    executeCraftComponentFactoryAsync(
      function* () {
        return yield* craftLazy(loader);
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
          this.view.patchChildren(
            this.node.error
              ? renderChildrenCallback(this.context, this.node.error, [
                  settled.exception,
                ])
              : [],
          );
          return;
        }

        this.state = 'loaded';
        this.loadedValue = settled.value;
        this.view.patchChildren(
          renderChildrenCallback(this.context, this.node.resolve, [
            settled.value,
          ]),
        );
      })
      .catch((error: unknown) => {
        if (!this.destroyed) {
          this.state = 'error';
          this.loadError = error;
          this.view.patchChildren(
            this.node.error
              ? renderChildrenCallback(this.context, this.node.error, [error])
              : [],
          );
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
      if (context.contentScope) {
        context.renderer.setAttribute(
          element,
          'data-craft-content',
          context.contentScope,
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
        undefined,
        undefined,
        [],
        node.declarationContext as RenderContext | undefined,
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
    case 'if': {
      return new IfBlockRenderedNode(node, parent, before, context);
    }
    case 'catch-block': {
      return new CatchBlockRenderedNode(node, parent, before, context);
    }
    case 'match-block': {
      return new MatchBlockRenderedNode(node, parent, before, context);
    }
    case 'defer':
      return new DeferRenderedNode(node, parent, before, context);
    case 'projection':
      return new ProjectionRenderedNode(node, parent, before, context);
    case 'template':
      return new TemplateRenderedNode(node, parent, before, context);
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
  locator(tag: string, criteria: RuntimeLocatorCriteria): Element | undefined;
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
  let instance: ComponentRenderedNode;
  try {
    instance = new ComponentRenderedNode(
      component as unknown as CraftComponent<object>,
      props,
      host,
      null,
      { renderer, injector, styleRoot, styles },
      host,
    );
  } catch (error) {
    if (isCraftGenShortCircuit(error)) {
      throw new CraftUnhandledExceptionError(error.exception);
    }
    throw error;
  }

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
  let instance: ComponentRenderedNode;
  try {
    instance = new ComponentRenderedNode(
      component as CraftComponent<object>,
      {},
      host,
      null,
      { renderer, injector, styleRoot, styles },
      host,
      { value: context },
      additionalProviders,
    );
  } catch (error) {
    if (isCraftGenShortCircuit(error)) {
      throw new CraftUnhandledExceptionError(error.exception);
    }
    throw error;
  }

  return {
    updateContext(nextContext) {
      instance.updateContext(nextContext);
    },
    locator(tag, criteria) {
      return instance.locator(host, tag, criteria);
    },
    destroy() {
      instance.destroy();
    },
  };
}
