import {
  DestroyRef,
  effect,
  EnvironmentInjector,
  inject,
  Injector,
  InjectionToken,
  runInInjectionContext,
  signal,
  type EffectRef,
  type Signal,
  type Type,
  type WritableSignal,
} from '@angular/core';
import {
  ActivatedRoute,
  ChildrenOutletContexts,
  Router,
  type Data,
  type RouterOutletContract,
} from '@angular/router';
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

/**
 * Outlet lifecycle for one navigation. While a route's chain is in flight the
 * outlet walks three phases: `'stay'` (keep the previous page) → `'blank'` →
 * `'pending'` (loader), before settling on `'loaded'` or `'error'`.
 */
export type CraftOutletState =
  | 'idle'
  | 'stay'
  | 'blank'
  | 'pending'
  | 'loaded'
  | 'error';

/**
 * The function the outlet uses to drive a route's guard/resolve chain. Defaults
 * to {@link runCraftRouteChainAsync}; overridable in tests to drive the outlet's
 * state machine deterministically (a controlled promise + fake timers).
 */
export const CRAFT_ROUTE_CHAIN_RUNNER = new InjectionToken<
  typeof runCraftRouteChainAsync
>('CRAFT_ROUTE_CHAIN_RUNNER', {
  providedIn: 'root',
  factory: () => runCraftRouteChainAsync,
});

/**
 * A non-blocking replacement for `<router-outlet>`. The URL commits immediately
 * (no blocking guard); this outlet reads the route's {@link CraftRouteMeta} and
 * drives canMatch → canActivate → resolve **after** commit, through three phases
 * while the chain is in flight:
 *
 * - **stay** ({@link CRAFT_STAY_MS}) — keeps the PREVIOUS page mounted, so a fast
 *   chain transitions straight to the target with no flash of blank/loader;
 * - **blank** ({@link CRAFT_BLANK_MS}) — a blank surface;
 * - **pending** — the pending component (loader), held at least
 *   {@link CRAFT_PENDING_MIN_MS}.
 *
 * Then it mounts the target only on success (`'data'` / `'noop'`), or applies the
 * route's `handleExceptions` outcome otherwise (redirect / dedicated component /
 * global error component / stay / noop), and keeps `canActivate` under reactive
 * observation while active (live guards).
 *
 * A renderer bound to {@link displayedComponent} drives the view: during
 * `'stay'` it is left pointing at the previous page's live instance, so that
 * instance is preserved (not re-created) across the transition.
 *
 * Routes without craft meta render immediately, exactly like `<router-outlet>`.
 */
export class CraftRouterOutletController implements RouterOutletContract {
  /** Outlet name (matches `<router-outlet name>`); default `'primary'`. */
  name = 'primary';

  private readonly parentContexts = inject(ChildrenOutletContexts);
  private readonly rootInjector = inject(EnvironmentInjector);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly defaultPendingComponent = inject(CRAFT_PENDING_COMPONENT);
  private readonly defaultErrorComponent = inject(CRAFT_ERROR_COMPONENT);
  private readonly defaultStayMs = inject(CRAFT_STAY_MS);
  private readonly defaultBlankMs = inject(CRAFT_BLANK_MS);
  private readonly defaultPendingMinMs = inject(CRAFT_PENDING_MIN_MS);
  private readonly chainRunner = inject(CRAFT_ROUTE_CHAIN_RUNNER);

  // --- View transitions (outlet-driven; see withCraftViewTransitions) ---
  private readonly viewTransitionsEnabled = inject(
    CRAFT_VIEW_TRANSITIONS_ENABLED,
  );
  private readonly viewTransitionSkipBlank = inject(
    CRAFT_VIEW_TRANSITION_SKIP_BLANK,
  );
  private readonly startViewTransition = inject(CRAFT_START_VIEW_TRANSITION);
  private readonly viewTransitionSink = inject(
    CRAFT_VIEW_TRANSITION,
  ) as WritableSignal<CraftViewTransitionInput>;

  // --- What the template actually renders (single, stable outlet) ---
  readonly displayedComponent = signal<Type<unknown> | null>(null);
  readonly displayedInjector = signal<Injector | undefined>(undefined);

  // --- Phase / bookkeeping state (read by tests & the contract) ---
  readonly state = signal<CraftOutletState>('idle');
  readonly targetComponent = signal<Type<unknown> | null>(null);
  readonly pendingComponent = signal<Type<unknown> | null>(null);
  readonly errorComponent = signal<Type<unknown> | null>(null);

