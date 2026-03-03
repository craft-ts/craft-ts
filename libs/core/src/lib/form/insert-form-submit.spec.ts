import { TestBed } from '@angular/core/testing';
import { state } from '../state';
import {
  insertForm,
  ValidatedFormValue,
  validatedFormValueSymbol,
} from './insert-form';
import { query } from '../query';
import { signal } from '@angular/core';
import { craftException } from '../craft-exception';

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
        // will call automaticcaly submitRef by passing the ValidatedForm, // todo check if parallel form and not submitRef parallel ?
        // todo later add something to trigger an event when submit ? (pas besoin, autant exposer une fonction classic submit)
        insertForm(
          insertFormSubmit(submitRef, {
            success: ({ submitCraftResource }) => {
              expect(submitCraftResource.value).toBeDefined();
              expectTypeOf(
                submitCraftResource.value(),
              ).toEqualTypeOf<LoginData>();
              expect(submitCraftResource.value().name).toBe('John');
              expect(submitCraftResource.value().password).toBe('1234');
              if (submitCraftResource.value().name === 'John') {
                return craftException(
                  { code: 'NameAlreadyExistsException' },
                  { message: 'Name already exists' as const },
                );
              }
              return undefined;
            }, // clear le form / localStorage ? / override specific errors ?
            exception: true, // override specific exception // todo exception available if query emits exceptions ?
          }),
        ),
      );
      // todo test that the form is submitting
      expect(loginForm.form).toBeDefined();

      // todo add a way to display some info if submit but not valid/pending
      // todo craft errors from query should be insert and associated to the form
      expect(loginForm.form().submitting()).toBe(false);
      loginForm.form.submit();
      await vi.advanceTimersByTimeAsync(5000);
      expect(loginForm.form().submitting()).toBe(true); // todo should be true
      await vi.advanceTimersByTimeAsync(6000);
      expect(loginForm.form().submitting()).toBe(false); // todo should be false
    });
  });
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
