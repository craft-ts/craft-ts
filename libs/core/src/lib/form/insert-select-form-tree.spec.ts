import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { required } from '@angular/forms/signals';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertSelectFormTree } from './insert-select-form-tree';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';

type Credentials = {
  name: string;
  password: string;
};

type ProfileFormValue = {
  credentials: Credentials;
  status: string;
};

type Address = {
  city: string;
  zip: string;
};

type AddressBookFormValue = {
  addresses: Address[];
};

describe('insertSelectFormTree', () => {
  it('should select a nested object form tree and add insertions', () => {
    TestBed.runInInjectionContext(() => {
      const profileForm = state(
        {
          credentials: {
            name: 'romain',
            password: 'secret',
          },
          status: 'draft',
        } satisfies ProfileFormValue,
        insertForm(
          insertSelectFormTree(
            'credentials',
            ({ form }) => ({
              getNameFromForm: () => form.name().value(),
            }),
            ({ insertions }) => ({
              upperName: computed(() =>
                insertions.getNameFromForm().toUpperCase(),
              ),
            }),
            ({ update }) => ({
              clearPassword: () =>
                update((credentials) => ({
                  ...credentials,
                  password: '',
                })),
            }),
          ),
        ),
      );

      const credentialsForm = profileForm.form().selectCredentials();

      expectTypeOf(credentialsForm.name().value()).toEqualTypeOf<string>();
      expectTypeOf(credentialsForm().getNameFromForm).toEqualTypeOf<
        () => string
      >();
      expectTypeOf(credentialsForm().upperName()).toEqualTypeOf<string>();
      expectTypeOf(credentialsForm().clearPassword).toEqualTypeOf<
        () => Credentials
      >();

      expect(credentialsForm.name().value()).toBe('romain');
      expect(credentialsForm().upperName()).toBe('ROMAIN');

      credentialsForm().clearPassword();

      expect(profileForm().credentials.password).toBe('');
      expect(credentialsForm.password().value()).toBe('');
    });
  });

  it('should select a nested array form tree and add insertions to its items', () => {
    TestBed.runInInjectionContext(() => {
      const addressBookForm = state(
        {
          addresses: [{ city: 'Paris', zip: '75000' }],
        } satisfies AddressBookFormValue,
        insertForm(
          insertSelectFormTree(
            'addresses',
            insertNoopTypingAnchor,
            insertSelectFormTree(
              'address',
              ({ form }) => ({
                cityLabel: computed(
                  () => `${form.city().value()} (${form.zip().value()})`,
                ),
              }),
              ({ update }) => ({
                renameCity: (city: string) =>
                  update((address) => ({
                    ...address,
                    city,
                  })),
              }),
            ),
          ),
        ),
      );

      const addressesForm = addressBookForm.form().selectAddresses();
      const addressForm = addressesForm().selectAddress(0);

      expectTypeOf(
        addressesForm().items()[0].city().value(),
      ).toEqualTypeOf<string>();
      expectTypeOf(addressesForm().items()[0]().renameCity).toEqualTypeOf<
        (city: string) => Address
      >();
      expectTypeOf(addressForm?.city().value()).toEqualTypeOf<
        string | undefined
      >();
      expectTypeOf(addressForm?.().cityLabel()).toEqualTypeOf<
        string | undefined
      >();
      expectTypeOf(addressForm?.().renameCity).toEqualTypeOf<
        ((city: string) => Address) | undefined
      >();

      expect(addressesForm().items()).toHaveLength(1);
      expect(addressesForm().items()[0]().cityLabel()).toBe('Paris (75000)');

      addressForm?.().renameCity('Lyon');

      expect(addressBookForm().addresses[0].city).toBe('Lyon');
      expect(addressesForm().items()[0]().cityLabel()).toBe('Lyon (75000)');
    });
  });

  it('should expose schemaPath in nested array item insertions', () => {
    TestBed.runInInjectionContext(() => {
      const addressBookForm = state(
        {
          addresses: [{ city: 'Paris', zip: '75000' }],
        } satisfies AddressBookFormValue,
        insertForm(
          insertSelectFormTree(
            'addresses',
            insertNoopTypingAnchor,
            insertSelectFormTree('address', ({ schemaPath }) => ({
              hasCitySchemaPath: () => !!schemaPath.city,
              hasZipSchemaPath: () => !!schemaPath.zip,
            })),
          ),
        ),
      );

      const addressForm = addressBookForm
        .form()
        .selectAddresses()()
        .selectAddress(0);

      expect(addressForm?.().hasCitySchemaPath()).toBe(true);
      expect(addressForm?.().hasZipSchemaPath()).toBe(true);
    });
  });

  it('should allow nested insertions to register Angular schema rules from schemaPath', () => {
    TestBed.runInInjectionContext(() => {
      const profileForm = state(
        {
          credentials: {
            name: '',
            password: 'secret',
          },
          status: 'draft',
        } satisfies ProfileFormValue,
        insertForm(
          insertSelectFormTree(
            'credentials',
            insertNoopTypingAnchor,
            insertSelectFormTree('name', ({ schemaPath }) => {
              required(schemaPath);
              return {};
            }),
          ),
        ),
      );

      expect(profileForm.form().selectCredentials().name().invalid()).toBe(
        true,
      );
    });
  });

  it('should expose scalar child fields as selectable form trees', () => {
    TestBed.runInInjectionContext(() => {
      const profileForm = state(
        {
          credentials: {
            name: 'romain',
            password: 'secret',
          },
          status: 'draft',
        } satisfies ProfileFormValue,
        insertForm(
          insertSelectFormTree('status', ({ form, state }) => ({
            possible: () => true as boolean,
          })),
        ),
      );

      expect(profileForm.form().selectStatus()().possible()).toBeDefined();
      expectTypeOf(
        profileForm.form().selectStatus()().possible(),
      ).toEqualTypeOf<boolean>();
    });
  });
});
