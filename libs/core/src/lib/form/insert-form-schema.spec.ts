import { Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftUse } from '../craft-use';
import { mutation } from '../mutation';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertFormSchema } from './insert-form-schema';
import { insertFormSubmit } from './insert-form-submit';

type UserForm = {
  email: string;
  address: {
    zip: string;
  };
};

type TestSchema<Input, Output = Input> = {
  '~standard': {
    version: 1;
    vendor: 'test';
    types: { input: Input; output: Output };
    validate: (
      value: unknown,
    ) =>
      | { value: Output; issues?: undefined }
      | { issues: readonly { message: string; path?: readonly PropertyKey[] }[] };
  };
};

const schema = <Input, Output = Input>(
  validate: TestSchema<Input, Output>['~standard']['validate'],
) =>
  ({
    '~standard': { version: 1, vendor: 'test', types: undefined, validate },
  }) as unknown as TestSchema<Input, Output>;

describe('insertFormSchema', () => {
  it('invalidates the form and projects issues to the matching field', () => {
    const userSchema = schema<UserForm>((value) =>
      value && typeof value === 'object' && 'email' in value && value.email
        ? { value: value as UserForm }
        : {
            issues: [
              { message: 'Email is required', path: ['email'] },
            ],
          },
    );

    const userForm = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'userForm',
          { email: '', address: { zip: '75001' } } satisfies UserForm,
          insertForm(insertFormSchema(userSchema)),
        ),
      ),
    );

    expect(userForm.form.hasSchema()).toBe(true);
    expectTypeOf(userForm.form.hasSchema).toEqualTypeOf<Signal<true>>();
    expect(userForm.form.valid()).toBe(false);
    expect(userForm.form.hasSchemaExceptions()).toBe(true);
    expect(userForm.form.schemaExceptions()).toHaveLength(1);
    expect(userForm.form.schemaExceptions()[0]?.payload.issues[0]?.message).toBe(
      'Email is required',
    );
    expect(userForm.form.email.errors()).toHaveLength(1);
    expect(userForm.form.email.errors()[0]?.code).toBe(
      'SCHEMA_VALIDATION_ERROR',
    );
    expect(userForm.form.validatedFormValue()).toBeUndefined();
  });

  it('projects nested issues, revalidates, and keeps schema input values', () => {
    const userSchema = schema<UserForm, UserForm>((value) => {
      const zip =
        value && typeof value === 'object' && 'address' in value
          ? (value as UserForm).address.zip
          : undefined;
      return zip === '75001'
        ? { value: value as UserForm }
        : {
            issues: [
              { message: 'ZIP is invalid', path: ['address', 'zip'] },
            ],
          };
    });

    const userForm = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'userForm',
          { email: 'user@example.com', address: { zip: '' } } satisfies UserForm,
          insertForm(insertFormSchema(userSchema)),
        ),
      ),
    );

    expect(userForm.form.address.zip.errors()).toHaveLength(1);
    expect(userForm.form.address.errors()).toHaveLength(1);
    expect(userForm.form.valid()).toBe(false);

    userForm.form.address.zip.set('75001');

    expect(userForm.form.valid()).toBe(true);
    expect(userForm.form.hasSchemaExceptions()).toBe(false);
    expect(userForm.form.address.zip.errors()).toEqual([]);
    expect(userForm.form.validatedFormValue()?.address?.zip).toBe('75001');
  });

  it('does not replace form input with a transformed schema output', () => {
    const userSchema = schema<{ age: string }, { age: number }>((value) =>
      value && typeof value === 'object' && 'age' in value
        ? { value: { age: Number(value.age) } }
        : { issues: [{ message: 'Age is invalid' }] },
    );

    const userForm = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'userForm',
          { age: '42' },
          insertForm(insertFormSchema(userSchema)),
        ),
      ),
    );

    expect(userForm.form.valid()).toBe(true);
    expect(userForm().age).toBe('42');
    expect(userForm.form.validatedFormValue()?.age).toBe('42');
  });

  it('blocks submit when the schema is invalid', () => {
    const loader = vi.fn((value: UserForm) => value);
    const userSchema = schema<UserForm>((value) => ({
      issues: [{ message: 'Email is required', path: ['email'] }],
    }));

    const userForm = TestBed.runInInjectionContext(() => {
      const saveUser = craftUse(
        mutation('saveUser', {
          method: (value: UserForm) => value,
          loader: ({ params }) => {
            loader(params);
            return params;
          },
        }),
      );

      return craftUse(
        state(
          'userForm',
          { email: '', address: { zip: '75001' } } satisfies UserForm,
          insertForm(
            insertFormSchema(userSchema),
            insertFormSubmit(saveUser),
          ),
        ),
      );
    });

    userForm.form.submit();

    expect(userForm.form.hasAttemptedSubmit()).toBe(true);
    expect(loader).not.toHaveBeenCalled();
  });

  it('validates parallel forms independently', () => {
    const userSchema = schema<UserForm>((value) => {
      const email =
        value && typeof value === 'object' && 'email' in value
          ? (value as UserForm).email
          : undefined;
      return email
        ? { value: value as UserForm }
        : { issues: [{ message: 'Email is required', path: ['email'] }] };
    });

    const usersForm = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'usersForm',
          [
            { email: '', address: { zip: '75001' } },
            { email: 'user@example.com', address: { zip: '75001' } },
          ],
          insertForm(
            { identifier: ({ index }) => index },
            insertFormSchema(userSchema),
          ),
        ),
      ),
    );

    expect(usersForm.select(0)?.valid()).toBe(false);
    expect(usersForm.select(1)?.valid()).toBe(true);
    expect(usersForm.select(0)?.email.errors()).toHaveLength(1);
    expect(usersForm.select(1)?.email.errors()).toEqual([]);
  });

  it('rejects asynchronous schemas explicitly', () => {
    const asyncSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test' as const,
        types: undefined,
        validate: async () => ({
          issues: [{ message: 'Async schemas are unsupported' }],
        }),
      },
    } as unknown as TestSchema<UserForm>;

    const userForm = TestBed.runInInjectionContext(() =>
      craftUse(
        state(
          'userForm',
          { email: 'user@example.com', address: { zip: '75001' } },
          insertForm(insertFormSchema(asyncSchema)),
        ),
      ),
    );

    expect(() => userForm.form.valid()).toThrow(
      'Form schemas must be synchronous',
    );
  });
});
