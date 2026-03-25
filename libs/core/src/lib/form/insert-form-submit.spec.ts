import { TestBed } from '@angular/core/testing';
import { state } from '../state';
import {
  insertForm,
  ValidatedFormValue,
  validatedFormValueSymbol,
} from './insert-form';
import { insertFormSubmit } from './insert-form-submit';
import { signal } from '@angular/core';
import { craftException, CraftExceptionResult } from '../craft-exception';
import { mutation } from '../mutation';
import { insertFormAttributes } from './insert-form-attributes';
import { cRequired } from './validator';

type LoginData = {
  id: string;
  name: string;
  password: string;
};

describe('insertFormSubmit', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  it('should submit the form when submit method is called', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitRef = mutation({
        method: (validatedLogin: ValidatedFormValue<LoginData>) => {
          expect(validatedLogin?.[validatedFormValueSymbol]).toBe(true);
          return validatedLogin;
        },
        loader: async ({ params: login }) => {
          await wait(10000);
          return login;
        },
      });
      const loginForm = state(
        {
          id: '1',
          name: 'John',
          password: '1234',
        } satisfies LoginData,
        insertForm(
          insertFormSubmit(submitRef, {
            success: ({ submitCraftResource }) => {
              expect(submitCraftResource.value).toBeDefined();
              expectTypeOf(submitCraftResource.value()).toEqualTypeOf<
                ValidatedFormValue<LoginData> | undefined
              >();
              expect(submitCraftResource.value()?.name).toBe('John');
              expect(submitCraftResource.value()?.password).toBe('1234');
              if (submitCraftResource.value()?.name === 'John') {
                return craftException(
                  { code: 'NameAlreadyExistsException' },
                  { message: 'Name already exists' as const },
                );
              }
              return undefined;
            },
          }),
        ),
      );

      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasSubmitExceptions()).toBe(false);
      expect(loginForm.form().submitExceptions()).toEqual([]);
      loginForm.form().submit();
      await vi.advanceTimersByTimeAsync(5000);
      expect(loginForm.form().submitting()).toBe(true);
      await vi.advanceTimersByTimeAsync(6000);
      expect(loginForm.form().submitting()).toBe(false);
    });
  });

  it('should reflect the submit exception in the form when submit method is called', async () => {
    await TestBed.runInInjectionContext(async () => {
      const throwRef = signal(true);
      const submitRef = mutation({
        method: (validatedLogin: ValidatedFormValue<LoginData>) => {
          expect(validatedLogin?.[validatedFormValueSymbol]).toBe(true);
          return validatedLogin;
        },
        loader: async ({ params: login }) => {
          await wait(10000);
          if (throwRef()) {
            return craftException(
              { code: 'NameAlreadyExistsException' },
              { message: 'Name already exists' as const },
            );
          }
          return login;
        },
      });
      const loginForm = state(
        {
          id: '1',
          name: 'John',
          password: '1234',
        } satisfies LoginData,
        insertForm(insertFormSubmit(submitRef)),
      );

      expectTypeOf(loginForm.form().hasExceptions()).toEqualTypeOf<boolean>();
      expectTypeOf(loginForm.form().exceptions().submit).toEqualTypeOf<
        CraftExceptionResult<
          {
            code: 'NameAlreadyExistsException';
            scope: 'loader';
          },
          {
            message: 'Name already exists';
          }
        >[]
      >();
      expectTypeOf(
        loginForm.form().hasSubmitExceptions(),
      ).toEqualTypeOf<boolean>();
      expectTypeOf(loginForm.form().submitExceptions()).toEqualTypeOf<
        CraftExceptionResult<
          {
            code: 'NameAlreadyExistsException';
            scope: 'loader';
          },
          {
            message: 'Name already exists';
          }
        >[]
      >();
    });
  });
  it('should reflect the submit exception in the form when submit method is called', async () => {
    await TestBed.runInInjectionContext(async () => {
      const throwRef = signal(true);
      const submitRef = mutation({
        method: (validatedLogin: ValidatedFormValue<LoginData>) => {
          expect(validatedLogin?.[validatedFormValueSymbol]).toBe(true);
          return validatedLogin;
        },
        loader: async ({ params: login }) => {
          await wait(10000);
          if (throwRef()) {
            return craftException(
              { code: 'NameAlreadyExistsException' },
              { message: 'Name already exists' as const },
            );
          }
          if (throwRef()) {
            return craftException(
              { code: 'Server error' },
              { message: 'Server error' as const },
            );
          }
          return login;
        },
      });
      const loginForm = state(
        {
          id: '1',
          name: 'John',
          password: '1234',
        } satisfies LoginData,
        insertForm(
          insertFormSubmit(submitRef, {
            success: ({ submitCraftResource, form }) => {
              form().reset();
              // add more exceptions
              if (submitCraftResource.value()?.name === 'John') {
                return craftException({
                  code: 'NameAlreadyExistsExceptionFromSuccess',
                });
              }
              return undefined;
            },
            error: ({ submitCraftResource }) => {
              // add more exceptions
              if (submitCraftResource.error()?.message === 'failed') {
                return craftException({ code: 'SubmitFailedFromError' });
              }
              return undefined;
            },
            exception: (data) => {
              // override exceptions
              const { submitCraftResource, omitExceptions } = data;

              if (
                submitCraftResource.exceptions().loader?.code ===
                'NameAlreadyExistsException'
              ) {
                // add more exceptions
                return craftException({
                  code: 'NameAlreadyExistsExceptionFromException',
                });
              }
              // override exceptions and omit some exceptions
              return omitExceptions(['NameAlreadyExistsException']);
            },
          }),
        ),
      );
      // todo check exceptions are propertly associated to the form and can be displayed in the template
      loginForm.form().submitExceptions();
      expectTypeOf(loginForm.form().hasExceptions()).toEqualTypeOf<boolean>();
      expectTypeOf(loginForm.form().exceptions().submit).toEqualTypeOf<
        (
          | CraftExceptionResult<
              {
                code: 'NameAlreadyExistsExceptionFromSuccess';
                scope: 'insertFormSubmitSuccess';
              },
              undefined
            >
          | CraftExceptionResult<
              {
                code: 'SubmitFailedFromError';
                scope: 'insertFormSubmitError';
              },
              undefined
            >
          | CraftExceptionResult<
              {
                code: 'Server error';
                scope: 'insertFormSubmitException';
              },
              {
                message: 'Server error';
              }
            >
          | CraftExceptionResult<
              {
                code: 'NameAlreadyExistsExceptionFromException';
                scope: 'insertFormSubmitException';
              },
              undefined
            >
        )[]
      >();
    });
  });

  it('should mark the form as attempted before returning when submit is called on an invalid form', async () => {
    await TestBed.runInInjectionContext(async () => {
      const loaderSpy = vi.fn(async ({ params }: { params: string }) => params);
      const submitRef = mutation({
        method: (validatedValue: ValidatedFormValue<string>) => validatedValue,
        loader: loaderSpy,
      });

      const loginForm = state(
        '' as string,
        insertForm(
          insertFormAttributes(() => ({
            validators: [cRequired()],
          })),
          insertFormSubmit(submitRef),
        ),
      );

      expect(loginForm.form().hasAttemptedSubmit()).toBe(false);
      expect(loginForm.form().submitting()).toBe(false);

      await loginForm.form().submit();

      expect(loaderSpy).not.toHaveBeenCalled();
      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasAttemptedSubmit()).toBe(true);
    });
  });

  it('should submit the form without config (no second argument)', async () => {
    await TestBed.runInInjectionContext(async () => {
      const throwRef = signal(false);
      const submitRef = mutation({
        method: (validatedLogin: ValidatedFormValue<LoginData>) => {
          return validatedLogin;
        },
        loader: async ({ params: login }) => {
          await wait(10000);
          if (throwRef()) {
            return craftException(
              { code: 'NameAlreadyExistsException' },
              { message: 'Name already exists' as const },
            );
          }
          return login;
        },
      });
      const loginForm = state(
        {
          id: '1',
          name: 'John',
          password: '1234',
        } satisfies LoginData,
        insertForm(insertFormSubmit(submitRef)),
      );

      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasSubmitExceptions()).toBe(false);
      expect(loginForm.form().submitExceptions()).toEqual([]);

      loginForm.form().submit();
      await vi.advanceTimersByTimeAsync(5000);
      expect(loginForm.form().submitting()).toBe(true);
      await vi.advanceTimersByTimeAsync(6000);
      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasSubmitExceptions()).toBe(false);
      expect(loginForm.form().submitExceptions()).toEqual([]);
    });
  });

  // todo should have a second arg to map validatedFormValue to the query method
  // todo parallel submit
});

