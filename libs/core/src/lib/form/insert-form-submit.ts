import { computed, effect, Signal, untracked } from '@angular/core';
import {
  AnyCraftException,
  ExcludeByCode,
  ExtractCodeFromCraftResultUnion,
  InsertMetaInCraftExceptionIfExists,
} from '../craft-exception';
import {
  ResourceByIdLikeMutationRef,
  ResourceLikeMutationRef,
} from '../mutation';
import { ResourceExceptionConstraints } from '../query.core';
import { MergeObjects } from '../util/util.type';
import {
  FormWithInsertions,
  InsertionsFormFactory,
  ValidatedFormValue,
} from './insert-form-internals';

type SubmitExceptionUnion<SubmitCraftResource> = SubmitCraftResource extends {
  exceptions: Signal<{ list: (infer ExceptionList)[] }>;
}
  ? ExceptionList
  : AnyCraftException;

type SubmitContext<
  FormValue,
  MutationValue,
  MutationParams,
  MutationArgParams,
  MutationSourceParams,
  MutationInsertions,
  MutationExceptions extends ResourceExceptionConstraints,
  SubmitCraftResource = ResourceLikeMutationRef<
    MutationValue,
    MutationParams,
    true,
    MutationArgParams,
    MutationSourceParams,
    MutationInsertions,
    MutationExceptions
  >,
  SubmitExceptions = ExtractCodeFromCraftResultUnion<
    SubmitExceptionUnion<SubmitCraftResource>
  >,
> = {
  submitCraftResource: SubmitCraftResource;
  form: FormWithInsertions<FormValue, {}>;
  exceptions: SubmitExceptionUnion<SubmitCraftResource>;
  omitExceptions: <C extends SubmitExceptions>(
    codes: readonly C[],
  ) => ExcludeByCode<SubmitExceptionUnion<SubmitCraftResource>, C>;
};

type IsValidExceptions<T> =
  NonNullable<T> extends AnyCraftException
    ? true
    : [unknown] extends [T]
      ? true
      : false;

type HasReturnValidExceptions<
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
> =
  IsValidExceptions<SuccessExceptions> extends true
    ? IsValidExceptions<ErrorExceptions> extends true
      ? IsValidExceptions<ExceptionExceptions> extends true
        ? true
        : {
            success: true;
            error: true;
            exceptions: false;
          }
      : {
          success: true;
          error: false;
          exceptions: IsValidExceptions<ExceptionExceptions>;
        }
    : {
        success: false;
        error: IsValidExceptions<ErrorExceptions>;
        exceptions: IsValidExceptions<ExceptionExceptions>;
      };

type ValidationDetails = {
  success: boolean;
  error: boolean;
  exceptions: boolean;
};

type InvalidExceptionsMessage<T> = T extends true
  ? never
  : T extends ValidationDetails
    ? `Not valid ${
        | (T['success'] extends false ? 'success callback' : never)
        | (T['error'] extends false ? 'error callback' : never)
        | (T['exceptions'] extends false ? 'exceptions callback' : never)}`
    : never;

type InsertFormSubmitConfig<
  FormValue,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  MutationValue,
  MutationParams,
  MutationArgParams,
  MutationSourceParams,
  MutationInsertions,
  MutationExceptions extends ResourceExceptionConstraints,
  MutationIdentifier extends string | number | unknown,
  FormIdentifier extends string | number | unknown,
> = MergeObjects<
  [
    {
      success?: (
        context: SubmitContext<
          FormValue,
          MutationValue,
          MutationParams,
          MutationArgParams,
          MutationSourceParams,
          MutationInsertions,
          MutationExceptions
        >,
      ) => SuccessExceptions;
      error?: (
        context: SubmitContext<
          FormValue,
          MutationValue,
          MutationParams,
          MutationArgParams,
          MutationSourceParams,
          MutationInsertions,
          MutationExceptions
        >,
      ) => ErrorExceptions;
      exception?: (
        context: SubmitContext<
          FormValue,
          MutationValue,
          MutationParams,
          MutationArgParams,
          MutationSourceParams,
          MutationInsertions,
          MutationExceptions
        >,
      ) => ExceptionExceptions;
    },
    HasReturnValidExceptions<
      SuccessExceptions,
      ErrorExceptions,
      ExceptionExceptions
    > extends true
      ? {}
      : {
          typingError: `insertFormSubmit callbacks must only return Craft exceptions or undefined. ${InvalidExceptionsMessage<HasReturnValidExceptions<SuccessExceptions, ErrorExceptions, ExceptionExceptions>>}`;
        },
    [unknown] extends [FormIdentifier]
      ? {}
      : {
          filter?: ({
            formIdentifier,
            mutationIdentifier,
            mutationResource,
          }: {
            formIdentifier: FormIdentifier;
            mutationIdentifier: MutationIdentifier;
            mutationResource: ResourceLikeMutationRef<
              MutationValue,
              MutationParams,
              true,
              MutationArgParams,
              MutationSourceParams,
              MutationInsertions,
              MutationExceptions
            >;
          }) => boolean;
        },
  ]
