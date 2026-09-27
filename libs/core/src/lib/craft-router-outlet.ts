import {
  DestroyRef,
  EnvironmentInjector,
  inject,
  Injector,
  runInInjectionContext,
  type Type,
} from './host/craft-compat';
import { craftService } from './craft-service';
import { DOCUMENT } from './host/craft-compat';
import { ɵinjectCraftA11yNavigationFocus } from './craft-a11y';
import { isCraftException, type AnyCraftException } from './craft-exception';
import {
  evaluateCraftGuardSync,
  runCraftRouteChainAsync,
  type RouteChainOutcome,
} from './craft-guard-runtime';
import {
  ɵinjectCraftBlankMs,
  ɵinjectCraftErrorComponent,
  ɵinjectCraftPendingComponent,
  ɵinjectCraftPendingMinMs,
  ɵinjectCraftStayMs,
} from './craft-pending';
import {
  ɵinjectCraftGlobalErrorIn,
  type CraftExceptionComponentInput,
  type CraftPendingComponentInput,
} from './craft-route-exceptions';
import {
  createRouteLoadError,
  isCraftRouteLoadError,
  setActiveCraftRouteLoadError,
} from './craft-route-load-error';
import {
  getCraftRouteMeta,
  type CraftRouteMeta,
  type CraftRouteStepFactory,
} from './craft-route-meta';
import {
  CRAFT_VIEW_TRANSITION_STATE_KEY,
  ɵinjectCraftStartViewTransition,
  ɵinjectCraftViewTransition,
  ɵinjectCraftViewTransitionSkipBlank,
  ɵinjectCraftViewTransitionsEnabled,
  type CraftViewTransitionInput,
} from './craft-view-transition';
import {
  ɵinjectCraftTemporalRuntime,
  type TemporalTaskHandle,
} from './temporal-runtime';
import {
  craftRouteTarget,
  ɵinjectCraftRouteTargetIn,
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
  sliceCraftMatchForOutlet,
  type CraftCompiledRoute,
  type CraftMatch,
} from './host/craft-router-runtime';
import {
  provideCraftChildMatch,
  provideCraftMatch,
  ɵinjectCraftChildMatch,
  ɵinjectCraftHistory,
  ɵinjectCraftMatch,
  ɵinjectCraftRouterRuntime,
  type CraftRouterNavigationApi,
} from './craft-router-tokens';
import { ɵinjectCraftSsrRuntime } from './craft-ssr';
import { ɵinjectCraftPlatform } from './craft-platform';
import { ɵinjectCraftHydrationRuntime } from './craft-hydration';

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

const craftRouteChainRunnerService = craftService(
  { name: 'CraftRouteChainRunner', providedIn: 'global' },
  () => runCraftRouteChainAsync,
) as unknown as {
  CraftRouteChainRunner: () => Generator<
    unknown,
    typeof runCraftRouteChainAsync,
    unknown
  >;
  CRAFT_ROUTE_CHAIN_RUNNER_META_DATA: {
    inject(): typeof runCraftRouteChainAsync;
  };
};
export const CraftRouteChainRunner = craftRouteChainRunnerService.CraftRouteChainRunner;
export const ɵinjectCraftRouteChainRunner = (): typeof runCraftRouteChainAsync =>
  craftRouteChainRunnerService.CRAFT_ROUTE_CHAIN_RUNNER_META_DATA.inject();

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
const craftSyncTemplateFlushService = craftService(
  { name: 'CraftSyncTemplateFlush', providedIn: 'global' },
  () => runRegisteredSyncTemplateFlush,
) as unknown as {
  CraftSyncTemplateFlush: () => Generator<unknown, () => void, unknown>;
  CRAFT_SYNC_TEMPLATE_FLUSH_META_DATA: { inject(): () => void };
};
export const CraftSyncTemplateFlush = craftSyncTemplateFlushService.CraftSyncTemplateFlush;
export const ɵinjectCraftSyncTemplateFlush = (): (() => void) =>
  craftSyncTemplateFlushService.CRAFT_SYNC_TEMPLATE_FLUSH_META_DATA.inject();

/**
 * A non-blocking replacement for `<router-outlet>`. The URL commits immediately
 * (history.push); this outlet reads the route's {@link CraftRouteMeta} and
 * drives canMatch → canActivate → resolve **after** commit.
 */
