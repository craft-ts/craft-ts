import {
  DestroyRef,
  InjectionToken,
  signal,
  type Injector,
  type Signal,
} from '@angular/core';
import type { ConcreteServiceScope } from './craft-service.shared';

export const CRAFT_REGISTRATION_TARGET = Symbol.for(
  '@craft-ng/core/craft-registration-target',
);

export type CraftRegistrationTargetMetadata = Readonly<{
  kind: 'component' | 'directive';
  name: string;
}>;

export type CraftRegistrationTarget<
  Name extends string = string,
  Kind extends 'component' | 'directive' = 'component' | 'directive',
  Instance = unknown,
> = {
  readonly [CRAFT_REGISTRATION_TARGET]: CraftRegistrationTargetMetadata & {
    kind: Kind;
    name: Name;
    instance: Instance;
  };
};

export type RegisterForEntry<Value = unknown> = Readonly<{
  hostName: string;
  ref: Value;
}>;

export type RegisterForSignal<Value = unknown> = Signal<
  readonly RegisterForEntry<Value>[] | undefined
>;

export type RegisterForTargetDescriptor = Readonly<{
  key: string;
  matches(candidate: unknown): boolean;
}>;

export type RegisterForRegistry = Readonly<{
  signalFor(key: string): RegisterForSignal;
  registerService(
    name: string,
    ref: unknown,
    hostName: string,
    scope?: ConcreteServiceScope,
  ): () => void;
  registerTarget(target: unknown, ref: unknown, hostName: string): () => void;
}>;

const EMPTY_CLEANUP = () => undefined;

export const REGISTER_FOR_REGISTRY = new InjectionToken<
  readonly RegisterForRegistry[]
>('REGISTER_FOR_REGISTRY', {
  providedIn: 'root',
  factory: () => [],
});

export function createRegisterForRegistry(
  descriptors: readonly RegisterForTargetDescriptor[],
  options: { readonly includeGlobal: boolean },
): RegisterForRegistry {
  const entriesByKey = new Map<string, InternalEntry[]>();
  const signalsByKey = new Map<
    string,
    ReturnType<typeof signal<readonly RegisterForEntry[] | undefined>>
  >();

  for (const descriptor of descriptors) {
    entriesByKey.set(descriptor.key, []);
    signalsByKey.set(
      descriptor.key,
      signal<readonly RegisterForEntry[] | undefined>(undefined),
    );
  }

  const register = (
    descriptor: RegisterForTargetDescriptor | undefined,
    ref: unknown,
    hostName: string,
  ): (() => void) => {
    if (descriptor === undefined) {
      return EMPTY_CLEANUP;
    }

    const entries = entriesByKey.get(descriptor.key);
    const entriesSignal = signalsByKey.get(descriptor.key);
    if (entries === undefined || entriesSignal === undefined) {
      return EMPTY_CLEANUP;
    }

    const existing = entries.find(
      (entry) => Object.is(entry.ref, ref) && entry.hostName === hostName,
    );
    if (existing !== undefined) {
      return EMPTY_CLEANUP;
    }

    const entry: InternalEntry = {
      hostName,
      ref,
    };
    entries.push(entry);
    entriesSignal.set(entries.map(toPublicEntry));

    let active = true;
    return () => {
      if (!active) return;
      active = false;

      const index = entries.indexOf(entry);
      if (index === -1) return;
      entries.splice(index, 1);
      entriesSignal.set(
        entries.length === 0 ? undefined : entries.map(toPublicEntry),
      );
    };
  };

  return {
    signalFor(key) {
      return signalsByKey.get(key) ?? signal(undefined);
    },
    registerService(name, ref, hostName, scope) {
      if (scope === 'global' && !options.includeGlobal) {
        return EMPTY_CLEANUP;
      }
      return register(
        descriptors.find((descriptor) =>
          descriptor.matches({ kind: 'service', name }),
        ),
        ref,
        hostName,
      );
    },
    registerTarget(target, ref, hostName) {
      return register(
        descriptors.find((descriptor) => descriptor.matches(target)),
        ref,
        hostName,
      );
    },
  };
}

export function registerResolvedService(
  injector: Injector,
  name: string,
  ref: unknown,
  hostName: string,
  scope: ConcreteServiceScope,
): void {
  const registries = injector.get(REGISTER_FOR_REGISTRY, []);
  for (const registry of registries) {
    attachCleanup(
      injector,
      registry.registerService(name, ref, hostName, scope),
    );
  }
}

export function ɵregisterCraftTarget(
  injector: Injector,
  target: unknown,
  ref: unknown,
  hostName: string,
  autoCleanup = true,
): () => void {
  const registries = injector.get(REGISTER_FOR_REGISTRY, []);
  const cleanups = registries.map((registry) =>
    registry.registerTarget(target, ref, hostName),
  );
  const cleanup = () => cleanups.forEach((release) => release());
  return autoCleanup ? attachCleanup(injector, cleanup) : cleanup;
}

function attachCleanup(injector: Injector, cleanup: () => void): () => void {
  if (cleanup === EMPTY_CLEANUP) return cleanup;

  const destroyRef = injector.get(DestroyRef, null);
  destroyRef?.onDestroy(cleanup);
  return cleanup;
}

type InternalEntry = {
  readonly hostName: string;
  readonly ref: unknown;
};

function toPublicEntry(entry: InternalEntry): RegisterForEntry {
  return {
    hostName: entry.hostName,
    ref: entry.ref,
  };
}
