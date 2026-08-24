import { computed, isSignal, signal, Signal, WritableSignal } from '../host/craft-compat';
import type { AnyCraftException } from '../craft-exception';

export type CraftFieldError = AnyCraftException;

export type CraftFieldSchemaErrorEntry = {
  readonly path: ReadonlyArray<string | number>;
  readonly error: CraftFieldError;
};

export type CraftFieldSchemaErrorSource = Signal<
  ReadonlyArray<CraftFieldSchemaErrorEntry>
>;

export type FieldAttributeMeta =
  | { kind: 'native-constraint'; target: 'min'; value: number | Date | undefined }
  | { kind: 'native-constraint'; target: 'max'; value: number | Date | undefined }
  | { kind: 'native-constraint'; target: 'minLength'; value: number | undefined }
  | { kind: 'native-constraint'; target: 'maxLength'; value: number | undefined }
  | { kind: 'native-constraint'; target: 'pattern'; value: RegExp | undefined }
  | { kind: 'native-constraint'; target: 'required'; value: boolean };

export type CraftValidatorPending = { pending: true };
export type CraftValidatorOutput =
  | undefined
  | CraftFieldError
  | ReadonlyArray<CraftFieldError>
  | CraftValidatorPending;

export type CraftValidatorContext<T> = {
  value: Signal<T>;
  field: CraftField<T>;
  identifier: unknown;
};

export type CraftValidator<T = unknown> = (
  context: CraftValidatorContext<T>,
) => {
  result: Signal<CraftValidatorOutput>;
  attribute?: Signal<FieldAttributeMeta | undefined>;
};

export interface ControlSyncer<T> {
  /** Called when the model value changes. Implementation pushes value to DOM/component. */
  writeValue(next: T): void;
  /** Called on reset to force re-sync to DOM (even if model value did not change). */
  resync?(): void;
  /** Cleanup. */
  destroy?(): void;
}

export interface CraftValueControl<T> {
  value: { (): T; set: (next: T) => void };
}

export interface CraftCheckboxControl {
  checked: { (): boolean; set: (next: boolean) => void };
}

export type FieldStateBindingKind = 'hidden' | 'disabled' | 'readonly';

type FieldRootBackingStore<T> = {
  read: () => T;
  set: (next: T) => void;
  asReadonly: () => Signal<T>;
};

type ParentLink<TParent, T> = {
  parent: CraftFieldInternals<TParent>;
  segment: string | number;
  read: (parent: TParent) => T;
  write: (parent: TParent, next: T) => TParent;
};

type CraftFieldInternals<T> = CraftField<T> & {
  __raw: () => T;
  __setRaw: (next: T) => void;
  __children: Map<string | number, CraftFieldInternals<unknown>>;
  __resetTriggerCount: WritableSignal<number>;
  __propagateDirty: (dirty: boolean) => void;
  __propagateTouched: (touched: boolean) => void;
  __resetCascade: () => void;
  __bumpRevision: () => void;
  __schemaErrorSources: CraftFieldSchemaErrorSource[];
  __schemaErrorRevision: WritableSignal<number>;
};

export type CraftField<T> = {
  // Read
  value: Signal<T>;

  // Write
  set(next: T): void;
  patch(fn: (current: T) => Partial<T>): void;
  reset(initialValue?: T): void;

  // Status
  dirty: Signal<boolean>;
  touched: Signal<boolean>;
  hidden: Signal<boolean>;
  disabled: Signal<boolean>;
  readonly: Signal<boolean>;
  pending: Signal<boolean>;
  invalid: Signal<boolean>;
  valid: Signal<boolean>;
  errors: Signal<ReadonlyArray<CraftFieldError>>;

  // Native constraints
  required: Signal<boolean>;
  min: Signal<number | Date | undefined>;
  max: Signal<number | Date | undefined>;
  minLength: Signal<number | undefined>;
  maxLength: Signal<number | undefined>;
  pattern: Signal<RegExp | undefined>;
  disabledReasons: Signal<ReadonlyArray<string>>;

  // Internal — used by the directive and insertions
  ɵregisterControl(syncer: ControlSyncer<T>): () => void;
  ɵmarkTouched(): void;
  ɵmarkUntouched(): void;
  ɵmarkDirty(): void;
  ɵmarkPristine(): void;
  ɵregisterValidator(validator: CraftValidator<T>, identifier?: unknown): () => void;
  ɵregisterSchemaErrorSource(source: CraftFieldSchemaErrorSource): () => void;
  ɵregisterStateBinding(kind: FieldStateBindingKind, source: Signal<boolean>): () => void;
  ɵregisterDisabledReason(source: Signal<string | undefined>): () => void;
  ɵresetTrigger: Signal<number>;
  ɵpath: ReadonlyArray<string | number>;
};

