import type { GetDeps } from './branded-component/branded-component';
import { craftService } from './craft-service';
import { type SendContextPayload } from './send-context-to-ai.tokens';
import {
  type AppSnapshotRegistry,
  type SnapshotReport,
} from './take-app-snapshot';

export * from './send-context-to-ai.tokens';

/**
 * Reads app snapshot reports when the AI overlay prepares a payload.
 *
 * The overlay UI itself lives in `@craft-ts/component` (it is built with
 * `craftComponent`, which depends on this package).
 */
export type SendContextToAiBuffer = {
  snapshot: () => SnapshotReport[];
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
  return { snapshot: () => registry.snapshot() };
}

export type GenDeps_SendContextToAiBuffer = GetDeps<{
  deps: {};
  provided: {};
}>;
