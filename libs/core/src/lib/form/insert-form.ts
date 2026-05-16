import {
  computed,
  inject,
  Injector,
  linkedSignal,
  Signal,
  untracked,
} from '@angular/core';
import { ɵcreateHostTaggedInjector } from '../craft-service';
import {
  InsertionStateFactoryContext,
  InsertionsStateFactory,
} from '../query.core';
import { createCraftFieldTree, CraftFieldTree } from './craft-field';
import {
  createFormExceptions,
  createSubmissionController,
  executeFormInsertions,
  validatedFormValueSymbol,
} from './insert-form-internals';
import type {
  FormWithInsertions,
  InsertionsFormFactory,
  ValidatedFormValue,
} from './insert-form-internals';

export { validatedFormValueSymbol } from './insert-form-internals';
export type {
  FormWithInsertions,
  InsertionFormFactoryContext,
  InsertionsFormFactory,
  ValidatedFormValue,
} from './insert-form-internals';

type ExtractItemType<T> = T extends readonly (infer Item)[] ? Item : never;

type InsertFormSimpleOutput<StateType, Insertions> = {
  form: FormWithInsertions<StateType, Insertions>;
};

type InsertFormParallelOutput<StateType, Insertions> = {
  forms: Signal<FormWithInsertions<ExtractItemType<StateType>, Insertions>[]>;
  select: (
    formIdentifier: string | number,
  ) => FormWithInsertions<ExtractItemType<StateType>, Insertions> | undefined;
};

type InsertFormSimpleReturn<StateType, Insertions, PreviousInsertionsOutputs> =
  InsertionsStateFactory<
    StateType,
    InsertFormSimpleOutput<StateType, Insertions>,
    PreviousInsertionsOutputs
  >;

type InsertFormParallelReturn<
  StateType,
  Insertions,
  PreviousInsertionsOutputs,
> = InsertionsStateFactory<
  StateType,
  InsertFormParallelOutput<StateType, Insertions>,
  PreviousInsertionsOutputs
>;

type ParallelInsertFormConfig<
  ItemType,
  GroupIdentifier extends string | number,
> = {
  identifier: (context: { item: ItemType; index: number }) => GroupIdentifier;
};

function isParallelInsertFormConfig(
  value: unknown,
): value is ParallelInsertFormConfig<unknown, string | number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'identifier' in value &&
    typeof (value as ParallelInsertFormConfig<unknown, string | number>)
      .identifier === 'function'
  );
}

function buildSimpleForm<Model>(
  context: InsertionStateFactoryContext<Model, Record<string, unknown>>,
  formInsertions: InsertionsFormFactory<
    Model,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[],
  inheritedInsertions: Record<string, unknown>,
  injector: Injector,
  formIdentifier: string | number | unknown,
): FormWithInsertions<Model, Record<string, unknown>> {
  const submission = createSubmissionController();
  const field = createCraftFieldTree<Model>({
    read: () => context.state(),
    set: (next: Model) => context.set(next),
    asReadonly: () => context.state,
  });

  const { rawInsertionsOutput, exposedInsertionsOutput } = executeFormInsertions(
    formInsertions,
    {
      field,
      state: context.state,
      submission,
      set: (newState: Model) => context.set(newState),
      update: (fn: (current: Model) => Model) => context.update(fn),
      patch: (fn: (current: Model) => Partial<Model>) =>
        context.patch(fn as (current: Model) => Partial<Model>),
      inheritedInsertions,
      injector,
      formIdentifier,
    },
  );

  const formExceptions = createFormExceptions(
    rawInsertionsOutput,
    exposedInsertionsOutput,
  );

  const validatedFormValue = computed<ValidatedFormValue<Model>>(() => {
    if (!field.valid()) return undefined;
    const value = field.value() as Model;
    if (value && typeof value === 'object') {
      return Object.assign(value as object, {
        [validatedFormValueSymbol]: true,
      }) as unknown as ValidatedFormValue<Model>;
    }
    return value as ValidatedFormValue<Model>;
  });

  // Merge insertion outputs onto the field tree proxy. We use a wrapping object
  // because the proxy's `set` trap doesn't store new properties on the target.
  // `Object.assign` would not work on the proxy, so we wrap.
  const merged = wrapFieldWithExtras<Model>(field, {
    ...exposedInsertionsOutput,
    ...formExceptions,
    hasAttemptedSubmit: submission.hasAttemptedSubmit,
    submitting: submission.submitting,
    validatedFormValue,
  });

  return merged as unknown as FormWithInsertions<Model, Record<string, unknown>>;
}

/**
 * Wraps a CraftFieldTree<T> in an outer Proxy that overlays a record of extras
 * (insertion outputs, submit signals, ...) on top. Property reads are checked
 * against the extras first, falling back to the field tree.
 */
