import {
  computed,
  inject,
} from './host/craft-compat';
import { craftService, onAppStart, type CraftServiceProvider } from './craft-service';
import { HOST_TAG_LIST } from './host-tag';
import { insertSelect } from './insert-select';
import { on$ } from './on$';
import { Source$, source$ } from './source$';
import { state } from './state';
import { craftPipe } from './craft-pipe';
import { provideFnWrapper } from './fn-wrapper';
import {
  injectStateMethodRuntimeContext,
  type StateMethodRuntimeContext,
} from './state-method-runtime-context';
import { craftUse } from './craft-use';
import { markNonYieldableInsertionMethod } from './yieldable';
import {
  flushCraftTest,
  setupCraftServiceTest,
} from './setup-craft-service-test';

const { InsertSelectSpecHost } = craftService(
  { name: 'InsertSelectSpecHost', providedIn: 'global' },
  () => ({}),
);

const runInInjectionContext = <T>(
  fn: () => T,
  extraProviders: CraftServiceProvider[] = [],
): T => {
  const { injector } =
    extraProviders.length === 0
      ? setupCraftServiceTest()
      : setupCraftServiceTest(InsertSelectSpecHost, {}, {
          providers: extraProviders,
        });
  lastInjector = injector;
  return injector.run(fn);
};
let lastInjector: ReturnType<typeof setupCraftServiceTest>['injector'];
const flushHost = () => flushCraftTest(lastInjector);