  // --- Activation bookkeeping ---
  private _activatedRoute: ActivatedRoute | null = null;
  private _activeRouteInjector: Injector | null = null;
  private _meta: CraftRouteMeta | null = null;
  private _navId = 0;
  private _stayTimer: ReturnType<typeof setTimeout> | null = null;
  private _blankTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingShownAt = 0;
  private _previousUrl = this.router.url;
  private _pendingDeactivation = false;
  private _reactiveEffect: EffectRef | null = null;
  private _frozen = false;

  // --------------------------------------------------------------------------
  // RouterOutletContract
  // --------------------------------------------------------------------------

  get isActivated(): boolean {
    return this._activatedRoute !== null;
  }

  get component(): object {
    if (!this._activatedRoute) {
      throw new Error('CraftRouterOutlet is not activated');
    }
    return (this.targetComponent() ?? {}) as object;
  }

  get activatedRoute(): ActivatedRoute | null {
    return this._activatedRoute;
  }

  get activatedRouteData(): Data {
    return this._activatedRoute?.snapshot.data ?? {};
  }

  constructor() {
    this.parentContexts.onChildOutletCreated(this.name, this);

    // The route may already be activated (outlet created after navigation).
    const context = this.parentContexts.getContext(this.name);
    if (context?.route) {
      this.activateWith(context.route, context.injector);
    }

    this.destroyRef.onDestroy(() => this.destroy());
  }

  destroy(): void {
    this.teardown();
    this.parentContexts.onChildOutletDestroyed(this.name);
  }

  detach(): never {
    // Detach/reattach (RouteReuseStrategy) is not supported by the craft outlet.
    throw new Error('CraftRouterOutlet does not support detach/attach.');
  }

  attach(): void {
    throw new Error('CraftRouterOutlet does not support detach/attach.');
  }

  deactivate(): void {
    this.teardown();
    this._activatedRoute = null;
    this._activeRouteInjector = null;
    this._meta = null;
    this._previousUrl = this.router.url;

    // Keep the current page rendered for a possible immediate re-activation:
    // Angular calls `deactivate()` then `activateWith()` synchronously on a
    // route→route change, so leaving `displayedComponent` in place lets the
    // previous page stay mounted (alive) through the next navigation's `'stay'`
    // phase. If no `activateWith` follows (navigating to a routeless URL), a
    // microtask — which runs after that synchronous pass — clears it.
    this._pendingDeactivation = true;
    queueMicrotask(() => {
      if (this._pendingDeactivation) {
        this._pendingDeactivation = false;
        this.state.set('idle');
        this.displayedComponent.set(null);
        this.targetComponent.set(null);
        this.errorComponent.set(null);
      }
    });
  }

  activateWith(
    activatedRoute: ActivatedRoute,
    environmentInjector: EnvironmentInjector,
  ): void {
    // Cancel the deferred clear from a preceding `deactivate()` — we are
    // re-activating, so the previous page must stay mounted for `'stay'`.
    this._pendingDeactivation = false;
    this.teardown();
    this._activatedRoute = activatedRoute;
    this._activeRouteInjector = Injector.create({
      providers: [
        { provide: ActivatedRoute, useValue: activatedRoute },
        {
          provide: ChildrenOutletContexts,
          useValue: this.parentContexts.getOrCreateContext(this.name).children,
        },
      ],
      parent: environmentInjector ?? this.rootInjector,
      name: 'CraftRouterOutlet',
    });

    // Republish this navigation's view-transition payload before mounting
    // anything, so the pending skeleton and the target both read it.
    this.publishViewTransitionPayload();

    const meta = getCraftRouteMeta(
      activatedRoute.snapshot.data as Record<string | symbol, unknown>,
    );
    this._meta = meta ?? null;
    this.clearExceptionSinks(meta);
    const component = this.resolveRouteComponent(activatedRoute);

    // Plain route (no craft chain) → behave like <router-outlet>.
    if (!meta || (!meta.match && !meta.guard && !meta.resolve)) {
      this.showComponent(component, this._activeRouteInjector);
      this.targetComponent.set(component);
      this.state.set('loaded');
      return;
    }

    this.runChain(meta, component, 'enter');
  }

  // --------------------------------------------------------------------------
  // Non-blocking chain
  // --------------------------------------------------------------------------

