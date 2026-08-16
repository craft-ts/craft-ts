import {
  DestroyRef,
  EnvironmentInjector,
  inject,
  Injector,
  InjectionToken,
  runInInjectionContext,
  type Type,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CRAFT_A11Y_NAVIGATION_FOCUS } from './craft-a11y';
import { isCraftException, type AnyCraftException } from './craft-exception';
import {
  evaluateCraftGuardSync,
  runCraftRouteChainAsync,
  type RouteChainOutcome,
} from './craft-guard-runtime';
import {
  CRAFT_BLANK_MS,
  CRAFT_ERROR_COMPONENT,
  CRAFT_PENDING_COMPONENT,
  CRAFT_PENDING_MIN_MS,
  CRAFT_STAY_MS,
} from './craft-pending';
import {
  CRAFT_GLOBAL_ERROR,
  type CraftExceptionComponentInput,
  type CraftPendingComponentInput,
} from './craft-route-exceptions';
import { getCraftRouteMeta, type CraftRouteMeta } from './craft-route-meta';
import {
  CRAFT_START_VIEW_TRANSITION,
  CRAFT_VIEW_TRANSITION,
  CRAFT_VIEW_TRANSITION_SKIP_BLANK,
  CRAFT_VIEW_TRANSITION_STATE_KEY,
  CRAFT_VIEW_TRANSITIONS_ENABLED,
  type CraftViewTransitionInput,
} from './craft-view-transition';
import {
  CRAFT_TEMPORAL_RUNTIME,
  type TemporalTaskHandle,
} from './temporal-runtime';
import {
  angularRouteTarget,
  angularComponentFromRouteTarget,
  CRAFT_ROUTE_TARGET,
  isCraftRouteTarget,
  normalizeCraftRouteTarget,
  type CraftRouteTarget,
  type CraftRouteTargetInput,
} from './craft-route-target';
import {
  craftSignal,
  craftWatch,
  type CraftWritableSignal,
} from './host/craft-signal';
import {
  serializeLocation,
  type CraftMatch,
} from './host/craft-router-runtime';
import {
  CRAFT_MATCH,
  CRAFT_ROUTER,
  type CraftRouterNavigationApi,
} from './craft-router-tokens';

const ROUTE_PROP_SKIP = new Set(['craftComponent', 'craftPendingComponent']);

export function collectMatchProps(
  match: CraftMatch | null | undefined,
): Record<string, unknown> {
  if (!match) {
    return {};
  }
  const props: Record<string, unknown> = {};
  for (const route of match.routes) {
    assignRoutePropBag(
      props,
      route.data as Record<string, unknown> | undefined,
    );
  }
  assignRoutePropBag(props, match.params);
  assignRoutePropBag(props, match.queryParams);
  return props;
}

/** @deprecated Use {@link collectMatchProps}. */
export const collectActivatedRouteProps = collectMatchProps;

function assignRoutePropBag(
  target: Record<string, unknown>,
  bag: Record<string, unknown> | undefined,
): void {
  if (!bag) {
    return;
  }
  for (const [key, value] of Object.entries(bag)) {
    if (ROUTE_PROP_SKIP.has(key) || typeof value === 'function') {
      continue;
    }
    target[key] = value;
  }
}

export type CraftOutletState =
  | 'idle'
  | 'stay'
  | 'blank'
  | 'pending'
  | 'loaded'
  | 'error';

export const CRAFT_ROUTE_CHAIN_RUNNER = new InjectionToken<
  typeof runCraftRouteChainAsync
>('CRAFT_ROUTE_CHAIN_RUNNER', {
  providedIn: 'root',
  factory: () => runCraftRouteChainAsync,
});

const syncTemplateFlushers = new Set<() => void>();

/** Registers a synchronous template patch invoked from view-transition commits. */
export function registerCraftSyncTemplateFlush(fn: () => void): () => void {
  syncTemplateFlushers.add(fn);
  return () => {
    syncTemplateFlushers.delete(fn);
  };
}

function runRegisteredSyncTemplateFlush(): void {
  for (const flush of syncTemplateFlushers) {
    flush();
  }
}

/**
 * Runs inside `startViewTransition`'s callback after Craft signals commit, so
 * the displayed DOM is patched before the callback returns. Templates driven by
 * `craftEffect` otherwise bump an Angular signal asynchronously.
 */
