import { computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HOST_TAG_LIST } from '../host-tag';
import { craftPipe } from '../craft-pipe';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertSelectFormTree } from './insert-select-form-tree';
import { formTreeNeed, makeFormTreeInsert } from './make-form-tree-insert';

type UserShape = {
  user: { name: string; age: number };
};

describe('makeFormTreeInsert', () => {
  it('inlines the captured insertions onto the parent form', () => {
    TestBed.runInInjectionContext(() => {
      const { insertUserFormTree } = makeFormTreeInsert(
        'UserForm',
        formTreeNeed<UserShape>(),
        insertSelectFormTree('user', ({ field }) => ({
          upperName: computed(() => field.name.value().toUpperCase()),
        })),
      );

      const parent = state(
        { user: { name: 'romain', age: 30 }, orderId: 'abc' },
        insertForm(insertUserFormTree()),
      );

      const userForm = (
        parent.form as unknown as {
          selectUser: () => {
            name: { value: () => string; setValue: (v: string) => void };
            upperName: () => string;
          };
        }
      ).selectUser();

      expect(userForm.name.value()).toBe('romain');
      expect(userForm.upperName()).toBe('ROMAIN');

      userForm.name.setValue('alice');
      TestBed.tick();
      expect(parent().user.name).toBe('alice');
      expect(userForm.upperName()).toBe('ALICE');
    });
  });

  it('tags the inlined insertions with the host name', () => {
    TestBed.runInInjectionContext(() => {
      const { insertUserFormTree } = makeFormTreeInsert(
        'UserForm',
        formTreeNeed<UserShape>(),
        () => ({
          hostTags: inject(HOST_TAG_LIST),
        }),
      );

      const parent = state(
        { user: { name: 'romain', age: 30 } },
        insertForm(insertUserFormTree()),
      );

      const tags = (parent.form as unknown as { hostTags: readonly string[] })
        .hostTags;
      expect(tags).toContain('formTree:UserForm');
      // The form-level injector is also tagged with 'form'.
      expect(tags).toContain('form');
    });
  });

  it('accumulates raw outputs across nested insertions', () => {
    TestBed.runInInjectionContext(() => {
      const { insertUserFormTree } = makeFormTreeInsert(
        'UserForm',
        formTreeNeed<UserShape>(),
        (context) =>
          craftPipe(
            context,
            () => ({
              greeting: 'hello',
            }),
            ({ insertions }) => ({
              greetedName: computed(
                () => `${(insertions as { greeting: string }).greeting} world`,
              ),
            }),
          ),
      );

      const parent = state(
        { user: { name: 'romain', age: 30 } },
        insertForm(insertUserFormTree()),
      );

      expect(
        (parent.form as unknown as { greeting: string }).greeting,
      ).toBe('hello');
      expect(
        (
          parent.form as unknown as { greetedName: () => string }
        ).greetedName(),
      ).toBe('hello world');
    });
  });

  it("rejects a parent whose state doesn't satisfy the needed shape", () => {
    TestBed.runInInjectionContext(() => {
      const { insertUserFormTree } = makeFormTreeInsert(
        'UserForm',
        formTreeNeed<UserShape>(),
        insertSelectFormTree('user', () => ({})),
      );

      state(
        { orderId: 'abc' as const },
        // @ts-expect-error parent state has no `user` field, so it does
        //  not satisfy `formTreeNeed<UserShape>()`.
        insertForm(insertUserFormTree()),
      );
    });
  });

  it('exposes a typed sentinel under `${HostName}Tree`', () => {
    const { UserFormTree } = makeFormTreeInsert(
      'UserForm',
      formTreeNeed<UserShape>(),
      insertSelectFormTree('user', () => ({ marker: 1 as const })),
    );

    // Runtime value is undefined (sentinel only used for `typeof UserFormTree`).
    expect(UserFormTree).toBeUndefined();
    type _UserFormTreeType = typeof UserFormTree;
  });
});
