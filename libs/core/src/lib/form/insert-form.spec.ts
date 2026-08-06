import { computed, Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftException } from '../craft-exception';
import { state } from '../state';
import { CraftField } from './craft-field';
import {
  insertForm,
  ValidatedFormValue,
  validatedFormValueSymbol,
} from './insert-form';
import { craftUse } from '../craft-use';

type LoginData = {
  name: string;
  password: string;
};

describe('insertForm', () => {
  it('creates a CraftFieldTree from a state and exposes insertions', () => {
    TestBed.runInInjectionContext(() => {
      const { loginForm } = craftUse(
        state(
          'loginForm',
          { name: '1', password: '' } satisfies LoginData,
          insertForm(({ field, formIdentifier }) => {
            expect(field).toBeDefined();
            expectTypeOf(formIdentifier).toEqualTypeOf<unknown>();
            return {
              someInsertion: signal('test').asReadonly(),
            };
          }),
        ),
      );

      expect(loginForm.form).toBeDefined();
      expect(loginForm.form.name.value()).toBe('1');
      expect(loginForm.form.password.value()).toBe('');
      expect(loginForm.form.someInsertion()).toBe('test');
    });
  });

  it('chained insertions can read previous outputs via context.insertions', () => {
    TestBed.runInInjectionContext(() => {
      const { loginForm } = craftUse(
        state(
          'loginForm',
          { name: 'romain', password: 'secret' },
          insertForm(
            ({ field }) => ({
              getName: () => field.name.value(),
            }),
            ({ insertions }) => ({
              upperName: () => insertions.getName().toString().toUpperCase(),
            }),
          ),
        ),
      );

      expect(loginForm.form.getName()).toBe('romain');
      expect(loginForm.form.upperName()).toBe('ROMAIN');
    });
  });

  it('creates a parallel form tree from an array state', () => {
    TestBed.runInInjectionContext(() => {
      const { usersForm } = craftUse(
        state(
          'usersForm',
          [
            { id: 'a', name: 'Alpha' },
            { id: 'b', name: 'Beta' },
          ],
          insertForm({ identifier: ({ item }) => item.id }, () => ({
            kind: 'parallel-test' as const,
          })),
        ),
      );

      const list = usersForm.forms();
      expect(list.length).toBe(2);
      expect(list[0].name.value()).toBe('Alpha');
      expect(list[1].name.value()).toBe('Beta');

      const a = usersForm.select('a');
      expect(a?.name.value()).toBe('Alpha');
      const c = usersForm.select('c');
      expect(c).toBeUndefined();
    });
  });

  it('applies set/update/patch through the form tree', () => {
    TestBed.runInInjectionContext(() => {
      const { userForm } = craftUse(
        state('userForm', { name: 'a', count: 0 }, insertForm()),
      );

      userForm.form.name.set('b');
      expect(userForm()).toEqual({ name: 'b', count: 0 });

      userForm.form.count.set(5);
      expect(userForm()).toEqual({ name: 'b', count: 5 });

      userForm.form.patch(() => ({ name: 'c' }));
      expect(userForm()).toEqual({ name: 'c', count: 5 });
    });
  });

  it('exposes hasAttemptedSubmit and submitting signals', () => {
    TestBed.runInInjectionContext(() => {
      const { userForm } = craftUse(
        state(
          'userForm',
          { name: 'a' },
          insertForm(({ hasAttemptedSubmit, submitting }) => ({
            attempted: hasAttemptedSubmit,
            isSubmitting: submitting,
          })),
        ),
      );

      expectTypeOf(userForm.form.hasAttemptedSubmit).toEqualTypeOf<
        Signal<boolean>
      >();
      expect(userForm.form.hasAttemptedSubmit()).toBe(false);
      expect(userForm.form.submitting()).toBe(false);
    });
  });

  it('field is a CraftField at the root', () => {
    TestBed.runInInjectionContext(() => {
      const { userForm } = craftUse(
        state('userForm', { name: 'a' }, insertForm()),
      );

      expectTypeOf(userForm.form.value).toEqualTypeOf<
        Signal<{ name: string }>
      >();
      expect(typeof (userForm.form as unknown as CraftField<unknown>).set).toBe(
        'function',
      );
    });
  });

  it('exposes validatedFormValue branded with the symbol when the form is valid', () => {
    TestBed.runInInjectionContext(() => {
      const { loginForm } = craftUse(
        state(
          'loginForm',
          { name: 'romain', password: 'secret' },
          insertForm(),
        ),
      );

      expect(loginForm.form.validatedFormValue()).toEqual({
        name: 'romain',
        password: 'secret',
        [validatedFormValueSymbol]: true,
      });

      const { loginForms } = craftUse(
        state(
          'loginForms',
          [
            { name: '1', password: '' },
            { name: '2', password: '' },
          ],
          insertForm({ identifier: ({ index }) => index }),
        ),
      );

      expect(loginForms.select(0)?.validatedFormValue()?.name).toBe('1');
    });
  });

  it('exposes setSubmitting from the insertion factory context', () => {
    TestBed.runInInjectionContext(() => {
      const observedSubmitting: boolean[] = [];
      craftUse(
        state(
          'loginForm',
          { name: 'romain' },
          insertForm(({ field, setSubmitting, submitting }) => {
            expectTypeOf<typeof setSubmitting>().toEqualTypeOf<
              (submitting: boolean) => void
            >();
            observedSubmitting.push(submitting());
            setSubmitting(true);
            observedSubmitting.push(submitting());
            setSubmitting(false);
            observedSubmitting.push(submitting());
            expect(field.value().name).toBe('romain');
            return {};
          }),
        ),
      );
      expect(observedSubmitting).toEqual([false, true, false]);
    });
  });

  it('keeps hasAttemptedSubmit sticky across setSubmitting toggles and clears it on reset', () => {
    TestBed.runInInjectionContext(() => {
      const { loginForm } = craftUse(
        state(
          'loginForm',
          { name: 'romain', password: 'secret' },
          insertForm(({ setSubmitting, setAttemptedSubmit }) => ({
            setSubmitting,
            setAttemptedSubmit,
          })),
        ),
      );

      expectTypeOf(
        loginForm.form.hasAttemptedSubmit(),
      ).toEqualTypeOf<boolean>();

      expect(loginForm.form.submitting()).toBe(false);
      expect(loginForm.form.hasAttemptedSubmit()).toBe(false);

      loginForm.form.setSubmitting(true);
      expect(loginForm.form.submitting()).toBe(true);
      expect(loginForm.form.hasAttemptedSubmit()).toBe(true);

      loginForm.form.setSubmitting(false);
      expect(loginForm.form.submitting()).toBe(false);
      // hasAttemptedSubmit stays true until reset
      expect(loginForm.form.hasAttemptedSubmit()).toBe(true);

      loginForm.form.reset();
      expect(loginForm.form.hasAttemptedSubmit()).toBe(false);
    });
  });

  it('setAttemptedSubmit marks attempted without toggling submitting', () => {
    TestBed.runInInjectionContext(() => {
      const { loginForm } = craftUse(
        state(
          'loginForm',
          { name: 'romain', password: 'secret' },
          insertForm(({ setAttemptedSubmit }) => ({ setAttemptedSubmit })),
        ),
      );

      expectTypeOf(loginForm.form.setAttemptedSubmit).toEqualTypeOf<
        () => void
      >();
      expect(loginForm.form.submitting()).toBe(false);
      expect(loginForm.form.hasAttemptedSubmit()).toBe(false);

      loginForm.form.setAttemptedSubmit();

      expect(loginForm.form.submitting()).toBe(false);
      expect(loginForm.form.hasAttemptedSubmit()).toBe(true);
    });
  });

  it('exposes setSubmitting for each parallel form independently', () => {
    TestBed.runInInjectionContext(() => {
      const { loginForms } = craftUse(
        state(
          'loginForms',
          [
            { id: 1, name: 'a' },
            { id: 2, name: 'b' },
          ],
          insertForm(
            { identifier: ({ item: { id } }) => id },
            ({ setSubmitting, submitting }) => ({
              setSubmitting,
              submitting,
            }),
          ),
        ),
      );

      const f1 = loginForms.select(1)!;
      const f2 = loginForms.select(2)!;

      expect(f1.submitting()).toBe(false);
      expect(f2.submitting()).toBe(false);

      f1.setSubmitting(true);
      expect(f1.submitting()).toBe(true);
      expect(f2.submitting()).toBe(false);

      f1.setSubmitting(false);
    });
  });

  it('exposes the form tree externally for direct sub-field access (simple and parallel)', () => {
    TestBed.runInInjectionContext(() => {
      const { myState } = craftUse(
        state('myState', { id: 1, name: '1', password: '' }, insertForm()),
      );
      expect(myState.form.password).toBeDefined();
      expect(myState.form.password.value()).toBe('');

      const { forms } = craftUse(
        state(
          'forms',
          [{ id: 1, name: '1', password: 'myPassword' }],
          insertForm({ identifier: ({ item }) => item.id }),
        ),
      );

      const selected = forms.select(1);
      expect(selected).toBeDefined();
      expect(selected!.password.value()).toBe('myPassword');
    });
  });

  it('aggregates insertion-level has*Exceptions/*Exceptions into form.exceptions/hasExceptions', () => {
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

      const { loginForm } = craftUse(
        state(
          'loginForm',
          { name: 'romain', password: 'secret' },
          insertForm(() => ({
            hasSubmitExceptions: computed(() => submitExceptions().length > 0),
            submitExceptions: submitExceptions.asReadonly(),
            hasValidationExceptions: computed(
              () => validationExceptions().length > 0,
            ),
            validationExceptions: validationExceptions.asReadonly(),
            clearSubmitExceptions: () => submitExceptions.set([]),
          })),
        ),
      );

      expectTypeOf(loginForm.form.hasExceptions()).toEqualTypeOf<boolean>();

      expect(loginForm.form.hasExceptions()).toBe(false);
      expect(loginForm.form.exceptions()).toEqual({
        submit: [],
        validation: [],
      });

      submitExceptions.set([submitException]);
      expect(loginForm.form.hasExceptions()).toBe(true);
      expect(loginForm.form.exceptions()).toEqual({
        submit: [submitException],
        validation: [],
      });

      validationExceptions.set([validationException]);
      expect(loginForm.form.hasExceptions()).toBe(true);
      expect(loginForm.form.exceptions()).toEqual({
        submit: [submitException],
        validation: [validationException],
      });
    });
  });
});

describe('ValidatedFormValue type', () => {
  it('brands the form value to ensure validity at the type level', () => {
    type LoginData = { name: string; password: string };
    type Result = ValidatedFormValue<LoginData>;
    expectTypeOf<Result>().branded.toEqualTypeOf<
      (LoginData & { [validatedFormValueSymbol]: true }) | undefined
    >();
  });
});
