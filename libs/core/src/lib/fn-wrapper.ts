import { inject, InjectionToken, type Provider } from '@angular/core';
import { isGeneratorFunction } from './craft-generator-runtime';

export { isGenerator, isGeneratorFunction } from './craft-generator-runtime';

type AnyFactory = (...args: any[]) => any;
type AnyGeneratorFactory = (
  ...args: any[]
) => Generator<unknown, unknown, unknown>;

export type FnWrapper = (
  factory: AnyGeneratorFactory,
  thisArg: unknown,
  args: unknown[],
) => Generator<unknown, unknown, unknown>;

export type FnFactoryAdapter = <F extends AnyFactory>(factory: F) => F;

const IDENTITY_ADAPTER: FnFactoryAdapter = ((factory) =>
  factory) as FnFactoryAdapter;

export const FN_WRAPPER = new InjectionToken<readonly FnWrapper[]>(
  'FN_WRAPPER',
  {
    providedIn: 'root',
    factory: () => [],
  },
);

export function provideFnWrapper(wrapper: FnWrapper): Provider {
  return { provide: FN_WRAPPER, useValue: wrapper, multi: true };
}

export function injectFnWrapper(): FnFactoryAdapter {
  const wrappers = inject(FN_WRAPPER);
  if (wrappers.length === 0) {
    return IDENTITY_ADAPTER;
  }
  return (<F extends AnyFactory>(factory: F): F => {
    let current: AnyGeneratorFactory = toGeneratorFactory(factory);
    // First registered wrapper is the outermost; iterate from last to first.
    for (let i = wrappers.length - 1; i >= 0; i--) {
      const wrapper = wrappers[i];
      const inner = current;
      current = function* (this: unknown, ...args: unknown[]) {
        return yield* wrapper(inner, this, args);
      };
    }
    return current as unknown as F;
  }) as FnFactoryAdapter;
}

function toGeneratorFactory(factory: AnyFactory): AnyGeneratorFactory {
  if (isGeneratorFunction(factory)) {
    return factory as AnyGeneratorFactory;
  }
  return function* (this: unknown, ...args: unknown[]) {
    return factory.apply(this, args);
  };
}