function wrapFieldWithExtras<T>(
  field: CraftFieldTree<T>,
  extras: Record<string, unknown>,
): CraftFieldTree<T> {
  return new Proxy(field as unknown as object, {
    get(_target, prop, receiver) {
      if (typeof prop === 'string' && prop in extras) {
        return extras[prop];
      }
      return Reflect.get(field as object, prop, receiver);
    },
    has(_target, prop) {
      if (typeof prop === 'string' && prop in extras) return true;
      return prop in (field as object);
    },
    ownKeys() {
      return [
        ...new Set([
          ...Reflect.ownKeys(field as object),
          ...Object.keys(extras),
        ]),
      ];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'string' && prop in extras) {
        return {
          enumerable: true,
          configurable: true,
          value: extras[prop],
          writable: false,
        };
      }
      return Object.getOwnPropertyDescriptor(field, prop);
    },
  }) as unknown as CraftFieldTree<T>;
}

function findItemIndexByIdentifier<Item>(
  state: readonly Item[],
  formIdentifier: string | number,
  identifier: (context: { item: Item; index: number }) => string | number,
) {
  return state.findIndex((item, index) => {
    return identifier({ item, index }) === formIdentifier;
  });
}

// =====================================================================
//  Public API — overload signatures (simple mode)
// =====================================================================

export function insertForm<
  StateType,
  PreviousInsertionsOutputs = {},
>(): InsertFormSimpleReturn<StateType, {}, PreviousInsertionsOutputs>;
export function insertForm<
  StateType,
  Insertion1,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
): InsertFormSimpleReturn<StateType, Insertion1, PreviousInsertionsOutputs>;
export function insertForm<
  StateType,
  Insertion1,
  Insertion2,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
): InsertFormSimpleReturn<
  StateType,
  Insertion1 & Insertion2,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
): InsertFormSimpleReturn<
  StateType,
  Insertion1 & Insertion2 & Insertion3,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion4,
    PreviousInsertionsOutputs & Insertion1 & Insertion2 & Insertion3
  >,
): InsertFormSimpleReturn<
  StateType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion4,
    PreviousInsertionsOutputs & Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion5,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4
  >,
): InsertFormSimpleReturn<
  StateType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion4,
    PreviousInsertionsOutputs & Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion5,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4
  >,
  insertion6: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion6,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4 &
      Insertion5
  >,
): InsertFormSimpleReturn<
  StateType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion4,
    PreviousInsertionsOutputs & Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion5,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4
  >,
  insertion6: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion6,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4 &
      Insertion5
  >,
  insertion7: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion7,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4 &
      Insertion5 &
      Insertion6
  >,
): InsertFormSimpleReturn<
  StateType,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion8,
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion4,
    PreviousInsertionsOutputs & Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion5,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4
  >,
  insertion6: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion6,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4 &
      Insertion5
  >,
  insertion7: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion7,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4 &
      Insertion5 &
      Insertion6
  >,
  insertion8: InsertionsFormFactory<
    StateType,
    unknown,
    Insertion8,
    PreviousInsertionsOutputs &
      Insertion1 &
      Insertion2 &
      Insertion3 &
      Insertion4 &
      Insertion5 &
      Insertion6 &
      Insertion7
  >,
): InsertFormSimpleReturn<
  StateType,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7 &
    Insertion8,
  PreviousInsertionsOutputs
>;

// =====================================================================
//  Public API — overload signatures (parallel mode)
// =====================================================================

export function insertForm<
  StateType extends unknown[],
  GroupIdentifier extends string | number,
  PreviousInsertionsOutputs = {},
>(
  config: ParallelInsertFormConfig<ExtractItemType<StateType>, GroupIdentifier>,
): InsertFormParallelReturn<StateType, {}, PreviousInsertionsOutputs>;
export function insertForm<
  StateType extends unknown[],
  GroupIdentifier extends string | number,
  Insertion1,
  PreviousInsertionsOutputs = {},
>(
  config: ParallelInsertFormConfig<ExtractItemType<StateType>, GroupIdentifier>,
  insertion1: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
): InsertFormParallelReturn<StateType, Insertion1, PreviousInsertionsOutputs>;
export function insertForm<
  StateType extends unknown[],
  GroupIdentifier extends string | number,
  Insertion1,
  Insertion2,
  PreviousInsertionsOutputs = {},
>(
  config: ParallelInsertFormConfig<ExtractItemType<StateType>, GroupIdentifier>,
  insertion1: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
): InsertFormParallelReturn<
  StateType,
  Insertion1 & Insertion2,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType extends unknown[],
  GroupIdentifier extends string | number,
  Insertion1,
  Insertion2,
  Insertion3,
  PreviousInsertionsOutputs = {},
>(
  config: ParallelInsertFormConfig<ExtractItemType<StateType>, GroupIdentifier>,
  insertion1: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
): InsertFormParallelReturn<
  StateType,
  Insertion1 & Insertion2 & Insertion3,
  PreviousInsertionsOutputs
>;
export function insertForm<
  StateType extends unknown[],
  GroupIdentifier extends string | number,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  PreviousInsertionsOutputs = {},
