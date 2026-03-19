import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftException } from '../craft-exception';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertSelectFormTree } from './insert-select-form-tree';
import { cRequired, cValidator } from './validator';

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
      const required = signal(false);

      const fieldForm = state(
        '' as string,
        insertForm(
          insertFormAttributes(() => ({
            disable: disabled.asReadonly(),
            hidden: hidden.asReadonly(),
            readonly: readonly.asReadonly(),
            required: required.asReadonly(),
          })),
        ),
      );

      expect(fieldForm.form().disabled()).toBe(false);
      expect(fieldForm.form().hidden()).toBe(false);
      expect(fieldForm.form().readonly()).toBe(false);
      expect(fieldForm.form().required()).toBe(false);

      disabled.set(true);
      hidden.set(true);
      readonly.set(true);
      required.set(true);
      TestBed.tick();

      expect(fieldForm.form().disabled()).toBe(true);
      expect(fieldForm.form().hidden()).toBe(true);
      expect(fieldForm.form().readonly()).toBe(true);
      expect(fieldForm.form().required()).toBe(true);
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
            insertFormAttributes(() => ({
              hidden: hidden.asReadonly(),
            })),
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
      const fieldForm = state(
        '' as string,
        insertForm(
          insertFormAttributes(() => ({
            required: () => true,
            validators: [
              cRequired,
              cValidator({
                name: 'hasAtSign',
                validate: ({ value }) =>
                  value === '' || value.includes('@')
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

      expect(fieldForm.form().invalid()).toBe(true);
      expect(fieldForm.form().exceptions().list).toHaveLength(1);
      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        cRequired: { code: 'required' },
      });

      fieldForm.set('romain');
      TestBed.tick();

      expect(fieldForm.form().exceptions().list).toHaveLength(1);
      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        hasAtSign: { code: 'MISSING_AT' },
      });

      fieldForm.set('romain@example.com');
      TestBed.tick();

      expect(fieldForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });

  it('should expose async validator exceptions through exceptions().list and exceptions().byValidator', async () => {
    await TestBed.runInInjectionContext(async () => {
      const fieldForm = state(
        '' as string,
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

      fieldForm.set('taken');
      TestBed.tick();

      expect(fieldForm.form().pending()).toBe(true);

      await flushAsyncValidation();

      expect(fieldForm.form().exceptions().list).toHaveLength(1);
      expect(fieldForm.form().exceptions().byValidator).toMatchObject({
        isAvailable: { code: 'USERNAME_TAKEN' },
      });

      fieldForm.set('available');
      TestBed.tick();

      await flushAsyncValidation();

      expect(fieldForm.form().exceptions()).toEqual({
        list: [],
        byValidator: {},
      });
    });
  });
});
