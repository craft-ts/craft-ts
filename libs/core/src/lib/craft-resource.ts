import {
  DestroyRef,
  effect,
  inject,
  Injector,
  signal as ngSignal,
  untracked as ngUntracked,
  type ResourceLoaderParams,
  type ResourceOptions,
  type ResourceSnapshot,
  type ResourceStatus,
  type Signal,
} from './host/craft-compat';
import {
  CRAFT_SIGNAL,
  craftComputed,
  craftSignal,
  craftWatch,
  untracked,
  type CraftSignal,
} from './host/craft-signal';
import { RAW_REACTIVE_VALUE } from './reactive-read';
import { CraftResourceRef } from './util/craft-resource-ref';
import { angularLinkedSignal } from './host/angular-linked-signal';

type CraftResourceOptions<Value, Params> = Omit<
  ResourceOptions<Value, Params>,
  'loader' | 'stream'
> & {
  loader?: (params: ResourceLoaderParams<Params>) => Value | PromiseLike<Value>;
  stream?: ResourceOptions<Value, Params> extends infer Options
    ? Options extends { stream: infer Stream }
      ? Stream
      : never
    : never;
  injector?: Injector;
};

export function craftResource<Value, Params>(
  options: CraftResourceOptions<Value, Params>,
): CraftResourceRef<Value, Params> {
  const injector = options.injector ?? inject(Injector);
  const valueState = craftSignal<Value | undefined>(options.defaultValue, {
    equal: options.equal as
      | ((a: Value | undefined, b: Value | undefined) => boolean)
      | undefined,
  });
  const statusState = craftSignal<ResourceStatus>('idle');
  const errorState = craftSignal<Error | undefined>(undefined);
  const isLoading = craftComputed(() => {
    const status = statusState();
    return status === 'loading' || status === 'reloading';
  });
  let currentParams: Params | undefined;
  let hasCurrentParams = false;
  let destroyed = false;
  let requestVersion = 0;
  let abortController: AbortController | undefined;
  let stopStream: (() => void) | undefined;

  const finishWithError = (version: number, error: unknown): void => {
    if (destroyed || version !== requestVersion) return;
    valueState.set(undefined);
    errorState.set(error instanceof Error ? error : new Error(String(error)));
    statusState.set('error');
  };

  const startLoad = (params: Params, reload: boolean): void => {
    abortController?.abort();
    stopStream?.();
    stopStream = undefined;
    const controller = new AbortController();
    abortController = controller;
    const version = ++requestVersion;
    const previousStatus = statusState();
    errorState.set(undefined);
    if (reload && valueState() !== undefined) {
      statusState.set('reloading');
    } else {
      statusState.set('loading');
      valueState.set(options.defaultValue);
    }
    const loaderParams: ResourceLoaderParams<Params> = {
      params: params as Exclude<Params, undefined>,
      abortSignal: controller.signal,
      previous: { status: previousStatus },
    };

    if (options.loader) {
      let result: Value | PromiseLike<Value>;
      try {
        result = options.loader(loaderParams);
      } catch (error) {
        finishWithError(version, error);
        return;
      }
      Promise.resolve(result).then(
        (value) => {
          if (
            destroyed ||
            controller.signal.aborted ||
            version !== requestVersion
          ) {
            return;
          }
          valueState.set(value);
          statusState.set('resolved');
        },
        (error) => finishWithError(version, error),
      );
      return;
    }

    if (options.stream) {
      Promise.resolve(options.stream(loaderParams)).then(
        (stream) => {
          if (
            destroyed ||
            controller.signal.aborted ||
            version !== requestVersion
          ) {
            return;
          }
          const streamEffect = effect(
            () => {
              const item = stream();
              if ('error' in item) {
                finishWithError(version, item.error);
              } else {
                valueState.set(item.value);
                statusState.set('resolved');
              }
            },
            { injector },
          );
          stopStream = () => streamEffect.destroy();
        },
        (error) => finishWithError(version, error),
      );
    }
  };

  const synchronizeParams = (params: Params | undefined): void => {
    if (destroyed) return;
    if (hasCurrentParams && Object.is(currentParams, params)) return;
    currentParams = params;
    hasCurrentParams = true;
    if (params === undefined) {
      abortController?.abort();
      ++requestVersion;
      errorState.set(undefined);
      if (statusState() !== 'local') {
        valueState.set(options.defaultValue);
        statusState.set('idle');
      }
      return;
    }
    startLoad(params, false);
  };

  const angularParams = options.params
    ? angularLinkedSignal({
        source: () => options.params!(),
        computation: (current) => current,
        injector,
      })
    : undefined;
  let craftParamsWatch: { destroy(): void } | undefined;
  const paramsEffect = angularParams
    ? effect(
        () => {
          const params = angularParams();
          ngUntracked(() => synchronizeParams(params));
          if (!craftParamsWatch) {
            ngUntracked(() => {
              let initialized = false;
              craftParamsWatch = craftWatch(() => {
                const craftParams = options.params?.();
                if (initialized) {
                  untracked(() => synchronizeParams(craftParams));
                } else {
                  initialized = true;
                }
              });
            });
          }
        },
        { injector },
      )
    : undefined;

  const graphWatches: { destroy(): void }[] = [];
  const synchronizeReader = <T>(
    source: CraftSignal<T>,
    synchronize = true,
  ): CraftSignal<T> => {
    const angularMirror = ngSignal(untracked(source));
    graphWatches.push(
      craftWatch(() => {
        const next = source();
        ngUntracked(() => angularMirror.set(next));
      }),
    );
    const reader = (() => {
      if (synchronize && !destroyed && angularParams) {
        synchronizeParams(angularParams());
      }
      angularMirror();
      return source();
    }) as CraftSignal<T>;
    Object.defineProperties(reader, {
      [CRAFT_SIGNAL]: { value: true, enumerable: false },
      [RAW_REACTIVE_VALUE]: { value: reader, enumerable: false },
    });
    return reader;
  };
  const value = synchronizeReader(craftComputed(() => valueState()));
  const status = synchronizeReader(craftComputed(() => statusState()));
  const publicIsLoading = synchronizeReader(isLoading, false);
  const error = synchronizeReader(
    craftComputed(() => errorState()),
    false,
  );
  const snapshot = craftComputed(
    () =>
      (status() === 'error'
        ? { status: 'error', error: errorState() }
        : { status: status(), value: value() }) as ResourceSnapshot<
        Value | undefined
      >,
  );
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    abortController?.abort();
    stopStream?.();
    ++requestVersion;
    valueState.set(options.defaultValue);
    errorState.set(undefined);
    statusState.set('idle');
    paramsEffect?.destroy();
    craftParamsWatch?.destroy();
    angularParams?.destroy();
    graphWatches.forEach((watch) => watch.destroy());
  };
  const set = (next: Value | undefined): void => {
    abortController?.abort();
    stopStream?.();
    stopStream = undefined;
    ++requestVersion;
    valueState.set(next);
    errorState.set(undefined);
    statusState.set('local');
    if (angularParams) {
      currentParams = ngUntracked(() => angularParams());
      hasCurrentParams = true;
    }
  };
  const update = (
    updater: (value: Value | undefined) => Value | undefined,
  ): void => set(updater(untracked(valueState)));
  const reload = (): boolean => {
    if (destroyed || !hasCurrentParams || currentParams === undefined) {
      return false;
    }
    startLoad(currentParams, true);
    return true;
  };

  const resourceRef = {
    value,
    hasValue: () => status() !== 'error' && value() !== undefined,
    snapshot,
    status,
    // Internal channel only: `error` is not part of the CraftResourceRef surface
    // (replaced by the exceptions API) but stays on the object at runtime so
    // `craftUntilSettled` can rethrow a residual technical failure.
    error,
    isLoading: publicIsLoading,
    reload,
    destroy,
    update,
    set,
    asReadonly: () => resourceRef,
    paramSrc: options.params as Signal<Params | undefined>,
    state: value,
  };
  Object.defineProperties(resourceRef, {
    __craftRawValue: {
      value: valueState,
      enumerable: false,
      configurable: true,
    },
    __craftRawStatus: {
      value: statusState,
      enumerable: false,
      configurable: true,
    },
  });

  injector.get(DestroyRef).onDestroy(destroy);
  return resourceRef as unknown as CraftResourceRef<Value, Params>;
}
