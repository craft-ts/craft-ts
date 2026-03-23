import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  cValidate,
  cEmail,
  cMax,
  cMaxLength,
  cMin,
  cMinLength,
  cPattern,
  cRequired,
  cValidator,
} from './validator';
import {
  craftException,
  CRAFT_EXCEPTION_SYMBOL,
} from '../craft-exception';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';

function createValidatedField<TValue>(initialValue: TValue, validators: unknown[]) {
  const model = signal(initialValue);
  const fieldForm = state(
    model,
    insertForm(
      insertFormAttributes(() => ({
        validators,
      })),
    ),
  );

  return {
    form: fieldForm.form,
    setValue: (value: TValue) => model.set(value),
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
    type: 'sync' as const,
  };
}

describe('validator', () => {
  it('should map required errors from signal forms to craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const { form, setValue } = createValidatedField('', [cRequired()]);

      expect(form().exceptions().byValidator).toMatchObject({
        cRequired: createExpectedException('cRequired', 'required', undefined),
      });

      setValue('test');
      TestBed.tick();

      expect(form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      const skippedForm = createValidatedField('', [
        cRequired({
          when: () => false,
        }),
      ]);

      expect(skippedForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should map email errors from signal forms to craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const { form, setValue } = createValidatedField('', [cEmail()]);

      expect(form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      setValue('invalid-email');
      TestBed.tick();

      expect(form().exceptions().byValidator).toMatchObject({
        cEmail: createExpectedException('cEmail', 'email', undefined),
      });

      const skippedForm = createValidatedField('invalid-email', [
        cEmail({
          when: () => false,
        }),
      ]);

      expect(skippedForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      setValue('valid@email.dev');
      TestBed.tick();

      expect(form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should map min and max errors from signal forms to craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const minForm = createValidatedField('2', [
        cMin({
          min: () => 3,
        }),
      ]);

      expect(minForm.form().exceptions().byValidator).toMatchObject({
        cMin: createExpectedException('cMin', 'min', 3),
      });

      minForm.setValue('3');
      TestBed.tick();

      expect(minForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      const maxForm = createValidatedField('11', [
        cMax({
          max: () => 10,
        }),
      ]);

      expect(maxForm.form().exceptions().byValidator).toMatchObject({
        cMax: createExpectedException('cMax', 'max', 10),
      });

      const skippedMaxForm = createValidatedField('11', [
        cMax({
          max: () => 10,
          when: () => false,
        }),
      ]);

      expect(skippedMaxForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should map length and pattern errors from signal forms to craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const minLengthForm = createValidatedField('ab', [
        cMinLength({
          minLength: 3,
        }),
      ]);

      expect(minLengthForm.form().exceptions().byValidator).toMatchObject({
        cMinLength: createExpectedException('cMinLength', 'minLength', 3),
      });

      const maxLengthForm = createValidatedField('abcd', [
        cMaxLength({
          maxLength: 3,
        }),
      ]);

      expect(maxLengthForm.form().exceptions().byValidator).toMatchObject({
        cMaxLength: createExpectedException('cMaxLength', 'maxLength', 3),
      });

      const patternForm = createValidatedField('abc', [
        cPattern({
          pattern: () => /^\d+$/,
        }),
      ]);

      expect(patternForm.form().exceptions().byValidator).toMatchObject({
        cPattern: createExpectedException('cPattern', 'pattern', /^\d+$/),
      });
    });
  });

  it('should support custom sync validators derived from signal form errors', () => {
    TestBed.runInInjectionContext(() => {
      const fieldState = signal('');
      const fieldForm = state(
        fieldState,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cValidate({
                name: 'myCustomValidator',
                validWhen: () => fieldState() !== 'blocked',
                exception: () =>
                  craftException(
                    {
                      code: 'blockedValue',
                    },
                    {
                      reason: 'reserved',
                    },
                  ),
              }),
            ],
          })),
        ),
      );

      expect(fieldForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      fieldState.set('blocked');
      TestBed.tick();

      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        myCustomValidator: {
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
        },
      });

      const skippedFieldForm = state(
        signal('blocked'),
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cValidate({
                name: 'myCustomValidator',
                when: () => false,
                validWhen: () => false,
                exception: () =>
                  craftException(
                    {
                      code: 'blockedValue',
                    },
                    {
                      reason: 'reserved',
                    },
                  ),
              }),
            ],
          })),
        ),
      );

      expect(skippedFieldForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should expose cValidator as an alias of cValidate', () => {
    expect(cValidator).toBe(cValidate);
  });
});
