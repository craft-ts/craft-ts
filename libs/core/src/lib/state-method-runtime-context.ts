import type { Provider, Signal } from '@angular/core';
import {
  injectPrimitiveMethodRuntimeContext,
  ɵprovidePrimitiveMethodRuntimeContext,
  type PrimitiveMethodRuntimeContext,
} from './primitive-method-runtime-context';

export type StateMethodRuntimeContext = PrimitiveMethodRuntimeContext<'state'>;

type StateInsertionContext = Readonly<{
  state: Signal<unknown>;
  set(value: unknown): unknown;
  update(updater: (current: unknown) => unknown): unknown;
  patch(updater: (current: unknown) => object): unknown;
}>;

export function injectStateMethodRuntimeContext():
  | StateMethodRuntimeContext
  | undefined {
  const context = injectPrimitiveMethodRuntimeContext();
  return context?.kind === 'state'
    ? (context as StateMethodRuntimeContext)
    : undefined;
}

export function ɵprovideStateMethodRuntimeContext(
  context: StateInsertionContext,
  originalFactory: (...args: never[]) => unknown,
): Provider {
  return ɵprovidePrimitiveMethodRuntimeContext(
    'state',
    context,
    originalFactory,
  );
}
