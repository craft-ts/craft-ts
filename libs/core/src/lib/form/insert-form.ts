import {
  computed,
  inject,
  InjectionToken,
  Injector,
  linkedSignal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { FieldTree, form } from '@angular/forms/signals';
import {
  InsertionStateFactoryContext,
  InsertionsStateFactory,
} from '../query.core';
import {
  createFormExceptions,
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
  forms: Signal<FieldTree<ExtractItemType<StateType>, string | number>[]>;
  select: (
    formIdentifier: string | number,
  ) => FormWithInsertions<ExtractItemType<StateType>, Insertions>;
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

const FORM_INSTANCE_TOKEN = new InjectionToken<
  FieldTree<unknown, string | number>
>(
  'Injection token used to provide a dynamically created signal form instance.',
);

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

function createDynamicSignalForm<Model>({
  parentInjector,
  model,
  formInsertions,
  setItem,
  formIdentifier,
  itemState,
  updateItem,
  inheritedInsertions,
  selectItem,
}: {
  parentInjector: Injector;
  model: WritableSignal<Model>;
  formInsertions: InsertionsFormFactory<
    unknown,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[];
  setItem: (formIdentifier: string | number, nextItem: unknown) => unknown;
  formIdentifier: string | number;
  itemState: Signal<unknown>;
  updateItem: (
    formIdentifier: string | number,
    updateFn: (currentItem: unknown) => unknown,
  ) => unknown;
  inheritedInsertions: Record<string, unknown>;
  selectItem: (formIdentifier: string | number) => any;
}) {
  const injector = Injector.create({
    providers: [
      {
        provide: FORM_INSTANCE_TOKEN,
        useFactory: () => {
          const formRef = form(model);
          //@ts-expect-error add validatedFormValue to formRef inner value, it is hard to do otherwise without loosing some fields
          formRef()['validatedFormValue'] = computed(() =>
            formRef().valid()
              ? (Object.assign(formRef().value() as object, {
                  [validatedFormValueSymbol]: true,
                }) as ValidatedFormValue<Model>)
              : undefined,
          );
          const setSubmitting = (formRef() as any).submitState.selfSubmitting
            .set;

          const { rawInsertionsOutput, exposedInsertionsOutput } =
            executeFormInsertions(formInsertions, {
              formRef,
              setSubmitting,
              state: itemState,
              set: (newState: unknown) => setItem(formIdentifier, newState),
              update: (updateFn: (currentState: unknown) => unknown) =>
                updateItem(formIdentifier, updateFn),
              patch: (patchFn: (currentState: unknown) => Partial<unknown>) =>
                updateItem(formIdentifier, (current) => ({
                  ...(current as object),
                  ...patchFn(current),
                })),
              inheritedInsertions,
              injector,
              formIdentifier,
            });

          const extraFields = {
            ...exposedInsertionsOutput,
            ...createFormExceptions(
              rawInsertionsOutput,
              exposedInsertionsOutput,
            ),
          };

          for (const key in extraFields) {
            //@ts-expect-error add extra fields to formRef inner value, it is hard to do otherwise without loosing some fields
            formRef()[key] = extraFields[key];
          }

          // when a form is created with this helper, setSubmitting/selfSubmitting can not be set externally. So expose it here
          return {
            formRef,
            setSubmitting,
          };
        },
      },
    ],
    parent: parentInjector,
  });

  return injector.get(FORM_INSTANCE_TOKEN) as unknown as {
    formRef: FieldTree<Model, string | number>;
    setSubmitting: (submitting: boolean) => void;
  };
}

function createModelAdapter<Model>(options: {
  read: () => Model;
  set: (newState: Model) => Model;
  update: (updateFn: (currentState: Model) => Model) => Model;
  asReadonly: () => Signal<Model>;
}) {
  return Object.assign(() => options.read(), {
    set: options.set,
    update: options.update,
    asReadonly: options.asReadonly,
  }) as unknown as WritableSignal<Model>;
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
    const injector = inject(Injector);

    if (!parallelConfig) {
      const model = createModelAdapter({
        read: () => context.state(),
        set: (newState: unknown) => context.set(newState),
        update: (updateFn: (currentState: unknown) => unknown) =>
          context.update(updateFn),
        asReadonly: () => context.state,
      });
      const formRef = form(model);
      //@ts-expect-error add validatedFormValue to formRef inner value, it is hard to do otherwise without loosing some fields
      formRef()['validatedFormValue'] = computed(() =>
        formRef().valid()
          ? (Object.assign(formRef().value() as object, {
              [validatedFormValueSymbol]: true,
            }) as ValidatedFormValue<unknown>)
          : undefined,
      );
      const setSubmitting = (formRef() as any).submitState.selfSubmitting;
      const { rawInsertionsOutput, exposedInsertionsOutput } =
        executeFormInsertions(formInsertions, {
          formRef,
          setSubmitting: (submitting: boolean) => setSubmitting.set(submitting),
          state: context.state,
          set: (newState: unknown) => context.set(newState),
          update: (updateFn: (currentState: unknown) => unknown) =>
            context.update(updateFn),
          patch: (patchFn: (currentState: unknown) => Partial<unknown>) =>
            context.patch(patchFn as any),
          inheritedInsertions,
          injector,
          formIdentifier: undefined,
        });

      const extraFields = {
        ...exposedInsertionsOutput,
        ...createFormExceptions(rawInsertionsOutput, exposedInsertionsOutput),
      };

      for (const key in extraFields) {
        //@ts-expect-error add extra fields to formRef inner value, it is hard to do otherwise without loosing some fields
        formRef()[key] = extraFields[key];
      }

      return {
        form: formRef,
      };
    }

    type ParallelEntry = {
      formIdentifier: string | number;
      form: FieldTree<unknown, string | number> & {
        validatedFormValue: Signal<ValidatedFormValue<unknown>>;
      };
    };

    const formsByIdentifier = new Map<string | number, ParallelEntry>();
    const identifier = parallelConfig.identifier;
    const selectItem = (formIdentifier: string | number) => {
      const currentState = context.state();
      if (!Array.isArray(currentState)) {
        return undefined;
      }

      const index = findItemIndexByIdentifier(
        currentState,
        formIdentifier,
        identifier,
      );
      if (index === -1) {
        return undefined;
      }

      return currentState[index];
    };

    const setItem = (formIdentifier: string | number, nextItem: unknown) => {
      context.update((currentState: unknown) => {
        if (!Array.isArray(currentState)) {
          return currentState;
        }

        const index = findItemIndexByIdentifier(
          currentState,
          formIdentifier,
          identifier,
        );
        if (index === -1) {
          return currentState;
        }

        const nextState = [...currentState];
        nextState[index] = nextItem;
        return nextState;
      });

      return nextItem;
    };

    const updateItem = (
      formIdentifier: string | number,
      updateFn: (currentItem: unknown) => unknown,
    ) => {
      const nextItem = updateFn(selectItem(formIdentifier));
      setItem(formIdentifier, nextItem);
      return nextItem;
    };

    const getOrCreateEntry = (
      formIdentifier: string | number,
    ): ParallelEntry => {
      const existingEntry = formsByIdentifier.get(formIdentifier);
      if (existingEntry) {
        return existingEntry;
      }

      const itemState = linkedSignal(() => selectItem(formIdentifier));
      const model = createModelAdapter({
        read: () => selectItem(formIdentifier),
        set: (nextItem: unknown) => setItem(formIdentifier, nextItem),
        update: (updateFn: (currentItem: unknown) => unknown) =>
          updateItem(formIdentifier, updateFn),
        asReadonly: () => itemState,
      });
      const { formRef } = createDynamicSignalForm({
        parentInjector: injector,
        model,
        formInsertions,
        setItem,
        formIdentifier,
        itemState,
        updateItem,
        inheritedInsertions,
        selectItem,
      });

      const entry: ParallelEntry = {
        formIdentifier,
        form: formRef as unknown as FieldTree<unknown, string | number> & {
          validatedFormValue: Signal<ValidatedFormValue<unknown>>;
        },
      };
      formsByIdentifier.set(formIdentifier, entry);
      return entry;
    };

    const formsSignal = linkedSignal(() => {
      const currentState = context.state();
      if (!Array.isArray(currentState)) {
        formsByIdentifier.clear();
        return [] as ParallelEntry[];
      }

      const seenIdentifiers = new Set<string | number>();
      const entries = currentState.map((item, index) => {
        const formIdentifier = identifier({ item, index });
        if (seenIdentifiers.has(formIdentifier)) {
          throw new Error(
            `Duplicate form identifier "${String(formIdentifier)}" in state.`,
          );
        }
        seenIdentifiers.add(formIdentifier);
        return getOrCreateEntry(formIdentifier);
      });

      for (const cachedIdentifier of formsByIdentifier.keys()) {
        if (!seenIdentifiers.has(cachedIdentifier)) {
          formsByIdentifier.delete(cachedIdentifier);
        }
      }

      return entries;
    });

    return {
      forms: computed(() => formsSignal().map((entry) => entry.form)),
      select: (formIdentifier: string | number) => {
        const selectedEntry = formsSignal().find((entry) => {
          return entry.formIdentifier === formIdentifier;
        });

        if (!selectedEntry) {
          throw new Error(`Form with identifier ${formIdentifier} not found`);
        }

        return selectedEntry.form;
      },
    };
  };
}
