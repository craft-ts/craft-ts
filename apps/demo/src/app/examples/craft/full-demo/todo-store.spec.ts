// @vitest-environment jsdom
import '@angular/compiler';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setupCraftServiceTestingByRegister } from '@craft-ng/core';
import { TodoStore, provideTodoStore } from './full-demo';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('TodoStore logic', () => {
  async function createStore() {
    const { sut } = await setupCraftServiceTestingByRegister(TodoStore, {
      TodoStore: provideTodoStore(),
    });

    await vi.waitFor(() =>
      expect(sut.todos.value()).toEqual([
        { id: 1, title: 'Compose a craftService' },
        { id: 2, title: 'Expose query and mutations' },
      ]),
    );

    return sut;
  }

  it('loads the initial todos', async () => {
    const store = await createStore();

    expect(store.todos.value()).toEqual([
      { id: 1, title: 'Compose a craftService' },
      { id: 2, title: 'Expose query and mutations' },
    ]);
    expect(store.todos.status()).toBe('resolved');
  });

  it('adds todos through the mutation projection with a new id', async () => {
    const store = await createStore();

    store.add.mutate('Write logic tests');

    await vi.waitFor(() =>
      expect(store.todos.value()).toContainEqual({
        id: 3,
        title: 'Write logic tests',
      }),
    );
    expect(store.add.value()).toEqual({
      id: 3,
      title: 'Write logic tests',
    });
    expect(store.todos.value()).toHaveLength(3);
  });

  it('allocates unique monotonic ids for successive additions', async () => {
    const store = await createStore();

    store.add.mutate('Third todo');
    await vi.waitFor(() => expect(store.todos.value()).toHaveLength(3));

    store.add.mutate('Fourth todo');
    await vi.waitFor(() => expect(store.todos.value()).toHaveLength(4));

    expect(store.todos.value()).toContainEqual({ id: 3, title: 'Third todo' });
    expect(store.todos.value()).toContainEqual({ id: 4, title: 'Fourth todo' });
  });

  it('removes only the requested todo', async () => {
    const store = await createStore();

    store.remove.mutate(1);

    await vi.waitFor(() =>
      expect(store.todos.value()).toEqual([
        { id: 2, title: 'Expose query and mutations' },
      ]),
    );
    expect(store.remove.value()).toBe(1);
  });

  it('keeps the list unchanged when removing an unknown id', async () => {
    const store = await createStore();
    const initialTodos = store.todos.value();

    store.remove.mutate(999);

    await vi.waitFor(() => expect(store.remove.status()).toBe('resolved'));
    expect(store.todos.value()).toEqual(initialTodos);
  });
});
