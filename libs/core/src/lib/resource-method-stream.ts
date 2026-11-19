import {
  DestroyRef,
  ErrorHandler,
  Injector,
  runInInjectionContext,
} from './host/craft-compat';
import type { Observer, Subscribable, Unsubscribable } from './stream-kernel';
import { isObservableLike } from './stream-kernel';

export interface CraftResourceMethodStream<Params, Yielded = never>
  extends Subscribable<Params> {
  readonly __craftResourceMethodStream: true;
  readonly __craftResourceMethodStreamTypes?: {
    readonly params: Params;
    readonly yielded: Yielded;
  };
}

export type CraftResourceMethodStreamParams<Stream> =
  Stream extends CraftResourceMethodStream<infer Params, infer _Yielded>
    ? Params
    : never;

export type CraftResourceMethodStreamYielded<Stream> =
  Stream extends CraftResourceMethodStream<infer _Params, infer Yielded>
    ? Yielded
    : never;

export function isCraftResourceMethodStream(
  value: unknown,
): value is CraftResourceMethodStream<unknown, unknown> {
  return isObservableLike(value);
}

/**
 * Consume a method stream in the resource's injector and release it with the
 * injector owner. The stream's terminal channels remain distinct.
 */
export function subscribeCraftResourceMethodStream<Params, Yielded>(
  stream: CraftResourceMethodStream<Params, Yielded>,
  injector: Injector,
  observer: Pick<Observer<Params>, 'next' | 'error'> & {
    exception(exception: unknown): void;
  },
): Unsubscribable {
  const owner = injector.get(DestroyRef);
  let active = true;
  const subscription: { current?: Unsubscribable } = {};
  const unsubscribe = () => {
    if (!active) return;
    active = false;
    subscription.current?.unsubscribe();
  };

  owner.onDestroy(unsubscribe);
  subscription.current = runInInjectionContext(injector, () => {
    const streamObserver = {
      next: (value) => {
        if (active) observer.next(value);
      },
      exception: (exception) => {
        if (active) observer.exception(exception);
      },
      error: (error) => {
        if (active) observer.error(error);
      },
      complete: () => undefined,
    } satisfies Partial<Observer<Params>> & {
      exception(exception: unknown): void;
    };
    return stream.subscribe(streamObserver);
  });

  // A synchronous stream can complete during subscribe. Re-check the owner
  // after the subscription handle exists in case it was destroyed reentrantly.
  if (!active) subscription.current.unsubscribe();
  return { unsubscribe };
}

export function reportResourceMethodStreamError(
  injector: Injector,
  error: unknown,
): void {
  runInInjectionContext(injector, () =>
    injector.get(ErrorHandler).handleError(error),
  );
}