describe('parallel submit', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  it('should handle parallel submit correctly, each form should have its own submitting state and exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const throwRef = signal(false);
      const submitRef = mutation({
        method: (validatedLogin: ValidatedFormValue<LoginData>) => {
          expect(validatedLogin?.[validatedFormValueSymbol]).toBe(true);
          return validatedLogin;
        },
        identifier: ({ id }) => id,
        loader: async ({ params: login }) => {
          await wait(10000);
          if (throwRef()) {
            return craftException(
              { code: 'NameAlreadyExistsException' },
              { message: 'Name already exists' as const },
            );
          }
          return login;
        },
      });

      const loginForms = state(
        [
          {
            id: '1',
            name: '1',
            password: '',
          },
          {
            id: '2',
            name: '2',
            password: '',
          },
        ] satisfies LoginData[],
        insertForm(
          {
            identifier: ({ item: { id } }) => id,
          },
          insertFormSubmit(submitRef, {
            success: ({ submitCraftResource, form }) => {
              form().reset(); // todo should be done elsewhere ?
              // add more exceptions
              if (submitCraftResource.value()?.name === 'John') {
                return craftException({
                  code: 'NameAlreadyExistsExceptionFromSuccess',
                });
              }
              return undefined;
            },
            error: ({ submitCraftResource }) => {
              // add more exceptions
              if (submitCraftResource.error()?.message === 'failed') {
                return craftException({ code: 'SubmitFailedFromError' });
              }
              return undefined;
            },
            exception: ({ submitCraftResource, omitExceptions }) => {
              // override exceptions

              if (
                submitCraftResource.exceptions().loader?.code ===
                'NameAlreadyExistsException'
              ) {
                // add more exceptions
                return craftException({
                  code: 'NameAlreadyExistsExceptionFromException',
                });
              }
              // override exceptions and omit some exceptions
              return omitExceptions(['NameAlreadyExistsException']);
            },
          }),
          ({ update }) => ({
            setName: (name: string) =>
              update((v) => ({
                ...v,
                name,
              })),
          }),
        ),
      );
      const form1 = loginForms.select('1')();
      const form2 = loginForms.select('2')();
      expect(form1.submitExceptions()).toEqual([]);
      expect(form2.submitExceptions()).toEqual([]);

      form1.setName('John');
      form1.submit();

      await vi.advanceTimersByTimeAsync(5000);

      expect(form1.submitting()).toBe(true);
      expect(form2.submitting()).toBe(false);
      await vi.advanceTimersByTimeAsync(6000);
      expect(form1.submitting()).toBe(false);
      expect(form2.submitting()).toBe(false);

      console.log('form1', form1.value());

      console.log('form1.name', form1.value().name);
      console.log('form2.name', form2.value().name);

      expect(form1.value().name).toBe('John');

      expect(form2.value().name).toBe('2');
    });
  });

  it('should handle parallel submit correctly, each form should have its own submitting state and exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const throwRef = signal(true);

      const submitRef = mutation({
        method: (validatedLogin: ValidatedFormValue<LoginData>) => {
          expect(validatedLogin?.[validatedFormValueSymbol]).toBe(true);
          return validatedLogin;
        },
        identifier: ({ id }) => id,
        loader: async ({ params: login }) => {
          console.log('mutation login', login);
          await wait(10000);
          if (throwRef()) {
            return craftException(
              { code: 'NameAlreadyExistsException' },
              { message: 'Name already exists' as const },
            );
          }
          return login;
        },
      });

      const loginForms = state(
        [
          {
            id: '1',
            name: '1',
            password: '',
          },
          {
            id: '2',
            name: '2',
            password: '',
          },
        ] satisfies LoginData[],
        insertForm(
          {
            identifier: ({ item: { id } }) => id,
          },
          insertFormSubmit(submitRef, {
            success: ({ submitCraftResource }) => {
              // add more exceptions
              if (submitCraftResource.value()?.name === 'John') {
                return craftException({
                  code: 'NameAlreadyExistsExceptionFromSuccess',
                });
              }
              return undefined;
            },
            error: ({ submitCraftResource }) => {
              // add more exceptions
              if (submitCraftResource.error()?.message === 'failed') {
                return craftException({ code: 'SubmitFailedFromError' });
              }
              return undefined;
            },
            exception: ({ submitCraftResource, omitExceptions }) => {
              // override exceptions

              if (
                submitCraftResource.exceptions().loader?.code ===
                'NameAlreadyExistsException'
              ) {
                // add more exceptions
                return craftException({
                  code: 'NameAlreadyExistsExceptionFromException',
                });
              }
              // override exceptions and omit some exceptions
              return omitExceptions(['NameAlreadyExistsException']);
            },
          }),
          ({ update }) => ({
            setName: (name: string) =>
              update((v) => ({
                ...v,
                name,
              })),
          }),
        ),
      );
      const form1 = loginForms.select('1')();
      const form2 = loginForms.select('2')();
      expect(form1.submitExceptions()).toEqual([]);
      expect(form2.submitExceptions()).toEqual([]);
      form1.setName('John');
      form1.submit();
      await vi.advanceTimersByTimeAsync(5000);
      expect(form1.submitting()).toBe(true);
      expect(form2.submitting()).toBe(false);
      await vi.advanceTimersByTimeAsync(6000);
      expect(form1.submitting()).toBe(false);
      expect(form2.submitting()).toBe(false);

      expect(form1.value().name).toBe('John');
      expectTypeOf(form1.exceptions().submit).toEqualTypeOf<
        (
          | CraftExceptionResult<
              {
                code: 'NameAlreadyExistsExceptionFromException';
                identifier: string;
                scope: 'insertFormSubmitException';
              },
              undefined
            >
          | CraftExceptionResult<
              {
                code: 'NameAlreadyExistsExceptionFromSuccess';
                identifier: string;
                scope: 'insertFormSubmitSuccess';
              },
              undefined
            >
          | CraftExceptionResult<
              {
                code: 'SubmitFailedFromError';
                identifier: string;
                scope: 'insertFormSubmitError';
              },
              undefined
            >
        )[]
      >();

      expect(form2.value().name).toBe('2');
    });
  });
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
