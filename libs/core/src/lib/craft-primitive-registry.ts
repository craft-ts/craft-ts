import {
  DestroyRef,
  effect,
  inject,
  runInInjectionContext,
  type Injector,
} from './host/craft-compat';
import { ɵcraftValueService } from './craft-service';
import { ɵHOST_TAG_LIST } from './craft-service';
import { ɵcurrentInjector, ɵloopGuardPrimitiveCreated } from './loop-guard';
import { ɵwithCraftReplay } from './craft-replay';

/**
 * Primitives that hold a value the registry can read back and write into.
 * `source$` is deliberately absent: an event stream has no state to restore.
 */
export type CraftPrimitiveKind =
  | 'state'
  | 'query'
  | 'mutation'
  | 'asyncProcess'
  | 'queryParams';

/**
 * One addressable primitive instance.
 *
 * The address is the host-tag chain plus the primitive's own name, which is
 * already unique per INSTANCE: `provideHostName` stamps a creation ordinal on
 * every component tag, so two rows of the same list read as
 * `component:Row#1 / …` and `component:Row#2 / …`.
 *
 * That ordinal is stable for the lifetime of a session but not across reloads,
 * and a row destroyed and re-created takes a new one. It is enough to replay a
 * machine inside one session; it is not a persistence key.
 */
export type CraftPrimitiveEntry = Readonly<{
  address: string;
  kind: CraftPrimitiveKind;
  name: string;
  hostTags: readonly string[];
  read(): unknown;
  write(value: unknown): void;
  restoreError?(error: unknown): void;
  status?(): string;
  error?(): unknown;
  /** Explicit opt-out from SSR transfer for secrets and private history. */
  transfer?: boolean;
  /**
   * Re-runs the primitive's loader, when it has one. A resource the snapshot
   * does not cover is reloaded rather than left showing data that belongs to
   * another parameter.
   */
  reload?(): boolean;
}>;

/** A value snapshot of part of the registry, keyed by address. */
export type CraftPrimitiveSnapshot = Readonly<Record<string, unknown>>;
export type CraftPrimitiveRestoreMetadata = Readonly<
  Record<string, Readonly<{ status?: string; error?: unknown }>>
>;

class CraftPrimitiveRegistryState {
  private readonly entries = new Map<string, CraftPrimitiveEntry>();
  private readonly changeListeners = new Set<(address: string) => void>();
  private readonly occurrences = new Map<string, number>();
  private readonly primedValues = new Map<string, unknown>();
  private readonly primedRestoreMetadata = new Map<
    string,
    Readonly<{ status?: string; error?: unknown }>
  >();
  private readonly replaySnapshotValues = new Map<string, unknown>();
  private readonly replaySnapshotMetadata = new Map<
    string,
    Readonly<{ status?: string; error?: unknown }>
  >();
  /** Public primitive ref → address, so a caller can name what it holds. */
  private readonly addresses = new WeakMap<object, string>();

  /** Associates the ref an application holds with its registered address. */
  link(ref: unknown, address: string): void {
    if (
      ref !== null &&
      (typeof ref === 'object' || typeof ref === 'function')
    ) {
      this.addresses.set(ref as object, address);
    }
  }

  /**
   * The address of a primitive from the ref an application holds — how a
   * feature names a primitive declared outside the host it is scoped to.
   */
  addressOf(ref: unknown): string | undefined {
    return ref !== null &&
      (typeof ref === 'object' || typeof ref === 'function')
      ? this.addresses.get(ref as object)
      : undefined;
  }