export class CraftRouterOutletController {
  name = 'primary';

  private readonly rootInjector = inject(EnvironmentInjector);
  private readonly router =
    ɵinjectCraftRouterRuntime() ?? silentRouter();
  private readonly history = ɵinjectCraftHistory();
  private readonly destroyRef = inject(DestroyRef);
  private readonly temporalRuntime = ɵinjectCraftTemporalRuntime();

  private readonly defaultPendingComponent = ɵinjectCraftPendingComponent();
  private readonly defaultErrorComponent = ɵinjectCraftErrorComponent();
  private readonly defaultStayMs = ɵinjectCraftStayMs();
  private readonly defaultBlankMs = ɵinjectCraftBlankMs();
  private readonly defaultPendingMinMs = ɵinjectCraftPendingMinMs();
  private readonly chainRunner = ɵinjectCraftRouteChainRunner();

  private readonly viewTransitionsEnabled = ɵinjectCraftViewTransitionsEnabled();
  private readonly viewTransitionSkipBlank = ɵinjectCraftViewTransitionSkipBlank();
  private readonly startViewTransition = ɵinjectCraftStartViewTransition();
  private readonly syncTemplateFlush = ɵinjectCraftSyncTemplateFlush();
  private readonly viewTransitionSink = ɵinjectCraftViewTransition() as unknown as {
    set(value: CraftViewTransitionInput): void;
  };
  private readonly a11yNavigationFocus = ɵinjectCraftA11yNavigationFocus();
  private readonly platform = ɵinjectCraftPlatform();
  private readonly hydrationRuntime = ɵinjectCraftHydrationRuntime();
  private readonly document = this.platform?.document ?? inject(DOCUMENT);
  private readonly ssrRuntime = ɵinjectCraftSsrRuntime();
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
  private _childMatch: CraftWritableSignal<CraftMatch | null> | null = null;
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
  private _displayVersion = 0;

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
    const matchSignal = ɵinjectCraftChildMatch() ?? ɵinjectCraftMatch();
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
    this._childMatch = null;
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
    const { activated, child } = sliceCraftMatchForOutlet(match);

    if (
      this._match &&
      this._liveMatch &&
      this._childMatch &&
      this._activeRouteInjector &&
      this.state() !== 'error' &&
      canReuseActivation(this._match, activated, this._meta)
    ) {
      this._liveMatch.set(activated);
      this._childMatch.set(child);
      this.displayedProps.set(collectMatchProps(activated));
      this.publishViewTransitionPayload();
      return;
    }

    this._previousUrl = previousMatchUrl;
    this.teardown();
    this._match = activated;
    this._liveMatch = craftSignal(activated);
    this._childMatch = craftSignal(child);
    const routeProviders = activated.route.providers;
    this._activeRouteInjector = Injector.create({
      providers: [
        provideCraftMatch(this._liveMatch),
        provideCraftChildMatch(this._childMatch),
        ...(Array.isArray(routeProviders) ? (routeProviders as never[]) : []),
      ],
      parent: environmentInjector ?? this.rootInjector,
      name: 'CraftRouterOutlet',
    });

    this.publishViewTransitionPayload();

