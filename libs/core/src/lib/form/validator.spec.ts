import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CRAFT_EXCEPTION_SYMBOL, craftException } from '../craft-exception';
import { query } from '../query';
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
import { craftUse } from '../craft-use';

function expectedException<
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
  it('reports cRequired as a craft exception', () => {
    TestBed.runInInjectionContext(() => {
      const model = signal('');
      const fieldForm = craftUse(
        state(
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired()],
            })),
          ),
        ),
      );

      expect(fieldForm.form.exceptions().byValidator).toMatchObject({
        cRequired: expectedException('cRequired', 'required', undefined),
      });

      model.set('test');
      TestBed.tick();

      expect(fieldForm.form.exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('honors `when` to skip validation', () => {
    TestBed.runInInjectionContext(() => {
      const model = signal('');
      const fieldForm = craftUse(
        state(
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired({ when: () => false })],
            })),
          ),
        ),
      );
      expect(fieldForm.form.exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('reports cEmail when value does not match', () => {
    TestBed.runInInjectionContext(() => {
      const model = signal('');
      const fieldForm = craftUse(
        state(
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cEmail()],
            })),
          ),
        ),
      );

      expect(fieldForm.form.exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      model.set('invalid-email');
      TestBed.tick();

      expect(fieldForm.form.exceptions().byValidator).toMatchObject({
        cEmail: expectedException('cEmail', 'email', undefined),
      });

      model.set('valid@email.dev');
      TestBed.tick();

      expect(fieldForm.form.exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('reports cMin and cMax when value is outside range', () => {
    TestBed.runInInjectionContext(() => {
      const minModel = signal('2');
      const minForm = craftUse(
        state(
          minModel,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMin({ min: () => 3 })],
            })),
          ),
        ),
      );

      expect(minForm.form.exceptions().byValidator).toMatchObject({
        cMin: expectedException('cMin', 'min', 3),
      });

      minModel.set('3');
      TestBed.tick();

      expect(minForm.form.exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      const maxModel = signal('11');
      const maxForm = craftUse(
        state(
          maxModel,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMax({ max: () => 10 })],
            })),
          ),
        ),
      );

      expect(maxForm.form.exceptions().byValidator).toMatchObject({
        cMax: expectedException('cMax', 'max', 10),
      });
    });
  });

  it('reports cMinLength on an empty array', () => {
    TestBed.runInInjectionContext(() => {
      const model = signal<string[]>([]);
      const fieldForm = craftUse(
        state(
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMinLength({ minLength: 1 })],
            })),
          ),
        ),
      );

      expect(fieldForm.form.exceptions().byValidator).toMatchObject({
        cMinLength: expectedException('cMinLength', 'minLength', 1),
      });

      model.set(['first']);
      TestBed.tick();

      expect(fieldForm.form.exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('reports cMinLength, cMaxLength and cPattern errors', () => {
    TestBed.runInInjectionContext(() => {
      const minLenForm = craftUse(
        state(
          signal('ab'),
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMinLength({ minLength: 3 })],
            })),
          ),
        ),
      );
      expect(minLenForm.form.exceptions().byValidator).toMatchObject({
        cMinLength: expectedException('cMinLength', 'minLength', 3),
      });

      const maxLenForm = craftUse(
        state(
          signal('abcd'),
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMaxLength({ maxLength: 3 })],
            })),
          ),
        ),
      );
      expect(maxLenForm.form.exceptions().byValidator).toMatchObject({
        cMaxLength: expectedException('cMaxLength', 'maxLength', 3),
      });

      const patternForm = craftUse(
        state(
          signal('abc'),
          insertForm(
            insertFormAttributes(() => ({
              validators: [cPattern({ pattern: () => /^\d+$/ })],
            })),
          ),
        ),
      );
      expect(patternForm.form.exceptions().byValidator).toMatchObject({
        cPattern: expectedException('cPattern', 'pattern', /^\d+$/),
      });
    });
  });

  it('supports custom sync validators with cValidate', () => {
    TestBed.runInInjectionContext(() => {
      const fieldState = signal('');
      const fieldForm = craftUse(
        state(
          fieldState,
          insertForm(
            insertFormAttributes(() => ({
              validators: [
                cValidate({
                  name: 'myCustomValidator',
                  validWhen: () => fieldState() !== 'blocked',
                  exception: () =>
                    craftException(
                      { code: 'blockedValue' },
                      { reason: 'reserved' },
                    ),
                }),
              ],
            })),
          ),
        ),
      );
      expect(fieldForm.form.exceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      fieldState.set('blocked');
      TestBed.tick();

      expect(fieldForm.form.exceptions().byValidator).toMatchObject({
        myCustomValidator: {
          ...craftException({ code: 'blockedValue' }, { reason: 'reserved' }),
          __brand: 'myCustomValidator',
          type: 'sync',
        },
      });
    });
  });

  it('exposes cValidator as an alias of cValidate', () => {
    expect(cValidator).toBe(cValidate);
  });

  it('supports custom async validators (cAsyncValidate)', async () => {
    vi.useFakeTimers();
    try {
      await TestBed.runInInjectionContext(async () => {
        const model = signal('');
        const usernameQuery = craftUse(
          query({
            method: (username: string) => username,
            loader: async ({ params }) => ({ available: params !== 'taken' }),
          }),
        );

        const fieldForm = craftUse(
          state(
            model,
            insertForm(
              insertFormAttributes(() => ({
                validators: [
                  cAsyncValidate(usernameQuery, {
                    name: 'usernameAvailable',
                    when: () => model().length > 0,
                    exceptionsOnSuccess: ({ validateAsyncCraftResource }) =>
                      validateAsyncCraftResource.value()?.available
                        ? undefined
                        : craftException(
                            { code: 'usernameTaken' },
                            { message: 'Username already taken' },
                          ),
                  }),
                ],
              })),
            ),
          ),
        );

        // `when` is false while the field is empty: nothing is validated.
        expect(fieldForm.form.exceptions()).toEqual({
          list: [],
          byValidator: {},
        });

        // A taken username resolves successfully but fails the success check.
        model.set('taken');
        TestBed.tick();
        await vi.runAllTimersAsync();
        TestBed.tick();

        expect(fieldForm.form.exceptions().byValidator).toMatchObject({
          usernameAvailable: {
            ...craftException(
              { code: 'usernameTaken' },
              { message: 'Username already taken' },
            ),
            __brand: 'usernameAvailable',
            type: 'async',
          },
        });

        // An available username clears the exception.
        model.set('available');
        TestBed.tick();
        await vi.runAllTimersAsync();
        TestBed.tick();

        expect(fieldForm.form.exceptions()).toEqual({
          list: [],
          byValidator: {},
        });
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
