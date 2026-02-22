import { computed, Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { insertSelectProperty } from './insert-select-property';
import { queryParam } from './query-param';
import { insertSelectItem } from './insert-select-item';
import { source$ } from './source$';
import { state } from './state';
import { on$ } from './on$';

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
        insertSelectItem('item', ({ state, update }) => ({
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
      expect(cells()[0]?.color).toBe('white');
      expect((cells()[0] as { paint?: unknown } | undefined)?.paint).toBe(
        undefined,
      );
      expect(cells.selectItem(0)?.paintCountStr()).toBe('Painted 0 times');

      cells.selectItem(0)?.paint();

      expect(cells()[0]?.color).toBe('black');
      expect(cells()[1]?.color).toBe('white');
      expect(cells()[0]?.paintCount).toBe(1);
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
        insertSelectItem('item2', ({ set, update, state }) => ({
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
      expect((cells as { select?: unknown }).select).toBeUndefined();
      expect((cells as { selectItem?: unknown }).selectItem).toBeUndefined();
      cells.selectItem2(0)?.increment();
      cells.selectItem2(0)?.increment();
      expect(cells()[0]?.paintCount).toBe(2);

      cells.selectItem2(0)?.resetToBlue();
      expect(cells()[0]?.color).toBe('blue');
      expect(cells()[0]?.paintCount).toBe(0);
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
        insertSelectItem('item', ({ update }) => ({
          increment: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
      );

      TestBed.tick();
      cells.selectItem(selectedCell.selected() as number)?.increment();
      expect(cells()[0]?.paintCount).toBe(1);
      expect(cells()[1]?.paintCount).toBe(0);

      selectedCell.selectSecond();
      cells.selectItem(selectedCell.selected() as number)?.increment();
      expect(cells()[0]?.paintCount).toBe(1);
      expect(cells()[1]?.paintCount).toBe(1);
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
      >('style', ({ update }) => ({
        paintAndIncreaseBorder: () =>
          update((style) => ({
            ...style,
            color: 'black',
            border: {
              ...style.border,
              width: style.border.width + 1,
            },
          })),
      }));

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
        insertSelectItem('item', styleModifier),
      );

      TestBed.tick();
      cells.selectItem(0)?.selectStyle().paintAndIncreaseBorder();
      cells.selectItem(0)?.selectStyle().paintAndIncreaseBorder();

      expect(cells()[0]?.style.color).toBe('black');
      expect(cells()[0]?.style.border.width).toBe(3);
    });
  });

  it('should expose items with insertions for array states', () => {
    runInInjectionContext(() => {
      const cells = state(
        [
          { index: 0, paintCount: 0 },
          { index: 1, paintCount: 0 },
        ],
        insertSelectItem('item', ({ update }) => ({
          increment: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
      );

      TestBed.tick();
      expect(cells.items()).toHaveLength(2);
      expect(cells.items()[0].index).toBe(0);
      expect(cells.items()[1].index).toBe(1);

      cells.items()[1].increment();
      expect(cells()[1]?.paintCount).toBe(1);
    });
  });

  it('should expose items with insertions for record states', () => {
    runInInjectionContext(() => {
      const cells = state(
        {
          first: { index: 0, paintCount: 0 },
          second: { index: 1, paintCount: 0 },
        },
        insertSelectItem('item', ({ update }) => ({
          increment: () =>
            update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
        })),
      );

      TestBed.tick();
      expect(cells.items()).toHaveLength(2);

      const secondCell = cells.items().find((cell) => cell.index === 1);
      expect(secondCell).toBeDefined();
      secondCell?.increment();
      expect(cells().second?.paintCount).toBe(1);
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
        insertSelectItem('item', ({ state, update, insertions: { test } }) => ({
          incrementFromTest: () =>
            update((cell) => ({
              ...cell,
              paintCount: cell.paintCount + (test.value() ?? 0),
            })),
          paintCountStr: computed(
            () =>
              `Painted ${state().paintCount} times with ${test.value() ?? 0}`,
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

      expect(cells()[0]?.paintCount).toBe(2);
      expect(cells.selectItem(0)?.paintCountStr()).toBe(
        'Painted 2 times with 2',
      );
    });
  });

  it('should support up to 5 chained insertions with inferred selected item methods', () => {
    runInInjectionContext(() => {
      const cells = state(
        [{ index: 0, paintCount: 1, tag: 'init' }],
        insertSelectItem(
          'item',
          ({ update }) => ({
            addOne: () =>
              update((cell) => ({ ...cell, paintCount: cell.paintCount + 1 })),
          }),
          ({ update }) => ({
            multiplyByTwo: () =>
              update((cell) => ({ ...cell, paintCount: cell.paintCount * 2 })),
          }),
          ({ update }) => ({
            setTagFromCount: () =>
              update((cell) => ({ ...cell, tag: `count-${cell.paintCount}` })),
          }),
          ({ state }) => ({
            label: computed(() => `${state().tag}:${state().paintCount}`),
          }),
          ({ state }) => ({
            isEven: computed(() => state().paintCount % 2 === 0),
          }),
        ),
      );

      expectTypeOf(cells.selectItem(0)?.addOne).toEqualTypeOf<
        (() => { index: number; paintCount: number; tag: string }) | undefined
      >();
      expectTypeOf(cells.selectItem(0)?.multiplyByTwo).toEqualTypeOf<
        (() => { index: number; paintCount: number; tag: string }) | undefined
      >();
      expectTypeOf(cells.selectItem(0)?.setTagFromCount).toEqualTypeOf<
        (() => { index: number; paintCount: number; tag: string }) | undefined
      >();
      expectTypeOf(cells.selectItem(0)?.label).toEqualTypeOf<
        Signal<string> | undefined
      >();
      expectTypeOf(cells.selectItem(0)?.isEven).toEqualTypeOf<
        Signal<boolean> | undefined
      >();

      cells.selectItem(0)?.addOne();
      cells.selectItem(0)?.multiplyByTwo();
      cells.selectItem(0)?.setTagFromCount();

      expect(cells()[0]?.paintCount).toBe(4);
      expect(cells.selectItem(0)?.label()).toBe('count-4:4');
      expect(cells.selectItem(0)?.isEven()).toBe(true);
    });
  });

  // it.todo('should expose internalSource$ as a cross-layer source$ (bottom to top)', () => {
  //   runInInjectionContext(() => {
  //     const cells = state(
  //       [{ index: 0, paintCount: 0, color: 'white' }],
  //       insertSelectItem(
  //         'item',
  //         () => ({
  //           paintCell$: source$<string>(),
  //         }),
  //         ({ update, insertions: { paintCell$ } }) => ({
  //           _paintCell: on$(paintCell$, (color) =>
  //             update((cell) => ({
  //               ...cell,
  //               color,
  //               paintCount: cell.paintCount + 1,
  //             })),
  //           ),
  //         }),
  //       ),
  //       ({ insertions: { paintCell$ } }) => {
  //         on$(paintCell$, (event) => {
  //           expectTypeOf(event).toEqualTypeOf<{
  //             payload: string; // infer payload type from source$<string>
  //             path: [number];
  //             leaf: {
  //               item: { index: number; paintCount: number; color: string }; // infer item type from state item
  //               index: number; // infer index type from state item
  //             };
  //           }>();
  //           expect(event.path).toEqual([0]);
  //         });
  //         return {
  //           eventRoot: paintCell$.value,
  //         };
  //       },
  //     );

  //     TestBed.tick();
  //     //@ts-expect-error _paintCell should not be exposed on cells
  //     expect(cells.selectItem(0)?._paintCell).not.toBeDefined();
  //     expectTypeOf(cells.eventRoot).toEqualTypeOf<
  //       Signal<
  //         | {
  //             payload: string;
  //             path: [number];
  //             leaf: {
  //               item: { index: number; paintCount: number; color: string };
  //               index: number;
  //             };
  //           }
  //         | undefined
  //       >
  //     >();

  //     cells.selectItem(0)?.paintCell$('red');

  //     expect(cells.select(0)?.color).toBe('red');
  //     expect(cells.select(0)?.paintCount).toBe(1);
  //     expect(cells.eventRoot()?.payload).toBe('red');
  //     expect(cells.eventRoot()?.path).toEqual([0]);
  //     expect(cells.eventRoot()?.leaf.index).toBe(0);
  //     expect(cells.eventRoot()?.leaf.item.index).toBe(0);
  //   });
  // });

  // it.todo('should expose internalSource$ as a cross-layer source$ (bottom to top) in nested layers', async () => {
  //   vi.useFakeTimers();
  //   await runInInjectionContext(async () => {
  //     const matrix = state(
  //       [[{ index: 0, paintCount: 0, color: 'white' }]],
  //       insertSelectItem(
  //         'item',
  //         insertSelectItem(
  //           'item',
  //           () => ({
  //             paintCell$: source$<string>(),
  //           }),
  //           ({ update, insertions: { paintCell$ } }) => ({
  //             _paintCell: on$(paintCell$, (color) =>
  //               update((cell) => ({
  //                 ...cell,
  //                 color,
  //                 paintCount: cell.paintCount + 1,
  //               })),
  //             ),
  //           }),
  //         ),
  //         ({ insertions: { paintCell$ } }) => {
  //           on$(paintCell$, (event) => {
  //             expectTypeOf(event).toEqualTypeOf<{
  //               payload: string;
  //               path: [number];
  //               leaf: {
  //                 item: { index: number; paintCount: number; color: string };
  //                 index: number;
  //               };
  //             }>();
  //             // as it is the inner layer source$, path should be only the inner item index
  //             expect(event.path).toEqual([0]);
  //           });
  //           return {
  //             eventNested: paintCell$.value,
  //           };
  //         },
  //       ),
  //       ({ insertions: { paintCell$ } }) => {
  //         on$(paintCell$, (event) => {
  //           expectTypeOf(event).toEqualTypeOf<{
  //             payload: string;
  //             path: [number, number];
  //             leaf: {
  //               item: { index: number; paintCount: number; color: string };
  //               index: number;
  //             };
  //           }>();
  //           // as it is the inner layer source$, path should be only the inner item index
  //           expect(event.path).toEqual([0, 0]);
  //         });
  //         return {
  //           eventRoot: paintCell$.value,
  //         };
  //       },
  //     );

  //     TestBed.tick();
  //     expectTypeOf(matrix.selectItem(0)?.eventNested).toEqualTypeOf<
  //       | Signal<
  //           | {
  //               payload: string;
  //               path: [number];
  //               leaf: {
  //                 item: { index: number; paintCount: number; color: string };
  //                 index: number;
  //               };
  //             }
  //           | undefined
  //         >
  //       | undefined
  //     >();
  //     expectTypeOf(matrix.eventRoot).toEqualTypeOf<
  //       Signal<
  //         | {
  //             payload: string;
  //             path: [number, number];
  //             leaf: {
  //               item: { index: number; paintCount: number; color: string };
  //               index: number;
  //             };
  //           }
  //         | undefined
  //       >
  //     >();

  //     matrix.selectItem(0)?.selectItem(0)?.paintCell$('red');

  //     expect(matrix.selectItem(0)?.selectItem(0)?.color).toBe('red');
  //     expect(matrix.selectItem(0)?.selectItem(0)?.paintCount).toBe(1);
  //     expect(matrix.selectItem(0)?.eventNested?.()?.payload).toBe('red');
  //     expect(matrix.selectItem(0)?.eventNested?.()?.path).toEqual([0]);
  //     expect(matrix.selectItem(0)?.eventNested?.()?.leaf.index).toBe(0);
  //     expect(matrix.eventRoot()?.payload).toBe('red');
  //     expect(matrix.eventRoot()?.path).toEqual([0, 0]);
  //     expect(matrix.eventRoot()?.leaf.index).toBe(0);
  //     expect(matrix.eventRoot()?.leaf.item.color).toBe('red');

  //     vi.runAllTimersAsync();
  //     vi.clearAllMocks();
  //   });
  // });
});
