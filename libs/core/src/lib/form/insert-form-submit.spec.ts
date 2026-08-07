import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftException } from '../craft-exception';
import { mutation } from '../mutation';
import { state } from '../state';
import {
  insertForm,
  ValidatedFormValue,
  validatedFormValueSymbol,
} from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertFormSubmit } from './insert-form-submit';
import { cRequired } from './validator';
import { insertSelectFormTree } from './insert-select-form-tree';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { craftPipe } from '../craft-pipe';
import { craftUse } from '../craft-use';

type LoginData = {
  id: string;
  name: string;
  password: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('insertFormSubmit', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('submits without config (no second argument) — stays clean of exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitRef = craftUse(mutation('submitRef', {
          method: (validatedLogin: ValidatedFormValue<LoginData>) => {
            expect(validatedLogin?.[validatedFormValueSymbol]).toBe(true);
            return validatedLogin;
          },
          loader: async ({ params: login }) => {
            await wait(10000);
            return login;
          },
        }),
      );
      const loginForm = craftUse(state(
          'loginForm',
          {
            id: '1',
            name: 'John',
            password: '1234',
          } satisfies LoginData,
          insertForm(insertFormSubmit(submitRef)),
        ),
      );

      expect(loginForm.form.submitting()).toBe(false);
      expect(loginForm.form.hasSubmitExceptions()).toBe(false);
      expect(loginForm.form.submitExceptions()).toEqual([]);

      loginForm.form.submit();
      await vi.advanceTimersByTimeAsync(5000);
      expect(loginForm.form.submitting()).toBe(true);
      await vi.advanceTimersByTimeAsync(6000);
      expect(loginForm.form.submitting()).toBe(false);
      // No config, no resource exception → submit ends clean.
      expect(loginForm.form.hasSubmitExceptions()).toBe(false);
      expect(loginForm.form.submitExceptions()).toEqual([]);
    });
  });

  it('reflects mutation exceptions on the form', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitRef = craftUse(mutation('submitRef', {
          method: (login: ValidatedFormValue<LoginData>) => login,
          loader: async () => {
            await wait(10000);
            return craftException(
              { code: 'NameAlreadyExistsException' },
              { message: 'Name already exists' as const },
            );
          },
        }),
      );
      const loginForm = craftUse(state(
          'loginForm',
          { id: '1', name: 'John', password: '1234' } satisfies LoginData,
          insertForm(insertFormSubmit(submitRef)),
        ),
      );

      loginForm.form.submit();
      await vi.advanceTimersByTimeAsync(11000);

      expect(loginForm.form.hasSubmitExceptions()).toBe(true);
      const exceptions = loginForm.form.submitExceptions();
      expectTypeOf(
        exceptions[0]?.code,
      ).toEqualTypeOf<'NameAlreadyExistsException'>();
      expect(exceptions.length).toBeGreaterThan(0);
      expect(exceptions[0]?.code).toBe('NameAlreadyExistsException');
    });
  });

  it('marks hasAttemptedSubmit on submit()', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitRef = craftUse(mutation('submitRef', {
          method: (login: ValidatedFormValue<LoginData>) => login,
          loader: async ({ params }) => params,
        }),
      );
      const loginForm = craftUse(state(
          'loginForm',
          { id: '1', name: 'John', password: '1234' } satisfies LoginData,
          insertForm(insertFormSubmit(submitRef)),
        ),
      );

      expect(loginForm.form.hasAttemptedSubmit()).toBe(false);
      loginForm.form.submit();
      expect(loginForm.form.hasAttemptedSubmit()).toBe(true);
    });
  });

  it('does not call the loader when the form is invalid', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loaderSpy = vi.fn();
      const submitRef = craftUse(mutation('submitRef', {
          method: (validatedValue: ValidatedFormValue<string>) =>
            validatedValue,
          loader: async ({ params }) => {
            loaderSpy(params);
            return params;
          },
        }),
      );
      const loginForm = craftUse(state(
          'loginForm',
          '' as string,
          insertForm(
            insertFormAttributes(() => ({
              validators: [cRequired()],
            })),
            insertFormSubmit(submitRef),
          ),
        ),
      );

      expect(loginForm.form.hasAttemptedSubmit()).toBe(false);
      loginForm.form.submit();

      expect(loaderSpy).not.toHaveBeenCalled();
      expect(loginForm.form.submitting()).toBe(false);
      expect(loginForm.form.hasAttemptedSubmit()).toBe(true);
    });
  });

  // Regression: the parent's `valid()` must reflect children's validity, so
  // submit() bails out when a sub-field validator (e.g. cRequired on `name`
  // via insertSelectFormTree('name', insertFormAttributes(...))) fails.
  it('does not call the loader when a sub-field validator fails', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loaderSpy = vi.fn();
      const submitRef = craftUse(mutation('submitRef', {
          method: (
            validatedValue: ValidatedFormValue<{ name: string; age: number }>,
          ) => validatedValue,
          loader: async ({ params }) => {
            loaderSpy(params);
            return params;
          },
        }),
      );
      const userForm = craftUse(state(
          'userForm',
          { name: '', age: 0 },
          insertForm(
            insertFormSubmit(submitRef),
            insertSelectFormTree('name', (context) =>
              craftPipe(
                context,
                insertNoopTypingAnchor,
                insertFormAttributes(() => ({
                  validators: [cRequired()],
                })),
              ),
            ),
          ),
        ),
      );

      // Force materialization of the sub-field (mirrors the template doing
      // `userForm.selectName()` so its validators get registered).
      userForm.form.selectName();
      // Yield a microtask so the registration revision bumps propagate.
      await Promise.resolve();

      expect(userForm.form.invalid()).toBe(true);
      expect(userForm.form.valid()).toBe(false);

      userForm.form.submit();

      expect(loaderSpy).not.toHaveBeenCalled();
      expect(userForm.form.hasAttemptedSubmit()).toBe(true);
    });
  });

  describe('config callbacks', () => {
    it('success callback adds exceptions on resolved (no mutation exception)', async () => {
      await TestBed.runInInjectionContext(async () => {
        const submitRef = craftUse(mutation('submitRef', {
            method: (login: ValidatedFormValue<LoginData>) => login,
            loader: async ({ params }) => {
              await wait(10);
              return params;
            },
          }),
        );
        const loginForm = craftUse(state(
            'loginForm',
            { id: '1', name: 'John', password: '1234' } satisfies LoginData,
            insertForm(
              insertFormSubmit(submitRef, {
                success: ({ submitCraftResource }) =>
                  submitCraftResource.value()?.name === 'John'
                    ? craftException(
                        { code: 'NameAlreadyExistsExceptionFromSuccess' },
                        undefined,
                      )
                    : undefined,
              }),
            ),
          ),
        );

        loginForm.form.submit();
        await vi.advanceTimersByTimeAsync(20);

        const exceptions = loginForm.form.submitExceptions();
        expectTypeOf(
          exceptions[0]?.code,
        ).toEqualTypeOf<'NameAlreadyExistsExceptionFromSuccess'>();
        expect(exceptions.length).toBe(1);
        expect(exceptions[0]?.code).toBe(
          'NameAlreadyExistsExceptionFromSuccess',
        );
      });
    });

    it('exceptions rules can omit mutation exceptions and add typed form submit exceptions', async () => {
      await TestBed.runInInjectionContext(async () => {
        const submitRef = craftUse(mutation('submitRef', {
            method: (login: ValidatedFormValue<LoginData>) => login,
            loader: async () => {
              await wait(10);
              return craftException(
                { code: 'NameAlreadyExistsException' },
                { message: 'Name already exists' as const },
              );
            },
          }),
        );
        const loginForm = craftUse(state(
            'loginForm',
            { id: '1', name: 'John', password: '1234' } satisfies LoginData,
            insertForm(
              insertFormSubmit(submitRef, {
                exceptions: [
                  ({ omit }) => omit(['NameAlreadyExistsException']),
                  ({ submitCraftResource }) => {
                    const list = submitCraftResource.exceptions()?.list ?? [];
                    expectTypeOf(
                      list[0]?.code,
                    ).toEqualTypeOf<'NameAlreadyExistsException'>();
                    if (
                      list.some((e) => e.code === 'NameAlreadyExistsException')
                    ) {
                      return craftException(
                        { code: 'NameAlreadyExistsExceptionFromException' },
                        undefined,
                      );
                    }
                    return undefined;
                  },
                ],
              }),
            ),
          ),
        );

        loginForm.form.submit();
        await vi.advanceTimersByTimeAsync(20);

        const exceptions = loginForm.form.submitExceptions();
        expectTypeOf(
          exceptions[0]?.code,
        ).toEqualTypeOf<'NameAlreadyExistsExceptionFromException'>();
        expect(exceptions.length).toBe(1);
        expect(exceptions[0]?.code).toBe(
          'NameAlreadyExistsExceptionFromException',
        );
      });
    });

    it('exceptions rules can omit specific mutation exceptions', async () => {
      await TestBed.runInInjectionContext(async () => {
        const submitRef = craftUse(mutation('submitRef', {
            method: (login: ValidatedFormValue<LoginData>) => login,
            loader: async () => {
              await wait(10);
              return craftException(
                { code: 'NameAlreadyExistsException' },
                { message: 'Name already exists' as const },
              );
            },
          }),
        );
        const loginForm = craftUse(state(
            'loginForm',
            { id: '1', name: 'John', password: '1234' } satisfies LoginData,
            insertForm(
              insertFormSubmit(submitRef, {
                exceptions: [
                  ({ omit }) => omit(['NameAlreadyExistsException']),
                ],
              }),
            ),
          ),
        );

        loginForm.form.submit();
        await vi.advanceTimersByTimeAsync(20);

        const exceptions = loginForm.form.submitExceptions();
        expectTypeOf(exceptions).toEqualTypeOf<never[]>();
        expect(exceptions).toEqual([]);
        expect(loginForm.form.hasSubmitExceptions()).toBe(true);
      });
    });

    it('success callback does NOT fire when the mutation returned an exception', async () => {
      await TestBed.runInInjectionContext(async () => {
        const successSpy = vi.fn(() => undefined);
        const submitRef = craftUse(mutation('submitRef', {
            method: (login: ValidatedFormValue<LoginData>) => login,
            loader: async () => {
              await wait(10);
              return craftException({ code: 'BizError' }, undefined);
            },
          }),
        );
        const loginForm = craftUse(state(
            'loginForm',
            { id: '1', name: 'John', password: '1234' } satisfies LoginData,
            insertForm(insertFormSubmit(submitRef, { success: successSpy })),
          ),
        );

        loginForm.form.submit();
        await vi.advanceTimersByTimeAsync(20);

        expect(successSpy).not.toHaveBeenCalled();
      });
    });

    it('resets the form after a successful resolved mutation', async () => {
      await TestBed.runInInjectionContext(async () => {
        const submitRef = craftUse(mutation('submitRef', {
            method: (login: ValidatedFormValue<LoginData>) => login,
            loader: async ({ params }) => {
              await wait(10);
              return params;
            },
          }),
        );
        const loginForm = craftUse(state(
            'loginForm',
            { id: '1', name: 'John', password: '1234' } satisfies LoginData,
            insertForm(insertFormSubmit(submitRef)),
          ),
        );

        loginForm.form.name.set('Jane');
        expect(loginForm.form.dirty()).toBe(true);

        loginForm.form.submit();
        await vi.advanceTimersByTimeAsync(20);

        expect(loginForm.form.dirty()).toBe(false);
      });
    });
  });
});

