import { AbstractControl } from '@angular/forms';
import {
  computed,
  Injector,
  runInInjectionContext,
  Signal,
} from '@angular/core';
import {
  CompatFieldState,
  FieldState,
  FieldTree,
  MaybeFieldTree,
  ReadonlyArrayLike,
  Subfields,
} from '@angular/forms/signals';
import type { InsertionStateFactoryContext } from '../query.core';
import { Source$ as SourceDollarType } from '../source$';
import { MergeObject } from '../util/types/util.type';
import { FilterSource, IsEmptyObject } from '../util/util.type';
import { isSource } from '../util/util';

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
      };

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

function toExceptionInsertionName(name: string) {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

function isSignal<T>(value: unknown): value is Signal<T> {
  return typeof value === 'function';
}

function toExceptionRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function createFormExceptions(
  rawInsertionsOutput: Record<string, unknown>,
  exposedInsertionsOutput: Record<string, unknown>,
) {
  const directHasExceptions = isSignal<boolean>(
    exposedInsertionsOutput['hasExceptions'],
  )
    ? (exposedInsertionsOutput['hasExceptions'] as Signal<boolean>)
    : undefined;
  const directExceptions = isSignal(exposedInsertionsOutput['exceptions'])
    ? (exposedInsertionsOutput['exceptions'] as Signal<unknown>)
    : undefined;
  const exceptionInsertions = Object.entries(exposedInsertionsOutput).flatMap(
    ([key, value]) => {
      const match = /^has(.+)Exceptions$/.exec(key);
      if (!match || typeof value !== 'function') {
        return [];
      }

      const insertionName = toExceptionInsertionName(match[1]);
      const exceptionsKey = `${insertionName}Exceptions`;
      const exceptionSignal = exposedInsertionsOutput[exceptionsKey];

      if (typeof exceptionSignal !== 'function') {
        return [];
      }

      return [
        {
          insertionName,
          hasExceptionSignal: value as Signal<boolean>,
          exceptionSignal: exceptionSignal as Signal<unknown>,
        },
      ];
    },
  );

  if (
    exceptionInsertions.length === 0 &&
    !directHasExceptions &&
    !directExceptions
  ) {
    return {};
  }

  return {
    hasExceptions: computed(
      () =>
        (directHasExceptions?.() ?? false) ||
        exceptionInsertions.some(({ hasExceptionSignal }) =>
          hasExceptionSignal(),
        ),
    ),
    exceptions: computed(() =>
      exceptionInsertions.reduce(
        (acc, { insertionName, exceptionSignal }) => {
          acc[insertionName] = exceptionSignal();
          return acc;
        },
        {
          ...toExceptionRecord(directExceptions?.()),
        },
      ),
    ),
    i: rawInsertionsOutput,
  };
}

export function executeFormInsertions<Model>(
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
    patch: (patchFn: (currentState: Model) => Partial<Model>) => Model;
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
          patch: options.patch,
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

export function decorateFormTreeWithInsertions<Model>({
  formRef,
  formInsertions,
  state,
  set,
  update,
  patch,
  setSubmitting,
  inheritedInsertions,
  injector,
  formIdentifier,
}: {
  formRef: FieldTree<Model, string | number>;
  formInsertions: InsertionsFormFactory<
    Model,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[];
  state: Signal<Model>;
  set: (newState: Model) => Model;
  update: (updateFn: (currentState: Model) => Model) => Model;
  patch: (patchFn: (currentState: Model) => Partial<Model>) => Model;
  setSubmitting: (submitting: boolean) => void;
  inheritedInsertions: Record<string, unknown>;
  injector: Injector;
  formIdentifier: string | number | unknown;
}) {
  //@ts-expect-error add validatedFormValue to selected formRef inner value, it is hard to do otherwise without loosing some fields
  formRef()['validatedFormValue'] = computed(() =>
    formRef().valid()
      ? (Object.assign(formRef().value() as object, {
          [validatedFormValueSymbol]: true,
        }) as ValidatedFormValue<Model>)
      : undefined,
  );

  const { rawInsertionsOutput, exposedInsertionsOutput } =
    executeFormInsertions(formInsertions, {
      formRef,
      state,
      set,
      update,
      patch,
      setSubmitting,
      inheritedInsertions,
      injector,
      formIdentifier,
    });

  const extraFields = {
    ...exposedInsertionsOutput,
    ...createFormExceptions(rawInsertionsOutput, exposedInsertionsOutput),
  };

  for (const key in extraFields) {
    //@ts-expect-error add extra fields to formRef inner value, it is hard to do otherwise without loosing some fields
    formRef()[key] = extraFields[key];
  }

  return formRef;
}
