// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import FullDemo, { FullDemoView, provideFullDemoView } from './full-demo';
import {
  setupCraftServiceTestingByRegister,
  TestBed,
  craftUse,
  type ValidatedFormValue,
} from '@craft-ts/core';

const validatedTitle = (
  title: string,
): NonNullable<ValidatedFormValue<string>> =>
  title as NonNullable<ValidatedFormValue<string>>;

describe('Full primitives demo logic', () => {
  async function createLogic() {
    const result = await setupCraftServiceTestingByRegister(FullDemoView, {
      fullDemoView: provideFullDemoView(),
    });

    TestBed.tick();
    await vi.waitFor(() =>
      expect(craftUse(result.sut.todos.value())).toEqual([
        { id: 1, title: 'Learn Craft primitives' },
        { id: 2, title: 'Build functional components' },
      ]),
    );

    return result;
  }

  it('loads the initial todos', async () => {
    const { sut, injector } = await createLogic();

    try {
      expect(craftUse(sut.todos.value())).toEqual([
        { id: 1, title: 'Learn Craft primitives' },
        { id: 2, title: 'Build functional components' },
      ]);
      expect(craftUse(sut.todos.status())).toBe('resolved');
    } finally {
      injector.destroy();
    }
  });

  it('adds todos through the mutation with a new id', async () => {
    const { sut, injector } = await createLogic();

    try {
      sut.addTodo.mutate(validatedTitle('Write primitive tests'));

      await vi.waitFor(() =>
        expect(craftUse(sut.todos.value())).toContainEqual({
          id: 3,
          title: 'Write primitive tests',
        }),
      );
      expect(craftUse(sut.addTodo.value())).toEqual({
        id: 3,
        title: 'Write primitive tests',
      });
      expect(craftUse(sut.todos.value())).toHaveLength(3);
    } finally {
      injector.destroy();
    }
  });

  it('allocates unique monotonic ids for successive additions', async () => {
    const { sut, injector } = await createLogic();

    try {
      sut.addTodo.mutate(validatedTitle('Third todo'));
      await vi.waitFor(() =>
        expect(craftUse(sut.todos.value())).toHaveLength(3),
      );

      sut.addTodo.mutate(validatedTitle('Fourth todo'));
      await vi.waitFor(() =>
        expect(craftUse(sut.todos.value())).toHaveLength(4),
      );

      expect(craftUse(sut.todos.value())).toContainEqual({
        id: 3,
        title: 'Third todo',
      });
      expect(craftUse(sut.todos.value())).toContainEqual({
        id: 4,
        title: 'Fourth todo',
      });
    } finally {
      injector.destroy();
    }
  });

  it('removes only the requested todo', async () => {
    const { sut, injector } = await createLogic();

    try {
      sut.removeTodo.mutate(1);

      await vi.waitFor(() =>
        expect(craftUse(sut.todos.value())).toEqual([
          { id: 2, title: 'Build functional components' },
        ]),
      );
      expect(craftUse(sut.removeTodo.value())).toBe(1);
    } finally {
      injector.destroy();
    }
  });

  it('keeps the list unchanged when removing an unknown id', async () => {
    const { sut, injector } = await createLogic();

    try {
      const initialTodos = craftUse(sut.todos.value());

      sut.removeTodo.mutate(999);

      await vi.waitFor(() =>
        expect(craftUse(sut.removeTodo.status())).toBe('resolved'),
      );
      expect(craftUse(sut.todos.value())).toEqual(initialTodos);
    } finally {
      injector.destroy();
    }
  });
});