export type CraftFieldTree<T> = CraftField<T> &
  ([T] extends [ReadonlyArray<infer Item>]
    ? { item(index: number): CraftFieldTree<Item>; length: Signal<number> }
    : T extends Record<string, unknown>
      ? { [K in keyof T]-?: CraftFieldTree<T[K]> }
      : object);

/** Returns whether a value exposes the public Craft field contract. */
export function isCraftField(value: unknown): value is CraftField<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CraftField<unknown>>;
  return (
    typeof candidate.value === 'function' &&
    typeof candidate.set === 'function' &&
    typeof candidate.ɵregisterControl === 'function'
  );
}

const FIELD_INTERNALS_TOKEN = Symbol('CraftFieldInternals');

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function readAtSegment(parent: unknown, segment: string | number): unknown {
  if (parent == null) return undefined;
  return (parent as Record<string | number, unknown>)[segment];
}

function writeAtSegment<TParent>(parent: TParent, segment: string | number, value: unknown): TParent {
  if (Array.isArray(parent)) {
    const next = parent.slice();
    (next as unknown[])[segment as number] = value;
    return next as unknown as TParent;
  }
  if (isPlainObject(parent)) {
    return { ...parent, [segment]: value } as unknown as TParent;
  }
  return parent;
}

function pathsEqual(
  left: ReadonlyArray<string | number>,
  right: ReadonlyArray<string | number>,
): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function createCraftFieldInternals<T>(
  options:
    | { kind: 'root'; backing: FieldRootBackingStore<T>; path: ReadonlyArray<string | number> }
    | { kind: 'child'; link: ParentLink<unknown, T>; path: ReadonlyArray<string | number> },
): CraftFieldInternals<T> {
  const path = options.path;

  const schemaErrorSources =
    options.kind === 'root'
      ? []
      : options.link.parent.__schemaErrorSources;
  const schemaErrorRevision =
    options.kind === 'root'
      ? signal(0)
      : options.link.parent.__schemaErrorRevision;

  // ---------- Value adapter ----------
  const readRaw = (): T => {
    if (options.kind === 'root') return options.backing.read();
    return options.link.read(options.link.parent.__raw());
  };

  const setRaw = (next: T): void => {
    if (options.kind === 'root') {
      options.backing.set(next);
      return;
    }
    const parent = options.link.parent;
    const nextParent = options.link.write(parent.__raw(), next);
    parent.__setRaw(nextParent);
  };

  const valueSignal: Signal<T> =
    options.kind === 'root'
      ? options.backing.asReadonly()
      : computed<T>(() => options.link.read(options.link.parent.value()));

  // ---------- Dirty / Touched ----------
  const localDirty = signal(false);
  const localTouched = signal(false);
  const childDirty = signal(false);
  const childTouched = signal(false);

  const dirty = computed(() => localDirty() || childDirty());
  const touched = computed(() => localTouched() || childTouched());

  const recomputeChildDirty = () => {
    let any = false;
    for (const child of children.values()) {
      if (child.dirty()) {
        any = true;
        break;
      }
    }
    childDirty.set(any);
  };
  const recomputeChildTouched = () => {
    let any = false;
    for (const child of children.values()) {
      if (child.touched()) {
        any = true;
        break;
      }
    }
    childTouched.set(any);
  };

  // ---------- State sources (hidden / disabled / readonly) ----------
  // Plain mutable arrays + a single revision signal so that registration
  // (which can happen lazily during template render) does not write to a
  // tracked signal — Angular forbids signal writes during render (NG0600).
  // The first read of any computed below captures whatever has been registered
  // so far, and subsequent reads track the inner source signals individually.
  const hiddenSources: Signal<boolean>[] = [];
  const disabledSources: Signal<boolean>[] = [];
  const readonlySources: Signal<boolean>[] = [];
  const registrationRevision = signal(0);

  const hiddenLocal = computed(() => {
    registrationRevision();
    return hiddenSources.some((src) => src());
  });
  const disabledLocal = computed(() => {
    registrationRevision();
    return disabledSources.some((src) => src());
  });
  const readonlyLocal = computed(() => {
    registrationRevision();
    return readonlySources.some((src) => src());
  });

  // ---------- Validators ----------
  type RegisteredValidator = {
    result: Signal<CraftValidatorOutput>;
    attribute?: Signal<FieldAttributeMeta | undefined>;
  };
  const validators: RegisteredValidator[] = [];

  const schemaErrors = computed<ReadonlyArray<CraftFieldError>>(() => {
    schemaErrorRevision();
    if (hiddenLocal() || disabledLocal() || readonlyLocal()) return [];
    return schemaErrorSources
      .flatMap((source) => source())
      .filter((entry) => pathsEqual(entry.path, path))
      .map((entry) => entry.error);
  });

  const validatorOutputs = computed(() => {
    registrationRevision();
    return validators.map((v) => ({
      result: v.result(),
      attribute: v.attribute?.(),
    }));
  });

  const errors = computed<ReadonlyArray<CraftFieldError>>(() => {
    // Track revision so newly-registered children/validators invalidate this
    // computed at the next tick.
    registrationRevision();
    if (hiddenLocal() || disabledLocal() || readonlyLocal()) return [];
    const list: CraftFieldError[] = [];
    for (const out of validatorOutputs()) {
      const r = out.result;
      if (r === undefined) continue;
      if (typeof r === 'object' && r !== null && 'pending' in r && (r as CraftValidatorPending).pending === true) {
        continue;
      }
      if (Array.isArray(r)) {
        for (const item of r) list.push(item);
      } else {
        list.push(r as CraftFieldError);
      }
    }
    list.push(...schemaErrors());
    // Aggregate errors from all child fields so that parent validity reflects
    // the entire sub-tree (a parent is invalid if any descendant is invalid).
    for (const child of children.values()) {
      const childErrors = child.errors();
      if (childErrors.length > 0) {
        for (const e of childErrors) list.push(e);
      }
    }
    return list;
  });

  const pending = computed(() => {
    registrationRevision();
    if (hiddenLocal() || disabledLocal() || readonlyLocal()) return false;
    if (
      validatorOutputs().some(
        (out) =>
          typeof out.result === 'object' &&
          out.result !== null &&
          'pending' in (out.result as object) &&
          (out.result as CraftValidatorPending).pending === true,
      )
    ) {
      return true;
    }
    for (const child of children.values()) {
      if (child.pending()) return true;
    }
    return false;
  });
  const schemaInvalid = computed(() => {
    if (options.kind !== 'root') return false;
    if (hiddenLocal() || disabledLocal() || readonlyLocal()) return false;
    schemaErrorRevision();
    return schemaErrorSources.some((source) => source().length > 0);
  });
  const invalid = computed(() => schemaInvalid() || errors().length > 0);
  const valid = computed(() => !invalid() && !pending());

  // ---------- Native constraint signals ----------
  const constraintSignal = <V>(target: FieldAttributeMeta['target'], fallback: V) =>
    computed<V>(() => {
      let acc: V = fallback;
      let found = false;
      for (const out of validatorOutputs()) {
        const a = out.attribute;
        if (a && a.kind === 'native-constraint' && a.target === target) {
          if (target === 'required') {
            acc = ((acc as unknown as boolean) || (a.value as boolean)) as V;
            found = true;
          } else {
            acc = a.value as V;
            found = true;
          }
        }
      }
      return found ? acc : fallback;
    });

  const required = constraintSignal<boolean>('required', false);
  const min = constraintSignal<number | Date | undefined>('min', undefined);
  const max = constraintSignal<number | Date | undefined>('max', undefined);
  const minLength = constraintSignal<number | undefined>('minLength', undefined);
  const maxLength = constraintSignal<number | undefined>('maxLength', undefined);
  const pattern = constraintSignal<RegExp | undefined>('pattern', undefined);

  // ---------- Disabled reasons ----------
  const disabledReasonSources: Signal<string | undefined>[] = [];
  const disabledReasons = computed<ReadonlyArray<string>>(() => {
    registrationRevision();
    const out: string[] = [];
    for (const src of disabledReasonSources) {
      const r = src();
      if (typeof r === 'string' && r.length > 0) out.push(r);
    }
    return out;
  });

  // ---------- Children registry ----------
  const children: Map<string | number, CraftFieldInternals<unknown>> = new Map();

  // ---------- Reset trigger ----------
  const resetTriggerCount = signal(0);

  // ---------- Inherited state from parent ----------
  const inheritedDisabled = options.kind === 'child' ? options.link.parent.disabled : signal(false);
  const inheritedHidden = options.kind === 'child' ? options.link.parent.hidden : signal(false);
  const inheritedReadonly = options.kind === 'child' ? options.link.parent.readonly : signal(false);

  const disabled = computed(() => inheritedDisabled() || disabledLocal());
  const hidden = computed(() => inheritedHidden() || hiddenLocal());
  const readonlyComputed = computed(() => inheritedReadonly() || readonlyLocal());

  // ---------- Control syncers ----------
  const syncers = new Set<ControlSyncer<T>>();

  // ---------- Field methods ----------
  const set = (next: T): void => {
    setRaw(next);
    if (!localDirty()) localDirty.set(true);
    if (options.kind === 'child') {
      options.link.parent.__propagateDirty(true);
    }
  };

  const patch = (fn: (current: T) => Partial<T>): void => {
    const current = readRaw();
    const partial = fn(current);
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      set({ ...(current as object), ...partial } as T);
    } else {
      set(partial as T);
    }
  };

  const propagateDirty = (childIsDirty: boolean) => {
    if (childIsDirty) {
      childDirty.set(true);
    } else {
      recomputeChildDirty();
    }
    if (options.kind === 'child') {
      options.link.parent.__propagateDirty(dirty());
    }
  };

  const propagateTouched = (childIsTouched: boolean) => {
    if (childIsTouched) {
      childTouched.set(true);
    } else {
      recomputeChildTouched();
    }
    if (options.kind === 'child') {
      options.link.parent.__propagateTouched(touched());
    }
  };

  const markTouched = () => {
    if (!localTouched()) localTouched.set(true);
    if (options.kind === 'child') options.link.parent.__propagateTouched(true);
  };

  const markUntouched = () => {
    localTouched.set(false);
    if (options.kind === 'child') options.link.parent.__propagateTouched(false);
  };

  const markDirty = () => {
    if (!localDirty()) localDirty.set(true);
    if (options.kind === 'child') options.link.parent.__propagateDirty(true);
  };

  const markPristine = () => {
    localDirty.set(false);
    if (options.kind === 'child') options.link.parent.__propagateDirty(false);
  };

  const resetCascade = () => {
    localDirty.set(false);
    localTouched.set(false);
    childDirty.set(false);
    childTouched.set(false);
    for (const child of children.values()) {
      child.__resetCascade();
    }
    resetTriggerCount.update((v) => v + 1);
    for (const syncer of syncers) {
      syncer.resync?.();
    }
  };

  const reset = (initialValue?: T): void => {
    if (initialValue !== undefined) {
      setRaw(initialValue);
    }
    resetCascade();
    if (options.kind === 'child') {
      options.link.parent.__propagateDirty(false);
      options.link.parent.__propagateTouched(false);
    }
  };

  // ---------- Registration helpers ----------
  const registerControl = (syncer: ControlSyncer<T>): (() => void) => {
    syncers.add(syncer);
    return () => {
      syncers.delete(syncer);
      syncer.destroy?.();
    };
  };

  const bumpRevision = () => {
    // The revision signal exists to invalidate computed signals when the
    // registration set changes AFTER it has already been observed. Writing
    // to a signal during template render is forbidden (NG0600), so we defer
    // the bump to a microtask. In the common case (registration happens
    // before any read), the bump is harmless; the first read will already
    // have captured the registered entries.
    queueMicrotask(() => registrationRevision.update((v) => v + 1));
  };

  const registerValidator = (
    validator: CraftValidator<T>,
    identifier?: unknown,
  ): (() => void) => {
    const ctxField = field as CraftField<T>;
    const out = validator({ value: valueSignal, field: ctxField, identifier });
    const entry: RegisteredValidator = { result: out.result, attribute: out.attribute };
    validators.push(entry);
    bumpRevision();
    return () => {
      const i = validators.indexOf(entry);
      if (i >= 0) validators.splice(i, 1);
      bumpRevision();
    };
  };

  const registerSchemaErrorSource = (
    source: CraftFieldSchemaErrorSource,
  ): (() => void) => {
    schemaErrorSources.push(source);
    schemaErrorRevision.update((value) => value + 1);
    return () => {
      const index = schemaErrorSources.indexOf(source);
      if (index >= 0) schemaErrorSources.splice(index, 1);
      schemaErrorRevision.update((value) => value + 1);
    };
  };

  const registerStateBinding = (
    kind: FieldStateBindingKind,
    source: Signal<boolean>,
  ): (() => void) => {
    const target =
      kind === 'hidden' ? hiddenSources : kind === 'disabled' ? disabledSources : readonlySources;
    target.push(source);
    bumpRevision();
    return () => {
      const i = target.indexOf(source);
      if (i >= 0) target.splice(i, 1);
      bumpRevision();
    };
  };

  const registerDisabledReason = (source: Signal<string | undefined>): (() => void) => {
    disabledReasonSources.push(source);
    bumpRevision();
    return () => {
      const i = disabledReasonSources.indexOf(source);
      if (i >= 0) disabledReasonSources.splice(i, 1);
      bumpRevision();
    };
  };

  // ---------- Field value sync to syncers ----------
  // Note: syncers call writeValue when registering; the directive itself sets up an effect
  // to track value changes. We don't auto-sync here to avoid effect ownership issues.

  const field: CraftFieldInternals<T> = {
    value: valueSignal,
    set,
    patch,
    reset,
    dirty,
    touched,
    hidden,
    disabled,
    readonly: readonlyComputed,
    pending,
    invalid,
    valid,
    errors,
    required,
    min,
    max,
    minLength,
    maxLength,
    pattern,
    disabledReasons,
    ɵregisterControl: registerControl,
    ɵmarkTouched: markTouched,
    ɵmarkUntouched: markUntouched,
    ɵmarkDirty: markDirty,
    ɵmarkPristine: markPristine,
    ɵregisterValidator: registerValidator,
    ɵregisterSchemaErrorSource: registerSchemaErrorSource,
    ɵregisterStateBinding: registerStateBinding,
    ɵregisterDisabledReason: registerDisabledReason,
    ɵresetTrigger: resetTriggerCount.asReadonly(),
    ɵpath: path,
    __raw: readRaw,
    __setRaw: setRaw,
    __children: children,
    __resetTriggerCount: resetTriggerCount,
    __propagateDirty: propagateDirty,
    __propagateTouched: propagateTouched,
    __resetCascade: resetCascade,
    __bumpRevision: bumpRevision,
    __schemaErrorSources: schemaErrorSources,
    __schemaErrorRevision: schemaErrorRevision,
  };

  return field;
}

