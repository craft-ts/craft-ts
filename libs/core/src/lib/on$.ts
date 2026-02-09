import { DestroyRef, EventEmitter, inject } from '@angular/core';
import { SourceBranded } from './util/util';

export function on$<State, SourceType>(
  _source: {
    subscribe: EventEmitter<SourceType>['subscribe'];
  },
  callback: (source: SourceType) => State,
): SourceBranded {
  const sub = _source.subscribe((value) => {
    callback(value);
  });

  const destroyRef = inject(DestroyRef);
  destroyRef.onDestroy(() => sub.unsubscribe());

  return SourceBranded;
}
