import {
  assertInInjectionContext,
  DestroyRef,
  inject,
  ValueEqualityFn,
} from '@angular/core';
import { Source, source } from './source';

export type SourceFromEvent<T> = Source<T> & {
  dispose: () => void;
};

export function sourceFromEvent<T>(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue?: never;
    source: {
      equal?: ValueEqualityFn<NoInfer<T> | undefined>;
      debugName?: string;
    };
  }
): SourceFromEvent<T>;
export function sourceFromEvent<T, ComputedValue>(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue: (event: T) => ComputedValue;
    source?: {
      equal?: ValueEqualityFn<NoInfer<T> | undefined>;
      debugName?: string;
    };
  }
): SourceFromEvent<ComputedValue>;
export function sourceFromEvent(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue?: (event: Event) => unknown;
    source?: {
      equal?: ValueEqualityFn<NoInfer<unknown> | undefined>;
      debugName?: string;
    };
  }
): SourceFromEvent<unknown> {
  assertInInjectionContext(sourceFromEvent);
  const eventSignalSource = source<unknown>(options?.source);

  const listener = (event: Event) => {
    if (options?.computedValue) {
      const computed = options.computedValue(event);
      eventSignalSource.set(computed);
      return;
    }
    eventSignalSource.set(event);
  };

  target.addEventListener(eventName, listener, options?.event);

  const destroyRef = inject(DestroyRef);

  const dispose = () => {
    target.removeEventListener(eventName, listener, options?.event);
  };

  destroyRef.onDestroy(() => {
    dispose();
  });

  return Object.assign(eventSignalSource, {
    dispose,
  });
}
