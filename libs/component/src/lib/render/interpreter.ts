import { ɵrunCraftCleanups, ɵdestroyCraftOwner, ɵbeginCraftOwnerDestruction } from '@craft-ts/core';
import { ɵIDENTITY_FN_ADAPTER, ɵREACTIVE_READ_OBSERVERS, ɵinjectTemplateTraces } from '@craft-ts/core';
import { createCompiledNodes, compiledItemComponent, compiledTemplateFor, type CompiledTemplatePlan } from './compiled-template';
import {
  CRAFT_SERVICE_PROVIDER_BRAND,
  SERVICE_RUNTIME_OVERRIDES,
  ɵinjectCraftDomEventHooks,
  CRAFT_NODE_DIRECTIVE,
  provideCraftNodeEffectFactory,
  provideCraftFieldExceptionBoundary,
  CRAFT_FIELD_EXCEPTION_SOURCE,
  ɵcraftEffectRef,
  ɵCraftRenderEffect,
  ɵeffectOwnerTags,
  ɵeffectRegistry,
  injectFnWrapper,
  isCraftDevelopment,
  type AppSnapshotRegistry,
  type FnFactoryAdapter,
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
  isDeepYieldable,
  isGenerator,
  deepYieldable,
  markYieldableValue,
  YIELDABLE_METHOD,
  ɵsettledReader,
  ɵsettledValueReader,
  ɵcraftTargetWrappers,
  type CraftTargetWrapper,
  isYieldableValue,
  isYieldableMethod,
  isYieldableReactiveValue,
  provideHostName,
  rawReactiveFacade,
  rawReactiveValue,
  toYieldable,
  yieldableInvocation,
  ɵfallbackComponentRegister,
  ɵinjectComponentRegister,
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
  ɵinjectCraftTemporalRuntime,
  provideCraftRenderIdentity,
  ɵprovideCraftRenderIdentityReading,
  ɵcreatePreparedEnvironmentInjector,
  ɵprepareEnvironmentProviders,
  ɵinjectorInstance,
  ɵchildCraftRenderIdentity,
  createCraftRenderIdentity,
  type CraftRenderIdentity,
  ɵcreateCraftReplayTargetTree,
  ɵlinkCraftReplayTarget,
  ɵunlinkCraftReplayTarget,
  type ɵCraftReplayTargetRecord,
  type ɵCraftReplayTargetTree,
  ɵregisterCraftDeferReplayTarget,
  ɵcaptureCraftReplayTarget,
  ɵinjectSendContextSession,
  ɵinjectCorrelationIdService,
  isCraftReplaying,
  ɵinjectCraftSsrPolicy,
  ɵinjectCraftSecurityPolicy,
  ɵinjectCraftMatch,
  ɵinjectCraftChildMatch,
  ɵrunInInjectionContext,
  ɵisCraftDevMode,
  ɵcraftBatch,
  craftUse,
  ɵcurrentCorrelationId,
  ɵcraftPrivateCell,
  type ɵCraftPrivateCell,
} from '@craft-ts/core';
import {
  executeCraftComponentFactory,
  renderCraftComponentTemplate,
  ɵasGeneratorTemplate,
} from '../factory-runtime';
import {
  computed,
  createEnvironmentInjector,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
  type EffectRef,
  type Provider,
} from '../host-runtime';
import type { HostProps } from '../hyperscript';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  CONTENT_DECLARATION_CONTEXT,
  type CraftComponent,
  type InputValue,
} from '../types';
import {
  normalizeChildren,
  mergeHostProps,
  type AppliedCraftNodeDirective,
  type CraftDirectiveNode,
  type CraftNode,
  type CraftNodeChildren,
  type CraftTextBinding,
  type DeferNode,
  type ForNode,
  type IfNode,
  type HeadingNode,
  type HeadingSectionNode,
  type ElementNodeBase,
  type CatchNode,
  type MatchNode,
  type ProjectionNode,
  type TemplateNode,
  type FieldErrorNode,
  type PendingNode,
  withCraftRenderContext,
  CRAFT_NODE_DIRECTIVES,
} from './vnode';
import {
  CraftUnhandledPendingError,
  resolvePendingHandler,
  type PendingHandler,
  type PendingPosition,
} from '../pending-node';
import {
  CraftUnhandledExceptionError,
  resolveCatchHandler,
  type CatchPosition,
} from '../catch-node';
import type {
  FieldExceptionHandler,
  FieldExceptionHandlers,
} from '../field-error-node';
import {
  ɵinjectForSchedulerIn,
  createForScheduler,
  SyncForScheduler,
  type CancelHandle,
  type ForSchedulePolicy,
  type ForScheduler,
} from '../for-scheduling';
import { executeCraftComponentFactoryAsync } from '../factory-runtime';
import {
  isCraftMultiUrlAttribute,
  isCraftResourceUrlAttribute,
  isCraftSafeHtml,
  isCraftUnsafeHtml,
  isCraftUrlAttribute,
  safeResourceUrl,
  safeUrl,
  safeUrlList,
  CraftDomSecurityError,
} from '../security';
import { scopeIdFor } from './scope-id';
import {
  CRAFT_LOCATOR_CONTENT_NAMES,
  directCraftContentNames,
  findCraftTemplateLocator,
  type RuntimeLocatorCriteria,
} from '../locator';
import { HydrationMismatchError, type HydrationCursor } from './hydration';
import { setNodeHydrationKey } from './hydration-metadata';
import type { CraftSsrCoordinator } from './ssr-coordinator';

type NativeNode = Node;
type NativeParent = Node;

interface RenderContext {
  readonly renderer: CraftDomAdapter;
  readonly injector: Injector;
  readonly componentContext?: unknown;
  readonly componentName?: string;
  readonly ownerScope?: string;
  readonly rootScope?: string;
  /**
   * Reports an exception to the nearest `catchNode`. `token` identifies the
   * reporter: the boundary keeps its fallback up until every reporter has
   * either recovered or been destroyed, so a re-render between the failure and
   * the recovery cannot strand it.
   */
  readonly exceptionBoundary?: (
    exception: AnyCraftException,
    token?: object,
  ) => boolean;
  readonly exceptionBoundaryResolved?: (token?: object) => void;
  /** Nearest `pendingNode` boundary, notified by any binding that suspends. */
  readonly pendingBoundary?: PendingBoundaryRegistration;
  /** Nearest `pendingNode` boundary, notified by every settled read below it. */
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
  readonly mode: 'create' | 'hydrate';
  readonly identity: CraftRenderIdentity;
  /** False when the current repeated item is addressed by its position. */
  readonly replayTargetStable?: boolean;
  readonly hydration?: HydrationCursor;
  readonly emitHydrationKeys?: boolean;
  readonly ssr?: CraftSsrCoordinator;
  /** Replay targets of the render tree this context belongs to. */
  readonly replayTargets?: ɵCraftReplayTargetTree;
  /** What the renderer resolved once for `injector`; see {@link ambientOf}. */
  readonly ambient?: RenderAmbient;
}

/**
 * What the renderer asks an injector again and again — at every effect, every
 * binding, every template — and that only depends on the injector: the effect
 * registry, the tags its effects report, the runtime mode and the function
 * wrappers. Each is resolved the first time it is needed, in the order the
 * renderer needed it before, then kept for every context of that injector.
 *
 * A component that declares no provider cannot change the registry, the mode
 * or the wrappers: its ambient reads them from the ambient of its parent.
 */
class RenderAmbient {
  private resolvedRegistry: AppSnapshotRegistry | null | undefined = undefined;
  private resolvedOwnerTags: readonly string[] | undefined = undefined;
  private resolvedDevelopment: boolean | undefined = undefined;
  private resolvedFnAdapter: FnFactoryAdapter | undefined = undefined;
  private resolvedCompilationAllowed: boolean | undefined = undefined;
  private resolvedTargetWrappers: readonly CraftTargetWrapper[] | undefined =
    undefined;
  readonly injector: Injector;
  private readonly inherited: RenderAmbient | undefined;

  constructor(injector: Injector, inherited: RenderAmbient | undefined) {
    this.injector = injector;
    this.inherited = inherited;
  }

  get compilationAllowed(): boolean {
    return (this.resolvedCompilationAllowed ??= this.inherited
      ? this.inherited.compilationAllowed
      : !this.development &&
        this.fnAdapter === ɵIDENTITY_FN_ADAPTER &&
        this.targetWrappers.length === 0 &&
        this.injector.get(ɵREACTIVE_READ_OBSERVERS, NO_COMPILED_OBSERVERS)
          .length === 0 &&
        ɵinjectTemplateTraces(this.injector).length === 0);
  }

  get registry(): AppSnapshotRegistry | null {
    if (this.resolvedRegistry !== undefined) return this.resolvedRegistry;
    return (this.resolvedRegistry = this.inherited
      ? this.inherited.registry
      : ɵeffectRegistry(this.injector));
  }

  get ownerTags(): readonly string[] {
    return (this.resolvedOwnerTags ??= ɵeffectOwnerTags(this.injector));
  }

  get development(): boolean {
    if (this.resolvedDevelopment !== undefined) return this.resolvedDevelopment;
    return (this.resolvedDevelopment = this.inherited
      ? this.inherited.development
      : isCraftDevelopment(this.injector));
  }

  /**
   * Owner tags the renderer already read for this injector: the tag list of a
   * component's own injector is what its effects report before their own.
   */
  seedOwnerTags(tags: readonly string[]): void {
    this.resolvedOwnerTags ??= tags;
  }

  get targetWrappers(): readonly CraftTargetWrapper[] {
    if (this.resolvedTargetWrappers !== undefined) {
      return this.resolvedTargetWrappers;
    }
    return (this.resolvedTargetWrappers = this.inherited
      ? this.inherited.targetWrappers
      : ɵcraftTargetWrappers(this.injector));
  }

  get fnAdapter(): FnFactoryAdapter {
    if (this.resolvedFnAdapter !== undefined) return this.resolvedFnAdapter;
    return (this.resolvedFnAdapter = this.inherited
      ? this.inherited.fnAdapter
      : runInInjectionContext(this.injector, injectFnWrapper));
  }
}

/** The ambient of the context's injector, created when first asked for. */
function ambientOf(context: RenderContext): RenderAmbient {
  const environment = stateOf(context).environment;
  const current = environment.ambient;
  if (current !== undefined && current.injector === environment.injector) {
    return current;
  }
  const ambient = new RenderAmbient(environment.injector, undefined);
  environment.ambient = ambient;
  return ambient;
}

/**
 * What a render context has in common with the contexts derived from it,
 * until one of them changes it: where things are rendered and injected, the
 * component being rendered, the boundaries around it. A component or a
 * boundary makes its own; the nodes below share it.
 */
class RenderEnvironment {
  renderer: CraftDomAdapter;
  injector: Injector;
  componentContext: unknown;
  componentName: string | undefined;
  ownerScope: string | undefined;
  exceptionBoundary: RenderContext['exceptionBoundary'];
  exceptionBoundaryResolved: RenderContext['exceptionBoundaryResolved'];
  pendingBoundary: PendingBoundaryRegistration | undefined;
  settledReadObserver: CraftSettledReadObserver | undefined;
  handledResourceExceptionCodes: Set<string> | undefined;
  fieldExceptionBoundary: FieldExceptionBoundaryRegistration | undefined;
  declarationContext: RenderContext | undefined;
  headingLevel: number | undefined;
  directiveNames: readonly string[] | undefined;
  mode: 'create' | 'hydrate';
  hydration: HydrationCursor | undefined;
  emitHydrationKeys: boolean | undefined;
  ssr: CraftSsrCoordinator | undefined;
  replayTargets: ɵCraftReplayTargetTree | undefined;
  ambient: RenderAmbient | undefined;

  constructor(source: RenderContext | RenderEnvironment) {
    this.renderer = source.renderer;
    this.injector = source.injector;
    this.componentContext = source.componentContext;
    this.componentName = source.componentName;
    this.ownerScope = source.ownerScope;
    this.exceptionBoundary = source.exceptionBoundary;
    this.exceptionBoundaryResolved = source.exceptionBoundaryResolved;
    this.pendingBoundary = source.pendingBoundary;
    this.settledReadObserver = source.settledReadObserver;
    this.handledResourceExceptionCodes = source.handledResourceExceptionCodes;
    this.fieldExceptionBoundary = source.fieldExceptionBoundary;
    this.declarationContext = source.declarationContext;
    this.headingLevel = source.headingLevel;
    this.directiveNames = source.directiveNames;
    this.mode = source.mode;
    this.hydration = source.hydration;
    this.emitHydrationKeys = source.emitHydrationKeys;
    this.ssr = source.ssr;
    this.replayTargets = source.replayTargets;
    this.ambient = source.ambient;
  }
}

/**
 * The context of one node: what changes from a node to the next — its
 * identity, whether its replay address is stable, the component root scope
 * and the render being traced — and the environment it shares with the nodes
 * around it. Deriving the context of a child copies these few fields, not
 * the environment.
 */
class RenderContextState implements RenderContext {
  environment: RenderEnvironment;
  identity: CraftRenderIdentity;
  replayTargetStable: boolean | undefined;
  rootScope: string | undefined;
  traceState: TemplateTraceState | undefined;

  constructor(
    environment: RenderEnvironment,
    identity: CraftRenderIdentity,
    replayTargetStable: boolean | undefined,
    rootScope: string | undefined,
    traceState: TemplateTraceState | undefined,
  ) {
    this.environment = environment;
    this.identity = identity;
    this.replayTargetStable = replayTargetStable;
    this.rootScope = rootScope;
    this.traceState = traceState;
  }

  get renderer(): CraftDomAdapter {
    return this.environment.renderer;
  }
  get injector(): Injector {
    return this.environment.injector;
  }
  get componentContext(): unknown {
    return this.environment.componentContext;
  }
  get componentName(): string | undefined {
    return this.environment.componentName;
  }
  get ownerScope(): string | undefined {
    return this.environment.ownerScope;
  }
  get exceptionBoundary(): RenderContext['exceptionBoundary'] {
    return this.environment.exceptionBoundary;
  }
  get exceptionBoundaryResolved(): RenderContext['exceptionBoundaryResolved'] {
    return this.environment.exceptionBoundaryResolved;
  }
  get pendingBoundary(): PendingBoundaryRegistration | undefined {
    return this.environment.pendingBoundary;
  }
  get settledReadObserver(): CraftSettledReadObserver | undefined {
    return this.environment.settledReadObserver;
  }
  get handledResourceExceptionCodes(): Set<string> | undefined {
    return this.environment.handledResourceExceptionCodes;
  }
  get fieldExceptionBoundary(): FieldExceptionBoundaryRegistration | undefined {
    return this.environment.fieldExceptionBoundary;
  }
  get declarationContext(): RenderContext | undefined {
    return this.environment.declarationContext;
  }
  get headingLevel(): number | undefined {
    return this.environment.headingLevel;
  }
  get directiveNames(): readonly string[] | undefined {
    return this.environment.directiveNames;
  }
  get mode(): 'create' | 'hydrate' {
    return this.environment.mode;
  }
  get hydration(): HydrationCursor | undefined {
    return this.environment.hydration;
  }
  get emitHydrationKeys(): boolean | undefined {
    return this.environment.emitHydrationKeys;
  }
  get ssr(): CraftSsrCoordinator | undefined {
    return this.environment.ssr;
  }
  get replayTargets(): ɵCraftReplayTargetTree | undefined {
    return this.environment.replayTargets;
  }
  get ambient(): RenderAmbient | undefined {
    return this.environment.ambient;
  }
}

/** The state behind a context; a context handed in as plain data gets one. */
function stateOf(context: RenderContext): RenderContextState {
  return context instanceof RenderContextState
    ? context
    : new RenderContextState(
        new RenderEnvironment(context),
        context.identity,
        context.replayTargetStable,
        context.rootScope,
        context.traceState,
      );
}

/** The context a render tree starts from, with its own replay targets. */
function rootRenderContext(
  source: Omit<RenderContext, 'replayTargets' | 'ambient'>,
): RenderContext {
  const context = stateOf(source);
  context.environment.replayTargets = ɵcreateCraftReplayTargetTree();
  return context;
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
  overrides?: Partial<RenderContext>,
): RenderContext {
  const source = stateOf(context);
  const next = new RenderContextState(
    source.environment,
    source.identity,
    source.replayTargetStable,
    source.rootScope,
    source.traceState,
  );
  if (overrides === undefined) return next;
  // The environment is copied the first time an override belongs to it.
  let environment: Record<string, unknown> | undefined;
  for (const key in overrides) {
    const value = (overrides as Record<string, unknown>)[key];
    switch (key) {
      case 'identity':
        next.identity = value as CraftRenderIdentity;
        break;
      case 'replayTargetStable':
        next.replayTargetStable = value as boolean | undefined;
        break;
      case 'rootScope':
        next.rootScope = value as string | undefined;
        break;
      case 'traceState':
        next.traceState = value as TemplateTraceState | undefined;
        break;
      default:
        if (environment === undefined) {
          next.environment = new RenderEnvironment(source.environment);
          environment = next.environment as unknown as Record<string, unknown>;
        }
        environment[key] = value;
    }
  }
  return next;
}

