import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftException, CraftExceptionResult } from '../craft-exception';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertSelectFormTree } from './insert-select-form-tree';
import { cRequired, CRequiredException, cValidator } from './validator';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';

async function flushAsyncValidation() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  TestBed.tick();
}

describe('insertFormAttributes', () => {
  it('should reactively bind disable, hidden, readonly and required to Angular field state', () => {
    TestBed.runInInjectionContext(() => {
      const disabled = signal(false);
      const hidden = signal(false);
      const readonly = signal(false);

      const fieldForm = state(
        '' as string,
        insertForm(
          insertFormAttributes(() => ({
            disable: disabled.asReadonly(),
            hidden: hidden.asReadonly(),
            readonly: readonly.asReadonly(),
          })),
        ),
      );

      expect(fieldForm.form().disabled()).toBe(false);
      expect(fieldForm.form().hidden()).toBe(false);
      expect(fieldForm.form().readonly()).toBe(false);

      disabled.set(true);
      hidden.set(true);
      readonly.set(true);
      TestBed.tick();

      expect(fieldForm.form().disabled()).toBe(true);
      expect(fieldForm.form().hidden()).toBe(true);
      expect(fieldForm.form().readonly()).toBe(true);
    });
  });

  it('should compose with insertSelectFormTree on a nested form tree', () => {
    TestBed.runInInjectionContext(() => {
      const hidden = signal(false);

      const profileForm = state(
        {
          profile: {
            name: 'romain',
          },
        },
        insertForm(
          insertSelectFormTree(
            'profile',
            // insertFormAttributes(({ nodeModel }) => ({
            //   hidden: hidden.asReadonly(),
            // })),
            insertNoopTypingAnchor,
            insertSelectFormTree('name', ({ state, set }) => ({})),
          ),
        ),
      );

      expect(profileForm.form().selectProfile()().hidden()).toBe(false);

      hidden.set(true);
      TestBed.tick();

      expect(profileForm.form().selectProfile()().hidden()).toBe(true);
    });
  });

  it('should expose the current insertion payload to the insertFormAttributes callback', () => {
    TestBed.runInInjectionContext(() => {
      const profileState = signal({
        email: 'romain@example.com',
      });
      let submittingState = false;

      const profileForm = state(
        profileState,
        insertForm(
          ({ state }) => ({
            upperEmail: computed(() => state().email.toUpperCase()),
          }),
          insertFormAttributes((context) => {
            expect(context.nodeModel().value()).toEqual({
              email: 'romain@example.com',
            });
            expect(context.state().email).toBe('romain@example.com');
            expect(context.insertions.upperEmail()).toBe(
              'ROMAIN@EXAMPLE.COM',
            );
            expect(context.form().value()).toEqual({
              email: 'romain@example.com',
            });
            expect(context.validatedFormValue()?.email).toBe(
              'romain@example.com',
            );
            expect(context.formIdentifier).toBeUndefined();

            context.setSubmitting(true);
            submittingState = context.form().submitting();
            context.setSubmitting(false);

            context.set({
              email: 'set@example.com',
            });
            expect(context.form().value()).toEqual({
              email: 'set@example.com',
            });

            context.patch(() => ({
              email: 'patch@example.com',
            }));
            expect(context.form().value()).toEqual({
              email: 'patch@example.com',
            });

            context.update((current) => ({
              email: current.email.toUpperCase(),
            }));
            expect(context.form().value()).toEqual({
              email: 'PATCH@EXAMPLE.COM',
            });
            expect(context.insertions.upperEmail()).toBe('PATCH@EXAMPLE.COM');

            return {};
          }),
        ),
      );

      expect(submittingState).toBe(true);
      expect(profileForm.form().submitting()).toBe(false);
      expect(profileForm.form().value()).toEqual({
        email: 'PATCH@EXAMPLE.COM',
      });
      expect(profileForm.form().upperEmail()).toBe('PATCH@EXAMPLE.COM');
    });
  });

  it('should expose sync validator exceptions as list and byValidator', () => {
    TestBed.runInInjectionContext(() => {
      const fieldState = signal('' as string);

      const fieldForm = state(
        fieldState,
        insertForm(
          insertFormAttributes(({ nodeModel }) => ({
            validators: [
              cRequired(),
              cValidator({
                name: 'hasAtSign',
                validate: () =>
                  nodeModel().value() === '' ||
                  nodeModel().value().includes('@')
                    ? undefined
                    : craftException(
                        { code: 'MISSING_AT' },
                        { message: 'Missing @' as const },
                      ),
              }),
            ],
          })),
        ),
      );

      expectTypeOf(fieldForm.form().exceptions().list).toEqualTypeOf<
        [
          CRequiredException,
          CraftExceptionResult<
            {
              code: 'MISSING_AT';
              scope: undefined;
              identifier?: undefined;
            },
            {
              message: 'Missing @';
            }
          >,
        ]
      >();
      expectTypeOf(fieldForm.form().exceptions().byValidator).toEqualTypeOf<{
        required: CRequiredException;
        MISSING_AT: CraftExceptionResult<
          {
            code: 'MISSING_AT';
            scope: undefined;
            identifier?: undefined;
          },
          {
            message: 'Missing @';
          }
        >;
      }>();

      expect(fieldForm.form().invalid()).toBe(true);

      expect(fieldForm.form().exceptions().list).toHaveLength(1);
      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        cRequired: { code: 'required' },
      });

      fieldState.set('romain');
      TestBed.tick();

      expect(fieldForm.form().exceptions().list).toHaveLength(1);
      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        hasAtSign: { code: 'MISSING_AT' },
      });

      fieldState.set('romain@example.com');
      TestBed.tick();

      expect(fieldForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should expose visibleExceptions only after field dirty or submit attempt', () => {
    TestBed.runInInjectionContext(() => {
      const fieldState = signal({
        email: '',
      });

      const fieldForm = state(
        fieldState,
        insertForm(
          ({ setSubmitting }) => ({
            setSubmitting,
          }),
          insertSelectFormTree(
            'email',
            insertNoopTypingAnchor,
            insertFormAttributes(() => ({
              validators: [cRequired()],
            })),
          ),
        ),
      );

      expectTypeOf(
        fieldForm.form().selectEmail()().visibleExceptions().list,
      ).toEqualTypeOf<[CRequiredException]>();

      expect(fieldForm.form().selectEmail()().exceptions().list).toHaveLength(1);
      expect(fieldForm.form().selectEmail()().visibleExceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      fieldForm.form().selectEmail()().markAsDirty();
      TestBed.tick();

      expect(
        fieldForm.form().selectEmail()().visibleExceptions().list,
      ).toHaveLength(1);

      fieldForm.form().reset();
      TestBed.tick();

      expect(fieldForm.form().hasAttemptedSubmit()).toBe(false);
      expect(fieldForm.form().selectEmail()().visibleExceptions()).toEqual({
        list: [],
        byValidator: {},
      });

      fieldForm.form().setSubmitting(true);
      TestBed.tick();

      expect(fieldForm.form().hasAttemptedSubmit()).toBe(true);
      expect(
        fieldForm.form().selectEmail()().visibleExceptions().list,
      ).toHaveLength(1);
    });
  });

  it('should expose async validator exceptions through exceptions().list and exceptions().byValidator', async () => {
    await TestBed.runInInjectionContext(async () => {
      const fieldState = signal('' as string);

      const fieldForm = state(
        fieldState,
        insertForm(
          insertFormAttributes(() => ({
            validators: [
              cValidator({
                name: 'isAvailable',
                type: 'async',
                validate: async ({ value }) => {
                  await Promise.resolve();
                  return value === 'taken'
                    ? craftException(
                        { code: 'USERNAME_TAKEN' },
                        { message: 'Already taken' as const },
                      )
                    : undefined;
                },
              }),
            ],
          })),
        ),
      );

      fieldState.set('taken');
      TestBed.tick();

      expect(fieldForm.form().pending()).toBe(true);

      await flushAsyncValidation();

      expect(fieldForm.form().exceptions().list).toHaveLength(1);
      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        isAvailable: { code: 'USERNAME_TAKEN' },
      });

      fieldState.set('available');
      TestBed.tick();

      await flushAsyncValidation();

      expect(fieldForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should use validatorModelRef for descendant validators instead of the field value', () => {
    TestBed.runInInjectionContext(() => {
      const fieldState = signal({
        email: 'romain@example.com',
      });
      const debouncedModel = signal({
        email: 'romain',
      });

      const fieldForm = state(
        fieldState,
        insertForm(
          ({ setValidatorModelRef }) => {
            setValidatorModelRef(debouncedModel.asReadonly());
            return {};
          },
          insertSelectFormTree(
            'email',
            insertNoopTypingAnchor,
            insertFormAttributes(({ nodeModel, form }) => {
              expect(form().value()).toBe('romain@example.com');
              expect(nodeModel().value()).toBe('romain');

              return {
                validators: [
                  cValidator({
                    name: 'hasAtSign',
                    validate: () =>
                      nodeModel().value() === '' ||
                      nodeModel().value().includes('@')
                        ? undefined
                        : craftException(
                            { code: 'MISSING_AT' },
                            { message: 'Missing @' as const },
                          ),
                  }),
                ],
              };
            }),
          ),
        ),
      );

      expect(fieldForm.form().value()).toEqual({
        email: 'romain@example.com',
      });
      expect(fieldForm.form().selectEmail()().value()).toBe(
        'romain@example.com',
      );
      expect(
        fieldForm.form().selectEmail()().exceptions().byValidator,
      ).toMatchObject({
        hasAtSign: { code: 'MISSING_AT' },
      });

      debouncedModel.set({
        email: 'romain@example.com',
      });
      TestBed.tick();

      expect(fieldForm.form().value()).toEqual({
        email: 'romain@example.com',
      });
      expect(fieldForm.form().selectEmail()().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should expose sync validator exceptions as list and byValidator at the field level', () => {
    TestBed.runInInjectionContext(() => {
      const fieldState = signal({
        email: '',
      });

      const fieldForm = state(
        fieldState,
        insertForm(
          insertSelectFormTree(
            'email',
            () => ({
              testInnerValue: fieldState().email,
            }),
            insertNoopTypingAnchor,
            insertFormAttributes(({ nodeModel }) => ({
              validators: [
                cRequired(),
                cValidator({
                  name: 'hasAtSign',
                  validate: () =>
                    nodeModel().value() === '' ||
                    nodeModel().value().includes('@')
                      ? undefined
                      : craftException(
                          { code: 'MISSING_AT' },
                          { message: 'Missing @' as const },
                        ),
                }),
              ],
            })),
          ),
        ),
      );

      expectTypeOf(
        fieldForm.form().selectEmail()().exceptions().list,
      ).toEqualTypeOf<
        [
          CRequiredException,
          CraftExceptionResult<
            {
              code: 'MISSING_AT';
              scope: undefined;
              identifier?: undefined;
            },
            {
              message: 'Missing @';
            }
          >,
        ]
      >();
      expectTypeOf(
        fieldForm.form().selectEmail()().exceptions().byValidator,
      ).toEqualTypeOf<{
        required: CRequiredException;
        MISSING_AT: CraftExceptionResult<
          {
            code: 'MISSING_AT';
            scope: undefined;
            identifier?: undefined;
          },
          {
            message: 'Missing @';
          }
        >;
      }>();

      expect(fieldForm.form().invalid()).toBe(true);

      expect(fieldForm.form().selectEmail()().exceptions().list).toHaveLength(
        1,
      );
      expect(
        fieldForm.form().selectEmail()().exceptions().byValidator,
      ).toMatchObject({
        cRequired: { code: 'required' },
      });

      fieldState.set({
        email: 'romain',
      });
      TestBed.tick();

      expect(fieldForm.form().selectEmail()().exceptions().list).toHaveLength(
        1,
      );
      expect(
        fieldForm.form().selectEmail()().exceptions().byValidator,
      ).toMatchObject({
        hasAtSign: { code: 'MISSING_AT' },
      });

      fieldState.set({
        email: 'romain@example.com',
      });
      TestBed.tick();

      expect(fieldForm.form().selectEmail()().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });
});
