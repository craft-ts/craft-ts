import { inject } from './host/craft-compat';
import { craftComputed as createCraftComputed, craftSignal } from './host/craft-signal';
import {
  CRAFT_PRIMITIVE_REGISTRY,
  type CraftPrimitiveEntry,
  type CraftPrimitiveSnapshot,
} from './craft-primitive-registry';
import { ɵwithCraftReplay } from './craft-replay';
import {
  createYieldableReactiveValue,
  isYieldableReactiveValue,
  rawReactiveValue,
  type YieldableReactiveValue,
} from './reactive-read';
import type {
  CraftMachineControls,
  CraftMachineInsertionContext,
} from './craft-state-machine';

/**
 * One recorded moment of a machine: the transition that produced it, and the
 * value of every primitive the machine owns at that point.
 *
 * The step and the values are captured AFTER the transition was applied, so
 * restoring an entry restores the state the machine was in once it had moved.
 *
 * Snapshot keys are RELATIVE to the machine, not absolute registry addresses.
 * An absolute address starts with the host chain of the component that happens
 * to hold the machine, and that prefix carries a creation ordinal which means
 * nothing after a reload. Below the machine everything is deterministic — the
 * same code creates the same primitives in the same order — so a relative key
 * survives, and re-anchors onto whichever instance is restoring it.
 */
export type CraftHistoryEntry<Steps extends string = string> = Readonly<{
  step: Steps | undefined;
  from: Steps | undefined;
  event: unknown;
  at: number;
  snapshot: CraftPrimitiveSnapshot;
}>;

/**
 * What a history feature composed into {@link withHistory} receives. It is
 * deliberately narrow: a feature navigates the recorded entries, it does not
 * decide what gets recorded.
 */
export type CraftHistoryFeatureContext<Steps extends string = string> =
  Readonly<{
    entries: YieldableReactiveValue<
      readonly CraftHistoryEntry<Steps>[],
      'entries'
    >;
    /** Index of the entry the machine currently sits on. */
    cursor: YieldableReactiveValue<number, 'cursor'>;
    /**
     * Restores the recorded entry at `index`. Returns `false` when the index
     * is out of range. Guards are NOT consulted: a recorded state was already
     * accepted once, and replaying it must not depend on today's permissions.
     */
    goTo(index: number): boolean;
    controls: CraftMachineControls<Steps>;
  }>;

export type CraftHistoryFeature<Output extends object> = (
  context: CraftHistoryFeatureContext<any>,
) => Output;

type HistoryOptions = Readonly<{
  /**
   * How many entries to keep. The oldest are dropped first. `Infinity` keeps
   * everything, which is fine for a debug session and not for production.
   */
  limit?: number;
  /**
   * Primitives declared OUTSIDE the machine that belong to the story being
   * recorded. A machine captures what it owns by itself; anything else has to
   * be named, so a replay stays reproducible instead of depending on whatever
   * happened to be in the injector.
   *
   * ```ts
   * withHistory({ include: [sharedFilters] }, withBackNavigation())
   * ```
   */
  include?: readonly unknown[];
  /**
   * Keeps the history across a reload, under an anchor the application names.
   *
   * Only the ANCHOR needs a stable identity: everything the machine owns is
   * addressed relative to it, and those keys are deterministic. `key` may be a
   * function when the anchor comes from data — a row of a list anchors on the
   * entity it edits, not on the order it happened to be created in.
   *
   * ```ts
   * const storage = yield* SessionStorageService();
   *
   * withHistory(
   *   { persist: { storeName: 'app', key: () => bookId(), storage } },
   *   withBackNavigation(),
   * )
   * ```
   *
   * The storage is passed in rather than injected, so the dependency stays
   * visible at the call site instead of hiding inside the feature.
   */
  persist?: CraftHistoryPersistence;
}>;

/** The slice of a storage API a persisted history needs. */
export type CraftHistoryStorage = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

export type CraftHistoryPersistence = Readonly<{
  storeName: string;
  /** Resolved once, when the machine is built. */
  key: string | (() => string);
  storage: CraftHistoryStorage;
}>;

/** Reserved prefix for the primitives named through `include`. */
const EXTERNAL_KEY_PREFIX = '#include/';

type HistoryOutput<Steps extends string> = {
  readonly history: YieldableReactiveValue<
    readonly CraftHistoryEntry<Steps>[],
    'history'
  >;
  readonly historyCursor: YieldableReactiveValue<number, 'historyCursor'>;
};

