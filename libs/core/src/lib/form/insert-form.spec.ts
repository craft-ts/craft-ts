import { TestBed } from '@angular/core/testing';
import { state } from '../state';
import { FieldState, FieldTree, form } from '@angular/forms/signals';
import {
  insertForm,
  ValidatedFormValue,
  validatedFormValueSymbol,
} from './insert-form';
import { computed, Signal, signal } from '@angular/core';
import { craftException } from '../craft-exception';

type LoginData = {
  name: string;
  password: string;
};
describe('insertForm', () => {
  it('should create a FieldTree from a state', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: '1',
          password: '',
        } satisfies LoginData,
        insertForm(({ form, formIdentifier }) => {
          expect(form).toBeDefined();
          expectTypeOf(form()).toEqualTypeOf<
            FieldState<
              NoInfer<{
                name: string;
                password: string;
              }>,
              string | number
            >
          >();
          expectTypeOf(formIdentifier).toEqualTypeOf<unknown>();
          return {
            someInsertion: signal('test').asReadonly(),
          };
        }),
      );

      const myF = form(
        signal({
          name: '',
          password: '',
        }),
      );

      console.log('loginForm.form.name', loginForm.form.name);
      console.log('loginForm.form.password', loginForm.form.password().value());

      expect(loginForm.form).toBeDefined();
      expect(loginForm.form.name().value()).toBe('1');
      expect(loginForm.form.password().value()).toBe('');
      expect(loginForm.form().someInsertion()).toBe('test');
    });
  });

  it('should create a parallel FieldTree from a state', () => {
    TestBed.runInInjectionContext(() => {
      const loginForms = state(
        [
          {
            name: '1',
            password: '',
          },
          {
            name: '2',
            password: '',
          },
        ] satisfies LoginData[],
        insertForm(
          {
            identifier: ({ item, index }) => {
              expectTypeOf(item).toEqualTypeOf<LoginData>();
              expectTypeOf(index).toEqualTypeOf<number>();
              expect(item).toBeDefined();
              expect(index).toBeDefined();
              return index;
            },
          },
          ({ form, formIdentifier }) => {
            expect(form).toBeDefined();
            expectTypeOf(form()).toEqualTypeOf<
              FieldState<
                {
                  name: string;
                  password: string;
                },
                string | number
              >
            >();
            expectTypeOf(formIdentifier).toEqualTypeOf<number>();
            expect(formIdentifier).toBeDefined();
            return {
              someInsertion: signal('test').asReadonly(),
            };
          },
        ),
      );

      expect(loginForms.forms).toBeDefined();
      expect(loginForms.select).toBeDefined();
      expectTypeOf(loginForms.forms()).toEqualTypeOf<
        FieldTree<LoginData, string | number>[]
      >();

      expect(loginForms.forms()[0]).toBeDefined();
      expect(loginForms.forms()[1]).toBeDefined();
      expect(loginForms.select(0)).toBeDefined();
      expect(loginForms.select(0).name().value()).toBe('1');
      expect(loginForms.select(0).password().value()).toBe('');
      expect(loginForms.select(0)().someInsertion()).toBe('test');

      expect(loginForms.select(1)).toBeDefined();
      expect(loginForms.select(1).name().value()).toBe('2');
      expect(loginForms.select(1).password().value()).toBe('');
      expect(loginForms.select(1)().someInsertion()).toBe('test');
    });
  });

  it('should chain insertions and expose previous insertions', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(
          ({ form }) => ({
            getNameFromForm: () => form.name().value(),
          }),
          ({ insertions }) => ({
            upperName: () =>
              insertions.getNameFromForm().toString().toUpperCase(),
          }),
        ),
      );

      expect(loginForm.form().getNameFromForm()).toBe('romain');
      expect(loginForm.form().upperName()).toBe('ROMAIN');
    });
  });

  it('should expose up to 10 chained insertions', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(
          () => ({
            insertion1: () => '1',
          }),
          ({ insertions }) => {
            expectTypeOf(insertions.insertion1).toEqualTypeOf<() => string>();
            return {
              insertion2: () => `${insertions.insertion1()}2`,
            };
          },
          ({ insertions }) => {
            expectTypeOf(insertions.insertion2).toEqualTypeOf<() => string>();
            return {
              insertion3: () => `${insertions.insertion2()}3`,
            };
          },
          ({ insertions }) => ({
            insertion4: () => `${insertions.insertion3()}4`,
          }),
          ({ insertions }) => ({
            insertion5: () => `${insertions.insertion4()}5`,
          }),
          ({ insertions }) => ({
            insertion6: () => `${insertions.insertion5()}6`,
          }),
          ({ insertions }) => ({
            insertion7: () => `${insertions.insertion6()}7`,
          }),
          ({ insertions }) => ({
            insertion8: () => `${insertions.insertion7()}8`,
          }),
          ({ insertions }) => ({
            insertion9: () => `${insertions.insertion8()}9`,
          }),
          ({ insertions }) => {
            expectTypeOf(insertions.insertion9).toEqualTypeOf<() => string>();
            expectTypeOf(insertions.insertion1).toEqualTypeOf<() => string>();
            return {
              insertion10: () => `${insertions.insertion9()}10`,
            };
          },
        ),
      );

      expectTypeOf(loginForm.form().insertion10).toEqualTypeOf<() => string>();
      expect(loginForm.form().insertion10()).toBe('12345678910');
    });
  });

  it('should expose up to 10 chained insertions in parallel mode', () => {
    TestBed.runInInjectionContext(() => {
      const loginForms = state(
        [
          {
            name: '1',
            password: '',
          },
          {
            name: '2',
            password: '',
          },
        ] satisfies LoginData[],
        insertForm(
          {
            identifier: ({ item }) => item.name,
          },
          ({ formIdentifier }) => ({
            insertion1: () => `${formIdentifier}-1`,
          }),
          ({ insertions }) => ({
            insertion2: () => `${insertions.insertion1()}-2`,
          }),
          ({ insertions }) => ({
            insertion3: () => `${insertions.insertion2()}-3`,
          }),
          ({ insertions }) => ({
            insertion4: () => `${insertions.insertion3()}-4`,
          }),
          ({ insertions }) => ({
            insertion5: () => `${insertions.insertion4()}-5`,
          }),
          ({ insertions }) => ({
            insertion6: () => `${insertions.insertion5()}-6`,
          }),
          ({ insertions }) => ({
            insertion7: () => `${insertions.insertion6()}-7`,
          }),
          ({ insertions }) => ({
            insertion8: () => `${insertions.insertion7()}-8`,
          }),
          ({ insertions }) => ({
            insertion9: () => `${insertions.insertion8()}-9`,
          }),
          ({ formIdentifier, insertions }) => {
            expectTypeOf(formIdentifier).toEqualTypeOf<string>();
            expectTypeOf(insertions.insertion9).toEqualTypeOf<() => string>();
            return {
              insertion10: () => `${insertions.insertion9()}-10`,
            };
          },
        ),
      );

      expectTypeOf(loginForms.select('1')().insertion10).toEqualTypeOf<
        () => string
      >();
      expect(loginForms.select('1')().insertion10()).toBe(
        '1-1-2-3-4-5-6-7-8-9-10',
      );
      expect(loginForms.select('2')().insertion10()).toBe(
        '2-1-2-3-4-5-6-7-8-9-10',
      );
    });
  });

  it('should expose validatorModelRef by default and allow overriding it for descendant insertions', () => {
    TestBed.runInInjectionContext(() => {
      const debouncedModel = signal<LoginData>({
        name: 'debounced',
        password: 'shadow',
      });

      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(
          ({ state, validatorModelRef, setValidatorModelRef }) => {
            expectTypeOf(validatorModelRef()).toEqualTypeOf<LoginData>();
            expectTypeOf<typeof setValidatorModelRef>().toEqualTypeOf<
              (nextModel: Signal<LoginData>) => void
            >();
            expect(validatorModelRef()).toEqual(state());

            setValidatorModelRef(debouncedModel.asReadonly());

            return {};
          },
          ({ state, validatorModelRef }) => {
            expect(state()).toEqual({
              name: 'romain',
              password: 'secret',
            });
            expect(validatorModelRef()).toEqual({
              name: 'debounced',
              password: 'shadow',
            });

            return {
              validatorSnapshot: computed(() => validatorModelRef()),
            };
          },
        ),
      );

      expect(loginForm.form().validatorSnapshot()).toEqual({
        name: 'debounced',
        password: 'shadow',
      });

      debouncedModel.set({
        name: 'later',
        password: 'value',
      });

      expect(loginForm.form().validatorSnapshot()).toEqual({
        name: 'later',
        password: 'value',
      });
      expect(loginForm.form().value()).toEqual({
        name: 'romain',
        password: 'secret',
      });
    });
  });

  it('should expose schemaPath in insertion context', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(({ schemaPath }) => {
          expect(schemaPath).toBeDefined();
          expect(schemaPath.name).toBeDefined();
          expect(schemaPath.password).toBeDefined();

          return {
            hasNameSchemaPath: () => !!schemaPath.name,
            hasPasswordSchemaPath: () => !!schemaPath.password,
          };
        }),
      );

      expect(loginForm.form().hasNameSchemaPath()).toBe(true);
      expect(loginForm.form().hasPasswordSchemaPath()).toBe(true);
    });
  });

  it('should expose form validatedFormValue', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(({ form, setSubmitting }) => {
          return {};
        }),
      );

      expect(loginForm.form().validatedFormValue()).toEqual({
        name: 'romain',
        password: 'secret',
        [validatedFormValueSymbol]: true,
      });

      const loginForms = state(
        [
          {
            name: '1',
            password: '',
          },
          {
            name: '2',
            password: '',
          },
        ] satisfies LoginData[],
        insertForm(
          {
            identifier: ({ index }) => index,
          },
          ({ form }) => {
            expect(form).toBeDefined();
            return {
              someInsertion: signal('test').asReadonly(),
            };
          },
        ),
      );

      console.log(
        'loginForms.select(0)()',
        loginForms.select(0)().validatedFormValue(),
      );

      expect(loginForms.select(0)().validatedFormValue()?.name).toBe('1');
    });
  });

  it('should expose setSubmitting signal internally', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(({ form, setSubmitting }) => {
          expectTypeOf<typeof setSubmitting>().toEqualTypeOf<
            (submitting: boolean) => void
          >();
          expect(setSubmitting).toBeDefined();
          expect(form().submitting()).toBe(false);
          setSubmitting(true);
          expect(form().submitting()).toBe(true);
          setSubmitting(false);
          expect(form().submitting()).toBe(false);

          return {};
        }),
      );
    });
  });

  it('should keep hasAttemptedSubmit independent from submitting and reset it on form reset', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(({ form, setSubmitting }) => {
          const reset = form().reset.bind(form());
          return {
            setSubmitting,
            reset,
          };
        }),
      );

      expect(loginForm.form().setSubmitting).toBeDefined();
      expect(loginForm.form().reset).toBeDefined();
      expectTypeOf(loginForm.form().hasAttemptedSubmit()).toEqualTypeOf<
        boolean
      >();

      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasAttemptedSubmit()).toBe(false);

      loginForm.form().setSubmitting(true);

      expect(loginForm.form().submitting()).toBe(true);
      expect(loginForm.form().hasAttemptedSubmit()).toBe(true);

      loginForm.form().setSubmitting(false);

      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasAttemptedSubmit()).toBe(true);

      loginForm.form().reset();

      expect(loginForm.form().hasAttemptedSubmit()).toBe(false);
    });
  });

  it('should expose setAttemptedSubmit independently from submitting', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(({ setAttemptedSubmit }) => {
          return {
            setAttemptedSubmit,
          };
        }),
      );

      expect(loginForm.form().setAttemptedSubmit).toBeDefined();
      expectTypeOf(loginForm.form().setAttemptedSubmit).toEqualTypeOf<
        () => void
      >();

      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasAttemptedSubmit()).toBe(false);

      loginForm.form().setAttemptedSubmit();

      expect(loginForm.form().submitting()).toBe(false);
      expect(loginForm.form().hasAttemptedSubmit()).toBe(true);
    });
  });

  it('should expose setSubmitting signal internally for parallel forms', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        [
          {
            id: 1,
            name: 'romain',
            password: 'secret',
          } as const,
        ],
        insertForm(
          { identifier: ({ item: { id } }) => id },
          ({ form, setSubmitting }) => {
            expectTypeOf<typeof setSubmitting>().toEqualTypeOf<
              (submitting: boolean) => void
            >();
            expect(setSubmitting).toBeDefined();
            expect(form().submitting()).toBe(false);
            setSubmitting(true);
            expect(form().submitting()).toBe(true);
            setSubmitting(false);
            expect(form().submitting()).toBe(false);

            return {};
          },
        ),
      );
    });
  });

  it('should map insertion exceptions to form exception helpers', () => {
    TestBed.runInInjectionContext(() => {
      const submitException = craftException(
        { code: 'NAME_ALREADY_EXISTS' },
        { message: 'Name already exists' as const },
      );
      const validationException = craftException(
        { code: 'PASSWORD_TOO_SHORT' },
        { minLength: 8 as const },
      );
      const submitExceptions = signal<(typeof submitException)[]>([]);
      const validationExceptions = signal<(typeof validationException)[]>([]);

      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(() => ({
          hasSubmitExceptions: computed(() => submitExceptions().length > 0),
          submitExceptions: submitExceptions.asReadonly(),
          hasValidationExceptions: computed(
            () => validationExceptions().length > 0,
          ),
          validationExceptions: validationExceptions.asReadonly(),
          clearSubmitExceptions: () => submitExceptions.set([]),
        })),
      );

      expectTypeOf(loginForm.form().hasExceptions()).toEqualTypeOf<boolean>();
      expectTypeOf(loginForm.form().exceptions().submit).toEqualTypeOf<
        (typeof submitException)[]
      >();
      expectTypeOf(loginForm.form().exceptions().validation).toEqualTypeOf<
        (typeof validationException)[]
      >();

      expect(loginForm.form().hasExceptions()).toBe(false);
      expect(loginForm.form().exceptions()).toEqual({
        submit: [],
        validation: [],
      });

      submitExceptions.set([submitException]);

      expect(loginForm.form().hasExceptions()).toBe(true);
      expect(loginForm.form().exceptions()).toEqual({
        submit: [submitException],
        validation: [],
      });

      validationExceptions.set([validationException]);

      expect(loginForm.form().hasExceptions()).toBe(true);

      expect(loginForm.form().exceptions()).toEqual({
        submit: [submitException],
        validation: [validationException],
      });
    });
  });
});

describe('ValidatedFormValue Type', () => {
  it('should create branded type that ensure the form value is valid without pending validation', () => {
    type Result = ValidatedFormValue<LoginData>;
    expectTypeOf<Result>().branded.toEqualTypeOf<
      | (LoginData & {
          [validatedFormValueSymbol]: true;
        })
      | undefined
    >();
  });
});
