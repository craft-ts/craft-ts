import type { Signal as AngularSignal } from '@angular/core';
import {
  ɵbrandAsCraftSignal,
  type ɵCraftSignal,
} from '@craft-ng/core';

export function fromAngularSignal<T>(
  source: AngularSignal<T>,
): ɵCraftSignal<T> {
  return ɵbrandAsCraftSignal(() => source());
}