function createTreeProxy<T>(internals: CraftFieldInternals<T>): CraftFieldTree<T> {
  const proxy = new Proxy(internals as unknown as object, {
    get(_target, prop, receiver) {
      if (typeof prop === 'symbol') {
        if (prop === FIELD_INTERNALS_TOKEN) return internals;
        return Reflect.get(internals as object, prop, receiver);
      }
      if (prop in internals) {
        return (internals as unknown as Record<string, unknown>)[prop];
      }
      const widenedInternals = internals as CraftFieldInternals<unknown>;
      // Array-like: support `length` and `item(index)`
      if (prop === 'item') {
        return (index: number) => getOrCreateChild(widenedInternals, index);
      }
      if (prop === 'length') {
        return computed(() => {
          const v = internals.value();
          return Array.isArray(v) ? v.length : 0;
        });
      }
      // Numeric index -> array child
      if (/^\d+$/.test(prop)) {
        return getOrCreateChild(widenedInternals, Number(prop));
      }
      // Otherwise treat as object property child
      return getOrCreateChild(widenedInternals, prop);
    },
    has(_target, prop) {
      if (typeof prop === 'symbol') return prop === FIELD_INTERNALS_TOKEN;
      if (prop in internals) return true;
      return true;
    },
    ownKeys() {
      return Reflect.ownKeys(internals);
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(internals, prop);
    },
  });

  return proxy as CraftFieldTree<T>;
}