export const CRAFT_SYNC_TEMPLATE_FLUSH = new InjectionToken<() => void>(
  'CRAFT_SYNC_TEMPLATE_FLUSH',
  {
    providedIn: 'root',
    factory: () => runRegisteredSyncTemplateFlush,
  },
);

/**
 * A non-blocking replacement for `<router-outlet>`. The URL commits immediately
 * (history.push); this outlet reads the route's {@link CraftRouteMeta} and
 * drives canMatch → canActivate → resolve **after** commit.
 */
export class CraftRouterOutletController {
  name = 'primary';

  private readonly rootInjector = inject(EnvironmentInjector);
  private readonly router =
    inject(CRAFT_ROUTER, { optional: true }) ?? silentRouter();
  private readonly destroyRef = inject(DestroyRef);
  private readonly temporalRuntime = inject(CRAFT_TEMPORAL_RUNTIME);

  private readonly defaultPendingComponent = inject(CRAFT_PENDING_COMPONENT);
  private readonly defaultErrorComponent = inject(CRAFT_ERROR_COMPONENT);
  private readonly defaultStayMs = inject(CRAFT_STAY_MS);
  private readonly defaultBlankMs = inject(CRAFT_BLANK_MS);
  private readonly defaultPendingMinMs = inject(CRAFT_PENDING_MIN_MS);
  private readonly chainRunner = inject(CRAFT_ROUTE_CHAIN_RUNNER);

  private readonly viewTransitionsEnabled = inject(
    CRAFT_VIEW_TRANSITIONS_ENABLED,
  );
  private readonly viewTransitionSkipBlank = inject(
    CRAFT_VIEW_TRANSITION_SKIP_BLANK,
  );
  private readonly startViewTransition = inject(CRAFT_START_VIEW_TRANSITION);
  private readonly syncTemplateFlush = inject(CRAFT_SYNC_TEMPLATE_FLUSH);
  private readonly viewTransitionSink = inject(
    CRAFT_VIEW_TRANSITION,
  ) as unknown as {
    set(value: CraftViewTransitionInput): void;
  };
  private readonly a11yNavigationFocus = inject(CRAFT_A11Y_NAVIGATION_FOCUS);
  private readonly document = inject(DOCUMENT);
  private a11yHasCompletedInitialActivation = false;

  readonly displayedComponent: CraftWritableSignal<Type<unknown> | null> =
    craftSignal<Type<unknown> | null>(null);
  readonly displayedTarget: CraftWritableSignal<CraftRouteTarget | null> =
    craftSignal<CraftRouteTarget | null>(null);
  readonly displayedInjector: CraftWritableSignal<Injector | undefined> =
    craftSignal<Injector | undefined>(undefined);
  readonly displayedProps: CraftWritableSignal<
    Readonly<Record<string, unknown>>
  > = craftSignal<Readonly<Record<string, unknown>>>({});

  readonly state: CraftWritableSignal<CraftOutletState> =
    craftSignal<CraftOutletState>('idle');
  readonly targetComponent: CraftWritableSignal<Type<unknown> | null> =
    craftSignal<Type<unknown> | null>(null);
  readonly pendingComponent: CraftWritableSignal<Type<unknown> | null> =
    craftSignal<Type<unknown> | null>(null);
  readonly errorComponent: CraftWritableSignal<Type<unknown> | null> =
    craftSignal<Type<unknown> | null>(null);
  readonly pendingTarget: CraftWritableSignal<CraftRouteTarget | null> =
    craftSignal<CraftRouteTarget | null>(null);
  readonly errorTarget: CraftWritableSignal<CraftRouteTarget | null> =
    craftSignal<CraftRouteTarget | null>(null);

  private _match: CraftMatch | null = null;
  private _liveMatch: CraftWritableSignal<CraftMatch> | null = null;
  private _activeRouteInjector: Injector | null = null;
  private _meta: CraftRouteMeta | null = null;
  private _navId = 0;
  private _stayTimer: TemporalTaskHandle | null = null;
  private _blankTimer: TemporalTaskHandle | null = null;
  private _pendingCommitTimer: TemporalTaskHandle | null = null;
  private _pendingShownAt = 0;
  private _previousUrl = this.router.url;
  private _pendingDeactivation = false;
  private _reactiveWatch: { destroy(): void } | null = null;
  private _matchWatch: { destroy(): void } | null = null;
  private _frozen = false;

