import {
  type DestroyRef,
  isSignal,
  runInInjectionContext,
  type Injector,
} from './host/craft-compat';
import { craftService, type CraftServiceProvider } from './craft-service';
import { Subject } from 'rxjs';
import { provideFnWrapper } from './fn-wrapper';
import { isCraftControlFlow } from './craft-control-flow';
import { ɵinjectCraftRuntimeMode } from './craft-runtime-mode';

export interface SnapshotReport {
  source: string;
  from: readonly string[];
  state: unknown;
}

export interface ActiveEffectReport {
  source: string;
  from: readonly string[];
}

class AppSnapshotRegistryState {
  private nextReaderId = 0;
  private readonly snapshotReaders = new Map<
    number,
    {
      source: string;
      from: readonly string[];
      read: () => unknown;
    }
  >();
  private readonly activeEffectReaders = new Map<
    number,
    () => ActiveEffectReport
  >();

  registerSnapshotReader(
    source: string,
    from: readonly string[],
    read: () => unknown,
    destroyRef?: DestroyRef | null,
  ): () => void {
    const id = this.nextReaderId++;
    this.snapshotReaders.set(id, { source, from, read });
    const unregister = () => this.snapshotReaders.delete(id);
    destroyRef?.onDestroy(unregister);
    return unregister;
  }

  snapshot(): SnapshotReport[] {
    return Array.from(
      this.snapshotReaders.values(),
      ({ source, from, read }) => {
        let state: unknown;
        try {
          state = read();
        } catch (error) {
          state = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
        return { source, from, state };
      },
    );
  }

  registerActiveEffectReader(
    read: () => ActiveEffectReport,
    destroyRef?: DestroyRef | null,
  ): () => void {
    const id = this.nextReaderId++;
    this.activeEffectReaders.set(id, read);
    const unregister = () => this.activeEffectReaders.delete(id);
    destroyRef?.onDestroy(unregister);
    return unregister;
  }

  activeEffects(): ActiveEffectReport[] {
    return Array.from(this.activeEffectReaders.values(), (read) => read());
  }
}

export type AppSnapshotRegistry = AppSnapshotRegistryState;

export interface InsertionSnapshotReport {
  key: string;
  value: unknown;
}

export class InsertionSnapshotRegistry {
  readonly trigger$ = new Subject<void>();
  readonly allInsertionSnapshot$ = new Subject<InsertionSnapshotReport>();
}

const appSnapshotRegistryService = craftService(
  { name: 'AppSnapshotRegistry', providedIn: 'global' },
  () => new AppSnapshotRegistryState(),
) as unknown as {
  AppSnapshotRegistry: () => Generator<unknown, AppSnapshotRegistry, unknown>;
  APP_SNAPSHOT_REGISTRY_META_DATA: { inject(): AppSnapshotRegistry };
};

export const AppSnapshotRegistry =
  appSnapshotRegistryService.AppSnapshotRegistry;
export const ɵinjectAppSnapshotRegistry = (): AppSnapshotRegistry =>
  appSnapshotRegistryService.APP_SNAPSHOT_REGISTRY_META_DATA.inject();
export const ɵinjectAppSnapshotRegistryIn = (
  injector: Injector,
): AppSnapshotRegistry =>
  runInInjectionContext(injector, () => ɵinjectAppSnapshotRegistry());

const insertionSnapshotRegistryService = craftService(
  { name: 'InsertionSnapshotRegistry', providedIn: 'toProvide' },
  (inputs: { $provided?: InsertionSnapshotRegistry | null }) =>
    inputs.$provided ?? null,
) as unknown as {
  provideInsertionSnapshotRegistry: (
    value: InsertionSnapshotRegistry | null,
  ) => CraftServiceProvider;
  INSERTION_SNAPSHOT_REGISTRY_META_DATA: {
    inject(): InsertionSnapshotRegistry | null;
  };
};

export const provideInsertionSnapshotRegistry = (
  value: InsertionSnapshotRegistry | null,
): CraftServiceProvider =>
  insertionSnapshotRegistryService.provideInsertionSnapshotRegistry(value);
export const ɵinjectInsertionSnapshotRegistry =
  (): InsertionSnapshotRegistry | null => {
    try {
      return insertionSnapshotRegistryService.INSERTION_SNAPSHOT_REGISTRY_META_DATA.inject();
    } catch {
      return null;
    }
  };

const takeAppSnapshotService = craftService(
  { name: 'TakeAppSnapshot', providedIn: 'toProvide' },
  function* (inputs: { $provided?: () => void }) {
    if (inputs.$provided) return inputs.$provided();
    const registry = yield* AppSnapshotRegistry();
    return () => {
      registry.snapshot();
    };
  },
) as unknown as {
  TakeAppSnapshot: () => Generator<unknown, () => void, unknown>;
  provideTakeAppSnapshot: (value: () => void) => CraftServiceProvider;
  TAKE_APP_SNAPSHOT_META_DATA: { inject(): () => void };
};

export const TakeAppSnapshot = takeAppSnapshotService.TakeAppSnapshot;
export const ɵinjectTakeAppSnapshot = (): (() => void) | null => {
  try {
    return takeAppSnapshotService.TAKE_APP_SNAPSHOT_META_DATA.inject();
  } catch {
    return null;
  }
};
export const ɵinjectTakeAppSnapshotIn = (
  injector: Injector,
): (() => void) | null =>
  runInInjectionContext(injector, () => ɵinjectTakeAppSnapshot());

export function provideTakeAppSnapshot(
  fn: (reports: SnapshotReport[]) => void,
): CraftServiceProvider[] {
  return [
    takeAppSnapshotService.provideTakeAppSnapshot(() => {
      if (ɵinjectCraftRuntimeMode() === 'production') {
        return () => undefined;
      }
      const registry = ɵinjectAppSnapshotRegistry();
      return () => fn(registry.snapshot());
    }) as CraftServiceProvider,
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        try {
          return yield* factory.apply(thisArg, args);
        } catch (error) {
          // CraftGenShortCircuit and CraftNotSettled are expected control-flow
          // throws. Their boundaries will consume them during rendering; they
          // must not produce an application snapshot on the way there.
          if (isCraftControlFlow(error)) {
            throw error;
          }
          if (ɵinjectCraftRuntimeMode() !== 'production') {
            try {
              ɵinjectTakeAppSnapshot()?.();
            } catch {
              // Snapshot callbacks must not replace the original error.
            }
          }
          throw error;
        }
      },
    ),
  ];
}

