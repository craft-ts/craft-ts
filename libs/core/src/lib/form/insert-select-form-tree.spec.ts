import { computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HOST_TAG_LIST } from '../host-tag';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertSelectFormTree } from './insert-select-form-tree';

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
  it('selects a nested object form tree and exposes nested insertions', () => {
    TestBed.runInInjectionContext(() => {
      const profileForm = state(
        {
          credentials: { name: 'romain', password: 'secret' },
          status: 'draft',
        } satisfies ProfileFormValue,
        insertForm(
          insertSelectFormTree(
            'credentials',
            ({ field }) => ({
              getNameFromForm: () => field.name.value(),
            }),
            ({ insertions }) => ({
              upperName: computed(() =>
                insertions.getNameFromForm().toUpperCase(),
              ),
            }),
            ({ update }) => ({
              clearPassword: () =>
                update((credentials) => ({ ...credentials, password: '' })),
            }),
          ),
        ),
      );

      const credentials = profileForm.form.selectCredentials();
      expect(credentials).toBeDefined();
      expect(credentials?.name.value()).toBe('romain');
      expect(
        (credentials as unknown as { getNameFromForm: () => string })
          .getNameFromForm(),
      ).toBe('romain');
      expect(
        (credentials as unknown as { upperName: () => string }).upperName(),
      ).toBe('ROMAIN');

      (credentials as unknown as { clearPassword: () => void }).clearPassword();
      TestBed.tick();
      expect(profileForm().credentials.password).toBe('');
    });
  });

  it('tags object form tree select insertions with the select name', () => {
    TestBed.runInInjectionContext(() => {
      const profileForm = state(
        {
          credentials: { name: 'romain', password: 'secret' },
          status: 'draft',
        } satisfies ProfileFormValue,
        insertForm(
          insertSelectFormTree('credentials', () => ({
            hostTags: inject(HOST_TAG_LIST),
          })),
        ),
      );

      const credentials = profileForm.form.selectCredentials();
      expect(
        (credentials as unknown as { hostTags: ReadonlyArray<string> })
          .hostTags,
      ).toContain('credentials');
    });
  });

  it('selects a nested array form tree and adds insertions to its items', () => {
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
              ({ field }) => ({
                cityLabel: computed(
                  () => `${field.city.value()} (${field.zip.value()})`,
                ),
              }),
              ({ update }) => ({
                renameCity: (city: string) =>
                  update((address) => ({ ...address, city })),
              }),
            ),
          ),
        ),
      );

      const addressesForm = addressBookForm.form.selectAddresses();
      const addressForm = (
        addressesForm as unknown as {
          selectAddress: (id: number) => unknown;
        }
      ).selectAddress(0) as {
        city: { value: () => string };
        cityLabel: () => string;
        renameCity: (city: string) => Address;
      };

      const items = (
        addressesForm as unknown as { items: () => unknown[] }
      ).items() as Array<{
        city: { value: () => string };
        cityLabel: () => string;
        renameCity: (city: string) => Address;
      }>;

      expect(items).toHaveLength(1);
      expect(items[0].cityLabel()).toBe('Paris (75000)');

      addressForm.renameCity('Lyon');

      expect(addressBookForm().addresses[0].city).toBe('Lyon');
      expect(items[0].cityLabel()).toBe('Lyon (75000)');
    });
  });

  it('tags array form tree select insertions with the select name and selected identifier', () => {
    TestBed.runInInjectionContext(() => {
      const addressBookForm = state(
        {
          addresses: [
            { city: 'Paris', zip: '75000' },
            { city: 'Lyon', zip: '69000' },
          ],
        } satisfies AddressBookFormValue,
        insertForm(
          insertSelectFormTree(
            'addresses',
            insertNoopTypingAnchor,
            insertSelectFormTree('address', () => ({
              hostTags: inject(HOST_TAG_LIST),
            })),
          ),
        ),
      );

      const addressesForm = addressBookForm.form.selectAddresses();
      const address = (
        addressesForm as unknown as {
          selectAddress: (id: number) => { hostTags: ReadonlyArray<string> };
        }
      ).selectAddress(1);

      // The injector is tagged with the property key, the sub-entity name and
      // the item index, so DI introspection (HOST_TAG_LIST) exposes all of them.
      expect(address.hostTags).toEqual(
        expect.arrayContaining(['addresses', 'address', '1']),
      );
    });
  });

  it('exposes scalar (non-object) child fields as selectable form trees', () => {
    TestBed.runInInjectionContext(() => {
      const profileForm = state(
        {
          credentials: { name: 'romain', password: 'secret' },
          status: 'draft',
        } satisfies ProfileFormValue,
        insertForm(
          insertSelectFormTree('status', ({ field, state: s }) => ({
            isDraft: computed(() => s() === 'draft'),
            statusValue: field.value,
          })),
        ),
      );

      const statusForm = profileForm.form.selectStatus();
      expect(statusForm).toBeDefined();
      expect(
        (statusForm as unknown as { isDraft: () => boolean }).isDraft(),
      ).toBe(true);
      expect(
        (statusForm as unknown as { statusValue: () => string }).statusValue(),
      ).toBe('draft');
    });
  });
});
