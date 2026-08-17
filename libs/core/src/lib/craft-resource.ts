import {
  DestroyRef,
  effect,
  inject,
  Injector,
  type ResourceLoaderParams,
  type ResourceOptions,
  type ResourceSnapshot,
  type ResourceStatus,
  type Signal,
} from './host/craft-compat';
import {
  craftBatch,
  craftComputed,
  craftSignal,
  craftWatch,
  untracked,
} from './host/craft-signal';
import { CraftResourceRef } from './util/craft-resource-ref';
import { ɵcraftInjectorFromHost } from './host/angular-craft-injector-host';

type CraftResourceOptions<Value, Params> = Omit<
  ResourceOptions<Value, Params>,
  'loader' | 'stream'
> & {
  loader?: (params: ResourceLoaderParams<Params>) => Value | PromiseLike<Value>;
  stream?: ResourceOptions<Value, Params>['stream'];
};

export function craftResource<Value, Params>(
  options: CraftResourceOptions<Value, Params>,
): CraftResourceRef<Value, Params> {
  const injector = ɵcraftInjectorFromHost(
    options.injector ?? inject(Injector),
  );
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
    craftBatch(() => {
      valueState.set(undefined);
      errorState.set(error instanceof Error ? error : new Error(String(error)));
      statusState.set('error');
    });
  };

  const startLoad = (params: Params, reload: boolean): void => {
    abortController?.abort();
    stopStream?.();
    stopStream = undefined;
    const controller = new AbortController();
    abortController = controller;
    const version = ++requestVersion;
    const previousStatus = statusState();
    // One transition, one notification. These writes describe a single state,
    // and every write notifies synchronously — a reader let in between them
    // sees a resource half in its old state and half in its new one, and code
    // it wakes (a cache restoring a value, say) is then overwritten by the
    // rest of this very function.
    craftBatch(() => {
      errorState.set(undefined);
      if (reload && valueState() !== undefined) {
        statusState.set('reloading');
      } else {
        statusState.set('loading');
        valueState.set(options.defaultValue);
      }
    });
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
          craftBatch(() => {
            valueState.set(value);
            statusState.set('resolved');
          });
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
              const item =
                typeof stream === 'function'
                  ? stream()
                  : { value: undefined as Value };
              if (!item) {
                return;
              }
              if ('error' in item) {
                finishWithError(version, item.error);
              } else {
                craftBatch(() => {
                  valueState.set(item.value);
                  statusState.set('resolved');
                });
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
      craftBatch(() => {
        errorState.set(undefined);
        if (statusState() !== 'local') {
          valueState.set(options.defaultValue);
          statusState.set('idle');
        }
      });
      return;
    }
    startLoad(params, false);
  };

  // The params source is a craft signal like everything else, so one watch
  // keeps the resource in step with it. This used to be an Angular linkedSignal,
  // an effect reading it, and a craft watch underneath — three ways of noticing
  // the same change, needed only while two reactive systems had to agree.
  const paramsWatch = options.params
    ? craftWatch(() => {
        const params = options.params!();
        untracked(() => synchronizeParams(params));
      })
    : undefined;

  // Readers are the state signals themselves. They used to be wrappers that
  // mirrored each value into an Angular signal AND re-synchronized the params on
  // every read — a lazy pull that could restart a load from inside an unrelated
  // read, wiping whatever was being written at the time.
  const value = craftComputed(() => valueState());
  const status = craftComputed(() => statusState());
  const publicIsLoading = isLoading;
  const error = craftComputed(() => errorState());
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
    craftBatch(() => {
      valueState.set(options.defaultValue);
      errorState.set(undefined);
      statusState.set('idle');
    });
    paramsWatch?.destroy();
  };
  const set = (next: Value | undefined): void => {
    abortController?.abort();
    stopStream?.();
    stopStream = undefined;
    ++requestVersion;
    // Claim the params before publishing: a locally set value belongs to the
    // params in force, so the watch must not read the write back as a new
    // request and reload over it.
    if (options.params) {
      currentParams = untracked(() => options.params!());
      hasCurrentParams = true;
    }
    craftBatch(() => {
      valueState.set(next);
      errorState.set(undefined);
      statusState.set('local');
    });
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