describe('insertSelect', () => {
  it('should expose the selected property context to method wrappers', async () => {
    let runtimeContext: StateMethodRuntimeContext | undefined;
    runInInjectionContext(
      () => {
        const counter = craftUse(
          state(
            'counter',
            { value: 0 },
            insertSelect('value', ({ update }) => ({
              increment: () => update((current) => current + 1),
            })),
          ),
        );

        counter.selectValue().increment();

        expect(runtimeContext?.get()).toBe(1);
        expect(runtimeContext?.originalSource).toContain('current + 1');
        runtimeContext?.update((current) => Number(current) + 9);
        expect(craftUse(counter()).value).toBe(10);
      },
      [
        provideFnWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (factory, thisArg, args) {
            runtimeContext = injectStateMethodRuntimeContext();
            return yield* factory.apply(thisArg, args);
          },
        ),
      ],
    );
  });
  it('should reproduce payload inference issue on nested matrix emitters', async () => {
    await runInInjectionContext(async () => {
      type PaintCellEvent = { color: string; cellIndex: number };
      type PixelCellState = {
        index: number;
        columnIndex: number;
        color: string;
        paintCount: number;
      };

      const matrix = craftUse(
        state(
          'matrix',
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
          insertSelect('grid', (gridContext) =>
            craftPipe(
              gridContext,
              insertSelect('row', (rowContext) =>
                craftPipe(
                  rowContext,
                  ({ state }) => ({
                    paintRowWithTargetCellColor$: source$<PaintCellEvent>(
                      'paintRowWithTargetCellColor$',
                    ),
                  }),
                  insertSelect('cell', ({ state }) => ({})),
                ),
              ),
              ({ state, set, update }) => ({
                paintColumnWithTargetCellColor$: source$<PaintCellEvent>(
                  'paintColumnWithTargetCellColor$',
                ),
              }),
            ),
          ),
        ),
      );

      // This assertion reproduces the current issue:
      // TypeScript currently infers a flattened event emitter shape here.
      expectTypeOf(
        matrix.selectGrid().paintColumnWithTargetCellColor$,
      ).toBeFunction();
      // matrix.selectGrid().test;

      // matrix.selectGrid().test.paintRowWithTargetCellColor$;
      //.                       ^?
    });
  });

  it('should work on object states', async () => {
    await runInInjectionContext(async () => {
      const board = craftUse(
        state(
          'board',
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
            paintCountStr: markNonYieldableInsertionMethod(
              () => `Painted ${craftUse(state()).paintCount} times`,
            ),
          })),
        ),
      );
      expectTypeOf(board.selectCell().paint).toBeFunction();
      expectTypeOf(board.selectCell().paintCountStr()).toEqualTypeOf<string>();

      craftUse(board.selectCell().paint());
      craftUse(board.selectCell().paint());
      expect(craftUse(board()).cell.color).toBe('black');
      expect(craftUse(board()).cell.paintCount).toBe(2);
      expect(board.selectCell().paintCountStr()).toBe('Painted 2 times');
    });
  });

  it('should tag object select insertions with the select name', async () => {
    await runInInjectionContext(async () => {
      const board = craftUse(
        state(
          'board',
          {
            cell: {
              index: 0,
              color: 'white',
            },
          },
          insertSelect('cell', () => ({
            hostTags: inject(HOST_TAG_LIST),
          })),
        ),
      );

      expect(board.selectCell()).toBeDefined();
    });
  });

  it('should work on array states', async () => {
    await runInInjectionContext(async () => {
      const cells = craftUse(
        state(
          'cells',
          [{ index: 0, color: 'white', paintCount: 0 }],
          insertSelect('cell', ({ state, update }) => ({
            paint: () =>
              update((cell) => ({
                ...cell,
                color: 'black',
                paintCount: cell.paintCount + 1,
              })),
            paintCountStr: markNonYieldableInsertionMethod(
              () => `Painted ${craftUse(state()).paintCount} times`,
            ),
          })),
        ),
      );
      expectTypeOf(cells.selectCell(0)?.paintCountStr()).toEqualTypeOf<
        string | undefined
      >();

      const paintInvocation = cells.selectCell(0)?.paint();
      if (paintInvocation) craftUse(paintInvocation);
      expect(cells.selectCell(0)?.color).toBe('black');
      expect(cells.selectCell(0)?.paintCount).toBe(1);
      expect(cells.selectCell(0)?.paintCountStr()).toBe('Painted 1 times');
    });
  });

  it('should tag array select insertions with the select name and selected identifier', async () => {
    await runInInjectionContext(async () => {
      const cells = craftUse(
        state(
          'cells',
          [
            { index: 0, color: 'white' },
            { index: 1, color: 'black' },
          ],
          insertSelect('cell', () => ({
            hostTags: inject(HOST_TAG_LIST),
          })),
        ),
      );

      expect(cells.selectCell(1)).toBeDefined();
    });
  });

  it('should support mixed nesting item + property via insertSelect', async () => {
    await runInInjectionContext(async () => {
      const matrix = craftUse(
        state(
          'matrix',
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
          insertSelect('row', (rowContext) =>
            craftPipe(
              rowContext,
              () => ({}),
              insertSelect('cell', (cellContext) =>
                craftPipe(
                  cellContext,
                  () => ({}),
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
            ),
          ),
        ),
      );

      flushHost();
      const paintStyleInvocation = matrix
        .selectRow(0)
        ?.selectCell()
        .selectStyle()
        .paintStyle();
      if (paintStyleInvocation) craftUse(paintStyleInvocation);
      expect(matrix.selectRow(0)?.selectCell().style.color).toBe('black');
      expect(matrix.selectRow(0)?.selectCell().style.paintCount).toBe(1);
    });
  });

  it('should allow first insertSelect insertion to access previous state insertions on object states', async () => {
    await runInInjectionContext(async () => {
      const board = craftUse(
        state(
          'board',
          {
            cell: {
              index: 0,
              color: 'white',
              paintCount: 0,
            },
          },
          (context) =>
            craftPipe(
              context,
              () => {
                const test = source$<number>('test');
                return {
                  test,
                  emitTest: (value: number) => test.emit(value),
                };
              },
              insertSelect('cell', ({ state, update, insertions }) => {
                expectTypeOf(insertions).toHaveProperty('emitTest');
                return {
                  paintFromTest: () =>
                    update((cell) => ({
                      ...cell,
                      paintCount:
                        cell.paintCount + (insertions.test.value() ?? 0),
                    })),
                  paintCountStr: computed(
                    () =>
                      `Painted ${craftUse(state()).paintCount} times with ${insertions.test.value() ?? 0}`,
                  ),
                };
              }),
            ),
        ),
      );

      expectTypeOf(board.selectCell().paintFromTest).toBeFunction();

      flushHost();
      expect(board.selectCell().paintCountStr()).toBe('Painted 0 times with 0');

      craftUse(board.emitTest(3));
      craftUse(board.selectCell().paintFromTest());

      expect(craftUse(board()).cell.paintCount).toBe(3);
      expect(board.selectCell().paintCountStr()).toBe('Painted 3 times with 3');
    });
  });

  it('should allow first insertSelect insertion to access previous state insertions on array states', async () => {
    await runInInjectionContext(async () => {
      const cells = craftUse(
        state('cells', [{ index: 0, paintCount: 0 }], (context) =>
          craftPipe(
            context,
            () => {
              const test = source$<number>('test');
              return {
                test,
                emitTest: (value: number) => test.emit(value),
              };
            },
            insertSelect('cell', ({ state, update, insertions }) => {
              expectTypeOf(insertions).toHaveProperty('emitTest');
              return {
                incrementFromTest: () =>
                  update((cell) => ({
                    ...cell,
                    paintCount:
                      cell.paintCount + (insertions.test.value() ?? 0),
                  })),
                paintCountStr: computed(
                  () =>
                    `Painted ${craftUse(state()).paintCount} times with ${insertions.test.value() ?? 0}`,
                ),
              };
            }),
          ),
        ),
      );

      flushHost();
      expect(cells.selectCell(0)?.paintCountStr()).toBe(
        'Painted 0 times with 0',
      );

      craftUse(cells.emitTest(2));
      const incrementInvocation = cells.selectCell(0)?.incrementFromTest();
      if (incrementInvocation) craftUse(incrementInvocation);

      expect(cells.selectCell(0)?.paintCount).toBe(2);
      expect(cells.selectCell(0)?.paintCountStr()).toBe(
        'Painted 2 times with 2',
      );
    });
  });

  it('should expose cross-layer source$ from nested insertions', async () => {
    await runInInjectionContext(async () => {
      const cells = craftUse(
        state(
          'cells',
          [{ index: 0, paintCount: 0, color: 'white' }],
          insertSelect('cell', (cellContext) =>
            craftPipe(
              cellContext,
              () => ({
                paintCell$: source$<string>('paintCell$'),
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
        ),
      );
      flushHost();
      cells.selectCell(0)?.paintCell$('red');
      expect(cells.selectCell(0)?.color).toBe('red');
      expect(cells.selectCell(0)?.paintCount).toBe(1);
    });
  });
  it('should expose cross-layer source$ from nested insertions', async () => {
    await runInInjectionContext(async () => {
      const cells = craftUse(
        state(
          'cells',
          { data: [{ index: 0, paintCount: 0, color: 'white' }] },
          insertSelect('data', (dataContext) =>
            craftPipe(
              dataContext,
              () => ({}),
              insertSelect('cell', (cellContext) =>
                craftPipe(
                  cellContext,
                  () => ({
                    paintCell$: source$<string>('paintCell$'),
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
            ),
          ),
        ),
      );
      flushHost();
      cells.selectData().selectCell(0)?.paintCell$('red');
      expect(cells.selectData().selectCell(0)?.color).toBe('red');
      expect(cells.selectData().selectCell(0)?.paintCount).toBe(1);
    });
  });
});

describe('insertSelect with generator insertions', () => {
  it('should resolve generator insertion on object states', async () => {
    const { ObjLogger } = craftService(
      { name: 'ObjLogger', providedIn: 'global' },
      () => {
        const calls: string[] = [];
        return {
          log: (msg: string) => calls.push(msg),
          calls,
        };
      },
    );

    await runInInjectionContext(async () => {
      const board = craftUse(
        state(
          'board',
          { cell: { color: 'white', paintCount: 0 } },
          insertSelect('cell', function* ({ update }) {
            const logger = yield* ObjLogger();
            return {
              paint: () => {
                logger.log('paint');
                return update((cell) => ({
                  ...cell,
                  color: 'black',
                  paintCount: cell.paintCount + 1,
                }));
              },
            };
          }),
        ),
      );

      flushHost();
      board.selectCell().paint();
      board.selectCell().paint();

      expect(craftUse(board()).cell.color).toBe('black');
      expect(craftUse(board()).cell.paintCount).toBe(2);
    });
  });

  it('should resolve generator insertion on array states', async () => {
    const { ArrLogger } = craftService(
      { name: 'ArrLogger', providedIn: 'global' },
      () => {
        const calls: string[] = [];
        return {
          log: (msg: string) => calls.push(msg),
          calls,
        };
      },
    );

    await runInInjectionContext(async () => {
      const cells = craftUse(
        state(
          'cells',
          [{ color: 'white', paintCount: 0 }],
          insertSelect('cell', function* ({ update }) {
            const logger = yield* ArrLogger();
            return {
              paint: (color: string) => {
                logger.log(`paint:${color}`);
                return update((cell) => ({
                  ...cell,
                  color,
                  paintCount: cell.paintCount + 1,
                }));
              },
            };
          }),
        ),
      );

      flushHost();
      cells.selectCell(0)?.paint('red');
      cells.selectCell(0)?.paint('blue');

      expect(craftUse(cells())[0].color).toBe('blue');
      expect(craftUse(cells())[0].paintCount).toBe(2);
    });
  });

  it('should throw on onAppStart inside generator insertion on object states', async () => {
    await runInInjectionContext(async () => {
      expect(() => {
        craftUse(
          state(
            'grid',
            { cell: { color: 'white' } },
            insertSelect('cell', function* () {
              yield* onAppStart(() => {});
              return {};
            }),
          ),
        );
      }).toThrow('insertSelect generators do not support onAppStart');
    });
  });

  it('should throw on onAppStart inside generator insertion on array states', async () => {
    await runInInjectionContext(async () => {
      expect(() => {
        craftUse(
          state(
            'grid',
            [{ color: 'white' }],
            insertSelect('cell', function* () {
              yield* onAppStart(() => {});
              return {};
            }),
          ),
        );
      }).toThrow('insertSelect generators do not support onAppStart');
    });
  });
});

describe('previous regressions on insertSelect typings', () => {
  it('counter with derived values from insertSelect', async () => {
    const counter = runInInjectionContext(() =>
      craftUse(
        state(
          'counter',
          { value: 0 },
          insertSelect('value', ({ state }) => ({
            isOdd: computed(() => craftUse(state()) % 2 === 1),
          })),
        ),
      ),
    );
    const isOdd = counter.selectValue().isOdd();
    expectTypeOf(isOdd).toEqualTypeOf<boolean>();
  });
});
