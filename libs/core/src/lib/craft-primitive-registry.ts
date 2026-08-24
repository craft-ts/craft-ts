import {
  DestroyRef,
  inject,
  InjectionToken,
  type Injector,
} from './host/craft-compat';
import { ɵHOST_TAG_LIST } from './craft-service';

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

export class CraftPrimitiveRegistry {
  private readonly entries = new Map<string, CraftPrimitiveEntry>();
  private readonly occurrences = new Map<string, number>();
  private readonly primedValues = new Map<string, unknown>();
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
    this.entries.set(address, registered);
    if (this.primedValues.has(address)) {
      registered.write(this.primedValues.get(address));
      this.primedValues.delete(address);
    }

    return {
      address,
      release: () => {
        if (this.entries.get(address) === registered) {
          this.entries.delete(address);
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
  restore(snapshot: CraftPrimitiveSnapshot): void {
    for (const [address, value] of Object.entries(snapshot)) {
      this.entries.get(address)?.write(value);
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
}

export const CRAFT_PRIMITIVE_REGISTRY =
  new InjectionToken<CraftPrimitiveRegistry>('CRAFT_PRIMITIVE_REGISTRY', {
    providedIn: 'root',
    factory: () => new CraftPrimitiveRegistry(),
  });

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
  const resolve = <T>(token: InjectionToken<T>, fallback: T): T => {
    try {
      return options.injector
        ? (options.injector.get(token, fallback) ?? fallback)
        : (inject(token, { optional: true }) ?? fallback);
    } catch {
      return fallback;
    }
  };

  const registry = resolve(
    CRAFT_PRIMITIVE_REGISTRY,
    null as never,
  ) as CraftPrimitiveRegistry | null;
  if (!registry) return { link: () => undefined };

  const hostTags = resolve(
    ɵHOST_TAG_LIST as unknown as InjectionToken<readonly string[]>,
    [] as readonly string[],
  );

  const { address, release } = registry.register(
    ɵcraftPrimitiveAddress(hostTags, options.kind, options.name),
    {
      kind: options.kind,
      name: options.name,
      hostTags,
      read: options.read,
      write: options.write,
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
  destroyRef?.onDestroy(release);

  return { link: (ref: unknown) => registry.link(ref, address) };
}
