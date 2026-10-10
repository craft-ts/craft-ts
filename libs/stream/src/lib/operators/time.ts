import {
  craftException,
  ɵretrySchedule as retrySchedule,
  type CraftException,
  type CraftGenExceptionMarker,
  type CraftRetryPolicy,
  type CraftTemporalSchedule,
  type RuntimeTemporalAwaitRequest,
  type TemporalTaskHandle,
  type Unsubscribable,
} from '@craft-ts/core';
import {
  createCraftStream,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamContext,
} from '../craft-stream';

// ---------------------------------------------------------------------------
// Time. Every timer goes through the stream context's temporal runtime
// (`CraftTemporalRuntime`): cancelled with the subscription and the owner's
// `DestroyRef`, and driven by `VirtualCraftTemporalRuntime` in tests — no raw
// `setTimeout`. Operators that wait add `RuntimeTemporalAwaitRequest` to `Y`:
// the stream is asynchronous, so a synchronous host cannot consume it in place.
// ---------------------------------------------------------------------------

type TimeOperator = <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y | RuntimeTemporalAwaitRequest>;

function after(
  context: StreamContext,
  delayMs: number,
  kind: string,
  callback: () => void,
): TemporalTaskHandle {
  return context.temporal.schedule(callback, delayMs, {
    kind,
    destroyRef: context.destroyRef,
  });
}

/** Emits the latest value once the source has been quiet for `delayMs`. */
export function debounce(delayMs: number): TimeOperator {
  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) => {
      let pending: { value: unknown } | undefined;
      let handle: TemporalTaskHandle | undefined;
      teardown.add(() => handle?.cancel());

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            pending = { value };
            handle?.cancel();
            handle = after(context, delayMs, 'debounce', () => {
              const emit = pending;
              pending = undefined;
              if (emit) sink.next(emit.value);
            });
          },
          complete: () => {
            handle?.cancel();
            const emit = pending;
            pending = undefined;
            if (emit) sink.next(emit.value);
            sink.complete();
          },
        }),
      );
    })) as never;
}

export type ThrottleOptions = {
  /** Emit the first value of a window at once (default `true`). */
  leading?: boolean;
  /** Emit the last value of a window when it closes (default `false`). */
  trailing?: boolean;
};

/** At most one value per `windowMs`. */
export function throttle(
  windowMs: number,
  options: ThrottleOptions = {},
): TimeOperator {
  const trailing = options.trailing ?? false;
  // With neither edge selected the operator would never emit.
  const leading = (options.leading ?? true) || !trailing;

  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) => {
      let windowOpen = false;
      let held: { value: unknown } | undefined;
      let handle: TemporalTaskHandle | undefined;
      teardown.add(() => handle?.cancel());

      const open = () => {
        windowOpen = true;
        handle = after(context, windowMs, 'throttle', () => {
          windowOpen = false;
          const emit = held;
          held = undefined;
          if (emit) {
            sink.next(emit.value);
            open();
          }
        });
      };

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (!windowOpen) {
              if (leading) sink.next(value);
              else held = { value };
              open();
            } else if (trailing) {
              held = { value };
            }
          },
          complete: () => {
            handle?.cancel();
            const emit = held;
            held = undefined;
            if (emit) sink.next(emit.value);
            sink.complete();
          },
        }),
      );
    })) as never;
}

/** Delays every value by `delayMs`, keeping order; completes after the last one. */
export function delay(delayMs: number): TimeOperator {
  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) => {
      const handles = new Set<TemporalTaskHandle>();
      let upstreamDone = false;
      teardown.add(() => {
        for (const handle of handles) handle.cancel();
        handles.clear();
      });

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            const handle: TemporalTaskHandle = after(
              context,
              delayMs,
              'delay',
              () => {
                handles.delete(handle);
                sink.next(value);
                if (upstreamDone && handles.size === 0) sink.complete();
              },
            );
            handles.add(handle);
          },
          complete: () => {
            upstreamDone = true;
            if (handles.size === 0) sink.complete();
          },
        }),
      );
    })) as never;
}

/** The typed exception a {@link timeout} raises. */
export type StreamTimeoutException = CraftException<
  { _tag: 'StreamTimeout'; scope: undefined },
  { ms: number }
>;

export type TimeoutOptions = {
  /** Maximum wait for the first value. */
  first?: number;
  /** Maximum wait between two values (and, without `first`, before the first). */
  each?: number;
};

/**
 * Raises a typed `StreamTimeout` exception when the source stays silent too
 * long. `timeout(ms)` bounds every gap, the first one included.
 */
