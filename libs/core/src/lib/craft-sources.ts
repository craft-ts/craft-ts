import { isSignal } from '@angular/core';
import {
  ContextConstraints,
  CraftFactoryUtility,
  PartialContext,
  partialContext,
  StoreConfigConstraints,
} from './craft';
import { SignalSource } from './signal-source';
import { Source$ } from './source$';
import { capitalize } from './util/util';

// todo handle Observable that are readonly (not Subject...)

type InferSourceType<S> =
  S extends SignalSource<infer T>
    ? T
    : S extends Source$<infer U>
      ? U
      : S extends _Subscribable<infer V>
        ? V
        : never;

type PrefixedSourceType<S> =
  S extends SignalSource<infer T>
    ? 'set'
    : S extends Source$<infer U>
      ? 'emit'
      : S extends _Subscribable<infer V>
        ? 'next'
        : never;

export type SourceSetterMethods<Sources extends {}> = {
  [K in keyof Sources as `${PrefixedSourceType<Sources[K]>}${Capitalize<string & K>}`]: (
    payload: InferSourceType<Sources[K]>,
  ) => void;
};

type SpecificCraftSourcesOutputs<Sources extends {}> = PartialContext<{
  methods: SourceSetterMethods<Sources>;
  _sources: Sources;
}>;

type CraftSourcesOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Inputs extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftSourcesOutputs<Inputs>
>;

// Help to infer RxJs Observable inner type without referencing the library in the types
interface _Subscribable<T> {
  subscribe(observer: (value: T) => void): unknown;
}

/**
 * Creates source definitions for use within a craft store, enabling reactive signal-source-driven communication.
 *
 * `craftSources` integrates source instances into a craft store by:
 * - Registering multiple sources with their names as keys
 * - Automatically generating setter methods with `set` prefix for each source
 * - Providing type-safe access to sources and their setter methods
 * - Enabling reactive patterns where states and queries can react to source emissions
 *
 * @param sourcesFactory - A factory function that returns an object mapping source names to Source instances.
 * Each source can be a SignalSource, Source$, or any Observable-like object.
 * The factory enables sources to be created within Angular's injection context.
 *
 * @returns A craft factory utility that:
 * - Makes sources accessible in context for other craft entries via `context.sourceName`
 * - Adds prefixed setter methods to the store: `store.setSourceName(payload)`
 *
 * @example
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'MyStore', providedIn: 'root' },
 *   craftSources(() => ({
 *     userAction: source$<string>(),
 *     refresh: source$<void>(),
 *   })),
 * );
 *
 * const store = injectCraft();
 * store.setUserAction('clicked');
 * ```
 */
export function craftSources<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Sources extends Record<
    string,
    SignalSource<any> | Source$<any> | _Subscribable<any>
  >,
>(
  sourcesFactory: () => Sources, // Return a function enable to run source$ in injection context
): CraftSourcesOutputs<Context, StoreConfig, Sources> {
  return (() => (contextData: ContextConstraints) => {
    const sources = sourcesFactory();
    const methods = Object.entries(sources).reduce(
      (acc, [key, source]) => {
        const prefix = isSignal(source)
          ? 'set'
          : 'emit' in source
            ? 'emit'
            : 'next';
        return {
          ...acc,
          [`${prefix}${capitalize(key)}`]: (payload: unknown) => {
            if (isSignal(source)) {
              source.set(payload);
            } else if ('emit' in source) {
              source.emit(payload);
            } else if ('next' in source) {
              //@ts-expect-error next exists on both Subject and EventEmitter but with different types, we need to check which one it is
              source.next(payload);
            }
          },
        };
      },
      {} as Record<string, (payload: unknown) => void>,
    );
    return partialContext({
      _sources: sources,
      methods,
    }) as SpecificCraftSourcesOutputs<Sources>;
  }) as unknown as CraftSourcesOutputs<Context, StoreConfig, Sources>;
}
