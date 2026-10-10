import {
  DestroyRef,
  craftSignal,
  ɵHOST_TAG_LIST as HOST_TAG_LIST,
  ɵcreateHostTaggedInjector as createHostTaggedInjector,
  ɵinjectAppSnapshotRegistry as injectAppSnapshotRegistry,
  createNamedPrimitiveGen,
  ɵInjector as Injector,
  ɵinject as inject,
  type CompleteServiceDependencyMapFromYielded,
  type NamedCraftPrimitiveGen,
  type Signal,
  type SERVICE_HELPER_DEPENDENCIES,
} from '@craft-ts/core';
import {
  captureStreamContext,
  createSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamExceptions,
} from './craft-stream';
import { traceStreamRoot } from './stream-trace';

export type StreamSignalStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'exception'
  | 'error';

/**
 * The reference a {@link streamSignal} resolves to.
 *
 * `exception` is a `Signal<E | undefined>`: that is what advertises the stream's
 * typed exceptions to the enclosing service, route or component. The stream's
 * service dependencies travel in the carrier, so they are folded into the host's
 * verified dependency tree like any other primitive's.
 */
export type StreamSignalRef<A, E, Dependencies extends object> = {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
  /** The latest value (`undefined` until the first one). */
  readonly value: Signal<A | undefined>;
  readonly status: Signal<StreamSignalStatus>;
  /** The typed exception the stream ended with, if any. */
  readonly exception: Signal<E | undefined>;
  /** The defect the stream ended with, if any. */
  readonly error: Signal<unknown>;
  /** (Re)starts the stream, discarding the previous run. */
  start(): void;
  /** Stops the stream; the status goes back to `idle`. */
  stop(): void;
};

export type StreamSignalOptions = {
  /** Subscribe at creation (default `true`); otherwise call `start()`. */
  readonly autoStart?: boolean;
};

type ServiceDependencies<Y> = CompleteServiceDependencyMapFromYielded<Y> &
  object;

/**
 * Exposes a stream as a named primitive of the enclosing `craftService`
 * (`yield*` it). The stream runs in the service's injection context, so its
 * handlers can resolve services; it is stopped when the service is destroyed.
 *
 * ```ts
 * const results = yield* streamSignal('results', query$.pipe(map(...)));
 * results.value();      // latest value
 * results.exception();  // the typed exception, typed
 * ```
 */
export function streamSignal<const Name extends string, A, Y>(
  name: Name,
  stream: CraftStream<A, Y>,
  options: StreamSignalOptions = {},
): NamedCraftPrimitiveGen<
  Name,
  StreamSignalRef<A, StreamExceptions<Y>, ServiceDependencies<Y>>
> {
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);

  const value = craftSignal<A | undefined>(undefined);
  const status = craftSignal<StreamSignalStatus>('idle');
  const exception = craftSignal<StreamExceptions<Y> | undefined>(undefined);
  const error = craftSignal<unknown>(undefined);

  // Observability, as `source$` does: the stream shows up in app snapshots,
  // tagged with the host that created it.
  const registry = injectAppSnapshotRegistry();
  if (registry) {
    const from =
      createHostTaggedInjector(injector, `stream:${name}`).get(
        HOST_TAG_LIST,
        null,
      ) ?? [];
    registry.registerSnapshotReader(
      name,
      from,
      () => ({
        status: status(),
        value: value(),
        exception: exception(),
        error: error() instanceof Error ? (error() as Error).message : error(),
      }),
      destroyRef,
    );
  }

  let subscription: { unsubscribe(): void } | undefined;

  const stop = () => {
    subscription?.unsubscribe();
    subscription = undefined;
  };

  const start = () => {
    stop();
    value.set(undefined);
    exception.set(undefined);
    error.set(undefined);
    status.set('running');

    // Each run owns its callbacks: a superseded run can no longer write.
    let current = true;
    const context = captureStreamContext({ injector, destroyRef, name });
    const run = traceStreamRoot(
      context,
      createSink<unknown>(
        {
          next: (next) => {
            if (current) value.set(next as A);
          },
          exception: (thrown) => {
            if (!current) return;
            exception.set(thrown as StreamExceptions<Y>);
            status.set('exception');
          },
          error: (thrown) => {
            if (!current) return;
            error.set(thrown);
            status.set('error');
          },
          complete: () => {
            if (current) status.set('completed');
          },
        },
        () => !current,
      ),
      'signal',
      (sink) => (stream as AnyCraftStream)[STREAM_RUN](context, sink),
    );
    subscription = {
      unsubscribe: () => {
        current = false;
        run.unsubscribe();
      },
    };
  };

  destroyRef.onDestroy(stop);

  const ref: StreamSignalRef<A, StreamExceptions<Y>, ServiceDependencies<Y>> = {
    value: value.asReadonly() as Signal<A | undefined>,
    status: status.asReadonly() as Signal<StreamSignalStatus>,
    exception: exception.asReadonly() as Signal<
      StreamExceptions<Y> | undefined
    >,
    error: error.asReadonly() as Signal<unknown>,
    start,
    stop: () => {
      stop();
      status.set('idle');
    },
  };

  if (options.autoStart !== false) start();

  return createNamedPrimitiveGen(name, ref);
}
