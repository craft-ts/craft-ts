// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { setupCraftComponentLogicTest } from '@craft-ng/component';
import { describe, expect, it, vi } from 'vitest';
import FullDemo from './full-demo';
import { craftUse } from '@craft-ng/core';

describe('Full primitives demo logic', () => {
  async function createLogic() {
    const result = await setupCraftComponentLogicTest(FullDemo, {
      register: {},
    });

    TestBed.tick();
    await vi.waitFor(() =>
      expect(craftUse(result.context.todos.value())).toEqual([
        { id: 1, title: 'Learn Craft primitives' },
        { id: 2, title: 'Build functional components' },
      ]),
    );

    return result;
  }

  it('loads the initial todos', async () => {
    const { context, destroy } = await createLogic();

    try {
      expect(craftUse(context.todos.value())).toEqual([
        { id: 1, title: 'Learn Craft primitives' },
        { id: 2, title: 'Build functional components' },
      ]);
      expect(craftUse(context.todos.status())).toBe('resolved');
    } finally {
      destroy();
    }
  });

  it('adds todos through the mutation with a new id', async () => {
    const { context, destroy } = await createLogic();

    try {
      context.addTodo.mutate('Write primitive tests');

      await vi.waitFor(() =>
        expect(craftUse(context.todos.value())).toContainEqual({
          id: 3,
          title: 'Write primitive tests',
        }),
      );
      expect(craftUse(context.addTodo.value())).toEqual({
        id: 3,
        title: 'Write primitive tests',
      });
      expect(craftUse(context.todos.value())).toHaveLength(3);
    } finally {
      destroy();
    }
  });

  it('allocates unique monotonic ids for successive additions', async () => {
    const { context, destroy } = await createLogic();

    try {
      context.addTodo.mutate('Third todo');
      await vi.waitFor(() =>
        expect(craftUse(context.todos.value())).toHaveLength(3),
      );

      context.addTodo.mutate('Fourth todo');
      await vi.waitFor(() =>
        expect(craftUse(context.todos.value())).toHaveLength(4),
      );

      expect(craftUse(context.todos.value())).toContainEqual({
        id: 3,
        title: 'Third todo',
      });
      expect(craftUse(context.todos.value())).toContainEqual({
        id: 4,
        title: 'Fourth todo',
      });
    } finally {
      destroy();
    }
  });

  it('removes only the requested todo', async () => {
    const { context, destroy } = await createLogic();

    try {
      context.removeTodo.mutate(1);

      await vi.waitFor(() =>
        expect(craftUse(context.todos.value())).toEqual([
          { id: 2, title: 'Build functional components' },
        ]),
      );
      expect(craftUse(context.removeTodo.value())).toBe(1);
    } finally {
      destroy();
    }
  });

  it('keeps the list unchanged when removing an unknown id', async () => {
    const { context, destroy } = await createLogic();

    try {
      const initialTodos = craftUse(context.todos.value());

      context.removeTodo.mutate(999);

      await vi.waitFor(() =>
        expect(craftUse(context.removeTodo.status())).toBe('resolved'),
      );
      expect(craftUse(context.todos.value())).toEqual(initialTodos);
    } finally {
      destroy();
    }
  });
});
