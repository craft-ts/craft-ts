import { effect, untracked, WritableSignal } from '@angular/core';
import { ReadonlySource } from './source.type';
import { ReactionInsertionException } from '../business-exception';

export const SourceBrand = Symbol('SourceBrand');

export const SourceBranded = {
  [SourceBrand]: true as const,
};

export type SourceBranded<
  ReactionInsertionExceptions extends ReactionInsertionException = never,
> =
  {
  [SourceBrand]: true;
  /**
   * Type-only carrier used to infer reaction insertion exceptions from `on$` callbacks.
   */
  readonly __reactionInsertionExceptions__?: ReactionInsertionExceptions;
};

/**
 * Works for Source and ReadonlySource
 */
export function isSource(value: any): boolean {
  return value && SourceBrand in value;
}

export type SourceBrand = typeof SourceBrand;

export function capitalize<S extends string>(str: S): Capitalize<S> {
  return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<S>;
}

export function createMethodHandlers<State>(
  methodsData:
    | Record<
        string,
        ((...args: any[]) => NoInfer<State>) | ReadonlySource<State>
      >
    | undefined,
  state: WritableSignal<State>,
  options?: {
    onStateChange?: (newValue: State) => void;
  },
) {
  const { methodsConnectedToSource, methods } = Object.entries(
    methodsData ?? {},
  ).reduce(
    (acc, [methodName, methodValue]) => {
      if (isSource(methodValue)) {
        acc.methodsConnectedToSource.push(
          methodValue as ReadonlySource<unknown>,
        );
        return acc;
      }
      acc.methods[methodName] = methodValue as Function;
      return acc;
    },
    {
      methodsConnectedToSource: [],
      methods: {},
    } as {
      methodsConnectedToSource: ReadonlySource<unknown>[];
      methods: Record<string, Function>;
    },
  );

  const finalMethods = Object.entries(methods ?? {}).reduce(
    (acc, [methodName, method]) => {
      acc[methodName] = (...args: any[]) => {
        const result = method(...args);
        state.set(result);
        options?.onStateChange?.(result);
      };
      return acc;
    },
    {} as Record<string, Function>,
  );

  methodsConnectedToSource.forEach((sourceSignal) => {
    effect(() => {
      const newValue = sourceSignal();
      untracked(() => {
        if (newValue !== undefined) {
          state.set(newValue as NoInfer<State>);
        }
      });
    });
  });
  return finalMethods;
}
