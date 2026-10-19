import type { SendContextEvent, SendContextSession } from '@craft-ts/core';

type DialogMethod = 'alert' | 'confirm' | 'prompt';
type DialogResult = boolean | string | null | undefined;

type ReplayDialog = Readonly<{
  method: DialogMethod;
  message: string;
  durationMs: number;
  result?: DialogResult;
  promptValueCaptured: boolean;
}>;

export type DebugSessionReplayDialogNotice = Readonly<{
  method: DialogMethod;
  message: string;
  durationMs: number;
  recorded: boolean;
  result?: DialogResult;
}>;

type ReplayDialogState = {
  readonly entries: readonly ReplayDialog[];
  readonly onDialog: (notice: DebugSessionReplayDialogNotice) => void;
  cursor: number;
};

type DialogController = Readonly<{
  startReplay(
    events: readonly SendContextEvent[],
    onDialog: (notice: DebugSessionReplayDialogNotice) => void,
  ): () => void;
}>;

const dialogControllers = new WeakMap<Window, DialogController>();

/**
 * Captures blocking browser dialogs and lets the replay bridge replace them
 * with recorded, non-blocking results.
 */
export function connectDebugSessionDialogCapture(
  session: SendContextSession,
  options: Readonly<{ capturePromptValues?: boolean }> = {},
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const target = window;
  const originalAlert = target.alert;
  const originalConfirm = target.confirm;
  const originalPrompt = target.prompt;
  let replayState: ReplayDialogState | undefined;
  let sequence = 0;

  const startReplay: DialogController['startReplay'] = (events, onDialog) => {
    replayState = {
      entries: replayDialogsFromEvents(events),
      onDialog,
      cursor: 0,
    };
    return () => {
      replayState = undefined;
    };
  };
  dialogControllers.set(target, { startReplay });

  target.alert = function (message?: string): void {
    const text = normalizeDialogMessage(message);
    const replay = nextReplayDialog('alert');
    if (replayState) {
      notifyReplayDialog('alert', replay, text);
      return;
    }

    const operationId = captureDialogStart('alert', text);
    const startedAt = now();
    try {
      originalAlert.call(target, message);
      captureDialogFinish(operationId, 'alert', startedAt, undefined);
    } catch (error) {
      captureDialogFailure(operationId, 'alert', startedAt, error);
      throw error;
    }
  };

  target.confirm = function (message?: string): boolean {
    const text = normalizeDialogMessage(message);
    const replay = nextReplayDialog('confirm');
    if (replayState) {
      notifyReplayDialog('confirm', replay, text);
      return typeof replay?.result === 'boolean' ? replay.result : false;
    }

    const operationId = captureDialogStart('confirm', text);
    const startedAt = now();
    try {
      const result = originalConfirm.call(target, message);
      captureDialogFinish(operationId, 'confirm', startedAt, result);
      return result;
    } catch (error) {
      captureDialogFailure(operationId, 'confirm', startedAt, error);
      throw error;
    }
  };

  target.prompt = function (
    message?: string,
    defaultValue?: string,
  ): string | null {
    const text = normalizeDialogMessage(message);
    const replay = nextReplayDialog('prompt');
    if (replayState) {
      notifyReplayDialog('prompt', replay, text);
      return replay?.promptValueCaptured &&
        (typeof replay.result === 'string' || replay.result === null)
        ? replay.result
        : null;
    }

    const operationId = captureDialogStart('prompt', text, defaultValue);
    const startedAt = now();
    try {
      const result = originalPrompt.call(target, message, defaultValue);
      captureDialogFinish(operationId, 'prompt', startedAt, result);
      return result;
    } catch (error) {
      captureDialogFailure(operationId, 'prompt', startedAt, error);
      throw error;
    }
  };

  return () => {
    replayState = undefined;
    dialogControllers.delete(target);
    target.alert = originalAlert;
    target.confirm = originalConfirm;
    target.prompt = originalPrompt;
  };

  function captureDialogStart(
    method: DialogMethod,
    message: string,
    defaultValue?: string,
  ): string | undefined {
    if (!session.activeClip) return undefined;
    const operationId = `native-dialog-${++sequence}`;
    const payload: Record<string, unknown> = { method, message };
    if (method === 'prompt' && options.capturePromptValues === true)
      payload['defaultValue'] = defaultValue ?? '';
    try {
      session.capture('dialog', 'started', {
        name: `window.${method}`,
        operationId,
        payload,
      });
    } catch {
      // A diagnostic capture must never prevent the browser dialog from opening.
    }
    return operationId;
  }

  function captureDialogFinish(
    operationId: string | undefined,
    method: DialogMethod,
    startedAt: number,
    result: DialogResult,
  ): void {
    if (!operationId) return;
    const payload: Record<string, unknown> = {
      method,
      durationMs: Math.max(0, now() - startedAt),
    };
    if (method === 'confirm') payload['result'] = result === true;
    if (method === 'prompt') {
      payload['accepted'] = result !== null;
      if (options.capturePromptValues === true) payload['result'] = result;
    }
    try {
      session.capture('dialog', 'succeeded', {
        name: `window.${method}`,
        operationId,
        payload,
      });
    } catch {
      // A diagnostic capture must never change the dialog's result.
    }
  }

  function captureDialogFailure(
    operationId: string | undefined,
    method: DialogMethod,
    startedAt: number,
    error: unknown,
  ): void {
    if (!operationId) return;
    try {
      session.capture('dialog', 'failed', {
        name: `window.${method}`,
        operationId,
        payload: {
          method,
          durationMs: Math.max(0, now() - startedAt),
        },
        response: { name: error instanceof Error ? error.name : 'Error' },
      });
    } catch {
      // A diagnostic capture must never replace the original error.
    }
  }

  function nextReplayDialog(method: DialogMethod): ReplayDialog | undefined {
    if (!replayState) return undefined;
    const expected = replayState.entries[replayState.cursor];
    if (!expected || expected.method !== method) return undefined;
    replayState.cursor += 1;
    return expected;
  }

  function notifyReplayDialog(
    method: DialogMethod,
    expected: ReplayDialog | undefined,
    currentMessage: string,
  ): void {
    if (!replayState) return;
    const notice: DebugSessionReplayDialogNotice = {
      method: expected?.method ?? method,
      message: expected?.message || currentMessage,
      durationMs: expected?.durationMs ?? 0,
      recorded: expected !== undefined,
      ...(expected?.result === undefined ? {} : { result: expected.result }),
    };
    try {
      replayState.onDialog(notice);
    } catch {
      // A parent-frame notification must never block the replayed application.
    }
  }
}

