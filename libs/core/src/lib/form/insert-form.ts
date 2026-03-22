import {
  computed,
  inject,
  InjectionToken,
  Injector,
  linkedSignal,
  signal,
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
  registerArrayItemSchemaPaths,
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

type LazyPathSegment = string | number;
type BufferedLogicStore = {
  hidden: Array<(context: unknown) => unknown>;
  disabledReasons: Array<(context: unknown) => unknown>;
  readonly: Array<(context: unknown) => unknown>;
  syncErrors: Array<(context: unknown) => unknown>;
  asyncErrors: Array<(context: unknown) => unknown>;
  metadata: Map<unknown, Array<() => unknown>>;
};

function toLazyPathKey(path: readonly LazyPathSegment[]) {
  return JSON.stringify(path);
}

function readValueAtPath(value: unknown, path: readonly LazyPathSegment[]) {
  return path.reduce<unknown>((current, segment) => {
    if (current == null) {
      return undefined;
    }

    return (current as Record<string | number, unknown>)[segment];
  }, value);
}

function createSubmissionController<Model>() {
  const hasAttemptedSubmit = signal(false);
  const submitting = signal(false);
  let submitState:
    | Pick<WritableSignal<boolean>, 'set'>
    | undefined;
  let originalReset:
    | ((...args: unknown[]) => unknown)
    | undefined;

  return {
    hasAttemptedSubmit: hasAttemptedSubmit.asReadonly(),
    submitting: submitting.asReadonly(),
    setAttemptedSubmit: () => {
      hasAttemptedSubmit.set(true);
    },
    setSubmitting: (nextSubmitting: boolean) => {
      if (nextSubmitting) {
        hasAttemptedSubmit.set(true);
      }

      submitting.set(nextSubmitting);
      submitState?.set(nextSubmitting);
    },
    attachActualForm: (formRef: FieldTree<Model, string | number>) => {
      submitState = (formRef() as any).submitState.selfSubmitting as Pick<
        WritableSignal<boolean>,
        'set'
      >;
      originalReset = formRef().reset.bind(formRef()) as (
        ...args: unknown[]
      ) => unknown;

      //@ts-expect-error add hasAttemptedSubmit to formRef inner value, it is hard to do otherwise without loosing some fields
      formRef()['hasAttemptedSubmit'] = hasAttemptedSubmit.asReadonly();
      formRef()['reset'] = (...args: unknown[]) => {
        const result = originalReset?.(...args);
        hasAttemptedSubmit.set(false);
        return result;
      };
      submitState.set(submitting());
    },
  };
}

function createLazyFormTree<Model>(options: {
  model: Signal<Model>;
  hasAttemptedSubmit: Signal<boolean>;
  submitting: Signal<boolean>;
}) {
  let actualFormRef: FieldTree<Model, string | number> | undefined;
  const formProxyCache = new Map<string, FieldTree<unknown, string | number>>();
  const stateProxyCache = new Map<string, Record<string, unknown>>();
  const extras = new Map<string, Record<string, unknown>>();
  const logicBuffers = new Map<string, BufferedLogicStore>();
  const booleanSignalFallbacks = new Map<string, boolean>([
    ['hidden', false],
    ['disabled', false],
    ['readonly', false],
    ['pending', false],
    ['invalid', false],
    ['dirty', false],
    ['touched', false],
    ['valid', true],
  ]);

  const getExtras = (path: readonly LazyPathSegment[]) => {
    const pathKey = toLazyPathKey(path);
    if (!extras.has(pathKey)) {
      extras.set(pathKey, {});
    }

    return extras.get(pathKey)!;
  };

  const getLogicStore = (path: readonly LazyPathSegment[]) => {
    const pathKey = toLazyPathKey(path);
    if (!logicBuffers.has(pathKey)) {
      logicBuffers.set(pathKey, {
        hidden: [],
        disabledReasons: [],
        readonly: [],
        syncErrors: [],
        asyncErrors: [],
        metadata: new Map(),
      });
    }

    return logicBuffers.get(pathKey)!;
  };

  const resolveActualForm = (path: readonly LazyPathSegment[]) => {
    if (!actualFormRef) {
      return undefined;
    }

    return path.reduce<any>((current, segment) => {
      if (!current) {
        return undefined;
      }

      return current[segment as keyof typeof current];
    }, actualFormRef);
  };

  const resolveActualState = (path: readonly LazyPathSegment[]) => {
    const actualForm = resolveActualForm(path);
    return actualForm ? actualForm() : undefined;
  };

  const flushBufferedLogic = () => {
    for (const [pathKey, store] of logicBuffers.entries()) {
      const path = JSON.parse(pathKey) as LazyPathSegment[];
      const actualState = resolveActualState(path) as
        | {
            logicNode?: {
              logic: {
                hidden: { push: (logic: (context: unknown) => unknown) => void };
                disabledReasons: {
                  push: (logic: (context: unknown) => unknown) => void;
                };
                readonly: {
                  push: (logic: (context: unknown) => unknown) => void;
                };
                syncErrors: {
                  push: (logic: (context: unknown) => unknown) => void;
                };
                asyncErrors: {
                  push: (logic: (context: unknown) => unknown) => void;
                };
                getMetadata: (key: unknown) => {
                  push: (logic: () => unknown) => void;
                };
              };
            };
          }
        | undefined;

      if (!actualState?.logicNode) {
        continue;
      }

      for (const logic of store.hidden) {
        actualState.logicNode.logic.hidden.push(logic);
      }
      for (const logic of store.disabledReasons) {
        actualState.logicNode.logic.disabledReasons.push(logic);
      }
      for (const logic of store.readonly) {
        actualState.logicNode.logic.readonly.push(logic);
      }
      for (const logic of store.syncErrors) {
        actualState.logicNode.logic.syncErrors.push(logic);
      }
      for (const logic of store.asyncErrors) {
        actualState.logicNode.logic.asyncErrors.push(logic);
      }
      for (const [metadataKey, metadataEntries] of store.metadata.entries()) {
        for (const logic of metadataEntries) {
          actualState.logicNode.logic.getMetadata(metadataKey).push(logic);
        }
      }
    }
  };

  const createStateProxy = (path: readonly LazyPathSegment[]) => {
    const pathKey = toLazyPathKey(path);
    if (stateProxyCache.has(pathKey)) {
      return stateProxyCache.get(pathKey)!;
    }

    const stateProxy = new Proxy(
      {} as Record<string, unknown>,
      {
        get: (_target, property) => {
          if (typeof property !== 'string') {
            return undefined;
          }

          const extraValue = getExtras(path)[property];
          if (extraValue !== undefined) {
            return extraValue;
          }

          if (property === 'value') {
            return () => readValueAtPath(options.model(), path);
          }

          if (property === 'submitting') {
            return options.submitting;
          }

          if (property === 'hasAttemptedSubmit') {
            return options.hasAttemptedSubmit;
          }

          if (property === 'logicNode') {
            const store = getLogicStore(path);
            const pushBufferedLogic = (
              kind:
                | 'hidden'
                | 'disabledReasons'
                | 'readonly'
                | 'syncErrors'
                | 'asyncErrors',
              logic: (context: unknown) => unknown,
            ) => {
              const actualState = resolveActualState(path) as
                | {
                    logicNode?: {
                      logic: Record<
                        typeof kind,
                        { push: (value: (context: unknown) => unknown) => void }
                      >;
                    };
                  }
                | undefined;

              if (actualState?.logicNode) {
                actualState.logicNode.logic[kind].push(logic);
                return;
              }

              store[kind].push(logic);
            };

            return {
              logic: {
                hidden: {
                  push: (logic: (context: unknown) => unknown) =>
                    pushBufferedLogic('hidden', logic),
                },
                disabledReasons: {
                  push: (logic: (context: unknown) => unknown) =>
                    pushBufferedLogic('disabledReasons', logic),
                },
                readonly: {
                  push: (logic: (context: unknown) => unknown) =>
                    pushBufferedLogic('readonly', logic),
                },
                syncErrors: {
                  push: (logic: (context: unknown) => unknown) =>
                    pushBufferedLogic('syncErrors', logic),
                },
                asyncErrors: {
                  push: (logic: (context: unknown) => unknown) =>
                    pushBufferedLogic('asyncErrors', logic),
                },
                getMetadata: (key: unknown) => ({
                  push: (logic: () => unknown) => {
                    const actualState = resolveActualState(path) as
                      | {
                          logicNode?: {
                            logic: {
                              getMetadata: (metadataKey: unknown) => {
                                push: (value: () => unknown) => void;
                              };
                            };
                          };
                        }
                      | undefined;

                    if (actualState?.logicNode) {
                      actualState.logicNode.logic.getMetadata(key).push(logic);
                      return;
                    }

                    const metadataEntries = store.metadata.get(key) ?? [];
                    metadataEntries.push(logic);
                    store.metadata.set(key, metadataEntries);
                  },
                }),
              },
            };
          }

          const actualState = resolveActualState(path) as
            | Record<string, unknown>
            | undefined;
          const actualValue = actualState?.[property];
          if (actualValue !== undefined) {
            if (typeof actualValue === 'function') {
              return (...args: unknown[]) =>
                (actualValue as (...args: unknown[]) => unknown).apply(
                  actualState,
                  args,
                );
            }

            return actualValue;
          }

          if (booleanSignalFallbacks.has(property)) {
            return () => booleanSignalFallbacks.get(property);
          }

          return (...args: unknown[]) => {
            const nextActualState = resolveActualState(path) as
              | Record<string, unknown>
              | undefined;
            const nextActualValue = nextActualState?.[property];

            if (typeof nextActualValue === 'function') {
              return nextActualValue.apply(nextActualState, args);
            }

            return nextActualValue;
          };
        },
        set: (_target, property, value) => {
          if (typeof property !== 'string') {
            return false;
          }

          getExtras(path)[property] = value;
          return true;
        },
      },
    );

    stateProxyCache.set(pathKey, stateProxy);
    return stateProxy;
  };

  const createFormProxy = (path: readonly LazyPathSegment[]) => {
    const pathKey = toLazyPathKey(path);
    if (formProxyCache.has(pathKey)) {
      return formProxyCache.get(pathKey)!;
    }

    const formProxy = new Proxy(
      (() => createStateProxy(path)) as FieldTree<unknown, string | number>,
      {
        get: (_target, property) => {
          if (typeof property === 'symbol') {
            return undefined;
          }

          return createFormProxy([
            ...path,
            /^\d+$/.test(property) ? Number(property) : property,
          ]);
        },
        apply: () => createStateProxy(path),
      },
    ) as FieldTree<unknown, string | number>;

    formProxyCache.set(pathKey, formProxy);
    return formProxy;
  };

  return {
    form: createFormProxy([]) as FieldTree<Model, string | number>,
    attachActualForm: (formRef: FieldTree<Model, string | number>) => {
      actualFormRef = formRef;
      flushBufferedLogic();
    },
  };
}

function createConfiguredForm<Model>({
  model,
  formInsertions,
  state,
  validatorModelRef,
  set,
  update,
  patch,
  inheritedInsertions,
  injector,
  formIdentifier,
}: {
  model: WritableSignal<Model>;
  formInsertions: InsertionsFormFactory<
    Model,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[];
  state: Signal<Model>;
  validatorModelRef: Signal<Model>;
  set: (newState: Model) => Model;
  update: (updateFn: (currentState: Model) => Model) => Model;
  patch: (patchFn: (currentState: Model) => Partial<Model>) => Model;
  inheritedInsertions: Record<string, unknown>;
  injector: Injector;
  formIdentifier: string | number | unknown;
}) {
  const submissionController = createSubmissionController<Model>();
  const lazyForm = createLazyFormTree({
    model: model.asReadonly(),
    hasAttemptedSubmit: submissionController.hasAttemptedSubmit,
    submitting: submissionController.submitting,
  });
  let rawInsertionsOutput = {} as Record<string, unknown>;
  let exposedInsertionsOutput = {} as Record<string, unknown>;

  const formRef = form(model, (schemaPath) => {
    registerArrayItemSchemaPaths(model(), schemaPath);

    ({ rawInsertionsOutput, exposedInsertionsOutput } = executeFormInsertions(
      formInsertions,
      {
        formRef: lazyForm.form,
        schemaPath,
        setSubmitting: submissionController.setSubmitting,
        state,
        validatorModelRef,
        setAttemptedSubmit: submissionController.setAttemptedSubmit,
        set,
        update,
        patch,
        inheritedInsertions,
        injector,
        formIdentifier,
      },
    ));
  });

  submissionController.attachActualForm(formRef);
  lazyForm.attachActualForm(formRef);
  //@ts-expect-error add validatedFormValue to formRef inner value, it is hard to do otherwise without loosing some fields
  formRef()['validatedFormValue'] = computed(() =>
    formRef().valid()
      ? (Object.assign(formRef().value() as object, {
          [validatedFormValueSymbol]: true,
        }) as ValidatedFormValue<Model>)
      : undefined,
  );

  return {
    formRef,
    setSubmitting: submissionController.setSubmitting,
    rawInsertionsOutput,
    exposedInsertionsOutput,
  };
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
    Model,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[];
  setItem: (formIdentifier: string | number, nextItem: Model) => Model;
  formIdentifier: string | number;
  itemState: Signal<Model>;
  updateItem: (
    formIdentifier: string | number,
    updateFn: (currentItem: Model) => Model,
  ) => Model;
  inheritedInsertions: Record<string, unknown>;
  selectItem: (formIdentifier: string | number) => Model;
}) {
  const injector = Injector.create({
    providers: [
      {
        provide: FORM_INSTANCE_TOKEN,
        useFactory: () => {
          const { formRef, setSubmitting, rawInsertionsOutput, exposedInsertionsOutput } =
            createConfiguredForm({
              model,
              formInsertions,
              state: itemState,
              validatorModelRef: model.asReadonly(),
              set: (newState: Model) => setItem(formIdentifier, newState),
              update: (updateFn: (currentState: Model) => Model) =>
                updateItem(formIdentifier, updateFn),
              patch: (patchFn: (currentState: Model) => Partial<Model>) =>
                updateItem(
                  formIdentifier,
                  (current) =>
                    ({
                      ...(current as object),
                      ...patchFn(current),
                    }) as Model,
                ),
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
      const { formRef, rawInsertionsOutput, exposedInsertionsOutput } =
        createConfiguredForm({
          model,
          formInsertions,
          state: context.state,
          validatorModelRef: model.asReadonly(),
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
        hasAttemptedSubmit: Signal<boolean>;
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
          hasAttemptedSubmit: Signal<boolean>;
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
          return undefined;
        }

        return selectedEntry.form;
      },
    };
  };
}
