import {
  CRAFT_SERVICE_PROVIDER_BRAND,
  CRAFT_DOM_EVENT_HOOK,
  CRAFT_NODE_DIRECTIVE,
  CRAFT_NODE_EFFECT_FACTORY,
  CRAFT_FIELD_EXCEPTION_BOUNDARY,
  CRAFT_FIELD_EXCEPTION_SOURCE,
  CRAFT_TEMPORAL_RUNTIME,
  COMPONENT_REGISTER,
  ComponentRegister,
  craftEffect,
  craftLazy,
  createBrowserDomAdapter,
  registerCraftSyncTemplateFlush,
  executeYieldable,
  HOST_TAG_LIST,
  executeTemplateTrace,
  isCraftException,
  isCraftGenShortCircuit,
  isCraftNotSettled,
  ɵwithSettledReadObserver,
  type CraftSettledReadNotice,
  type CraftSettledReadObserver,
  isGeneratorFunction,
  isCraftField,
  isGenerator,
  markYieldableValue,
  markYieldableMethod,
  isYieldableValue,
  isYieldableMethod,
  isYieldableReactiveValue,
  provideHostName,
  rawReactiveFacade,
  rawReactiveValue,
  toYieldable,
  yieldableInvocation,
  ɵfallbackComponentRegister,
  ɵregisterCraftTarget,
  type CraftServiceProvider,
  type CraftDomAdapter,
  type CraftDomEvent,
  type CraftDomEventHook,
  type CraftNodeDirectiveContext,
  type AnyCraftException,
  type CraftFieldExceptionSource,
  type FieldExceptionBoundaryRegistration,
  fieldExceptionVisibilityMatches,
  YIELDABLE_VALUE,
  type TemporalTaskHandle,
  type TemplateTraceContext,
  RealCraftTemporalRuntime,
} from '@craft-ng/core';
import { executeCraftComponentFactory } from '../factory-runtime';
import {
  AngularMount,
  CraftAngularDirectiveHost,
  ɵangularComputed as computed,
  ɵcreateAngularEnvironmentInjector as createEnvironmentInjector,
  ɵAngularElementRef as ElementRef,
  ɵAngularEnvironmentInjector as EnvironmentInjector,
  ɵAngularInjector as Injector,
  ɵreflectAngularComponentType as reflectComponentType,
  ɵrunInAngularInjectionContext as runInInjectionContext,
  ɵangularSignal as signal,
  ɵangularUntracked as untracked,
  type ɵAngularEffectRef as EffectRef,
  type ɵAngularProvider as Provider,
  type ɵAngularProviderToken as ProviderToken,
  type AngularMountContext,
} from '@craft-ng/angular';
import type { HostProps } from '../hyperscript';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  CONTENT_DECLARATION_CONTEXT,
  type CraftComponent,
} from '../types';
import { cssVarStyles, type CssVarDisposition } from '../css-vars';
import {
  normalizeChildren,
  mergeHostProps,
  type AngularComponentNode,
  type AngularDirectiveNode,
  type AppliedCraftNodeDirective,
  type CraftDirectiveNode,
  type CraftNode,
  type CraftNodeChildren,
  type CraftTextBinding,
  type DeferNode,
  type EachNode,
  type IfBlockNode,
  type HeadingNode,
  type HeadingSectionNode,
  type ElementNodeBase,
  type CatchBlockNode,
  type MatchBlockNode,
  type ProjectionNode,
  type TemplateNode,
  type FieldExceptionBlockNode,
  type PendingBlockNode,
  withCraftRenderContext,
  CRAFT_NODE_DIRECTIVES,
} from './vnode';
import {
  CraftUnhandledPendingError,
  resolvePendingBlockHandler,
  type PendingBlockHandler,
  type PendingBlockPosition,
} from '../pending-block';
import {
  CraftUnhandledExceptionError,
  resolveCatchBlockHandler,
  type CatchBlockPosition,
} from '../block';
import type {
  FieldExceptionHandler,
  FieldExceptionHandlers,
} from '../field-exception-block';
import { executeCraftComponentFactoryAsync } from '../factory-runtime';
import {
  CRAFT_STYLE_REGISTRY,
  CraftStyleRegistry,
  ɵfallbackCraftStyleRegistry,
} from './style-registry';
import { scopeCss, scopeIdFor, validateStyleScope } from './style-scope';
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
  readonly renderer: CraftDomAdapter;
  readonly injector: Injector;
  readonly componentContext?: unknown;
  readonly componentName?: string;
  readonly ownerScope?: string;
  readonly rootScope?: string;
  readonly styleRoot?: Document | ShadowRoot;
  readonly styles?: CraftStyleRegistry;
  /** Styles exposed by the currently rendered Craft component, by slot. */
  readonly contentStyles?: Readonly<Partial<Record<string, string>>>;
  /** Marker applied to ordinary nodes in an opted-in projection. */
  readonly contentScope?: string;
  /**
   * Reports an exception to the nearest `catchBlock`. `token` identifies the
   * reporter: the boundary keeps its fallback up until every reporter has
   * either recovered or been destroyed, so a re-render between the failure and
   * the recovery cannot strand it.
   */
  readonly exceptionBoundary?: (
    exception: AnyCraftException,
    token?: object,
  ) => boolean;
  readonly exceptionBoundaryResolved?: (token?: object) => void;
  /** Nearest `pendingBlock` boundary, notified by any binding that suspends. */
  readonly pendingBoundary?: PendingBoundaryRegistration;
  /** Nearest `pendingBlock` boundary, notified by every settled read below it. */
  readonly settledReadObserver?: CraftSettledReadObserver;
  readonly handledResourceExceptionCodes?: Set<string>;
  readonly fieldExceptionBoundary?: FieldExceptionBoundaryRegistration;
  /** Lexical context of content declared by the parent component. */
  readonly declarationContext?: RenderContext;
  /** Current heading outline level (1–6). `heading()` reads this; `headingSection` increments it. */
  readonly headingLevel?: number;
  /** Directives composed around the current component. */
  readonly directiveNames?: readonly string[];
  /** Mutable render number shared by one component and its nested views. */
  readonly traceState?: TemplateTraceState;
}

interface TemplateTraceState {
  renderCount: number;
}

/**
 * How a suspended binding talks to its boundary. Every reactive binding owns a
 * token: it suspends with it when its settled read throws, and releases it as
 * soon as the same binding runs to completion (or is destroyed). The boundary
 * shows its fallback while at least one token is held.
 */
interface PendingBoundaryRegistration {
  suspend(token: object, source: string): void;
  resume(token: object): void;
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
  kind: TemplateTraceContext['kind'] = 'callback',
  name?: string,
): CraftNodeChildren {
  const phase = tracePhase(context);
  return executeTemplateTrace(
    context.injector,
    traceContext(context, kind, phase, name ?? callback.name),
    () => invokeChildrenCallback(context, callback, args),
  );
}

function invokeChildrenCallback(
  context: RenderContext,
  callback: (...args: any[]) => CraftNodeChildren,
  args: readonly unknown[],
): CraftNodeChildren {
  return runInInjectionContext(context.injector, () =>
    withCraftRenderContext(context, () => callback(...args)),
  );
}

function renderBlockChildren(
  context: RenderContext,
  name: string | undefined,
  callback: (...args: any[]) => CraftNodeChildren,
  args: readonly unknown[] = [],
): CraftNodeChildren {
  return executeTemplateTrace(
    context.injector,
    traceContext(context, 'block', tracePhase(context), name),
    () => invokeChildrenCallback(context, callback, args),
  );
}

function renderDeferChildren(
  context: RenderContext,
  name: string | undefined,
  callback: (...args: any[]) => CraftNodeChildren,
  args: readonly unknown[] = [],
): CraftNodeChildren {
  return executeTemplateTrace(
    context.injector,
    traceContext(context, 'defer', tracePhase(context), name),
    () => invokeChildrenCallback(context, callback, args),
  );
}

function tracePhase(context: RenderContext): 'initialRender' | 'update' {
  return (context.traceState?.renderCount ?? 0) <= 1
    ? 'initialRender'
    : 'update';
}

function traceContext(
  context: RenderContext,
  kind: TemplateTraceContext['kind'],
  phase: TemplateTraceContext['phase'],
  name?: string,
): TemplateTraceContext {
  return {
    kind,
    phase,
    ...(context.componentName ? { componentName: context.componentName } : {}),
    ...(name ? { name } : {}),
    ...(context.directiveNames && context.directiveNames.length > 0
      ? { directiveNames: context.directiveNames }
      : {}),
    renderCount: context.traceState?.renderCount ?? 0,
  };
}

