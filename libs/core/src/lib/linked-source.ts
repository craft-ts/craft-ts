import { linkedSignal, Signal, ValueEqualityFn } from '@angular/core';
import { ReadonlySource } from './util/source.type';
import { Source } from './source';
import { SourceBranded } from './util/util';

export function linkedSource<SourceState, ComputedValue>(
  signalOrigin: Source<SourceState> | ReadonlySource<SourceState>,
  computedFn: (sourceValue: NoInfer<SourceState>) => ComputedValue,
  options?: {
    equal?: ValueEqualityFn<NoInfer<ComputedValue> | undefined>;
    debugName?: string;
  }
): Source<ComputedValue> {
  const listener = (listenerOptions: { nullishFirstValue?: boolean }) =>
    linkedSignal<SourceState, ComputedValue | undefined>({
      source: signalOrigin as Signal<SourceState>,
      computation: (currentSourceState, previousData) => {
        // always when first listened return undefined
        if (!previousData && listenerOptions?.nullishFirstValue !== false) {
          return undefined;
        }

        return computedFn(currentSourceState);
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
  ) as Source<ComputedValue>;
}
