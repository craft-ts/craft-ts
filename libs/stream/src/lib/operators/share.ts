import {
  replaySubject,
  subject,
  type Subject,
  type Unsubscribable,
} from '@craft-ts/core';
import {
  captureStreamContext,
  createCraftStream,
  createSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamContext,
} from '../craft-stream';

// ---------------------------------------------------------------------------
// Multicast. A cold stream re-runs for every subscriber; `share` turns it hot:
// one upstream subscription feeds every downstream subscriber.
//
// The upstream runs with the context captured WHEN THE OPERATOR IS APPLIED
// (`.pipe(share())`), not with each subscriber's: there is a single upstream
// run, so it needs a single owner. Apply it in an injection context (a service
// factory, a component field) so its `Injector` and `DestroyRef` are captured —
// the connection is released when that `DestroyRef` is destroyed.
// ---------------------------------------------------------------------------

export type ShareOptions = {
  /** Disconnect from upstream when the last subscriber leaves (default `true`). */
  resetOnRefCountZero?: boolean;
  /** Forget the terminal state so the next subscriber reconnects (default `true`). */
  resetOnTerminal?: boolean;
};

type MulticastConfig = {
  replay: number;
  resetOnRefCountZero: boolean;
  resetOnTerminal: boolean;
};

function multicast(
  config: MulticastConfig,
): (stream: AnyCraftStream) => AnyCraftStream {
  const context: StreamContext = captureStreamContext();
  if (!config.resetOnRefCountZero && !context.destroyRef) {
    throw new Error(
      'This share keeps its upstream connection after the last subscriber leaves, so it needs an owner to release it: apply it in an injection context (a service factory, a component field), or pass { resetOnRefCountZero: true }.',
    );
  }

  return (source) => {
    const makeSubject = (): Subject<unknown, unknown> =>
      config.replay > 0
        ? replaySubject<unknown, unknown>(config.replay)
        : subject<unknown, unknown>();

    let hub = makeSubject();
    let connection: Unsubscribable | undefined;
    let subscribers = 0;
    let destroyed = false;

    const reset = () => {
      connection?.unsubscribe();
      connection = undefined;
      hub = makeSubject();
    };

    const connect = () => {
      const current = hub;
      // Assigned after the call so a synchronous upstream cannot reset a
      // connection that does not exist yet.
      const link = source[STREAM_RUN](
        context,
        createSink<unknown>(
          {
            next: (value) => current.next(value),
            exception: (exception) => {
              current.exception(exception);
              if (config.resetOnTerminal && hub === current) reset();
            },
            error: (error) => {
              current.error(error);
              if (config.resetOnTerminal && hub === current) reset();
            },
            complete: () => {
              current.complete();
              if (config.resetOnTerminal && hub === current) reset();
            },
          },
          () => current.closed || hub !== current,
        ),
      );
      if (hub === current && !current.closed) connection = link;
      else if (hub !== current) link.unsubscribe();
    };

    context.destroyRef?.onDestroy(() => {
      destroyed = true;
      connection?.unsubscribe();
      connection = undefined;
    });

    return createCraftStream((_context, sink, teardown) => {
      subscribers += 1;
      const current = hub;
      const subscription = current.subscribe({
        next: (value) => sink.next(value),
        exception: (exception) => sink.exception(exception),
        error: (error) => sink.error(error),
        complete: () => sink.complete(),
      });
      teardown.add(() => {
        subscription.unsubscribe();
        subscribers -= 1;
        if (
          subscribers === 0 &&
          config.resetOnRefCountZero &&
          hub === current
        ) {
          reset();
        }
      });

      if (!connection && !current.closed && !destroyed) connect();
    });
  };
}

/**
 * Shares one upstream run among all subscribers. Connects on the first
 * subscriber, disconnects (by default) when the last one leaves, and forgets a
 * terminal state so a later subscriber starts a fresh run.
 */
export function share(
  options: ShareOptions = {},
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return multicast({
    replay: 0,
    resetOnRefCountZero: options.resetOnRefCountZero ?? true,
    resetOnTerminal: options.resetOnTerminal ?? true,
  }) as never;
}

/**
 * Like {@link share}, replaying the last `bufferSize` values to late
 * subscribers (default 1). By default the connection outlives its subscribers
 * and a terminal state is kept, so a late subscriber gets the replay and the
 * terminal — the classic `shareReplay` behaviour. Pass
 * `{ resetOnRefCountZero: true }` to release upstream when nobody listens.
 */
export function shareReplay(
  bufferSize = 1,
  options: ShareOptions = {},
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return multicast({
    replay: Math.max(1, bufferSize),
    resetOnRefCountZero: options.resetOnRefCountZero ?? false,
    resetOnTerminal: options.resetOnTerminal ?? false,
  }) as never;
}
