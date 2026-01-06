import {
  linkedSignal,
  Signal,
  untracked,
  ValueEqualityFn,
  WritableSignal,
} from '@angular/core';
import { IsUnknown } from './util/util.type';
import { ReadonlySource } from './util/source.type';
import { SourceBranded } from './util/util';

export function toSource<SourceState, ComputedValue>(
  signalOrigin: Signal<SourceState> | WritableSignal<SourceState>,
  options?: {
    computed?: (sourceValue: NoInfer<SourceState>) => ComputedValue;
    equal?: ValueEqualityFn<NoInfer<SourceState> | undefined>;
    debugName?: string;
  }
): ReadonlySource<
  IsUnknown<ComputedValue> extends true ? SourceState : ComputedValue
> {
  const sourceState = linkedSignal<SourceState | undefined>(signalOrigin, {
    ...(options?.equal && { equal: options?.equal }), // add the equal function here, it may helps to detect changes when using scalar values
    ...(options?.debugName && {
      debugName: options?.debugName + '_sourceState',
    }),
  });

  const listener = (listenerOptions: { nullishFirstValue?: boolean }) =>
    linkedSignal<SourceState, any>({
      source: sourceState as Signal<SourceState>,
      computation: (currentSourceState, previousData) => {
        // always when first listened return undefined
        if (!previousData && listenerOptions?.nullishFirstValue !== false) {
          return undefined;
        }
        //! use untracked to avoid computed to be re-evaluated when used inside another effect/computed
        return untracked(() =>
          options?.computed
            ? options?.computed?.(currentSourceState)
            : currentSourceState
        );
      },
      ...(options?.equal && { equal: options?.equal }),
      ...(options?.debugName && { debugName: options?.debugName }),
    });
  return Object.assign(
    listener({
      nullishFirstValue: true,
    }),
    {
      preserveLastValue: listener({
        nullishFirstValue: false,
      }),
    },
    SourceBranded
  ) as ReadonlySource<any>;
}