/**
 * Gives the injector a component renders in to the context that was just
 * derived for it. Only for a context whose environment nothing else shares.
 */
function renderInOwnInjector(
  context: RenderContext,
  injector: Injector,
  componentContext: unknown,
  ambient: RenderAmbient | undefined,
): RenderContext {
  const environment = stateOf(context).environment;
  environment.injector = injector;
  environment.componentContext = componentContext;
  environment.ambient = ambient;
  return context;
}

function childNodeContext(
  context: RenderContext,
  node: CraftNode,
  index: number,
  clearRootScope = false,
): RenderContext {
  // A text node only reads its identity to claim or emit a hydration key:
  // a client render gives it the context of its parent as it is.
  if (
    (node.kind === 'text' || node.kind === 'reactive-text') &&
    !context.emitHydrationKeys &&
    !isHydrating(context)
  ) {
    return context;
  }
  const source = stateOf(context);
  const parent = source.identity;
  return new RenderContextState(
    source.environment,
    node.kind === 'component'
      ? ɵchildCraftRenderIdentity(
          parent,
          node.component[CRAFT_COMPONENT].name,
          index,
        )
      : node.kind === 'for'
        ? ɵchildCraftRenderIdentity(parent, `for:${node.sourceName ?? index}`)
        : node.kind === 'if'
          ? ɵchildCraftRenderIdentity(parent, `if:${node.conditionName}`)
          : ɵchildCraftRenderIdentity(parent, index),
    source.replayTargetStable,
    clearRootScope ? undefined : source.rootScope,
    source.traceState,
  );
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

function shouldUseInputShell(value: unknown): boolean {
  return (
    (typeof value === 'function' &&
      (isGeneratorFunction(value) || isYieldableValue(value))) ||
    (value !== null && typeof value !== 'function' && typeof value !== 'object')
  );
}

function renderChildrenCallback(
  context: RenderContext,
  callback: (...args: any[]) => CraftNodeChildren,
  args: readonly unknown[] = [],
  kind: TemplateTraceContext['kind'] = 'callback',
  name?: string,
): CraftNodeChildren {
  if (!ambientOf(context).development) {
    return invokeChildrenCallback(context, callback, args);
  }
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
  if (!ambientOf(context).development) {
    return invokeChildrenCallback(context, callback, args);
  }
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
  if (!ambientOf(context).development) {
    return invokeChildrenCallback(context, callback, args);
  }
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
  serviceName?: string,
  stable = false,
): {
  readonly exception?: AnyCraftException;
  readonly overrides: readonly Provider[];
  readonly trackers: readonly (() => unknown)[];
} {
  const overrides: Provider[] = [];
  const trackers: (() => unknown)[] = [];

  for (const provider of providers) {
    if (Array.isArray(provider)) {
      const providerMetadata = Reflect.get(
        provider,
        CRAFT_SERVICE_PROVIDER_BRAND,
      ) as { readonly name?: string } | undefined;
      const result = eagerlyResolveBrandedProviders(
        provider,
        injector,
        branded || providerMetadata !== undefined,
        serviceName ?? providerMetadata?.name,
        stable,
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
      if (
        typeof serviceName === 'string' &&
        injector.get(SERVICE_RUNTIME_OVERRIDES).get(serviceName)?.kind ===
          'notReached'
      ) {
        continue;
      }
      if (stable) {
        // Use the injector cache: sibling services must share this instance,
        // and input reads must not turn into scope-recreation dependencies.
        const value = injector.get(token);
        if (isCraftException(value)) {
          return { exception: value, overrides, trackers };
        }
        continue;
      }
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

interface RenderedNode {
  readonly kind: CraftNode['kind'] | 'fragment';
  firstNode(): NativeNode;
  lastNode(): NativeNode;
  patch(node: CraftNode): boolean;
  /**
   * Releases what the node owns and takes its DOM out of the document.
   * `detached` says an ancestor element is being removed with everything
   * under it: a node that honors it releases what it owns and leaves its
   * own DOM where it is.
   */
  destroy(detached?: boolean): void;
}

/** Keeps the failure of one release so that the following ones still run. */
function keepCleanupError(
  errors: unknown[] | undefined,
  error: unknown,
): unknown[] {
  if (errors === undefined) return [error];
  errors.push(error);
  return errors;
}

/** Surfaces what {@link keepCleanupError} kept, as `ɵrunCraftCleanups` does. */
function throwCleanupErrors(errors: unknown[] | undefined): void {
  if (errors === undefined) return;
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, 'Craft cleanup failed.');
}

/** Destroys every child, in order, whatever each of them throws. */
function destroyRenderedChildren(
  children: readonly RenderedNode[],
  detached: boolean | undefined,
  errors: unknown[] | undefined,
): unknown[] | undefined {
  for (const child of children) {
    try {
      child.destroy(detached);
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
  }
  return errors;
}

function activeSsrRoute(context: RenderContext): string | undefined {
  const { childMatch, parentMatch } = ɵrunInInjectionContext(
    context.injector,
    () => ({
      childMatch: ɵinjectCraftChildMatch(),
      parentMatch: ɵinjectCraftMatch(),
    }),
  );
  try {
    return childMatch?.()?.route?.path ?? parentMatch?.()?.route?.path;
  } catch {
    return undefined;
  }
}

function createRenderEffect(
  context: RenderContext,
  name: string,
  effectFn: () => void,
): EffectRef {
  return new RenderBindingEffect(context, name, effectFn);
}

/**
 * The effect of one binding, and what it owes its boundaries.
 *
 * It is its own token: a binding that suspends holds it until it next runs to
 * completion. The effect stays subscribed across the suspension — the settled
 * read registered its source's `status` before throwing — so the boundary is
 * released without any polling.
 */
class RenderBindingEffect implements EffectRef {
  // A binding that short-circuited must tell its boundary when it recovers —
  // but only that binding, so a sibling still in exception keeps its fallback.
  private shortCircuited = false;
  private destroyed = false;
  private readonly effect: ɵCraftRenderEffect;
  private readonly context: RenderContext;
  private readonly effectFn: () => void;

  constructor(context: RenderContext, name: string, effectFn: () => void) {
    this.context = context;
    this.effectFn = effectFn;
    const ambient = ambientOf(context);
    this.effect = new ɵCraftRenderEffect(
      name,
      () => this.run(),
      context.injector,
      ambient,
    );
  }

  private run(): void {
    const context = this.context;
    try {
      // A settled read reports its source while it evaluates — that is how the
      // boundary learns about a source that is refetching rather than
      // suspending, since a refetch throws nothing.
      ɵwithSettledReadObserver(context.settledReadObserver, this.effectFn);
    } catch (error) {
      if (isCraftNotSettled(error)) {
        if (!context.pendingBoundary) {
          if (context.ssr) {
            const routePolicy = ɵinjectCraftSsrPolicy();
            if (routePolicy) {
              context.ssr.suspend(this, error.source, routePolicy.mode, {
                route: activeSsrRoute(context),
                timeoutMs: routePolicy.timeoutMs,
              });
              return;
            }
            context.ssr.unhandled(error.source, activeSsrRoute(context));
          }
          throw new CraftUnhandledPendingError(error.source);
        }
        context.pendingBoundary.suspend(this, error.source);
        return;
      }

      if (!isCraftGenShortCircuit(error)) throw error;

      // A settled read whose source carries a business exception: route it to
      // the nearest catchNode, exactly like a component initialization one.
      context.pendingBoundary?.resume(this);
      if (!context.exceptionBoundary?.(error.exception, this)) {
        throw new CraftUnhandledExceptionError(error.exception);
      }
      this.shortCircuited = true;
      return;
    }

    if (context.ssr !== undefined) context.ssr.resume(this);
    if (context.pendingBoundary !== undefined) {
      context.pendingBoundary.resume(this);
    }
    if (this.shortCircuited) {
      this.shortCircuited = false;
      context.exceptionBoundaryResolved?.(this);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const context = this.context;
    if (
      context.ssr === undefined &&
      context.pendingBoundary === undefined &&
      !this.shortCircuited
    ) {
      this.effect.destroy();
      return;
    }
    ɵrunCraftCleanups([
      () => context.ssr?.resume(this),
      () => context.pendingBoundary?.resume(this),
      () => {
        if (this.shortCircuited) context.exceptionBoundaryResolved?.(this);
      },
      () => this.effect.destroy(),
    ]);
  }
}

function createEffectInInjector(
  injector: Injector,
  name: string,
  effectFn: () => void,
): EffectRef {
  return untracked(() =>
    runInInjectionContext(injector, () =>
      ɵcraftEffectRef(name, effectFn, { manualCleanup: true }),
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
    return executeYieldable(
      callback,
      args,
      context.injector,
      ambientOf(context).fnAdapter,
    );
  } finally {
    if (isGeneratorCallback) templateGeneratorDepth--;
  }
}

/**
 * A `Service.member` shortcut resolves in two steps: driving it hands back the
 * member, and the member is the reader the binding wanted. Reading it here is
 * what makes `p(View.label)` render the label instead of the reference.
 */
function readResolvedBinding(value: unknown, context: RenderContext): unknown {
  return isYieldableReactiveValue(value)
    ? executeTemplateCallback(value as (...args: any[]) => unknown, [], context)
    : value;
}

/**
 * The action side of the same two steps: a `Service.member.method` shortcut
 * resolves to the method, and the method is what the event wanted to run.
 */
function runResolvedAction(
  resolved: unknown,
  args: unknown[],
  context: RenderContext,
): unknown {
  return isYieldableMethod(resolved)
    ? executeTemplateCallback(
        resolved as (...args: any[]) => unknown,
        args,
        context,
      )
    : resolved;
}

const resolvedTemplateGeneratorBindings = new WeakMap<object, unknown>();

function resolveTemplateGenerator(
  iterator: Generator<unknown, unknown, unknown>,
  context: RenderContext,
): unknown {
  const key = iterator as object;
  let resolved: unknown;
  if (resolvedTemplateGeneratorBindings.has(key)) {
    resolved = resolvedTemplateGeneratorBindings.get(key);
  } else {
    resolved = executeTemplateCallback(() => iterator, [], context);
    resolvedTemplateGeneratorBindings.set(key, resolved);
  }

  return typeof resolved === 'function'
    ? readResolvedBinding(
        executeTemplateCallback(
          resolved as (...args: any[]) => unknown,
          [],
          context,
        ),
        context,
      )
    : resolved;
}

function resolveTemplateValue(value: unknown, context: RenderContext): unknown {
  if (isGenerator(value)) {
    return resolveTemplateGenerator(value, context);
  }

  return typeof value === 'function'
    ? readResolvedBinding(
        executeTemplateCallback(
          value as (...args: any[]) => unknown,
          [],
          context,
        ),
        context,
      )
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
      typeof value === 'function' || isGenerator(value)
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

    if (
      typeof value === 'function' &&
      (Object.keys(value).length > 0 || isDeepYieldable(value))
    ) {
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
        provideCraftNodeEffectFactory((name: string, effectFn: () => void) =>
          createEffectInInjector(
            context.injector,
            `node-directive-${name}`,
            effectFn,
          ),
        ),
        ...(context.fieldExceptionBoundary
          ? [provideCraftFieldExceptionBoundary(context.fieldExceptionBoundary)]
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.registrationRelease();
      },
      () => {
        this.cleanup?.();
      },
      () => {
        this.environmentInjector.destroy();
      },
    ]);
  }
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
  // A route replacement can resolve after its previous view was torn down.
  // Ignore a stale anchor and append instead of forwarding an invalid DOM
  // reference to insertBefore.
  renderer.insertBefore(
    parent,
    node,
    before && before.parentNode === parent ? before : null,
  );
}

function removeNode(renderer: CraftDomAdapter, node: NativeNode): void {
  const parent = node.parentNode;
  if (parent) {
    renderer.removeChild(parent, node);
  }
}

function isElementNode(node: unknown): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { readonly nodeType?: number }).nodeType === 1
  );
}

/** Is this node still being claimed from server HTML, rather than created? */
function isHydrating(context: RenderContext): context is RenderContext & {
  readonly hydration: NonNullable<RenderContext['hydration']>;
} {
  return (
    context.mode === 'hydrate' &&
    context.hydration !== undefined &&
    !context.hydration.finished
  );
}

function mountComment(
  parent: NativeParent,
  value: string,
  before: NativeNode | null,
  context: RenderContext,
): Comment {
  if (isHydrating(context)) {
    try {
      return context.hydration.claimBoundary(
        context.identity.hydrationKey,
        value,
      );
    } catch (error) {
      if (!(error instanceof HydrationMismatchError)) throw error;
      context.hydration.recordMismatch(error);
    }
  }
  const comment = context.renderer.createComment(
    context.emitHydrationKeys
      ? `${value}|hk:${context.identity.hydrationKey}`
      : value,
  );
  insertBefore(context.renderer, parent, comment, before);
  return comment;
}

function createElementForRender(
  tag: string,
  parent: NativeParent,
  before: NativeNode | null,
  context: RenderContext,
): { readonly element: Element; readonly context: RenderContext } {
  if (isHydrating(context)) {
    try {
      return {
        element: context.hydration.claimElement(
          context.identity.hydrationKey,
          tag,
        ),
        context,
      };
    } catch (error) {
      if (!(error instanceof HydrationMismatchError)) throw error;
      context.hydration.recordMismatch(error);
      const actual = error.actualNode;
      const replacementBefore =
        actual?.parentNode === parent ? actual.nextSibling : before;
      if (actual?.parentNode) removeNode(context.renderer, actual);
      const createContext = childContext(context, {
        mode: 'create',
        hydration: undefined,
      });
      const element = createContext.renderer.createElement(tag);
      if (createContext.emitHydrationKeys) {
        createContext.renderer.setAttribute(
          element,
          'data-craft-hk',
          createContext.identity.hydrationKey,
        );
      }
      insertBefore(createContext.renderer, parent, element, replacementBefore);
      return { element, context: createContext };
    }
  }
  const element = context.renderer.createElement(tag);
  if (context.emitHydrationKeys) {
    context.renderer.setAttribute(
      element,
      'data-craft-hk',
      context.identity.hydrationKey,
    );
  }
  insertBefore(context.renderer, parent, element, before);
  return { element, context };
}

function createTextForRender(
  value: string,
  parent: NativeParent,
  before: NativeNode | null,
  context: RenderContext,
  compare: boolean,
): { readonly text: Text; readonly context: RenderContext } {
  if (isHydrating(context)) {
    try {
      return {
        text: context.hydration.claimText(
          context.identity.hydrationKey,
          compare ? value : undefined,
        ),
        context,
      };
    } catch (error) {
      if (!(error instanceof HydrationMismatchError)) throw error;
      context.hydration.recordMismatch(error);
      const actual = error.actualNode;
      const replacementBefore =
        actual?.parentNode === parent ? actual.nextSibling : before;
      if (actual?.parentNode) removeNode(context.renderer, actual);
      const createContext = childContext(context, {
        mode: 'create',
        hydration: undefined,
      });
      const text = createContext.renderer.createText(value);
      if (createContext.emitHydrationKeys) {
        setNodeHydrationKey(text, createContext.identity.hydrationKey);
      }
      insertBefore(createContext.renderer, parent, text, replacementBefore);
      return { text, context: createContext };
    }
  }
  const text = context.renderer.createText(value);
  if (context.emitHydrationKeys) {
    setNodeHydrationKey(text, context.identity.hydrationKey);
  }
  insertBefore(context.renderer, parent, text, before);
  return { text, context };
}

function patchRenderedChildren(
  parent: NativeParent,
  rendered: RenderedNode[],
  children: CraftNodeChildren,
  before: NativeNode | null,
  context: RenderContext,
  // The children of a component's root element are no longer at the root of
  // the component's scope: their contexts are created without it.
  clearRootScope = false,
): RenderedNode[] {
  const nextNodes = normalizeChildren(children);
  const sharedLength = Math.min(rendered.length, nextNodes.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const current = rendered[index];
    const next = nextNodes[index];

    if (!current.patch(next)) {
      const replacement = mountNode(
        next,
        parent,
        current.firstNode(),
        childNodeContext(context, next, index, clearRootScope),
      );
      rendered[index] = replacement;
      current.destroy();
    }
  }

  if (rendered.length > nextNodes.length) {
    throwCleanupErrors(
      destroyRenderedChildren(
        rendered.splice(nextNodes.length).reverse(),
        false,
        undefined,
      ),
    );
  }

  for (let index = rendered.length; index < nextNodes.length; index += 1) {
    rendered.push(
      mountNode(
        nextNodes[index],
        parent,
        before,
        childNodeContext(context, nextNodes[index], index, clearRootScope),
      ),
    );
  }

  return rendered;
}

class TextRenderedNode implements RenderedNode {
  readonly kind = 'text';
  private destroyed = false;
  private node: Text;
  private value: string;
  private renderer: CraftDomAdapter;

  constructor(node: Text, value: string, renderer: CraftDomAdapter) {
    this.node = node;
    this.value = value;
    this.renderer = renderer;
  }

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

  destroy(detached?: boolean): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!detached) removeNode(this.renderer, this.node);
  }
}