  get isActivated(): boolean {
    return this._match !== null;
  }

  get component(): object {
    if (!this._match) {
      throw new Error('CraftRouterOutlet is not activated');
    }
    return (this.targetComponent() ?? {}) as object;
  }

  constructor() {
    const matchSignal = inject(CRAFT_MATCH, { optional: true });
    if (matchSignal) {
      this._matchWatch = craftWatch(() => {
        const match = matchSignal();
        if (match) {
          this.activateMatch(match, this.rootInjector);
        } else if (this._match) {
          this.deactivate();
        }
      });
    }
    this.destroyRef.onDestroy(() => this.destroy());
  }

  destroy(): void {
    this._matchWatch?.destroy();
    this._matchWatch = null;
    this.teardown();
  }

  deactivate(): void {
    this.teardown();
    this._match = null;
    this._liveMatch = null;
    this._activeRouteInjector = null;
    this._meta = null;
    this._previousUrl = this.router.url;
    this._pendingDeactivation = true;
    queueMicrotask(() => {
      if (this._pendingDeactivation) {
        this._pendingDeactivation = false;
        this.state.set('idle');
        this.displayedComponent.set(null);
        this.displayedTarget.set(null);
        this.targetComponent.set(null);
        this.errorComponent.set(null);
      }
    });
  }

  activateMatch(
    match: CraftMatch,
    environmentInjector?: EnvironmentInjector,
  ): void {
    this._pendingDeactivation = false;
    const previousMatchUrl = this._match
      ? serializeLocation(this._match)
      : this._previousUrl;

    if (
      this._match &&
      this._liveMatch &&
      this._activeRouteInjector &&
      isSameActivation(this._match, match)
    ) {
      this._match = match;
      this._liveMatch.set(match);
      this.displayedProps.set(collectMatchProps(match));
      return;
    }

    this._previousUrl = previousMatchUrl;
    this.teardown();
    this._match = match;
    this._liveMatch = craftSignal(match);
    const routeProviders = match.routes.flatMap((route) => {
      const providers = route.providers;
      return Array.isArray(providers) ? providers : [];
    });
    this._activeRouteInjector = Injector.create({
      providers: [
        { provide: CRAFT_MATCH, useValue: this._liveMatch },
        ...(routeProviders as never[]),
      ],
      parent: environmentInjector ?? this.rootInjector,
      name: 'CraftRouterOutlet',
    });

    this.publishViewTransitionPayload();

    const meta = getCraftRouteMeta(
      match.data as Record<string | symbol, unknown>,
    );
    this._meta = meta ?? null;
    this.clearExceptionSinks(meta);
    void this.finishActivation(match, meta ?? null);
  }

  private async finishActivation(
    match: CraftMatch,
    meta: CraftRouteMeta | null,
  ): Promise<void> {
    if (this._match !== match) {
      return;
    }
    if (
      typeof match.route.loadComponent === 'function' &&
      !match.route.component
    ) {
      try {
        const loaded = await Promise.resolve(match.route.loadComponent());
        if (this._match !== match) {
          return;
        }
        const component =
          loaded && typeof loaded === 'object' && 'default' in loaded
            ? (loaded as { default: unknown }).default
            : loaded;
        match.route.component = component;
      } catch {
        return;
      }
    }
    const component = this.resolveRouteComponent(match);
    this.displayedProps.set(collectMatchProps(match));

    if (!meta || (!meta.match && !meta.guard && !meta.resolve)) {
      this.showComponent(
        component,
        this._activeRouteInjector,
        this.resolveRouteTarget(component),
      );
      this.targetComponent.set(component);
      this.state.set('loaded');
      return;
    }

    this.runChain(meta, component, 'enter');
  }