/** Activates the recorder's deterministic dialog results during replay. */
export function startDebugSessionDialogReplay(
  events: readonly SendContextEvent[],
  onDialog: (notice: DebugSessionReplayDialogNotice) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  return dialogControllers.get(window)?.startReplay(events, onDialog) ??
    (() => undefined);
}

function replayDialogsFromEvents(
  events: readonly SendContextEvent[],
): ReplayDialog[] {
  return events.flatMap((event) => {
    if (event.kind !== 'dialog' || event.phase !== 'started') return [];
    const startPayload = isRecord(event.payload) ? event.payload : undefined;
    const method = startPayload?.['method'];
    if (!isDialogMethod(method)) return [];
    const finish = events.find(
      (candidate) =>
        candidate.kind === 'dialog' &&
        candidate.operationId === event.operationId &&
        (candidate.phase === 'succeeded' || candidate.phase === 'failed'),
    );
    const finishPayload = isRecord(finish?.payload) ? finish.payload : {};
    const durationMs = finishPayload['durationMs'];
    const promptValueCaptured =
      method === 'prompt' && 'result' in finishPayload;
    return [
      {
        method,
        message:
          typeof startPayload?.['message'] === 'string'
            ? startPayload['message']
            : '',
        durationMs:
          typeof durationMs === 'number' && Number.isFinite(durationMs)
            ? Math.max(0, durationMs)
            : 0,
        ...(finishPayload['result'] === undefined
          ? {}
          : { result: finishPayload['result'] as DialogResult }),
        promptValueCaptured,
      },
    ];
  });
}

function normalizeDialogMessage(message: unknown): string {
  return typeof message === 'string'
    ? message.slice(0, 2_000)
    : String(message ?? '');
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function isDialogMethod(value: unknown): value is DialogMethod {
  return value === 'alert' || value === 'confirm' || value === 'prompt';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
