import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftException, CraftExceptionResult } from '../craft-exception';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertSelectFormTree } from './insert-select-form-tree';
import {
  cRequired,
  CRequiredException,
  cValidator,
  ValidatorResult,
} from './validator';
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
          ValidatorResult<
            unknown,
            'cRequired',
            CRequiredException,
            'sync',
            unknown,
            {}
          >,
          ValidatorResult<
            unknown,
            'hasAtSign',
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
            'sync',
            unknown,
            {}
          >,
        ]
      >();
      expectTypeOf(fieldForm.form().exceptions().byValidator).toEqualTypeOf<{
        cRequired: CRequiredException;
        hasAtSign: CraftExceptionResult<
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
});