export function triggerAndCollectInsertions(
  registry: InsertionSnapshotRegistry | null | undefined,
): Record<string, unknown> | undefined {
  if (!registry) return undefined;
  const snapshots: Record<string, unknown> = {};
  const sub = registry.allInsertionSnapshot$.subscribe(({ key, value }) => {
    snapshots[key] = value;
  });
  registry.trigger$.next();
  sub.unsubscribe();
  return Object.keys(snapshots).length > 0 ? snapshots : undefined;
}

export function snapshotSelectProxy(
  proxy: unknown,
  rawState?: unknown,
): unknown {
  const result: Record<string, unknown> = {};

  if (
    rawState !== undefined &&
    rawState !== null &&
    typeof rawState === 'object'
  ) {
    Object.assign(result, rawState);
  }

  if (!proxy || typeof proxy !== 'object') return result;

  for (const [key, val] of Object.entries(proxy as Record<string, unknown>)) {
    if (isSignal(val)) {
      try {
        result[key] = (val as () => unknown)();
      } catch {
        result[key] = undefined;
      }
    } else if (key === 'items' && typeof val === 'function') {
      const nestedProxies: unknown[] = (val as () => unknown[])();
      result['items'] = nestedProxies.map((n) => snapshotSelectProxy(n));
    }
  }

  return result;
}
