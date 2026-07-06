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

type SubmitContext<
  FormValue,
  SubmitCraftResource,
  CurrentExceptions,
  SubmitExceptions = ExtractCodeFromCraftResultUnion<CurrentExceptions>,
> = {
  submitCraftResource: SubmitCraftResource;
  form: FormWithInsertions<FormValue, {}>;
  exceptions: CurrentExceptions[];
  omit: <C extends SubmitExceptions>(
    codes: readonly C[],
  ) => ExcludeByCode<CurrentExceptions, C>[];
};

type MutationSubmitExceptions<
  MutationExceptions extends ResourceExceptionConstraints,
  Identifier extends string | number | unknown,
> =
  | InsertMetaInCraftExceptionIfExists<
      MutationExceptions['params'],
      'params',
      Identifier
    >
  | InsertMetaInCraftExceptionIfExists<
      MutationExceptions['loader'],
      'loader',
      Identifier
    >;

type SubmitExceptionUnion<SubmitCraftResource> =
  SubmitCraftResource extends ResourceLikeMutationRef<
    any,
    any,
    any,
    any,
    any,
    any,
    infer MutationExceptions,
    any
  >
    ? MutationSubmitExceptions<MutationExceptions, unknown>
    : SubmitCraftResource extends ResourceByIdLikeMutationRef<
          any,
          any,
          any,
          any,
          any,
          any,
          infer GroupIdentifier,
          infer MutationExceptions,
          any
        >
      ? MutationSubmitExceptions<MutationExceptions, GroupIdentifier>
      : SubmitCraftResource extends {
            exceptions: Signal<{ list: (infer ExceptionList)[] }>;
          }
        ? ExceptionList
        : never;

type SelectedSubmitCraftResource<SubmitCraftResourceById> =
  SubmitCraftResourceById extends {
    select: (id: any) => infer SelectedResource;
  }
    ? NonNullable<SelectedResource>
    : never;

type MutationIdentifierOf<SubmitCraftResourceById> =
  SubmitCraftResourceById extends ResourceByIdLikeMutationRef<
    any,
    any,
    any,
    any,
    any,
    any,
    infer GroupIdentifier,
    any,
    any
  >
    ? GroupIdentifier
    : never;

type MaybeExceptions =
  | AnyCraftException
  | readonly AnyCraftException[]
  | undefined;

type ExceptionRuleReturn<T> = T extends (...args: any[]) => infer Return
  ? Return
  : never;

type ExtractExceptionReturn<T> =
  Exclude<T, undefined> extends readonly (infer Exception)[]
    ? Exception
    : Exclude<T, undefined>;

type ApplyExceptionRule<CurrentExceptions, Rule> =
  Exclude<ExceptionRuleReturn<Rule>, undefined> extends readonly unknown[]
    ? ExtractExceptionReturn<ExceptionRuleReturn<Rule>>
    : CurrentExceptions | ExtractExceptionReturn<ExceptionRuleReturn<Rule>>;

type ApplyExceptionRules<
  CurrentExceptions,
  Rules extends readonly unknown[],
> = Rules extends readonly [infer Rule, ...infer Tail]
  ? ApplyExceptionRules<ApplyExceptionRule<CurrentExceptions, Rule>, Tail>
  : CurrentExceptions;

type InsertMetaInCraftExceptionIfKnown<
  Exception,
  Scope extends string | undefined,
  Identifier extends string | number | unknown,
> = [unknown] extends [Exception]
  ? never
  : InsertMetaInCraftExceptionIfExists<Exception, Scope, Identifier>;

type InsertFormSubmitConfig<
  FormValue,
  SubmitCraftResource,
  SubmitExceptions,
  MutationIdentifier extends string | number | unknown,
  FormIdentifier extends string | number | unknown,