describe('insertFormSubmit — parallel forms', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('each parallel form has its own submitting state', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitRef = craftUse(mutation('submitRef', {
          method: (validatedLogin: ValidatedFormValue<LoginData>) => {
            expect(validatedLogin?.[validatedFormValueSymbol]).toBe(true);
            return validatedLogin;
          },
          identifier: ({ id }) => id,
          loader: async ({ params: login }) => {
            await wait(10000);
            return login;
          },
        }),
      );

      const loginForms = craftUse(state(
          'loginForms',
          [
            { id: '1', name: '1', password: '' },
            { id: '2', name: '2', password: '' },
          ] satisfies LoginData[],
          insertForm(
            { identifier: ({ item: { id } }) => id },
            insertFormSubmit(submitRef),
            ({ update }) => ({
              setName: (name: string) => update((v) => ({ ...v, name })),
            }),
          ),
        ),
      );

      const form1 = loginForms.select('1');
      const form2 = loginForms.select('2');
      expect(form1).toBeDefined();
      expect(form2).toBeDefined();

      expect(form1!.submitExceptions()).toEqual([]);
      expect(form2!.submitExceptions()).toEqual([]);

      form1!.setName('John');
      form1!.submit();

      await vi.advanceTimersByTimeAsync(5000);
      // Only form 1 is in flight
      expect(form1!.submitting()).toBe(true);
      expect(form2!.submitting()).toBe(false);

      await vi.advanceTimersByTimeAsync(6000);
      expect(form1!.submitting()).toBe(false);
      expect(form2!.submitting()).toBe(false);

      expect(form1!.value().name).toBe('John');
      expect(form2!.value().name).toBe('2');
    });
  });

  it('each parallel form has its own exceptions and override callbacks', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitRef = craftUse(mutation('submitRef', {
          method: (validatedLogin: ValidatedFormValue<LoginData>) =>
            validatedLogin,
          identifier: ({ id }: { id: string }) => id,
          loader: async () => {
            await wait(10);
            return craftException(
              { code: 'NameAlreadyExistsException' },
              { message: 'Name already exists' as const },
            );
          },
        }),
      );

      const loginForms = craftUse(state(
          'loginForms',
          [
            { id: '1', name: '1', password: '' },
            { id: '2', name: '2', password: '' },
          ] satisfies LoginData[],
          insertForm(
            { identifier: ({ item: { id } }) => id },
            insertFormSubmit(submitRef, {
              exceptions: [
                ({ omit }) => omit(['NameAlreadyExistsException']),
                ({ submitCraftResource }) => {
                  const list = submitCraftResource.exceptions()?.list ?? [];
                  if (
                    list.some((e) => e.code === 'NameAlreadyExistsException')
                  ) {
                    return craftException(
                      { code: 'NameAlreadyExistsExceptionFromException' },
                      undefined,
                    );
                  }
                  return undefined;
                },
              ],
            }),
          ),
        ),
      );

      const form1 = loginForms.select('1');
      const form2 = loginForms.select('2');

      // Only form1 submits → only form1 ends up with the overridden exception.
      form1!.submit();
      await vi.advanceTimersByTimeAsync(20);

      expect(form1!.hasSubmitExceptions()).toBe(true);
      const f1Exceptions = form1!.submitExceptions();
      expectTypeOf(
        f1Exceptions[0]?.code,
      ).toEqualTypeOf<'NameAlreadyExistsExceptionFromException'>();
      expect(f1Exceptions.length).toBe(1);
      expect(f1Exceptions[0]?.code).toBe(
        'NameAlreadyExistsExceptionFromException',
      );

      expect(form2!.hasSubmitExceptions()).toBe(false);
      expect(form2!.submitExceptions()).toEqual([]);
    });
  });
});