function getOrCreateChild(
  parent: CraftFieldInternals<unknown>,
  segment: string | number,
): CraftFieldTree<unknown> {
  const existing = parent.__children.get(segment);
  if (existing) {
    return (existing as unknown as { __proxy: CraftFieldTree<unknown> }).__proxy;
  }

  const link: ParentLink<unknown, unknown> = {
    parent,
    segment,
    read: (p: unknown) => readAtSegment(p, segment),
    write: (p: unknown, next: unknown) => writeAtSegment(p, segment, next),
  };

  const childInternals = createCraftFieldInternals<unknown>({
    kind: 'child',
    link,
    path: [...parent.ɵpath, segment],
  });
  parent.__children.set(segment, childInternals);
  const childProxy = createTreeProxy(childInternals);
  (childInternals as unknown as { __proxy: CraftFieldTree<unknown> }).__proxy = childProxy;
  // Notify parent so its computed `errors`/`pending`/`valid` re-evaluate and
  // pick up the newly-added child.
  parent.__bumpRevision();
  return childProxy;
}

/**
 * Create a Craft field tree from an external mutable backing store.
 * Used by `insertForm` to bridge the Craft `state()` signal into the field tree.
 */
export function createCraftFieldTree<T>(backing: FieldRootBackingStore<T>): CraftFieldTree<T> {
  const internals = createCraftFieldInternals<T>({
    kind: 'root',
    backing,
    path: [],
  });
  const proxy = createTreeProxy(internals);
  (internals as unknown as { __proxy: CraftFieldTree<T> }).__proxy = proxy;
  return proxy;
}

