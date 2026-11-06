import {
  DestroyRef,
  inject,
  Injector,
  runInInjectionContext,
} from './host/craft-compat';
import { craftUse } from './craft-use';
import { BrowserWindow } from './browser-boundaries';
import type {
  InsertionParams,
  ResourceExceptionConstraints,
} from './query.core';

/**
 * Reloads a query when its browser tab receives focus again.
 *
 * Add this insertion to a `query` to keep server state fresh when users return
 * to the tab. It uses the injected `BrowserWindow` boundary, which is a no-op
 * during server-side rendering.
 *
 * @example
 * ```ts
 * type Todo = { readonly id: string; readonly title: string };
 *
 * const todos = yield* query(
 *   'todos',
 *   {
 *     loader: function* () {
 *       return yield* loadTodos(); // readonly Todo[]
 *     },
 *   },
 *   insertReloadOnFocus,
 * );
 * ```
 */
export function* insertReloadOnFocus<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  PreviousInsertionsOutputs,
>(
  { reload }: InsertionParams<
    ResourceState,
    ResourceParams,
    Exceptions,
    PreviousInsertionsOutputs
  >,
): Generator<unknown, Record<never, never>, unknown> {
  const injector = inject(Injector);
  const removeFocusListener = yield* BrowserWindow.onFocus(() => {
    runInInjectionContext(injector, () => craftUse(reload()));
  });
  inject(DestroyRef).onDestroy(removeFocusListener);
  return {};
}