  private runChain(
    meta: CraftRouteMeta,
    component: Type<unknown> | null,
    phase: 'enter' | 'active',
  ): void {
    const navId = ++this._navId;
    const injector = this._activeRouteInjector ?? this.rootInjector;
    const routeSnapshot = matchToSnapshot(this._match!);
    const stateSnapshot = { url: this.router.url, root: routeSnapshot };

    this.state.set('stay');
    void this.resolvePendingComponent(meta);

    const stayMs = meta.stayMs ?? this.defaultStayMs;
    const skipBlank = this.shouldSkipBlank(meta);
    const blankMs = skipBlank ? 0 : (meta.blankMs ?? this.defaultBlankMs);

    if (!skipBlank) {
      this._stayTimer = this.temporalRuntime.schedule(
        () => {
          if (this._navId === navId && this.state() === 'stay') {
            this.state.set('blank');
            this.displayedComponent.set(null);
            this.displayedTarget.set(null);
          }
        },
        stayMs,
        {
          kind: 'router-stay',
          owner: 'craft-router-outlet',
          destroyRef: this.destroyRef,
        },
      );
    }

    this._blankTimer = this.temporalRuntime.schedule(
      () => {
        if (
          this._navId === navId &&
          (this.state() === 'stay' || this.state() === 'blank')
        ) {
          this._pendingShownAt = this.temporalRuntime.now();
          this.state.set('pending');
          this.showComponent(
            this.pendingComponent(),
            injector,
            this.pendingTarget(),
          );
        }
      },
      stayMs + blankMs,
      {
        kind: 'router-pending',
        owner: 'craft-router-outlet',
        destroyRef: this.destroyRef,
      },
    );

    this.chainRunner(
      {
        match: meta.match?.(routeSnapshot as never, stateSnapshot as never),
        guard: meta.guard?.(routeSnapshot as never, stateSnapshot as never),
        resolve:
          phase === 'enter'
            ? meta.resolve?.(routeSnapshot as never, stateSnapshot as never)
            : undefined,
      },
      injector,
      this.router as import('./craft-router').CraftRouter,
      meta.handleExceptions,
      phase,
    ).then(
      (outcome) => {
        if (this._navId === navId) {
          this.applyOutcome(outcome, meta, component, phase);
        }
      },
      (error) => {
        if (this._navId === navId) {
          this.applyOutcome(
            { kind: 'thrownError', error },
            meta,
            component,
            phase,
          );
        }
      },
    );
  }

  private applyOutcome(
    outcome: RouteChainOutcome,
    meta: CraftRouteMeta,
    component: Type<unknown> | null,
    _phase: 'enter' | 'active',
  ): void {
    this.clearTimers();

    switch (outcome.kind) {
      case 'data':
        meta.guardDataSink?.set(outcome.guardData);
        meta.resolveDataSink?.set(outcome.resolveData);
        this.showTarget(component, meta);
        this.installReactiveGuard(meta, component);
        return;
      case 'noop':
        this.showTarget(component, meta);
        this.installReactiveGuard(meta, component);
        return;
      case 'redirect':
        void this.router.navigateByUrl(String(outcome.target));
        return;
      case 'stay':
        if (this._previousUrl !== this.router.url) {
          void this.router.navigateByUrl(this._previousUrl);
        }
        return;
      case 'render':
        meta.exceptionSinks[outcome.exception.code]?.set(outcome.exception);
        void this.showErrorComponent(outcome.component, outcome.exception);
        return;
      case 'global':
        this.publishGlobalError(outcome.exception);
        void this.showErrorComponent(
          meta.errorComponent ?? this.defaultErrorComponent,
          outcome.exception,
        );
        return;
      case 'thrownError': {
        const exception = isCraftException(outcome.error)
          ? outcome.error
          : null;
        this.publishGlobalError(exception);
        void this.showErrorComponent(
          meta.errorComponent ?? this.defaultErrorComponent,
          exception,
        );
        return;
      }
    }
  }

  private showComponent(
    component: Type<unknown> | null,
    injector: Injector | null,
    target: CraftRouteTarget | null = component
      ? angularRouteTarget(component)
      : null,
  ): void {
    const commit = () => {
      this.displayedInjector.set(injector ?? undefined);
      this.displayedProps.set(this.routeProps());
      this.displayedComponent.set(component);
      this.displayedTarget.set(target);
      this.syncTemplateFlush();
    };

    if (!this.viewTransitionsEnabled) {
      commit();
      this.scheduleA11yNavigationFocus();
      return;
    }

    this.startViewTransition(() => {
      commit();
    });
    this.scheduleA11yNavigationFocus();
  }

