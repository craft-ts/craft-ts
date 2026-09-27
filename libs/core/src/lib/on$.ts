import { DestroyRef, EventEmitter, inject } from './host/craft-compat';
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
import type { ServiceTrackedDepsRequest } from './craft-primitive-gen';
import {
  ɵactiveMachineScope,
  ɵregisterMachineSource,
} from './craft-state-machine-runtime';

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

type IsUnion<Value, Whole = Value> = Value extends unknown
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

/**
 * The source a "source service" exposes: a craftService exposes its named
 * primitives, so the service `on$` subscribes to is one exposing exactly one
 * source (`yield* source$<void>('reset$')`) — `never` otherwise.
 */
type ExposedSource<Output> = {
  [Key in keyof Output]: Output[Key] extends ReadonlySource$<any, any>
    ? Key
    : never;
}[keyof Output] extends infer SourceKey extends keyof Output
  ? [SourceKey] extends [never]
    ? never
    : true extends IsUnion<SourceKey>
      ? never
      : Output[SourceKey]
  : never;

type SourceHelperOutput<Helper extends ServiceReference> =
  ExposedSource<GetServiceOutput<Helper>> extends ReadonlySource$<
    infer SourceType,
    infer _Name extends string
  >
    ? SourceType
    : never;

type SourceHelper<Helper extends ServiceReference> =
  ExposedSource<GetServiceOutput<Helper>> extends ReadonlySource$<
    infer _SourceType,
    infer _Name extends string
  >
    ? Helper
    : never;

/**
 * Inside a `transitionStep(...)`, `on$` is a machine registration: the callback
 * is driven through the craft runtime with its declaring step restored, so the
 * `transit(...)` attempts it yields target that step. Consume it with `yield*`
 * so the callback's dependencies join the machine's dependency graph.
 */
export function on$<SourceType, Name extends string, Yielded>(
  source: ReadonlySource$<SourceType, Name>,
  callback: (source: SourceType) => Generator<Yielded, unknown, unknown>,
): Generator<
  | Yielded
  | ServiceTrackedDepsRequest<
      HelperDependencyMap<ReadonlySource$<SourceType, Name>>
    >,
  void,
  unknown
>;
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
  // The machine overload resolves to a registration generator instead of a
  // branded source, so the implementation signature stays deliberately loose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (ɵactiveMachineScope()) {
    return ɵregisterMachineSource(
      source as never,
      callback as (value: never) => unknown,
    ) as unknown as SourceBranded;
  }

  const resolvedSource = (
    typeof source === 'function'
      ? exposedSource(craftUse((source as () => Generator)()))
      : source
  ) as SourceSubscription<SourceType>;

  const sub = resolvedSource.subscribe((value) => {
    callback(value);
  });

  const destroyRef = inject(DestroyRef);
  destroyRef.onDestroy(() => sub.unsubscribe());

  return SourceBranded;
}

function isSubscribable(value: unknown): boolean {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { subscribe?: unknown }).subscribe === 'function'
  );
}

/** The single source a resolved "source service" exposes (see {@link ExposedSource}). */
function exposedSource(service: unknown): unknown {
  if (isSubscribable(service)) return service;
  const sources = Object.values(service as object).filter(isSubscribable);
  if (sources.length !== 1) {
    throw new Error(
      `on$(service, ...) needs a craftService exposing exactly one source; this one exposes ${sources.length}.`,
    );
  }
  return sources[0];
}
