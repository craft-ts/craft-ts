import { computed, effect, Signal } from '@angular/core';
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
} from './insert-form';

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
      // todo filter for parallel
      /**
       * Add more exceptions on success, for example to handle specific cases where the resource returns a successful response but you want to display an exception
       */
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
      /**
       * Add more exceptions on error, for example to handle specific cases where the resource returns an error response but you want to display a different exception
       */
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
      /**
       * Override and add more exceptions on exception, for example to handle specific cases where the resource throws an exception but you want to display a different exception
       */
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
    return;
  }
}

// todo handle GroupIdentifier
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

/**
 * For now, only compatible with mutation that accept a method
 */
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
export function insertFormSubmit(submitCraftResource: any, config?: any): any {
  //@ts-expect-error todo improve type
  return ({ form, setAttemptedSubmit, setSubmitting, formIdentifier }) => {
    const submitCraftResourceTarget = computed(() =>
      formIdentifier
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
          ).select(formIdentifier)
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

    const _submittingSync = effect(() => {
      setSubmitting(submitCraftResourceTarget()?.isLoading() ?? false);
    });

    const _resetFormOnResolved = effect(() => {
      if (submitCraftResourceTarget()?.status() === 'resolved') {
        form().reset();
      }
    });

    const hasSubmitExceptions = computed(() => {
      const _submitCraftResourceTarget = submitCraftResourceTarget();
      return _submitCraftResourceTarget &&
        'hasException' in _submitCraftResourceTarget &&
        typeof _submitCraftResourceTarget.hasException === 'function'
        ? (_submitCraftResourceTarget.hasException?.() ?? false)
        : false;
    }) as Signal<boolean>;

    const submitExceptions = computed(() => {
      const _submitCraftResourceTarget = submitCraftResourceTarget();
      const resourceExceptions = (
        _submitCraftResourceTarget &&
        'exceptions' in _submitCraftResourceTarget &&
        typeof _submitCraftResourceTarget.exceptions === 'function'
          ? (_submitCraftResourceTarget.exceptions()?.list ?? [])
          : []
      ) as SubmitExceptionUnion<any>;

      const omitExceptions = (codes: string[]) =>
        (resourceExceptions as AnyCraftException[]).filter(
          (exception) => !codes.includes(exception.code),
        ) as SubmitExceptionUnion<any>;

      const context = {
        submitCraftResource: submitCraftResourceTarget(),
        form,
        exceptions: resourceExceptions,
        omitExceptions,
      } as unknown as SubmitContext<
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        ResourceExceptionConstraints
      >;

      let mergedExceptions = resourceExceptions as AnyCraftException[];

      if (
        typeof config?.exception === 'function' &&
        //@ts-expect-error todo improve type
        submitCraftResourceTarget()?.hasException()
      ) {
        const nextExceptions = normalizeExceptionList(
          //@ts-ignore
          config.exception(context),
        );
        if (nextExceptions) {
          mergedExceptions = nextExceptions;
        }
      }

      if (
        submitCraftResourceTarget()?.status() === 'resolved' &&
        typeof config?.success === 'function'
      ) {
        const nextExceptions = normalizeExceptionList(
          config.success({
            ...context,
            //@ts-ignore
            exceptions: mergedExceptions as SubmitExceptionUnion<any>,
          }),
        );
        if (nextExceptions?.length) {
          mergedExceptions = [...mergedExceptions, ...nextExceptions];
        }
      }

      if (
        submitCraftResourceTarget()?.status() === 'error' &&
        typeof config?.error === 'function'
      ) {
        const nextExceptions = normalizeExceptionList(
          config.error({
            ...context,
            //@ts-ignore
            exceptions: mergedExceptions as SubmitExceptionUnion<any>,
          }),
        );
        if (nextExceptions?.length) {
          mergedExceptions = [...mergedExceptions, ...nextExceptions];
        }
      }
      return mergedExceptions as SubmitExceptionUnion<any>;
    });

    const submitForm = async () => {
      setAttemptedSubmit();
      const validatedFormValue = form().validatedFormValue();

      if (!validatedFormValue) {
        return;
      }
      if (!submitCraftResource) {
        console.warn(
          'No submit resource found for form submission. Please check that the resource is correctly passed to insertFormSubmit and that the formIdentifier (if used) is correct.',
        );
        return;
      }
      //@ts-ignore todo improve type
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
