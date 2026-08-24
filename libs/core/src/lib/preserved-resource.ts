import {
  signal as ngSignal,
  untracked as ngUntracked,
  type ResourceOptions,
  type Signal,
} from './host/craft-compat';
import { CraftResourceRef } from './util/craft-resource-ref';
import { craftResource } from './craft-resource';
import {
  CRAFT_SIGNAL,
  craftComputed,
  craftSignal,
  craftWatch,
  untracked,
  type CraftWritableSignal,
} from './host/craft-signal';

export function preservedResource<T, R>(
  config: ResourceOptions<T, R>,
): CraftResourceRef<T | undefined, R> {
  const original = craftResource(config);
  const raw = original as unknown as {
    __craftRawValue: Signal<T | undefined>;
    __craftRawStatus: Signal<string>;
  };
  const preserved = craftSignal<T | undefined>(config.defaultValue);
  const angularMirror = ngSignal<T | undefined>(config.defaultValue);
  const publish = (value: T | undefined): void => {
    preserved.set(value);
    ngUntracked(() => angularMirror.set(value));
  };
  const preserveWatch = craftWatch(() => {
    const status = raw.__craftRawStatus();
    if (status !== 'loading' && status !== 'reloading') {
      publish(status === 'error' ? undefined : raw.__craftRawValue());
    }
  });
  const value = (() => {
    angularMirror();
    return preserved();
  }) as CraftWritableSignal<T | undefined>;
  value.set = publish;
  value.update = (update) => publish(update(untracked(preserved)));
  Object.defineProperty(value, CRAFT_SIGNAL, {
    value: true,
    enumerable: false,
  });
  const state = craftComputed(() => value());
  const hasValue = (() =>
    original.hasValue() || value() !== undefined) as CraftResourceRef<
    T | undefined,
    R
  >['hasValue'];
  const destroy = () => {
    original.destroy();
    publish(config.defaultValue);
    preserveWatch.destroy();
  };
  const resourceRef = {
    value,
    // `resource.hasValue()` becomes false as soon as a reload starts, even
    // though `preserved` still exposes the last resolved value to consumers.
    // Reflect the public value here so guards such as `ifBlock(hasValue)` do
    // not hide preserved content during a reload.
    hasValue,
    snapshot: original.snapshot,
    status: original.status,
    // Internal channel only: not part of the CraftResourceRef surface, kept at
    // runtime for `craftUntilSettled` (see craft-resource.ts).
    error: (
      original as unknown as {
        error: Signal<Error | undefined>;
      }
    ).error,
    isLoading: original.isLoading,
    reload: original.reload.bind(original),
    destroy,
    update: original.update.bind(original),
    set: original.set.bind(original),
    restore: (
      original as unknown as { restore: (value: T | undefined) => void }
    ).restore.bind(original),
    asReadonly: () => resourceRef,
    paramSrc: config.params as Signal<R | undefined>,
    state,
  };
  return resourceRef as unknown as CraftResourceRef<T | undefined, R>;
}
