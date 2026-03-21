import { ResourceStatus, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import {
  cAsyncValidator,
  cEmail,
  cMax,
  cMaxLength,
  cMin,
  cMinLength,
  cPattern,
  cRequired,
  cValidator,
  FormValidator,
  ValidatorType,
} from './validator';
import { craftException, CRAFT_EXCEPTION_SYMBOL } from '../craft-exception';
import { query } from '../query';

function createField<TValue>(initialValue: TValue) {
  const model = signal({
    fieldValue: initialValue,
  });
  const myForm = form(model) as any;

  return {
    field: myForm.fieldValue,
    setValue: (value: TValue) =>
      model.set({
        fieldValue: value,
      }),
  };
}

function createExpectedException<
  Name extends string,
  Code extends string,
  Payload = undefined,
>(brand: Name, code: Code, payload: Payload, type: ValidatorType = 'sync') {
  return {
    code,
    [CRAFT_EXCEPTION_SYMBOL]: true,
    payload,
    [code]: payload,
    __brand: brand,
    type,
  };
}

function createExpectedAsyncInvalid<Name extends string>(
  brand: Name,
  status: ResourceStatus,
) {
  return {
    valid: false,
    __brand: brand,
    type: 'async' as const,
    status,
  };
}

function createExpectedAsyncException<
  Name extends string,
  Code extends string,
  Payload = undefined,
>(brand: Name, code: Code, payload: Payload, status: ResourceStatus) {
  return {
    ...createExpectedException(brand, code, payload, 'async'),
    status,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('validator', () => {
  it('should allow using cRequired directly as a model-aware validator', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cRequired(field);

      expect(validator()).toEqual(
        createExpectedException('cRequired', 'required', undefined),
      );

      setValue('test');
      expect(validator()).toBeUndefined();

      setValue('');
      const skippedValidator = cRequired({
        when: () => false,
      });
      expect(skippedValidator(field)).toBeUndefined();
    });
  });

  it('should allow using cEmail directly as a model-aware validator', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cEmail(field);

      expect(validator()).toBeUndefined();

      setValue('invalid-email');
      expect(validator()).toEqual(
        createExpectedException('cEmail', 'email', undefined),
      );

      const skippedValidator = cEmail({
        when: () => false,
      });
      expect(skippedValidator(field)).toBeUndefined();

      setValue('valid@email.dev');
      expect(validator()).toBeUndefined();
    });
  });

  it('should return a deferred cMin validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cMin({
        min: () => 3,
        when: () => true,
      });

      expect(validator(field)).toBeUndefined();

      setValue('2');
      expect(validator(field)).toEqual(
        createExpectedException('cMin', 'min', 3),
      );

      const skippedValidator = cMin({
        min: () => 3,
        when: () => false,
      });
      expect(skippedValidator(field)).toBeUndefined();

      setValue('3');
      expect(validator(field)).toBeUndefined();
    });
  });

  it('should prioritize the explicit model passed to cMax over the fallback model', () => {
    TestBed.runInInjectionContext(() => {
      const { field: baseField, setValue: setBaseValue } = createField('20');
      const { field: debouncedField, setValue: setDebouncedValue } =
        createField('8');
      const validator = cMax({
        max: () => 10,
        model: debouncedField,
        when: () => true,
      });

      expect(validator(baseField)).toBeUndefined();

      setBaseValue('100');
      expect(validator(baseField)).toBeUndefined();

      setDebouncedValue('11');
      expect(validator(baseField)).toEqual(
        createExpectedException('cMax', 'max', 10),
      );

      const skippedValidator = cMax({
        max: () => 10,
        model: debouncedField,
        when: () => false,
      });
      expect(skippedValidator(baseField)).toBeUndefined();
    });
  });

  it('should support mixing bare and configured validators in a validators list', () => {
    TestBed.runInInjectionContext(() => {
      const { field: baseField, setValue: setBaseValue } = createField('');
      const { field: debouncedField, setValue: setDebouncedValue } =
        createField('11');
      const validators = [
        cRequired,
        cMin({
          min: () => 3,
        }),
        cMax({
          max: () => 10,
          model: debouncedField,
        }),
      ] as const;

      const requiredValidator = validators[0](baseField);
      const minValidator = validators[1];
      const maxValidator = validators[2];

      expect(requiredValidator()).toEqual(
        createExpectedException('cRequired', 'required', undefined),
      );

      setBaseValue('2');
      expect(minValidator(baseField)).toEqual(
        createExpectedException('cMin', 'min', 3),
      );

      expect(maxValidator(baseField)).toEqual(
        createExpectedException('cMax', 'max', 10),
      );

      setDebouncedValue('9');
      expect(maxValidator(baseField)).toBeUndefined();
    });
  });

  it('should return a deferred cMaxLength validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cMaxLength({
        maxLength: 3,
        when: () => true,
      });

      expect(validator(field)).toBeUndefined();

      setValue('abcd');
      expect(validator(field)).toEqual(
        createExpectedException('cMaxLength', 'maxLength', 3),
      );

      const skippedValidator = cMaxLength({
        maxLength: 3,
        when: () => false,
      });
      expect(skippedValidator(field)).toBeUndefined();

      setValue('abc');
      expect(validator(field)).toBeUndefined();
    });
  });

  it('should return a deferred cMinLength validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cMinLength({
        minLength: 3,
        when: () => true,
      });

      expect(validator(field)).toBeUndefined();

      setValue('ab');
      expect(validator(field)).toEqual(
        createExpectedException('cMinLength', 'minLength', 3),
      );

      const skippedValidator = cMinLength({
        minLength: 3,
        when: () => false,
      });
      expect(skippedValidator(field)).toBeUndefined();

      setValue('abc');
      expect(validator(field)).toBeUndefined();
    });
  });

  it('should return a deferred cPattern validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cPattern({
        pattern: () => /^\d+$/,
        when: () => true,
      });

      expect(validator(field)).toBeUndefined();

      setValue('abc');
      expect(validator(field)).toEqual(
        createExpectedException('cPattern', 'pattern', /^\d+$/),
      );

      const skippedValidator = cPattern({
        pattern: () => /^\d+$/,
        when: () => false,
      });
      expect(skippedValidator(field)).toBeUndefined();

      setValue('123');
      expect(validator(field)).toBeUndefined();
    });
  });

  it('should support custom sync validators returning craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cValidator({
        name: 'myCustomValidator',
        validate: ({ value }) =>
          value === 'blocked'
            ? craftException(
                {
                  code: 'blockedValue',
                },
                {
                  reason: 'reserved',
                },
              )
            : undefined,
      });

      expect(validator(field)).toBeUndefined();

      setValue('blocked');
      expect(validator(field)).toEqual({
        ...craftException(
          {
            code: 'blockedValue',
          },
          {
            reason: 'reserved',
          },
        ),
        __brand: 'myCustomValidator',
        type: 'sync',
      });
    });
  });

  it('should expose cValidator as an alias of cValidate', () => {
    TestBed.runInInjectionContext(() => {
      const { field } = createField('');
      const validator = cValidator({
        name: 'aliasValidator',
        when: () => false,
        validate: () =>
          craftException(
            {
              code: 'shouldNotRun',
            },
            undefined,
          ),
      });

      expect(validator(field)).toBeUndefined();
    });
  });

  it('should support custom async validators returning craft exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { field, setValue } = createField('');
      const validator = cValidator({
        name: 'asyncCustomValidator',
        type: 'async',
        validate: async ({ value }) =>
          value === 'taken'
            ? craftException(
                {
                  code: 'alreadyTaken',
                },
                'taken',
              )
            : undefined,
      });

      await expect(validator(field)).resolves.toBeUndefined();

      setValue('taken');
      await expect(validator(field)).resolves.toEqual({
        ...craftException(
          {
            code: 'alreadyTaken',
          },
          'taken',
        ),
        __brand: 'asyncCustomValidator',
        type: 'async',
      });
    });
  });
});

