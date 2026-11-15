import {
  assertInInjectionContext,
  DestroyRef,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  type CreateEffectOptions,
  type EffectCleanupRegisterFn,
  type EffectRef,
} from './host/craft-compat';
import { runCraftCleanups } from './lifecycle';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import {
  ɵcreateHostTaggedInjector,
  ɵHOST_TAG_LIST,
  ɵhostOwnerTags,
  ɵmergeHostTags,
} from './craft-service';
import {
  isGeneratorFunction,
  runCraftGenerator,
} from './craft-generator-runtime';
import {
  ɵinjectAppSnapshotRegistryIn,
  type ActiveEffectReport,
  type AppSnapshotRegistry,
  type ɵActiveEffectSource,
} from './take-app-snapshot';
import { ɵcraftDetachedEffect } from './host/craft-signal';
import {
  createNamedPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';

type CraftEffectFn = (onCleanup: EffectCleanupRegisterFn) => void;

type CraftEffectGenerator<This, Yielded> = (
  this: This,
) => Generator<Yielded, CraftEffectFn, unknown>;

type TrackedCraftEffect<E, Yielded> = E & {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: ServiceDependencyMapFromYielded<Yielded>;
};

/**
 * A named effect, created eagerly and consumed like every craft primitive —
 * `yield*` inside a generator host, `craftUse(...)` in a class field. Inside a
 * `craftService` its `EffectRef` is exposed under its name; wrap it in
 * `craftPrivate(...)` to keep it internal.
 */
// Host-bound forms — `craftEffect('name', this, function* () { ... })` — bind
// `this` inside the factory (and the effect body it returns) to the given host,
// so a class-field initializer can read instance state (mirrors `craftMethod`).
// Without a host, a `function*` factory is called with `this = undefined`.
// The generator overloads must come first: a generator function is also
// assignable to `CraftEffectFn` (a `void` return accepts anything), so the
// plain overload would otherwise win and drop the dependency metadata.
export function craftEffect<Name extends string, This, Yielded>(
  name: Name,
  host: This,
  factory: CraftEffectGenerator<This, Yielded>,
  options?: CreateEffectOptions,
): NamedCraftPrimitiveGen<Name, TrackedCraftEffect<EffectRef, Yielded>>;
export function craftEffect<Name extends string, Yielded>(
  name: Name,
  factory: CraftEffectGenerator<void, Yielded>,
  options?: CreateEffectOptions,
): NamedCraftPrimitiveGen<Name, TrackedCraftEffect<EffectRef, Yielded>>;
export function craftEffect<Name extends string, This>(
  name: Name,
  host: This,
  effectFn: (this: This, onCleanup: EffectCleanupRegisterFn) => void,
  options?: CreateEffectOptions,
): NamedCraftPrimitiveGen<Name, EffectRef>;
export function craftEffect<Name extends string>(
  name: Name,
  effectFn: CraftEffectFn,
  options?: CreateEffectOptions,
): NamedCraftPrimitiveGen<Name, EffectRef>;
export function craftEffect(
  name: string,
  hostOrFn: unknown,
  fnOrOptions?: unknown,
  maybeOptions?: CreateEffectOptions,
): NamedCraftPrimitiveGen<string, EffectRef> {
  const ref = createCraftEffect(name, hostOrFn, fnOrOptions, maybeOptions);
  return createNamedPrimitiveGen(name, ref, { markMembers: false });
}

/**
 * Internal entry of {@link craftEffect} for the renderer: the same effect
 * (owner, tags, report, cleanups, scope of a generator factory), returned as
 * its `EffectRef` instead of a named primitive generator that the caller
 * would only drive to get that ref back.
 */
export function ɵcraftEffectRef(
  name: string,
  effectFn: CraftEffectFn,
  options?: CreateEffectOptions,
): EffectRef {
  return createCraftEffect(name, effectFn, options);
}

/**
 * The tags every plain effect owned by `injector` reports before its own:
 * what {@link ɵmergeHostTags} answers, without the effect's tag. They only
 * depend on the injector, so a host that creates many effects in the same
 * injector asks once.
 */
export function ɵeffectOwnerTags(injector: Injector): readonly string[] {
  return ɵhostOwnerTags(injector);
}

/** What a host resolved once for the injector its effects are created in. */
export interface ɵCraftEffectOwner {
  /** {@link ɵeffectOwnerTags} of the injector. */
  readonly ownerTags: readonly string[];
  /** {@link ɵeffectRegistry} of the injector. */
  readonly registry: AppSnapshotRegistry | null;
}

/** The effect registry of `injector`, for {@link ɵCraftRenderEffect}. */
export function ɵeffectRegistry(
  injector: Injector,
): AppSnapshotRegistry | null {
  return ɵinjectAppSnapshotRegistryIn(injector) ?? null;
}

/**
 * The effect of one renderer binding: what `ɵcraftEffectRef(name, body,
 * { manualCleanup: true })` creates, as a single object.
 *
 * The renderer owns it and destroys it, its body takes no cleanup, and its
 * report — the same `source` and the same tags — is built when a snapshot
 * reads it. The registry and the owner's tags come from `owner`, which keeps
 * them for every effect of the injector: the tags are read before the first
 * run and the registry after it, when `craftEffect` resolves them.
 */
// What the constructor below hands to `startPendingEffect`, read as soon as
// it starts: the injection context opens without a closure per effect.
let pendingEffectBody: (() => void) | undefined;

function startPendingEffect(): () => void {
  const body = pendingEffectBody as () => void;
  pendingEffectBody = undefined;
  return ɵcraftDetachedEffect(body);
}

export class ɵCraftRenderEffect implements EffectRef, ɵActiveEffectSource {
  // Links of the registry's list of live effects.
  ɵtracked = false;
  ɵpreviousSource: ɵActiveEffectSource | undefined = undefined;
  ɵnextSource: ɵActiveEffectSource | undefined = undefined;
  private stop: (() => void) | undefined = undefined;
  private destroyed = false;
  private readonly name: string;
  private readonly ownerTags: readonly string[];
  private registry: AppSnapshotRegistry | null = null;

  constructor(
    name: string,
    body: () => void,
    injector: Injector,
    owner: ɵCraftEffectOwner,
  ) {
    this.name = name;
    this.ownerTags = owner.ownerTags;
    // Detached from the active subscriber: an independently owned effect is
    // not disposed with a transient parent effect.
    pendingEffectBody = body;
    this.stop = injector.run(startPendingEffect);
    if (this.destroyed) {
      // Destroyed by its own first run.
      this.stop();
      this.stop = undefined;
      return;
    }
    this.registry = owner.registry;
    this.registry?.ɵtrackActiveEffect(this);
  }

  report(): ActiveEffectReport {
    const source = `effect:${this.name}`;
    return { source, from: [...this.ownerTags, source] };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.registry?.ɵuntrackActiveEffect(this);
    const stop = this.stop;
    this.stop = undefined;
    stop?.();
  }
}

function createCraftEffect(
  name: string,
  hostOrFn: unknown,
  fnOrOptions?: unknown,
  maybeOptions?: CreateEffectOptions,
): EffectRef {
  // The host form is recognized by its 3rd argument being the factory —
  // `options` is never a function.
  const hasHost = typeof fnOrOptions === 'function';
  const host = hasHost ? hostOrFn : undefined;
  const fnOrFactory = (hasHost ? fnOrOptions : hostOrFn) as
    | ((this: unknown, onCleanup: EffectCleanupRegisterFn) => void)
    | CraftEffectGenerator<unknown, unknown>;
  const options = (hasHost ? maybeOptions : fnOrOptions) as
    | CreateEffectOptions
    | undefined;

  assertInInjectionContext(craftEffect);
  const parentInjector = inject(Injector);
  const ownerInjector = options?.injector ?? parentInjector;
  const ownerDestroyRef = ownerInjector.get(DestroyRef);
  const source = `effect:${name}`;
  // Only a generator factory needs a scope of its own: it resolves its
  // dependencies there and the scope is destroyed with the effect. A plain
  // body already runs in its owner's injection context, so a tagged injector
  // would only carry the report's tags. Those are merged directly, at the
  // same point, so the owner's tags (and any ordinal they draw) resolve in
  // the same order as with a scope.
  const generatorFactory = isGeneratorFunction(fnOrFactory);
  const effectInjector = generatorFactory
    ? ɵcreateHostTaggedInjector(ownerInjector, source)
    : ownerInjector;
  const plainTags = generatorFactory
    ? undefined
    : ɵmergeHostTags(ownerInjector, () => source);

  let effectBody: CraftEffectFn;

  if (generatorFactory) {
    effectBody = runInInjectionContext(effectInjector, () => {
      const iterator = (
        fnOrFactory as CraftEffectGenerator<unknown, unknown>
      ).call(host);
      return runCraftGenerator({
        iterator,
        injector: effectInjector,
        hostScope: 'function',
        invalidYieldErrorMessage:
          'craftEffect generators can only yield craftService dependencies.',
        multipleAppStartErrorMessage:
          'craftEffect generators cannot declare onAppStart(...) more than once.',
        onAppStartNotSupportedErrorMessage:
          'craftEffect(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
      }).value as CraftEffectFn;
    });
  } else {
    const plainFn = fnOrFactory as (
      this: unknown,
      onCleanup: EffectCleanupRegisterFn,
    ) => void;
    effectBody = hasHost
      ? (onCleanup) => plainFn.call(host, onCleanup)
      : (plainFn as CraftEffectFn);
  }

  let destroyed = false;
  let unregisterOwner: (() => void) | undefined;
  let unregisterReport: (() => void) | undefined;
  // Host and Craft signals share the same reactive kernel. A second watch
  // relaying through an invalidation signal recursively flushes the remaining
  // queue for every batched consumer (and overflows on large keyed lists).
  // The host effect already owns dependency retracking and all run cleanups.
  const effectRef = effect(effectBody, {
    ...options,
    injector: ownerInjector,
    manualCleanup: true,
  });
  const ref = {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      runCraftCleanups([
        () => unregisterOwner?.(),
        () => unregisterReport?.(),
        () => effectRef.destroy(),
        () => {
          if (effectInjector !== ownerInjector) effectInjector.destroy();
        },
      ]);
    },
  } as EffectRef;
  if (!options?.manualCleanup) {
    unregisterOwner = ownerDestroyRef.onDestroy(() => ref.destroy());
  }

  const registry = ɵinjectAppSnapshotRegistryIn(ownerInjector);
  if (registry) {
    const from = plainTags ?? effectInjector.get(ɵHOST_TAG_LIST, null) ?? [];
    unregisterReport = registry.registerActiveEffectReader(() => ({
      source,
      from,
    }));
  }

  return ref;
}