  private scheduleA11yNavigationFocus(): void {
    if (!this.a11yNavigationFocus) {
      return;
    }
    if (!this.a11yHasCompletedInitialActivation) {
      this.a11yHasCompletedInitialActivation = true;
      return;
    }
    queueMicrotask(() => {
      const target =
        this.document.getElementById('main') ??
        this.document.querySelector('main');
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.hasAttribute('tabindex')) {
        target.tabIndex = -1;
      }
      target.focus();
    });
  }

  private showTarget(
    component: Type<unknown> | null,
    meta: CraftRouteMeta,
  ): void {
    const injector = this._activeRouteInjector ?? this.rootInjector;
    const commit = () => {
      this.showComponent(
        component,
        injector,
        this.resolveRouteTarget(component),
      );
      this.targetComponent.set(component);
      this.state.set('loaded');
    };
    this.commitWithAntiFlicker(commit, meta);
  }

  private async showErrorComponent(
    input: CraftExceptionComponentInput | null,
    _exception: AnyCraftException | null,
  ): Promise<void> {
    const resolved = await resolveComponentInput(input);
    const target = resolved ? normalizeCraftRouteTarget(resolved) : null;
    const component = angularComponentFromRouteTarget(target);
    this.errorComponent.set(component);
    this.errorTarget.set(target);
    this.showComponent(
      component,
      this._activeRouteInjector ?? this.rootInjector,
      target,
    );
    this.state.set('error');
    this._frozen = true;
  }

  private commitWithAntiFlicker(
    commit: () => void,
    meta: CraftRouteMeta,
  ): void {
    const minMs = meta.pendingMinMs ?? this.defaultPendingMinMs;
    if (this.state() === 'pending' && minMs > 0) {
      const elapsed = this.temporalRuntime.now() - this._pendingShownAt;
      const remaining = minMs - elapsed;
      if (remaining > 0) {
        const navId = this._navId;
        this._pendingCommitTimer = this.temporalRuntime.schedule(
          () => {
            if (this._navId === navId) {
              commit();
            }
          },
          remaining,
          {
            kind: 'router-anti-flicker',
            owner: 'craft-router-outlet',
            destroyRef: this.destroyRef,
          },
        );
        return;
      }
    }
    commit();
  }

  private installReactiveGuard(
    meta: CraftRouteMeta,
    component: Type<unknown> | null,
  ): void {
    this._frozen = false;

    if (meta.reactiveGuards === false || !meta.guard) {
      return;
    }

    const injector = this._activeRouteInjector ?? this.rootInjector;
    const guardFactory = meta.guard;
    const routeSnapshot = matchToSnapshot(this._match!);
    const stateSnapshot = { url: this.router.url, root: routeSnapshot };

    this._reactiveWatch = runInInjectionContext(injector, () =>
      craftWatch(() => {
        const result = evaluateCraftGuardSync(
          guardFactory(routeSnapshot as never, stateSnapshot as never),
          injector,
        );

        if (this._frozen || result.kind !== 'exception') {
          return;
        }

        void this.handleReactiveException(result.exception, meta, component);
      }),
    );
  }

  private async handleReactiveException(
    exception: AnyCraftException,
    meta: CraftRouteMeta,
    component: Type<unknown> | null,
  ): Promise<void> {
    const outcome = await this.chainRunner(
      {
        guard: (function* () {
          return exception;
        })(),
      },
      this._activeRouteInjector ?? this.rootInjector,
      this.router as import('./craft-router').CraftRouter,
      meta.handleExceptions,
      'active',
    );
    this.applyOutcome(outcome, meta, component, 'active');
  }

  private shouldSkipBlank(meta: CraftRouteMeta): boolean {
    return (
      this.viewTransitionsEnabled &&
      (meta.withLoaderViewTransitionImage === true ||
        this.viewTransitionSkipBlank)
    );
  }

  private publishViewTransitionPayload(): void {
    const fromNavigation = this.router.getCurrentNavigation()?.extras?.state as
      | Record<string, unknown>
      | undefined;
    const historyState =
      typeof history !== 'undefined'
        ? (history.state as Record<string, unknown> | null | undefined)
        : undefined;
    const raw =
      fromNavigation?.[CRAFT_VIEW_TRANSITION_STATE_KEY] ??
      historyState?.[CRAFT_VIEW_TRANSITION_STATE_KEY] ??
      null;

    this.viewTransitionSink.set(raw as CraftViewTransitionInput);
  }

  private publishGlobalError(exception: AnyCraftException | null): void {
    const sink = this.rootInjector.get(CRAFT_GLOBAL_ERROR) as unknown as {
      set(value: AnyCraftException | null): void;
    };
    sink.set(exception);
  }

  private async resolvePendingComponent(meta: CraftRouteMeta): Promise<void> {
    const resolved = await resolvePendingComponentInput(
      meta.pendingComponent ?? this.defaultPendingComponent,
    );
    const target = resolved ? normalizeCraftRouteTarget(resolved) : null;
    const component = angularComponentFromRouteTarget(target);
    this.pendingComponent.set(component);
    this.pendingTarget.set(target);
  }

  private resolveRouteComponent(match: CraftMatch): Type<unknown> | null {
    const component = match.route.component;
    return (component as Type<unknown> | undefined) ?? null;
  }

  private resolveRouteTarget(
    component: Type<unknown> | null,
  ): CraftRouteTarget | null {
    return (
      this._activeRouteInjector?.get(CRAFT_ROUTE_TARGET, null) ??
      (component ? angularRouteTarget(component) : null)
    );
  }

  private routeProps(): Readonly<Record<string, unknown>> {
    return collectMatchProps(this._match);
  }

  private clearTimers(): void {
    if (this._stayTimer !== null) {
      this._stayTimer.cancel();
      this._stayTimer = null;
    }
    if (this._blankTimer !== null) {
      this._blankTimer.cancel();
      this._blankTimer = null;
    }
    if (this._pendingCommitTimer !== null) {
      this._pendingCommitTimer.cancel();
      this._pendingCommitTimer = null;
    }
  }

  private teardown(): void {
    this.clearTimers();
    this._reactiveWatch?.destroy();
    this._reactiveWatch = null;
    this._frozen = false;
    this.clearExceptionSinks(this._meta);
  }

  private clearExceptionSinks(meta: CraftRouteMeta | null | undefined): void {
    if (!meta) return;
    for (const sink of Object.values(meta.exceptionSinks)) sink.set(null);
  }
}

