import {
  computed,
  Injector,
  isSignal,
  runInInjectionContext,
  signal,
  Signal,
} from '@angular/core';
import { isGenerator, runCraftGenerator } from '../craft-generator-runtime';
import { injectFnWrapper } from '../fn-wrapper';
import { ɵcreateHostTaggedInjector } from '../craft-service';
import type { InsertionStateFactoryContext } from '../query.core';
import { Source$ as SourceDollarType } from '../source$';
import { MergeObject } from '../util/types/util.type';
import { FilterSource, IsEmptyObject } from '../util/util.type';
import { isSource } from '../util/util';
import { CraftField, CraftFieldTree } from './craft-field';

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

/**
 * The full type of a craft form, exposed by `insertForm`.
 *
 * It is a `CraftFieldTree<Model>` (with sub-field navigation) merged with all the
 * insertion outputs (e.g. submit, exceptions, validators) and aggregated exception signals.
 */
export type FormWithInsertions<Model, Insertions> = CraftFieldTree<Model> &
  ExposedFormInsertions<Insertions> & {
    hasAttemptedSubmit: Signal<boolean>;
    submitting: Signal<boolean>;
    validatedFormValue: Signal<ValidatedFormValue<Model>>;
  } & FormExceptionsInsertion<Insertions>;

export type InsertionFormFactoryContext<
  StateType,
  PreviousInsertionsOutputs,
  FormIdentifier extends string | number | unknown,
> = InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs> & {
  field: CraftFieldTree<StateType>;
  hasAttemptedSubmit: Signal<boolean>;
  submitting: Signal<boolean>;
  validatedFormValue: Signal<ValidatedFormValue<StateType>>;
  setAttemptedSubmit: () => void;
  setSubmitting: (submitting: boolean) => void;
  formIdentifier: FormIdentifier;
};

export type InsertionsFormFactory<
  State,
  FormIdentifier extends string | number | unknown,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
  Yielded = never,
> = (
  context: InsertionFormFactoryContext<
    State,
    PreviousInsertionsOutputs,
    FormIdentifier
  >,
) => InsertionsOutputs | Generator<Yielded, InsertionsOutputs, unknown>;

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

const FORM_INSERTION_METHOD_INVALID_YIELD_ERROR_MESSAGE =
  'form insertion method generators can only yield craftService dependencies or exposed dependency helpers.';
const FORM_INSERTION_METHOD_APP_START_ERROR_MESSAGE =
  'form insertion method generators do not support onAppStart(...).';

