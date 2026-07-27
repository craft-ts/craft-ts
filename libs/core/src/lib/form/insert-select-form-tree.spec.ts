import { computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HOST_TAG_LIST } from '../host-tag';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { craftService, onAppStart } from '../craft-service';
import { craftPipe } from '../craft-pipe';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import {
  insertSelectFormTree,
  selectFormTree,
} from './insert-select-form-tree';
import { cEmail, cMinLength, cRequired } from './validator';
import { craftUse } from '../craft-use';

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
      const { profileForm } = craftUse(
        state(
          'profileForm',
          {
            credentials: { name: 'romain', password: 'secret' },
            status: 'draft',
          } satisfies ProfileFormValue,
          insertForm(
            insertSelectFormTree('credentials', (context) =>
              craftPipe(
                context,
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
          ),
        ),
      );

      const credentials = profileForm.form.selectCredentials();
      expect(credentials).toBeDefined();
      expect(credentials?.name.value()).toBe('romain');
      expect(
        (
          credentials as unknown as { getNameFromForm: () => string }
        ).getNameFromForm(),
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
      const { profileForm } = craftUse(
        state(
          'profileForm',
          {
            credentials: { name: 'romain', password: 'secret' },
            status: 'draft',
          } satisfies ProfileFormValue,
          insertForm(
            insertSelectFormTree('credentials', () => ({
              hostTags: inject(HOST_TAG_LIST),
            })),
          ),
        ),
      );

      const credentials = profileForm.form.selectCredentials();
      expect(
        (credentials as unknown as { hostTags: ReadonlyArray<string> })
          .hostTags,
      ).toContain('selectProperty:credentials');
    });
  });

  it('selects a nested array form tree and adds insertions to its items', () => {
    TestBed.runInInjectionContext(() => {
      const { addressBookForm } = craftUse(
        state(
          'addressBookForm',
          {
            addresses: [{ city: 'Paris', zip: '75000' }],
          } satisfies AddressBookFormValue,
          insertForm(
            insertSelectFormTree('addresses', (context) =>
              craftPipe(
                context,
                insertNoopTypingAnchor,
                insertSelectFormTree('address', (itemContext) =>
                  craftPipe(
                    itemContext,
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
      const { addressBookForm } = craftUse(
        state(
          'addressBookForm',
          {
            addresses: [
              { city: 'Paris', zip: '75000' },
              { city: 'Lyon', zip: '69000' },
            ],
          } satisfies AddressBookFormValue,
          insertForm(
            insertSelectFormTree('addresses', (context) =>
              craftPipe(
                context,
                insertNoopTypingAnchor,
                insertSelectFormTree('address', () => ({
                  hostTags: inject(HOST_TAG_LIST),
                })),
              ),
            ),
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
        expect.arrayContaining([
          'selectProperty:addresses',
          'selectEntity:address',
          'selectItem:1',
        ]),
      );
    });
  });

  it('exposes scalar (non-object) child fields as selectable form trees', () => {
    TestBed.runInInjectionContext(() => {
      const { profileForm } = craftUse(
        state(
          'profileForm',
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

describe('selectFormTree', () => {
  it('applies validators to a sibling property of a flat form via inline factory', () => {
    TestBed.runInInjectionContext(() => {
      type LoginData = { email: string; password: string };

      // `insertNoopTypingAnchor` anchors the sub-state type so that the
      // subsequent `insertFormAttributes(...)` factory can be inferred as
      // operating on `string`. Same workaround as the rest of the suite —
      // a parameter-less `insertFormAttributes(() => ({...}))` cannot infer
      // its `StateType` on its own (limitation shared with
      // `insertSelectFormTree`).
      const { loginForm } = craftUse(
        state(
          'loginForm',
          { email: '', password: '' } satisfies LoginData,
          insertForm(
            (context) =>
              selectFormTree(context, 'email', (fieldContext) =>
                craftPipe(
                  fieldContext,
                  insertNoopTypingAnchor,
                  insertFormAttributes(() => ({
                    validators: [
                      cRequired(),
                      cEmail(),
                      cMinLength({ minLength: 5 }),
                    ],
                  })),
                ),
              ),
            (context) =>
              selectFormTree(context, 'password', (fieldContext) =>
                craftPipe(
                  fieldContext,
                  insertNoopTypingAnchor,
                  insertFormAttributes(() => ({
                    validators: [cRequired()],
                  })),
                ),
              ),
          ),
        ),
      );

      const email = (
        loginForm.form as unknown as {
          selectEmail: () => { invalid: () => boolean } | undefined;
        }
      ).selectEmail();
      const password = (
        loginForm.form as unknown as {
          selectPassword: () => { invalid: () => boolean } | undefined;
        }
      ).selectPassword();

      expect(email?.invalid()).toBe(true);
      expect(password?.invalid()).toBe(true);

      loginForm.form.email.set('not-an-email');
      TestBed.tick();
      expect(email?.invalid()).toBe(true);

      loginForm.form.email.set('hello@world.com');
      loginForm.form.password.set('secret');
      TestBed.tick();
      expect(email?.invalid()).toBe(false);
      expect(password?.invalid()).toBe(false);
    });
  });

  it('selects a nested object form tree and exposes nested insertions', () => {
    TestBed.runInInjectionContext(() => {
      const { profileForm } = craftUse(
        state(
          'profileForm',
          {
            credentials: { name: 'romain', password: 'secret' },
            status: 'draft',
          } satisfies ProfileFormValue,
          insertForm((context) =>
            selectFormTree(context, 'credentials', (fieldContext) =>
              craftPipe(
                fieldContext,
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
          ),
        ),
      );

      const credentials = (
        profileForm.form as unknown as {
          selectCredentials: () => {
            name: { value: () => string };
            getNameFromForm: () => string;
            upperName: () => string;
            clearPassword: () => void;
          };
        }
      ).selectCredentials();

      expect(credentials.name.value()).toBe('romain');
      expect(credentials.getNameFromForm()).toBe('romain');
      expect(credentials.upperName()).toBe('ROMAIN');

      credentials.clearPassword();
      TestBed.tick();
      expect(profileForm().credentials.password).toBe('');
    });
  });

  it('selects a nested array form tree and adds insertions to its items', () => {
    TestBed.runInInjectionContext(() => {
      const { addressBookForm } = craftUse(
        state(
          'addressBookForm',
          {
            addresses: [{ city: 'Paris', zip: '75000' }],
          } satisfies AddressBookFormValue,
          insertForm((context) =>
            selectFormTree(context, 'addresses', (addressesContext) =>
              craftPipe(
                addressesContext,
                insertNoopTypingAnchor,
                (subContext) =>
                  selectFormTree(subContext, 'address', ({ field }) => ({
                    cityLabel: computed(
                      () => `${field.city.value()} (${field.zip.value()})`,
                    ),
                  })),
              ),
            ),
          ),
        ),
      );

      const addressesForm = (
        addressBookForm.form as unknown as {
          selectAddresses: () => {
            selectAddress: (id: number) =>
              | {
                  cityLabel: () => string;
                }
              | undefined;
            items: () => Array<{ cityLabel: () => string }>;
          };
        }
      ).selectAddresses();

      const items = addressesForm.items();
      expect(items).toHaveLength(1);
      expect(items[0].cityLabel()).toBe('Paris (75000)');

      const first = addressesForm.selectAddress(0);
      expect(first?.cityLabel()).toBe('Paris (75000)');
    });
  });

  it('tags object form tree select insertions with the property name', () => {
    TestBed.runInInjectionContext(() => {
      const { profileForm } = craftUse(
        state(
          'profileForm',
          {
            credentials: { name: 'romain', password: 'secret' },
            status: 'draft',
          } satisfies ProfileFormValue,
          insertForm((context) =>
            selectFormTree(context, 'credentials', () => ({
              hostTags: inject(HOST_TAG_LIST),
            })),
          ),
        ),
      );

      const credentials = (
        profileForm.form as unknown as {
          selectCredentials: () => { hostTags: ReadonlyArray<string> };
        }
      ).selectCredentials();

      expect(credentials.hostTags).toContain('selectProperty:credentials');
    });
  });

  it('exposes scalar (non-object) child fields as selectable form trees', () => {
    TestBed.runInInjectionContext(() => {
      const { profileForm } = craftUse(
        state(
          'profileForm',
          {
            credentials: { name: 'romain', password: 'secret' },
            status: 'draft',
          } satisfies ProfileFormValue,
          insertForm((context) =>
            selectFormTree(context, 'status', ({ field, state: s }) => ({
              isDraft: computed(() => s() === 'draft'),
              statusValue: field.value,
            })),
          ),
        ),
      );

      const statusForm = (
        profileForm.form as unknown as {
          selectStatus: () => {
            isDraft: () => boolean;
            statusValue: () => string;
          };
        }
      ).selectStatus();

      expect(statusForm.isDraft()).toBe(true);
      expect(statusForm.statusValue()).toBe('draft');
    });
  });
});

describe('insertSelectFormTree with generator insertions', () => {
  it('should resolve generator insertion on object form tree', () => {
    const { ObjFormLogger } = craftService(
      { name: 'ObjFormLogger', scope: 'global' },
      () => {
        const calls: string[] = [];
        return { log: (msg: string) => calls.push(msg), calls };
      },
    );

    TestBed.runInInjectionContext(() => {
      const { profileForm } = craftUse(
        state(
          'profileForm',
          {
            credentials: { name: 'romain', password: 'secret' },
            status: 'draft',
          } satisfies ProfileFormValue,
          insertForm(
            insertSelectFormTree('credentials', function* ({ update }) {
              const logger = yield* ObjFormLogger();
              return {
                clearPassword: () => {
                  logger.log('clearPassword');
                  return update((creds) => ({ ...creds, password: '' }));
                },
              };
            }),
          ),
        ),
      );

      TestBed.tick();
      const credentials = profileForm.form.selectCredentials();
      (credentials as unknown as { clearPassword: () => void }).clearPassword();

      expect(profileForm().credentials.password).toBe('');
    });
  });

  it('should resolve generator insertion on array form tree items', () => {
    const { ArrFormLogger } = craftService(
      { name: 'ArrFormLogger', scope: 'global' },
      () => {
        const calls: string[] = [];
        return { log: (msg: string) => calls.push(msg), calls };
      },
    );

    TestBed.runInInjectionContext(() => {
      const { addressBookForm } = craftUse(
        state(
          'addressBookForm',
          {
            addresses: [{ city: 'Paris', zip: '75000' }],
          } satisfies AddressBookFormValue,
          insertForm(
            insertSelectFormTree('addresses', (context) =>
              craftPipe(
                context,
                insertNoopTypingAnchor,
                insertSelectFormTree('item', function* ({ update }) {
                  const logger = yield* ArrFormLogger();
                  return {
                    updateCity: (city: string) => {
                      logger.log(`updateCity:${city}`);
                      return update((addr) => ({ ...addr, city }));
                    },
                  };
                }),
              ),
            ),
          ),
        ),
      );

      TestBed.tick();
      const addresses = addressBookForm.form.selectAddresses();
      (
        addresses?.selectItem(0) as unknown as {
          updateCity: (city: string) => void;
        }
      )?.updateCity('Lyon');

      expect(addressBookForm().addresses[0].city).toBe('Lyon');
    });
  });

  it('should throw on onAppStart inside generator insertion on object form tree', () => {
    TestBed.runInInjectionContext(() => {
      expect(() => {
        craftUse(
          state(
            'profileForm',
            {
              credentials: { name: 'romain', password: 'secret' },
              status: 'draft',
            } satisfies ProfileFormValue,
            insertForm(
              insertSelectFormTree('credentials', function* () {
                yield* onAppStart(() => {});
                return {};
              }),
            ),
          ),
        );
      }).toThrow('insertSelectFormTree generators do not support onAppStart');
    });
  });

  it('should throw on onAppStart inside generator insertion on array form tree items', () => {
    TestBed.runInInjectionContext(() => {
      expect(() => {
        craftUse(
          state(
            'addressBook',
            {
              addresses: [{ city: 'Paris', zip: '75000' }],
            } satisfies AddressBookFormValue,
            insertForm(
              insertSelectFormTree('addresses', (context) =>
                craftPipe(
                  context,
                  insertNoopTypingAnchor,
                  insertSelectFormTree('item', function* () {
                    yield* onAppStart(() => {});
                    return {};
                  }),
                ),
              ),
            ),
          ),
        );
      }).toThrow('insertSelectFormTree generators do not support onAppStart');
    });
  });
});
