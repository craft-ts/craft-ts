import { linkedSignal, Signal, signal } from '@angular/core';

export type StackSource<T> = Signal<T[] | undefined> & {
  set: (value: T) => void;
};

// ! this algo only works with object
export function stackedSource<T>(): StackSource<T> {
  const stack: unknown[] = [];
  const s2 = signal<T | undefined>(undefined);

  const l = linkedSignal({
    source: s2,
    computation: (current, previousData) => {
      if (!previousData) {
        stack.length = 0;
        return undefined;
      }

      const result = [...stack];
      stack.length = 0;
      return result;
    },
  });

  const set = (value: T) => {
    console.log('custom set', value);
    stack.push(value);
    console.log('stack', stack);

    s2.set(value);
    return;
  };

  return Object.assign(l, {
    set,
  }) as StackSource<T>;
}