/**
 * Create a Craft field tree backed by a writable signal (convenience for tests / standalone usage).
 */
export function craftField<T>(initial: T | WritableSignal<T> | Signal<T>): CraftFieldTree<T> {
  if (isSignal(initial) && typeof (initial as WritableSignal<T>).set === 'function') {
    const s = initial as WritableSignal<T>;
    return createCraftFieldTree<T>({
      read: () => s(),
      set: (next) => s.set(next),
      asReadonly: () => s.asReadonly(),
    });
  }
  if (isSignal(initial)) {
    const s = initial as Signal<T>;
    return createCraftFieldTree<T>({
      read: () => s(),
      set: () => {
        throw new Error('craftField: cannot set on a readonly signal source.');
      },
      asReadonly: () => s,
    });
  }
  const s = signal(initial as T);
  return createCraftFieldTree<T>({
    read: () => s(),
    set: (next) => s.set(next),
    asReadonly: () => s.asReadonly(),
  });
}

/** @internal */
export function ɵgetCraftFieldInternals<T>(field: CraftField<T>): CraftFieldInternals<T> {
  return (field as unknown as Record<symbol, CraftFieldInternals<T>>)[FIELD_INTERNALS_TOKEN] ?? (field as unknown as CraftFieldInternals<T>);
}

