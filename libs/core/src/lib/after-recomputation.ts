import { effect, signal, untracked } from '@angular/core';
import { Source } from './source';
import { ReadonlySource } from './util/source.type';
import { SourceBranded } from './util/util';

export function afterRecomputation<State, SourceType>(
  _source: Source<SourceType>,
  callback: (source: SourceType) => State
): ReadonlySource<State> {
  const derivedSource = signal<State | undefined>(undefined);
  const effectRef = effect(() => {
    const sourceValue = _source();
    if (sourceValue !== undefined) {
      untracked(() => {
        const newState = callback(sourceValue);
        derivedSource.set(newState);
      });
    } else {
      derivedSource.set(undefined);
    }
  });
  return Object.assign(
    derivedSource,
    SourceBranded
  ) as unknown as ReadonlySource<State>;
}