  private runChain(
    meta: CraftRouteMeta,
    component: Type<unknown> | null,
    phase: 'enter' | 'active',
  ): void {
    const navId = ++this._navId;
    const injector = this._activeRouteInjector ?? this.rootInjector;
    const routeSnapshot = this._activatedRoute!.snapshot;
    const stateSnapshot = this.router.routerState.snapshot;

    // Phase 1 — 'stay': keep the previous page mounted (displayedComponent is
    // left untouched). A chain settling within stayMs jumps straight to target.
    this.state.set('stay');
    void this.resolvePendingComponent(meta);

    const stayMs = meta.stayMs ?? this.defaultStayMs;
    // A view-transition route (or `withCraftViewTransitions({ skipBlank })`)
    // skips the blank surface: a blank between the previous page and the
    // skeleton would break the shared-element morph, so go stay → pending.
    const skipBlank = this.shouldSkipBlank(meta);
    const blankMs = skipBlank ? 0 : (meta.blankMs ?? this.defaultBlankMs);

    // Phase 2 — 'blank': drop the previous page, show a blank surface.
    if (!skipBlank) {
      this._stayTimer = setTimeout(() => {
        if (this._navId === navId && this.state() === 'stay') {
          this.state.set('blank');
          this.displayedComponent.set(null);
        }
      }, stayMs);
    }

    // Phase 3 — 'pending': show the loader (held at least pendingMinMs).
    this._blankTimer = setTimeout(() => {
      if (
        this._navId === navId &&
        (this.state() === 'stay' || this.state() === 'blank')
      ) {
        this._pendingShownAt = Date.now();
        this.state.set('pending');
        this.showComponent(this.pendingComponent(), injector);
      }
    }, stayMs + blankMs);

    this.chainRunner(
      {
        match: meta.match?.(routeSnapshot, stateSnapshot),
        // In the reactive `active` phase, only the guard invariant is re-checked.
        guard: meta.guard?.(routeSnapshot, stateSnapshot),
        resolve:
          phase === 'enter'
            ? meta.resolve?.(routeSnapshot, stateSnapshot)
            : undefined,
      },
      injector,
      this.router,
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
        // Render the target with resolve data left undefined.
        this.showTarget(component, meta);
        this.installReactiveGuard(meta, component);
        return;
      case 'redirect':
        void this.router.navigateByUrl(outcome.target);
        return;
      case 'stay':
        // Cancel the navigation: restore the previous URL.
        void this.router.navigateByUrl(this._previousUrl);
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

  // Mounts `component` in the single template outlet with the given injector.
  // When view transitions are enabled the swap is bracketed in
  // `document.startViewTransition()` so the browser morphs the shared element.
  private showComponent(
    component: Type<unknown> | null,
    injector: Injector | null,
  ): void {
    const commit = () => {
      this.displayedInjector.set(injector ?? undefined);
      this.displayedComponent.set(component);
    };

    if (!this.viewTransitionsEnabled) {
      commit();
      return;
    }

    this.startViewTransition(() => {
      commit();
      // `document.startViewTransition` snapshots the NEW state as soon as this
      // callback returns. The swap only sets signals, so without a synchronous
      // Angular's signal scheduler will render the new component after the
      // callback. Do not force a nested ApplicationRef.tick here: when the
      // browser invokes the callback during router activation, that nested tick
      // can re-enter the outlet and create an unbounded navigation/render loop.
    });
  }

  private showTarget(
    component: Type<unknown> | null,
    meta: CraftRouteMeta,
  ): void {
    const injector = this._activeRouteInjector ?? this.rootInjector;
    const commit = () => {
      this.showComponent(component, injector);
      this.targetComponent.set(component);
      this.state.set('loaded');
    };
    this.commitWithAntiFlicker(commit, meta);
  }

  private async showErrorComponent(
    input: CraftExceptionComponentInput | null,
    _exception: AnyCraftException | null,
  ): Promise<void> {
    const component = await resolveComponentInput(input);
    this.errorComponent.set(component);
    this.showComponent(
      component,
      this._activeRouteInjector ?? this.rootInjector,
    );
    this.state.set('error');
    // An error outcome that stays on the URL freezes reactive re-evaluation.
    this._frozen = true;
  }

  // Anti-flicker: once the loader is shown, keep it visible for at least
  // `pendingMinMs` so a chain that settles right after it appears does not blink.
  private commitWithAntiFlicker(
    commit: () => void,
    meta: CraftRouteMeta,
  ): void {
    const minMs = meta.pendingMinMs ?? this.defaultPendingMinMs;
    if (this.state() === 'pending' && minMs > 0) {
      const elapsed = Date.now() - this._pendingShownAt;
      const remaining = minMs - elapsed;
      if (remaining > 0) {
        const navId = this._navId;
        setTimeout(() => {
          if (this._navId === navId) {
            commit();
          }
        }, remaining);
        return;
      }
    }
    commit();
  }

  // --------------------------------------------------------------------------
  // Reactive ("live") guards — phase 'active'
  // --------------------------------------------------------------------------

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
    const routeSnapshot = this._activatedRoute!.snapshot;
    const stateSnapshot = this.router.routerState.snapshot;

    this._reactiveEffect = runInInjectionContext(injector, () =>
      effect(() => {
        // Re-pump the guard synchronously so the effect tracks the craft signals
        // it reads; a settled resource resolves on the fast path.
        const result = evaluateCraftGuardSync(
          guardFactory(routeSnapshot, stateSnapshot),
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
      this.router,
      meta.handleExceptions,
      'active',
    );
    this.applyOutcome(outcome, meta, component, 'active');
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  // Skip the blank surface when a view transition is in play for this route —
  // either it opted in (`withLoaderViewTransitionImage`) or the feature was
  // configured to skip blank globally.
  private shouldSkipBlank(meta: CraftRouteMeta): boolean {
    return (
      this.viewTransitionsEnabled &&
      (meta.withLoaderViewTransitionImage === true ||
        this.viewTransitionSkipBlank)
    );
  }

  // Reads this navigation's view-transition payload from Angular's navigation
  // state (falling back to `history.state`) and republishes it on the sink the
  // skeleton/target read. Always writes (even `null`) so a stale payload from a
  // previous navigation cannot leak into this one.
  private publishViewTransitionPayload(): void {
    const fromNavigation = this.router.getCurrentNavigation()?.extras.state as
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
    const sink = this.rootInjector.get(
      CRAFT_GLOBAL_ERROR,
    ) as WritableSignal<AnyCraftException | null>;
    sink.set(exception);
  }

  private async resolvePendingComponent(meta: CraftRouteMeta): Promise<void> {
    const component = await resolvePendingComponentInput(
      meta.pendingComponent ?? this.defaultPendingComponent,
    );
    this.pendingComponent.set(component);
  }

  private resolveRouteComponent(route: ActivatedRoute): Type<unknown> | null {
    const snapshot = route.snapshot;
    return (
      ((route.component ??
        snapshot.component ??
        snapshot.routeConfig?.component) as Type<unknown> | undefined) ?? null
    );
  }

  private clearTimers(): void {
    if (this._stayTimer !== null) {
      clearTimeout(this._stayTimer);
      this._stayTimer = null;
    }
    if (this._blankTimer !== null) {
      clearTimeout(this._blankTimer);
      this._blankTimer = null;
    }
  }

  private teardown(): void {
    this.clearTimers();
    this._reactiveEffect?.destroy();
    this._reactiveEffect = null;
    this._frozen = false;
    this.clearExceptionSinks(this._meta);
  }

  private clearExceptionSinks(meta: CraftRouteMeta | null | undefined): void {
    if (!meta) return;
    for (const sink of Object.values(meta.exceptionSinks)) sink.set(null);
  }
}

/**
 * Creates and registers the non-blocking outlet controller in the current
 * injection context. Its lifetime follows that context through `DestroyRef`.
 */
export function createCraftRouterOutletController(): CraftRouterOutletController {
  return new CraftRouterOutletController();
}

// --- pure helpers (testable, no Angular) ---

/** Resolves an eager or lazy exception component descriptor. */
export async function resolveComponentInput(
  input: CraftExceptionComponentInput | null | undefined,
): Promise<Type<unknown> | null> {
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
): Promise<Type<unknown> | null> {
  if (!input) return null;
  if (isLazyPendingComponent(input)) {
    return (await input()).default;
  }
  return input;
}

function isLazyPendingComponent(
  input: CraftPendingComponentInput,
): input is () => Promise<{ default: Type<unknown> }> {
  return typeof input === 'function' && input.prototype === undefined;
}

/** Reads the current outlet render state (used by tooling/tests). */
export function craftOutletStateOf(
  outlet: CraftRouterOutletController,
): Signal<CraftOutletState> {
  return outlet.state;
}