const DEFAULT_LIMIT = 50;

/** What `withHistory(...)` resolves to: an insertion for `craftStateMachine`. */
type HistoryInsertion<Steps extends string, Features> = (
  context: CraftMachineInsertionContext<any, Steps, any>,
) => HistoryOutput<Steps> & Features;

/**
 * Records the machine's history, and composes features on top of it.
 *
 * History is not part of the machine core — it is an insertion, exactly like
 * the derived values and step flags beside it:
 *
 * ```ts
 * craftStateMachine(
 *   contextFactory,
 *   transitions,
 *   stepContexts,
 *   withHistory(withBackNavigation()),
 * );
 * ```
 *
 * Every accepted transition appends an entry holding the new step and a
 * snapshot of every primitive the machine owns, read through
 * `CRAFT_PRIMITIVE_REGISTRY` and scoped to the machine's host chain. A
 * primitive declared OUTSIDE the machine is not captured: pass it explicitly
 * through `include` when it belongs to the story being replayed.
 */
export function withHistory<Steps extends string = string>(): HistoryInsertion<
  Steps,
  object
>;
export function withHistory<Feature1 extends object, Steps extends string = string>(
  feature1: CraftHistoryFeature<Feature1>,
): HistoryInsertion<Steps, Feature1>;
export function withHistory<
  Feature1 extends object,
  Feature2 extends object,
  Steps extends string = string,
>(
  feature1: CraftHistoryFeature<Feature1>,
  feature2: CraftHistoryFeature<Feature2>,
): HistoryInsertion<Steps, Feature1 & Feature2>;
export function withHistory<
  Feature1 extends object,
  Feature2 extends object,
  Feature3 extends object,
  Steps extends string = string,
>(
  feature1: CraftHistoryFeature<Feature1>,
  feature2: CraftHistoryFeature<Feature2>,
  feature3: CraftHistoryFeature<Feature3>,
): HistoryInsertion<Steps, Feature1 & Feature2 & Feature3>;
export function withHistory<Steps extends string = string>(
  options: HistoryOptions,
): HistoryInsertion<Steps, object>;
export function withHistory<Feature1 extends object, Steps extends string = string>(
  options: HistoryOptions,
  feature1: CraftHistoryFeature<Feature1>,
): HistoryInsertion<Steps, Feature1>;
export function withHistory<
  Feature1 extends object,
  Feature2 extends object,
  Steps extends string = string,
>(
  options: HistoryOptions,
  feature1: CraftHistoryFeature<Feature1>,
  feature2: CraftHistoryFeature<Feature2>,
): HistoryInsertion<Steps, Feature1 & Feature2>;
export function withHistory<
  Feature1 extends object,
  Feature2 extends object,
  Feature3 extends object,
  Steps extends string = string,