>(
  config: ParallelInsertFormConfig<ExtractItemType<StateType>, GroupIdentifier>,
  insertion1: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion2,
    PreviousInsertionsOutputs & Insertion1
  >,
  insertion3: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion3,
    PreviousInsertionsOutputs & Insertion1 & Insertion2
  >,
  insertion4: InsertionsFormFactory<
    ExtractItemType<StateType>,
    GroupIdentifier,
    Insertion4,
    PreviousInsertionsOutputs & Insertion1 & Insertion2 & Insertion3
  >,
): InsertFormParallelReturn<
  StateType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  PreviousInsertionsOutputs
>;

// =====================================================================
//  Implementation
// =====================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function insertForm(...args: any[]): any {
  const hasParallelConfig = isParallelInsertFormConfig(args[0]);
  const parallelConfig = hasParallelConfig ? args[0] : undefined;
  const formInsertions = (
    hasParallelConfig ? args.slice(1) : args
  ) as InsertionsFormFactory<
    unknown,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[];

  return (
    context: InsertionStateFactoryContext<unknown, Record<string, unknown>>,
  ) => {
    const inheritedInsertions =
      (context.insertions as Record<string, unknown> | undefined) ?? {};
    const formInjector = ɵcreateHostTaggedInjector(inject(Injector), 'form');

    if (!parallelConfig) {
      const form = buildSimpleForm<unknown>(
        context,
        formInsertions,
        inheritedInsertions,
        formInjector,
        undefined,
      );
      return { form };
    }

    type ParallelEntry = {
      formIdentifier: string | number;
      form: FormWithInsertions<unknown, Record<string, unknown>>;
    };

    const formsByIdentifier = new Map<string | number, ParallelEntry>();
    const identifier = parallelConfig.identifier;

    const selectItem = (formIdentifier: string | number) => {
      const currentState = context.state();
      if (!Array.isArray(currentState)) return undefined;
      const index = findItemIndexByIdentifier(
        currentState,
        formIdentifier,
        identifier,
      );
      if (index === -1) return undefined;
      return currentState[index];
    };

    const setItem = (formIdentifier: string | number, nextItem: unknown) => {
      context.update((currentState: unknown) => {
        if (!Array.isArray(currentState)) return currentState;
        const index = findItemIndexByIdentifier(
          currentState,
          formIdentifier,
          identifier,
        );
        if (index === -1) return currentState;
        const nextState = [...currentState];
        nextState[index] = nextItem;
        return nextState;
      });
      return nextItem;
    };

    const getOrCreateEntry = (formIdentifier: string | number): ParallelEntry => {
      const existing = formsByIdentifier.get(formIdentifier);
      if (existing) return existing;

      const itemState = linkedSignal(() => selectItem(formIdentifier));
      const itemContext: InsertionStateFactoryContext<
        unknown,
        Record<string, unknown>
      > = {
        state: itemState,
        set: (next: unknown) => setItem(formIdentifier, next),
        update: (fn: (curr: unknown) => unknown) => {
          const next = fn(selectItem(formIdentifier));
          setItem(formIdentifier, next);
          return next;
        },
        patch: (fn: (curr: unknown) => Partial<unknown>) => {
          const curr = selectItem(formIdentifier);
          const partial = fn(curr);
          const next =
            curr && typeof curr === 'object' && !Array.isArray(curr)
              ? { ...(curr as object), ...partial }
              : partial;
          setItem(formIdentifier, next);
          return next;
        },
        insertions: inheritedInsertions as Record<string, unknown> as never,
      };

      // Per-item tagged injector so DI inside this entry is scoped under
      // `form/<identifier>`, mirroring the pattern in `insertSelect`.
      const itemInjector = ɵcreateHostTaggedInjector(
        formInjector,
        `formItem:${formIdentifier}`,
      );

      // `buildSimpleForm` may create effects (e.g. via insertFormSubmit). When
      // `getOrCreateEntry` is invoked from within a reactive context (such as
      // the `linkedSignal` below), Angular forbids effect creation (NG0602).
      // We wrap construction in `untracked` to detach from the surrounding
      // reactive context.
      const form = untracked(() =>
        buildSimpleForm(
          itemContext,
          formInsertions,
          inheritedInsertions,
          itemInjector,
          formIdentifier,
        ),
      );
      const entry: ParallelEntry = { formIdentifier, form };
      formsByIdentifier.set(formIdentifier, entry);
      return entry;
    };

    const formsSignal = linkedSignal(() => {
      const currentState = context.state();
      if (!Array.isArray(currentState)) {
        formsByIdentifier.clear();
        return [] as ParallelEntry[];
      }

      const seen = new Set<string | number>();
      const entries = currentState.map((item, index) => {
        const id = identifier({ item, index });
        if (seen.has(id)) {
          throw new Error(
            `Duplicate form identifier "${String(id)}" in state.`,
          );
        }
        seen.add(id);
        return getOrCreateEntry(id);
      });

      for (const cachedId of formsByIdentifier.keys()) {
        if (!seen.has(cachedId)) formsByIdentifier.delete(cachedId);
      }

      return entries;
    });

    return {
      forms: computed(() => formsSignal().map((entry) => entry.form)),
      select: (formIdentifier: string | number) => {
        const selected = formsSignal().find(
          (entry) => entry.formIdentifier === formIdentifier,
        );
        return selected?.form;
      },
    };
  };
}
