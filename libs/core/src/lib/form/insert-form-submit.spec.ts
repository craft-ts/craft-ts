import { TestBed } from '@angular/core/testing';
import { state } from '../state';
import {
  insertForm,
  ValidatedFormValue,
  validatedFormValueSymbol,
} from './insert-form';
import { insertFormSubmit } from './insert-form-submit';
import { query } from '../query';
import { signal } from '@angular/core';
import { craftException, CraftExceptionResult } from '../craft-exception';
import { mutation } from '../mutation';
import { form } from '@angular/forms/signals';

type LoginData = {
  name: string;
  password: string;
};

// todo tester les erreurs
describe('insertFormSubmit', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  it('should submit the form when submit method is called', async () => {
    await TestBed.runInInjectionContext(async () => {
      const submitRef = query({
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

      // todo add a way to display some info if submit but not valid/pending
      // todo craft errors from query should be insert and associated to the form
      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasSubmitExceptions()).toBe(false); // todo move in form()
      expect(loginForm.form().submitExceptions()).toEqual([]);
      loginForm.form().submit();
      await vi.advanceTimersByTimeAsync(5000);
      expect(loginForm.form().submitting()).toBe(true); // todo should be true
      await vi.advanceTimersByTimeAsync(6000);
      expect(loginForm.form().submitting()).toBe(false); // todo should be false
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
          name: 'John',
          password: '1234',
        } satisfies LoginData,
        insertForm(insertFormSubmit(submitRef)),
      );
      // todo check exceptions are propertly associated to the form and can be displayed in the template
      // todo in form expose hasExceptions
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
  // todo should have a second arg to map validatedFormValue to the query method
  // todo parallel submit
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
