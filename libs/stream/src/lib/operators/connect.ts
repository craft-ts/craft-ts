import {
  behaviorSubject,
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
} from '../craft-stream';
import { fromSubscribable } from '../sources';

// ---------------------------------------------------------------------------
// Connectable streams: sharing with an explicit connection point.
//
// A connectable stream feeds a hub (a core subject) from its source, but only
// once `connect()` is called — subscribers attach first, so a synchronous
// source reaches all of them. `share()` / `shareReplay()` are this with an
// automatic connection; reach for `connectable(...)` when the moment of
// connection matters.
//
// As with `share`, the upstream runs with the context captured when the
// connectable is created / the operator is applied.
// ---------------------------------------------------------------------------

export type ConnectableStream<A, Y = never> = CraftStream<A, Y> & {
  /** Subscribes to the source, once. Returns a handle that disconnects. */
  connect(): Unsubscribable;
  readonly connected: boolean;
};

export type ConnectableOptions<A> = {
  /** Builds the hub subscribers attach to (default: a plain `subject()`). */
  connector?: () => Subject<A, unknown>;
  /** Start over with a fresh hub after a disconnection (default `true`). */
  resetOnDisconnect?: boolean;
};

const CONNECTABLE = Symbol('craft-stream-connectable');

function isConnectable(stream: unknown): stream is ConnectableStream<unknown> {
  return (
    typeof stream === 'object' &&
    stream !== null &&
    CONNECTABLE in stream &&
    typeof (stream as { connect?: unknown }).connect === 'function'
  );
}

/** Wraps `source` in a connectable stream. Nothing runs until `connect()`. */
export function connectable<A, Y>(
  source: CraftStream<A, Y>,
  options: ConnectableOptions<A> = {},
): ConnectableStream<A, Y> {
  const context = captureStreamContext();
  const makeHub = options.connector ?? (() => subject<A, unknown>());
  const reset = options.resetOnDisconnect ?? true;
  let hub = makeHub();
  let connection: Unsubscribable | undefined;

  const stream = createCraftStream<A, Y>((_context, sink, teardown) => {
    const current = hub;
    teardown.add(
      current.subscribe({
        next: (value) => sink.next(value),
        exception: (exception) => sink.exception(exception),
        error: (error) => sink.error(error),
        complete: () => sink.complete(),
      }),
    );
  });

  const handle: ConnectableStream<A, Y> = Object.assign(stream, {
    [CONNECTABLE]: true,
    connect(): Unsubscribable {
      if (!connection) {
        const current = hub;
        const link = (source as AnyCraftStream)[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: (value) => current.next(value as A),
              exception: (exception) => current.exception(exception),
              error: (error) => current.error(error),
              complete: () => current.complete(),
            },
            () => current.closed,
          ),
        );
        // A synchronous source may already have closed the hub.
        connection = link;
      }
      const active = connection;
      return {
        unsubscribe: () => {
          if (connection !== active) return;
          connection.unsubscribe();
          connection = undefined;
          if (reset) hub = makeHub();
        },
      };
    },
    get connected() {
      return connection !== undefined;
    },
  });
  return handle;
}

export type ConnectOptions<A> = {
  /** Builds the hub the selector's `shared` stream reads from (default: a plain subject). */
  connector?: () => Subject<A, unknown>;
};

/**
 * Shares the source with a `selector` that may use it several times: the
 * selector receives a hot `shared` stream and returns the stream to emit. The
 * source is connected once the selector's stream is subscribed, so a
 * synchronous source reaches every use of `shared`.
 *
 * ```ts
 * source$.pipe(connect((shared) => merge(shared.pipe(take(1)), shared.pipe(skip(5)))));
 * ```
 *
 * The source's exceptions travel in the result's `Y`; `shared` itself is typed
 * exception-free.
 */
export function connect<A, B, YB>(
  selector: (shared: CraftStream<A, never>) => CraftStream<B, YB>,
  options: ConnectOptions<A> = {},
): <Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y | YB> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      const hub = (options.connector ?? (() => subject<A, unknown>()))();
      const shared = fromSubscribable(hub as Subject<A, never>);
      const result = selector(shared) as AnyCraftStream;
      // The selector's stream attaches first; only then does the source start.
      teardown.add(result[STREAM_RUN](context, sink));
      if (sink.closed) return;
      teardown.add(
        source[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: (value) => hub.next(value as A),
              exception: (exception) => hub.exception(exception),
              error: (error) => hub.error(error),
              complete: () => hub.complete(),
            },
            () => hub.closed || sink.closed,
          ),
        ),
      );
    })) as never;
}

type Hub<A> = Subject<A, unknown> | (() => Subject<A, unknown>);

/**
 * Multicasts through `hub` (a core subject, or a function making one). Returns
 * a connectable stream: pair it with {@link refCount}, or — to call `connect()`
 * yourself — use {@link connectable}, since `.pipe(...)` types its result as a
 * plain stream.
 */
export function multicast<A>(
  hub: Hub<A>,
): <Y>(stream: CraftStream<A, Y>) => ConnectableStream<A, Y> {
  return ((source: AnyCraftStream) =>
    connectable(source, {
      connector: typeof hub === 'function' ? hub : () => hub,
    })) as never;
}

/** `multicast` through a plain subject. */
export function publish(): <A, Y>(
  stream: CraftStream<A, Y>,
) => ConnectableStream<A, Y> {
  return ((source: AnyCraftStream) =>
    connectable(source, {
      connector: () => subject<unknown, unknown>(),
    })) as never;
}

/** `multicast` through a replay subject: late subscribers get the last `count` values. */
export function publishReplay(
  count: number,
): <A, Y>(stream: CraftStream<A, Y>) => ConnectableStream<A, Y> {
  return ((source: AnyCraftStream) =>
    connectable(source, {
      connector: () => replaySubject<unknown, unknown>(count),
    })) as never;
}

/** `multicast` through a behavior subject holding `initial` until the source emits. */
export function publishBehavior<B>(
  initial: B,
): <A, Y>(stream: CraftStream<A | B, Y>) => ConnectableStream<A | B, Y> {
  return ((source: AnyCraftStream) =>
    connectable(source, {
      connector: () => behaviorSubject<unknown, unknown>(initial),
    })) as never;
}

/**
 * Connects a connectable stream when its first subscriber arrives and
 * disconnects when the last one leaves. `pipe(publish(), refCount())` is
 * `share()`.
 */
export function refCount(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y> {
  return ((source: AnyCraftStream) => {
    let subscribers = 0;
    let connection: Unsubscribable | undefined;

    return createCraftStream<unknown, unknown>((context, sink, teardown) => {
      if (!isConnectable(source)) {
        sink.error(
          new Error(
            'refCount(...) must follow publish(), publishReplay(), publishBehavior() or multicast().',
          ),
        );
        return;
      }
      const upstream = source as ConnectableStream<unknown>;
      // Attach first, so a synchronous source reaches this subscriber too.
      teardown.add(upstream[STREAM_RUN](context, sink));
      subscribers += 1;
      teardown.add(() => {
        subscribers -= 1;
        if (subscribers === 0) {
          connection?.unsubscribe();
          connection = undefined;
        }
      });
      if (subscribers === 1 && !sink.closed) connection = upstream.connect();
    });
  }) as never;
}
