import { DestroyRef, EventEmitter, inject } from '@angular/core';
import { craftUse } from './craft-use';
import type {
  ExtractServiceHelperDependencyMap,
  GetServiceOutput,
  SERVICE_HELPER_DEPENDENCIES,
  ServiceReference,
} from './craft-service';
import type { HelperDependencyMap } from './craft-primitive-gen';
import type { ReadonlySource$ } from './source$';
import { SourceBranded } from './util/util';

type SourceSubscription<SourceType> = {
  subscribe: (callback: (value: SourceType) => void) => { unsubscribe(): void };
};

type ExternalSource<SourceType> = {
  subscribe: EventEmitter<SourceType>['subscribe'];
};

type TrackedOnSource<Dependencies extends object> =
  keyof Dependencies extends never
    ? SourceBranded
    : SourceBranded & {
        readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
      };

type SourceHelperOutput<Helper extends ServiceReference> =
  GetServiceOutput<Helper> extends ReadonlySource$<
    infer SourceType,
    infer _Name extends string
  >
    ? SourceType
    : never;

type SourceHelper<Helper extends ServiceReference> =
  GetServiceOutput<Helper> extends ReadonlySource$<
    infer _SourceType,
    infer _Name extends string
  >
    ? Helper
    : never;

export function on$<State, SourceType, Name extends string>(
  source: ReadonlySource$<SourceType, Name>,
  callback: (source: SourceType) => State,
): TrackedOnSource<HelperDependencyMap<ReadonlySource$<SourceType, Name>>>;
export function on$<State, SourceType>(
  source: ExternalSource<SourceType>,
  callback: (source: SourceType) => State,
): SourceBranded;
export function on$<State, Helper extends ServiceReference>(
  source: SourceHelper<Helper>,
  callback: (source: SourceHelperOutput<Helper>) => State,
): TrackedOnSource<ExtractServiceHelperDependencyMap<Helper>>;
export function on$<State, SourceType>(
  source:
    | SourceSubscription<SourceType>
    | ExternalSource<SourceType>
    | ServiceReference,
  callback: (source: SourceType) => State,
): SourceBranded {
  const resolvedSource = (
    typeof source === 'function'
      ? craftUse((source as () => Generator)())
      : source
  ) as SourceSubscription<SourceType>;

  const sub = resolvedSource.subscribe((value) => {
    callback(value);
  });

  const destroyRef = inject(DestroyRef);
  destroyRef.onDestroy(() => sub.unsubscribe());

  return SourceBranded;
}
