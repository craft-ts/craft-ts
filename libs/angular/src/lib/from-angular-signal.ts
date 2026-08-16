import {
  effect,
  untracked,
  type Signal as AngularSignal,
} from '@angular/core';
import { ɵsignal, type ɵCraftSignal } from '@craft-ng/core';

export function fromAngularSignal<T>(
  source: AngularSignal<T>,
): ɵCraftSignal<T> {
  const copy = ɵsignal(untracked(() => source()));
  effect(() => {
    copy.set(source());
  });
  return copy;
}