>(
  options: HistoryOptions,
  feature1: CraftHistoryFeature<Feature1>,
  feature2: CraftHistoryFeature<Feature2>,
  feature3: CraftHistoryFeature<Feature3>,
): HistoryInsertion<Steps, Feature1 & Feature2 & Feature3>;
export function withHistory(
  optionsOrFeature?: HistoryOptions | CraftHistoryFeature<object>,
  ...rest: CraftHistoryFeature<object>[]
): (context: CraftMachineInsertionContext<any, string, any>) => object {
  const options =
    typeof optionsOrFeature === 'function' || optionsOrFeature === undefined
      ? {}
      : optionsOrFeature;
  const features =
    typeof optionsOrFeature === 'function'
      ? [optionsOrFeature, ...rest]
      : rest;
  const limit = options.limit ?? DEFAULT_LIMIT;

  return ({ currentStep, machine }) => {
    const registry = inject(CRAFT_PRIMITIVE_REGISTRY);
    const persistence = options.persist;
    const storageKey = persistence
      ? `craft-ts-${persistence.storeName}-history-${
          typeof persistence.key === 'function'
            ? persistence.key()
            : persistence.key
        }`
      : undefined;

    const restored = readPersisted(persistence?.storage, storageKey);
    const entries = craftSignal<readonly CraftHistoryEntry[]>(
      restored?.entries ?? [],
    );
    const cursor = craftSignal(restored?.cursor ?? 0);

    const includedRefs = options.include ?? [];
    const machinePrefix = machine.hostTags.join(' / ');

    /**
     * Keys an entry relative to the machine, re-indexing occurrences within
     * the current set rather than reusing the registry's global counter. That
     * counter only ever grows, so it would drift the moment a machine is
     * destroyed and rebuilt inside the same host — and a persisted key must not
     * depend on how many times the page has already built this primitive.
     */
    const relativeKeys = () => {
      const seen = new Map<string, number>();

      return registry.under(machine.hostTags).map((entry) => {
        const base = stripOccurrence(entry.address).slice(
          machinePrefix.length === 0 ? 0 : machinePrefix.length + 3,
        );
        const occurrence = (seen.get(base) ?? 0) + 1;
        seen.set(base, occurrence);
        return { entry, key: `${base}#${occurrence}` };
      });
    };

    const capture = (): CraftPrimitiveSnapshot => {
      const snapshot: Record<string, unknown> = {};

      for (const { entry, key } of relativeKeys()) {
        const captured = registry.capture([entry]);
        if (entry.address in captured && isRecordable(entry, captured[entry.address])) {
          snapshot[key] = captured[entry.address];
        }
      }

      // Primitives declared outside the machine are keyed by their position in
      // the declared `include` list, which is stable by construction.
      includedRefs.forEach((ref, index) => {
        const address = registry.addressOf(ref);
        const entry = address ? registry.get(address) : undefined;
        if (!entry) return;
        const captured = registry.capture([entry]);
        if (entry.address in captured && isRecordable(entry, captured[entry.address])) {
          snapshot[`${EXTERNAL_KEY_PREFIX}${index}`] = captured[entry.address];
        }
      });

      return snapshot;
    };

    /** Resolves relative keys back onto the primitives present right now. */
    const restore = (snapshot: CraftPrimitiveSnapshot): void => {
      const current = new Map(
        relativeKeys().map(({ entry, key }) => [key, entry]),
      );

      const writes: { entry: CraftPrimitiveEntry; value: unknown }[] = [];

      for (const [key, value] of Object.entries(snapshot)) {
        const entry = key.startsWith(EXTERNAL_KEY_PREFIX)
          ? externalEntry(Number(key.slice(EXTERNAL_KEY_PREFIX.length)))
          : current.get(key);
        if (entry) writes.push({ entry, value });
      }

      // The whole restore runs under the replay flag, so a resource claims its
      // restored parameter without reloading over the value being restored
      // with it — and so tooling can tell a rewind from user activity.
      ɵwithCraftReplay(() => {
        for (const { entry, value } of writes) {
          entry.write(value);
        }
      });

      // A resource the snapshot does not cover was still loading when the
      // moment was recorded, so there is no value to put back. Left frozen it
      // would keep showing what belongs to another parameter; reloading it is
      // the honest answer.
      const restored = new Set(writes.map(({ entry }) => entry.address));
      for (const entry of registry.under(machine.hostTags)) {
        if (entry.kind === 'state' || restored.has(entry.address)) continue;
        entry.reload?.();
      }
    };

    const externalEntry = (index: number): CraftPrimitiveEntry | undefined => {
      const address = registry.addressOf(includedRefs[index]);
      return address ? registry.get(address) : undefined;
    };

    const append = (entry: CraftHistoryEntry) => {
      entries.update((current) => {
        // Recording after a rewind drops the forward entries: the machine took
        // a different branch, and keeping the old one would let `forward()`
        // walk into a future that no longer happened.
        const kept = current.slice(0, cursor() + 1);
        const next = [...kept, entry];
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
      cursor.set(entries().length - 1);
      writePersisted(persistence?.storage, storageKey, entries(), cursor());
    };

    // The machine has already taken its initial step by the time an insertion
    // runs, so the first entry records where it started.
    append({
      step: readRaw<string>(currentStep),
      from: undefined,
      event: undefined,
      at: Date.now(),
      snapshot: capture(),
    });

    machine.onTransition((transition) => {
      if (!transition.accepted) return;
      append({
        step: transition.to,
        from: transition.from,
        event: transition.event,
        at: Date.now(),
        snapshot: capture(),
      });
    });

    const goTo = (index: number): boolean => {
      const recorded = entries();
      const entry = recorded[index];
      if (!entry) return false;

      machine.suspended(() => {
        restore(entry.snapshot);
        ɵwithCraftReplay(() => machine.restoreStep(entry.step));
      });
      cursor.set(index);
      writePersisted(persistence?.storage, storageKey, entries(), cursor());
      return true;
    };

    const entriesReader = createYieldableReactiveValue(
      entries.asReadonly(),
      'entries',
    );
    const cursorReader = createYieldableReactiveValue(
      cursor.asReadonly(),
      'cursor',
    );

    const featureContext: CraftHistoryFeatureContext = {
      entries: entriesReader,
      cursor: cursorReader,
      goTo,
      controls: machine,
    };

    return Object.assign(
      {
        history: createYieldableReactiveValue(entries.asReadonly(), 'history'),
        historyCursor: createYieldableReactiveValue(
          cursor.asReadonly(),
          'historyCursor',
        ),
      },
      ...features.map((feature) => feature(featureContext)),
    ) as object;
  };
}

type BackNavigationOutput = {
  readonly canGoBack: YieldableReactiveValue<boolean, 'canGoBack'>;
  readonly canGoForward: YieldableReactiveValue<boolean, 'canGoForward'>;
  readonly back: () => boolean;
  readonly forward: () => boolean;
};

/**
 * Step-by-step navigation through a machine's history. Composes into
 * {@link withHistory}, which owns the entries it walks:
 *
 * ```ts
 * withHistory(withBackNavigation())
 * ```
 *
 * `back()` and `forward()` restore a recorded moment without asking the
 * guards: that state was accepted once already.
 */
export function withBackNavigation(): CraftHistoryFeature<BackNavigationOutput> {
  return ({ entries, cursor, goTo }) => {
    const rawEntries = () =>
      readRaw<readonly CraftHistoryEntry[]>(entries) ?? [];
    const rawCursor = () => readRaw<number>(cursor) ?? 0;

    return {
      canGoBack: createYieldableReactiveValue(
        createCraftComputed(() => rawCursor() > 0),
        'canGoBack',
      ),
      canGoForward: createYieldableReactiveValue(
        createCraftComputed(() => rawCursor() < rawEntries().length - 1),
        'canGoForward',
      ),
      back: () => goTo(rawCursor() - 1),
      forward: () => goTo(rawCursor() + 1),
    };
  };
}

/**
 * Reads a craft reactive value as a plain signal. A yieldable reader IS its own
 * generator factory, so calling it hands back a generator rather than a value —
 * the raw source is the way through.
 */
function readRaw<Value>(reader: unknown): Value | undefined {
  return isYieldableReactiveValue(reader)
    ? (rawReactiveValue(reader)() as Value)
    : undefined;
}


/**
 * Whether a captured value is worth recording.
 *
 * A resource read before its loader has settled holds `undefined`, and writing
 * `undefined` back into it does not restore anything — it pins the resource to
 * a local value and detaches it from its loader for good. An unsettled
 * resource records nothing instead, and a restore leaves the live one alone.
 */
function isRecordable(entry: CraftPrimitiveEntry, value: unknown): boolean {
  return entry.kind === 'state' || value !== undefined;
}

/** Drops the registry's global occurrence suffix from an address. */
function stripOccurrence(address: string): string {
  return address.replace(/#\d+$/, '');
}

type PersistedHistory = Readonly<{
  entries: readonly CraftHistoryEntry[];
  cursor: number;
}>;

function readPersisted(
  storage: CraftHistoryStorage | undefined,
  storageKey: string | undefined,
): PersistedHistory | undefined {
  if (!storage || !storageKey) return undefined;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistedHistory;
    return Array.isArray(parsed?.entries) ? parsed : undefined;
  } catch {
    // A history that cannot be read back is a history that never existed.
    return undefined;
  }
}

function writePersisted(
  storage: CraftHistoryStorage | undefined,
  storageKey: string | undefined,
  entries: readonly CraftHistoryEntry[],
  cursor: number,
): void {
  if (!storage || !storageKey) return;
  try {
    storage.setItem(storageKey, JSON.stringify({ entries, cursor }));
  } catch {
    // An event can carry anything, a DOM event included. A moment that cannot
    // be serialised is dropped from the persisted copy rather than taking the
    // whole history down with it; the in-memory history keeps it.
    try {
      storage.setItem(
        storageKey,
        JSON.stringify({
          entries: entries.map((entry) => ({ ...entry, event: undefined })),
          cursor,
        }),
      );
    } catch {
      storage.removeItem(storageKey);
    }
  }
}
