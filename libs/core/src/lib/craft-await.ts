import { craftException } from './craft-exception';
import { craftGen, type CraftGenInvocation } from './craft-gen';
import {
  CRAFT_PROMISE_AWAIT_REQUEST_MARKER,
  type RuntimePromiseAwaitRequest,
} from './craft-generator-runtime';

export const CRAFT_PROMISE_REJECTED_CODE = 'CRAFT_PROMISE_REJECTED' as const;

function promiseRejected(cause: unknown) {
  return craftException(
    { _tag: CRAFT_PROMISE_REJECTED_CODE, scope: 'CraftAwait' },
    { cause },
  );
}

export type CraftPromiseRejected = ReturnType<typeof promiseRejected>;

/**
 * Awaits a Promise-based boundary inside a generator loader. Rejections become
 * a typed CRAFT_PROMISE_REJECTED exception, composable with catchTag. Pass the
 * loader's abortSignal to the SDK; cancel releases producers without a signal.
 * Requires an async program driver (query, mutation, asyncProcess, or a guard).
 */
export function craftAwait<T>(
  value: PromiseLike<T> | (() => PromiseLike<T>),
  options: { readonly cancel?: () => void } = {},
): CraftGenInvocation<never, T | CraftPromiseRejected> {
  const invoke = craftGen(function* (): Generator<
    RuntimePromiseAwaitRequest,
    T | CraftPromiseRejected,
    unknown
  > {
    // Settle the boundary before resuming the generator, so a rejection uses
    // Craft's typed exception channel rather than the driver's technical one.
    const settled = Promise.resolve()
      .then(() => (typeof value === 'function' ? value() : value))
      .then(
        (result) => result,
        (cause) => promiseRejected(cause),
      );
    return (yield {
      [CRAFT_PROMISE_AWAIT_REQUEST_MARKER]: true,
      value: settled,
      ...(options.cancel ? { cancel: options.cancel } : {}),
    }) as T | CraftPromiseRejected;
  });
  return invoke() as unknown as CraftGenInvocation<
    never,
    T | CraftPromiseRejected
  >;
}
