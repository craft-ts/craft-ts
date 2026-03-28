import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CRAFT_EXCEPTION_SYMBOL, craftException } from '../craft-exception';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import {
  cAsyncValidate,
  cEmail,
  cMax,
  cMaxLength,
  cMin,
  cMinLength,
  cPattern,
  cRequired,
  cValidate,
  cValidator,
} from './validator';
import { query } from '../query';

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
      const model = signal('');
      const fieldForm = state(
        model,
        insertForm(
          insertFormAttributes(() => ({
            validators: [cRequired()],
          })),
        ),
      );

      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        cRequired: createExpectedException('cRequired', 'required', undefined),
      });

      model.set('test');
      TestBed.tick();

      expect(fieldForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      const skippedModel = signal('');
      const skippedForm = state(
        skippedModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cRequired({
                when: () => false,
              }),
            ],
          })),
        ),
      );

      expect(skippedForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should map email errors from signal forms to craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const emailModel = signal('');
      const emailForm = state(
        emailModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [cEmail()],
          })),
        ),
      );

      expect(emailForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      emailModel.set('invalid-email');
      TestBed.tick();

      expect(emailForm.form().exceptions().byValidator).toMatchObject({
        cEmail: createExpectedException('cEmail', 'email', undefined),
      });

      const skippedModel = signal('invalid-email');
      const skippedForm = state(
        skippedModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cEmail({
                when: () => false,
              }),
            ],
          })),
        ),
      );

      expect(skippedForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      emailModel.set('valid@email.dev');
      TestBed.tick();

      expect(emailForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should map min and max errors from signal forms to craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const minModel = signal('2');
      const minForm = state(
        minModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cMin({
                min: () => 3,
              }),
            ],
          })),
        ),
      );

      expect(minForm.form().exceptions().byValidator).toMatchObject({
        cMin: createExpectedException('cMin', 'min', 3),
      });

      minModel.set('3');
      TestBed.tick();

      expect(minForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      const maxModel = signal('11');
      const maxForm = state(
        maxModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cMax({
                max: () => 10,
              }),
            ],
          })),
        ),
      );

      expect(maxForm.form().exceptions().byValidator).toMatchObject({
        cMax: createExpectedException('cMax', 'max', 10),
      });

      const skippedMaxModel = signal('11');
      const skippedMaxForm = state(
        skippedMaxModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cMax({
                max: () => 10,
                when: () => false,
              }),
            ],
          })),
        ),
      );

      expect(skippedMaxForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should map length and pattern errors from signal forms to craft exceptions', () => {
    TestBed.runInInjectionContext(() => {
      const minLengthModel = signal('ab');
      const minLengthForm = state(
        minLengthModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cMinLength({
                minLength: 3,
              }),
            ],
          })),
        ),
      );

      expect(minLengthForm.form().exceptions().byValidator).toMatchObject({
        cMinLength: createExpectedException('cMinLength', 'minLength', 3),
      });

      const maxLengthModel = signal('abcd');
      const maxLengthForm = state(
        maxLengthModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cMaxLength({
                maxLength: 3,
              }),
            ],
          })),
        ),
      );

      expect(maxLengthForm.form().exceptions().byValidator).toMatchObject({
        cMaxLength: createExpectedException('cMaxLength', 'maxLength', 3),
      });

      const patternModel = signal('abc');
      const patternForm = state(
        patternModel,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cPattern({
                pattern: () => /^\d+$/,
              }),
            ],
          })),
        ),
      );

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

  it.todo(
    'should support custom async validators and return custom exceptions',
    async () => {
      await TestBed.runInInjectionContext(async () => {
        const validationQueryRef = query({
          method: (value: string) => value,
          loader: async ({ params }) => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (params === 'John') {
              return craftException({
                code: 'NameAlreadyExistsException',
              });
            }
            return { name: params };
          },
        });
        const fieldState = signal('');
        const fieldForm = state(
          fieldState,
          insertForm(
            insertFormAttributes(() => ({
              validators: [
                cAsyncValidate(validationQueryRef, {
                  name: 'myAsyncValidator',
                  when: () => true,
                  isValidSuccess: ({ validateAsyncCraftResource }) =>
                    validateAsyncCraftResource.value()?.name !== 'John',
                  exceptionsOnSuccess: ({ validateAsyncCraftResource }) => {
                    // add more exceptions
                    if (validateAsyncCraftResource.value()?.name === 'John') {
                      return craftException({
                        code: 'NameAlreadyExistsExceptionFromSuccess',
                      });
                    }
                    return undefined;
                  },
                  error: ({ validateAsyncCraftResource }) => {
                    // add more exceptions
                    if (
                      validateAsyncCraftResource.error()?.message === 'failed'
                    ) {
                      return craftException({ code: 'SubmitFailedFromError' });
                    }
                    return undefined;
                  },
                  // onException: ({
                  //   validateAsyncCraftResource,
                  //   omitExceptions,
                  // }) => {
                  //   // override exceptions

                  //   if (
                  //     validateAsyncCraftResource.exceptions().loader?.code ===
                  //     'NameAlreadyExistsException'
                  //   ) {
                  //     // add more exceptions
                  //     return craftException({
                  //       code: 'NameAlreadyExistsExceptionFromException',
                  //     });
                  //   }
                  //   // override exceptions and omit some exceptions
                  //   return omitExceptions(['NameAlreadyExistsException']);
                  // },
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
        await vi.runAllTimersAsync();

        // todo it is nit classed by validator but by code exceptions
        expect(fieldForm.form().exceptions().byValidator).toMatchObject({
          // todo
        });

        // todo
        expect(fieldForm.form().exceptions()).toEqual({
          list: [],
          byValidator: {},
        });

        // todo test types of exceptions
      });
    },
  );
});