/**
 * @internal
 * Create (or return a cached) child field whose value is **derived** from the
 * parent via an arbitrary lens (read + write functions), rather than indexed
 * by an object key or array index.
 *
 * The returned child plugs into the same `ParentLink` machinery used for
 * structural children, so dirty/touched/disabled/hidden/validation/reset
 * cascades work exactly the same way.
 *
 * Two calls with the same `name` on the same parent return the same child
 * instance — the lens passed on the first call wins.
 */
export function ɵgetOrCreateDerivedChild<Source, Sub>(
  parent: CraftField<Source>,
  name: string,
  lens: { read: (s: Source) => Sub; write: (s: Source, next: Sub) => Source },
): CraftFieldTree<Sub> {
  const parentInternals = ɵgetCraftFieldInternals(parent) as CraftFieldInternals<Source>;
  const existing = parentInternals.__children.get(name);
  if (existing) {
    return (existing as unknown as { __proxy: CraftFieldTree<Sub> }).__proxy;
  }

  const link: ParentLink<Source, Sub> = {
    parent: parentInternals,
    segment: name,
    read: lens.read,
    write: lens.write,
  };

  const childInternals = createCraftFieldInternals<Sub>({
    kind: 'child',
    link: link as unknown as ParentLink<unknown, Sub>,
    path: [...parentInternals.ɵpath, name],
  });
  parentInternals.__children.set(name, childInternals as CraftFieldInternals<unknown>);
  const childProxy = createTreeProxy(childInternals);
  (childInternals as unknown as { __proxy: CraftFieldTree<Sub> }).__proxy = childProxy;
  return childProxy;
}
