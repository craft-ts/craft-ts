import { InjectionToken, type Signal } from '../host/craft-compat';
import type { AnyCraftException } from '../craft-exception';
import type { CraftField } from './craft-field';
import type { ValidatorOutput } from './validator';

/** Type-only metadata carried by configured form fields. */
export declare const CRAFT_FIELD_VALIDATION_CASES: unique symbol;

/** Runtime validation source exposed by `insertFormAttributes`. */
export const CRAFT_FIELD_EXCEPTION_SOURCE = Symbol.for(
  '@craft-ng/core/field-exception-source',
);

/** Type-only validator metadata emitted by `insertFormAttributes`. */
export declare const CRAFT_FIELD_VALIDATORS: unique symbol;

export type FieldValidationCase<
  Path extends string,
  ValidatorName extends string,
  Exception extends AnyCraftException,
> = {
  readonly path: Path;
  readonly validatorName: ValidatorName;
  readonly exception: Exception;
};

export type CraftFieldValidationCasesCarrier<Cases> = {
  readonly [CRAFT_FIELD_VALIDATION_CASES]?: Cases;
};

export type CraftFieldValidatorsCarrier<Validators> = {
  readonly [CRAFT_FIELD_VALIDATORS]?: Validators;
};

export type FieldValidationCasesOf<Field> =
  Field extends CraftFieldValidationCasesCarrier<infer Cases> ? Cases : never;

export type FieldExceptionVisibilityState = 'dirty' | 'touched' | 'submitted';

export type FieldExceptionVisibilityContext = {
  readonly field: CraftField<unknown>;
  readonly hasAttemptedSubmit: Signal<boolean>;
};

export type FieldExceptionVisibility =
  | 'visibleExceptions'
  | 'always'
  | {
      readonly anyOf: readonly FieldExceptionVisibilityState[];
    }
  | ((context: FieldExceptionVisibilityContext) => boolean);

export type FieldExceptionCollection = {
  readonly list: readonly AnyCraftException[];
  readonly byValidator: Readonly<Record<string, AnyCraftException>>;
};

export type CraftFieldExceptionSource = {
  readonly field: CraftField<unknown>;
  readonly path: string;
  readonly runtimePath: ReadonlyArray<string | number>;
  readonly validatorNames: readonly string[];
  readonly exceptions: Signal<FieldExceptionCollection>;
  readonly visibleExceptions: Signal<FieldExceptionCollection>;
  readonly firstLeftFailedValidation: Signal<AnyCraftException | undefined>;
  readonly visibleFirstLeftFailedValidation: Signal<
    AnyCraftException | undefined
  >;
  readonly hasAttemptedSubmit: Signal<boolean>;
};

export type CraftFieldExceptionSourceCarrier = {
  readonly [CRAFT_FIELD_EXCEPTION_SOURCE]?: CraftFieldExceptionSource;
};

export type FieldExceptionBoundaryRegistration = {
  readonly register: (
    source: CraftFieldExceptionSource,
    element?: Element,
  ) => () => void;
};

/** Nearest runtime boundary used by `CraftFieldDirective`. */
export const CRAFT_FIELD_EXCEPTION_BOUNDARY =
  new InjectionToken<FieldExceptionBoundaryRegistration>(
    'CRAFT_FIELD_EXCEPTION_BOUNDARY',
  );

export const DEFAULT_FIELD_EXCEPTION_VISIBILITY = {
  anyOf: ['touched', 'submitted'],
} as const satisfies FieldExceptionVisibility;

export function fieldExceptionVisibilityMatches(
  visibility: Exclude<FieldExceptionVisibility, 'visibleExceptions'>,
  context: FieldExceptionVisibilityContext,
): boolean {
  if (visibility === 'always') return true;
  if (typeof visibility === 'function') return visibility(context);
  return visibility.anyOf.some((state) => {
    switch (state) {
      case 'dirty':
        return context.field.dirty();
      case 'touched':
        return context.field.touched();
      case 'submitted':
        return context.hasAttemptedSubmit();
    }
  });
}

type ValidatorCases<Validator, Path extends string> =
  Validator extends ValidatorOutput<
    any,
    infer Name extends string,
    infer Exceptions,
    any,
    any,
    any
  >
    ? Exceptions extends AnyCraftException
      ? FieldValidationCase<Path, Name, Exceptions>
      : never
    : never;

export type FieldValidationCasesFromInsertions<
  Insertions,
  Path extends string,
> =
  Insertions extends CraftFieldValidatorsCarrier<infer Validators>
    ? ValidatorCases<Validators, Path>
    : never;

export function staticFieldPath(
  runtimePath: ReadonlyArray<string | number>,
): string {
  let path = '';
  for (const segment of runtimePath) {
    if (typeof segment === 'number') {
      path += '[]';
    } else {
      path += path ? `.${segment}` : segment;
    }
  }
  return path;
}