export function timeout(
  options: number | TimeoutOptions,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<
  A,
  | Y
  | RuntimeTemporalAwaitRequest
  | CraftGenExceptionMarker<StreamTimeoutException>
> {
  const config: TimeoutOptions =
    typeof options === 'number' ? { each: options } : options;

  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) => {
      let handle: TemporalTaskHandle | undefined;
      teardown.add(() => handle?.cancel());

      const arm = (ms: number | undefined) => {
        handle?.cancel();
        handle = undefined;
        if (ms === undefined) return;
        handle = after(context, ms, 'timeout', () =>
          sink.exception(craftException({ _tag: 'StreamTimeout' }, { ms })),
        );
      };

      arm(config.first ?? config.each);
      if (sink.closed) return;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            arm(config.each);
            sink.next(value);
          },
        }),
      );
    })) as never;
}

/**
 * Resubscribes and re-runs the source when it ends with a typed exception that
 * the policy allows — same policy as the program `retry`. Past `times`
 * attempts the exception goes through. Defects are never retried.
 */
export function retry(policy: CraftRetryPolicy | number): TimeOperator {
  const resolved: CraftRetryPolicy =
    typeof policy === 'number' ? { times: policy } : policy;

  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) => {
      const schedule = retrySchedule(resolved);
      let attempt = 0;
      let generation = 0;
      let current: Unsubscribable | undefined;
      let timer: TemporalTaskHandle | undefined;
      let running = false;
      let again = false;
      teardown.add(() => {
        generation += 1;
        current?.unsubscribe();
        timer?.cancel();
      });

      const startOnce = () => {
        const mine = ++generation;
        const subscription = source[STREAM_RUN](
          context,
          forwardSink(sink, {
            exception: (exception) => {
              const tag = (exception as { _tag?: string })?._tag;
              if (
                (resolved.while &&
                  (tag === undefined || !resolved.while.includes(tag))) ||
                attempt >= resolved.times
              ) {
                sink.exception(exception);
                return;
              }
              attempt += 1;
              const decision = schedule.next({
                attempt,
                elapsedMs: 0,
                error: exception,
              });
              if (decision.done) {
                sink.exception(exception);
              } else if (decision.delayMs > 0) {
                timer = after(context, decision.delayMs, 'retry', pump);
              } else {
                pump();
              }
            },
          }),
        );
        if (generation === mine) current = subscription;
        else subscription.unsubscribe();
      };

      // Trampoline: a synchronously failing source retries in a loop, not
      // through recursion.
      function pump(): void {
        if (running) {
          again = true;
          return;
        }
        running = true;
        do {
          again = false;
          startOnce();
        } while (again && !sink.closed);
        running = false;
      }

      pump();
    })) as never;
}

export type RepeatOptions = {
  /** Extra runs after the first (default: forever). */
  times?: number;
  /** Wait between runs. */
  delayMs?: number;
  /** Or a full schedule (takes precedence over `delayMs`). */
  schedule?: CraftTemporalSchedule;
};

/**
 * Resubscribes when the source completes — forever, or `times` more runs. An
 * exception or defect ends the result as usual. A synchronous source repeated
 * forever never yields control: bound it (`times`, `take`, `takeUntil`) or
 * wait between runs.
 */
export function repeat(options: RepeatOptions = {}): TimeOperator {
  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) => {
      let completions = 0;
      let generation = 0;
      let current: Unsubscribable | undefined;
      let timer: TemporalTaskHandle | undefined;
      let running = false;
      let again = false;
      teardown.add(() => {
        generation += 1;
        current?.unsubscribe();
        timer?.cancel();
      });

      const startOnce = () => {
        const mine = ++generation;
        const subscription = source[STREAM_RUN](
          context,
          forwardSink(sink, {
            complete: () => {
              completions += 1;
              if (options.times !== undefined && completions > options.times) {
                sink.complete();
                return;
              }
              const decision = options.schedule?.next({
                attempt: completions,
                elapsedMs: 0,
              });
              if (decision?.done) {
                sink.complete();
                return;
              }
              const waitMs = decision
                ? decision.delayMs
                : (options.delayMs ?? 0);
              if (waitMs > 0) {
                timer = after(context, waitMs, 'repeat', pump);
              } else {
                pump();
              }
            },
          }),
        );
        if (generation === mine) current = subscription;
        else subscription.unsubscribe();
      };

      function pump(): void {
        if (running) {
          again = true;
          return;
        }
        running = true;
        do {
          again = false;
          startOnce();
        } while (again && !sink.closed);
        running = false;
      }

      pump();
    })) as never;
}
