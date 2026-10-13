import type {
  RuntimeTemporalAwaitRequest,
  TemporalTaskHandle,
} from '@craft-ts/core';
import { createCraftStream, type CraftStream } from './craft-stream';

// ---------------------------------------------------------------------------
// Sources driven by the clock or by the DOM. Timers go through the stream
// context's temporal runtime (cancelled with the subscription, driven by the
// virtual clock in tests); events are plain `EventTarget` listeners removed on
// unsubscribe.
// ---------------------------------------------------------------------------

/**
 * Emits 0, 1, 2… every `periodMs`, forever. Bound it with `take`, `takeUntil` or
 * `takeUntilDestroyed`.
 */
export function interval(
  periodMs: number,
): CraftStream<number, RuntimeTemporalAwaitRequest> {
  return timer(periodMs, periodMs);
}

/**
 * Waits `dueMs`, emits 0, then — when `periodMs` is given — keeps emitting
 * 1, 2… every `periodMs`; without `periodMs` it completes after the first value.
 */
export function timer(
  dueMs: number,
  periodMs?: number,
): CraftStream<number, RuntimeTemporalAwaitRequest> {
  return createCraftStream<number, RuntimeTemporalAwaitRequest>(
    (context, sink, teardown) => {
      let count = 0;
      let handle: TemporalTaskHandle | undefined;
      teardown.add(() => handle?.cancel());

      const arm = (delayMs: number) => {
        handle = context.temporal.schedule(
          () => {
            sink.next(count++);
            // A consumer (`take`) may have closed the stream on this very value:
            // do not schedule a tick nobody will receive.
            if (sink.closed) return;
            if (periodMs === undefined) sink.complete();
            else arm(periodMs);
          },
          delayMs,
          { kind: 'timer', destroyRef: context.destroyRef },
        );
      };
      arm(dueMs);
    },
  );
}

export type EventSourceOptions = AddEventListenerOptions;

/**
 * Emits the events `target` dispatches under `eventName`. The listener is
 * removed on unsubscribe. Never completes by itself.
 */
export function fromEvent<E extends Event = Event>(
  target: EventTarget,
  eventName: string,
  options?: EventSourceOptions,
): CraftStream<E, never> {
  return createCraftStream<E, never>((_context, sink) => {
    const listener = (event: Event) => sink.next(event as E);
    target.addEventListener(eventName, listener, options);
    return {
      unsubscribe: () =>
        target.removeEventListener(eventName, listener, options),
    };
  });
}