    const leafMeta = getCraftRouteMeta(
      (activated.route.data ?? activated.data) as Record<
        string | symbol,
        unknown
      >,
    );
    const meta = composeRouteMetas(
      collectAncestorGuardMetas(match, activated),
      leafMeta ?? null,
    );
    this._meta = meta ?? null;
    this.clearExceptionSinks(meta);
    const activation = this.finishActivation(activated, meta ?? null);
    if (this.ssrRuntime) {
      this.ssrRuntime.track(`route:${activated.route.path}`, activation);
    } else if (this.platform?.hydrating && this.hydrationRuntime) {
      this.hydrationRuntime.track(`route:${activated.route.path}`, activation);
    } else {
      void activation;
    }
  }

  private async finishActivation(
    match: CraftMatch,
    meta: CraftRouteMeta | null,
  ): Promise<void> {
    if (!this.isCurrentActivation(match)) {
      return;
    }
    if (
      typeof match.route.loadComponent === 'function' &&
      !match.route.component
    ) {
      try {
        const loaded = await runInInjectionContext(
          this._activeRouteInjector ?? this.rootInjector,
          () => Promise.resolve(match.route.loadComponent!()),
        );
        if (!this.isCurrentActivation(match)) {
          return;
        }
        const component =
          loaded && typeof loaded === 'object' && 'default' in loaded
            ? (loaded as { default: unknown }).default
            : loaded;
        match.route.component = component;
      } catch (error) {
        if (!this.isCurrentActivation(match)) {
          return;
        }
        const exception = isCraftRouteLoadError(error)
          ? error
          : createRouteLoadError({
              phase: 'component',
              routePath: match.route.path,
              targetUrl: this.router.url,
              cause: error,
              attempt: 1,
            });
        setActiveCraftRouteLoadError(exception, this.rootInjector);
        this.publishGlobalError(exception);
        void this.showErrorComponent(
          this._meta?.errorComponent ?? this.defaultErrorComponent,
          exception,
        );
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

    await this.runChain(meta, component, 'enter');
  }

  private runChain(
    meta: CraftRouteMeta,
    component: Type<unknown> | null,
    phase: 'enter' | 'active',
  ): Promise<void> {
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

    return this.chainRunner(
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
        meta.exceptionSinks[outcome.exception._tag]?.set(outcome.exception);
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
      ? craftRouteTarget(component)
      : null,
  ): void {
    const activationId = this._navId;
    const displayVersion = ++this._displayVersion;
    const props = this.routeProps();
    const commit = () => {
      // The browser may invoke a View Transition callback after a newer
      // activation or swap has already been requested. Such a callback must
      // not resurrect its old component, and its props must belong to the
      // component captured at request time rather than the current route.
      if (
        this._navId !== activationId ||
        this._displayVersion !== displayVersion
      ) {
        return;
      }
      this.displayedInjector.set(injector ?? undefined);
      this.displayedProps.set(props);
      // Publish the target last: CraftRouterOutlet mounts it as soon as the
      // target becomes visible, so its route injector and inputs must already
      // be available or the first render is created with the parent injector
      // and immediately remounted when the injector signal catches up.
      this.displayedTarget.set(target);
      this.displayedComponent.set(component);
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
      if (!target || target.nodeType !== 1) {
        return;
      }
      const element = target as HTMLElement;
      if (!element.hasAttribute('tabindex')) {
        element.tabIndex = -1;
      }
      element.focus();
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
    // Removing the Angular interop left this pinned at `null`, which silently
    // emptied the error surface: nothing was reported through
    // `errorComponent()` and nothing was mounted. The component IS the
    // normalized target's — everything Craft renders is a Craft component.
    const component = (target?.component ?? null) as Type<unknown> | null;
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
    const extras = this.router.getCurrentNavigation()?.extras;
    const fromNavigation = extras?.state as Record<string, unknown> | undefined;
    const craftState = this.history?.getState() as
      | Record<string, unknown>
      | null
      | undefined;
    const windowState =
      typeof history !== 'undefined'
        ? (history.state as Record<string, unknown> | null | undefined)
        : undefined;
    const source = this.history
      ? craftState
      : extras?.skipLocationChange
        ? fromNavigation
        : windowState;
    const raw =
      source?.[CRAFT_VIEW_TRANSITION_STATE_KEY] ??
      fromNavigation?.[CRAFT_VIEW_TRANSITION_STATE_KEY] ??
      null;

    this.viewTransitionSink.set(raw as CraftViewTransitionInput);
  }

  private publishGlobalError(exception: AnyCraftException | null): void {
    ɵinjectCraftGlobalErrorIn(this.rootInjector).set(exception);
  }

  private async resolvePendingComponent(meta: CraftRouteMeta): Promise<void> {
    const resolved = await resolvePendingComponentInput(
      meta.pendingComponent ?? this.defaultPendingComponent,
    );
    const target = resolved ? normalizeCraftRouteTarget(resolved) : null;
    const component = null;
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
      (this._activeRouteInjector
        ? ɵinjectCraftRouteTargetIn(this._activeRouteInjector)
        : null) ??
      (component ? craftRouteTarget(component) : null)
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
    this._navId++;
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

  private isCurrentActivation(match: CraftMatch): boolean {
    return this._match !== null && isSameActivation(this._match, match);
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
    return loaded && typeof loaded === 'object' && 'default' in loaded
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

function collectAncestorGuardMetas(
  fullMatch: CraftMatch,
  activated: CraftMatch,
): CraftRouteMeta[] {
  const index = fullMatch.routes.indexOf(activated.route);
  if (index <= 0) {
    return [];
  }
  const metas: CraftRouteMeta[] = [];
  for (const route of fullMatch.routes.slice(0, index)) {
    const meta = getCraftRouteMeta(
      route.data as Record<string | symbol, unknown> | undefined,
    );
    if (meta?.match || meta?.guard) {
      metas.push(meta);
    }
  }
  return metas;
}

function composeRouteMetas(
  ancestors: CraftRouteMeta[],
  leaf: CraftRouteMeta | null,
): CraftRouteMeta | null {
  if (ancestors.length === 0) {
    return leaf;
  }
  const guard: CraftRouteStepFactory = function* (route, state) {
    for (const ancestor of ancestors) {
      if (ancestor.match) {
        const matchResult = yield* ancestor.match(route, state);
        if (matchResult === false) {
          return false;
        }
      }
      if (ancestor.guard) {
        const guardResult = yield* ancestor.guard(route, state);
        if (guardResult === false) {
          return false;
        }
      }
    }
    if (leaf?.match) {
      const matchResult = yield* leaf.match(route, state);
      if (matchResult === false) {
        return false;
      }
    }
    if (leaf?.guard) {
      return yield* leaf.guard(route, state);
    }
    return true;
  };
  if (!leaf) {
    return {
      match: undefined,
      guard,
      resolve: undefined,
      handleExceptions: Object.assign(
        {},
        ...ancestors.map((ancestor) => ancestor.handleExceptions),
      ),
      guardDataSink: null,
      resolveDataSink: null,
      exceptionSinks: {},
      reactiveGuards: false,
    };
  }
  return {
    ...leaf,
    match: undefined,
    guard,
  };
}

function paramNamesForPath(path: string): string[] {
  if (!path || path === '**') {
    return [];
  }
  return path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1).replace(/\?$/, ''));
}

function paramsForActivatedRoute(
  route: CraftCompiledRoute,
  params: Record<string, string>,
): Record<string, string> {
  const names = paramNamesForPath(route.path);
  const owned: Record<string, string> = {};
  for (const name of names) {
    if (params[name] !== undefined) {
      owned[name] = params[name];
    }
  }
  return owned;
}

/**
 * Whether the live component survives this navigation.
 *
 * Angular decides this on the route config ALONE — `RouteReuseStrategy` keeps
 * the instance when `future.routeConfig === curr.routeConfig`, and a separate
 * `runGuardsAndResolvers` decides whether the chain re-runs on a param change.
 * Craft drove both from one comparison, so changing `:userId` tore the
 * component down and took with it whatever state it held — which is why a
 * `preservePreviousValue` query could never preserve anything across a
 * navigation.
 *
 * Craft keeps the component and lets reactivity carry the new params: the
 * fast-path publishes them on the live match signal, `injectRouteParamsSignal`
 * derives from it, and reactive guards re-evaluate off their own watch.
 *
 * Resolvers have no such reactivity yet — `meta.resolve` runs once, in the
 * `'enter'` phase — so a route carrying one still gets a full activation
 * instead of silently stale resolve data.
 */
function canReuseActivation(
  current: CraftMatch,
  next: CraftMatch,
  meta: CraftRouteMeta | null,
): boolean {
  if (current.route !== next.route) {
    return false;
  }
  return meta?.resolve ? isSameActivation(current, next) : true;
}

function isSameActivation(current: CraftMatch, next: CraftMatch): boolean {
  if (current.route !== next.route) {
    return false;
  }
  const currentParams = paramsForActivatedRoute(current.route, current.params);
  const nextParams = paramsForActivatedRoute(next.route, next.params);
  const currentKeys = Object.keys(currentParams);
  const nextKeys = Object.keys(nextParams);
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }
  return currentKeys.every((key) => currentParams[key] === nextParams[key]);
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
