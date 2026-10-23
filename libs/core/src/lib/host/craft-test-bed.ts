import {
  createCraftInjector,
  type CraftInjector,
} from './craft-injector';
import {
  createEnvironmentInjector,
  getCraftRootDefaultProviders,
  ɵdestroyCraftDestroyRef,
  DestroyRef,
  type Provider,
  type ProviderToken,
} from './craft-compat';

export type CraftComponentFixture<T = unknown> = {
  readonly nativeElement: HTMLElement;
  readonly componentInstance: T;
  detectChanges(): void;
  destroy(): void;
};

type CraftTestMounter = (
  component: unknown,
  host: Element,
  injector: CraftInjector,
) => { instance: unknown; destroy(): void };

let mounter: CraftTestMounter | undefined;

/**
 * `@craft-ts/component` installs the renderer here on import — core has no way
 * to mount anything on its own.
 */
export function ɵsetCraftTestMounter(next: CraftTestMounter): void {
  mounter = next;
}

function ɵmountCraftTestComponent(
  component: unknown,
  host: Element,
  injector: CraftInjector,
): { instance: unknown; destroy(): void } {
  if (!mounter) {
    throw new Error(
      'CraftTestBed.createComponent needs @craft-ts/component; import it in the spec.',
    );
  }
  return mounter(component, host, injector);
}

/**
 * Minimal test harness for Craft services and components.
 *
 * Configure providers, resolve a token, run a callback in context, or mount a
 * component through the renderer registered by `@craft-ts/component`.
 */
class CraftTestBedRuntime {
  private providers: unknown[] = [];
  private injector: (CraftInjector & { destroy?(): void }) | undefined;

  /**
   * Kept as a no-op so test runners can share setup across suites.
   */
  initTestEnvironment(..._args: unknown[]): void {
    // no platform to boot
  }

  configureTestingModule(config: { providers?: readonly unknown[] }): this {
    if (config.providers) {
      this.providers.push(...config.providers);
    }
    // Providers added after the injector was materialised must reach it, so
    // drop it and rebuild lazily on the next access.
    this.disposeInjector();
    return this;
  }

  /** Craft has no template compiler, so there is nothing to compile. */
  async compileComponents(): Promise<void> {
    // nothing to compile
  }

  /** The lazily built root injector, including Craft's `providedIn: 'root'` defaults. */
  get rootInjector(): CraftInjector {
    if (!this.injector) {
      this.injector = createEnvironmentInjector(
        [...getCraftRootDefaultProviders(), ...this.providers],
        createCraftInjector([]),
        'CraftTestBed',
      );
    }
    return this.injector;
  }

  inject<T>(token: ProviderToken<T>): T;
  inject<T>(token: ProviderToken<T>, notFoundValue: T | null): T | null;
  inject<T>(token: ProviderToken<T>, notFoundValue?: T | null): T | null {
    return arguments.length > 1
      ? ((this.rootInjector.get(token as object, notFoundValue) ?? null) as
          | T
          | null)
      : (this.rootInjector.get(token as object) as T);
  }

  runInInjectionContext<T>(fn: () => T): T {
    return this.rootInjector.run(fn);
  }

  /**
   * alien-signals notifies effects synchronously, so by the time a write
   * returns its effects have already run and there is nothing left to drain.
   */
  flushEffects(): void {
    // effects are synchronous
  }

  /** Flushes pending Craft updates, like {@link flushEffects}. */
  tick(): void {
    // effects are synchronous
  }

  /**
   * Mounts a Craft component and returns a fixture, so the
   * specs written against `CraftTestBed.createComponent(...)` keep their shape.
   * `detectChanges` has nothing to do — the mount already rendered.
   */
  createComponent<T = unknown>(component: unknown): CraftComponentFixture<T> {
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = ɵmountCraftTestComponent(
      component,
      host,
      this.rootInjector,
    );
    return {
      nativeElement: host,
      componentInstance: mounted.instance as T,
      detectChanges() {
        // rendering is synchronous
      },
      destroy() {
        mounted.destroy();
        host.remove();
      },
    };
  }

  resetTestingModule(): this {
    this.disposeInjector();
    this.providers = [];
    return this;
  }

  private disposeInjector(): void {
    const current = this.injector;
    this.injector = undefined;
    if (!current) return;
    const destroyRef = (current as { ɵdestroyRef?: DestroyRef }).ɵdestroyRef;
    if (destroyRef) {
      ɵdestroyCraftDestroyRef(destroyRef);
    }
    current.destroy?.();
  }
}

export const CraftTestBed = new CraftTestBedRuntime();
