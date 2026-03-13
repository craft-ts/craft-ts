import {
  computed,
  inject,
  InjectionToken,
  Injector,
  linkedSignal,
  runInInjectionContext,
  Signal,
  WritableSignal,
} from '@angular/core';
import {
  CompatFieldState,
  FieldState,
  FieldTree,
  form,
  MaybeFieldTree,
  ReadonlyArrayLike,
  Subfields,
} from '@angular/forms/signals';
import {
  InsertionStateFactoryContext,
  InsertionsStateFactory,
} from '../query.core';
import { Source$ as SourceDollarType } from '../source$';
import { MergeObject } from '../util/types/util.type';
import { FilterSource, IsEmptyObject } from '../util/util.type';
import { isSource } from '../util/util';
import { AbstractControl } from '@angular/forms';

type Source$Method<SourceType> = [SourceType] extends [void]
  ? () => void
  : (value: SourceType) => void;

type ExposedFormInsertions<Insertions> = MergeObject<
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>,
  {
    [K in keyof FilterSource<Insertions> as FilterSource<Insertions>[K] extends SourceDollarType<any>
      ? K
      : never]: FilterSource<Insertions>[K] extends SourceDollarType<
      infer SourceType
    >
      ? Source$Method<SourceType>
      : never;
  }
>;

type FormExceptionSignal<
  Insertions,
  ExceptionName extends string,
> = `${Uncapitalize<ExceptionName>}Exceptions` extends keyof ExposedFormInsertions<Insertions>
  ? ExposedFormInsertions<Insertions>[`${Uncapitalize<ExceptionName>}Exceptions`] extends Signal<
      infer Exceptions
    >
    ? Exceptions
    : never
  : never;

type HasFormExceptionSignalPair<
  Insertions,
  ExceptionName extends string,
  HasExceptionKey extends keyof ExposedFormInsertions<Insertions>,
> =
  ExposedFormInsertions<Insertions>[HasExceptionKey] extends Signal<boolean>
    ? `${Uncapitalize<ExceptionName>}Exceptions` extends keyof ExposedFormInsertions<Insertions>
      ? ExposedFormInsertions<Insertions>[`${Uncapitalize<ExceptionName>}Exceptions`] extends Signal<unknown>
        ? true
        : false
      : false
    : false;

type FormExceptionMap<Insertions> = {
  [K in keyof ExposedFormInsertions<Insertions> as K extends string
    ? K extends `has${infer Name}Exceptions`
      ? HasFormExceptionSignalPair<Insertions, Name, K> extends true
        ? Uncapitalize<Name>
        : never
      : never
    : never]: K extends `has${infer Name}Exceptions`
    ? FormExceptionSignal<Insertions, Name>
    : never;
};

type FormExceptionsInsertion<Insertions> =
  keyof FormExceptionMap<Insertions> extends never
    ? {}
    : {
        hasExceptions: Signal<boolean>;
        exceptions: Signal<FormExceptionMap<Insertions>>;
        i: Insertions;
      };

type ExtractItemType<T> = T extends readonly (infer Item)[] ? Item : never;

type CraftFieldTree<
  TModel,
  Insertions,
  TKey extends string | number = string | number,
> = (() => [TModel] extends [AbstractControl]
  ? CompatFieldState<TModel, TKey> & Insertions
  : FieldState<TModel, TKey> & Insertions) &
  ([TModel] extends [AbstractControl]
    ? object
    : [TModel] extends [ReadonlyArray<infer U>]
      ? ReadonlyArrayLike<MaybeFieldTree<U, number>>
      : TModel extends Record<string, any>
        ? Subfields<TModel>
        : object);

export type FormWithInsertions<Model, Insertions> = CraftFieldTree<
  Model,
  ExposedFormInsertions<Insertions> & {
    validatedFormValue: Signal<ValidatedFormValue<Model>>;
  } & FormExceptionsInsertion<Insertions>,
  string | number
>;

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

export type InsertionFormFactoryContext<
  StateType,
  PreviousInsertionsOutputs,
  FormIdentifier extends string | number | unknown,
> = InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs> & {
  form: FieldTree<StateType, string | number>;
  validatedFormValue: Signal<ValidatedFormValue<StateType>>;
  setSubmitting: (submitting: boolean) => void;
  formIdentifier: FormIdentifier;
};

export type InsertionsFormFactory<
  State,
  FormIdentifier extends string | number | unknown,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionFormFactoryContext<
    State,
    PreviousInsertionsOutputs,
    FormIdentifier
  >,
) => InsertionsOutputs;

export const validatedFormValueSymbol = Symbol('validatedFormValue');
export type ValidatedFormValue<FormValue> =
  | (FormValue & {
      [validatedFormValueSymbol]: true;
    })
  | undefined;

