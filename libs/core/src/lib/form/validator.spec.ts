import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import {
  cEmail,
  cMax,
  cMaxLength,
  cMin,
  cMinLength,
  cPattern,
  cRequired,
} from './validator';
import { CRAFT_EXCEPTION_SYMBOL } from '../craft-exception';

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
>(brand: Name, code: Code, payload: Payload) {
  return {
    code,
    [CRAFT_EXCEPTION_SYMBOL]: true,
    payload,
    [code]: payload,
    __brand: brand,
  };
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
      expect(validator()).toEqual({
        valid: true,
        __brand: 'cRequired',
      });

      setValue('');
      const skippedValidator = cRequired({
        when: () => false,
      })(field);
      expect(skippedValidator()).toEqual({
        valid: true,
        __brand: 'cRequired',
      });
    });
  });

  it('should allow using cEmail directly as a model-aware validator', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cEmail(field);

      expect(validator()).toEqual({
        valid: true,
        __brand: 'cEmail',
      });

      setValue('invalid-email');
      expect(validator()).toEqual(
        createExpectedException('cEmail', 'email', undefined),
      );

      const skippedValidator = cEmail({
        when: () => false,
      })(field);
      expect(skippedValidator()).toEqual({
        valid: true,
        __brand: 'cEmail',
      });

      setValue('valid@email.dev');
      expect(validator()).toEqual({
        valid: true,
        __brand: 'cEmail',
      });
    });
  });

  it('should return a deferred cMin validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cMin({
        min: () => 3,
        when: () => true,
      })(field);

      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMin',
      });

      setValue('2');
      expect(validator()).toEqual(createExpectedException('cMin', 'min', 3));

      const skippedValidator = cMin({
        min: () => 3,
        when: () => false,
      })(field);
      expect(skippedValidator()).toEqual({
        valid: true,
        __brand: 'cMin',
      });

      setValue('3');
      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMin',
      });
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
      })(baseField);

      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMax',
      });

      setBaseValue('100');
      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMax',
      });

      setDebouncedValue('11');
      expect(validator()).toEqual(createExpectedException('cMax', 'max', 10));

      const skippedValidator = cMax({
        max: () => 10,
        model: debouncedField,
        when: () => false,
      })(baseField);
      expect(skippedValidator()).toEqual({
        valid: true,
        __brand: 'cMax',
      });
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

      const [requiredValidator, minValidator, maxValidator] = validators.map(
        (validatorFactory) => validatorFactory(baseField),
      );

      expect(requiredValidator()).toEqual(
        createExpectedException('cRequired', 'required', undefined),
      );

      setBaseValue('2');
      expect(minValidator()).toEqual(createExpectedException('cMin', 'min', 3));

      expect(maxValidator()).toEqual(
        createExpectedException('cMax', 'max', 10),
      );

      setDebouncedValue('9');
      expect(maxValidator()).toEqual({
        valid: true,
        __brand: 'cMax',
      });
    });
  });

  it('should return a deferred cMaxLength validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cMaxLength({
        maxLength: 3,
        when: () => true,
      })(field);

      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMaxLength',
      });

      setValue('abcd');
      expect(validator()).toEqual(
        createExpectedException('cMaxLength', 'maxLength', 3),
      );

      const skippedValidator = cMaxLength({
        maxLength: 3,
        when: () => false,
      })(field);
      expect(skippedValidator()).toEqual({
        valid: true,
        __brand: 'cMaxLength',
      });

      setValue('abc');
      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMaxLength',
      });
    });
  });

  it('should return a deferred cMinLength validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cMinLength({
        minLength: 3,
        when: () => true,
      })(field);

      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMinLength',
      });

      setValue('ab');
      expect(validator()).toEqual(
        createExpectedException('cMinLength', 'minLength', 3),
      );

      const skippedValidator = cMinLength({
        minLength: 3,
        when: () => false,
      })(field);
      expect(skippedValidator()).toEqual({
        valid: true,
        __brand: 'cMinLength',
      });

      setValue('abc');
      expect(validator()).toEqual({
        valid: true,
        __brand: 'cMinLength',
      });
    });
  });

  it('should return a deferred cPattern validator that uses the provided model', () => {
    TestBed.runInInjectionContext(() => {
      const { field, setValue } = createField('');
      const validator = cPattern({
        pattern: () => /^\d+$/,
        when: () => true,
      })(field);

      expect(validator()).toEqual({
        valid: true,
        __brand: 'cPattern',
      });

      setValue('abc');
      expect(validator()).toEqual(
        createExpectedException('cPattern', 'pattern', /^\d+$/),
      );

      const skippedValidator = cPattern({
        pattern: () => /^\d+$/,
        when: () => false,
      })(field);
      expect(skippedValidator()).toEqual({
        valid: true,
        __brand: 'cPattern',
      });

      setValue('123');
      expect(validator()).toEqual({
        valid: true,
        __brand: 'cPattern',
      });
    });
  });
});
