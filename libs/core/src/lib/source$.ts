import {
  DestroyRef,
  EventEmitter,
  inject,
  Signal,
  signal,
} from '@angular/core';

export type SourceSubscribe<T> = {
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
};

export type Source$<T> = {
  emit: (value: T) => void;
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
  asReadonly: () => ReadonlySource$<T>;
  preserveLastValue: () => {
    emit: (value: T) => void;
    subscribe: (callback: (value: T) => void) => void;
    asReadonly: () => {
      subscribe: (callback: (value: T) => void) => void;
      value: Signal<T | undefined>;
    };
    value: Signal<T | undefined>;
  };
  value: Signal<T | undefined>;
};

export type ReadonlySource$<T> = {
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
  value: Signal<T | undefined>;
};

export function source$<T>(): Source$<T> {
  const sourceRef$ = new EventEmitter<T>();
  const destroyRef = inject(DestroyRef);

  const sourceAsSignal = signal<T | undefined>(undefined);

  return {
    emit: (value: T) => {
      sourceRef$.emit(value);
      sourceAsSignal.set(value);
    },
    subscribe: (callback: (value: T) => void) => sourceRef$.subscribe(callback),
    preserveLastValue: () => {
      const sourceWithLastValueRef = new EventEmitter<T>();
      const subscriptionWithLastLastValue = sourceRef$.subscribe((value) => {
        sourceWithLastValueRef.emit(value);
      });

      destroyRef.onDestroy(() => subscriptionWithLastLastValue.unsubscribe());

      return {
        emit: (value: T) => {
          sourceWithLastValueRef.emit(value);
          sourceAsSignal.set(value);
        },
        subscribe: (callback: (value: T) => void) => {
          sourceWithLastValueRef.subscribe(callback);
          sourceWithLastValueRef.emit(sourceAsSignal());
        },
        asReadonly: () => ({
          subscribe: (callback: (value: T) => void) => {
            sourceWithLastValueRef.subscribe(callback);
            sourceWithLastValueRef.emit(sourceAsSignal());
          },
          value: sourceAsSignal.asReadonly(),
        }),
        value: sourceAsSignal.asReadonly(),
      };
    },
    value: sourceAsSignal.asReadonly(),
    asReadonly: () => ({
      subscribe: (callback: (value: T) => void) =>
        sourceRef$.subscribe(callback),
      value: sourceAsSignal.asReadonly(),
    }),
  };
}