function createExposedInsertions(
  rawInsertionsOutput: Record<string, unknown>,
  injector: Injector,
): Record<string, unknown> {
  return Object.entries(rawInsertionsOutput).reduce(
    (acc, [key, value]) => {
      if (isSource(value)) return acc;
      if (isSource$(value)) {
        const localSource = value;
        acc[key] = (payload: unknown) => {
          localSource.emit(payload as never);
        };
        return acc;
      }
      if (typeof value === 'function' && !isSignal(value)) {
        const methodInjector = ɵcreateHostTaggedInjector(injector, `method:${key}`);
        const wrappedFn = runInInjectionContext(injector, () =>
          injectFnWrapper()(value as (...args: unknown[]) => unknown),
        );
        acc[key] = (...args: unknown[]) =>
          runInInjectionContext(methodInjector, () => {
            const result = (wrappedFn as (...a: unknown[]) => unknown)(...args);
            if (isGenerator(result)) {
              return runCraftGenerator({
                iterator: result,
                injector: methodInjector,
                hostScope: 'function',
                invalidYieldErrorMessage: FORM_INSERTION_METHOD_INVALID_YIELD_ERROR_MESSAGE,
                multipleAppStartErrorMessage: FORM_INSERTION_METHOD_APP_START_ERROR_MESSAGE,
                onAppStartNotSupportedErrorMessage: FORM_INSERTION_METHOD_APP_START_ERROR_MESSAGE,
              }).value;
            }
            return result;
          });
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


function toExceptionRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function createFormExceptions(
  rawInsertionsOutput: Record<string, unknown>,
  exposedInsertionsOutput: Record<string, unknown>,
) {
  const directHasExceptions = isSignal(
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
      if (!match || typeof value !== 'function') return [];

      const insertionName = toExceptionInsertionName(match[1]);
      const exceptionsKey = `${insertionName}Exceptions`;
      const exceptionSignal = exposedInsertionsOutput[exceptionsKey];
      if (typeof exceptionSignal !== 'function') return [];

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
  };
}

export type SubmissionController = {
  hasAttemptedSubmit: Signal<boolean>;
  submitting: Signal<boolean>;
  setAttemptedSubmit: () => void;
  setSubmitting: (submitting: boolean) => void;
  reset: () => void;
};

export function createSubmissionController(): SubmissionController {
  const attempted = signal(false);
  const submitting = signal(false);
  return {
    hasAttemptedSubmit: attempted.asReadonly(),
    submitting: submitting.asReadonly(),
    setAttemptedSubmit: () => attempted.set(true),
    setSubmitting: (next: boolean) => {
      if (next) attempted.set(true);
      submitting.set(next);
    },
    reset: () => {
      attempted.set(false);
      submitting.set(false);
    },
  };
}

/**
 * Wrap a CraftFieldTree with extra properties (insertion outputs, exception
 * aggregates, submission state) so the merged object behaves like a
 * `FormWithInsertions`. Used by sub-form builders.
 */
export function wrapSubFieldWithExtras<T>(
  subField: CraftFieldTree<T>,
  extras: Record<string, unknown>,
): CraftFieldTree<T> {
  return new Proxy(subField as unknown as object, {
    get(_target, prop, receiver) {
      if (typeof prop === 'string' && prop in extras) return extras[prop];
      return Reflect.get(subField as object, prop, receiver);
    },
    has(_target, prop) {
      if (typeof prop === 'string' && prop in extras) return true;
      return prop in (subField as object);
    },
    ownKeys() {
      return [
        ...new Set([
          ...Reflect.ownKeys(subField as object),
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
      return Object.getOwnPropertyDescriptor(subField, prop);
    },
  }) as unknown as CraftFieldTree<T>;
}

/**
 * Build a fully-decorated sub-form (field tree + insertion outputs + exception
 * aggregates) from a sub-field plus a state read/write pair. Used by both
 * `insertSelectFormTree` (structural sub-fields) and `insertSubFormField`
 * (derived sub-fields).
 */
export function buildSubForm<Sub>(options: {
  parentContext: InsertionFormFactoryContext<unknown, unknown, unknown>;
  subField: CraftFieldTree<Sub>;
  subState: () => Sub;
  setSub: (next: Sub) => void;
  insertions: InsertionsFormFactory<
    Sub,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[];
  injector: Injector;
}): FormWithInsertions<Sub, Record<string, unknown>> {
  const stateSignal = computed(() => options.subState() as Sub);

  const subContext = {
    state: stateSignal,
    set: (next: Sub) => {
      options.setSub(next);
      return next;
    },
    update: (fn: (curr: Sub) => Sub) => {
      const next = fn(options.subState());
      options.setSub(next);
      return next;
    },
    patch: (fn: (curr: Sub) => Partial<Sub>) => {
      const curr = options.subState();
      const partial = fn(curr);
      const next =
        curr && typeof curr === 'object' && !Array.isArray(curr)
          ? ({ ...(curr as object), ...partial } as Sub)
          : (partial as Sub);
      options.setSub(next);
      return next;
    },
    insertions: (options.parentContext.insertions ?? {}) as never,
  };

  const { rawInsertionsOutput, exposedInsertionsOutput } = executeFormInsertions(
    options.insertions,
    {
      field: options.subField,
      state: stateSignal,
      submission: {
        hasAttemptedSubmit: options.parentContext.hasAttemptedSubmit,
        submitting: options.parentContext.submitting,
        setAttemptedSubmit: options.parentContext.setAttemptedSubmit,
        setSubmitting: options.parentContext.setSubmitting,
        reset: () => {
          /* parent owns reset */
        },
      },
      set: subContext.set,
      update: subContext.update,
      patch: subContext.patch,
      inheritedInsertions: subContext.insertions as Record<string, unknown>,
      injector: options.injector,
      formIdentifier: options.parentContext.formIdentifier,
    },
  );

  const formExceptions = createFormExceptions(
    rawInsertionsOutput,
    exposedInsertionsOutput,
  );

  return wrapSubFieldWithExtras(options.subField, {
    ...exposedInsertionsOutput,
    ...formExceptions,
    hasAttemptedSubmit: options.parentContext.hasAttemptedSubmit,
    submitting: options.parentContext.submitting,
  }) as unknown as FormWithInsertions<Sub, Record<string, unknown>>;
}

export function executeFormInsertions<Model>(
  formInsertions: InsertionsFormFactory<
    Model,
    unknown,
    Record<string, unknown>,
    Record<string, unknown>
  >[],
  options: {
    field: CraftFieldTree<Model>;
    state: Signal<Model>;
    submission: SubmissionController;
    set: (newState: Model) => Model;
    update: (updateFn: (currentState: Model) => Model) => Model;
    patch: (patchFn: (currentState: Model) => Partial<Model>) => Model;
    inheritedInsertions: Record<string, unknown>;
    injector: Injector;
    formIdentifier: string | number | unknown;
  },
) {
  const validatedFormValue = computed<ValidatedFormValue<Model>>(() => {
    const fieldRoot = options.field as unknown as CraftField<Model>;
    if (!fieldRoot.valid()) return undefined;
    const value = fieldRoot.value();
    if (value && typeof value === 'object') {
      return Object.assign(value as object, {
        [validatedFormValueSymbol]: true,
      }) as ValidatedFormValue<Model>;
    }
    return value as ValidatedFormValue<Model>;
  });

const FORM_INSERTION_INVALID_YIELD_ERROR_MESSAGE =
  'insertSelectFormTree generators can only yield craftService dependencies or exposed dependency helpers.';
const FORM_INSERTION_APP_START_ERROR_MESSAGE =
  'insertSelectFormTree generators do not support onAppStart(...).';

  return formInsertions.reduce(
    (acc, insertion) => {
      const wrappedInsertion = runInInjectionContext(options.injector, () =>
        injectFnWrapper()(insertion),
      );
      const insertionCallResult = runInInjectionContext(options.injector, () =>
        wrappedInsertion({
          state: options.state,
          set: options.set,
          update: options.update,
          patch: options.patch,
          field: options.field,
          hasAttemptedSubmit: options.submission.hasAttemptedSubmit,
          submitting: options.submission.submitting,
          validatedFormValue,
          setAttemptedSubmit: options.submission.setAttemptedSubmit,
          setSubmitting: options.submission.setSubmitting,
          formIdentifier: options.formIdentifier!,
          insertions: {
            ...options.inheritedInsertions,
            ...acc.rawInsertionsOutput,
          },
        }),
      );
      const nextRawInsertions = (
        isGenerator(insertionCallResult)
          ? runInInjectionContext(options.injector, () =>
              runCraftGenerator({
                iterator: insertionCallResult,
                injector: options.injector,
                hostScope: 'function',
                invalidYieldErrorMessage: FORM_INSERTION_INVALID_YIELD_ERROR_MESSAGE,
                multipleAppStartErrorMessage: FORM_INSERTION_APP_START_ERROR_MESSAGE,
                onAppStartNotSupportedErrorMessage: FORM_INSERTION_APP_START_ERROR_MESSAGE,
              }).value,
            )
          : insertionCallResult
      ) as Record<string, unknown>;
      const nextExposedInsertions = createExposedInsertions(nextRawInsertions, options.injector);

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
