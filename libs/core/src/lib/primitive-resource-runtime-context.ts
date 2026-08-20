import {
  inject,
  InjectionToken,
  type Provider,
  type Signal,
} from './host/craft-compat';
import { ɵregisterCraftPrimitive } from './craft-primitive-registry';

export type PrimitiveResourceRuntimeKind =
  | 'query'
  | 'asyncProcess'
  | 'mutation'
  | 'queryParams';

export type PrimitiveResourceRuntimeContext<
  Kind extends PrimitiveResourceRuntimeKind = PrimitiveResourceRuntimeKind,
> = Readonly<{
  kind: Kind;
  grouped: boolean;
  ids(): readonly string[];
  get(id?: string): unknown;
  set(value: unknown, id?: string): unknown;
  update(updater: (current: unknown) => unknown, id?: string): unknown;
  patch(updater: (current: unknown) => object, id?: string): unknown;
  /** Re-runs the loader from the params in force. */
  reload?(): boolean;
}>;

export type PrimitiveResourceRuntimeObserver = (
  context: PrimitiveResourceRuntimeContext,
) => void;

type WritableResourceTarget = Readonly<{
  state: Signal<unknown>;
  set(value: unknown): unknown;
  update(updater: (current: unknown) => unknown): unknown;
  reload?(): boolean;
}>;

type ResourceByIdTarget = Readonly<{
  state: Signal<unknown>;
  set(value: unknown): unknown;
  update(updater: (current: unknown) => unknown): unknown;
  addById(id: string, options?: Readonly<{ defaultValue?: unknown }>): unknown;
  select?(id: string): WritableResourceTarget | undefined;
}> &
  (() => Record<string, WritableResourceTarget | undefined>);

const PRIMITIVE_RESOURCE_RUNTIME_OBSERVER = new InjectionToken<
  readonly PrimitiveResourceRuntimeObserver[]
>('PRIMITIVE_RESOURCE_RUNTIME_OBSERVER', {
  providedIn: 'root',
  factory: () => [],
  multi: true,
});

export function providePrimitiveResourceRuntimeObserver(
  observer: PrimitiveResourceRuntimeObserver,
): Provider {
  return {
    provide: PRIMITIVE_RESOURCE_RUNTIME_OBSERVER,
    useValue: observer,
    multi: true,
  };
}

export function ɵobservePrimitiveResourceRuntimeContext(
  context: PrimitiveResourceRuntimeContext,
  name?: string,
): void {
  for (const observer of inject(PRIMITIVE_RESOURCE_RUNTIME_OBSERVER)) {
    observer(context);
  }

  // The same handle, addressable: the observer sees every resource as it is
  // created, the registry lets tooling find one again by name afterwards.
  if (name !== undefined) {
    ɵregisterCraftPrimitive({
      kind: context.kind,
      name,
      read: () => context.get(),
      write: (value) => context.set(value),
      reload: () => context.reload?.() ?? false,
    });
  }
}

export function ɵcreatePrimitiveResourceRuntimeContext(
  kind: PrimitiveResourceRuntimeKind,
  target: WritableResourceTarget,
): PrimitiveResourceRuntimeContext {
  return {
    kind,
    grouped: false,
    ids: () => [],
    reload: () => target.reload?.() ?? false,
    get: (id) => rootTarget(target, id).state(),
    set: (value, id) => rootTarget(target, id).set(value),
    update: (updater, id) => rootTarget(target, id).update(updater),
    patch: (updater, id) =>
      rootTarget(target, id).update((current) =>
        patchResourceValue(current, updater(current)),
      ),
  };
}

export function ɵcreatePrimitiveResourceByIdRuntimeContext(
  kind: PrimitiveResourceRuntimeKind,
  target: ResourceByIdTarget,
): PrimitiveResourceRuntimeContext {
  return {
    kind,
    grouped: true,
    ids: () => Object.keys(target()),
    get: (id) =>
      id === undefined ? target.state() : selectedTarget(target, id).state(),
    set: (value, id) => {
      if (id === undefined) {
        return target.set(value);
      }
      const selected = target()[id];
      if (selected !== undefined) {
        return selected.set(value);
      }
      target.addById(id, { defaultValue: value });
      return value;
    },
    update: (updater, id) =>
      id === undefined
        ? target.update(updater)
        : selectedTarget(target, id).update(updater),
    patch: (updater, id) => {
      const patchTarget =
        id === undefined
          ? { state: target.state, update: target.update, set: target.set }
          : selectedTarget(target, id);
      return patchTarget.update((current) =>
        patchResourceValue(current, updater(current)),
      );
    },
  };
}

function patchResourceValue(current: unknown, patch: object): object {
  if (
    current === null ||
    typeof current !== 'object' ||
    Array.isArray(current)
  ) {
    throw new Error(
      'Primitive value patch requires an object value; use update to replace arrays or primitives',
    );
  }
  return { ...current, ...patch };
}

function rootTarget(
  target: WritableResourceTarget,
  id: string | undefined,
): WritableResourceTarget {
  if (id !== undefined) {
    throw new Error(
      'This primitive value is not grouped; params.id is not supported',
    );
  }
  return target;
}

function selectedTarget(
  target: ResourceByIdTarget,
  id: string,
): WritableResourceTarget {
  const selected = target.select?.(id) ?? target()[id];
  if (selected === undefined) {
    throw new Error(`Grouped primitive value "${id}" is not available`);
  }
  return selected;
}
