import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { insertSelect } from './insert-select';
import { insertSelectProperty } from './insert-select-property';
import { on$ } from './on$';
import { source$ } from './source$';
import { state } from './state';

const runInInjectionContext = <T>(fn: () => T): T =>
  TestBed.runInInjectionContext(fn);

describe('insertSelect', () => {
  it('should work like insertSelectProperty on object states', () => {
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

  it('should work like insertSelectItem on array states', () => {
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
      // @ts-expect-error selectItem should not be exposed by insertSelect
      cells.selectItem;

      TestBed.tick();
      cells.selectCell(0)?.paint();
      expect(cells.select(0)?.color).toBe('black');
      expect(cells.select(0)?.paintCount).toBe(1);
      expect(cells.selectCell(0)?.paintCountStr()).toBe('Painted 1 times');
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
          insertSelectProperty(
            'cell',
            insertSelectProperty('style', ({ update }) => ({
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
      expect(cells.select(0)?.color).toBe('red');
      expect(cells.select(0)?.paintCount).toBe(1);
    });
  });
  it('should expose cross-layer source$ from nested insertions', () => {
    runInInjectionContext(() => {
      const cells = state(
        { data: [{ index: 0, paintCount: 0, color: 'white' }] },
        insertSelect(
          'data',
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
