import { TestBed } from '@angular/core/testing';
import { state } from '../state';
import { FieldState, FieldTree } from '@angular/forms/signals';
import {
  insertForm,
  ValidatedFormValue,
  validatedFormValueSymbol,
} from './insert-form';
import { signal } from '@angular/core';

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
        insertForm(({ form }) => {
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
          return {
            someInsertion: signal('test').asReadonly(),
          };
        }),
      );

      expect(loginForm.form).toBeDefined();
      expect(loginForm.form.name).toBeDefined();
      expect(loginForm.form.password).toBeDefined();
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
          ({ form }) => {
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

  it('should expose form validatedFormValue', () => {
    TestBed.runInInjectionContext(() => {
      const loginForm = state(
        {
          name: 'romain',
          password: 'secret',
        } satisfies LoginData,
        insertForm(({ form }) => ({})),
      );

      expect(loginForm.form().validatedFormValue()).toEqual({
        name: 'romain',
        password: 'secret',
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

      expect(loginForms.select(0)().validatedFormValue()?.name).toBe('1');
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