export function createCraftRouterOutletController(): CraftRouterOutletController {
  return new CraftRouterOutletController();
}

export async function resolveComponentInput(
  input: CraftExceptionComponentInput | null | undefined,
): Promise<CraftRouteTargetInput | null> {
  if (!input) {
    return null;
  }
  if (input.loadComponent) {
    const loaded = await input.loadComponent();
    return typeof loaded === 'object' && 'default' in loaded
      ? loaded.default
      : loaded;
  }
  return input.component;
}

async function resolvePendingComponentInput(
  input: CraftPendingComponentInput | null | undefined,
): Promise<CraftRouteTargetInput | null> {
  if (!input) return null;
  if (isLazyPendingComponent(input)) {
    return (await input()).default;
  }
  return input;
}

function isLazyPendingComponent(
  input: CraftPendingComponentInput,
): input is () => Promise<{ default: CraftRouteTargetInput }> {
  return (
    typeof input === 'function' &&
    !isCraftRouteTarget(input) &&
    input.prototype === undefined
  );
}

export function craftOutletStateOf(
  outlet: CraftRouterOutletController,
): CraftWritableSignal<CraftOutletState> {
  return outlet.state;
}

function silentRouter(): CraftRouterNavigationApi {
  return {
    url: '/',
    createUrlTree: (input) => ({
      toString: () => `/${input.to}`,
      __craftUrlTree: true as const,
    }),
    navigate: async () => true,
    navigateByUrl: async () => true,
    serializeUrl: (tree) => tree.toString(),
    getCurrentNavigation: () => null,
  };
}

function isSameActivation(current: CraftMatch, next: CraftMatch): boolean {
  if (current.route !== next.route || current.pathname !== next.pathname) {
    return false;
  }
  const currentKeys = Object.keys(current.params);
  const nextKeys = Object.keys(next.params);
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }
  return currentKeys.every((key) => current.params[key] === next.params[key]);
}

function matchToSnapshot(match: CraftMatch): {
  params: Record<string, string>;
  queryParams: Record<string, string>;
  data: Record<string | symbol, unknown>;
  url: unknown[];
  routeConfig: { path: string };
  pathFromRoot: unknown[];
  component: unknown;
} {
  return {
    params: match.params,
    queryParams: match.queryParams,
    data: match.data,
    url: [],
    routeConfig: { path: match.route.path },
    pathFromRoot: match.routes.map((route) => ({
      params: match.params,
      data: route.data ?? {},
      queryParams: match.queryParams,
      routeConfig: route,
    })),
    component: match.route.component,
  };
}
