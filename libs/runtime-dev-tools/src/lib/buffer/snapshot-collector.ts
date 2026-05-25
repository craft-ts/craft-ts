import { inject } from '@angular/core';
import {
  APP_SNAPSHOT_REGISTRY,
  type AppSnapshotRegistry,
  type SnapshotReport,
} from '@craft-ng/core';

export function injectSnapshotCollector(): () => readonly SnapshotReport[] {
  const registry: AppSnapshotRegistry = inject(APP_SNAPSHOT_REGISTRY);
  return () => collectSnapshot(registry);
}

export function collectSnapshot(
  registry: AppSnapshotRegistry,
): readonly SnapshotReport[] {
  const reports: SnapshotReport[] = [];
  const sub = registry.allSnapShot$.subscribe((report) => reports.push(report));
  registry.triggerSnapshot$.next();
  sub.unsubscribe();
  return reports;
}