describe('cAsyncValidator', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('should trigger the query manually and stay invalid while loading', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { field, setValue } = createField('john');
      const usernameQuery = query({
        method: (payload: FormValidator<string>) => payload.value,
        loader: async ({ params }) => {
          await wait(1000);
          return params === 'taken'
            ? craftException(
                {
                  code: 'alreadyTaken',
                },
                {
                  value: params,
                },
              )
            : {
                available: true as const,
              };
        },
      });

      expectTypeOf(usernameQuery.call)
        .parameter(0)
        .toEqualTypeOf<FormValidator<string>>();

      const validator = cAsyncValidator('checkUsername', usernameQuery);

      await vi.advanceTimersByTimeAsync(0);
      await expect(validator(field)).resolves.toEqual(
        createExpectedAsyncInvalid('checkUsername', 'loading'),
      );

      await vi.advanceTimersByTimeAsync(1000);
      await expect(validator(field)).resolves.toBeUndefined();

      setValue('taken');
      await vi.advanceTimersByTimeAsync(0);
      await expect(validator(field)).resolves.toEqual(
        createExpectedAsyncInvalid('checkUsername', 'loading'),
      );

      await vi.advanceTimersByTimeAsync(1000);
      await expect(validator(field)).resolves.toEqual(
        createExpectedAsyncException(
          'checkUsername',
          'alreadyTaken',
          {
            value: 'taken',
          },
          'resolved',
        ),
      );
    });
  });

  it('should expose cAsyncValidator as an alias of cAsyncValidator', () => {
    expect(cAsyncValidator).toBe(cAsyncValidator);
  });

  it('should support exception overrides like insertFormSubmit', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { field } = createField('taken');
      const usernameQuery = query({
        method: (payload: FormValidator<string>) => payload.value,
        loader: async ({ params }) => {
          await wait(1000);
          return craftException(
            {
              code: params === 'taken' ? 'alreadyTaken' : 'anotherError',
            },
            undefined,
          );
        },
      });

      const validator = cAsyncValidator('overrideUsername', usernameQuery, {
        exception: ({ queryCraftResource, omitExceptions }) => {
          const loaderException = queryCraftResource.exceptions().loader;
          if (
            loaderException &&
            'code' in loaderException &&
            loaderException.code === 'alreadyTaken'
          ) {
            return craftException({
              code: 'alreadyTakenMapped',
            });
          }

          return omitExceptions(['alreadyTaken']);
        },
      });

      await vi.advanceTimersByTimeAsync(1000);
      await expect(validator(field)).resolves.toEqual({
        ...craftException({
          code: 'alreadyTakenMapped',
        }),
        __brand: 'overrideUsername',
        type: 'async',
        status: 'resolved',
      });
    });
  });

  it('should support selecting the matching parallel query resource with identifier', async () => {
    await TestBed.runInInjectionContext(async () => {
      const firstField = createField('john');
      const secondField = createField('jane');
      const usernameQuery = query({
        method: (payload: FormValidator<string, '1' | '2'>) => ({
          value: payload.value,
          identifier: payload.identifier,
        }),
        identifier: (params) => params.identifier,
        loader: async ({ params }) => {
          await wait(1000);
          return params.value === 'taken'
            ? craftException(
                {
                  code: 'alreadyTaken',
                },
                {
                  value: params.value,
                },
              )
            : {
                available: true as const,
              };
        },
      });

      expectTypeOf(usernameQuery.call)
        .parameter(0)
        .toEqualTypeOf<FormValidator<string, '1' | '2'>>();

      const validator = cAsyncValidator('parallelUsername', usernameQuery);

      await vi.advanceTimersByTimeAsync(1000);
      await expect(validator(firstField.field, '1')).resolves.toBeUndefined();
      await expect(validator(secondField.field, '2')).resolves.toBeUndefined();

      secondField.setValue('taken');
      await vi.advanceTimersByTimeAsync(0);
      await expect(validator(firstField.field, '1')).resolves.toBeUndefined();
      await expect(validator(secondField.field, '2')).resolves.toEqual(
        createExpectedAsyncInvalid('parallelUsername', 'loading'),
      );

      await vi.advanceTimersByTimeAsync(1000);
      await expect(validator(firstField.field, '1')).resolves.toBeUndefined();
      await expect(validator(secondField.field, '2')).resolves.toEqual(
        createExpectedAsyncException(
          'parallelUsername',
          'alreadyTaken',
          {
            value: 'taken',
          },
          'resolved',
        ),
      );
    });
  });
});
