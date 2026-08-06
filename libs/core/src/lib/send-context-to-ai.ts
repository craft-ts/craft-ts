import { inject, Injectable } from '@angular/core';
import type { GetDeps } from './branded-component/branded-component';
import { debounceTime, Subject } from 'rxjs';
import { type SendContextPayload } from './send-context-to-ai.tokens';
import {
  APP_SNAPSHOT_REGISTRY,
  type SnapshotReport,
} from './take-app-snapshot';

export { type SendContextPayload };

/**
 * Collects app snapshot reports so the AI overlay has something to send.
 *
 * The overlay UI itself lives in `@craft-ng/component` (it is built with
 * `craftComponent`, which depends on this package).
 */
@Injectable({ providedIn: 'root' })
export class SendContextToAiBuffer {
  latestReports: SnapshotReport[] = [];
  private pending: SnapshotReport[] = [];
  private readonly flush$ = new Subject<void>();

  constructor() {
    const registry = inject(APP_SNAPSHOT_REGISTRY);
    registry.allSnapShot$.subscribe((report) => {
      this.pending.push(report);
      this.flush$.next();
    });
    this.flush$.pipe(debounceTime(500)).subscribe(() => {
      this.latestReports = [...this.pending];
      this.pending = [];
    });
  }
}

export type GenDeps_SendContextToAiBuffer = GetDeps<{
  deps: {};
  provided: {};
}>;