const FORM_INSTANCE_TOKEN = new InjectionToken<
  FieldTree<unknown, string | number>
>(
  'Injection token used to provide a dynamically created signal form instance.',
);

function isSource$(value: unknown): value is SourceDollarType<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'emit' in value &&
    typeof (value as SourceDollarType<unknown>).emit === 'function' &&
    'subscribe' in value &&
    typeof (value as SourceDollarType<unknown>).subscribe === 'function'
  );
}

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

function createDynamicSignalForm<Model>(
  parentInjector: Injector,
  model: WritableSignal<Model>,
) {
  const injector = Injector.create({
    providers: [
      {
        provide: FORM_INSTANCE_TOKEN,
        useFactory: () => {
          const formRef = form(model);
          const setSubmitting = (formRef() as any).submitState.selfSubmitting;

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

function createExposedInsertions(
  rawInsertionsOutput: Record<string, unknown>,
): Record<string, unknown> {
  return Object.entries(rawInsertionsOutput).reduce(
    (acc, [key, value]) => {
      if (isSource(value)) {
        return acc;
      }

      if (isSource$(value)) {
        const localSource = value;
        acc[key] = (payload: unknown) => {
          localSource.emit(payload as never);
        };
        return acc;
      }

      acc[key] = value;
      return acc;
    },
    {} as Record<string, unknown>,
  );
}

function executeFormInsertions<Model>(
  formInsertions: InsertionsFormFactory<
    Model,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[],
  options: {
    formRef: FieldTree<Model, string | number>;
    state: Signal<Model>;
    set: (newState: Model) => Model;
    update: (updateFn: (currentState: Model) => Model) => Model;
    setSubmitting: (submitting: boolean) => void;
    inheritedInsertions: Record<string, unknown>;
    injector: Injector;
    formIdentifier?: string | number | unknown;
  },
) {
  return formInsertions.reduce(
    (acc, insertion) => {
      const nextRawInsertions = runInInjectionContext(options.injector, () =>
        insertion({
          state: options.state,
          set: options.set,
          update: options.update,
          form: options.formRef,
          validatedFormValue: computed(() =>
            options.formRef().valid()
              ? (Object.assign(options.formRef().value() as object, {
                  [validatedFormValueSymbol]: true,
                }) as ValidatedFormValue<Model>)
              : undefined,
          ),
          setSubmitting: options.setSubmitting,
          formIdentifier: options.formIdentifier!,
          insertions: {
            ...options.inheritedInsertions,
            ...acc.rawInsertionsOutput,
          },
        }),
      ) as Record<string, unknown>;
      const nextExposedInsertions = createExposedInsertions(nextRawInsertions);

      return {
        rawInsertionsOutput: {
          ...acc.rawInsertionsOutput,
          ...nextRawInsertions,
        },
        exposedInsertionsOutput: {
          ...acc.exposedInsertionsOutput,
          ...nextExposedInsertions,
        },
      };
    },
    {
      rawInsertionsOutput: {} as Record<string, unknown>,
      exposedInsertionsOutput: {} as Record<string, unknown>,
    },
  );
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
      const setSubmitting = (formRef() as any).submitState.selfSubmitting;
      const { exposedInsertionsOutput } = executeFormInsertions(
        formInsertions,
        {
          formRef,
          setSubmitting: (submitting: boolean) => setSubmitting.set(submitting),
          state: context.state,
          set: (newState: unknown) => context.set(newState),
          update: (updateFn: (currentState: unknown) => unknown) =>
            context.update(updateFn),
          inheritedInsertions,
          injector,
          formIdentifier: () => undefined,
        },
      );

      const extraFields = {
        ...exposedInsertionsOutput,
        validatedFormValue: computed(() =>
          formRef().valid()
            ? (Object.assign(formRef().value() as object, {
                [validatedFormValueSymbol]: true,
              }) as ValidatedFormValue<unknown>)
            : undefined,
        ),
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
      const { formRef, setSubmitting } = createDynamicSignalForm(
        injector,
        model,
      );

      const { exposedInsertionsOutput } = executeFormInsertions(
        formInsertions,
        {
          formRef,
          setSubmitting,
          state: itemState,
          set: (newState: unknown) => setItem(formIdentifier, newState),
          update: (updateFn: (currentState: unknown) => unknown) =>
            updateItem(formIdentifier, updateFn),
          inheritedInsertions,
          injector,
          formIdentifier,
        },
      );

      const extraFields = {
        ...exposedInsertionsOutput,
        validatedFormValue: computed(() =>
          formRef().valid()
            ? (selectItem(formIdentifier) as ValidatedFormValue<unknown>)
            : undefined,
        ),
      };

      for (const key in extraFields) {
        //@ts-expect-error add extra fields to formRef inner value, it is hard to do otherwise without loosing some fields
        formRef()[key] = extraFields[key];
      }

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