  /**
   * Registers one instance under `base`, suffixed with an occurrence number.
   *
   * The counter only ever grows: an address is never handed out twice, even
   * after the instance holding it is destroyed. A snapshot captured against
   * `…#2` can therefore never be restored into a different primitive that
   * happened to take the freed slot — it simply finds nothing.
   */
  register(
    base: string,
    entry: Omit<CraftPrimitiveEntry, 'address'>,
  ): {
    readonly address: string;
    readonly release: () => void;
  } {
    const occurrence = (this.occurrences.get(base) ?? 0) + 1;
    this.occurrences.set(base, occurrence);
    const address = `${base}#${occurrence}`;
    const registered: CraftPrimitiveEntry = { ...entry, address };
    const exactReplayAddress = this.replaySnapshotValues.has(address)
      ? address
      : undefined;
    const normalizedAddress = normalizePrimitiveAddress(address);
    const hasEquivalentLivePrimitive = [...this.entries.keys()].some(
      (candidate) => normalizePrimitiveAddress(candidate) === normalizedAddress,
    );
    // A normalized replay address can identify a primitive only across
    // lifetimes. While an equivalent instance is still registered, the value
    // belongs to that instance; a route swap may create its replacement
    // before DestroyRef releases the old instance. Exact addresses remain
    // unambiguous and can still be restored in that case.
    const replayAddress =
      exactReplayAddress ??
      (hasEquivalentLivePrimitive
        ? undefined
        : this.resolveReplaySnapshotAddress(address));
    this.entries.set(address, registered);
    if (replayAddress !== undefined) {
      this.applyRestoredValue(
        registered,
        this.replaySnapshotValues.get(replayAddress),
        this.replaySnapshotMetadata.get(replayAddress),
      );
    } else {
      const primedAddress = this.resolvePrimedAddress(address);
      if (primedAddress !== undefined) {
        const metadata = this.primedRestoreMetadata.get(primedAddress);
        if (metadata?.status === 'error' && registered.restoreError) {
          ɵwithCraftReplay(() => registered.restoreError!(metadata.error));
        } else {
          ɵwithCraftReplay(() =>
            registered.write(this.primedValues.get(primedAddress)),
          );
        }
        this.primedValues.delete(primedAddress);
        this.primedRestoreMetadata.delete(primedAddress);
      }
    }

    return {
      address,
      release: () => {
        if (this.entries.get(address) === registered) {
          this.entries.delete(address);
          // A recorded value belongs to this primitive instance's lifetime.
          // Keeping it after teardown would match the same ordinal-free
          // address when a route recreates its component and resurrect stale
          // local state instead of the primitive's initializer value.
          const replaySnapshotAddress =
            this.resolveReplaySnapshotAddress(address);
          if (replaySnapshotAddress !== undefined) {
            this.replaySnapshotValues.delete(replaySnapshotAddress);
            this.replaySnapshotMetadata.delete(replaySnapshotAddress);
          }
        }
      },
    };
  }

  list(): readonly CraftPrimitiveEntry[] {
    return [...this.entries.values()];
  }

  get(address: string): CraftPrimitiveEntry | undefined {
    return this.entries.get(address);
  }

