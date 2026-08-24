import type { GetDeps } from './branded-component/branded-component';
import { debounceTime, Subject } from 'rxjs';
import { craftToken } from './host/craft-injector';
import { type SendContextPayload } from './send-context-to-ai.tokens';
import {
  type AppSnapshotRegistry,
  type SnapshotReport,
} from './take-app-snapshot';

export { type SendContextPayload };

/**
 * Collects app snapshot reports so the AI overlay has something to send.
 *
 * The overlay UI itself lives in `@craft-ts/component` (it is built with
 * `craftComponent`, which depends on this package).
 */
export type SendContextToAiBuffer = {
  latestReports: SnapshotReport[];
};

export const SEND_CONTEXT_TO_AI_BUFFER = craftToken<SendContextToAiBuffer>(
  'SendContextToAiBuffer',
);

export function createSendContextToAiBuffer(
  registry: AppSnapshotRegistry,
): SendContextToAiBuffer {
  const buffer: SendContextToAiBuffer = { latestReports: [] };
  let pending: SnapshotReport[] = [];
  const flush$ = new Subject<void>();

  registry.allSnapShot$.subscribe((report) => {
    pending.push(report);
    flush$.next();
  });
  flush$.pipe(debounceTime(500)).subscribe(() => {
    buffer.latestReports = [...pending];
    pending = [];
  });

  return buffer;
}

export type GenDeps_SendContextToAiBuffer = GetDeps<{
  deps: {};
  provided: {};
}>;
