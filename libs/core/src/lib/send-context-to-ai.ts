import type { GetDeps } from './branded-component/branded-component';
import { debounceTime, Subject } from 'rxjs';
import { craftService } from './craft-service';
import { type SendContextPayload } from './send-context-to-ai.tokens';
import {
  type AppSnapshotRegistry,
  type SnapshotReport,
} from './take-app-snapshot';

export * from './send-context-to-ai.tokens';

/**
 * Collects app snapshot reports so the AI overlay has something to send.
 *
 * The overlay UI itself lives in `@craft-ts/component` (it is built with
 * `craftComponent`, which depends on this package).
 */
export type SendContextToAiBuffer = {
  latestReports: SnapshotReport[];
};

const sendContextToAiBufferService = craftService(
  { name: 'SendContextToAiBuffer', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: {
    $provided: SendContextToAiBuffer | (() => SendContextToAiBuffer);
  }) =>
    typeof inputs.$provided === 'function'
      ? inputs.$provided()
      : inputs.$provided,
) as unknown as {
  SendContextToAiBuffer: () => Generator<
    unknown,
    SendContextToAiBuffer,
    unknown
  >;
  provideSendContextToAiBuffer: (
    value: SendContextToAiBuffer | (() => SendContextToAiBuffer),
  ) => unknown;
  SEND_CONTEXT_TO_AI_BUFFER_META_DATA: { inject(): SendContextToAiBuffer };
};

export const SendContextToAiBuffer =
  sendContextToAiBufferService.SendContextToAiBuffer;
export const provideSendContextToAiBuffer = (
  value: SendContextToAiBuffer | (() => SendContextToAiBuffer),
): unknown => sendContextToAiBufferService.provideSendContextToAiBuffer(value);
export const ɵinjectSendContextToAiBuffer =
  (): SendContextToAiBuffer | null => {
    try {
      return sendContextToAiBufferService.SEND_CONTEXT_TO_AI_BUFFER_META_DATA.inject();
    } catch {
      return null;
    }
  };

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
