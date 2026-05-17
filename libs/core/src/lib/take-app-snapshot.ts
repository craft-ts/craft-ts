import { inject, InjectionToken, isSignal, type Provider } from '@angular/core';

export interface SnapshotReport {
  source: string;
  from: readonly string[];
  state: unknown;
}

export type SnapshotReporter = () => SnapshotReport;

export function readInsertionsSnapshot(
  insertions: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(insertions)) {
    if (isSignal(val as any)) {
      try {
        result[key] = (val as any)();
      } catch {
        result[key] = undefined;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export const APP_SNAPSHOT_REGISTRY = new InjectionToken<SnapshotReporter[]>(
  'APP_SNAPSHOT_REGISTRY',
  { providedIn: 'root', factory: () => [] },
);

export const TAKE_APP_SNAPSHOT = new InjectionToken<() => void>(
  'TAKE_APP_SNAPSHOT',
  { providedIn: 'root', factory: () => () => {} },
);

export function provideTakeAppSnapshot(
  fn: (reports: SnapshotReport[]) => void,
): Provider[] {
  return [
    {
      provide: TAKE_APP_SNAPSHOT,
      useFactory: () => {
        const registry = inject(APP_SNAPSHOT_REGISTRY);
        return () => fn(registry.map((reporter) => reporter()));
      },
    },
  ];
}

export function registerSnapshotReporter(reporter: SnapshotReporter): void {
  const registry = inject(APP_SNAPSHOT_REGISTRY, { optional: true });
  if (registry) {
    registry.push(reporter);
  }
}