> = MergeObjects<
  [
    {
      success?: (
        context: SubmitContext<
          FormValue,
          SubmitCraftResource,
          SubmitExceptions
        >,
      ) => MaybeExceptions;
      exception?: (
        context: SubmitContext<
          FormValue,
          SubmitCraftResource,
          SubmitExceptions
        >,
      ) => MaybeExceptions;
      exceptions?: readonly ((
        context: SubmitContext<
          FormValue,
          SubmitCraftResource,
          SubmitExceptions
        >,
      ) => MaybeExceptions)[];
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
            mutationResource: SubmitCraftResource;
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
  Config,
  FormIdentifier extends string | number | unknown,
> = Exclude<
  | (Config extends {
      exceptions: infer ExceptionRules extends readonly unknown[];
    }
      ? ExceptionRules extends readonly []
        ? SubmitExceptions
        : ApplyExceptionRules<SubmitExceptions, ExceptionRules>
      : SubmitExceptions)
  | InsertMetaInCraftExceptionIfKnown<
      Config extends { success: (...args: any[]) => infer SuccessExceptions }
        ? SuccessExceptions
        : never,
      'insertFormSubmitSuccess',
      FormIdentifier
    >
  | InsertMetaInCraftExceptionIfKnown<
      Config extends { exception: (...args: any[]) => infer ExceptionExceptions }
        ? ExceptionExceptions
        : never,
      'insertFormSubmitError',
      FormIdentifier
    >,
  undefined
>;

export function insertFormSubmit<
  FormValue,
  SubmitCraftResource extends ResourceLikeMutationRef<
    any,
    any,
    true,
    any,
    any,
    any,
    any
  >,
  SubmitExceptions = SubmitExceptionUnion<SubmitCraftResource>,
  const Config extends object = {},
>(
  submitCraftResource: SubmitCraftResource,
  config?: Config &
    InsertFormSubmitConfig<
      FormValue,
      SubmitCraftResource,
      SubmitExceptions,
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
      ToSubmitExceptions<SubmitExceptions, Config, unknown>[]
    >;
  }
>;
export function insertFormSubmit<
  FormValue,
  SubmitCraftResourceById extends {
    type: 'resourceByGroupLike';
    kind: 'mutation';
    select: (id: any) => any;
    mutate?: (args: any) => any;
  },
  MutationIdentifier extends
    | string
    | number = MutationIdentifierOf<SubmitCraftResourceById> &
    (string | number),
  FormIdentifier extends string | number = MutationIdentifier,
  SubmitCraftResource = SelectedSubmitCraftResource<SubmitCraftResourceById>,
  SubmitExceptions = SubmitExceptionUnion<SubmitCraftResourceById>,
  const Config extends object = {},
>(
  submitCraftResourceById: SubmitCraftResourceById,
  config?: Config &
    InsertFormSubmitConfig<
      FormValue,
      SubmitCraftResource,
      SubmitExceptions,
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
      ToSubmitExceptions<SubmitExceptions, Config, FormIdentifier>[]
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
          ? ((target.exceptions() as { list?: AnyCraftException[] })?.list ??
            [])
          : [];

      const omit = (codes: readonly string[]) =>
        resourceExceptions.filter(
          (e: AnyCraftException) => !codes.includes(e.code as string),
        );

      const ctx = {
        submitCraftResource: target,
        form: field,
        exceptions: resourceExceptions,
        omit,
      };

      const status = target?.status?.();
      const hasResourceException =
        target &&
        'hasException' in target &&
        typeof target.hasException === 'function' &&
        target.hasException();

      let merged: AnyCraftException[] = resourceExceptions;

      // `exceptions` rules run as a small pipeline over the mutation exceptions.
      // Returning an array replaces the current list (used by `omit`), while
      // returning one exception appends it.
      if (hasResourceException && Array.isArray(config?.exceptions)) {
        for (const exceptionRule of config.exceptions) {
          const next = exceptionRule({ ...ctx, exceptions: merged });
          const normalized = normalizeExceptionList(next);
          if (!normalized) continue;
          merged = Array.isArray(next)
            ? normalized
            : [...merged, ...normalized];
        }
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

      // `exception` only fires on residual technical failures (not on
      // craft-exception responses, which flow through `exceptions`).
      if (status === 'exception' && typeof config?.exception === 'function') {
        const next = normalizeExceptionList(
          config.exception({ ...ctx, exceptions: merged }),
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
