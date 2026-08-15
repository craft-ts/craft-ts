// @vitest-environment jsdom
import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import {
  setupCraftServiceTestingByRegister, craftUse } from '@craft-ng/core';
import { TodoStore, provideTodoStore } from './full-demo';

describe('TodoStore logic', () => {
  async function createStore() {
    const { sut } = await setupCraftServiceTestingByRegister(TodoStore, {
      TodoStore: provideTodoStore(),
    });

    await vi.waitFor(() =>
      expect(craftUse(sut.todos.value())).toEqual([
        { id: 1, title: 'Compose a craftService' },
        { id: 2, title: 'Expose query and mutations' },
      ]),
    );

    return sut;
  }

  it('loads the initial todos', async () => {
    const store = await createStore();

    expect(craftUse(store.todos.value())).toEqual([
      { id: 1, title: 'Compose a craftService' },
      { id: 2, title: 'Expose query and mutations' },
    ]);
    expect(craftUse(store.todos.status())).toBe('resolved');
  });

  it('adds todos through the mutation projection with a new id', async () => {
    const store = await createStore();

    store.add.mutate('Write logic tests');

    await vi.waitFor(() =>
      expect(craftUse(store.todos.value())).toContainEqual({
        id: 3,
        title: 'Write logic tests',
      }),
    );
    expect(craftUse(store.add.value())).toEqual({
      id: 3,
      title: 'Write logic tests',
    });
    expect(craftUse(store.todos.value())).toHaveLength(3);
  });

  it('allocates unique monotonic ids for successive additions', async () => {
    const store = await createStore();

    store.add.mutate('Third todo');
    await vi.waitFor(() =>
      expect(craftUse(store.todos.value())).toHaveLength(3),
    );

    store.add.mutate('Fourth todo');
    await vi.waitFor(() =>
      expect(craftUse(store.todos.value())).toHaveLength(4),
    );

    expect(craftUse(store.todos.value())).toContainEqual({
      id: 3,
      title: 'Third todo',
    });
    expect(craftUse(store.todos.value())).toContainEqual({
      id: 4,
      title: 'Fourth todo',
    });
  });

  it('removes only the requested todo', async () => {
    const store = await createStore();

    store.remove.mutate(1);

    await vi.waitFor(() =>
      expect(craftUse(store.todos.value())).toEqual([
        { id: 2, title: 'Expose query and mutations' },
      ]),
    );
    expect(craftUse(store.remove.value())).toBe(1);
  });

  it('keeps the list unchanged when removing an unknown id', async () => {
    const store = await createStore();
    const initialTodos = craftUse(store.todos.value());

    store.remove.mutate(999);

    await vi.waitFor(() =>
      expect(craftUse(store.remove.status())).toBe('resolved'),
    );
    expect(craftUse(store.todos.value())).toEqual(initialTodos);
  });
});