  onChange(listener: (address: string) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  publishChange(address: string): void {
    if (!this.entries.has(address)) return;
    for (const listener of this.changeListeners) listener(address);
  }

  /**
   * Every entry whose host-tag chain starts with `hostTags` — the primitives a
   * given host owns, transitively. An empty prefix matches the whole app.
   */
  under(hostTags: readonly string[]): readonly CraftPrimitiveEntry[] {
    return this.list().filter((entry) =>
      hostTags.every((tag, index) => entry.hostTags[index] === tag),
    );
  }

  /**
   * Reads the current value of the given entries. A primitive that throws on
   * read (a suspended resource, a computation in error) contributes nothing
   * rather than failing the whole capture.
   */
  capture(
    entries: readonly CraftPrimitiveEntry[] = this.list(),
  ): CraftPrimitiveSnapshot {
    const snapshot: Record<string, unknown> = {};
    for (const entry of entries) {
      try {
        snapshot[entry.address] = entry.read();
      } catch {
        // A value that cannot be read cannot be restored either.
      }
    }
    return snapshot;
  }

  /**
   * Writes a captured snapshot back. Addresses the registry no longer knows
   * are skipped: a row that has been destroyed since the capture has nothing
   * to restore into.
   */
  restore(
    snapshot: CraftPrimitiveSnapshot,
    metadata?: CraftPrimitiveRestoreMetadata,
  ): void {
    for (const [address, value] of Object.entries(snapshot)) {
      this.replaySnapshotValues.set(address, value);
      const result = metadata?.[address];
      if (result) this.replaySnapshotMetadata.set(address, result);
      else this.replaySnapshotMetadata.delete(address);
      const entry = this.resolveReplayEntry(address);
      if (entry) this.applyRestoredValue(entry, value, result);
    }
  }

  /**
   * Restores current entries and remembers future ones. Used by hydration,
   * where primitives are constructed during the first component render.
   */
  prime(snapshot: CraftPrimitiveSnapshot): void {
    for (const [address, value] of Object.entries(snapshot)) {
      const entry = this.entries.get(address);
      if (entry) {
        entry.write(value);
      } else {
        this.primedValues.set(address, value);
      }
    }
  }

  /**
   * Component creation ordinals vary after a reload. Replay may use the
   * ordinal-free address only when it points to exactly one live primitive;
   * repeated rows stay ambiguous and are never guessed.
   */
  private resolveReplayEntry(address: string): CraftPrimitiveEntry | undefined {
    const exact = this.entries.get(address);
    if (exact) return exact;
    const normalized = normalizePrimitiveAddress(address);
    const matches = [...this.entries.values()].filter(
      (entry) => normalizePrimitiveAddress(entry.address) === normalized,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  private resolvePrimedAddress(address: string): string | undefined {
    if (this.primedValues.has(address)) return address;
    const normalized = normalizePrimitiveAddress(address);
    const matches = [...this.primedValues.keys()].filter(
      (candidate) => normalizePrimitiveAddress(candidate) === normalized,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  clearReplaySnapshots(): void {
    this.replaySnapshotValues.clear();
    this.replaySnapshotMetadata.clear();
  }

  private resolveReplaySnapshotAddress(address: string): string | undefined {
    if (this.replaySnapshotValues.has(address)) return address;
    const normalized = normalizePrimitiveAddress(address);
    const matches = [...this.replaySnapshotValues.keys()].filter(
      (candidate) => normalizePrimitiveAddress(candidate) === normalized,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  private applyRestoredValue(
    entry: CraftPrimitiveEntry,
    value: unknown,
    metadata?: Readonly<{ status?: string; error?: unknown }>,
  ): void {
    if (metadata?.status === 'error' && entry.restoreError) {
      ɵwithCraftReplay(() => entry.restoreError!(metadata.error));
    } else {
      ɵwithCraftReplay(() => entry.write(value));
    }
  }
}

function normalizePrimitiveAddress(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

const craftPrimitiveRegistryService = ɵcraftValueService(
  { name: 'CraftPrimitiveRegistry', providedIn: 'global' },
  () => new CraftPrimitiveRegistryState(),
) as unknown as {
  CraftPrimitiveRegistry: () => Generator<
    never,
    CraftPrimitiveRegistryState,
    unknown
  >;
  CRAFT_PRIMITIVE_REGISTRY_META_DATA: { inject(): CraftPrimitiveRegistryState };
};

export type CraftPrimitiveRegistry = CraftPrimitiveRegistryState;
export const CraftPrimitiveRegistry =
  craftPrimitiveRegistryService.CraftPrimitiveRegistry;
export const ɵinjectCraftPrimitiveRegistry = (): CraftPrimitiveRegistry =>
  craftPrimitiveRegistryService.CRAFT_PRIMITIVE_REGISTRY_META_DATA.inject();

/** Clears session snapshots retained for resources created later in a replay. */
export function ɵclearCraftPrimitiveReplaySnapshots(
  registry: CraftPrimitiveRegistry,
): void {
  registry.clearReplaySnapshots();
}

/** Builds the address of a primitive from its host chain and its own name. */
export function ɵcraftPrimitiveAddress(
  hostTags: readonly string[],
  kind: CraftPrimitiveKind,
  name: string,
): string {
  return [...hostTags, `${kind}:${name}`].join(' / ');
}

type RegisterOptions = Readonly<{
  kind: CraftPrimitiveKind;
  name: string;
  read(): unknown;
  write(value: unknown): void;
  restoreError?(error: unknown): void;
  reload?(): boolean;
  status?(): string;
  error?(): unknown;
  transfer?: boolean;
  /** Resolved from the ambient injection context when omitted. */
  injector?: Injector;
}>;

/** What a primitive gets back from registering itself. */
export type CraftPrimitiveRegistration = Readonly<{
  /** Associates the public ref with this registration. */
  link(ref: unknown): void;
}>;

/**
 * Registers a primitive instance so tooling can read and write it by address.
 * Called by the primitives themselves at creation; a no-op when no injection
 * context is available, so a primitive built outside one keeps working.
 */
export function ɵregisterCraftPrimitive(
  options: RegisterOptions,
): CraftPrimitiveRegistration {
  const registry = (() => {
    try {
      return options.injector
        ? runInInjectionContext(options.injector, () =>
            ɵinjectCraftPrimitiveRegistry(),
          )
        : ɵinjectCraftPrimitiveRegistry();
    } catch {
      return null;
    }
  })();
  if (!registry) return { link: () => undefined };

  const hostTags = (() => {
    try {
      return options.injector
        ? options.injector.get(ɵHOST_TAG_LIST, [] as readonly string[])
        : (inject(ɵHOST_TAG_LIST, { optional: true }) ?? []);
    } catch {
      return [] as readonly string[];
    }
  })();

  // The dev loop guard counts creations here, before the instance exists: a
  // tripped circuit breaker throws, and a refused instance must leave no entry.
  const tracking = ɵloopGuardPrimitiveCreated({
    kind: options.kind,
    name: options.name,
    hostTags,
    ...(options.status ? { status: options.status } : {}),
    injector: options.injector ?? ɵcurrentInjector(),
  });

  const { address, release } = registry.register(
    ɵcraftPrimitiveAddress(hostTags, options.kind, options.name),
    {
      kind: options.kind,
      name: options.name,
      hostTags,
      read: options.read,
      write: options.write,
      ...(options.restoreError ? { restoreError: options.restoreError } : {}),
      ...(options.reload ? { reload: options.reload } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.error ? { error: options.error } : {}),
      // Aucun défaut ici : le transfert d'une primitive est une décision de
      // la politique de sécurité de l'application, pas du framework.
      ...(options.transfer === undefined ? {} : { transfer: options.transfer }),
    },
  );

  let destroyRef: DestroyRef | null = null;
  try {
    destroyRef = options.injector
      ? options.injector.get(DestroyRef, null)
      : (inject(DestroyRef, { optional: true }) ?? null);
  } catch {
    destroyRef = null;
  }
  const effectInjector =
    options.kind !== 'queryParams'
      ? (options.injector ?? ɵcurrentInjector())
      : undefined;
  let previous: Readonly<{ value: unknown; status?: string; error?: unknown }>;
  let hasPrevious = false;
  try {
    previous = {
      value: options.read(),
      ...(options.status ? { status: options.status() } : {}),
      ...(options.error ? { error: options.error() } : {}),
    };
    hasPrevious = true;
  } catch {
    // An unsettled resource becomes observable once its value is readable.
  }
  const changeWatch = effectInjector
    ? effect(
        () => {
          let current: Readonly<{
            value: unknown;
            status?: string;
            error?: unknown;
          }>;
          try {
            current = {
              value: options.read(),
              ...(options.status ? { status: options.status() } : {}),
              ...(options.error ? { error: options.error() } : {}),
            };
          } catch {
            return;
          }
          if (!hasPrevious) {
            previous = current;
            hasPrevious = true;
            return;
          }
          if (
            Object.is(previous.value, current.value) &&
            previous.status === current.status &&
            Object.is(previous.error, current.error)
          )
            return;
          previous = current;
          if (
            options.kind !== 'state' &&
            current.status !== 'resolved' &&
            current.status !== 'error'
          )
            return;
          registry.publishChange(address);
        },
        { injector: effectInjector },
      )
    : undefined;
  if (destroyRef) {
    destroyRef.onDestroy(() => {
      changeWatch?.destroy();
      release();
      tracking?.release();
    });
  } else {
    // Nothing tells when it ends, so it cannot be judged as leaked.
    tracking?.release();
  }

  return { link: (ref: unknown) => registry.link(ref, address) };
}
