import { inject, InjectionToken, isSignal, type Provider } from './host/craft-compat';
import { debounceTime, Subject, tap } from 'rxjs';
import { provideFnWrapper } from './fn-wrapper';
import { isCraftControlFlow } from './craft-control-flow';

export interface SnapshotReport {
  source: string;
  from: readonly string[];
  state: unknown;
}

export interface ActiveEffectReport {
  source: string;
  from: readonly string[];
}

export class AppSnapshotRegistry {
  readonly triggerSnapshot$ = new Subject<void>();
  readonly allSnapShot$ = new Subject<SnapshotReport>();
  readonly allActiveEffects$ = new Subject<ActiveEffectReport>();
}

export interface InsertionSnapshotReport {
  key: string;
  value: unknown;
}

export class InsertionSnapshotRegistry {
  readonly trigger$ = new Subject<void>();
  readonly allInsertionSnapshot$ = new Subject<InsertionSnapshotReport>();
}

export const APP_SNAPSHOT_REGISTRY = new InjectionToken<AppSnapshotRegistry>(
  'APP_SNAPSHOT_REGISTRY',
  { providedIn: 'root', factory: () => new AppSnapshotRegistry() },
);

export const INSERTION_SNAPSHOT_REGISTRY =
  new InjectionToken<InsertionSnapshotRegistry>('INSERTION_SNAPSHOT_REGISTRY');

export const TAKE_APP_SNAPSHOT = new InjectionToken<() => void>(
  'TAKE_APP_SNAPSHOT',
  {
    providedIn: 'root',
    factory: () => {
      const registry = inject(APP_SNAPSHOT_REGISTRY);
      return () => registry.triggerSnapshot$.next();
    },
  },
);

export function provideTakeAppSnapshot(
  fn: (reports: SnapshotReport[]) => void,
): Provider[] {
  return [
    {
      provide: TAKE_APP_SNAPSHOT,
      useFactory: () => {
        const registry = inject(APP_SNAPSHOT_REGISTRY);
        const pending: SnapshotReport[] = [];
        registry.allSnapShot$
          .pipe(
            tap((s) => pending.push(s)),
            debounceTime(500),
          )
          .subscribe(() => {
            const toProcess = [...pending];
            pending.length = 0;
            fn(toProcess);
          });
        return () => registry.triggerSnapshot$.next();
      },
    },
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
          inject(TAKE_APP_SNAPSHOT)();
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
