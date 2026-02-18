import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { insertSelectProperty } from './insert-select-property';
import { source$ } from './source$';
import { state } from './state';

const runInInjectionContext = <T>(fn: () => T): T =>
  TestBed.runInInjectionContext(fn);

describe('insertSelectProperty', () => {
  it('should add methods and computed properties on a selected property', () => {
    runInInjectionContext(() => {
      const activeColor = signal('black');

      const board = state(
        {
          meta: { label: 'board' },
          cell: {
            index: 0,
            color: 'white',
            paintCount: 0,
          },
        },
        insertSelectProperty('cell', ({ state, update }) => ({
          paint: () =>
            update((cell) => ({
              ...cell,
              color: activeColor(),
              paintCount: cell.paintCount + 1,
            })),
          paintCountStr: computed(() => `Painted ${state().paintCount} times`),
        })),
      );

      TestBed.tick();
      expect(board().cell.color).toBe('white');
      expect((board().cell as { paint?: unknown } | undefined)?.paint).toBe(
        undefined,
      );
      expect(board.selectCell().paintCountStr()).toBe('Painted 0 times');
      board.selectCell().paint();
      board.selectCell().paint();
      expect(board().cell.color).toBe('black');
      expect(board().cell.paintCount).toBe(2);
      expect(board.selectCell().paintCountStr()).toBe('Painted 2 times');
    });
  });

  it('should allow using set/update helpers on the selected property', () => {
    runInInjectionContext(() => {
      const board = state(
        {
          cell: {
            index: 0,
            color: 'white',
            paintCount: 0,
          },
        },
        insertSelectProperty('cell', ({ set, update, state }) => ({
          resetToBlue: () =>
            set({
              ...state(),
              color: 'blue',
              paintCount: 0,
            }),
          increment: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
      );

      TestBed.tick();
      board.selectCell().increment();
      board.selectCell().increment();
      expect(board().cell.paintCount).toBe(2);

      board.selectCell().resetToBlue();
      expect(board().cell.color).toBe('blue');
      expect(board().cell.paintCount).toBe(0);
    });
  });

  it('should support using two insertSelectProperty on the same state', () => {
    runInInjectionContext(() => {
      const board = state(
        {
          cell: {
            index: 0,
            color: 'white',
            paintCount: 0,
          },
          meta: {
            title: 'Board',
            version: 1,
          },
        },
        insertSelectProperty('cell', ({ update }) => ({
          incrementPaint: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
        insertSelectProperty('meta', ({ update }) => ({
          bumpVersion: () =>
            update((meta) => ({ ...meta, version: meta.version + 1 })),
        })),
      );

      TestBed.tick();
      board.selectCell().incrementPaint();
      board.selectMeta().bumpVersion();
      board.selectMeta().bumpVersion();

      expect(board().cell.paintCount).toBe(1);
      expect(board().meta.version).toBe(3);
    });
  });

  it('should support nested insertSelectProperty inside insertSelectProperty', () => {
    runInInjectionContext(() => {
      const board = state(
        {
          cell: {
            index: 0,
            style: {
              color: 'white',
              border: {
                width: 1,
              },
            },
          },
        },
        insertSelectProperty(
          'cell',
          insertSelectProperty('style', ({ update }) => ({
            paintBlackAndIncreaseBorder: () =>
              update((style) => ({
                ...style,
                color: 'black',
                border: {
                  ...style.border,
                  width: style.border.width + 1,
                },
              })),
          })),
        ),
      );

      TestBed.tick();
      board.selectCell().selectStyle().paintBlackAndIncreaseBorder();
      board.selectCell().selectStyle().paintBlackAndIncreaseBorder();

      expect(board().cell.style.color).toBe('black');
      expect(board().cell.style.border.width).toBe(3);
    });
  });

  it('should preserve inference with multiple insertions on the same property', () => {
    runInInjectionContext(() => {
      const board = state(
        {
          cell: {
            index: 0,
            color: 'white',
            paintCount: 0,
          },
        },
        insertSelectProperty(
          'cell',
          ({ update }) => ({
            incrementPaint: () =>
              update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
          }),
          ({ state, insertions }) => ({
            hasPainted: computed(() => state().paintCount > 0),
            incrementTwice: () => {
              insertions.incrementPaint();
              return insertions.incrementPaint();
            },
          }),
        ),
      );

      expectTypeOf(board.selectCell().incrementPaint).toEqualTypeOf<
        () => {
          index: number;
          color: string;
          paintCount: number;
        }
      >();
      expectTypeOf(board.selectCell().hasPainted()).toEqualTypeOf<boolean>();
      expectTypeOf(board.selectCell().incrementTwice).toEqualTypeOf<
        () => {
          index: number;
          color: string;
          paintCount: number;
        }
      >();

      TestBed.tick();
      board.selectCell().incrementTwice();
      expect(board().cell.paintCount).toBe(2);
      expect(board.selectCell().hasPainted()).toBe(true);
    });
  });

  it('should allow first insertSelectProperty insertion to access previous state insertions', () => {
    runInInjectionContext(() => {
      const board = state(
        {
          cell: {
            index: 0,
            color: 'white',
            paintCount: 0,
          },
        },
        () => {
          const test = source$<number>();
          return {
            test,
            emitTest: (value: number) => test.emit(value),
          };
        },
        insertSelectProperty('cell', ({ state, update, insertions: { test } }) => ({
          paintFromTest: () =>
            update((cell) => ({
              ...cell,
              paintCount: cell.paintCount + (test.value() ?? 0),
            })),
          paintCountStr: computed(
            () => `Painted ${state().paintCount} times with ${test.value() ?? 0}`,
          ),
        })),
      );

      expectTypeOf(board.selectCell().paintFromTest).toEqualTypeOf<
        () => {
          index: number;
          color: string;
          paintCount: number;
        }
      >();

      TestBed.tick();
      expect(board.selectCell().paintCountStr()).toBe('Painted 0 times with 0');

      board.emitTest(3);
      board.selectCell().paintFromTest();

      expect(board().cell.paintCount).toBe(3);
      expect(board.selectCell().paintCountStr()).toBe('Painted 3 times with 3');
    });
  });
});
