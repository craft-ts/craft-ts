import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { insertSelectProperty } from './insert-select-property';
import { queryParam } from './query-param';
import { insertSelectItem } from './insert-select-item';
import { source$ } from './source$';
import { state } from './state';

const runInInjectionContext = <T>(fn: () => T): T =>
  TestBed.runInInjectionContext(fn);

describe('insertSelectItem', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add methods and computed properties on each selected state item', () => {
    runInInjectionContext(() => {
      const EMPTY_COLOR = 'white';
      const activeColor = signal('black');

      const cells = state(
        [
          {
            index: 0,
            color: EMPTY_COLOR,
            paintCount: 0,
          },
        ],
        insertSelectItem(({ state, update }) => ({
          paint: () =>
            update((cell) => ({
              ...cell,
              color: cell.color === activeColor() ? EMPTY_COLOR : activeColor(),
              paintCount: cell.paintCount + 1,
            })),
          paintCountStr: computed(() => `Painted ${state().paintCount} times`),
        })),
      );

      TestBed.tick();
      expect(cells.select(0)?.color).toBe('white');
      expect((cells.select(0) as { paint?: unknown } | undefined)?.paint).toBe(
        undefined,
      );
      expect(cells.selectItem(0)?.paintCountStr()).toBe('Painted 0 times');

      cells.selectItem(0)?.paint();

      expect(cells.select(0)?.color).toBe('black');
      expect(cells.select(1)?.color).toBe('white');
      expect(cells.select(0)?.paintCount).toBe(1);
      expect(cells.selectItem(0)?.paintCountStr()).toBe('Painted 1 times');
    });
  });

  it('should allow using set/update helpers on each selected state', () => {
    runInInjectionContext(() => {
      const cells = state(
        [
          {
            index: 0,
            color: 'white',
            paintCount: 0,
          },
        ],
        insertSelectItem(({ set, update, state }) => ({
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
      cells.selectItem(0)?.increment();
      cells.selectItem(0)?.increment();
      expect(cells.select(0)?.paintCount).toBe(2);

      cells.selectItem(0)?.resetToBlue();
      expect(cells.select(0)?.color).toBe('blue');
      expect(cells.select(0)?.paintCount).toBe(0);
    });
  });

  it('should work with queryParam primitive as selected item id', () => {
    runInInjectionContext(() => {
      const selectedCell = queryParam(
        {
          state: {
            selected: {
              fallbackValue: 0,
              parse: (value: string) => Number(value),
              serialize: (value: unknown) => String(value),
            },
          },
        },
        ({ set }) => ({
          selectSecond: () => set({ selected: 1 }),
        }),
      );

      const cells = state(
        [
          { index: 0, color: 'white', paintCount: 0 },
          { index: 1, color: 'white', paintCount: 0 },
        ],
        insertSelectItem(({ update }) => ({
          increment: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
      );

      TestBed.tick();
      cells.selectItem(selectedCell.selected() as number)?.increment();
      expect(cells.select(0)?.paintCount).toBe(1);
      expect(cells.select(1)?.paintCount).toBe(0);

      selectedCell.selectSecond();
      cells.selectItem(selectedCell.selected() as number)?.increment();
      expect(cells.select(0)?.paintCount).toBe(1);
      expect(cells.select(1)?.paintCount).toBe(1);
    });
  });

  it('should work with insertSelectItem and insertSelectProperty together', () => {
    runInInjectionContext(() => {
      type Cell = {
        index: number;
        style: {
          color: string;
          border: { width: number };
        };
      };

      const styleModifier = insertSelectProperty<
        Cell,
        'style',
        {
          paintAndIncreaseBorder: () => {
            color: string;
            border: { width: number };
          };
        }
      >(
        'style',
        ({ update }) => ({
          paintAndIncreaseBorder: () =>
            update((style) => ({
              ...style,
              color: 'black',
              border: {
                ...style.border,
                width: style.border.width + 1,
              },
            })),
        }),
      );

      const cells = state(
        [
          {
            index: 0,
            style: {
              color: 'white',
              border: { width: 1 },
            },
          },
        ] as Cell[],
        insertSelectItem(styleModifier),
      );

      TestBed.tick();
      cells.selectItem(0)?.selectStyle().paintAndIncreaseBorder();
      cells.selectItem(0)?.selectStyle().paintAndIncreaseBorder();

      expect(cells.select(0)?.style.color).toBe('black');
      expect(cells.select(0)?.style.border.width).toBe(3);
    });
  });

  it('should expose items with insertions for array states', () => {
    runInInjectionContext(() => {
      const cells = state(
        [
          { index: 0, paintCount: 0 },
          { index: 1, paintCount: 0 },
        ],
        insertSelectItem(({ update }) => ({
          increment: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
      );

      TestBed.tick();
      expect(cells.items()).toHaveLength(2);
      expect(cells.items()[0].index).toBe(0);
      expect(cells.items()[1].index).toBe(1);

      cells.items()[1].increment();
      expect(cells.select(1)?.paintCount).toBe(1);
    });
  });

  it('should expose items with insertions for record states', () => {
    runInInjectionContext(() => {
      const cells = state(
        {
          first: { index: 0, paintCount: 0 },
          second: { index: 1, paintCount: 0 },
        },
        insertSelectItem(({ update }) => ({
          increment: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
      );

      TestBed.tick();
      expect(cells.items()).toHaveLength(2);

      const secondCell = cells.items().find((cell) => cell.index === 1);
      expect(secondCell).toBeDefined();
      secondCell?.increment();
      expect(cells.select('second')?.paintCount).toBe(1);
    });
  });

  it('should allow first insertSelectItem insertion to access previous state insertions', () => {
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
        insertSelectItem(({ state, update, insertions: { test } }) => ({
          incrementFromTest: () =>
            update((cell) => ({
              ...cell,
              paintCount: cell.paintCount + (test.value() ?? 0),
            })),
          paintCountStr: computed(
            () => `Painted ${state().paintCount} times with ${test.value() ?? 0}`,
          ),
        })),
      );

      expectTypeOf(cells.selectItem(0)?.incrementFromTest).toEqualTypeOf<
        (() => { index: number; paintCount: number }) | undefined
      >();

      TestBed.tick();
      expect(cells.selectItem(0)?.paintCountStr()).toBe(
        'Painted 0 times with 0',
      );

      cells.emitTest(2);
      cells.selectItem(0)?.incrementFromTest();

      expect(cells.select(0)?.paintCount).toBe(2);
      expect(cells.selectItem(0)?.paintCountStr()).toBe(
        'Painted 2 times with 2',
      );
    });
  });
});
