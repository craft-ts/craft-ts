import { inject, Injector, runInInjectionContext } from '@angular/core';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';

const INVALID_YIELD_ERROR_MESSAGE =
  'craftUse(...) generators can only yield craft primitives, exposed dependency helpers, or craftService dependencies.';
const ON_APP_START_ERROR_MESSAGE =
  'craftUse(...) does not support onAppStart(...): it is only available inside a craftService factory.';
const GUARD_AWAIT_ERROR_MESSAGE =
  'craftUse(...) does not support craftUntilSettled(...)/craftUntilDefined(...): they are only available inside route guards.';

/**
 * Drives any craft generator synchronously outside a generator host and
 * returns its result — the imperative counterpart of `yield*`.
 *
 * Its main use is consuming a craft primitive (`state`, `query`, `mutation`,
 * `asyncProcess`, `queryParams`) in a component field, where no enclosing
 * generator exists:
 *
 * ```ts
 * export class UsersComponent {
 *   readonly users = craftUse(query({ loader: ... }));
 * }
 * ```
 *
 * It also accepts a `craftGen` invocation, an inline generator, or an
 * argument-less generator function. Dependency yields are resolved through the
 * ambient injection context when one is available; a `CraftGenShortCircuit`
 * thrown by a composed `craftGen` propagates unchanged.
 *
 * A generator is single-use: passing the same invocation to `craftUse` twice
 * (or after a `yield*`) drives an exhausted generator and returns `undefined`.
 */
export function craftUse<Yielded, Output>(
  invocation: Generator<Yielded, Output, unknown>,
): Output;
export function craftUse<Yielded, Output>(
  factory: () => Generator<Yielded, Output, unknown>,
): Output;
export function craftUse(
  input:
    | Generator<unknown, unknown, unknown>
    | (() => Generator<unknown, unknown, unknown>),
): unknown {
  const iterator = isGenerator(input) ? input : input();

  // Capture the ambient injector when available. Driving a trivial primitive
  // generator needs none, so `craftUse` stays usable outside an injection
  // context (leniency aligned with the primitives' own eager capture).
  let injector: Injector | undefined;
  try {
    injector = inject(Injector);
  } catch {
    injector = undefined;
  }

  const drive = () =>
    runCraftGenerator({
      iterator,
      injector: injector as Injector,
      hostScope: 'function',
      invalidYieldErrorMessage: INVALID_YIELD_ERROR_MESSAGE,
      multipleAppStartErrorMessage: ON_APP_START_ERROR_MESSAGE,
      onAppStartNotSupportedErrorMessage: ON_APP_START_ERROR_MESSAGE,
      guardAwaitNotSupportedErrorMessage: GUARD_AWAIT_ERROR_MESSAGE,
    }).value;

  return injector ? runInInjectionContext(injector, drive) : drive();
}
