import { computed, effect, Signal, WritableSignal } from '@angular/core';
import {
  AnyCraftException,
  ExcludeByCode,
  ExtractCodeFromCraftResultUnion,
  InsertMetaInCraftExceptionIfExists,
} from '../craft-exception';
import { ResourceLikeMutationRef } from '../mutation';
import { ResourceLikeQueryRef } from '../query';
import {
  FormWithInsertions,
  InsertionsFormFactory,
  ValidatedFormValue,
} from './insert-form';
import { MergeObject } from '../util/util.type';

// todo handle parallel resource
type SubmitResourceLike<FormValue> =
  | ResourceLikeQueryRef<
      object | undefined,
      ValidatedFormValue<FormValue>,
      true,
      ValidatedFormValue<FormValue>,
      unknown,
      unknown,
      any
    >
  | ResourceLikeMutationRef<
      object | undefined,
      ValidatedFormValue<FormValue>,
      true,
      ValidatedFormValue<FormValue>,
      unknown,
      unknown,
      any
    >;

type SubmitExceptionUnion<SubmitCraftResource> = SubmitCraftResource extends {
  exceptions: Signal<{ list: (infer ExceptionList)[] }>;
}
  ? ExceptionList
  : AnyCraftException;

type SubmitContext<
  FormValue,
  SubmitCraftResource,
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
  SubmitCraftResource,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
> = MergeObject<
  {
    /**
     * Add more exceptions on success, for example to handle specific cases where the resource returns a successful response but you want to display an exception
     */
    success?: (
      context: SubmitContext<FormValue, SubmitCraftResource>,
    ) => SuccessExceptions;
    /**
     * Add more exceptions on error, for example to handle specific cases where the resource returns an error response but you want to display a different exception
     */
    error?: (
      context: SubmitContext<FormValue, SubmitCraftResource>,
    ) => ErrorExceptions;
    /**
     * Override and add more exceptions on exception, for example to handle specific cases where the resource throws an exception but you want to display a different exception
     */
    exception?: (
      context: SubmitContext<FormValue, SubmitCraftResource>,
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
      }
>;

function isCraftExceptionLike(value: unknown): value is AnyCraftException {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

function normalizeExceptionList(
  value: unknown,
): AnyCraftException[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.filter(isCraftExceptionLike);
  }

  if (isCraftExceptionLike(value)) {
    return [value];
  }

  return undefined;
}

function triggerSubmitResource<FormValue>(
  submitCraftResource: SubmitResourceLike<FormValue>,
  validatedFormValue: ValidatedFormValue<FormValue>,
) {
  if ('mutate' in submitCraftResource && submitCraftResource.mutate) {
    submitCraftResource.mutate(validatedFormValue);
    return;
  }

  if ('call' in submitCraftResource && submitCraftResource.call) {
    submitCraftResource.call(validatedFormValue);
  }
}

// todo handle GroupIdentifier
type ToSubmitExceptions<
  SubmitExceptions extends AnyCraftException | undefined,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
> = [unknown] extends [ExceptionExceptions]
  ? Exclude<
      SubmitExceptions &
        InsertMetaInCraftExceptionIfExists<
          SuccessExceptions,
          'insertFormSubmitSuccess',
          undefined
        > &
        InsertMetaInCraftExceptionIfExists<
          ErrorExceptions,
          'insertFormSubmitError',
          undefined
        >,
      undefined
    >
  : Exclude<
      | InsertMetaInCraftExceptionIfExists<
          ExceptionExceptions,
          'insertFormSubmitException',
          undefined
        >
      | InsertMetaInCraftExceptionIfExists<
          SuccessExceptions,
          'insertFormSubmitSuccess',
          undefined
        >
      | InsertMetaInCraftExceptionIfExists<
          ErrorExceptions,
          'insertFormSubmitError',
          undefined
        >,
      undefined
    >;

export function insertFormSubmit<
  FormValue,
  SubmitCraftResource extends SubmitResourceLike<FormValue>,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
>(
  submitCraftResource: SubmitCraftResource,
  config?: InsertFormSubmitConfig<
    FormValue,
    SubmitCraftResource,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions
  >,
): InsertionsFormFactory<
  FormValue,
  {
    submit: () => void;
    hasSubmitExceptions: Signal<boolean>;
    submitExceptions: Signal<
      ToSubmitExceptions<
        SubmitExceptionUnion<SubmitCraftResource>,
        SuccessExceptions,
        ErrorExceptions,
        ExceptionExceptions
      >[]
    >;
  }
> {
  //@ts-expect-error todo improve type
  return ({ form }) => {
    const _submittingSync = effect(() => {
      form.selfSubmitting.set(submitCraftResource.isLoading());
    });

    const hasSubmitExceptions = computed(() => {
      return 'hasException' in submitCraftResource &&
        typeof submitCraftResource.hasException === 'function'
        ? (submitCraftResource.hasException?.() ?? false)
        : false;
    }) as Signal<boolean>;

    const submitExceptions = computed(() => {
      const resourceExceptions = (
        'exceptions' in submitCraftResource &&
        typeof submitCraftResource.exceptions === 'function'
          ? (submitCraftResource.exceptions()?.list ?? [])
          : []
      ) as SubmitExceptionUnion<SubmitCraftResource>;

      const omitExceptions = (codes: string[]) =>
        (resourceExceptions as AnyCraftException[]).filter(
          (exception) => !codes.includes(exception.code),
        ) as SubmitExceptionUnion<SubmitCraftResource>;

      const context = {
        submitCraftResource,
        form,
        exceptions: resourceExceptions,
        omitExceptions,
      } as unknown as SubmitContext<FormValue, SubmitCraftResource>;

      let mergedExceptions = resourceExceptions as AnyCraftException[];

      if (typeof config?.exception === 'function') {
        const nextExceptions = normalizeExceptionList(
          config.exception(context),
        );
        if (nextExceptions) {
          mergedExceptions = nextExceptions;
        }
      }

      if (
        submitCraftResource.status() === 'resolved' &&
        typeof config?.success === 'function'
      ) {
        const nextExceptions = normalizeExceptionList(
          config.success({
            ...context,
            exceptions:
              mergedExceptions as SubmitExceptionUnion<SubmitCraftResource>,
          }),
        );
        if (nextExceptions?.length) {
          mergedExceptions = [...mergedExceptions, ...nextExceptions];
        }
      }

      if (
        submitCraftResource.status() === 'error' &&
        typeof config?.error === 'function'
      ) {
        const nextExceptions = normalizeExceptionList(
          config.error({
            ...context,
            exceptions:
              mergedExceptions as SubmitExceptionUnion<SubmitCraftResource>,
          }),
        );
        if (nextExceptions?.length) {
          mergedExceptions = [...mergedExceptions, ...nextExceptions];
        }
      }
      return mergedExceptions as SubmitExceptionUnion<SubmitCraftResource>;
    });

    const submitForm = async () => {
      const validatedFormValue = form.validatedFormValue();
      if (!validatedFormValue) {
        return;
      }
      triggerSubmitResource(submitCraftResource, validatedFormValue);

      return;
    };

    return {
      submit: submitForm,
      hasSubmitExceptions,
      submitExceptions,
    };
  };
}
