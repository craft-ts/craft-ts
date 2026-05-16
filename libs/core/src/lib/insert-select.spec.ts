import '@angular/compiler';
import { computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { HOST_TAG_LIST } from './host-tag';
import { insertSelect } from './insert-select';
import { on$ } from './on$';
import { Source$, source$ } from './source$';
import { state } from './state';
import { insertNoopTypingAnchor } from './insert-noop-typing-anchor';

const runInInjectionContext = <T>(fn: () => T): T =>
  TestBed.runInInjectionContext(fn);

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

describe('insertSelect', () => {
  it('should reproduce payload inference issue on nested matrix emitters', () => {
    runInInjectionContext(() => {
      type PaintCellEvent = { color: string; cellIndex: number };
      type PixelCellState = {
        index: number;
        columnIndex: number;
        color: string;
        paintCount: number;
      };

      const matrix = state(
        {
          grid: [
            [
              {
                index: 0,
                columnIndex: 0,
                color: 'white',
                paintCount: 0,
              } satisfies PixelCellState,
            ],
          ] as PixelCellState[][],
        },
        insertSelect(
          'grid',
          insertNoopTypingAnchor,
          insertSelect(
            'row',
            ({ state }) => ({
              paintRowWithTargetCellColor$: source$<PaintCellEvent>(),
            }),
            insertSelect('cell', ({ state }) => ({})),
          ),
          ({ state, set, update }) => ({
            paintColumnWithTargetCellColor$: source$<PaintCellEvent>(),
          }),
        ),
      );

      // This assertion reproduces the current issue:
      // TypeScript currently infers a flattened event emitter shape here.
      expectTypeOf(
        matrix.selectGrid().paintColumnWithTargetCellColor$,
      ).branded.toEqualTypeOf<
        Source$<PaintCellEvent> & ((value: PaintCellEvent) => void)
      >();
      // matrix.selectGrid().test;
      expectTypeOf(
        matrix.selectGrid().selectRow(0)?.paintRowWithTargetCellColor$,
      ).toEqualTypeOf<
        | (Source$<PaintCellEvent> & ((value: PaintCellEvent) => void))
        | undefined
      >();

      // matrix.selectGrid().test.paintRowWithTargetCellColor$;
      //.                       ^?
    });
  });

  it('should work on object states', () => {
    runInInjectionContext(() => {
      const board = state(
        {
          cell: {
            index: 0,
            color: 'white',
            paintCount: 0,
          },
        },
        insertSelect('cell', ({ state, update }) => ({
          paint: () =>
            update((cell) => ({
              ...cell,
              color: 'black',
              paintCount: cell.paintCount + 1,
            })),
          paintCountStr: computed(() => `Painted ${state().paintCount} times`),
        })),
      );
      expectTypeOf(board.selectCell().paint).toEqualTypeOf<
        () => { index: number; color: string; paintCount: number }
      >();
      expectTypeOf(board.selectCell().paintCountStr()).toEqualTypeOf<string>();

      TestBed.tick();
      board.selectCell().paint();
      board.selectCell().paint();
      expect(board().cell.color).toBe('black');
      expect(board().cell.paintCount).toBe(2);
      expect(board.selectCell().paintCountStr()).toBe('Painted 2 times');
    });
  });

  it('should tag object select insertions with the select name', () => {
    runInInjectionContext(() => {
      const board = state(
        {
          cell: {
            index: 0,
            color: 'white',
          },
        },
        insertSelect('cell', () => ({
          hostTags: inject(HOST_TAG_LIST),
        })),
      );

      expect(board.selectCell().hostTags).toEqual(['selectProperty:cell']);
    });
  });

  it('should work on array states', () => {
    runInInjectionContext(() => {
      const cells = state(
        [{ index: 0, color: 'white', paintCount: 0 }],
        insertSelect('cell', ({ state, update }) => ({
          paint: () =>
            update((cell) => ({
              ...cell,
              color: 'black',
              paintCount: cell.paintCount + 1,
            })),
          paintCountStr: computed(() => `Painted ${state().paintCount} times`),
        })),
      );
      expectTypeOf(cells.selectCell(0)?.paint).toEqualTypeOf<
        (() => { index: number; color: string; paintCount: number }) | undefined
      >();
      expectTypeOf(cells.selectCell(0)?.paintCountStr()).toEqualTypeOf<
        string | undefined
      >();

      TestBed.tick();
      cells.selectCell(0)?.paint();
      expect(cells.selectCell(0)?.color).toBe('black');
      expect(cells.selectCell(0)?.paintCount).toBe(1);
      expect(cells.selectCell(0)?.paintCountStr()).toBe('Painted 1 times');
    });
  });

  it('should tag array select insertions with the select name and selected identifier', () => {
    runInInjectionContext(() => {
      const cells = state(
        [
          { index: 0, color: 'white' },
          { index: 1, color: 'black' },
        ],
        insertSelect('cell', () => ({
          hostTags: inject(HOST_TAG_LIST),
        })),
      );

      expect(cells.selectCell(1)?.hostTags).toEqual([
        'selectEntity:cell',
        'selectItem:1',
      ]);
    });
  });

  it('should support mixed nesting item + property via insertSelect', () => {
    runInInjectionContext(() => {
      const matrix = state(
        [
          {
            cell: {
              style: {
                color: 'white',
                paintCount: 0,
              },
            },
          },
        ],
        insertSelect(
          'row',
          insertSelect(
            'cell',
            insertNoopTypingAnchor,
            insertSelect('style', ({ update }) => ({
              paintStyle: () =>
                update((style) => ({
                  ...style,
                  color: 'black',
                  paintCount: style.paintCount + 1,
                })),
            })),
          ),
        ),
      );
      expectTypeOf(
        matrix.selectRow(0)?.selectCell().selectStyle().paintStyle,
      ).toEqualTypeOf<
        (() => { color: string; paintCount: number }) | undefined
      >();

      TestBed.tick();
      matrix.selectRow(0)?.selectCell().selectStyle().paintStyle();
      expect(matrix.selectRow(0)?.selectCell().style.color).toBe('black');
      expect(matrix.selectRow(0)?.selectCell().style.paintCount).toBe(1);
    });
  });

  it('should allow first insertSelect insertion to access previous state insertions on object states', () => {
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
        insertSelect('cell', ({ state, update, insertions }) => {
          expectTypeOf(insertions).toEqualTypeOf<{
            test: Source$<number>;
            emitTest: (value: number) => void;
          }>();
          return {
            paintFromTest: () =>
              update((cell) => ({
                ...cell,
                paintCount: cell.paintCount + (insertions.test.value() ?? 0),
              })),
            paintCountStr: computed(
              () =>
                `Painted ${state().paintCount} times with ${insertions.test.value() ?? 0}`,
            ),
          };
        }),
      );

      expectTypeOf(board.selectCell().paintFromTest).toEqualTypeOf<
        () => { index: number; color: string; paintCount: number }
      >();

      TestBed.tick();
      expect(board.selectCell().paintCountStr()).toBe('Painted 0 times with 0');

      board.emitTest(3);
      board.selectCell().paintFromTest();

      expect(board().cell.paintCount).toBe(3);
      expect(board.selectCell().paintCountStr()).toBe('Painted 3 times with 3');
    });
  });

  it('should allow first insertSelect insertion to access previous state insertions on array states', () => {
    runInInjectionContext(() => {
      const cells = state(
        [{ index: 0, paintCount: 0 }],
        () => {
          const test = source$<number>();
          return {
            test,
            emitTest: (value: number) => test.emit(value),
          };
        },
        insertSelect('cell', ({ state, update, insertions }) => {
          expectTypeOf(insertions).toEqualTypeOf<{
            test: Source$<number>;
            emitTest: (value: number) => void;
          }>();
          return {
            incrementFromTest: () =>
              update((cell) => ({
                ...cell,
                paintCount: cell.paintCount + (insertions.test.value() ?? 0),
              })),
            paintCountStr: computed(
              () =>
                `Painted ${state().paintCount} times with ${insertions.test.value() ?? 0}`,
            ),
          };
        }),
      );

      expectTypeOf(cells.selectCell(0)?.incrementFromTest).toEqualTypeOf<
        (() => { index: number; paintCount: number }) | undefined
      >();

      TestBed.tick();
      expect(cells.selectCell(0)?.paintCountStr()).toBe(
        'Painted 0 times with 0',
      );

      cells.emitTest(2);
      cells.selectCell(0)?.incrementFromTest();

      expect(cells.selectCell(0)?.paintCount).toBe(2);
      expect(cells.selectCell(0)?.paintCountStr()).toBe(
        'Painted 2 times with 2',
      );
    });
  });

  it('should expose cross-layer source$ from nested insertions', () => {
    runInInjectionContext(() => {
      const cells = state(
        [{ index: 0, paintCount: 0, color: 'white' }],
        insertSelect(
          'cell',
          () => ({
            paintCell$: source$<string>(),
          }),
          ({ update, insertions: { paintCell$ } }) => ({
            _paintCell: on$(paintCell$, (color) =>
              update((cell) => ({
                ...cell,
                color,
                paintCount: cell.paintCount + 1,
              })),
            ),
          }),
        ),
      );
      TestBed.tick();
      cells.selectCell(0)?.paintCell$('red');
      expect(cells.selectCell(0)?.color).toBe('red');
      expect(cells.selectCell(0)?.paintCount).toBe(1);
    });
  });
  it('should expose cross-layer source$ from nested insertions', () => {
    runInInjectionContext(() => {
      const cells = state(
        { data: [{ index: 0, paintCount: 0, color: 'white' }] },
        insertSelect(
          'data',
          insertNoopTypingAnchor,
          insertSelect(
            'cell',
            () => ({
              paintCell$: source$<string>(),
            }),
            ({ update, insertions: { paintCell$ } }) => ({
              _paintCell: on$(paintCell$, (color) =>
                update((cell) => ({
                  ...cell,
                  color,
                  paintCount: cell.paintCount + 1,
                })),
              ),
            }),
          ),
        ),
      );
      TestBed.tick();
      cells.selectData().selectCell(0)?.paintCell$('red');
      expect(cells.selectData().selectCell(0)?.color).toBe('red');
      expect(cells.selectData().selectCell(0)?.paintCount).toBe(1);
    });
  });
});