function traceComponentLifecycle(
  injector: Injector,
  phase: 'create' | 'destroy',
  componentName: string,
  renderCount: number,
): void {
  executeTemplateTrace(
    injector,
    {
      kind: 'component',
      phase,
      componentName,
      renderCount,
    },
    () => [],
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
    const exceptions = (
      isYieldableReactiveValue(candidate.exceptions)
        ? rawReactiveValue(candidate.exceptions)()
        : candidate.exceptions()
    ) as { readonly list?: readonly unknown[] };
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
    const dev = typeof ngDevMode === 'undefined' || ngDevMode;
    if (dev) validateStyleScope(scope, css.join('\n'));
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

function createRenderEffect(
  context: RenderContext,
  name: string,
  effectFn: () => void,
): EffectRef {
  // One token per binding: a binding that suspends holds it until it next runs
  // to completion. The effect stays subscribed across the suspension — the
  // settled read registered its source's `status` before throwing — so the
  // boundary is released without any polling.
  const token = {};
  // A binding that short-circuited must tell its boundary when it recovers —
  // but only that binding, so a sibling still in exception keeps its fallback.
  let shortCircuited = false;
  const ref = createEffectInInjector(context.injector, name, () => {
    try {
      // A settled read reports its source while it evaluates — that is how the
      // boundary learns about a source that is refetching rather than
      // suspending, since a refetch throws nothing.
      ɵwithSettledReadObserver(context.settledReadObserver, effectFn);
    } catch (error) {
      if (isCraftNotSettled(error)) {
        if (!context.pendingBoundary) {
          throw new CraftUnhandledPendingError(error.source);
        }
        context.pendingBoundary.suspend(token, error.source);
        return;
      }

      if (!isCraftGenShortCircuit(error)) throw error;

      // A settled read whose source carries a business exception: route it to
      // the nearest catchBlock, exactly like a component initialization one.
      context.pendingBoundary?.resume(token);
      if (!context.exceptionBoundary?.(error.exception, token)) {
        throw new CraftUnhandledExceptionError(error.exception);
      }
      shortCircuited = true;
      return;
    }

    context.pendingBoundary?.resume(token);
    if (shortCircuited) {
      shortCircuited = false;
      context.exceptionBoundaryResolved?.(token);
    }
  });

  return {
    destroy: () => {
      context.pendingBoundary?.resume(token);
      if (shortCircuited) context.exceptionBoundaryResolved?.(token);
      ref.destroy();
    },
  } as EffectRef;
}

function createEffectInInjector(
  injector: Injector,
  name: string,
  effectFn: () => void,
): EffectRef {
  return untracked(() =>
    runInInjectionContext(injector, () =>
      craftEffect(name, effectFn, { manualCleanup: true }),
    ),
  );
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

function angularMountContext(context: RenderContext): AngularMountContext {
  return {
    injector: context.injector,
    resolveInput: (value) => (typeof value === 'function' ? value() : value),
    executeOutput: (callback, value) =>
      executeTemplateCallback(callback, [value], context),
  };
}

function resolveTemplateValue(value: unknown, context: RenderContext): unknown {
  return typeof value === 'function'
    ? executeTemplateCallback(value as (...args: any[]) => unknown, [], context)
    : value;
}

function resolveTemplateContext(
  context: unknown,
  renderContext: RenderContext,
): unknown {
  if (typeof context === 'function') {
    return resolveTemplateValue(context, renderContext);
  }
  if (
    context === null ||
    typeof context !== 'object' ||
    Array.isArray(context)
  ) {
    return context;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === 'function'
        ? resolveTemplateValue(value, renderContext)
        : value,
    ]),
  );
}

function resolveProjectionValue(
  value: unknown,
  renderContext: RenderContext,
): unknown {
  let current = value;
  for (let depth = 0; depth < 3 && typeof current === 'function'; depth++) {
    current = resolveTemplateValue(current, renderContext);
  }
  return current;
}

function projectYieldableTemplateContext(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown {
  // Field trees are dynamic proxies: copying their enumerable members would
  // discard lazily-created child fields such as `form.email`.
  if (isCraftField(value)) return value;

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

  // Craft nodes carry runtime objects such as RenderContext and the DOM adapter
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
  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const [key, child] of Object.entries(value)) {
    result[key] = projectYieldableTemplateContext(child, seen);
  }
  return result;
}

class CraftNodeDirectiveMount {
  private readonly inputs;
  private readonly environmentInjector: EnvironmentInjector;
  private readonly cleanup: (() => void) | undefined;
  private readonly registrationRelease: () => void;

  constructor(
    descriptor: AppliedCraftNodeDirective,
    element: Element,
    context: RenderContext,
  ) {
    this.inputs = signal(descriptor.inputs);
    const definition = descriptor.directive[CRAFT_NODE_DIRECTIVE];
    this.environmentInjector = createEnvironmentInjector(
      [
        { provide: ElementRef, useValue: new ElementRef(element) },
        {
          provide: CRAFT_NODE_EFFECT_FACTORY,
          deps: [Injector],
          useFactory:
            (injector: Injector) => (name: string, effectFn: () => void) =>
              createEffectInInjector(
                injector,
                `node-directive-${name}`,
                effectFn,
              ),
        },
        ...(context.fieldExceptionBoundary
          ? [
              {
                provide: CRAFT_FIELD_EXCEPTION_BOUNDARY,
                useValue: context.fieldExceptionBoundary,
              },
            ]
          : []),
      ],
      context.injector.get(EnvironmentInjector),
      `CraftNodeDirective(${definition.name})`,
    );
    const inputs = this.inputs;
    const nodeContext = {
      element,
      injector: this.environmentInjector,
      renderer: context.renderer,
      get props() {
        return inputs();
      },
    } satisfies CraftNodeDirectiveContext;
    this.registrationRelease = ɵregisterCraftTarget(
      this.environmentInjector,
      descriptor.directive,
      nodeContext,
      allocateCraftHostName(
        this.environmentInjector,
        'directive',
        definition.name,
      ),
      false,
    );
    const cleanup = untracked(() =>
      runInInjectionContext(this.environmentInjector, () =>
        definition.mount(nodeContext),
      ),
    );
    this.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
  }

  update(descriptor: AppliedCraftNodeDirective): void {
    this.inputs.set(descriptor.inputs);
  }

  destroy(): void {
    this.registrationRelease();
    this.cleanup?.();
    this.environmentInjector.destroy();
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

function sameCraftNodeDirectives(
  left: readonly AppliedCraftNodeDirective[],
  right: readonly AppliedCraftNodeDirective[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (descriptor, index) => descriptor.directive === right[index]?.directive,
    )
  );
}

function insertBefore(
  renderer: CraftDomAdapter,
  parent: NativeParent,
  node: NativeNode,
  before: NativeNode | null,
): void {
  renderer.insertBefore(parent, node, before);
}

function removeNode(renderer: CraftDomAdapter, node: NativeNode): void {
  const parent = node.parentNode;
  if (parent) {
    renderer.removeChild(parent, node);
  }
}

function createComment(parent: NativeParent, value: string): Comment {
  const ownerDocument =
    parent instanceof Document ? parent : parent.ownerDocument;
  return (ownerDocument ?? document).createComment(value);
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
    private renderer: CraftDomAdapter,
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

class ReactiveTextRenderedNode implements RenderedNode {
  readonly kind = 'reactive-text';
  private binding: CraftTextBinding;
  private effectRef: EffectRef;
  private value = '';

  constructor(
    private readonly node: Text,
    binding: CraftTextBinding,
    private readonly context: RenderContext,
  ) {
    this.binding = binding;
    this.effectRef = this.createEffect();
  }

  firstNode(): NativeNode {
    return this.node;
  }

  lastNode(): NativeNode {
    return this.node;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'reactive-text') {
      return false;
    }
    if (node.binding !== this.binding) {
      this.effectRef.destroy();
      this.binding = node.binding;
      this.effectRef = this.createEffect();
    }
    return true;
  }

  destroy(): void {
    this.effectRef.destroy();
    removeNode(this.context.renderer, this.node);
  }

  private createEffect(): EffectRef {
    return createRenderEffect(this.context, 'text-binding', () => {
      const resolved = executeTemplateCallback(this.binding, [], this.context);
      const next =
        resolved === null || resolved === undefined || resolved === false
          ? ''
          : String(resolved);
      if (next !== this.value) {
        this.context.renderer.setValue(this.node, next);
        this.value = next;
      }
    });
  }
}

function renderCraftDirectiveNode(
  node: CraftDirectiveNode<any, any, any>,
  context: RenderContext,
): CraftNodeChildren {
  let template = (_componentContext: any): CraftNodeChildren => [node.node];

  for (const directive of node.directives) {
    template = directive[CRAFT_DIRECTIVE].template(template);
  }

  return renderChildrenCallback(
    context,
    template,
    [context.componentContext],
    'callback',
    'directive',
  );
}

class CraftDirectiveRenderedNode implements RenderedNode {
  readonly kind = 'directive';
  private readonly view: FragmentRenderedNode;
  private readonly descriptor;
  private readonly effectRef: EffectRef;
  private readonly styleReleases: (() => void)[];
  private readonly registrationReleases: (() => void)[];

  constructor(
    private node: CraftDirectiveNode<any, any, any>,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.descriptor = signal(node);
    const owners = node.directives.map((directive) => ({
      name: directive[CRAFT_DIRECTIVE].name,
      styles: [
        ...styleValues(directive[CRAFT_DIRECTIVE].meta.styles),
        ...styleValues(directive[CRAFT_DIRECTIVE].meta.stylesUrl),
      ],
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
    this.view = createFragment(parent, before, context, [], 'craft-directive');
    this.effectRef = createRenderEffect(context, 'craft-directive', () => {
      this.node = this.descriptor();
      this.view.patchChildren(renderCraftDirectiveNode(this.node, context));
    });
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

    this.descriptor.set(node);
    return true;
  }

  destroy(): void {
    this.registrationReleases.forEach((release) => release());
    this.effectRef.destroy();
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

function interactionName(
  eventName: string,
  tag: string,
  localName: string | undefined,
  componentName: string | undefined,
): string {
  return [componentName, tag, localName, eventName]
    .filter((part): part is string => Boolean(part))
    .join(':');
}

function executeDomEventHooks(
  hooks: readonly CraftDomEventHook[],
  interaction: CraftDomEvent,
  action: () => unknown,
): unknown {
  let current = action;
  for (let index = hooks.length - 1; index >= 0; index -= 1) {
    const hook = hooks[index];
    const next = current;
    current = () => hook(interaction, next);
  }
  return current();
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
    key === 'cssVars' ||
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
  const hostProps = Object.fromEntries(
    Object.entries(props).filter(
      ([key]) => key !== 'cssVars' && isHostProperty(key),
    ),
  );
  const vars = cssVarStyles(
    props['cssVars'] as
      | Readonly<Record<`--${string}`, CssVarDisposition>>
      | undefined,
  );
  return Object.keys(vars).length
    ? mergeHostProps({ style: vars }, hostProps)
    : hostProps;
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

function containsRenderBinding(
  value: unknown,
  seen = new Set<object>(),
): boolean {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some((child) =>
    containsRenderBinding(child, seen),
  );
}

function resolveStyleBindingValue(
  value: unknown,
  context: RenderContext,
): unknown {
  const resolved = resolveTemplateValue(value, context);
  if (typeof resolved !== 'object' || resolved === null) return resolved;
  return Object.fromEntries(
    Object.entries(resolved).map(([key, child]) => [
      key,
      resolveTemplateValue(child, context),
    ]),
  );
}

function sameStyleValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  const rightRecord = right as Record<string, unknown>;
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => Object.is(value, rightRecord[key]))
  );
}

function setStyleValue(
  _renderer: CraftDomAdapter,
  element: Element,
  key: string,
  value: unknown,
  context: RenderContext,
): void {
  value = resolveTemplateValue(value, context);
  const style = (element as Element & { readonly style: CSSStyleDeclaration })
    .style;
  if (value === null || value === undefined || value === false) {
    if (key.startsWith('--')) {
      style.removeProperty(key);
    } else {
      (style as unknown as Record<string, unknown>)[key] = '';
    }
  } else if (key.startsWith('--')) {
    style.setProperty(key, String(value));
  } else {
    (style as unknown as Record<string, unknown>)[key] = String(value);
  }
}

function applyStyles(
  renderer: CraftDomAdapter,
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
        setStyleValue(renderer, element, key, null, context);
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
      key !== 'labelledBy' &&
      key !== 'onClose' &&
      !eventNameFor(key, value)
    ) {
      attributes.set(key, value);
    }
  }
  return attributes;
}

function applyAttribute(
  renderer: CraftDomAdapter,
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
  if (key === 'htmlFor') {
    renderer.setProperty(element, key, value ?? '');
    if (value === null || value === undefined || value === false) {
      renderer.removeAttribute(element, 'for');
    }
    return;
  }
  if (PROPERTY_NAMES.has(key)) {
    renderer.setProperty(element, key, value ?? false);
    if (value === null || value === undefined || value === false) {
      renderer.removeAttribute(element, key);
    }
    return;
  }

  if (value === null || value === undefined) {
    renderer.removeAttribute(element, key);
  } else if (key.startsWith('aria-') && typeof value === 'boolean') {
    renderer.setAttribute(element, key, value ? 'true' : 'false');
  } else if (value === false) {
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
  private readonly bindings = new Map<
    string,
    { readonly source: unknown; readonly effectRef: EffectRef }
  >();
  private angularDirectiveMount: AngularMount | undefined;
  private directiveTypes: readonly AngularDirectiveNode[] = [];
  private craftNodeDirectiveTypes: readonly AppliedCraftNodeDirective[] = [];
  private craftNodeDirectiveMounts: CraftNodeDirectiveMount[] = [];
  private localName: string | undefined;
  private dialogCleanup: (() => void) | undefined;

  constructor(
    private readonly node: Element,
    private tag: string,
    private context: RenderContext,
    initial: ElementNodeBase<any, any, any, any, any, any, any, any>,
  ) {
    this.patchProperties(initial);
    this.installDialog(initial);
    const nested =
      this.tag === 'dialog'
        ? childContext(context, {
            rootScope: undefined,
            contentScope: undefined,
            headingLevel: 1,
          })
        : childContext(context, {
            rootScope: undefined,
            contentScope: undefined,
          });
    this.children = patchRenderedChildren(
      this.node,
      this.children,
      initial.children,
      null,
      nested,
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
    this.installDialog(node);
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

  private patchProperties(
    nextNode: ElementNodeBase<any, any, any, any, any, any, any, any>,
  ): void {
    const next = nextNode.props;
    const renderer = this.context.renderer;
    const previousAttributes = flattenAttributes(this.props);
    const nextAttributes = flattenAttributes(next);

    for (const key of previousAttributes.keys()) {
      if (!nextAttributes.has(key)) {
        this.destroyBinding(`attribute:${key}`);
        applyAttribute(renderer, this.node, key, null, this.context);
      }
    }
    for (const [key, value] of nextAttributes) {
      if (typeof value === 'function') {
        this.updateBinding(
          `attribute:${key}`,
          value,
          () => resolveTemplateValue(value, this.context),
          (resolved) =>
            applyAttribute(renderer, this.node, key, resolved, this.context),
        );
      } else {
        this.destroyBinding(`attribute:${key}`);
      }
      if (
        typeof value !== 'function' &&
        (!Object.is(previousAttributes.get(key), value) ||
          typeof previousAttributes.get(key) === 'function')
      ) {
        applyAttribute(renderer, this.node, key, value, this.context);
      }
    }

    if (containsRenderBinding(next['class'])) {
      this.updateBinding(
        'class',
        next['class'],
        () => className(next['class'], this.context),
        (value) => {
          if (value) {
            renderer.setAttribute(this.node, 'class', String(value));
          } else {
            renderer.removeAttribute(this.node, 'class');
          }
        },
      );
    } else {
      this.destroyBinding('class');
    }
    if (
      !containsRenderBinding(next['class']) &&
      (!Object.is(this.props['class'], next['class']) ||
        containsRenderBinding(this.props['class']))
    ) {
      const value = className(next['class'], this.context);
      if (value) {
        renderer.setAttribute(this.node, 'class', value);
      } else {
        renderer.removeAttribute(this.node, 'class');
      }
    }

    if (containsRenderBinding(next['style'])) {
      this.updateBinding(
        'style',
        next['style'],
        () => resolveStyleBindingValue(next['style'], this.context),
        (value) => {
          renderer.removeAttribute(this.node, 'style');
          applyStyles(renderer, this.node, undefined, value, this.context);
        },
        sameStyleValue,
      );
    } else {
      this.destroyBinding('style');
    }
    if (
      !containsRenderBinding(next['style']) &&
      (!Object.is(this.props['style'], next['style']) ||
        containsRenderBinding(this.props['style']))
    ) {
      if (containsRenderBinding(this.props['style'])) {
        renderer.removeAttribute(this.node, 'style');
      }
      applyStyles(
        renderer,
        this.node,
        containsRenderBinding(this.props['style'])
          ? undefined
          : this.props['style'],
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
      if (!nextEvents.has(eventName)) {
        dispose();
        this.listeners.delete(eventName);
      }
    }

    for (const [eventName] of nextEvents) {
      if (!this.listeners.has(eventName)) {
        this.listeners.set(
          eventName,
          renderer.listen(this.node, eventName, (event: Event) => {
            const listener = Object.entries(this.props).find(
              ([key, value]) => eventNameFor(key, value) === eventName,
            )?.[1] as EventListener | undefined;
            if (!listener) {
              return undefined;
            }
            const interaction: CraftDomEvent = {
              event,
              eventName,
              element: this.node,
              elementTag: this.tag,
              elementName: this.localName,
              componentName: this.context.componentName,
              interactionName: interactionName(
                eventName,
                this.tag,
                this.localName,
                this.context.componentName,
              ),
            };
            const hooks = this.context.injector.get(CRAFT_DOM_EVENT_HOOK);
            runInInjectionContext(this.context.injector, () =>
              executeDomEventHooks(hooks, interaction, () =>
                executeTemplateCallback(listener, [event], this.context),
              ),
            );
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
            angularMountContext(this.context),
          )
        : undefined;
    } else {
      this.angularDirectiveMount?.update({}, {}, directives);
    }
    this.directiveTypes = directives;

    const craftNodeDirectives = nextNode[CRAFT_NODE_DIRECTIVES] ?? [];
    if (
      !sameCraftNodeDirectives(
        this.craftNodeDirectiveTypes,
        craftNodeDirectives,
      )
    ) {
      this.craftNodeDirectiveMounts.forEach((mount) => mount.destroy());
      this.craftNodeDirectiveMounts = craftNodeDirectives.map(
        (descriptor) =>
          new CraftNodeDirectiveMount(descriptor, this.node, this.context),
      );
    } else {
      this.craftNodeDirectiveMounts.forEach((mount, index) =>
        mount.update(craftNodeDirectives[index]!),
      );
    }
    this.craftNodeDirectiveTypes = craftNodeDirectives;

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

  private updateBinding(
    key: string,
    source: unknown,
    evaluate: () => unknown,
    apply: (value: unknown) => void,
    equals: (left: unknown, right: unknown) => boolean = Object.is,
  ): void {
    const current = this.bindings.get(key);
    if (current?.source === source) return;
    current?.effectRef.destroy();

    let initialized = false;
    let previous: unknown;
    const effectRef = createRenderEffect(
      this.context,
      `element-${key}-binding`,
      () => {
        const value = evaluate();
        if (!initialized || !equals(previous, value)) {
          apply(value);
          previous = value;
          initialized = true;
        }
      },
    );
    this.bindings.set(key, { source, effectRef });
  }

  private destroyBinding(key: string): void {
    this.bindings.get(key)?.effectRef.destroy();
    this.bindings.delete(key);
  }

  private installDialog(
    nextNode: ElementNodeBase<any, any, any, any, any, any, any, any>,
  ): void {
    if (this.tag !== 'dialog') return;
    const dialog = this.node as HTMLDialogElement;
    const renderer = this.context.renderer;
    if (!dialog.getAttribute('role')) {
      renderer.setAttribute(dialog, 'role', 'dialog');
    }
    if (!dialog.getAttribute('aria-modal')) {
      renderer.setAttribute(dialog, 'aria-modal', 'true');
    }
    const labelledBy = nextNode.props['labelledBy'];
    const label = nextNode.props['label'] ?? nextNode.props['aria-label'];
    if (typeof labelledBy === 'string' && labelledBy) {
      renderer.setAttribute(dialog, 'aria-labelledby', labelledBy);
    } else if (typeof label === 'string' && label) {
      renderer.setAttribute(dialog, 'aria-label', label);
    }
    const onClose = nextNode.props['onClose'];
    this.dialogCleanup?.();
    const cancel = renderer.listen(dialog, 'cancel', (event: Event) => {
      event.preventDefault();
      if (typeof onClose === 'function') onClose(event);
      if (typeof dialog.close === 'function') dialog.close();
    });
    const close = renderer.listen(dialog, 'close', (event: Event) => {
      if (typeof onClose === 'function') onClose(event);
    });
    this.dialogCleanup = () => {
      cancel();
      close();
    };
    const open = nextNode.props['open'];
    if (open && typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
    } else if (
      open === false &&
      typeof dialog.close === 'function' &&
      dialog.open
    ) {
      dialog.close();
    }
  }

  destroy(): void {
    this.dialogCleanup?.();
    this.bindings.forEach(({ effectRef }) => effectRef.destroy());
    this.bindings.clear();
    this.listeners.forEach((dispose) => dispose());
    this.listeners.clear();
    this.angularDirectiveMount?.destroy();
    this.craftNodeDirectiveMounts.forEach((mount) => mount.destroy());
    this.craftNodeDirectiveMounts = [];
    this.children.forEach((child) => child.destroy());
    removeNode(this.context.renderer, this.node);
  }
}

class FragmentRenderedNode implements RenderedNode {
  readonly kind = 'fragment';
  private children: RenderedNode[] = [];

  /**
   * Where this fragment currently lives. A boundary can detach a range into a
   * holder fragment to hide it without destroying it, and the range keeps being
   * reconciled while detached — so every insertion has to follow the markers
   * rather than the parent captured at construction time.
   */
  private get liveParent(): NativeParent {
    return this.start.parentNode ?? this.parent;
  }

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
      this.liveParent,
      this.children,
      children,
      this.end,
      this.context,
    );
  }

  hasChildren(): boolean {
    return this.children.length > 0;
  }

  appendChildren(children: CraftNodeChildren): void {
    const nextNodes = normalizeChildren(children);
    nextNodes.forEach((child) => {
      this.children.push(
        mountNode(child, this.liveParent, this.end, this.context),
      );
    });
  }

  prependChildren(children: CraftNodeChildren): void {
    const nextNodes = normalizeChildren(children);
    const before = this.children[0]?.firstNode() ?? this.end;
    const mounted: RenderedNode[] = [];
    for (let index = nextNodes.length - 1; index >= 0; index -= 1) {
      mounted.unshift(
        mountNode(nextNodes[index], this.liveParent, before, this.context),
      );
    }
    this.children.unshift(...mounted);
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
      insertBefore(this.context.renderer, this.liveParent, node, before),
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
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  constructor(
    node: ProjectionNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.descriptor = signal(node);
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
      [],
      'craft-projection',
    );
    this.effectRef = createRenderEffect(
      this.projectionContext,
      'projection',
      () => {
        this.node = this.descriptor();
        this.view.patchChildren(this.children());
      },
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
      node.kind !== 'projection' ||
      node.declarationContext !== this.node.declarationContext
    ) {
      return false;
    }
    this.descriptor.set(node);
    return true;
  }

  private children(): CraftNodeChildren {
    return executeTemplateTrace(
      this.projectionContext.injector,
      traceContext(
        this.projectionContext,
        'projection',
        tracePhase(this.projectionContext),
        this.node.slotName,
      ),
      () =>
        runInInjectionContext(this.declarationContext.injector, () =>
          withCraftRenderContext(
            this.declarationContext,
            () =>
              resolveProjectionValue(
                this.node.render(),
                this.projectionContext,
              ) as CraftNodeChildren,
          ),
        ),
    );
  }

  destroy(): void {
    this.effectRef.destroy();
    this.view.destroy();
    this.styleRelease();
  }
}

class TemplateRenderedNode implements RenderedNode {
  readonly kind = 'template';
  private readonly view: FragmentRenderedNode;
  private node: TemplateNode;
  private readonly declarationContext: RenderContext;
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  constructor(
    node: TemplateNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.descriptor = signal(node);
    this.declarationContext =
      (node.declarationContext as RenderContext | undefined) ??
      lexicalContext(context);
    this.view = createFragment(
      parent,
      before,
      this.declarationContext,
      [],
      'craft-template',
    );
    this.effectRef = createRenderEffect(
      this.declarationContext,
      'template',
      () => {
        this.node = this.descriptor();
        this.view.patchChildren(this.children());
      },
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
    this.descriptor.set(node);
    return true;
  }

  private children(): CraftNodeChildren {
    return renderChildrenCallback(this.declarationContext, this.node.template, [
      resolveTemplateContext(this.node.context, this.declarationContext),
    ]);
  }

  destroy(): void {
    this.effectRef.destroy();
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
  const start = createComment(parent, `${label}:start`);
  const end = createComment(parent, `${label}:end`);
  insertBefore(context.renderer, parent, start, before);
  insertBefore(context.renderer, parent, end, before);
  return new FragmentRenderedNode(parent, start, end, context, children);
}

interface EachRenderedEntry {
  item: unknown;
  index: number;
  readonly view: FragmentRenderedNode;
  readonly traceState: TemplateTraceState;
}

class EachRenderedNode implements RenderedNode {
  readonly kind = 'each';
  private entries = new Map<unknown, EachRenderedEntry>();
  private ordered: FragmentRenderedNode[] = [];
  private emptyView: FragmentRenderedNode | undefined;
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  constructor(
    private node: EachNode<unknown, unknown>,
    private readonly parent: NativeParent,
    private readonly start: Comment,
    private readonly end: Comment,
    private readonly context: RenderContext,
  ) {
    this.descriptor = signal(node);
    this.effectRef = createRenderEffect(context, 'each-block', () => {
      const previousItemTemplate = this.node.itemTemplate;
      this.node = this.descriptor();
      this.reconcile(this.node.itemTemplate !== previousItemTemplate);
    });
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
    this.descriptor.set(node);
    return true;
  }

  private reconcile(itemTemplateChanged = false): void {
    const items = resolveTemplateValue(this.node.source, this.context) as
      | readonly unknown[]
      | null
      | undefined;
    const collection = items ?? [];

    if (collection.length === 0) {
      this.entries.forEach((entry) => entry.view.destroy());
      this.entries.clear();
      this.ordered = [];

      if (this.node.empty) {
        if (this.emptyView) {
          this.emptyView.patchChildren(
            renderBlockChildren(this.context, 'empty', this.node.empty),
          );
        } else {
          this.emptyView = createFragment(
            this.parent,
            this.end,
            this.context,
            renderBlockChildren(this.context, 'empty', this.node.empty),
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
    const next = new Map<unknown, EachRenderedEntry>();
    const nextOrdered: FragmentRenderedNode[] = [];

    collection.forEach((item, index) => {
      const key = this.node.track(item, index);
      if (next.has(key)) {
        throw new Error(`each() received the duplicate key "${String(key)}".`);
      }

      let entry = previous.get(key);
      if (entry) {
        if (
          itemTemplateChanged ||
          !Object.is(entry.item, item) ||
          entry.index !== index
        ) {
          entry.view.patchChildren(
            this.renderItem(entry.traceState, item, index),
          );
          entry.item = item;
          entry.index = index;
        }
      } else {
        const traceState = { renderCount: 0 };
        entry = {
          item,
          index,
          traceState,
          view: createFragment(
            this.parent,
            this.end,
            this.context,
            this.renderItem(traceState, item, index),
            `craft-each:${String(key)}`,
          ),
        };
      }

      next.set(key, entry);
      nextOrdered.push(entry.view);
    });

    previous.forEach((entry, key) => {
      if (!next.has(key)) {
        entry.view.destroy();
      }
    });

    let before: NativeNode = this.end;
    for (let index = nextOrdered.length - 1; index >= 0; index -= 1) {
      const entry = nextOrdered[index];
      if (entry.lastNode().nextSibling !== before) {
        entry.moveBefore(before);
      }
      before = entry.firstNode();
    }

    this.entries = next;
    this.ordered = nextOrdered;
  }

  private renderItem(
    traceState: TemplateTraceState,
    item: unknown,
    index: number,
  ): CraftNodeChildren {
    traceState.renderCount += 1;
    return renderBlockChildren(
      childContext(this.context, { traceState }),
      'each',
      this.node.itemTemplate,
      [
        function* () {
          return item;
        },
        index,
      ],
    );
  }

  destroy(): void {
    this.effectRef.destroy();
    this.entries.forEach((entry) => entry.view.destroy());
    this.emptyView?.destroy();
    removeNode(this.context.renderer, this.start);
    removeNode(this.context.renderer, this.end);
  }
}

class IfBlockRenderedNode implements RenderedNode {
  readonly kind = 'if';
  private readonly view: FragmentRenderedNode;
  private active: boolean | undefined;
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  constructor(
    private node: IfBlockNode,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.descriptor = signal(node);
    this.view = createFragment(
      parent,
      before,
      context,
      [],
      `craft-if:${node.conditionName}`,
    );
    this.effectRef = createRenderEffect(context, 'if-block', () => {
      this.node = this.descriptor();
      this.active = this.isTrue();
      this.view.patchChildren(this.children());
    });
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
    this.descriptor.set(node);
    return true;
  }

  private isTrue(): boolean {
    return Boolean(resolveTemplateValue(this.node.condition, this.context));
  }

  private children(): CraftNodeChildren {
    return this.active
      ? renderBlockChildren(
          this.context,
          this.node.conditionName,
          this.node.whenTrue,
        )
      : this.node.whenFalse
        ? renderBlockChildren(
            this.context,
            this.node.conditionName,
            this.node.whenFalse,
          )
        : [];
  }

  destroy(): void {
    this.effectRef.destroy();
    this.view.destroy();
  }
}

class MatchBlockRenderedNode implements RenderedNode {
  readonly kind = 'match-block';
  private readonly view: FragmentRenderedNode;
  private handledExceptionCode: string | undefined;
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  constructor(
    private node: MatchBlockNode,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.descriptor = signal(node);
    this.view = createFragment(
      parent,
      before,
      context,
      [],
      'craft-match-block',
    );
    this.effectRef = createRenderEffect(context, 'match-block', () => {
      this.node = this.descriptor();
      this.view.patchChildren(this.children());
    });
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
    this.descriptor.set(node);
    return true;
  }

  private children(): CraftNodeChildren {
    if (this.handledExceptionCode) {
      this.context.handledResourceExceptionCodes?.delete(
        this.handledExceptionCode,
      );
      this.handledExceptionCode = undefined;
    }
    const exception = resolveTemplateValue(this.node.source, this.context) as
      | AnyCraftException
      | undefined;
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
    return executeTemplateTrace(
      this.context.injector,
      traceContext(
        this.context,
        'block',
        tracePhase(this.context),
        String(this.node.key),
      ),
      () => handler(exception as AnyCraftException),
    );
  }

  destroy(): void {
    this.effectRef.destroy();
    if (this.handledExceptionCode) {
      this.context.handledResourceExceptionCodes?.delete(
        this.handledExceptionCode,
      );
    }
    this.view.destroy();
  }
}

/**
 * Detaches a mounted DOM range into a holder fragment, keeping every node (and
 * therefore every binding) alive. Both boundaries hide their subtree this way:
 * destroying it would take with it the bindings that report recovery.
 *
 * The nodes go into a real `DocumentFragment` rather than a plain array so that
 * a NESTED boundary can still insert relative to its own markers while an outer
 * boundary holds them detached — the markers keep a parent to insert into.
 */
function detachRange(
  renderer: CraftDomAdapter,
  first: NativeNode,
  last: NativeNode,
): DocumentFragment {
  const holder = (first.ownerDocument ?? document).createDocumentFragment();
  let current: NativeNode | null = first;
  const nodes: NativeNode[] = [];
  while (current) {
    nodes.push(current);
    if (current === last) break;
    current = current.nextSibling;
  }
  nodes.forEach((node) => {
    removeNode(renderer, node);
    renderer.appendChild(holder, node);
  });
  return holder;
}

/** Re-inserts a detached range before `anchor`, in whatever parent it now has. */
function reattachRange(
  renderer: CraftDomAdapter,
  holder: DocumentFragment,
  anchor: NativeNode,
  fallbackParent: NativeParent,
): void {
  const parent = anchor.parentNode ?? fallbackParent;
  while (holder.firstChild) {
    const node = holder.firstChild;
    removeNode(renderer, node);
    insertBefore(renderer, parent, node, anchor);
  }
}

/** Stands in for reporters that do not identify themselves (component renders). */
const ANONYMOUS_EXCEPTION_REPORTER: object = {};

class CatchBlockRenderedNode implements RenderedNode {
  readonly kind = 'catch-block';
  private readonly start: Comment;
  private readonly end: Comment;
  private readonly sourceView: FragmentRenderedNode;
  private readonly fallbackView: FragmentRenderedNode;
  private handling = false;
  private fallbackVisible = false;
  private fallbackPosition: CatchBlockPosition;
  private detached: DocumentFragment | undefined;
  /** Reporters still failing. The fallback stays up until this empties. */
  private readonly failing = new Set<object>();

  constructor(
    private node: CatchBlockNode<any, any, any, any, any>,
    private readonly parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.fallbackPosition = node.position;
    this.start = createComment(parent, 'craft-catch-block:start');
    this.end = createComment(parent, 'craft-catch-block:end');
    insertBefore(context.renderer, parent, this.start, before);
    insertBefore(context.renderer, parent, this.end, before);

    // The fallback renders in the OUTER context: an exception thrown by a
    // fallback belongs to the next boundary up, never to this one.
    const createFallback = () =>
      createFragment(
        parent,
        this.end,
        this.context,
        [],
        'craft-catch-fallback',
      );
    const createSource = () =>
      createFragment(
        parent,
        this.end,
        this.boundaryContext(),
        [],
        'craft-catch-source',
      );

    if (this.fallbackPosition === 'before') {
      this.fallbackView = createFallback();
      this.sourceView = createSource();
    } else {
      this.sourceView = createSource();
      this.fallbackView = createFallback();
    }

    try {
      this.sourceView.patchChildren([this.node.source]);
    } catch (error) {
      if (!isCraftGenShortCircuit(error)) throw error;
      this.handle(error.exception);
    }
  }

  firstNode(): NativeNode {
    return this.start;
  }

  lastNode(): NativeNode {
    return this.end;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'catch-block' || node.position !== this.node.position) {
      return false;
    }
    this.node = node;
    try {
      this.sourceView.patchChildren([node.source]);
      if (this.detached) {
        // A re-render re-materialises the source range: hide it again.
        this.detached = undefined;
        this.hideSource();
      }
    } catch (error) {
      if (!isCraftGenShortCircuit(error)) throw error;
      this.handle(error.exception);
    }
    return true;
  }

  private boundaryContext(): RenderContext {
    return childContext(this.context, {
      exceptionBoundary: (exception, token) => this.handle(exception, token),
      exceptionBoundaryResolved: (token) => this.resolved(token),
    });
  }

  private handle(exception: AnyCraftException, token?: object): boolean {
    if (this.handling) {
      return (
        this.context.exceptionBoundary?.(exception, token) ??
        this.unhandled(exception)
      );
    }

    const handler = this.node.handlers[exception.code];
    if (!handler) {
      return (
        this.context.exceptionBoundary?.(exception, token) ??
        this.unhandled(exception)
      );
    }

    this.failing.add(token ?? ANONYMOUS_EXCEPTION_REPORTER);
    this.handling = true;
    this.fallbackVisible = true;
    try {
      const resolved = resolveCatchBlockHandler(
        handler,
        exception,
        true,
        this.node.position,
      );
      this.applyPosition(resolved.position);
      this.fallbackView.patchChildren(
        hasLiveRegion(resolved.children)
          ? resolved.children
          : a11yElement('div', { role: 'alert' }, resolved.children),
      );
      if (resolved.showSource) {
        this.restoreSource();
      } else {
        this.hideSource();
      }
    } finally {
      this.handling = false;
    }
    return true;
  }

  private resolved(token?: object): void {
    this.failing.delete(token ?? ANONYMOUS_EXCEPTION_REPORTER);
    if (this.handling || !this.fallbackVisible || this.failing.size > 0) return;
    this.fallbackVisible = false;
    this.applyPosition(this.node.position);
    this.fallbackView.patchChildren([]);
    this.restoreSource();
  }

  private applyPosition(position: CatchBlockPosition): void {
    if (position === this.fallbackPosition) return;
    this.fallbackPosition = position;
    this.fallbackView.moveBefore(
      position === 'before' ? this.sourceFirstNode() : this.end,
    );
  }

  private sourceFirstNode(): NativeNode {
    return this.detached ? this.end : this.sourceView.firstNode();
  }

  /**
   * A hidden source is detached from the DOM but stays mounted. Destroying it
   * would take its bindings with it — and those bindings are the only channel
   * that reports the exception is gone, so the fallback could never be removed.
   */
  private hideSource(): void {
    if (this.detached) return;
    this.detached = detachRange(
      this.context.renderer,
      this.sourceView.firstNode(),
      this.sourceView.lastNode(),
    );
  }

  private restoreSource(): void {
    if (!this.detached) return;

    const anchor =
      this.fallbackPosition === 'before'
        ? this.end
        : this.fallbackView.firstNode();
    reattachRange(this.context.renderer, this.detached, anchor, this.parent);
    this.detached = undefined;
  }

  private unhandled(exception: AnyCraftException): never {
    throw new CraftUnhandledExceptionError(exception);
  }

  destroy(): void {
    this.restoreSource();
    this.fallbackView.destroy();
    this.sourceView.destroy();
    removeNode(this.context.renderer, this.start);
    removeNode(this.context.renderer, this.end);
  }
}

type RegisteredFieldExceptionSource = {
  readonly source: CraftFieldExceptionSource;
  readonly element?: Element;
  readonly messageIds: Map<string, string>;
};

type FieldExceptionAccessibilityState = {
  readonly originalAriaInvalid: string | null;
  readonly originalAriaDescribedBy: string | null;
  readonly registrations: Set<number>;
  readonly messagesByBoundary: Map<number, readonly string[]>;
};

const fieldExceptionAccessibility = new WeakMap<
  Element,
  FieldExceptionAccessibilityState
>();

let nextFieldExceptionBoundaryId = 0;

function componentFieldExceptionSources(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): readonly CraftFieldExceptionSource[] {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return [];
  }
  const objectValue = value as object;
  if (seen.has(objectValue)) return [];
  seen.add(objectValue);

  const source = (
    value as Partial<Record<typeof CRAFT_FIELD_EXCEPTION_SOURCE, unknown>>
  )[CRAFT_FIELD_EXCEPTION_SOURCE];
  if (source) {
    return [rawReactiveFacade(source as CraftFieldExceptionSource)];
  }
  const sources: CraftFieldExceptionSource[] = [];
  if (depth >= 4) return sources;

  for (const key of Object.keys(value)) {
    sources.push(
      ...componentFieldExceptionSources(
        (value as Record<string, unknown>)[key],
        seen,
        depth + 1,
      ),
    );
  }
  return sources;
}

function fieldExceptionHandler(
  handlers: FieldExceptionHandlers,
  path: string,
  code: string,
): FieldExceptionHandler | undefined {
  const grouped = handlers[path];
  if (typeof grouped === 'object' && grouped !== null) {
    return grouped[code];
  }
  const local = handlers[code];
  return typeof local === 'function' ? local : undefined;
}

function fieldExceptionValidatorName(
  source: CraftFieldExceptionSource,
  exception: AnyCraftException,
): string {
  const branded = (exception as { readonly __brand?: unknown }).__brand;
  if (typeof branded === 'string') return branded;
  const byValidator = source.exceptions().byValidator;
  return (
    Object.entries(byValidator).find(([, value]) => value === exception)?.[0] ??
    'unknown'
  );
}

function fieldExceptionMessageNode(
  id: string,
  children: CraftNodeChildren,
): ElementNodeBase {
  return {
    kind: 'element',
    tag: 'div',
    props: {
      id,
      role: 'alert',
      'data-field-exception': '',
    },
    children,
  };
}

function a11yElement(
  tag: string,
  props: Readonly<Record<string, unknown>>,
  children: CraftNodeChildren = [],
): ElementNodeBase {
  return { kind: 'element', tag, props, children };
}

function firstElementChild(
  value: CraftNodeChildren,
): ElementNodeBase | undefined {
  const list = Array.isArray(value) ? value : [value];
  for (const child of list) {
    if (
      child &&
      typeof child === 'object' &&
      'kind' in child &&
      child.kind === 'element'
    ) {
      return child as ElementNodeBase;
    }
  }
  return undefined;
}

function hasLiveRegion(children: CraftNodeChildren): boolean {
  const element = firstElementChild(children);
  if (!element) return false;
  const role = element.props['role'];
  const live = element.props['aria-live'];
  return (
    role === 'alert' ||
    role === 'status' ||
    live === 'polite' ||
    live === 'assertive'
  );
}

/**
 * The `pendingBlock` boundary.
 *
 * Layout is fixed at construction — a fallback fragment and a source fragment,
 * ordered by `position` — so showing or hiding the fallback never reconciles
 * the source subtree.
 *
 * While at least one descendant binding holds a pending token, the fallback is
 * rendered and the source's DOM range is detached (its nodes are kept, not
 * destroyed). Keeping the subtree alive is what makes resumption work at all:
 * the suspended bindings stay subscribed to their source's `status`, so they
 * re-run — and release their token — the moment the data arrives.
 */
class PendingBlockRenderedNode implements RenderedNode {
  readonly kind = 'pending-block';
  private readonly start: Comment;
  private readonly end: Comment;
  private readonly sourceView: FragmentRenderedNode;
  private readonly fallbackView: FragmentRenderedNode;
  private readonly position: PendingBlockPosition;
  /** Held tokens, by the binding that suspended, in suspension order. */
  private readonly held = new Map<object, string>();
  /** Sources seen below this boundary, by name — the reload watch reads them. */
  private readonly watched = new Map<string, CraftSettledReadNotice>();
  private reloadWatch: EffectRef | undefined;
  private reloadingSource: string | undefined;
  private detached: DocumentFragment | undefined;

  constructor(
    private node: PendingBlockNode<any, any, any, any>,
    private readonly parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.position = node.position;
    this.start = createComment(parent, 'craft-pending:start');
    this.end = createComment(parent, 'craft-pending:end');
    insertBefore(context.renderer, parent, this.start, before);
    insertBefore(context.renderer, parent, this.end, before);

    // The fallback renders in the OUTER context: a fallback that suspends in
    // turn belongs to the next boundary up, never to this one.
    const createFallback = () =>
      createFragment(
        parent,
        this.end,
        this.context,
        [],
        'craft-pending-fallback',
      );
    const createSource = () =>
      createFragment(
        parent,
        this.end,
        this.boundaryContext(),
        [node.source],
        'craft-pending-source',
      );

    if (this.position === 'before') {
      this.fallbackView = createFallback();
      this.sourceView = createSource();
    } else {
      this.sourceView = createSource();
      this.fallbackView = createFallback();
    }
  }

  firstNode(): NativeNode {
    return this.start;
  }

  lastNode(): NativeNode {
    return this.end;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'pending-block') {
      return false;
    }
    const next = node as PendingBlockNode<any, any, any, any>;
    if (next.position !== this.position) {
      return false;
    }
    this.node = next;
    this.sourceView.patchChildren([next.source]);
    if (this.held.size > 0) {
      // A re-render re-materialises the source range: hide it again.
      this.detached = undefined;
      this.showFallback();
    }
    return true;
  }

  destroy(): void {
    this.reloadWatch?.destroy();
    this.restoreSource();
    this.fallbackView.destroy();
    this.sourceView.destroy();
    removeNode(this.context.renderer, this.start);
    removeNode(this.context.renderer, this.end);
  }

  private boundaryContext(): RenderContext {
    return childContext(this.context, {
      pendingBoundary: {
        suspend: (token, source) => this.suspend(token, source),
        resume: (token) => this.resume(token),
      },
      settledReadObserver: (notice) => this.watch(notice),
    });
  }

  /**
   * Records a source read below this boundary. A refetch throws nothing, so the
   * boundary cannot learn about it from the suspension channel: it watches the
   * source's own status instead, on its own effect, which keeps working even
   * when the binding that first reported it never re-runs.
   */
  private watch(notice: CraftSettledReadNotice): void {
    if (!this.handles(notice.source)) {
      this.context.settledReadObserver?.(notice);
      return;
    }
    if (this.watched.has(notice.source)) return;

    this.watched.set(notice.source, notice);
    this.reloadWatch?.destroy();
    this.reloadWatch = createEffectInInjector(
      this.context.injector,
      'pending-reload-watch',
      () => this.onReloadStateChange(),
    );
  }

  private onReloadStateChange(): void {
    let reloading: string | undefined;
    for (const [source, notice] of this.watched) {
      const status = notice.status();
      // Refetching with something already on screen — the settled read returns
      // the stale value, so the subtree stays visible.
      if (
        notice.value() !== undefined &&
        (status === 'loading' || status === 'reloading')
      ) {
        reloading = source;
        break;
      }
    }

    if (reloading === this.reloadingSource) return;
    this.reloadingSource = reloading;
    // A suspension outranks a reload: it already owns the fallback slot.
    if (this.held.size === 0) this.renderFallback();
  }

  private suspend(token: object, source: string): void {
    if (this.handles(source)) {
      const wasIdle = this.held.size === 0;
      this.held.set(token, source);
      if (wasIdle) this.showFallback();
      return;
    }

    // Not ours to handle (an `.exhaustive` boundary that does not list this
    // source): delegate outwards.
    if (!this.context.pendingBoundary) {
      throw new CraftUnhandledPendingError(source);
    }
    this.context.pendingBoundary.suspend(token, source);
  }

  private resume(token: object): void {
    if (!this.held.delete(token)) {
      this.context.pendingBoundary?.resume(token);
      return;
    }
    if (this.held.size === 0) this.hideFallback();
  }

  /** The catch-all form handles every source; `.exhaustive` only what it lists. */
  private handles(source: string): boolean {
    return !this.node.handlers || source in this.node.handlers;
  }

  private fallbackChildren(): CraftNodeChildren {
    const handlers = this.node.handlers;
    const suspended = this.held.size > 0;
    // Several listed sources may be pending at once — the first to suspend wins.
    const [firstSuspended] = this.held.values();
    const source = suspended ? firstSuspended : this.reloadingSource;

    if (!source) return [];

    if (!handlers) {
      return this.announceFallback(
        suspended
          ? (this.node.fallback?.() ?? [])
          : (this.node.reloading?.() ?? []),
        true,
      );
    }

    const handler: PendingBlockHandler | undefined = handlers[source];
    const inner = handler
      ? resolvePendingBlockHandler(handler, suspended ? 'pending' : 'reloading')
      : [];
    return this.announceFallback(inner, true);
  }

  private announceFallback(
    children: CraftNodeChildren,
    busy: boolean,
  ): CraftNodeChildren {
    if (!children || (Array.isArray(children) && children.length === 0)) {
      return [];
    }
    return a11yElement(
      'span',
      {
        'aria-live': 'polite',
        'aria-atomic': 'true',
        'aria-busy': busy ? 'true' : 'false',
      },
      children,
    );
  }

  /** Renders whatever the current state calls for: a suspension, a reload, or nothing. */
  private renderFallback(): void {
    if (this.held.size > 0) {
      this.detachSource();
    } else {
      // A reload keeps the stale subtree on screen next to the indicator.
      this.restoreSource();
    }
    this.fallbackView.patchChildren(this.fallbackChildren());
  }

  private showFallback(): void {
    this.renderFallback();
  }

  private hideFallback(): void {
    this.renderFallback();
  }

  private focused: Element | undefined;

  private detachSource(): void {
    if (this.detached) return;
    const documentRef = this.parent.ownerDocument;
    const active = documentRef?.activeElement ?? null;
    if (active && this.sourceContains(active)) {
      this.focused = active;
    }
    this.detached = detachRange(
      this.context.renderer,
      this.sourceView.firstNode(),
      this.sourceView.lastNode(),
    );
  }

  private sourceContains(node: Node): boolean {
    let current: Node | null = this.sourceView.firstNode();
    const end = this.sourceView.lastNode();
    while (current) {
      if (current === node) return true;
      if (current instanceof Element && current.contains(node)) return true;
      if (current === end) break;
      current = current.nextSibling;
    }
    return false;
  }

  private restoreSource(): void {
    if (!this.detached) return;

    // Back before the marker that follows the source range, so the original
    // order (fallback / source) is preserved.
    const anchor =
      this.position === 'before' ? this.end : this.fallbackView.firstNode();
    reattachRange(this.context.renderer, this.detached, anchor, this.parent);
    this.detached = undefined;
    if (
      this.focused &&
      'focus' in this.focused &&
      typeof (this.focused as HTMLElement).focus === 'function'
    ) {
      (this.focused as HTMLElement).focus();
    }
    this.focused = undefined;
  }
}

class FieldExceptionBlockRenderedNode implements RenderedNode {
  readonly kind = 'field-exception-block';
  private readonly boundaryId = nextFieldExceptionBoundaryId++;
  private readonly descriptor;
  private readonly sourcesVersion = signal(0);
  private readonly sources = new Set<RegisteredFieldExceptionSource>();
  private readonly componentSourceCleanups: Array<() => void>;
  private readonly view: FragmentRenderedNode;
  private readonly effectRef: EffectRef;

  constructor(
    private node: FieldExceptionBlockNode<any, any, any, any>,
    parent: NativeParent,
    before: NativeNode | null,
    private readonly context: RenderContext,
  ) {
    this.descriptor = signal(node);
    this.view = createFragment(
      parent,
      before,
      this.boundaryContext(),
      [node.source],
      'craft-field-exception-block',
    );
    this.componentSourceCleanups = componentFieldExceptionSources(
      context.componentContext,
    ).map((source) => this.register(source));
    this.effectRef = createRenderEffect(
      context,
      'field-exception-block',
      () => {
        this.node = this.descriptor();
        this.sourcesVersion();
        const fallbacks = this.renderFallbacks();
        this.view.patchChildren(
          this.node.options.position === 'before'
            ? [fallbacks, this.node.source]
            : [this.node.source, fallbacks],
        );
      },
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'field-exception-block') return false;
    this.descriptor.set(node);
    return true;
  }

  private boundaryContext(): RenderContext {
    return childContext(this.context, {
      fieldExceptionBoundary: {
        register: (source, element) => this.register(source, element),
      },
    });
  }

  private register(
    source: CraftFieldExceptionSource,
    element?: Element,
  ): () => void {
    const rawSource = rawReactiveFacade(source);
    const unregisterParent = this.context.fieldExceptionBoundary?.register(
      rawSource,
      element,
    );
    const registered: RegisteredFieldExceptionSource = {
      source: rawSource,
      element,
      messageIds: new Map(),
    };
    if (element) {
      this.accessibilityState(element).registrations.add(this.boundaryId);
    }
    this.sources.add(registered);
    untracked(() => this.sourcesVersion.update((value) => value + 1));
    return () => {
      this.releaseAccessibility(registered);
      this.sources.delete(registered);
      untracked(() => this.sourcesVersion.update((value) => value + 1));
      unregisterParent?.();
    };
  }

  private orderedSources(): RegisteredFieldExceptionSource[] {
    const ordered = [...this.sources].sort((left, right) => {
      if (!left.element) return 1;
      if (!right.element) return -1;
      if (left.element === right.element) return 0;
      const relation = left.element.compareDocumentPosition(right.element);
      return relation & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */ ? -1 : 1;
    });
    const seen = new Set<CraftFieldExceptionSource>();
    return ordered.filter(({ source }) => {
      if (seen.has(source)) return false;
      seen.add(source);
      return true;
    });
  }

  private activeExceptions(
    source: CraftFieldExceptionSource,
  ): readonly AnyCraftException[] {
    const visibility = this.node.options.visibility ?? 'visibleExceptions';
    if (visibility === 'visibleExceptions') {
      if (this.node.options.mode === 'first') {
        const first = source.visibleFirstLeftFailedValidation();
        if (first && this.handles(source, first)) return [first];
        return source
          .visibleExceptions()
          .list.filter((exception) => this.handles(source, exception))
          .slice(0, 1);
      }
      return source.visibleExceptions().list;
    }

    if (
      !fieldExceptionVisibilityMatches(visibility, {
        field: source.field,
        hasAttemptedSubmit: source.hasAttemptedSubmit,
      })
    ) {
      return [];
    }
    if (this.node.options.mode === 'first') {
      const first = source.firstLeftFailedValidation();
      if (first && this.handles(source, first)) return [first];
      return source
        .exceptions()
        .list.filter((exception) => this.handles(source, exception))
        .slice(0, 1);
    }
    return source.exceptions().list;
  }

  private handles(
    source: CraftFieldExceptionSource,
    exception: AnyCraftException,
  ): boolean {
    return Boolean(
      fieldExceptionHandler(this.node.handlers, source.path, exception.code),
    );
  }

  private renderFallbacks(): CraftNodeChildren {
    const children: CraftNodeChildren[] = [];
    for (const registered of this.orderedSources()) {
      const { source } = registered;
      const activeMessageIds: string[] = [];
      const exceptions = this.activeExceptions(source);
      exceptions.forEach((exception, index) => {
        const handler = fieldExceptionHandler(
          this.node.handlers,
          source.path,
          exception.code,
        );
        if (!handler) return;
        const validatorName = fieldExceptionValidatorName(source, exception);
        const messageKey = `${validatorName}:${exception.code}:${index}`;
        let id = registered.messageIds.get(messageKey);
        if (!id) {
          id = `craft-field-exception-${this.boundaryId}-${registered.messageIds.size}`;
          registered.messageIds.set(messageKey, id);
        }
        activeMessageIds.push(id);
        children.push(
          fieldExceptionMessageNode(
            id,
            handler({
              field: source.field,
              path: source.path,
              runtimePath: source.runtimePath,
              validatorName,
              exception,
            }),
          ),
        );
      });
      this.applyAccessibility(registered, activeMessageIds);
    }
    return children;
  }

  private applyAccessibility(
    registered: RegisteredFieldExceptionSource,
    messageIds: readonly string[],
  ): void {
    if (!registered.element) return;
    if (messageIds.length) {
      this.accessibilityState(registered.element).messagesByBoundary.set(
        this.boundaryId,
        messageIds,
      );
    } else {
      this.accessibilityState(registered.element).messagesByBoundary.delete(
        this.boundaryId,
      );
    }
    this.reconcileAccessibility(registered.element);
  }

  private accessibilityState(
    element: Element,
  ): FieldExceptionAccessibilityState {
    const existing = fieldExceptionAccessibility.get(element);
    if (existing) return existing;
    const created: FieldExceptionAccessibilityState = {
      originalAriaInvalid: element.getAttribute('aria-invalid'),
      originalAriaDescribedBy: element.getAttribute('aria-describedby'),
      registrations: new Set(),
      messagesByBoundary: new Map(),
    };
    fieldExceptionAccessibility.set(element, created);
    return created;
  }

  private reconcileAccessibility(element: Element): void {
    const state = this.accessibilityState(element);
    const renderer = this.context.renderer;
    const messageIds = [...state.messagesByBoundary.values()].flat();
    if (messageIds.length) {
      renderer.setAttribute(element, 'aria-invalid', 'true');
    } else {
      if (state.originalAriaInvalid === null) {
        renderer.removeAttribute(element, 'aria-invalid');
      } else {
        renderer.setAttribute(
          element,
          'aria-invalid',
          state.originalAriaInvalid,
        );
      }
    }

    const describedBy = [
      ...(state.originalAriaDescribedBy?.split(/\s+/).filter(Boolean) ?? []),
      ...messageIds,
    ];
    if (describedBy.length) {
      renderer.setAttribute(
        element,
        'aria-describedby',
        [...new Set(describedBy)].join(' '),
      );
    } else {
      renderer.removeAttribute(element, 'aria-describedby');
    }
  }

  private releaseAccessibility(
    registered: RegisteredFieldExceptionSource,
  ): void {
    if (!registered.element) return;
    const state = this.accessibilityState(registered.element);
    state.messagesByBoundary.delete(this.boundaryId);
    state.registrations.delete(this.boundaryId);
    this.reconcileAccessibility(registered.element);
    if (!state.registrations.size) {
      fieldExceptionAccessibility.delete(registered.element);
    }
  }

  destroy(): void {
    this.effectRef.destroy();
    this.componentSourceCleanups.forEach((cleanup) => cleanup());
    this.view.destroy();
    this.sources.forEach((source) => this.releaseAccessibility(source));
    this.sources.clear();
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
      angularMountContext(context),
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
    injector.get(
      COMPONENT_REGISTER as unknown as ProviderToken<ComponentRegister>,
      null,
    ) ?? ɵfallbackComponentRegister;
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
  private syncTemplateFlushRelease: (() => void) | undefined;
  private componentFallbackVisible = false;
  private componentFallbackException: AnyCraftException | undefined;
  private readonly styleReleases: (() => void)[];
  private providerTrackers: readonly (() => unknown)[] = [];
  private readonly templateOnly: boolean;
  private readonly traceState: TemplateTraceState;
  private readonly componentRenderContext: RenderContext;
  private traceCreated = false;
  private factoryContext: unknown;
  private latestTemplate: CraftNodeChildren = [];
  private registrationReleases: (() => void)[] = [];
  private readonly hostBindings: HostPropertyBindings | undefined;

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
    this.traceState = { renderCount: 0 };
    this.styleReleases = acquireStyles(
      context,
      definition.styleOwners,
      ownScope,
    );
    const componentRenderContext = childContext(context, {
      ownerScope: ownScope,
      rootScope: scopeTokens(context.rootScope, ownScope),
      componentName: definition.name,
      contentStyles: definition.meta.contentStyles,
      contentScope: undefined,
      declarationContext: declarationContext ?? context,
      directiveNames: definition.styleOwners
        .slice(1)
        .map((owner) => owner.name),
      traceState: this.traceState,
    });
    this.componentRenderContext = componentRenderContext;
    this.hostBindings = hostTarget
      ? new HostPropertyBindings(hostTarget, context)
      : undefined;
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
          ...provideHostName(`component:${definition.name}`),
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
      this.traceCreated = true;
      traceComponentLifecycle(
        this.environmentInjector,
        'create',
        definition.name,
        this.traceState.renderCount,
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
      const input = markYieldableMethod((...callbackArgs: unknown[]) => {
        const current = source();
        if (callbackArgs.length > 0 && typeof current === 'function') {
          return (current as (...args: unknown[]) => unknown)(...callbackArgs);
        }
        const value =
          typeof current === 'function'
            ? (current as () => unknown)()
            : current;

        return isGenerator(value)
          ? value
          : yieldableInvocation<unknown, unknown>(value);
      });

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
                  ...new Set([...Reflect.ownKeys(target), ...this.propKeys]),
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
                    const callSiteHostProps = this.hostPropsSource();
                    const hostProps = mergeHostProps(
                      definition.meta.host ?? {},
                      callSiteHostProps,
                    );
                    const renderContext = childContext(componentRenderContext, {
                      injector: this.environmentInjector!,
                      componentContext: this.factoryContext,
                    });
                    this.traceState.renderCount += 1;
                    this.latestTemplate = executeTemplateTrace(
                      renderContext.injector,
                      traceContext(
                        renderContext,
                        'component',
                        this.traceState.renderCount === 1
                          ? 'initialRender'
                          : 'update',
                        definition.name,
                      ),
                      () =>
                        withCraftRenderContext(renderContext, () =>
                          definition.template(
                            projectYieldableTemplateContext(
                              this.factoryContext,
                            ) as never,
                            callSiteHostProps,
                          ),
                        ),
                    );
                    this.view.patchChildren(this.latestTemplate);
                    this.hostBindings?.patch(hostProps);
                    context.exceptionBoundaryResolved?.();
                  } catch (error) {
                    if (
                      isCraftGenShortCircuit(error) &&
                      context.exceptionBoundary?.(error.exception)
                    ) {
                      this.view.patchChildren([]);
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
        ...provideHostName(`component:${definition.name}`),
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

    if (!this.traceCreated) {
      this.traceCreated = true;
      traceComponentLifecycle(
        this.environmentInjector,
        'create',
        definition.name,
        this.traceState.renderCount,
      );
    }

    const environmentInjector = this.environmentInjector;
    let renderInjector = environmentInjector;
    onCleanup(() => {
      this.registrationReleases.forEach((release) => release());
      this.registrationReleases = [];
      this.composedTemplateEffect?.destroy();
      this.composedTemplateEffect = undefined;
      this.syncTemplateFlushRelease?.();
      this.syncTemplateFlushRelease = undefined;
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
          if (
            composition.catchBlockPosition &&
            !this.componentExceptionEffect
          ) {
            this.installComponentExceptionEffect(
              definition,
              factoryContext,
              renderInjector,
              renderContext,
              context,
              hostTarget,
            );
          }
        }),
      ),
    );
    this.syncTemplateFlushRelease?.();
    this.syncTemplateFlushRelease = registerCraftSyncTemplateFlush(() => {
      this.renderComposedTemplate(
        definition,
        factoryContext,
        renderInjector,
        renderContext,
        context,
        hostTarget,
      );
    });
  }

  private installComponentExceptionEffect(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    factoryContext: unknown,
    renderInjector: EnvironmentInjector,
    renderContext: RenderContext,
    context: RenderContext,
    hostTarget: Element | undefined,
  ): void {
    this.componentExceptionEffect = untracked(() =>
      runInInjectionContext(renderInjector, () =>
        craftEffect(
          'component-catch-block-resource-exceptions',
          () => {
            const exception = findResourceException(factoryContext);
            if (exception) {
              if (
                renderContext.handledResourceExceptionCodes?.has(exception.code)
              ) {
                if (this.componentFallbackVisible) {
                  this.componentFallbackVisible = false;
                  this.componentFallbackException = undefined;
                  untracked(() =>
                    this.renderComposedTemplate(
                      definition,
                      factoryContext,
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
                  factoryContext,
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
      this.traceState.renderCount += 1;
      const rendered = this.composedTemplateChildren(
        definition,
        factoryContext,
        renderContext,
      );
      const children = this.withComponentFieldExceptionBlock(
        definition,
        rendered.children,
      );
      this.latestTemplate = children;
      this.view.patchChildren(children);
      this.hostBindings?.patch(rendered.hostProps);
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
    const callSiteHostProps = this.hostPropsSource();
    const hostProps = mergeHostProps(
      definition.meta.host ?? {},
      callSiteHostProps,
    );
    return {
      children: executeTemplateTrace(
        renderContext.injector,
        traceContext(
          renderContext,
          'component',
          this.traceState.renderCount === 1 ? 'initialRender' : 'update',
          definition.name,
        ),
        () =>
          withCraftRenderContext(renderContext, () =>
            definition.template(
              projectYieldableTemplateContext(factoryContext) as never,
              callSiteHostProps,
            ),
          ),
      ),
      hostProps,
    };
  }

  private withComponentFieldExceptionBlock(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    children: CraftNodeChildren,
  ): CraftNodeChildren {
    const handlers = definition.composition?.fieldExceptionHandlers;
    const options = definition.composition?.fieldExceptionOptions;
    if (!handlers || !options) return children;
    return {
      kind: 'field-exception-block',
      source: children,
      handlers,
      options,
    } as FieldExceptionBlockNode<any, any, any, any>;
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
              ? [
                  resolved.children,
                  this.withComponentFieldExceptionBlock(
                    definition,
                    source.children,
                  ),
                ]
              : [
                  this.withComponentFieldExceptionBlock(
                    definition,
                    source.children,
                  ),
                  resolved.children,
                ];
          this.view.patchChildren(children);
          this.hostBindings?.patch(source.hostProps);
        } catch (error) {
          if (!isCraftGenShortCircuit(error)) throw error;
          this.view.patchChildren(resolved.children);
        }
      } else {
        this.view.patchChildren(resolved.children);
      }
    }
    this.hostBindings?.patch(hostProps);
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (
      node.kind !== 'component' ||
      node.component !== this.component ||
      (node.injector !== undefined && node.injector !== this.context.injector)
    ) {
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
    const callSiteHostProps = this.hostPropsSource();
    const hostProps = mergeHostProps(
      definition.meta.host ?? {},
      callSiteHostProps,
    );
    this.traceState.renderCount += 1;
    this.latestTemplate = executeTemplateTrace(
      this.environmentInjector ?? this.context.injector,
      traceContext(
        this.componentRenderContext,
        'component',
        this.traceState.renderCount === 1 ? 'initialRender' : 'update',
        definition.name,
      ),
      () =>
        definition.template(
          projectYieldableTemplateContext(context) as never,
          callSiteHostProps,
        ),
    );
    this.view.patchChildren(this.latestTemplate);
    this.hostBindings?.patch(hostProps);
  }

  locator(
    host: Element,
    tag: string,
    criteria: RuntimeLocatorCriteria,
  ): Element | undefined {
    return findCraftTemplateLocator(host, this.latestTemplate, tag, criteria);
  }

  destroy(): void {
    if (this.traceCreated) {
      traceComponentLifecycle(
        this.environmentInjector ?? this.context.injector,
        'destroy',
        this.componentRenderContext.componentName ?? 'unknown',
        this.traceState.renderCount,
      );
      this.traceCreated = false;
    }
    this.effectRef.destroy();
    this.hostBindings?.destroy();
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
  private triggerTimer: TemporalTaskHandle | undefined;
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
      node.placeholder
        ? renderDeferChildren(context, 'placeholder', node.placeholder)
        : [],
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
        renderDeferChildren(this.context, 'resolve', this.node.resolve, [
          this.loadedValue,
        ]),
      );
    } else if (this.state === 'error') {
      this.view.patchChildren(
        this.node.error
          ? renderDeferChildren(this.context, 'error', this.node.error, [
              this.loadError,
            ])
          : [],
      );
    } else if (this.state === 'loading') {
      this.view.patchChildren(
        this.node.loading
          ? renderDeferChildren(this.context, 'loading', this.node.loading)
          : this.node.placeholder
            ? renderDeferChildren(
                this.context,
                'placeholder',
                this.node.placeholder,
              )
            : [],
      );
    } else {
      this.view.patchChildren(
        this.node.placeholder
          ? renderDeferChildren(
              this.context,
              'placeholder',
              this.node.placeholder,
            )
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
        this.triggerTimer = this.context.injector
          .get(CRAFT_TEMPORAL_RUNTIME, new RealCraftTemporalRuntime())
          .schedule(() => this.startLoad(), 0, {
            kind: 'defer-trigger',
            owner: this.context.componentName,
          });
        this.triggerCleanup = () => this.triggerTimer?.cancel();
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
      const start = (event?: Event) => {
        if (event && event.type === 'keydown') {
          const key = (event as KeyboardEvent).key;
          if (key !== 'Enter' && key !== ' ') return;
          event.preventDefault();
        }
        this.startLoad();
      };
      if (target instanceof Element) {
        const tag = target.tagName.toLowerCase();
        const interactive =
          tag === 'button' ||
          tag === 'a' ||
          tag === 'input' ||
          tag === 'select' ||
          tag === 'textarea';
        if (!interactive) {
          if (!target.hasAttribute('tabindex')) {
            this.context.renderer.setAttribute(target, 'tabindex', '0');
          }
          if (!target.getAttribute('role')) {
            this.context.renderer.setAttribute(target, 'role', 'button');
          }
        }
      }
      const clickCleanup = this.context.renderer.listen(target, 'click', start);
      const keyCleanup = this.context.renderer.listen(target, 'keydown', start);
      this.triggerCleanup = () => {
        clickCleanup();
        keyCleanup();
      };
      return;
    }

    this.triggerTimer = this.context.injector
      .get(CRAFT_TEMPORAL_RUNTIME, new RealCraftTemporalRuntime())
      .schedule(() => this.startLoad(), 0, {
        kind: 'defer-trigger',
        owner: this.context.componentName,
      });
    this.triggerCleanup = () => this.triggerTimer?.cancel();
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

  private setBusy(busy: boolean): void {
    const target = this.firstElementInView();
    if (!target) return;
    if (busy) {
      this.context.renderer.setAttribute(target, 'aria-busy', 'true');
    } else {
      this.context.renderer.removeAttribute(target, 'aria-busy');
    }
  }

  private startLoad(): void {
    if (this.state !== 'placeholder' || this.destroyed) {
      return;
    }
    this.state = 'loading';
    this.triggerCleanup?.();
    this.triggerCleanup = undefined;
    this.setBusy(true);
    this.view.patchChildren(
      this.node.loading
        ? renderDeferChildren(this.context, 'loading', this.node.loading)
        : this.node.placeholder
          ? renderDeferChildren(
              this.context,
              'placeholder',
              this.node.placeholder,
            )
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
              ? renderDeferChildren(this.context, 'error', this.node.error, [
                  settled.exception,
                ])
              : [],
          );
          this.setBusy(false);
          return;
        }

        this.state = 'loaded';
        this.loadedValue = settled.value;
        this.view.patchChildren(
          renderDeferChildren(this.context, 'resolve', this.node.resolve, [
            settled.value,
          ]),
        );
        this.setBusy(false);
      })
      .catch((error: unknown) => {
        if (!this.destroyed) {
          this.state = 'error';
          this.loadError = error;
          this.view.patchChildren(
            this.node.error
              ? renderDeferChildren(this.context, 'error', this.node.error, [
                  error,
                ])
              : [],
          );
          this.setBusy(false);
        }
      });
  }

  destroy(): void {
    this.destroyed = true;
    this.triggerCleanup?.();
    this.view.destroy();
  }
}

class HeadingSectionRenderedNode implements RenderedNode {
  readonly kind = 'heading-section';
  private readonly view: FragmentRenderedNode;

  constructor(
    node: HeadingSectionNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    const level = node.reset ? 1 : Math.min(6, (context.headingLevel ?? 1) + 1);
    this.view = createFragment(
      parent,
      before,
      childContext(context, { headingLevel: level }),
      node.children,
      'craft-heading-section',
    );
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'heading-section') return false;
    this.view.patchChildren(node.children);
    return true;
  }

  destroy(): void {
    this.view.destroy();
  }
}

class HeadingRenderedNode implements RenderedNode {
  readonly kind = 'heading';
  private readonly elementView: ElementRenderedNode;
  private readonly tag: string;

  constructor(
    node: HeadingNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    const level = Math.min(6, Math.max(1, context.headingLevel ?? 1));
    this.tag = `h${level}`;
    const element = context.renderer.createElement(this.tag) as Element;
    insertBefore(context.renderer, parent, element, before);
    this.elementView = new ElementRenderedNode(element, this.tag, context, {
      kind: 'element',
      tag: this.tag,
      props: node.props,
      children: node.children,
    });
  }

  firstNode(): NativeNode {
    return this.elementView.firstNode();
  }

  lastNode(): NativeNode {
    return this.elementView.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'heading') return false;
    return this.elementView.patch({
      kind: 'element',
      tag: this.tag,
      props: node.props,
      children: node.children,
    } as ElementNodeBase);
  }

  destroy(): void {
    this.elementView.destroy();
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
    case 'reactive-text': {
      const text = context.renderer.createText('') as Text;
      insertBefore(context.renderer, parent, text, before);
      return new ReactiveTextRenderedNode(text, node.binding, context);
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
        node.injector
          ? childContext(context, { injector: node.injector })
          : context,
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
      const start = createComment(parent, 'craft-each:start');
      const end = createComment(parent, 'craft-each:end');
      insertBefore(context.renderer, parent, start, before);
      insertBefore(context.renderer, parent, end, before);
      return new EachRenderedNode(node, parent, start, end, context);
    }
    case 'if': {
      return new IfBlockRenderedNode(node, parent, before, context);
    }
    case 'heading': {
      return new HeadingRenderedNode(node, parent, before, context);
    }
    case 'heading-section': {
      return new HeadingSectionRenderedNode(node, parent, before, context);
    }
    case 'pending-block': {
      return new PendingBlockRenderedNode(node, parent, before, context);
    }
    case 'catch-block': {
      return new CatchBlockRenderedNode(node, parent, before, context);
    }
    case 'field-exception-block': {
      return new FieldExceptionBlockRenderedNode(node, parent, before, context);
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

class HostPropertyBindings {
  private props: Readonly<Record<string, unknown>> = {};
  private readonly bindings = new Map<
    string,
    { readonly source: unknown; readonly effectRef: EffectRef }
  >();

  constructor(
    private readonly host: Element,
    private readonly context: RenderContext,
  ) {}

  patch(next: Readonly<Record<string, unknown>>): void {
    const renderer = this.context.renderer;
    const previousAttributes = flattenAttributes(this.props);
    const nextAttributes = flattenAttributes(next);

    for (const key of previousAttributes.keys()) {
      if (!nextAttributes.has(key)) {
        this.destroyBinding(`attribute:${key}`);
        applyAttribute(renderer, this.host, key, null, this.context);
      }
    }
    for (const [key, value] of nextAttributes) {
      if (typeof value === 'function') {
        this.updateBinding(
          `attribute:${key}`,
          value,
          () => resolveTemplateValue(value, this.context),
          (resolved) =>
            applyAttribute(renderer, this.host, key, resolved, this.context),
        );
      } else {
        this.destroyBinding(`attribute:${key}`);
        if (
          !Object.is(previousAttributes.get(key), value) ||
          typeof previousAttributes.get(key) === 'function'
        ) {
          applyAttribute(renderer, this.host, key, value, this.context);
        }
      }
    }

    if (containsRenderBinding(next['class'])) {
      this.updateBinding(
        'class',
        next['class'],
        () => className(next['class'], this.context),
        (value) => {
          if (value) {
            renderer.setAttribute(this.host, 'class', String(value));
          } else {
            renderer.removeAttribute(this.host, 'class');
          }
        },
      );
    } else {
      this.destroyBinding('class');
      if (
        !Object.is(this.props['class'], next['class']) ||
        containsRenderBinding(this.props['class'])
      ) {
        const value = className(next['class'], this.context);
        if (value) {
          renderer.setAttribute(this.host, 'class', value);
        } else {
          renderer.removeAttribute(this.host, 'class');
        }
      }
    }

    if (containsRenderBinding(next['style'])) {
      this.updateBinding(
        'style',
        next['style'],
        () => resolveStyleBindingValue(next['style'], this.context),
        (value) => {
          renderer.removeAttribute(this.host, 'style');
          applyStyles(renderer, this.host, undefined, value, this.context);
        },
        sameStyleValue,
      );
    } else {
      this.destroyBinding('style');
      if (
        !Object.is(this.props['style'], next['style']) ||
        containsRenderBinding(this.props['style'])
      ) {
        if (containsRenderBinding(this.props['style'])) {
          renderer.removeAttribute(this.host, 'style');
        }
        applyStyles(
          renderer,
          this.host,
          containsRenderBinding(this.props['style'])
            ? undefined
            : this.props['style'],
          next['style'],
          this.context,
        );
      }
    }

    this.props = next;
  }

  destroy(): void {
    this.bindings.forEach(({ effectRef }) => effectRef.destroy());
    this.bindings.clear();
  }

  private updateBinding(
    key: string,
    source: unknown,
    evaluate: () => unknown,
    apply: (value: unknown) => void,
    equals: (left: unknown, right: unknown) => boolean = Object.is,
  ): void {
    const current = this.bindings.get(key);
    if (current?.source === source) return;
    current?.effectRef.destroy();

    let initialized = false;
    let previous: unknown;
    const effectRef = createRenderEffect(
      this.context,
      `host-${key}-binding`,
      () => {
        const value = evaluate();
        if (!initialized || !equals(previous, value)) {
          apply(value);
          previous = value;
          initialized = true;
        }
      },
    );
    this.bindings.set(key, { source, effectRef });
  }

  private destroyBinding(key: string): void {
    this.bindings.get(key)?.effectRef.destroy();
    this.bindings.delete(key);
  }
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
  const renderer = createBrowserDomAdapter(host.ownerDocument);
  const rootNode = host.getRootNode();
  const styleRoot: Document | ShadowRoot =
    (typeof Document !== 'undefined' && rootNode instanceof Document) ||
    (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot)
      ? (rootNode as Document | ShadowRoot)
      : (host.ownerDocument ?? document);
  const styles = injector.get(
    CRAFT_STYLE_REGISTRY as unknown as ProviderToken<CraftStyleRegistry>,
    ɵfallbackCraftStyleRegistry,
  );
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
  const renderer = createBrowserDomAdapter(host.ownerDocument);
  const rootNode = host.getRootNode();
  const styleRoot: Document | ShadowRoot =
    (typeof Document !== 'undefined' && rootNode instanceof Document) ||
    (typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot)
      ? (rootNode as Document | ShadowRoot)
      : (host.ownerDocument ?? document);
  const styles = injector.get(
    CRAFT_STYLE_REGISTRY as unknown as ProviderToken<CraftStyleRegistry>,
    ɵfallbackCraftStyleRegistry,
  );
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
