import {
  signal,
} from '../host/craft-compat';
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
import {
  flushCraftTest,
  setupCraftServiceTest,
} from '../setup-craft-service-test';


const runInInjectionContext = <T>(fn: () => T): T => {
  const { injector } = setupCraftServiceTest();
  lastInjector = injector;
  return injector.run(fn);
};
let lastInjector: ReturnType<typeof setupCraftServiceTest>['injector'];
const flushHost = () => flushCraftTest(lastInjector);

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
  it('reports cRequired as a craft exception', async () => {
    await runInInjectionContext(async () => {
      const model = signal('');
      const fieldForm = craftUse(
        state(
          'fieldForm',
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired()],
            })),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        cRequired: expectedException('cRequired', 'required', undefined),
      });

      model.set('test');
      flushHost();

      expect(craftUse(fieldForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('honors `when` to skip validation', async () => {
    await runInInjectionContext(async () => {
      const model = signal('');
      const fieldForm = craftUse(
        state(
          'fieldForm',
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired({ when: () => false })],
            })),
          ),
        ),
      );
      expect(craftUse(fieldForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('reports cEmail when value does not match', async () => {
    await runInInjectionContext(async () => {
      const model = signal('');
      const fieldForm = craftUse(
        state(
          'fieldForm',
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cEmail()],
            })),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });

      model.set('invalid-email');
      flushHost();

      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        cEmail: expectedException('cEmail', 'email', undefined),
      });

      model.set('valid@email.dev');
      flushHost();

      expect(craftUse(fieldForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('reports cMin and cMax when value is outside range', async () => {
    await runInInjectionContext(async () => {
      const minModel = signal('2');
      const minForm = craftUse(
        state(
          'minForm',
          minModel,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMin({ min: () => 3 })],
            })),
          ),
        ),
      );

      expect(craftUse(minForm.form.exceptions()).byValidator).toMatchObject({
        cMin: expectedException('cMin', 'min', 3),
      });

      minModel.set('3');
      flushHost();

      expect(craftUse(minForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });

      const maxModel = signal('11');
      const maxForm = craftUse(
        state(
          'maxForm',
          maxModel,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMax({ max: () => 10 })],
            })),
          ),
        ),
      );

      expect(craftUse(maxForm.form.exceptions()).byValidator).toMatchObject({
        cMax: expectedException('cMax', 'max', 10),
      });
    });
  });

  it('reports cMinLength on an empty array', async () => {
    await runInInjectionContext(async () => {
      const model = signal<string[]>([]);
      const fieldForm = craftUse(
        state(
          'fieldForm',
          model,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMinLength({ minLength: 1 })],
            })),
          ),
        ),
      );

      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        cMinLength: expectedException('cMinLength', 'minLength', 1),
      });

      model.set(['first']);
      flushHost();

      expect(craftUse(fieldForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('reports cMinLength, cMaxLength and cPattern errors', async () => {
    await runInInjectionContext(async () => {
      const minLenForm = craftUse(
        state(
          'minLenForm',
          signal('ab'),
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMinLength({ minLength: 3 })],
            })),
          ),
        ),
      );
      expect(craftUse(minLenForm.form.exceptions()).byValidator).toMatchObject({
        cMinLength: expectedException('cMinLength', 'minLength', 3),
      });

      const maxLenForm = craftUse(
        state(
          'maxLenForm',
          signal('abcd'),
          insertForm(
            insertFormAttributes(() => ({
              validators: [cMaxLength({ maxLength: 3 })],
            })),
          ),
        ),
      );
      expect(craftUse(maxLenForm.form.exceptions()).byValidator).toMatchObject({
        cMaxLength: expectedException('cMaxLength', 'maxLength', 3),
      });

      const patternForm = craftUse(
        state(
          'patternForm',
          signal('abc'),
          insertForm(
            insertFormAttributes(() => ({
              validators: [cPattern({ pattern: () => /^\d+$/ })],
            })),
          ),
        ),
      );
      expect(craftUse(patternForm.form.exceptions()).byValidator).toMatchObject(
        {
          cPattern: expectedException('cPattern', 'pattern', /^\d+$/),
        },
      );
    });
  });

  it('supports custom sync validators with cValidate', async () => {
    await runInInjectionContext(async () => {
      const fieldState = signal('');
      const fieldForm = craftUse(
        state(
          'fieldForm',
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
      expect(craftUse(fieldForm.form.exceptions())).toEqual({
        list: [],
        byValidator: {},
      });

      fieldState.set('blocked');
      flushHost();

      expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject({
        myCustomValidator: {
          ...craftException({ code: 'blockedValue' }, { reason: 'reserved' }),
          __brand: 'myCustomValidator',
          type: 'sync',
        },
      });
    });
  });

  it('exposes cValidator as an alias of cValidate', async () => {
    expect(cValidator).toBe(cValidate);
  });

  it('supports custom async validators (cAsyncValidate)', async () => {
    vi.useFakeTimers();
    try {
      await runInInjectionContext(async () => {
        const model = signal('');
        const usernameQuery = craftUse(
          query('usernameQuery', {
            method: (username: string) => username,
            loader: async ({ params }) => ({ available: params !== 'taken' }),
          }),
        );

        const fieldForm = craftUse(
          state(
            'fieldForm',
            model,
            insertForm(
              insertFormAttributes(() => ({
                validators: [
                  cAsyncValidate(usernameQuery, {
                    name: 'usernameAvailable',
                    when: () => model().length > 0,
                    exceptionsOnSuccess: ({ validateAsyncCraftResource }) =>
                      craftUse(validateAsyncCraftResource.value())?.available
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
        expect(craftUse(fieldForm.form.exceptions())).toEqual({
          list: [],
          byValidator: {},
        });

        // A taken username resolves successfully but fails the success check.
        model.set('taken');
        flushHost();
        await vi.runAllTimersAsync();
        flushHost();

        expect(craftUse(fieldForm.form.exceptions()).byValidator).toMatchObject(
          {
            usernameAvailable: {
              ...craftException(
                { code: 'usernameTaken' },
                { message: 'Username already taken' },
              ),
              __brand: 'usernameAvailable',
              type: 'async',
            },
          },
        );

        // An available username clears the exception.
        model.set('available');
        flushHost();
        await vi.runAllTimersAsync();
        flushHost();

        expect(craftUse(fieldForm.form.exceptions())).toEqual({
          list: [],
          byValidator: {},
        });
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