>;

function isCraftExceptionLike(value: unknown): value is AnyCraftException {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

function normalizeExceptionList(value: unknown): AnyCraftException[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.filter(isCraftExceptionLike);
  if (isCraftExceptionLike(value)) return [value];
  return undefined;
}

function triggerSubmitResource<FormValue>(
  submitCraftResource: ResourceLikeMutationRef<
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >,
  validatedFormValue: ValidatedFormValue<FormValue>,
) {
  if ('mutate' in submitCraftResource && submitCraftResource.mutate) {
    submitCraftResource.mutate(validatedFormValue);
  }
}

type ToSubmitExceptions<
  SubmitExceptions extends AnyCraftException | undefined | unknown,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  FormIdentifier extends string | number | unknown,
> = [unknown] extends [ExceptionExceptions]
  ? Exclude<
      SubmitExceptions &
        InsertMetaInCraftExceptionIfExists<
          SuccessExceptions,
          'insertFormSubmitSuccess',
          FormIdentifier
        > &
        InsertMetaInCraftExceptionIfExists<
          ErrorExceptions,
          'insertFormSubmitError',
          FormIdentifier
        >,
      undefined
    >
  : Exclude<
      | InsertMetaInCraftExceptionIfExists<
          ExceptionExceptions,
          'insertFormSubmitException',
          FormIdentifier
        >
      | InsertMetaInCraftExceptionIfExists<
          SuccessExceptions,
          'insertFormSubmitSuccess',
          FormIdentifier
        >
      | InsertMetaInCraftExceptionIfExists<
          ErrorExceptions,
          'insertFormSubmitError',
          FormIdentifier
        >,
      undefined
    >;

export function insertFormSubmit<
  FormValue,
  MutationValue,
  MutationParams,
  MutationArgParams,
  MutationSourceParams,
  MutationInsertions,
  MutationExceptions extends ResourceExceptionConstraints,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
>(
  submitCraftResource: ResourceLikeMutationRef<
    MutationValue,
    MutationParams,
    true,
    MutationArgParams,
    MutationSourceParams,
    MutationInsertions,
    MutationExceptions
  >,
  config?: InsertFormSubmitConfig<
    FormValue,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    NoInfer<MutationValue>,
    NoInfer<MutationParams>,
    NoInfer<MutationArgParams>,
    NoInfer<MutationSourceParams>,
    NoInfer<MutationInsertions>,
    NoInfer<MutationExceptions>,
    unknown,
    unknown
  >,
): InsertionsFormFactory<
  FormValue,
  unknown,
  {
    submit: () => void;
    hasSubmitExceptions: Signal<boolean>;
    submitExceptions: Signal<
      ToSubmitExceptions<
        | InsertMetaInCraftExceptionIfExists<
            MutationExceptions['params'],
            'params',
            unknown
          >
        | InsertMetaInCraftExceptionIfExists<
            MutationExceptions['loader'],
            'loader',
            unknown
          >,
        SuccessExceptions,
        ErrorExceptions,
        ExceptionExceptions,
        unknown
      >[]
    >;
  }
>;
export function insertFormSubmit<
  FormValue,
  MutationValue,
  MutationParams,
  MutationArgParams,
  MutationSourceParams,
  MutationInsertions,
  MutationExceptions extends ResourceExceptionConstraints,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  MutationIdentifier extends string | number,
  FormIdentifier extends string | number,
>(
  submitCraftResourceById: ResourceByIdLikeMutationRef<
    MutationValue,
    MutationParams,
    true,
    MutationArgParams,
    MutationSourceParams,
    MutationInsertions,
    MutationIdentifier,
    MutationExceptions
  >,
  config?: InsertFormSubmitConfig<
    FormValue,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    NoInfer<MutationValue>,
    NoInfer<MutationParams>,
    NoInfer<MutationArgParams>,
    NoInfer<MutationSourceParams>,
    NoInfer<MutationInsertions>,
    NoInfer<MutationExceptions>,
    NoInfer<MutationIdentifier>,
    NoInfer<FormIdentifier>
  >,
): InsertionsFormFactory<
  FormValue,
  FormIdentifier,
  {
    submit: () => void;
    hasSubmitExceptions: Signal<boolean>;
    submitExceptions: Signal<
      ToSubmitExceptions<
        | InsertMetaInCraftExceptionIfExists<
            MutationExceptions['params'],
            'params',
            MutationIdentifier
          >
        | InsertMetaInCraftExceptionIfExists<
            MutationExceptions['loader'],
            'loader',
            MutationIdentifier
          >,
        SuccessExceptions,
        ErrorExceptions,
        ExceptionExceptions,
        FormIdentifier
      >[]
    >;
  }
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function insertFormSubmit(submitCraftResource: any, config?: any): any {
  return ({
    field,
    setAttemptedSubmit,
    setSubmitting,
    formIdentifier,
    validatedFormValue: validatedFormValueSignal,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    field: any;
    setAttemptedSubmit: () => void;
    setSubmitting: (submitting: boolean) => void;
    formIdentifier: unknown;
    validatedFormValue: Signal<ValidatedFormValue<unknown>>;
  }) => {
    const submitCraftResourceTarget = computed(() =>
      formIdentifier !== undefined
        ? (
            submitCraftResource as ResourceByIdLikeMutationRef<
              unknown,
              unknown,
              true,
              unknown,
              unknown,
              unknown,
              unknown,
              ResourceExceptionConstraints
            >
          ).select(formIdentifier as never)
        : (submitCraftResource as ResourceLikeMutationRef<
            unknown,
            unknown,
            true,
            unknown,
            unknown,
            unknown,
            ResourceExceptionConstraints
          >),
    );

    effect(() => {
      const target = submitCraftResourceTarget();
      const isLoading = target?.isLoading?.() ?? false;
      untracked(() => setSubmitting(isLoading));
    });

    effect(() => {
      const target = submitCraftResourceTarget();
      if (target?.status?.() === 'resolved') {
        untracked(() => field.reset?.());
      }
    });

    const hasSubmitExceptions = computed(() => {
      const target = submitCraftResourceTarget();
      return target &&
        'hasException' in target &&
        typeof target.hasException === 'function'
        ? !!target.hasException()
        : false;
    }) as Signal<boolean>;

    const submitExceptions = computed(() => {
      const target = submitCraftResourceTarget();
      const resourceExceptions =
        target &&
        'exceptions' in target &&
        typeof target.exceptions === 'function'
          ? ((target.exceptions() as { list?: AnyCraftException[] })?.list ?? [])
          : [];

      const omitExceptions = (codes: readonly string[]) =>
        resourceExceptions.filter(
          (e: AnyCraftException) => !codes.includes(e.code as string),
        );

      const ctx = {
        submitCraftResource: target,
        form: field,
        exceptions: resourceExceptions,
        omitExceptions,
      };

      const status = target?.status?.();
      const hasResourceException =
        target &&
        'hasException' in target &&
        typeof target.hasException === 'function' &&
        target.hasException();

      let merged: AnyCraftException[] = resourceExceptions;

      // `exception` overrides the mutation's own exceptions when present.
      if (hasResourceException && typeof config?.exception === 'function') {
        const next = normalizeExceptionList(config.exception(ctx));
        if (next) merged = next;
      }

      // `success` only fires when the mutation resolved without exception.
      if (
        status === 'resolved' &&
        !hasResourceException &&
        typeof config?.success === 'function'
      ) {
        const next = normalizeExceptionList(
          config.success({ ...ctx, exceptions: merged }),
        );
        if (next?.length) merged = [...merged, ...next];
      }

      // `error` only fires on network/runtime errors (not on craft-exception responses).
      if (status === 'error' && typeof config?.error === 'function') {
        const next = normalizeExceptionList(
          config.error({ ...ctx, exceptions: merged }),
        );
        if (next?.length) merged = [...merged, ...next];
      }

      return merged;
    });

    const submitForm = () => {
      setAttemptedSubmit();
      const validatedFormValue = validatedFormValueSignal();
      if (!validatedFormValue) return;
      if (!submitCraftResource) {
        // eslint-disable-next-line no-console
        console.warn(
          'No submit resource found for form submission. Please check that the resource is correctly passed to insertFormSubmit and that the formIdentifier (if used) is correct.',
        );
        return;
      }
      triggerSubmitResource(submitCraftResource, validatedFormValue);
    };

    return {
      submit: submitForm,
      hasSubmitExceptions,
      submitExceptions,
    };
  };
}