class ReactiveTextRenderedNode implements RenderedNode {
  readonly kind = 'reactive-text';
  private destroyed = false;
  private binding: CraftTextBinding;
  private effectRef: EffectRef;
  private value = '';

  private readonly node: Text;
  private readonly context: RenderContext;

  constructor(node: Text, binding: CraftTextBinding, context: RenderContext) {
    this.node = node;
    this.context = context;
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

  destroy(detached?: boolean): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.effectRef.destroy();
    } finally {
      if (!detached) removeNode(this.context.renderer, this.node);
    }
  }

  private createEffect(): EffectRef {
    return createRenderEffect(this.context, 'text-binding', () => {
      const resolved = readResolvedBinding(
        executeTemplateCallback(this.binding, [], this.context),
        this.context,
      );
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
  let template: (...args: any[]) => unknown = () => [node.node];

  for (const directive of node.directives) {
    const decorator = directive[CRAFT_DIRECTIVE].template;
    if (decorator) {
      template = decorator(
        ɵasGeneratorTemplate(template as never) as never,
      ) as (...args: any[]) => unknown;
    }
  }

  return renderChildrenCallback(
    context,
    () => driveTemplateChildren(template(), context.injector),
    [],
    'callback',
    'directive',
  );
}

/**
 * A directive template may reach services, so what it hands back can still be a
 * running generator: drive it until children come out.
 */
function driveTemplateChildren(
  result: unknown,
  injector: EnvironmentInjector,
): CraftNodeChildren {
  let current = result;
  while (isGenerator(current)) {
    const pending = current;
    current = executeCraftComponentFactory(
      (() => pending) as () => unknown,
      [] as [],
      injector,
    );
  }
  return current as CraftNodeChildren;
}

class CraftDirectiveRenderedNode implements RenderedNode {
  readonly kind = 'directive';
  private readonly view: FragmentRenderedNode;
  private readonly descriptor;
  private readonly effectRef: EffectRef;
  private readonly registrationReleases: (() => void)[];
  private readonly scopedInjector: EnvironmentInjector | undefined;

  private node: CraftDirectiveNode<any, any, any>;
  private readonly context: RenderContext;

  constructor(
    node: CraftDirectiveNode<any, any, any>,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.context = context;
    this.descriptor = signal(node);
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
    const transforms = node.directives.flatMap(
      (directive) => directive[CRAFT_DIRECTIVE].service ?? [],
    );
    this.scopedInjector = transforms.length
      ? createEnvironmentInjector(
          transforms,
          context.injector as EnvironmentInjector,
          'CraftDirectiveServiceTransforms',
        )
      : undefined;
    const scopedContext = this.scopedInjector
      ? childContext(context, { injector: this.scopedInjector })
      : context;
    this.view = createFragment(
      parent,
      before,
      scopedContext,
      [],
      'craft-directive',
    );
    this.effectRef = createRenderEffect(
      scopedContext,
      'craft-directive',
      () => {
        this.node = this.descriptor();
        this.view.patchChildren(
          renderCraftDirectiveNode(this.node, scopedContext),
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
    ɵdestroyCraftOwner(this, [
      () => {
        ɵrunCraftCleanups(this.registrationReleases.splice(0));
      },
      () => {
        this.effectRef.destroy();
      },
      () => {
        this.view.destroy();
      },
      () => {
        this.scopedInjector?.destroy();
      },
    ]);
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
  'paste',
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
  'innerHTML',
]);

const NO_EVENT_NAMES: readonly string[] = [];

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

// A prop name is one of a few literals written in templates: classified once.
const hostPropertyNames = new Map<string, boolean>();

function isHostProperty(key: string): boolean {
  const known = hostPropertyNames.get(key);
  if (known !== undefined) return known;
  const host = classifyHostProperty(key);
  if (hostPropertyNames.size < 4096) hostPropertyNames.set(key, host);
  return host;
}

function classifyHostProperty(key: string): boolean {
  return (
    HOST_PROPERTY_NAMES.has(key) ||
    key.startsWith('data-') ||
    key.startsWith('aria-') ||
    EVENT_NAMES.has(key) ||
    (/^on[A-Z]/.test(key) &&
      EVENT_NAMES.has(`${key[2].toLowerCase()}${key.slice(3)}`))
  );
}

/** The properties of a component call that are its inputs, in order. */
function inputKeys(props: object): string[] {
  const keys: string[] = [];
  for (const key in props) {
    if (
      Object.prototype.hasOwnProperty.call(props, key) &&
      !isHostProperty(key)
    ) {
      keys.push(key);
    }
  }
  return keys;
}

function hostPropsFromComponentProps(
  props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const host: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (isHostProperty(key)) host[key] = props[key];
  }
  return host;
}

/** The same host properties, each with the same value. */
function sameHostProps(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): boolean {
  let count = 0;
  for (const key in next) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    if (
      !Object.prototype.hasOwnProperty.call(previous, key) ||
      !Object.is(previous[key], next[key])
    ) {
      return false;
    }
    count += 1;
  }
  for (const key in previous) {
    if (Object.prototype.hasOwnProperty.call(previous, key)) count -= 1;
  }
  return count === 0;
}

// The directives composed around a definition never change.
const composedDirectiveNames = new WeakMap<object, readonly string[]>();

function directiveNamesOf(definition: {
  readonly scopeOwners: readonly { readonly name: string }[];
}): readonly string[] {
  let names = composedDirectiveNames.get(definition);
  if (names === undefined) {
    names = definition.scopeOwners.slice(1).map((owner) => owner.name);
    composedDirectiveNames.set(definition, names);
  }
  return names;
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

function containsRenderBinding(value: unknown, seen?: Set<object>): boolean {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null) return false;
  if (isGenerator(value)) return true;
  if (seen?.has(value)) return false;
  // Only an object can hold a cycle: nothing to remember for the common
  // absent, string or function value.
  const visited = seen ?? new Set<object>();
  visited.add(value);
  return Object.values(value).some((child) =>
    containsRenderBinding(child, visited),
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
  ɵassertSafeStyleValue(
    value,
    ɵinjectCraftSecurityPolicy().dom.allowedResourceOrigins,
  );
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
    ɵassertSafeStyleValue(
      next,
      ɵinjectCraftSecurityPolicy().dom.allowedResourceOrigins,
    );
    renderer.setAttribute(element, 'style', next);
  } else if (typeof next === 'object' && next !== null) {
    for (const [key, value] of Object.entries(next)) {
      setStyleValue(renderer, element, key, value, context);
    }
  } else {
    renderer.removeAttribute(element, 'style');
  }
}

/** Is the dialog open modally? `:modal` is missing from some DOM implementations. */
function isModalDialog(dialog: HTMLDialogElement): boolean {
  try {
    return dialog.matches(':modal');
  } catch {
    return dialog.open;
  }
}

const NO_ATTRIBUTES: ReadonlyMap<string, unknown> = new Map();

function flattenAttributes(
  props: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, unknown> {
  let attributes: Map<string, unknown> | undefined;
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (key === 'attrs' && typeof value === 'object' && value !== null) {
      const nested = value as Record<string, unknown>;
      for (const attribute of Object.keys(nested)) {
        (attributes ??= new Map()).set(attribute, nested[attribute]);
      }
    } else if (
      key !== 'class' &&
      key !== 'style' &&
      key !== 'directives' &&
      key !== 'labelledBy' &&
      key !== 'onClose' &&
      !eventNameFor(key, value)
    ) {
      (attributes ??= new Map()).set(key, value);
    }
  }
  return attributes ?? NO_ATTRIBUTES;
}

function applyAttribute(
  renderer: CraftDomAdapter,
  element: Element,
  key: string,
  value: unknown,
  context: RenderContext,
): void {
  value = resolveTemplateValue(value, context);
  const normalizedKey = key.toLowerCase();
  if (value === null || value === undefined) {
    if (normalizedKey === 'srcdoc' || normalizedKey.startsWith('on')) {
      renderer.removeAttribute(element, key);
      return;
    }
    if (key === 'innerHTML') {
      renderer.setProperty(element, key, '');
      return;
    }
  }
  if (normalizedKey === 'srcdoc') {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_SRCDOC_BLOCKED',
      'srcdoc is not supported by the secure renderer.',
    );
  }
  if (normalizedKey.startsWith('on')) {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_EVENT_ATTRIBUTE_BLOCKED',
      `Inline event attribute "${key}" is not allowed.`,
    );
  }
  if (
    isCraftUrlAttribute(normalizedKey) &&
    value !== null &&
    value !== undefined
  ) {
    const policy = ɵinjectCraftSecurityPolicy();
    const urlOptions = {
      allowedOrigins: policy?.dom.allowedResourceOrigins ?? [],
      allowedSchemes: policy?.dom.allowedUrlSchemes ?? undefined,
    };
    const resource = isCraftResourceUrlAttribute(normalizedKey);
    value = isCraftMultiUrlAttribute(normalizedKey)
      ? safeUrlList(value, resource, urlOptions)
      : resource
        ? safeResourceUrl(value, urlOptions)
        : safeUrl(value, urlOptions);
  }
  if (key.startsWith('data-craft-')) {
    if (ɵisCraftDevMode()) {
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
  if (key === 'innerHTML') {
    const security = ɵinjectCraftSecurityPolicy();
    if (isCraftSafeHtml(value)) {
      renderer.setProperty(element, key, value.value);
    } else if (isCraftUnsafeHtml(value) && security?.dom.allowUnsafeHtml) {
      renderer.setProperty(element, key, value.value);
    } else {
      throw new CraftDomSecurityError(
        'CRAFT_DOM_RAW_HTML_BLOCKED',
        'Use sanitizedHtml(...) or an explicit, audited unsafeHtml(...) policy.',
      );
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

/** Exporté pour la suite de non-régression sécurité. */
export function ɵassertSafeStyleValue(
  value: unknown,
  resourceOrigins: readonly string[] = [],
): void {
  if (value === null || value === undefined || value === false) return;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_STYLE_INVALID',
      'Style values must be strings or numbers.',
    );
  }
  const text = String(value);
  if (
    /expression\s*\(|behaviou?r\s*:|-moz-binding|@import|<\s*\/style/i.test(
      text,
    )
  ) {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_STYLE_BLOCKED',
      'Potentially executable CSS is not allowed.',
    );
  }
  // Chaque url() passe par le même garde-fou que les attributs d'URL, ce qui
  // écarte les schémas exécutables comme les chargements protocol-relative.
  for (const match of text.matchAll(
    /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\)/gi,
  )) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (url === '') continue;
    safeResourceUrl(url, { allowedOrigins: resourceOrigins });
  }
}

const NO_PROPS: Readonly<Record<string, unknown>> = Object.freeze({});

// An attribute name is one of a few literals written in templates: the key
// of its binding and the name of its effect are built once.
const attributeNameCache = new Map<
  string,
  { readonly binding: string; readonly effect: string }
>();

function attributeNames(key: string): {
  readonly binding: string;
  readonly effect: string;
} {
  let names = attributeNameCache.get(key);
  if (names === undefined) {
    names = {
      binding: `attribute:${key}`,
      effect: `element-attribute:${key}-binding`,
    };
    if (attributeNameCache.size < 4096) attributeNameCache.set(key, names);
  }
  return names;
}

/**
 * An attribute bound to a template value: its effect resolves the value and
 * writes the attribute when it changed.
 */
class AttributeBinding {
  readonly source: unknown;
  readonly effectRef: EffectRef;
  private readonly element: Element;
  private readonly key: string;
  private readonly context: RenderContext;
  private initialized = false;
  private previous: unknown = undefined;

  constructor(
    element: Element,
    key: string,
    source: unknown,
    context: RenderContext,
    effectName: string,
  ) {
    this.element = element;
    this.key = key;
    this.source = source;
    this.context = context;
    this.effectRef = createRenderEffect(context, effectName, () => {
      const value = resolveTemplateValue(this.source, this.context);
      if (!this.initialized || !Object.is(this.previous, value)) {
        applyAttribute(
          this.context.renderer,
          this.element,
          this.key,
          value,
          this.context,
        );
        this.previous = value;
        this.initialized = true;
      }
    });
  }
}

class ElementRenderedNode implements RenderedNode {
  readonly kind = 'element';
  private destroyed = false;
  private children: RenderedNode[] = [];
  private props: Readonly<Record<string, unknown>> = NO_PROPS;
  // Created with the first listener and the first binding: most elements
  // have neither.
  private listeners: Map<string, () => void> | undefined;
  private bindings:
    | Map<string, { readonly source: unknown; readonly effectRef: EffectRef }>
    | undefined;
  private craftNodeDirectiveTypes: readonly AppliedCraftNodeDirective[] = [];
  private craftNodeDirectiveMounts: CraftNodeDirectiveMount[] = [];
  private localName: string | undefined;
  private dialogCleanup: (() => void) | undefined;

  private readonly node: Element;
  private readonly replayTarget: ɵCraftReplayTargetRecord;
  private tag: string;
  private context: RenderContext;

  constructor(
    node: Element,
    tag: string,
    context: RenderContext,
    initial: ElementNodeBase<any, any, any, any, any, any, any, any>,
  ) {
    this.node = node;
    this.tag = tag;
    this.context = context;
    this.replayTarget = ɵlinkCraftReplayTarget(
      node,
      context.identity,
      context.replayTargetStable !== false,
      context.replayTargets,
    );
    this.patchProperties(initial);
    this.installDialog(initial);
    const nested =
      this.tag === 'dialog'
        ? childContext(context, {
            rootScope: undefined,
            headingLevel: 1,
          })
        : context;
    this.children = patchRenderedChildren(
      this.node,
      this.children,
      initial.children,
      null,
      nested,
      nested.rootScope !== undefined,
    );
    this.reapplySelectValue(initial);
    this.openDialog(initial);
  }

  /**
   * A `<select>` only accepts a `value` that matches one of its `<option>`s,
   * and props are applied before children are mounted — so the initial
   * assignment lands on an empty element, is dropped, and the browser falls
   * back to the first option. The control then disagrees with the state it is
   * bound to, silently.
   *
   * Re-assert it now that the options exist. Later updates arrive through the
   * binding, by which point there is nothing to correct.
   */
  private reapplySelectValue(
    node: ElementNodeBase<any, any, any, any, any, any, any, any>,
  ): void {
    if (this.tag !== 'select') {
      return;
    }
    const value = flattenAttributes(node.props).get('value');
    if (value === null || value === undefined) {
      return;
    }
    const resolved =
      typeof value === 'function' || isGenerator(value)
        ? untracked(() => resolveTemplateValue(value, this.context))
        : value;
    applyAttribute(
      this.context.renderer,
      this.node,
      'value',
      resolved,
      this.context,
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
      this.context,
      this.context.rootScope !== undefined,
    );
    this.openDialog(node);
    return true;
  }

  private patchProperties(
    nextNode: ElementNodeBase<any, any, any, any, any, any, any, any>,
  ): void {
    const next = nextNode.props;
    const renderer = this.context.renderer;
    if (this.props === NO_PROPS && !('attrs' in next)) {
      // First properties of the element: nothing to compare with or remove,
      // so they are read straight from the object, in its order.
      for (const key of Object.keys(next)) {
        const value = next[key];
        if (
          key !== 'class' &&
          key !== 'style' &&
          key !== 'directives' &&
          key !== 'labelledBy' &&
          key !== 'onClose' &&
          !eventNameFor(key, value)
        ) {
          this.patchAttribute(key, value, undefined);
        }
      }
    } else {
      const previousAttributes = flattenAttributes(this.props);
      const nextAttributes = flattenAttributes(next);

      for (const key of previousAttributes.keys()) {
        if (!nextAttributes.has(key)) {
          this.destroyBinding(attributeNames(key).binding);
          applyAttribute(renderer, this.node, key, null, this.context);
        }
      }
      for (const [key, value] of nextAttributes) {
        this.patchAttribute(key, value, previousAttributes.get(key));
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

    let nextEvents: Map<string, EventListener> | undefined;
    for (const key of Object.keys(next)) {
      const value = next[key];
      const eventName = eventNameFor(key, value);
      if (eventName) {
        (nextEvents ??= new Map()).set(eventName, value as EventListener);
      }
    }

    if (this.listeners) {
      for (const [eventName, dispose] of this.listeners) {
        if (!nextEvents?.has(eventName)) {
          dispose();
          this.listeners.delete(eventName);
        }
      }
    }

    for (const eventName of nextEvents?.keys() ?? NO_EVENT_NAMES) {
      if (!this.listeners?.has(eventName)) {
        (this.listeners ??= new Map()).set(
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
            const hooks = ɵinjectCraftDomEventHooks(this.context.injector);
            runInInjectionContext(this.context.injector, () =>
              executeDomEventHooks(hooks, interaction, () =>
                runResolvedAction(
                  executeTemplateCallback(listener, [event], this.context),
                  [event],
                  this.context,
                ),
              ),
            );
            return undefined;
          }),
        );
      }
    }

    const craftNodeDirectives = nextNode[CRAFT_NODE_DIRECTIVES] ?? [];
    if (
      !sameCraftNodeDirectives(
        this.craftNodeDirectiveTypes,
        craftNodeDirectives,
      )
    ) {
      ɵrunCraftCleanups(
        this.craftNodeDirectiveMounts.map((mount) => () => mount.destroy()),
      );
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
    const located = this.node as Element & {
      [CRAFT_LOCATOR_CONTENT_NAMES]?: readonly string[];
    };
    if (contentNames.length > 0) {
      located[CRAFT_LOCATOR_CONTENT_NAMES] = contentNames;
    } else if (located[CRAFT_LOCATOR_CONTENT_NAMES] !== undefined) {
      delete located[CRAFT_LOCATOR_CONTENT_NAMES];
    }

    this.props = next;
  }

  /** One attribute of the next properties, given the value it had before. */
  private patchAttribute(key: string, value: unknown, previous: unknown): void {
    if (typeof value === 'function' || isGenerator(value)) {
      const names = attributeNames(key);
      const current = this.bindings?.get(names.binding);
      if (current?.source === value) return;
      current?.effectRef.destroy();
      (this.bindings ??= new Map()).set(
        names.binding,
        new AttributeBinding(this.node, key, value, this.context, names.effect),
      );
      return;
    }
    if (this.bindings !== undefined) {
      this.destroyBinding(attributeNames(key).binding);
    }
    if (
      !Object.is(previous, value) ||
      typeof previous === 'function' ||
      isGenerator(previous)
    ) {
      applyAttribute(
        this.context.renderer,
        this.node,
        key,
        value,
        this.context,
      );
    }
  }

  private updateBinding(
    key: string,
    source: unknown,
    evaluate: () => unknown,
    apply: (value: unknown) => void,
    equals: (left: unknown, right: unknown) => boolean = Object.is,
  ): void {
    const current = this.bindings?.get(key);
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
    (this.bindings ??= new Map()).set(key, { source, effectRef });
  }

  private destroyBinding(key: string): void {
    const bindings = this.bindings;
    if (bindings === undefined) return;
    bindings.get(key)?.effectRef.destroy();
    bindings.delete(key);
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
  }

  /**
   * Opens or closes a dialog node according to its `open` prop. It runs **after**
   * the children are mounted: `showModal()` moves focus into the dialog (to the
   * element marked `autofocus`, else the first control), and a dialog that is
   * still empty has nothing to move it to, so the focus would stay on the
   * dialog itself.
   */
  private openDialog(
    nextNode: ElementNodeBase<any, any, any, any, any, any, any, any>,
  ): void {
    if (this.tag !== 'dialog') return;
    const dialog = this.node as HTMLDialogElement;
    const open = nextNode.props['open'];
    if (open && typeof dialog.showModal === 'function') {
      // `open` is also written as an attribute by the property pass, which opens
      // a dialog *non-modally*: it sits in the flow instead of the top layer and
      // `showModal()` below would never run, because `dialog.open` is already
      // true. Close that first, then open it for real.
      if (!isModalDialog(dialog)) {
        if (dialog.open) dialog.removeAttribute('open');
        dialog.showModal();
      }
    } else if (
      open === false &&
      typeof dialog.close === 'function' &&
      dialog.open
    ) {
      dialog.close();
    }
  }

  destroy(detached?: boolean): void {
    if (this.destroyed) return;
    this.destroyed = true;
    // Every release runs, in this order, before any failure surfaces.
    let errors: unknown[] | undefined;
    ɵunlinkCraftReplayTarget(this.replayTarget);
    if (this.dialogCleanup) {
      try {
        this.dialogCleanup();
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }
    if (this.bindings) {
      for (const binding of this.bindings.values()) {
        try {
          binding.effectRef.destroy();
        } catch (error) {
          errors = keepCleanupError(errors, error);
        }
      }
      this.bindings.clear();
    }
    if (this.listeners) {
      for (const dispose of this.listeners.values()) {
        try {
          dispose();
        } catch (error) {
          errors = keepCleanupError(errors, error);
        }
      }
      this.listeners.clear();
    }
    if (this.craftNodeDirectiveMounts.length > 0) {
      for (const mount of this.craftNodeDirectiveMounts) {
        try {
          mount.destroy();
        } catch (error) {
          errors = keepCleanupError(errors, error);
        }
      }
      this.craftNodeDirectiveMounts = [];
    }
    // The children leave the document with this element.
    errors = destroyRenderedChildren(this.children.splice(0), true, errors);
    if (!detached) {
      try {
        removeNode(this.context.renderer, this.node);
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }
    throwCleanupErrors(errors);
  }
}

class FragmentRenderedNode implements RenderedNode {
  readonly kind = 'fragment';
  private destroyed = false;
  private children: RenderedNode[] = [];

  /**
   * Where this fragment currently lives. A boundary can detach a range into a
   * holder fragment to hide it without destroying it, and the range keeps being
   * reconciled while detached — so every insertion has to follow the markers
   * rather than the parent captured at construction time.
   */
  private get liveParent(): NativeParent {
    return (
      (this.start ?? this.children[0]?.firstNode())?.parentNode ?? this.parent
    );
  }

  private readonly parent: NativeParent;
  // A fragment is bounded by two comments — except a single-root one (see
  // `createSingleRootFragment`), which has none while its content is one
  // element: that element is the whole range.
  private start: Comment | undefined;
  private end: Comment | undefined;
  private context: RenderContext;
  // Of a single-root fragment: the label its boundaries will carry and where
  // its first content goes.
  private readonly label: string | undefined;
  private pendingBefore: NativeNode | null = null;

  constructor(
    parent: NativeParent,
    start: Comment | undefined,
    end: Comment | undefined,
    context: RenderContext,
    initialChildren: CraftNodeChildren,
    singleRoot?: { readonly label: string; readonly before: NativeNode | null },
  ) {
    this.parent = parent;
    this.start = start;
    this.end = end;
    this.context = context;
    this.label = singleRoot?.label;
    if (singleRoot) {
      this.pendingBefore = singleRoot.before;
      return;
    }
    this.children = patchRenderedChildren(
      parent,
      this.children,
      initialChildren,
      end ?? null,
      context,
    );
  }

  firstNode(): NativeNode {
    return this.start ?? this.children[0]?.firstNode() ?? this.bounded().start;
  }

  lastNode(): NativeNode {
    return this.end ?? this.children[0]?.lastNode() ?? this.bounded().end;
  }

  /**
   * The two boundaries, created around the current content the first time
   * the fragment needs them: its content is no longer one element.
   */
  private bounded(): { readonly start: Comment; readonly end: Comment } {
    if (this.start !== undefined && this.end !== undefined) {
      return { start: this.start, end: this.end };
    }
    const content = this.children[0];
    const first = content?.firstNode();
    const parent = first?.parentNode ?? this.parent;
    const label = this.label ?? 'craft-fragment';
    const start = mountComment(
      parent,
      `${label}:start`,
      first ?? this.pendingBefore,
      this.context,
    );
    const end = mountComment(
      parent,
      `${label}:end`,
      content ? content.lastNode().nextSibling : this.pendingBefore,
      this.context,
    );
    this.pendingBefore = null;
    this.start = start;
    this.end = end;
    return { start, end };
  }

  /**
   * Patches a single-root fragment that still has no boundaries. True when
   * the content is, and stays, one element: mounted on the first call,
   * patched in place afterwards. Anything else gives the fragment its
   * boundaries and leaves the patch to the bounded path.
   */
  private patchSingleRoot(children: CraftNodeChildren): boolean {
    const nodes = normalizeChildren(children);
    if (nodes.length === 1) {
      const next = nodes[0];
      const current = this.children[0];
      if (current === undefined) {
        if (next.kind === 'element') {
          this.children.push(
            mountNode(
              next,
              this.parent,
              this.pendingBefore,
              childNodeContext(this.context, next, 0),
            ),
          );
          this.pendingBefore = null;
          return true;
        }
      } else if (current.patch(next)) {
        return true;
      }
    }
    this.bounded();
    return false;
  }

  patch(_node: CraftNode): boolean {
    return false;
  }

  patchChildren(children: CraftNodeChildren): void {
    if (this.end === undefined && this.patchSingleRoot(children)) return;
    this.children = patchRenderedChildren(
      this.liveParent,
      this.children,
      children,
      this.end ?? this.bounded().end,
      this.context,
    );
  }

  hasChildren(): boolean {
    return this.children.length > 0;
  }

  appendChildren(children: CraftNodeChildren): void {
    const nextNodes = normalizeChildren(children);
    const end = this.bounded().end;
    nextNodes.forEach((child) => {
      this.children.push(mountNode(child, this.liveParent, end, this.context));
    });
  }

  prependChildren(children: CraftNodeChildren): void {
    const nextNodes = normalizeChildren(children);
    const end = this.bounded().end;
    const before = this.children[0]?.firstNode() ?? end;
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
    let current: NativeNode | null = this.firstNode();
    const last = this.lastNode();
    const nodes: NativeNode[] = [];
    while (current) {
      nodes.push(current);
      if (current === last) {
        break;
      }
      current = current.nextSibling;
    }
    nodes.forEach((node) =>
      insertBefore(this.context.renderer, this.liveParent, node, before),
    );
  }

  destroy(detached?: boolean): void {
    if (this.destroyed) return;
    this.destroyed = true;
    let errors = destroyRenderedChildren(
      this.children.splice(0),
      detached,
      undefined,
    );
    if (!detached && this.start !== undefined && this.end !== undefined) {
      try {
        removeNode(this.context.renderer, this.start);
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
      try {
        removeNode(this.context.renderer, this.end);
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }
    throwCleanupErrors(errors);
  }
}

class ProjectionRenderedNode implements RenderedNode {
  readonly kind = 'projection';
  private readonly view: FragmentRenderedNode;
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
    this.projectionContext = childContext(this.declarationContext, {
      // The nodes were declared elsewhere, so they read their lexical context; but
      // they live here, and their hydration keys come from where they are mounted.
      // Numbered from the declarer, every slot it declares would start again at 0
      // and collide with the declarer's own nodes and with its other slots.
      identity: ɵchildCraftRenderIdentity(
        context.identity,
        'projection',
        node.slotName ?? 'slot',
      ),
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.effectRef.destroy();
      },
      () => {
        this.view.destroy();
      },
    ]);
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.effectRef.destroy();
      },
      () => {
        this.view.destroy();
      },
    ]);
  }
}

function createFragment(
  parent: NativeParent,
  before: NativeNode | null,
  context: RenderContext,
  children: CraftNodeChildren,
  label: string,
): FragmentRenderedNode {
  const start = mountComment(parent, `${label}:start`, before, context);
  const end = mountComment(parent, `${label}:end`, before, context);
  return new FragmentRenderedNode(parent, start, end, context, children);
}

/**
 * A fragment for content that is usually one element (a component's view).
 * On a client render it creates no boundary comment as long as its content is
 * exactly one element, patched in place: two nodes fewer to create, move and
 * remove for each instance. The boundaries appear around that element as soon
 * as the content becomes empty, multiple or anything else.
 *
 * Server rendering and hydration keep the two boundaries: they are part of
 * the markup both sides agree on.
 */
function createSingleRootFragment(
  parent: NativeParent,
  before: NativeNode | null,
  context: RenderContext,
  label: string,
): FragmentRenderedNode {
  if (context.mode !== 'create' || context.emitHydrationKeys) {
    return createFragment(parent, before, context, [], label);
  }
  return new FragmentRenderedNode(parent, undefined, undefined, context, [], {
    label,
    before,
  });
}

// Keep the reader's closure outside reconciliation: a surviving sibling must
// not retain the previous/next entry maps and the removed rows they contained.
function createForIndexReader(read: () => number): InputValue<number> {
  return ɵsettledReader(read) as InputValue<number>;
}

const MAX_FOR_SOURCE_PASSES = 8;

/** Same rows in the same order: a derived source may rebuild its array. */
function sameForItems(
  next: readonly unknown[] | null | undefined,
  previous: readonly unknown[] | null | undefined,
): boolean {
  if (Object.is(next, previous)) return true;
  const nextItems = next ?? [];
  const previousItems = previous ?? [];
  return (
    nextItems.length === previousItems.length &&
    nextItems.every((item, index) => Object.is(item, previousItems[index]))
  );
}

interface ForRenderedEntry {
  readonly key: unknown;
  item: unknown;
  index: number;
  // Read only through `indexReader`: a renderer-private cell.
  readonly indexSignal: ɵCraftPrivateCell<number>;
  readonly indexReader: InputValue<number>;
  view: FragmentRenderedNode;
  /** Context of a view the ordering pass has yet to create. */
  pendingContext: RenderContext | undefined;
  readonly traceState: TemplateTraceState;
  renderEffect?: EffectRef;
  rendered: boolean;
}

const NO_FOR_SOURCE = Symbol('no-for-source');

class ForRenderedNode implements RenderedNode {
  readonly kind = 'for';
  private entries = new Map<unknown, ForRenderedEntry>();
  private emptyView: FragmentRenderedNode | undefined;
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  private node: ForNode<unknown, unknown>;
  private readonly parent: NativeParent;
  private readonly start: Comment;
  private readonly end: Comment;
  private readonly context: RenderContext;
  private scheduler: ForScheduler & { destroy?(): void };
  private ownsScheduler = false;
  private schedulePolicy: ForSchedulePolicy | undefined;
  private schedulerConfigured = false;
  private readonly pendingTasks = new Set<CancelHandle>();
  private reconcileVersion = 0;
  private deepSourceOf: unknown = NO_FOR_SOURCE;
  private deepSource = false;

  constructor(
    node: ForNode<unknown, unknown>,
    parent: NativeParent,
    start: Comment,
    end: Comment,
    context: RenderContext,
  ) {
    this.node = node;
    this.parent = parent;
    this.start = start;
    this.end = end;
    this.context = context;
    this.scheduler = createForScheduler({
      enabled: false,
      strategy: 'sync',
      frameBudgetMs: 4,
    });
    this.configureScheduler(node.schedule);
    this.descriptor = signal(node);
    this.effectRef = createRenderEffect(context, 'for-node', () => {
      const previousItemTemplate = this.node.itemTemplate;
      this.node = this.descriptor();
      this.configureScheduler(this.node.schedule);
      let itemTemplateChanged = this.node.itemTemplate !== previousItemTemplate;
      let items = this.readSource();
      // Publish positions and commit DOM order before dependent effects flush.
      // The batch closes inside this effect, so it flushes the effects already
      // queued; one of them may publish a new source (a service shortcut's
      // reader) while this effect still runs, and that change does not run it
      // again. Read the source once more and reconcile until it holds still.
      for (let pass = 0; pass < MAX_FOR_SOURCE_PASSES; pass++) {
        const current = items;
        const templateChanged = itemTemplateChanged;
        ɵcraftBatch(() => this.reconcile(current, templateChanged));
        const next = this.readSource();
        if (sameForItems(next, current)) break;
        items = next;
        itemTemplateChanged = false;
      }
    });
  }

  firstNode(): NativeNode {
    return this.start;
  }

  lastNode(): NativeNode {
    return this.end;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'for') {
      return false;
    }
    this.descriptor.set(node);
    return true;
  }

  private readSource(): readonly unknown[] | null | undefined {
    return resolveTemplateValue(this.node.source, this.context) as
      | readonly unknown[]
      | null
      | undefined;
  }

  private reconcile(
    items: readonly unknown[] | null | undefined,
    itemTemplateChanged = false,
  ): void {
    const collection = items ?? [];

    const keys = collection.map((item, index) => this.node.track(item, index));
    const seenKeys = new Set<unknown>();
    keys.forEach((key) => {
      if (seenKeys.has(key)) {
        throw new Error(
          `forNode() received the duplicate key "${String(key)}".`,
        );
      }
      seenKeys.add(key);
    });

    this.reconcileVersion += 1;
    this.cancelPendingTasks();

    if (collection.length === 0) {
      this.entries.forEach((entry) => {
        entry.renderEffect?.destroy();
        entry.view.destroy();
      });
      this.entries.clear();

      if (this.node.empty) {
        const emptyContext = childContext(this.context, {
          identity: ɵchildCraftRenderIdentity(this.context.identity, 'empty'),
        });
        if (this.emptyView) {
          this.emptyView.patchChildren(
            renderBlockChildren(emptyContext, 'empty', this.node.empty),
          );
        } else {
          this.emptyView = createFragment(
            this.parent,
            this.end,
            emptyContext,
            renderBlockChildren(emptyContext, 'empty', this.node.empty),
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
    const next = new Map<unknown, ForRenderedEntry>();
    const nextOrdered: ForRenderedEntry[] = [];
    // A new entry is created where it belongs, by the ordering pass below: a
    // row inserted between two rows is one insertion, not a move of every row
    // around it. While server HTML is being claimed, boundaries are claimed
    // in document order, so entries are created here, in that order.
    const createInPlace = !isHydrating(this.context);

    const entriesToRender: ForRenderedEntry[] = [];
    collection.forEach((item, index) => {
      const key = keys[index];
      let entry = previous.get(key);
      if (entry) {
        if (
          itemTemplateChanged ||
          !Object.is(entry.item, item) ||
          !entry.rendered
        ) {
          entry.item = item;
          entriesToRender.push(entry);
        }
        if (entry.index !== index) {
          entry.index = index;
          entry.indexSignal.set(index);
        }
      } else {
        const traceState = { renderCount: 0 };
        const indexSignal = ɵcraftPrivateCell(index);
        const indexReader = createForIndexReader(indexSignal);
        const entryContext = childContext(this.context, {
          identity: ɵchildCraftRenderIdentity(
            this.context.identity,
            `item:${String(key)}`,
          ),
          replayTargetStable:
            this.context.replayTargetStable !== false &&
            String(key) !== String(index),
        });
        entry = {
          key,
          item,
          index,
          indexSignal,
          indexReader,
          traceState,
          rendered: false,
          pendingContext: createInPlace ? entryContext : undefined,
          view: createInPlace
            ? (undefined as unknown as FragmentRenderedNode)
            : createFragment(
                this.parent,
                this.end,
                entryContext,
                [],
                `craft-for:${String(key)}`,
              ),
        };
        entriesToRender.push(entry);
      }

      next.set(key, entry);
      nextOrdered.push(entry);
    });

    previous.forEach((entry, key) => {
      if (!next.has(key)) {
        entry.renderEffect?.destroy();
        entry.view.destroy();
      }
    });

    let before: NativeNode = this.end;
    for (let index = nextOrdered.length - 1; index >= 0; index -= 1) {
      const entry = nextOrdered[index];
      const entryContext = entry.pendingContext;
      if (entryContext !== undefined) {
        entry.pendingContext = undefined;
        entry.view = this.canCompileItem()
          ? createSingleRootFragment(
              this.parent,
              before,
              entryContext,
              `craft-for:${String(entry.key)}`,
            )
          : createFragment(
              this.parent,
              before,
              entryContext,
              [],
              `craft-for:${String(entry.key)}`,
            );
      } else if (entry.view.lastNode().nextSibling !== before) {
        entry.view.moveBefore(before);
      }
      before = entry.view.firstNode();
    }

    this.entries = next;

    entriesToRender.forEach((entry) => this.scheduleEntryRender(entry));
  }

  private configureScheduler(policy: ForSchedulePolicy | undefined): void {
    if (this.schedulerConfigured && this.schedulePolicy === policy) return;

    if (this.ownsScheduler) this.scheduler.destroy?.();
    this.schedulePolicy = policy;
    this.schedulerConfigured = true;
    this.cancelPendingTasks();

    const injected = ɵinjectForSchedulerIn(this.context.injector);
    if (injected) {
      this.scheduler = injected;
      this.ownsScheduler = false;
      return;
    }

    this.scheduler = createForScheduler(
      policy ?? { enabled: false, strategy: 'sync', frameBudgetMs: 4 },
      () =>
        runInInjectionContext(this.context.injector, () =>
          ɵinjectCraftTemporalRuntime(),
        ),
    );
    this.ownsScheduler = true;
  }

  private scheduleEntryRender(entry: ForRenderedEntry): void {
    // Cancelled pending updates must be scheduled again on the next reconcile.
    entry.rendered = false;
    // Retire its template subscription before publishing a moved index can
    // flush it, otherwise a deferred item update could render once now and
    // once again when its scheduled task runs. Descendant bindings stay live.
    entry.renderEffect?.destroy();
    entry.renderEffect = undefined;
    // The synchronous scheduler runs its task at once and has nothing to
    // cancel: the entry is rendered here, without a task to hand over.
    if (this.scheduler.constructor === SyncForScheduler) {
      this.renderEntry(entry);
      return;
    }
    const version = this.reconcileVersion;
    const scheduled = {
      completed: false,
      handle: undefined as CancelHandle | undefined,
    };
    const handle = this.scheduler.schedule(() => {
      scheduled.completed = true;
      if (scheduled.handle) this.pendingTasks.delete(scheduled.handle);
      if (version !== this.reconcileVersion || !this.entries.has(entry.key)) {
        return;
      }
      this.renderEntry(entry);
    });
    scheduled.handle = handle;
    if (!scheduled.completed) this.pendingTasks.add(handle);
  }

  private renderEntry(entry: ForRenderedEntry): void {
    if (this.canCompileItem()) {
      untracked(() =>
        entry.view.patchChildren(
          this.renderItem(
            entry.traceState,
            entry.item,
            entry.indexReader,
            entry.key,
          ),
        ),
      );
      entry.rendered = true;
      return;
    }
    entry.renderEffect = createRenderEffect(this.context, 'for-item', () =>
      entry.view.patchChildren(
        this.renderItem(
          entry.traceState,
          entry.item,
          entry.indexReader,
          entry.key,
        ),
      ),
    );
    entry.rendered = true;
  }

  private canCompileItem(): boolean {
    const component = compiledItemComponent(this.node.itemTemplate);
    return (
      !!component &&
      canUseCompiledDefinition(
        component as CraftComponent<object>,
        this.context,
      )
    );
  }

  private cancelPendingTasks(): void {
    const pending = [...this.pendingTasks];
    this.pendingTasks.clear();
    ɵrunCraftCleanups(
      pending.map((handle) => () => {
        handle.cancel();
      }),
    );
  }

  private renderItem(
    traceState: TemplateTraceState,
    item: unknown,
    index: InputValue<number>,
    key: unknown,
  ): CraftNodeChildren {
    traceState.renderCount += 1;
    // The item is known: reading it hands the value back, without a
    // generator object at each read.
    const itemReader = ɵsettledValueReader(item);
    const source = this.node.source;
    if (source !== this.deepSourceOf) {
      // Asked once for a source: it does not change with the row.
      this.deepSourceOf = source;
      this.deepSource = isDeepYieldable(source);
    }
    const itemInput = this.deepSource
      ? deepYieldable(
          markYieldableValue(
            itemReader,
            `${this.node.sourceName ?? 'forNode'}.item`,
          ),
        )
      : itemReader;

    return renderBlockChildren(
      childContext(this.context, {
        traceState,
        identity: ɵchildCraftRenderIdentity(
          this.context.identity,
          `item:${String(key)}`,
        ),
      }),
      'for',
      this.node.itemTemplate,
      [itemInput, index],
    );
  }

  destroy(detached?: boolean): void {
    ɵdestroyCraftOwner(this, [
      () => {
        this.effectRef.destroy();
      },
      () => {
        this.reconcileVersion += 1;
      },
      () => {
        this.cancelPendingTasks();
      },
      () => {
        if (this.ownsScheduler) this.scheduler.destroy?.();
      },
      () => {
        let errors: unknown[] | undefined;
        for (const entry of this.entries.values()) {
          try {
            entry.renderEffect?.destroy();
          } catch (error) {
            errors = keepCleanupError(errors, error);
          }
          try {
            entry.view.destroy(detached);
          } catch (error) {
            errors = keepCleanupError(errors, error);
          }
        }
        throwCleanupErrors(errors);
      },
      () => {
        this.emptyView?.destroy(detached);
      },
      () => {
        if (!detached) removeNode(this.context.renderer, this.start);
      },
      () => {
        if (!detached) removeNode(this.context.renderer, this.end);
      },
    ]);
  }
}

class IfRenderedNode implements RenderedNode {
  readonly kind = 'if';
  private readonly view: FragmentRenderedNode;
  private active: boolean | undefined;
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  private node: IfNode;
  private readonly context: RenderContext;

  constructor(
    node: IfNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.context = context;
    this.descriptor = signal(node);
    this.view = createFragment(
      parent,
      before,
      context,
      [],
      `craft-if:${node.conditionName}`,
    );
    this.effectRef = createRenderEffect(context, 'if-node', () => {
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.effectRef.destroy();
      },
      () => {
        this.view.destroy();
      },
    ]);
  }
}

class MatchRenderedNode implements RenderedNode {
  readonly kind = 'match';
  private readonly view: FragmentRenderedNode;
  private handledExceptionCode: string | undefined;
  private readonly descriptor;
  private readonly effectRef: EffectRef;

  private node: MatchNode;
  private readonly context: RenderContext;

  constructor(
    node: MatchNode,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.context = context;
    this.descriptor = signal(node);
    this.view = createFragment(parent, before, context, [], 'craft-match-node');
    this.effectRef = createRenderEffect(context, 'match-node', () => {
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
    if (node.kind !== 'match' || node.key !== this.node.key) {
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.effectRef.destroy();
      },
      () => {
        if (this.handledExceptionCode) {
          this.context.handledResourceExceptionCodes?.delete(
            this.handledExceptionCode,
          );
        }
      },
      () => {
        this.view.destroy();
      },
    ]);
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
  const holder = renderer.createFragment();
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

class CatchRenderedNode implements RenderedNode {
  readonly kind = 'catch';
  private readonly start: Comment;
  private readonly end: Comment;
  private readonly sourceView: FragmentRenderedNode;
  private readonly fallbackView: FragmentRenderedNode;
  private handling = false;
  private fallbackVisible = false;
  private fallbackPosition: CatchPosition;
  private detached: DocumentFragment | undefined;
  /** Reporters still failing. The fallback stays up until this empties. */
  private readonly failing = new Set<object>();

  private node: CatchNode<any, any, any, any, any>;
  private readonly parent: NativeParent;
  private readonly context: RenderContext;

  constructor(
    node: CatchNode<any, any, any, any, any>,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.parent = parent;
    this.context = context;
    this.fallbackPosition = node.position;
    this.start = mountComment(
      parent,
      'craft-catch-node:start',
      before,
      context,
    );
    this.end = mountComment(parent, 'craft-catch-node:end', before, context);

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
    if (node.kind !== 'catch' || node.position !== this.node.position) {
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

    const handler = this.node.handlers[exception._tag];
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
      const resolved = resolveCatchHandler(
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

  private applyPosition(position: CatchPosition): void {
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.restoreSource();
      },
      () => {
        this.fallbackView.destroy();
      },
      () => {
        this.sourceView.destroy();
      },
      () => {
        removeNode(this.context.renderer, this.start);
      },
      () => {
        removeNode(this.context.renderer, this.end);
      },
    ]);
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
let nextPendingBoundaryId = 0;

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
 * The `pendingNode` boundary.
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
class PendingRenderedNode implements RenderedNode {
  readonly kind = 'pending';
  private readonly boundaryId = nextPendingBoundaryId++;
  private readonly start: Comment;
  private readonly end: Comment;
  private readonly sourceView: FragmentRenderedNode;
  private readonly fallbackView: FragmentRenderedNode;
  private readonly position: PendingPosition;
  /** Held tokens, by the binding that suspended, in suspension order. */
  private readonly held = new Map<object, string>();
  /** Sources seen below this boundary, by name — the reload watch reads them. */
  private readonly watched = new Map<string, CraftSettledReadNotice>();
  private reloadWatch: EffectRef | undefined;
  private reloadingSource: string | undefined;
  private pendingOperation:
    | Readonly<{
        id: string;
        source: string;
        mode: 'suspended' | 'reloading';
        correlationId?: string;
      }>
    | undefined;
  private pendingOperationSequence = 0;
  private detached: DocumentFragment | undefined;
  /** Depth of an in-flight render into the source range. */
  private rendering = 0;
  /** A fallback render asked for while the source range was mid-render. */
  private renderDeferred = false;

  private node: PendingNode<any, any, any, any>;
  private readonly parent: NativeParent;
  private readonly context: RenderContext;

  constructor(
    node: PendingNode<any, any, any, any>,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.parent = parent;
    this.context = context;
    this.position = node.position;
    if (
      context.ssr &&
      node.ssr === 'client' &&
      !node.handlers &&
      !node.fallback
    ) {
      throw new Error(
        'pendingNode({ ssr: "client" }) requires an explicit fallback or shell.',
      );
    }
    this.start = mountComment(parent, 'craft-pending:start', before, context);
    this.end = mountComment(parent, 'craft-pending:end', before, context);

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
        [],
        'craft-pending-source',
      );

    // Both ranges are staked out EMPTY first. A binding below this boundary
    // suspends on its very first run, synchronously, from inside the source
    // range's own construction — so both views have to exist (and the range has
    // to be complete) before that first run happens.
    if (this.position === 'before') {
      this.fallbackView = createFallback();
      this.sourceView = createSource();
    } else {
      this.sourceView = createSource();
      this.fallbackView = createFallback();
    }

    this.renderSource([node.source]);
  }

  /**
   * Fills the source range, deferring any fallback render that a synchronous
   * suspension asks for until the range is whole again. Rendering the fallback
   * mid-pass would detach the range out from under the insertion that is still
   * walking it.
   */
  private renderSource(children: CraftNodeChildren): void {
    this.rendering += 1;
    try {
      this.sourceView.patchChildren(children);
    } finally {
      this.rendering -= 1;
    }
    if (this.rendering === 0 && this.renderDeferred) {
      this.renderDeferred = false;
      this.renderFallback();
    }
  }

  firstNode(): NativeNode {
    return this.start;
  }

  lastNode(): NativeNode {
    return this.end;
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'pending') {
      return false;
    }
    const next = node as PendingNode<any, any, any, any>;
    if (next.position !== this.position) {
      return false;
    }
    this.node = next;
    // A re-render re-materialises the source range: hide it again.
    if (this.held.size > 0) this.detached = undefined;
    this.renderSource([next.source]);
    if (this.held.size > 0) this.showFallback();
    return true;
  }

  destroy(): void {
    ɵdestroyCraftOwner(this, [
      () => {
        this.reloadWatch?.destroy();
      },
      () => {
        this.closePendingOperationOnDestroy();
      },
      () => {
        this.restoreSource();
      },
      () => {
        this.fallbackView.destroy();
      },
      () => {
        this.sourceView.destroy();
      },
      () => {
        removeNode(this.context.renderer, this.start);
      },
      () => {
        removeNode(this.context.renderer, this.end);
      },
    ]);
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
    if (this.held.size === 0) this.requestFallbackRender();
  }

  private suspend(token: object, source: string): void {
    if (this.handles(source)) {
      const routePolicy = ɵinjectCraftSsrPolicy();
      this.context.ssr?.suspend(
        token,
        source,
        this.node.ssr ?? routePolicy?.mode,
        {
          route: activeSsrRoute(this.context),
          timeoutMs: routePolicy?.timeoutMs,
        },
      );
      const wasIdle = this.held.size === 0;
      this.held.set(token, source);
      if (wasIdle) this.showFallback();
      return;
    }

    // Not ours to handle (an `.exhaustive` boundary that does not list this
    // source): delegate outwards.
    if (!this.context.pendingBoundary) {
      if (this.context.ssr) {
        this.context.ssr.unhandled(source, activeSsrRoute(this.context));
      }
      throw new CraftUnhandledPendingError(source);
    }
    this.context.pendingBoundary.suspend(token, source);
  }

  private resume(token: object): void {
    if (!this.held.delete(token)) {
      this.context.pendingBoundary?.resume(token);
      return;
    }
    this.context.ssr?.resume(token);
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

    const handler: PendingHandler | undefined = handlers[source];
    const inner = handler
      ? resolvePendingHandler(handler, suspended ? 'pending' : 'reloading')
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
    const fallback = this.fallbackChildren();
    this.fallbackView.patchChildren(fallback);
    this.recordPendingTransition(this.fallbackView.hasChildren());
  }

  /** Record only semantic fallback transitions, after the corresponding DOM patch. */
  private recordPendingTransition(fallbackRendered: boolean): void {
    const next =
      this.held.size > 0
        ? {
            source: this.held.values().next().value as string,
            mode: 'suspended' as const,
          }
        : this.reloadingSource
          ? { source: this.reloadingSource, mode: 'reloading' as const }
          : undefined;
    const previous = this.pendingOperation;
    if (
      previous &&
      next?.source === previous.source &&
      next?.mode === previous.mode
    )
      return;

    const session = runInInjectionContext(this.context.injector, () =>
      ɵinjectSendContextSession(),
    );
    if (!session?.activeClip) return;
    const correlationId = runInInjectionContext(
      this.context.injector,
      () => ɵcurrentCorrelationId(ɵinjectCorrelationIdService()) ?? undefined,
    );

    if (previous) {
      session.capture('pending', 'succeeded', {
        name: `pending:${previous.mode}:${previous.source}`,
        operationId: previous.id,
        ...(previous.correlationId
          ? { correlationId: previous.correlationId }
          : {}),
        payload: {
          boundaryId: this.boundaryId,
          source: previous.source,
          mode: previous.mode,
          transition: 'settled',
          ...(isCraftReplaying() ? { replay: true } : {}),
        },
      });
    }

    this.pendingOperation = next
      ? {
          id: `pending:${this.boundaryId}:${++this.pendingOperationSequence}`,
          source: next.source,
          mode: next.mode,
          ...(correlationId ? { correlationId } : {}),
        }
      : undefined;
    if (next && this.pendingOperation) {
      session.capture('pending', 'started', {
        name: `pending:${next.mode}:${next.source}`,
        operationId: this.pendingOperation.id,
        ...(correlationId ? { correlationId } : {}),
        payload: {
          boundaryId: this.boundaryId,
          source: next.source,
          mode: next.mode,
          transition: 'visible',
          fallbackRendered,
          ...(isCraftReplaying() ? { replay: true } : {}),
        },
      });
    }
  }

  private closePendingOperationOnDestroy(): void {
    const pending = this.pendingOperation;
    if (!pending) return;
    const session = runInInjectionContext(this.context.injector, () =>
      ɵinjectSendContextSession(),
    );
    if (session?.activeClip)
      session.capture('pending', 'failed', {
        name: `pending:${pending.mode}:${pending.source}`,
        operationId: pending.id,
        ...(pending.correlationId
          ? { correlationId: pending.correlationId }
          : {}),
        payload: {
          boundaryId: this.boundaryId,
          source: pending.source,
          mode: pending.mode,
          transition: 'destroyed',
          ...(isCraftReplaying() ? { replay: true } : {}),
        },
      });
    this.pendingOperation = undefined;
  }

  private showFallback(): void {
    this.requestFallbackRender();
  }

  private hideFallback(): void {
    this.requestFallbackRender();
  }

  private requestFallbackRender(): void {
    if (this.rendering > 0) {
      this.renderDeferred = true;
      return;
    }
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
      if (isElementNode(current) && current.contains(node)) return true;
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

class FieldErrorRenderedNode implements RenderedNode {
  readonly kind = 'field-error';
  private readonly boundaryId = nextFieldExceptionBoundaryId++;
  private readonly descriptor;
  private readonly sourcesVersion = signal(0);
  private readonly sources = new Set<RegisteredFieldExceptionSource>();
  private readonly componentSourceCleanups: Array<() => void>;
  private readonly view: FragmentRenderedNode;
  private readonly effectRef: EffectRef;

  private node: FieldErrorNode<any, any, any, any>;
  private readonly context: RenderContext;

  constructor(
    node: FieldErrorNode<any, any, any, any>,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.context = context;
    this.descriptor = signal(node);
    this.view = createFragment(
      parent,
      before,
      this.boundaryContext(),
      [node.source],
      'craft-field-error-node',
    );
    this.componentSourceCleanups = componentFieldExceptionSources(
      context.componentContext,
    ).map((source) => this.register(source));
    this.effectRef = createRenderEffect(context, 'field-error-node', () => {
      this.node = this.descriptor();
      this.sourcesVersion();
      const fallbacks = this.renderFallbacks();
      this.view.patchChildren(
        this.node.options.position === 'before'
          ? [fallbacks, this.node.source]
          : [this.node.source, fallbacks],
      );
    });
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  lastNode(): NativeNode {
    return this.view.lastNode();
  }

  patch(node: CraftNode): boolean {
    if (node.kind !== 'field-error') return false;
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
      fieldExceptionHandler(this.node.handlers, source.path, exception._tag),
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
          exception._tag,
        );
        if (!handler) return;
        const validatorName = fieldExceptionValidatorName(source, exception);
        const messageKey = `${validatorName}:${exception._tag}:${index}`;
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.effectRef.destroy();
      },
      () => {
        ɵrunCraftCleanups(this.componentSourceCleanups.splice(0));
      },
      () => {
        this.view.destroy();
      },
      () => {
        ɵrunCraftCleanups(
          Array.from(
            this.sources,
            (source) => () => this.releaseAccessibility(source),
          ),
        );
      },
      () => {
        this.sources.clear();
      },
    ]);
  }
}

const NO_HOST_TAGS: readonly string[] = [];

function componentHostName(
  injector: Injector,
  name: string,
  tags: readonly string[] = injector.get(HOST_TAG_LIST, NO_HOST_TAGS),
): string {
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
  const register = ɵinjectComponentRegister() ?? ɵfallbackComponentRegister;
  return `${kind}:${name}#${register.next()}`;
}

// The HostName/HostTagList declarations of a component, reused for the same
// definition and name. They hold no instance state: the tag factory reads the
// parent's tags and draws the instance ordinal when each injector resolves it,
// and every injector keeps its own records and values. A new name rebuilds
// the declarations.
const componentHostDeclarations = new WeakMap<
  object,
  { readonly name: string; readonly providers: Provider[] }
>();

function componentHostProviders(definition: {
  readonly name: string;
}): Provider[] {
  const cached = componentHostDeclarations.get(definition);
  if (cached?.name === definition.name) return cached.providers;
  const providers = provideHostName(`component:${definition.name}`);
  componentHostDeclarations.set(definition, {
    name: definition.name,
    providers,
  });
  return providers;
}

/** What differs between two injectors of the same component definition. */
type ComponentScope = {
  readonly identity: CraftRenderIdentity;
  readonly element: Element | null;
};

const componentScope = (injector: Injector): ComponentScope =>
  ɵinjectorInstance(injector) as ComponentScope;

// Shared by every component injector: each reads its own scope.
const SCOPE_RENDER_IDENTITY = ɵprovideCraftRenderIdentityReading(
  (injector) => componentScope(injector).identity,
) as Provider;
const SCOPE_ELEMENT_REF: Provider = {
  provide: ElementRef,
  useFactory: () => new ElementRef(componentScope(inject(Injector)).element),
};

// The providers of a component's own injector, prepared once for a
// definition and its name: the same declarations as the list built for a
// component that receives additional providers, in the same order.
const componentScopeProviders = new WeakMap<
  object,
  {
    readonly name: string;
    readonly prepared: ReturnType<typeof ɵprepareEnvironmentProviders>;
  }
>();

function preparedComponentProviders(definition: {
  readonly name: string;
  readonly meta: { readonly providers?: readonly unknown[] };
}): ReturnType<typeof ɵprepareEnvironmentProviders> {
  const cached = componentScopeProviders.get(definition);
  if (cached?.name === definition.name) return cached.prepared;
  const prepared = ɵprepareEnvironmentProviders([
    ...componentHostProviders(definition),
    SCOPE_RENDER_IDENTITY,
    ...(definition.meta.providers ?? []),
    SCOPE_ELEMENT_REF,
  ]);
  componentScopeProviders.set(definition, { name: definition.name, prepared });
  return prepared;
}

/**
 * The callable an input is to its component: calling it reads the current
 * value. Content inputs are object-shaped at the call site but component
 * factories receive callable input shells, so the shell also exposes the
 * object's properties — the factory can use `content.header` without eagerly
 * evaluating a slot.
 */
function createInputShell(source: ɵCraftPrivateCell<unknown>): unknown {
  const input = (...callbackArgs: unknown[]) => {
    const current = source();
    if (callbackArgs.length > 0 && typeof current === 'function') {
      return (current as (...args: unknown[]) => unknown)(...callbackArgs);
    }
    const value =
      typeof current === 'function' ? (current as () => unknown)() : current;

    return isGenerator(value)
      ? value
      : yieldableInvocation<unknown, unknown>(value);
  };
  // The handler answers for the yieldable-method mark, which is only ever
  // looked up with `in`: no property to define on each shell.
  return new Proxy(input, new InputShellHandler(source));
}

class InputShellHandler implements ProxyHandler<object> {
  private readonly source: ɵCraftPrivateCell<unknown>;

  constructor(source: ɵCraftPrivateCell<unknown>) {
    this.source = source;
  }

  get(target: object, property: string | symbol, receiver: unknown): unknown {
    const current = this.source();
    if (
      typeof current === 'object' &&
      current !== null &&
      property in current
    ) {
      return Reflect.get(current, property);
    }
    if (property === YIELDABLE_METHOD) return true;
    return Reflect.get(target, property, receiver);
  }

  has(target: object, property: string | symbol): boolean {
    const current = this.source();
    return (
      (typeof current === 'object' &&
        current !== null &&
        property in current) ||
      property === YIELDABLE_METHOD ||
      property in target
    );
  }

  ownKeys(target: object): (string | symbol)[] {
    const current = this.source();
    return [
      ...new Set([
        ...Reflect.ownKeys(target),
        ...(typeof current === 'object' && current !== null
          ? Reflect.ownKeys(current)
          : []),
      ]),
    ];
  }

  getOwnPropertyDescriptor(
    target: object,
    property: string | symbol,
  ): PropertyDescriptor | undefined {
    const current = this.source();
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
  }
}

/** The one object a component template receives: its inputs, by name. */
class ComponentInputsHandler implements ProxyHandler<object> {
  private readonly propKeys: readonly string[];
  private readonly propSources: readonly ɵCraftPrivateCell<unknown>[];
  private readonly inputShell: (index: number) => unknown;
  private readonly lexicalContext: RenderContext;

  constructor(
    propKeys: readonly string[],
    propSources: readonly ɵCraftPrivateCell<unknown>[],
    inputShell: (index: number) => unknown,
    lexicalContext: RenderContext,
  ) {
    this.propKeys = propKeys;
    this.propSources = propSources;
    this.inputShell = inputShell;
    this.lexicalContext = lexicalContext;
  }

  private read(index: number): unknown {
    const value = this.propSources[index]();
    return shouldUseInputShell(value)
      ? this.inputShell(index)
      : preserveContentDeclarationContext(value, this.lexicalContext);
  }

  get(target: object, property: string | symbol, receiver: unknown): unknown {
    const index = this.propKeys.indexOf(String(property));
    return index !== -1
      ? this.read(index)
      : Reflect.get(target, property, receiver);
  }

  has(target: object, property: string | symbol): boolean {
    return (
      this.propKeys.includes(String(property)) || Reflect.has(target, property)
    );
  }

  ownKeys(target: object): (string | symbol)[] {
    return [...new Set([...Reflect.ownKeys(target), ...this.propKeys])];
  }

  getOwnPropertyDescriptor(
    target: object,
    property: string | symbol,
  ): PropertyDescriptor | undefined {
    const index = this.propKeys.indexOf(String(property));
    return index === -1
      ? Reflect.getOwnPropertyDescriptor(target, property)
      : {
          configurable: true,
          enumerable: true,
          value: this.read(index),
        };
  }
}

const NO_COMPILED_OBSERVERS: readonly unknown[] = [];

/** A plan is an acceleration of plain browser rendering, never a new semantics. */
function canMountCompiledComponent(
  node: Extract<CraftNode, { kind: 'component' }>,
  context: RenderContext,
): boolean {
  const plan = compiledTemplateFor(node.component);
  if (
    !plan ||
    plan.bindings.some((binding) => {
      if (!binding.input || binding.key) return false;
      const property = Object.getOwnPropertyDescriptor(
        node.props,
        binding.input,
      );
      return (
        !property ||
        !('value' in property) ||
        property.value == null ||
        typeof property.value === 'object'
      );
    })
  )
    return false;
  return (
    !node.injector &&
    !Object.keys(node.props).some(isHostProperty) &&
    canUseCompiledDefinition(node.component, context)
  );
}

function canUseCompiledDefinition(
  component: CraftComponent<object>,
  context: RenderContext,
): boolean {
  if (
    !compiledTemplateFor(component) ||
    context.mode !== 'create' ||
    context.ssr ||
    context.emitHydrationKeys ||
    context.pendingBoundary ||
    context.exceptionBoundary ||
    context.fieldExceptionBoundary
  )
    return false;
  const definition = component[CRAFT_COMPONENT];
  if (
    definition.composition ||
    definition.service.length ||
    definition.meta.providers?.length ||
    Object.keys(definition.meta.host ?? {}).length ||
    definition.scopeOwners.length !== 1
  )
    return false;
  return ambientOf(context).compilationAllowed;
}

/** Fixed DOM shape; native DI ownership and independent binding effects. */
class CompiledComponentRenderedNode implements RenderedNode {
  readonly kind = 'component';
  private readonly component: CraftComponent<object>;
  private readonly plan: CompiledTemplatePlan;
  private readonly injector: EnvironmentInjector;
  private readonly propKeys: string[];
  private readonly sources: ɵCraftPrivateCell<unknown>[];
  private readonly effects: EffectRef[] = [];
  private readonly targets: ɵCraftReplayTargetRecord[] = [];
  private release: (() => void) | undefined;
  private unregister: (() => void) | undefined;
  private nodes: Node[] = [];
  private readonly context: RenderContext;

  constructor(
    node: Extract<CraftNode, { kind: 'component' }>,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.context = context;
    this.component = node.component;
    this.plan = compiledTemplateFor(node.component)!;
    const definition = node.component[CRAFT_COMPONENT];
    const ownScope = scopeIdFor(definition.scopeDefinition, definition.name);
    const componentContext = childContext(context, {
      ownerScope: ownScope,
      rootScope: scopeTokens(context.rootScope, ownScope),
      componentName: definition.name,
      declarationContext:
        (node.declarationContext as RenderContext | undefined) ?? context,
      directiveNames: [],
      traceState: { renderCount: 1 },
    });
    this.injector = ɵcreatePreparedEnvironmentInjector(
      preparedComponentProviders(definition),
      context.injector as EnvironmentInjector,
      {
        identity: context.identity,
        element: isElementNode(parent) ? parent : parent.parentElement,
      } satisfies ComponentScope,
    );
    const renderContext = renderInOwnInjector(
      componentContext,
      this.injector,
      [],
      new RenderAmbient(this.injector, ambientOf(context)),
    );
    this.propKeys = inputKeys(node.props);
    this.sources = this.propKeys.map((key) =>
      ɵcraftPrivateCell((node.props as Record<string, unknown>)[key]),
    );
    const shells: unknown[] = [];
    const shell = (index: number) =>
      (shells[index] ??= createInputShell(this.sources[index]));
    const inputs = new Proxy(
      (...args: unknown[]) =>
        (shell(0) as (...args: unknown[]) => unknown)(...args),
      new ComponentInputsHandler(
        this.propKeys,
        this.sources,
        shell,
        componentContext.declarationContext!,
      ),
    );
    try {
      this.release = ɵregisterCraftTarget(
        this.injector,
        this.component,
        undefined,
        componentHostName(this.injector, definition.name),
      );
      untracked(() =>
        runInInjectionContext(this.injector, () => {
          this.nodes = createCompiledNodes(this.plan, context.renderer);
          const root = this.nodes[0] as Element;
          context.renderer.setAttribute(
            root,
            'data-craft-root',
            componentContext.rootScope!,
          );
          const readers = this.plan.bind(inputs);
          for (const target of this.plan.elements) {
            const identity = ɵchildCraftRenderIdentity(
              context.identity,
              0,
              ...target.path,
            );
            this.targets.push(
              ɵlinkCraftReplayTarget(
                this.nodes[target.slot] as Element,
                identity,
                context.replayTargetStable !== false,
                context.replayTargets,
              ),
            );
          }
          for (let index = 0; index < this.plan.bindings.length; index++) {
            const binding = this.plan.bindings[index];
            const bindingContext = childContext(renderContext, {
              identity: ɵchildCraftRenderIdentity(
                context.identity,
                0,
                ...binding.path,
              ),
              rootScope: undefined,
            });
            let seen = false,
              previous: unknown;
            this.effects.push(
              createRenderEffect(
                bindingContext,
                binding.key
                  ? attributeNames(binding.key).effect
                  : 'text-binding',
                () => {
                  const source = (binding as { indirect?: boolean }).indirect
                    ? (readers[index] as () => unknown)()
                    : readers[index];
                  let value = resolveTemplateValue(source, bindingContext);
                  if (binding.key === 'class')
                    value = className(value, bindingContext);
                  else if (!binding.key)
                    value =
                      value === null || value === undefined || value === false
                        ? ''
                        : String(value);
                  if (seen && Object.is(previous, value)) return;
                  if (binding.key === 'class') {
                    if (value)
                      context.renderer.setAttribute(
                        this.nodes[binding.slot] as Element,
                        'class',
                        value as string,
                      );
                    else
                      context.renderer.removeAttribute(
                        this.nodes[binding.slot] as Element,
                        'class',
                      );
                  } else if (binding.key)
                    applyAttribute(
                      context.renderer,
                      this.nodes[binding.slot] as Element,
                      binding.key,
                      value,
                      bindingContext,
                    );
                  else
                    context.renderer.setValue(
                      this.nodes[binding.slot] as Text,
                      value as string,
                    );
                  previous = value;
                  seen = true;
                },
              ),
            );
          }
          insertBefore(context.renderer, parent, root, before);
        }),
      );
      this.unregister = this.injector
        .get(DestroyRef)
        .onDestroy(() => this.destroy());
    } catch (error) {
      try {
        this.destroy();
      } catch {
        /* Preserve the mounting failure. */
      }
      throw error;
    }
  }

  firstNode(): NativeNode {
    return this.nodes[0];
  }
  lastNode(): NativeNode {
    return this.nodes[0];
  }
  patch(node: CraftNode): boolean {
    if (
      node.kind !== 'component' ||
      node.component !== this.component ||
      compiledTemplateFor(node.component) !== this.plan ||
      !canMountCompiledComponent(node, this.context)
    )
      return false;
    const keys = inputKeys(node.props);
    if (
      keys.length !== this.propKeys.length ||
      keys.some((key, index) => key !== this.propKeys[index])
    )
      return false;
    ɵcraftBatch(() =>
      this.propKeys.forEach((key, index) =>
        this.sources[index].set((node.props as Record<string, unknown>)[key]),
      ),
    );
    return true;
  }
  destroy(detached = false): void {
    if (!ɵbeginCraftOwnerDestruction(this)) return;
    let errors: unknown[] | undefined;
    try {
      this.unregister?.();
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
    try {
      destroyCompiledEffects(this.effects);
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
    try {
      unlinkCompiledTargets(this.targets);
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
    try {
      this.release?.();
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
    if (!detached && this.nodes[0]) {
      try {
        removeNode(this.context.renderer, this.nodes[0]);
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }
    try {
      this.injector.destroy();
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
    this.nodes.length = 0;
    throwCleanupErrors(errors);
  }
}

// As on the generic renderer, successful teardown needs no temporary cleanup
// arrays or per-resource closures. Keep each group's error aggregation intact.
function destroyCompiledEffects(effects: EffectRef[]): void {
  let errors: unknown[] | undefined;
  for (const effect of effects) {
    try {
      effect.destroy();
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
  }
  effects.length = 0;
  throwCleanupErrors(errors);
}

function unlinkCompiledTargets(targets: ɵCraftReplayTargetRecord[]): void {
  let errors: unknown[] | undefined;
  for (const target of targets) {
    try {
      ɵunlinkCraftReplayTarget(target);
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
  }
  targets.length = 0;
  throwCleanupErrors(errors);
}

class ComponentRenderedNode implements RenderedNode {
  readonly kind = 'component';
  private destroyed = false;
  private environmentInjector: EnvironmentInjector | undefined;
  private readonly propKeys: string[];
  // Renderer-private cells: application code receives the values they hold
  // through the input shells, never the cells themselves.
  private readonly propSources: ɵCraftPrivateCell<unknown>[];
  private readonly hostPropsSource: ɵCraftPrivateCell<
    ReturnType<typeof hostPropsFromComponentProps>
  >;
  private readonly view: FragmentRenderedNode;
  private readonly effectRef: EffectRef;
  private composedTemplateEffect: EffectRef | undefined;
  private componentExceptionEffect: EffectRef | undefined;
  private syncTemplateFlushRelease: (() => void) | undefined;
  private componentFallbackVisible = false;
  private componentFallbackException: AnyCraftException | undefined;
  private providerTrackers: readonly (() => unknown)[] = [];
  private readonly componentProviders:
    | readonly CraftServiceProvider[]
    | undefined;
  private readonly templateOnly: boolean;
  private readonly traceState: TemplateTraceState;
  private readonly componentRenderContext: RenderContext;
  private traceCreated = false;
  /** Ambient of this component's own injector, when it has no composition. */
  private ownAmbient: RenderAmbient | undefined;
  // Kept as one array for the whole component: the nodes that read it (a field
  // error boundary looking for validation cases) hold on to the reference.
  private readonly resolvedServices: unknown[] = [];
  private templateArgs: readonly unknown[] = [];
  private latestTemplate: CraftNodeChildren = [];
  private registrationReleases: (() => void)[] = [];
  private readonly hostBindings: HostPropertyBindings | undefined;

  private component: CraftComponent<object>;
  private readonly context: RenderContext;

  constructor(
    component: CraftComponent<object>,
    props: object,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
    hostTarget?: Element,
    templateContext?: { readonly value: unknown },
    additionalProviders: readonly CraftServiceProvider[] = [],
    declarationContext?: RenderContext,
  ) {
    this.component = component;
    this.context = context;
    this.templateOnly = templateContext !== undefined;
    const definition = component[CRAFT_COMPONENT];
    const composition = definition.composition;
    const ownScope = scopeIdFor(definition.scopeDefinition, definition.name);
    this.traceState = { renderCount: 0 };
    const componentRenderContext = childContext(context, {
      ownerScope: ownScope,
      rootScope: scopeTokens(context.rootScope, ownScope),
      componentName: definition.name,
      declarationContext: declarationContext ?? context,
      directiveNames: directiveNamesOf(definition),
      traceState: this.traceState,
    });
    this.componentRenderContext = componentRenderContext;
    this.hostBindings = hostTarget
      ? new HostPropertyBindings(hostTarget, context)
      : undefined;
    const componentElement =
      hostTarget ?? (isElementNode(parent) ? parent : parent.parentElement);
    // The runtime accepts any parent injector even
    // though the public helper narrows the type to EnvironmentInjector. Keep
    // the immediate parent here: unwrapping it through
    // `get(EnvironmentInjector)` would skip route-scoped providers such as
    // CraftRouteContext and ChildrenOutletContexts.
    const parentInjector = context.injector as EnvironmentInjector;
    if (!composition) {
      const scopeInjector =
        additionalProviders.length === 0
          ? ɵcreatePreparedEnvironmentInjector(
              preparedComponentProviders(definition),
              parentInjector,
              {
                identity: componentRenderContext.identity,
                element: componentElement,
              } satisfies ComponentScope,
            )
          : createEnvironmentInjector(
              [
                ...componentHostProviders(definition),
                provideCraftRenderIdentity(componentRenderContext.identity),
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
      // A service transform wraps what the scope above resolved, so it has to
      // live one scope below the providers it decorates.
      this.environmentInjector = definition.service.length
        ? createEnvironmentInjector(
            [...definition.service],
            scopeInjector,
            'CraftComponentServiceTransforms',
          )
        : scopeInjector;
      // Nothing this component declares can change what its parent resolved.
      const inheritsAmbient =
        (definition.meta.providers?.length ?? 0) === 0 &&
        additionalProviders.length === 0 &&
        definition.service.length === 0;
      this.ownAmbient = new RenderAmbient(
        this.environmentInjector,
        inheritsAmbient ? ambientOf(context) : undefined,
      );
      this.traceCreated = true;
      if (this.ownAmbient.development) {
        traceComponentLifecycle(
          this.environmentInjector,
          'create',
          definition.name,
          this.traceState.renderCount,
        );
      }
    }
    this.propKeys = this.templateOnly ? [] : inputKeys(props);
    this.propSources = this.propKeys.map((key) =>
      ɵcraftPrivateCell((props as Record<string, unknown>)[key]),
    );
    this.hostPropsSource = ɵcraftPrivateCell(
      hostPropsFromComponentProps(props as Readonly<Record<string, unknown>>),
    );

    // A shell is created when the template first reads its input: an input
    // the template never reads costs nothing.
    const inputShells: unknown[] = [];
    const inputShell = (index: number): unknown =>
      (inputShells[index] ??= createInputShell(this.propSources[index]));

    // A component takes its inputs as one object. The callable shell keeps the
    // historical Input<T> invocation while exposing the object's properties.
    const args = this.templateOnly
      ? [templateContext?.value]
      : [
          new Proxy(
            ((...callbackArgs: unknown[]) =>
              (inputShell(0) as (...args: unknown[]) => unknown)(
                ...callbackArgs,
              )) as (...args: unknown[]) => unknown,
            new ComponentInputsHandler(
              this.propKeys,
              this.propSources,
              inputShell,
              declarationContext ?? context,
            ),
          ),
        ];

    this.templateArgs = args;
    const componentProviders = composition?.componentProviders;
    this.componentProviders = componentProviders
      ? untracked(() => componentProviders(args[0] as object))
      : undefined;
    if (!composition) {
      this.registerRuntimeTargets(
        definition,
        undefined,
        this.environmentInjector!,
      );
    }

    // A plain component renders in its own injector from the start: the
    // context built above, which nothing else holds yet, becomes the context
    // of its view instead of being copied into it.
    const viewContext = composition
      ? childContext(componentRenderContext, {
          injector: parentInjector,
          componentContext: this.resolvedServices,
          ambient: componentRenderContext.ambient,
        })
      : renderInOwnInjector(
          componentRenderContext,
          this.environmentInjector as EnvironmentInjector,
          this.resolvedServices,
          this.ownAmbient,
        );
    this.view = composition
      ? createFragment(parent, before, viewContext, [], 'craft-component')
      : createSingleRootFragment(
          parent,
          before,
          viewContext,
          'craft-component',
        );

    if (composition) {
      this.effectRef = untracked(() =>
        runInInjectionContext(parentInjector, () =>
          ɵcraftEffectRef(
            'component-render',
            (onCleanup: (cleanup: () => void) => void) => {
              // Input-bound providers own a stable scope. Template and host
              // updates are tracked by the dedicated template effect below.
              // Preserve the reactive scope lifecycle of withProviders.
              if (!composition.componentProviders) {
                this.propSources.forEach((source) => source());
                this.hostPropsSource();
              }
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
            },
          ),
        ),
      );
      return;
    }

    const environmentInjector = this.environmentInjector!;
    // The same effect a binding gets: owned and destroyed by this node. Like
    // `craftEffect`, it also stops with the injector it renders in.
    const renderEffect = new ɵCraftRenderEffect(
      'component-render',
      () => {
        try {
          const callSiteHostProps = this.hostPropsSource();
          // A context of its own for each render: content declared by this
          // render is told apart from the previous one by it.
          const renderContext = childContext(componentRenderContext);
          this.traceState.renderCount += 1;
          const renderTemplate = () =>
            withCraftRenderContext(renderContext, () => {
              this.resolvedServices.length = 0;
              return renderCraftComponentTemplate(
                definition,
                args,
                callSiteHostProps,
                renderContext.injector,
                (instance) => this.resolvedServices.push(instance),
                ambientOf(renderContext).fnAdapter,
              );
            });
          this.latestTemplate = ambientOf(renderContext).development
            ? executeTemplateTrace(
                renderContext.injector,
                traceContext(
                  renderContext,
                  'component',
                  this.traceState.renderCount === 1
                    ? 'initialRender'
                    : 'update',
                  definition.name,
                ),
                renderTemplate,
              )
            : renderTemplate();
          this.view.patchChildren(this.latestTemplate);
          if (this.hostBindings) {
            this.hostBindings.patch(
              mergeHostProps(definition.meta.host ?? {}, callSiteHostProps),
            );
          }
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
      environmentInjector,
      this.ownAmbient ?? new RenderAmbient(environmentInjector, undefined),
    );
    const stopWithInjector = () => renderEffect.destroy();
    const owner = environmentInjector as EnvironmentInjector & {
      ɵonDestroy?: (callback: () => void) => void;
    };
    if (typeof owner.ɵonDestroy === 'function') {
      owner.ɵonDestroy(stopWithInjector);
    } else {
      environmentInjector.get(DestroyRef).onDestroy(stopWithInjector);
    }
    this.effectRef = renderEffect;
  }

  firstNode(): NativeNode {
    return this.view.firstNode();
  }

  private refreshComposedComponent(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    args: readonly unknown[],
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
        ...componentHostProviders(definition),
        provideCraftRenderIdentity(componentRenderContext.identity),
        ...(definition.meta.providers ?? []),
        ...(this.componentProviders ?? composition.providers ?? []),
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
      ɵrunCraftCleanups([
        () => {
          ɵrunCraftCleanups(this.registrationReleases.splice(0));
        },
        () => {
          this.registrationReleases = [];
        },
        () => {
          this.composedTemplateEffect?.destroy();
        },
        () => {
          this.composedTemplateEffect = undefined;
        },
        () => {
          this.syncTemplateFlushRelease?.();
        },
        () => {
          this.syncTemplateFlushRelease = undefined;
        },
        () => {
          this.componentExceptionEffect?.destroy();
        },
        () => {
          this.componentExceptionEffect = undefined;
        },
        () => {
          this.componentFallbackVisible = false;
        },
        () => {
          this.componentFallbackException = undefined;
        },
        () => {
          this.view.patchChildren([]);
        },
        () => {
          renderInjector.destroy();
        },
        () => {
          if (renderInjector !== environmentInjector) {
            environmentInjector.destroy();
          }
        },
        () => {
          this.providerTrackers = [];
        },
        () => {
          if (this.environmentInjector === renderInjector) {
            this.environmentInjector = undefined;
          }
        },
      ]);
    });

    let renderContext: RenderContext;
    const handledResourceExceptionCodes = new Set<string>();
    const componentBoundary = composition.catchNodePosition
      ? (exception: AnyCraftException): boolean => {
          if (!composition.catchHandlers?.[exception._tag]) {
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
        this.componentProviders ?? composition.providers ?? [],
        environmentInjector,
        false,
        undefined,
        this.componentProviders !== undefined,
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
      const scopedProviders = [
        ...providerResolution.overrides,
        ...definition.service,
      ];
      if (scopedProviders.length > 0) {
        renderInjector = createEnvironmentInjector(
          scopedProviders,
          environmentInjector,
          'CraftComponentProviders',
        );
        this.environmentInjector = renderInjector;
      }
      renderContext = childContext(componentRenderContext, {
        injector: renderInjector,
        handledResourceExceptionCodes,
        componentContext: this.resolvedServices,
      });
      this.view.updateContext(renderContext);
      this.registerRuntimeTargets(definition, undefined, renderInjector);
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

    this.composedTemplateEffect = untracked(() =>
      runInInjectionContext(renderInjector, () =>
        ɵcraftEffectRef('component-template', () => {
          this.renderComposedTemplate(
            definition,
            args,
            renderInjector,
            renderContext,
            context,
            hostTarget,
          );
          if (composition.catchNodePosition && !this.componentExceptionEffect) {
            this.installComponentExceptionEffect(
              definition,
              args,
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
        args,
        renderInjector,
        renderContext,
        context,
        hostTarget,
      );
    });
  }

  private installComponentExceptionEffect(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    args: readonly unknown[],
    renderInjector: EnvironmentInjector,
    renderContext: RenderContext,
    context: RenderContext,
    hostTarget: Element | undefined,
  ): void {
    this.componentExceptionEffect = untracked(() =>
      runInInjectionContext(renderInjector, () =>
        ɵcraftEffectRef(
          'component-catch-node-resource-exceptions',
          () => {
            const exception = findResourceException(this.resolvedServices);
            if (exception) {
              if (
                renderContext.handledResourceExceptionCodes?.has(exception._tag)
              ) {
                if (this.componentFallbackVisible) {
                  this.componentFallbackVisible = false;
                  this.componentFallbackException = undefined;
                  untracked(() =>
                    this.renderComposedTemplate(
                      definition,
                      args,
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
                  args,
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
    if (this.registrationReleases.length > 0) {
      ɵrunCraftCleanups(this.registrationReleases.splice(0));
    }
    // What a plain component already knows of its own injector: no lookup of
    // the wrappers at each instance, and its tag list read once for both its
    // host name and the tags of its effects.
    const ambient =
      injector === this.environmentInjector ? this.ownAmbient : undefined;
    const wrappers = ambient?.targetWrappers;
    const tags = injector.get(HOST_TAG_LIST, NO_HOST_TAGS);
    ambient?.seedOwnerTags(tags);
    const release = ɵregisterCraftTarget(
      injector,
      this.component,
      factoryContext,
      componentHostName(injector, definition.name, tags),
      true,
      wrappers,
    );
    const owners = definition.scopeOwners;
    if (owners.length === 1 && owners[0].registrationTarget === undefined) {
      // No directive composed around the component: one registration.
      this.registrationReleases = [release];
      return;
    }
    this.registrationReleases = [
      release,
      ...owners.flatMap((owner) =>
        owner.registrationTarget === undefined
          ? []
          : [
              ɵregisterCraftTarget(
                injector,
                owner.registrationTarget,
                factoryContext,
                allocateCraftHostName(injector, 'directive', owner.name),
                true,
                wrappers,
              ),
            ],
      ),
    ];
  }

  private renderComposedTemplate(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    args: readonly unknown[],
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
        args,
        renderContext,
      );
      const children = this.withComponentFieldError(
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
    args: readonly unknown[],
    renderContext: RenderContext,
  ): { readonly children: CraftNodeChildren; readonly hostProps: HostProps } {
    this.view.updateContext(
      childContext(renderContext, {
        componentContext: this.resolvedServices,
      }),
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
          withCraftRenderContext(renderContext, () => {
            this.resolvedServices.length = 0;
            return renderCraftComponentTemplate(
              definition,
              args,
              callSiteHostProps,
              renderContext.injector,
              (instance) => this.resolvedServices.push(instance),
            );
          }),
      ),
      hostProps,
    };
  }

  private withComponentFieldError(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    children: CraftNodeChildren,
  ): CraftNodeChildren {
    const handlers = definition.composition?.fieldExceptionHandlers;
    const options = definition.composition?.fieldExceptionOptions;
    if (!handlers || !options) return children;
    return {
      kind: 'field-error',
      source: children,
      handlers,
      options,
    } as FieldErrorNode<any, any, any, any>;
  }

  private renderComposedException(
    definition: (typeof this.component)[typeof CRAFT_COMPONENT],
    exception: AnyCraftException,
    environmentInjector: EnvironmentInjector,
    renderContext: RenderContext,
    context: RenderContext,
    hostTarget: Element | undefined,
    preserveSource = false,
  ): void {
    const blockHandler =
      definition.composition?.catchHandlers?.[exception._tag];
    const tagHandler =
      definition.composition?.catchTagHandlers?.[exception._tag];
    if (!blockHandler && !tagHandler) {
      if (this.context.exceptionBoundary?.(exception)) {
        return;
      }
      throw new CraftUnhandledExceptionError(exception);
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
        resolveCatchHandler(
          blockHandler!,
          exception,
          false,
          definition.composition?.catchNodePosition ?? 'after',
        ),
      );
      if (preserveSource && resolved.showSource) {
        try {
          const source = untracked(() =>
            this.composedTemplateChildren(
              definition,
              this.templateArgs,
              renderContext,
            ),
          );
          const children =
            resolved.position === 'before'
              ? [
                  resolved.children,
                  this.withComponentFieldError(definition, source.children),
                ]
              : [
                  this.withComponentFieldError(definition, source.children),
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
    // One update, not one per input: effects run synchronously, so each separate write
    // would run the component's template again with the others still the old value, and
    // a component with twelve inputs would be drawn thirteen times for one change —
    // each of them patching its own children the same way.
    ɵcraftBatch(() => {
      this.propKeys.forEach((key, index) => {
        this.propSources[index].set(props[key]);
      });
      // The host properties are a new object at every patch. Publishing it as
      // it is would run the component's template again each time its parent
      // renders, inputs unchanged: only a difference is a change.
      const hostProps = hostPropsFromComponentProps(
        props as Readonly<Record<string, unknown>>,
      );
      if (!sameHostProps(untracked(this.hostPropsSource), hostProps)) {
        this.hostPropsSource.set(hostProps);
      }
    });
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
      throw new Error('Cannot update the inputs of a mounted component.');
    }

    this.templateArgs = [context];
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
        renderCraftComponentTemplate(
          definition,
          this.templateArgs,
          callSiteHostProps,
          this.environmentInjector ?? this.context.injector,
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

  destroy(detached?: boolean): void {
    if (this.destroyed) return;
    this.destroyed = true;
    // Every release runs, in this order, before any failure surfaces.
    let errors: unknown[] | undefined;
    if (this.traceCreated) {
      try {
        // Nothing traces outside development: no trace to build then.
        if (this.ownAmbient?.development !== false) {
          traceComponentLifecycle(
            this.environmentInjector ?? this.context.injector,
            'destroy',
            this.componentRenderContext.componentName ?? 'unknown',
            this.traceState.renderCount,
          );
        }
        this.traceCreated = false;
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }
    try {
      this.effectRef.destroy();
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
    if (this.hostBindings) {
      try {
        this.hostBindings.destroy();
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }
    try {
      this.view.destroy(detached);
    } catch (error) {
      errors = keepCleanupError(errors, error);
    }
    if (this.environmentInjector) {
      try {
        this.environmentInjector.destroy();
      } catch (error) {
        errors = keepCleanupError(errors, error);
      }
    }
    throwCleanupErrors(errors);
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
  private readonly replayTargetId: string;
  private readonly unregisterReplayTarget: () => void;

  private node: DeferNode<unknown>;
  private readonly parent: NativeParent;
  private readonly context: RenderContext;

  constructor(
    node: DeferNode<unknown>,
    parent: NativeParent,
    before: NativeNode | null,
    context: RenderContext,
  ) {
    this.node = node;
    this.parent = parent;
    this.context = context;
    this.view = createFragment(
      parent,
      before,
      context,
      node.placeholder
        ? renderDeferChildren(context, 'placeholder', node.placeholder)
        : [],
      'craft-defer',
    );
    const triggerElement = this.firstElementInView();
    const replayTarget = triggerElement
      ? ɵcaptureCraftReplayTarget(triggerElement)
      : undefined;
    const registration = ɵregisterCraftDeferReplayTarget(
      replayTarget
        ? [
            ...replayTarget.componentPath,
            ...replayTarget.localTargetPath.map(String),
          ]
        : [...context.identity.path, 'defer'],
      () => this.startLoad('replay', true),
      replayTarget?.stability !== 'unstable' &&
        context.replayTargetStable !== false,
    );
    this.replayTargetId = registration.id;
    this.unregisterReplayTarget = registration.unregister;
    // Replay drives this node from its recorded activation step. Installing
    // native or browser triggers here would race that step and run the loader
    // twice.
    if (!isCraftReplaying()) this.installTrigger();
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
      this.startLoad('immediate');
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
        const handle = idleWindow.requestIdleCallback(() =>
          this.startLoad('idle'),
        );
        this.triggerCleanup = () => idleWindow.cancelIdleCallback?.(handle);
      } else {
        this.triggerTimer = ɵinjectCraftTemporalRuntime().schedule(
          () => this.startLoad('idle'),
          0,
          {
            kind: 'defer-trigger',
            owner: this.context.componentName,
          },
        );
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
            this.startLoad('viewport');
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
        if (event && isElementNode(target)) {
          const tag = target.tagName.toLowerCase();
          const localName = target.getAttribute('data-craft-name') ?? undefined;
          const hooks = ɵinjectCraftDomEventHooks(this.context.injector);
          const interaction: CraftDomEvent = {
            event,
            eventName: event.type,
            element: target,
            elementTag: tag,
            elementName: localName,
            componentName: this.context.componentName,
            interactionName: interactionName(
              event.type,
              tag,
              localName,
              this.context.componentName,
            ),
          };
          runInInjectionContext(this.context.injector, () =>
            executeDomEventHooks(hooks, interaction, () =>
              this.startLoad('interaction'),
            ),
          );
          return;
        }
        this.startLoad('interaction');
      };
      if (isElementNode(target)) {
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

    this.triggerTimer = ɵinjectCraftTemporalRuntime().schedule(
      () => this.startLoad(this.node.trigger),
      0,
      {
        kind: 'defer-trigger',
        owner: this.context.componentName,
      },
    );
    this.triggerCleanup = () => this.triggerTimer?.cancel();
  }

  private firstElementInView(): Element | undefined {
    let current = this.view.firstNode().nextSibling;
    while (current && current !== this.view.lastNode()) {
      if (current.nodeType === 1) {
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

  private startLoad(
    trigger: string,
    replay = false,
  ): Promise<'loaded' | 'error'> {
    if (this.state !== 'placeholder' || this.destroyed) {
      return Promise.resolve('error');
    }
    if (isCraftReplaying() && !replay) return Promise.resolve('error');
    const session = runInInjectionContext(this.context.injector, () =>
      ɵinjectSendContextSession(),
    );
    const activation =
      session && !replay
        ? session.capture('defer', 'started', {
            name: trigger,
            ...(trigger === 'interaction'
              ? {
                  correlationId: runInInjectionContext(
                    this.context.injector,
                    () =>
                      ɵcurrentCorrelationId(ɵinjectCorrelationIdService()) ??
                      undefined,
                  ),
                }
              : {}),
            payload: { targetId: this.replayTargetId, trigger },
          })
        : undefined;
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
    return executeCraftComponentFactoryAsync(
      function* () {
        return yield* craftLazy(loader);
      },
      [],
      this.context.injector,
    )
      .then((settled): 'loaded' | 'error' => {
        if (this.destroyed) {
          return 'error';
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
          if (activation)
            session?.capture('defer', 'failed', {
              name: trigger,
              operationId: activation.id,
              payload: {
                targetId: this.replayTargetId,
                activationEventId: activation.id,
                outcome: 'error',
              },
              response: settled.exception,
            });
          return 'error';
        }

        this.state = 'loaded';
        this.loadedValue = settled.value;
        this.view.patchChildren(
          renderDeferChildren(this.context, 'resolve', this.node.resolve, [
            settled.value,
          ]),
        );
        this.setBusy(false);
        if (activation)
          session?.capture('defer', 'succeeded', {
            name: trigger,
            operationId: activation.id,
            payload: {
              targetId: this.replayTargetId,
              activationEventId: activation.id,
              outcome: 'loaded',
            },
          });
        return 'loaded';
      })
      .catch((error: unknown): 'loaded' | 'error' => {
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
        if (activation)
          session?.capture('defer', 'failed', {
            name: trigger,
            operationId: activation.id,
            payload: {
              targetId: this.replayTargetId,
              activationEventId: activation.id,
              outcome: 'error',
            },
            response: error,
          });
        return 'error';
      });
  }

  destroy(): void {
    ɵdestroyCraftOwner(this, [
      () => {
        this.destroyed = true;
      },
      () => {
        this.unregisterReplayTarget();
      },
      () => {
        this.triggerCleanup?.();
      },
      () => {
        this.view.destroy();
      },
    ]);
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.view.destroy();
      },
    ]);
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
    const created = createElementForRender(this.tag, parent, before, context);
    this.elementView = new ElementRenderedNode(
      created.element,
      this.tag,
      created.context,
      {
        kind: 'element',
        tag: this.tag,
        props: node.props,
        children: node.children,
      },
    );
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
    ɵdestroyCraftOwner(this, [
      () => {
        this.elementView.destroy();
      },
    ]);
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
      if (!context.emitHydrationKeys && !isHydrating(context)) {
        const text = context.renderer.createText(node.value);
        insertBefore(context.renderer, parent, text, before);
        return new TextRenderedNode(text, node.value, context.renderer);
      }
      const created = createTextForRender(
        node.value,
        parent,
        before,
        context,
        true,
      );
      return new TextRenderedNode(
        created.text,
        node.value,
        created.context.renderer,
      );
    }
    case 'reactive-text': {
      if (!context.emitHydrationKeys && !isHydrating(context)) {
        const text = context.renderer.createText('');
        insertBefore(context.renderer, parent, text, before);
        return new ReactiveTextRenderedNode(text, node.binding, context);
      }
      const created = createTextForRender('', parent, before, context, false);
      return new ReactiveTextRenderedNode(
        created.text,
        node.binding,
        created.context,
      );
    }
    case 'service-shortcut-text': {
      const resolved = executeTemplateCallback(
        () => node.shortcut,
        [],
        context,
      );
      if (typeof resolved === 'function') {
        const created = createTextForRender('', parent, before, context, false);
        return new ReactiveTextRenderedNode(
          created.text,
          resolved as CraftTextBinding,
          created.context,
        );
      }
      const value =
        resolved === null || resolved === undefined || resolved === false
          ? ''
          : String(resolved);
      const created = createTextForRender(value, parent, before, context, true);
      return new TextRenderedNode(
        created.text,
        value,
        created.context.renderer,
      );
    }
    case 'element': {
      if (!isHydrating(context)) {
        const element = context.renderer.createElement(node.tag);
        if (context.emitHydrationKeys) {
          context.renderer.setAttribute(
            element,
            'data-craft-hk',
            context.identity.hydrationKey,
          );
        }
        insertBefore(context.renderer, parent, element, before);
        if (context.rootScope) {
          context.renderer.setAttribute(
            element,
            'data-craft-root',
            context.rootScope,
          );
        }
        return new ElementRenderedNode(element, node.tag, context, node);
      }
      const created = createElementForRender(node.tag, parent, before, context);
      if (created.context.rootScope) {
        created.context.renderer.setAttribute(
          created.element,
          'data-craft-root',
          created.context.rootScope,
        );
      }
      return new ElementRenderedNode(
        created.element,
        node.tag,
        created.context,
        node,
      );
    }
    case 'component':
      if (canMountCompiledComponent(node, context)) {
        return new CompiledComponentRenderedNode(node, parent, before, context);
      }
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
    case 'directive':
      return new CraftDirectiveRenderedNode(node, parent, before, context);
    case 'for': {
      const start = mountComment(parent, 'craft-for:start', before, context);
      const end = mountComment(parent, 'craft-for:end', before, context);
      return new ForRenderedNode(node, parent, start, end, context);
    }
    case 'if': {
      return new IfRenderedNode(node, parent, before, context);
    }
    case 'heading': {
      return new HeadingRenderedNode(node, parent, before, context);
    }
    case 'heading-section': {
      return new HeadingSectionRenderedNode(node, parent, before, context);
    }
    case 'pending': {
      return new PendingRenderedNode(node, parent, before, context);
    }
    case 'catch': {
      return new CatchRenderedNode(node, parent, before, context);
    }
    case 'field-error': {
      return new FieldErrorRenderedNode(node, parent, before, context);
    }
    case 'match': {
      return new MatchRenderedNode(node, parent, before, context);
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

  private readonly host: Element;
  private readonly context: RenderContext;

  constructor(host: Element, context: RenderContext) {
    this.host = host;
    this.context = context;
  }

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
      if (typeof value === 'function' || isGenerator(value)) {
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
          typeof previousAttributes.get(key) === 'function' ||
          isGenerator(previousAttributes.get(key))
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
    ɵdestroyCraftOwner(this, [
      () => {
        ɵrunCraftCleanups(
          Array.from(
            this.bindings.values(),
            ({ effectRef }) =>
              () =>
                effectRef.destroy(),
          ),
        );
      },
      () => {
        this.bindings.clear();
      },
    ]);
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

export type InterpretedRenderOptions = Readonly<{
  renderer: CraftDomAdapter;
  mode?: 'create' | 'hydrate';
  identity?: CraftRenderIdentity;
  hydration?: HydrationCursor;
  emitHydrationKeys?: boolean;
  ssr?: CraftSsrCoordinator;
}>;

export function mountInterpretedComponent<Props extends object>(
  component: CraftComponent<Props>,
  host: Element,
  injector: Injector,
  props: Props,
): MountedCraftComponent<Props> {
  const craftInjector = injector;
  const renderer = createBrowserDomAdapter(host.ownerDocument);
  return mountInterpretedComponentWithOptions(
    component,
    host,
    craftInjector,
    props,
    { renderer },
  );
}

export function mountInterpretedComponentWithOptions<Props extends object>(
  component: CraftComponent<Props>,
  host: Element,
  injector: Injector,
  props: Props,
  options: InterpretedRenderOptions,
): MountedCraftComponent<Props> {
  const craftInjector = injector;
  const identity =
    options.identity ??
    createCraftRenderIdentity([component[CRAFT_COMPONENT].name, 0]);
  let instance: ComponentRenderedNode;
  try {
    instance = new ComponentRenderedNode(
      component as unknown as CraftComponent<object>,
      props,
      host,
      null,
      rootRenderContext({
        renderer: options.renderer,
        injector: craftInjector,
        mode: options.mode ?? 'create',
        identity,
        hydration: options.hydration,
        emitHydrationKeys: options.emitHydrationKeys,
        ssr: options.ssr,
      }),
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
      ɵdestroyCraftOwner(this, [
        () => {
          instance.destroy();
        },
      ]);
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
  const craftInjector = injector;
  const renderer = createBrowserDomAdapter(host.ownerDocument);
  let instance: ComponentRenderedNode;
  try {
    instance = new ComponentRenderedNode(
      component as CraftComponent<object>,
      {},
      host,
      null,
      rootRenderContext({
        renderer,
        injector: craftInjector,
        mode: 'create',
        identity: createCraftRenderIdentity([
          component[CRAFT_COMPONENT].name,
          0,
        ]),
      }),
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
      ɵdestroyCraftOwner(this, [
        () => {
          instance.destroy();
        },
      ]);
    },
  };
}
