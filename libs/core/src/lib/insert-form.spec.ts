import { TestBed } from '@angular/core/testing';
import { state } from './state';
import { FieldTree } from '@angular/forms/signals';
import { insertForm } from './insert-form';

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
        insertForm(() => {
          return {};
        }),
      );
      console.log('loginForm', loginForm);

      expect(loginForm.form).toBeDefined();
      expectTypeOf(loginForm.form).toEqualTypeOf<
        FieldTree<LoginData, string | number>
      >();
      expect(loginForm.form.name).toBeDefined();
      expect(loginForm.form.password).toBeDefined();
      console.log(
        'loginForm.form.name().value()',
        loginForm.form.name().value(),
      );
      expect(loginForm.form.name().value()).toBe('1');
      expect(loginForm.form.password().value()).toBe('');
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
          () => {
            return {};
          },
        ),
      );

      expect(loginForms.forms).toBeDefined();
      expect(loginForms.select).toBeDefined();
      expectTypeOf(loginForms.forms()).toEqualTypeOf<
        FieldTree<LoginData, string | number>[]
      >();

      expectTypeOf(loginForms.select).toEqualTypeOf<
        (
          formIdentifier: string | number,
        ) => FieldTree<LoginData, string | number>
      >();

      expect(loginForms.forms()[0]).toBeDefined();
      expect(loginForms.forms()[1]).toBeDefined();
      expect(loginForms.select(0)).toBeDefined();
      expect(loginForms.select(0).name().value()).toBe('1');
      expect(loginForms.select(0).password().value()).toBe('');

      expect(loginForms.select(1)).toBeDefined();
      expect(loginForms.select(1).name().value()).toBe('2');
      expect(loginForms.select(1).password().value()).toBe('');
    });
  });
});
