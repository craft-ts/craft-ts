import {
  DestroyRef,
  Injector,
  inject,
  isSignal,
  linkedSignal,
  runInInjectionContext,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InsertionsStateFactory } from './query.core';
import { ɵcreateHostTaggedInjector } from './craft-service';
import { Source$ as SourceDollarType, source$ } from './source$';
import { MergeObject } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { capitalize, isSource } from './util/util';
import {
  INSERTION_SNAPSHOT_REGISTRY,
  snapshotSelectProxy,
} from './take-app-snapshot';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import { ɵprovideStateMethodRuntimeContext } from './state-method-runtime-context';

type SelectedTarget<
  StateType,
  Name extends string,
> = StateType extends readonly (infer Item)[]
  ? Extract<Item, object>
  : StateType extends Record<string, unknown>
    ? Name extends keyof StateType
      ? StateType[Name]
      : never
    : never;

type MergeInsertions<
  Insertions extends readonly unknown[],
  Acc = {},
> = Insertions extends readonly [infer Head, ...infer Tail]
  ? MergeInsertions<Tail, Acc & Head>
  : Acc;

type Source$Method<SourceType> = [SourceType] extends [void]
  ? () => void
  : (value: SourceType) => void;

type ExposedInsertions<Insertions> = MergeObject<
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>,
  {
    [K in keyof FilterSource<Insertions> as FilterSource<Insertions>[K] extends SourceDollarType<any>
      ? K
      : never]: FilterSource<Insertions>[K] extends SourceDollarType<
      infer SourceType
    >
      ? Source$Method<SourceType>
      : never;
  }
>;

type SelectItemMethodName<Name extends string> = `select${Capitalize<Name>}`;
type SelectPropertyMethodName<Name extends string> =
  `select${Capitalize<Name>}`;

type SelectedItem<StateType> = StateType extends readonly (infer Item)[]
  ? Extract<Item, object>
  : never;

type ArraySelectedOutput<StateType, Insertions> = MergeObject<
  SelectedItem<StateType>,
  ExposedInsertions<Insertions>
>;

type ObjectSelectedOutput<StateType, Name extends string, Insertions> =
  StateType extends Record<string, unknown>
    ? Name extends keyof StateType & string
      ? [Extract<StateType[Name], object>] extends [never]
        ? ExposedInsertions<Insertions>
        : MergeObject<
            Extract<StateType[Name], object>,
            ExposedInsertions<Insertions>
          >
      : never
    : never;

type ArrayInsertSelectOutput<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
> = {
  [K in SelectItemMethodName<Name>]: (
    id: number,
  ) => ArraySelectedOutput<StateType, MergeInsertions<Insertions>> | undefined;
} & {
  items: () => Array<
    ArraySelectedOutput<StateType, MergeInsertions<Insertions>>
  >;
};

type ObjectInsertSelectOutput<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
> = {
  [K in SelectPropertyMethodName<Name>]: () => ObjectSelectedOutput<
    StateType,
    Name,
    MergeInsertions<Insertions>
  >;
};

type InsertSelectReturn<
  StateType,
  Name extends string,
  Insertions extends readonly unknown[],
  PreviousInsertionsOutputs,
> = InsertionsStateFactory<
  StateType,
  StateType extends readonly object[]
    ? ArrayInsertSelectOutput<StateType, Name, Insertions>
    : ObjectInsertSelectOutput<StateType, Name, Insertions>,
  PreviousInsertionsOutputs
>;

type PathSegment = string | number | symbol;
type TuplePath = readonly PathSegment[];
type FlatCrossLayerEvent<
  Payload,
  LeafItem,
  LeafIndex extends PathSegment,
  Path extends TuplePath,
> = {
  payload: Payload;
  path: Path;
  leaf: {
    item: LeafItem;
    index: LeafIndex;
  };
};

function isSource$(value: unknown): value is SourceDollarType<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'emit' in value &&
    typeof (value as SourceDollarType<unknown>).emit === 'function' &&
    'subscribe' in value &&
    typeof (value as SourceDollarType<unknown>).subscribe === 'function'
  );
}

function isFlatCrossLayerEvent(
  value: unknown,
): value is FlatCrossLayerEvent<unknown, unknown, PathSegment, TuplePath> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'payload' in value &&
    'path' in value &&
    'leaf' in value &&
    Array.isArray((value as { path?: unknown }).path) &&
    typeof (value as { leaf?: unknown }).leaf === 'object' &&
    (value as { leaf?: unknown }).leaf !== null &&
    'item' in ((value as { leaf: object }).leaf as object) &&
    'index' in ((value as { leaf: object }).leaf as object)
  );
}

const INSERT_SELECT_INVALID_YIELD_ERROR_MESSAGE =
  'insertSelect generators can only yield craftService dependencies or exposed dependency helpers.';
const INSERT_SELECT_APP_START_ERROR_MESSAGE =
  'insertSelect generators do not support onAppStart(...).';

function createInsertSelectItemRuntime(
  entityName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...itemInsertions: InsertionsStateFactory<any, any, any>[]
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
  ) => {
    const { state, update, insertions: previousInsertions } = context;
    const insertionSnapshotRegistry = inject(INSERTION_SNAPSHOT_REGISTRY, {
      optional: true,
    });
    const injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      `selectEntity:${entityName}`,
      [{ provide: INSERTION_SNAPSHOT_REGISTRY, useValue: null }],
    );
    const selectItemMethodName = `select${capitalize(entityName)}`;
    const selectedStateById = new Map<number, unknown>();
    const inheritedInsertions =
      (previousInsertions as Record<string, unknown> | undefined) ?? {};

    const select = (id: number) => {
      const currentState = state();
      if (!Array.isArray(currentState)) {
        return undefined;
      }
      return currentState[id];
    };

    const selectItem = (id: number) => {
      const cached = selectedStateById.get(id);
      if (cached) {
        return cached;
      }

      const selectedStateValue = select(id);
      if (selectedStateValue === undefined) {
        return undefined;
      }

      const selectedStateSignal = linkedSignal(() => select(id));
      const itemInjector = ɵcreateHostTaggedInjector(
        injector,
        `selectItem:${id}`,
      );

      const { rawInsertionsOutput, exposedInsertionsOutput } =
        itemInsertions.reduce(
          (acc, insertion) => {
            const wrappedInsertion = runInInjectionContext(itemInjector, () =>
              injectFnWrapper()(insertion),
            );
            const insertionContext = {
              state: selectedStateSignal,
              set: (newState: unknown) => {
                update((currentState: unknown) => {
                  if (!Array.isArray(currentState)) {
                    return currentState;
                  }

                  if (
                    id < 0 ||
                    id >= currentState.length ||
                    !Number.isInteger(id)
                  ) {
                    return currentState;
                  }

                  const nextState = [...currentState];
                  nextState[id] = newState;
                  return nextState;
                });
                return newState;
              },
              update: (updateFn: (currentState: unknown) => unknown) => {
                const currentSelectedState = select(id);
                if (currentSelectedState === undefined) {
                  return undefined;
                }

                const nextState = updateFn(currentSelectedState);
                update((currentState: unknown) => {
                  if (!Array.isArray(currentState)) {
                    return currentState;
                  }

                  if (
                    id < 0 ||
                    id >= currentState.length ||
                    !Number.isInteger(id)
                  ) {
                    return currentState;
                  }

                  const nextRootState = [...currentState];
                  nextRootState[id] = nextState;
                  return nextRootState;
                });

                return nextState;
              },
              patch: (patchFn: (currentState: unknown) => Partial<unknown>) => {
                const currentSelectedState = select(id);
                if (currentSelectedState === undefined) {
                  return undefined;
                }

                const nextState = {
                  ...(currentSelectedState as object),
                  ...patchFn(currentSelectedState),
                };
                update((currentState: unknown) => {
                  if (!Array.isArray(currentState)) {
                    return currentState;
                  }

                  if (
                    id < 0 ||
                    id >= currentState.length ||
                    !Number.isInteger(id)
                  ) {
                    return currentState;
                  }

                  const nextRootState = [...currentState];
                  nextRootState[id] = nextState;
                  return nextRootState;
                });

                return nextState;
              },
              insertions: {
                ...inheritedInsertions,
                ...acc.rawInsertionsOutput,
              } as never,
            };
            const insertionCallResult = wrappedInsertion(insertionContext);
            const nextRawInsertions = (
              isGenerator(insertionCallResult)
                ? runInInjectionContext(
                    itemInjector,
                    () =>
                      runCraftGenerator({
                        iterator: insertionCallResult,
                        injector: itemInjector,
                        hostScope: 'function',
                        invalidYieldErrorMessage:
                          INSERT_SELECT_INVALID_YIELD_ERROR_MESSAGE,
                        multipleAppStartErrorMessage:
                          INSERT_SELECT_APP_START_ERROR_MESSAGE,
                        onAppStartNotSupportedErrorMessage:
                          INSERT_SELECT_APP_START_ERROR_MESSAGE,
                      }).value,
                  )
                : insertionCallResult
            ) as Record<string, unknown>;

            const nextExposedInsertions = Object.entries(
              nextRawInsertions,
            ).reduce(
              (exposedAcc, [key, value]) => {
                if (isSource(value)) {
                  return exposedAcc;
                }

                if (isSource$(value)) {
                  const localSource = value;
                  exposedAcc[key] = (payload: unknown) => {
                    localSource.emit(payload as never);
                  };
                  return exposedAcc;
                }

                if (typeof value === 'function' && !isSignal(value)) {
                  const methodInjector = ɵcreateHostTaggedInjector(
                    itemInjector,
                    `method:${key}`,
                    [
                      ɵprovideStateMethodRuntimeContext(
                        insertionContext,
                        value as (...args: never[]) => unknown,
                      ),
                    ],
                  );
                  const wrappedFn = runInInjectionContext(methodInjector, () =>
                    injectFnWrapper()(value as (...args: unknown[]) => unknown),
                  );
                  exposedAcc[key] = (...args: unknown[]) =>
                    runInInjectionContext(methodInjector, () => {
                      const result = (
                        wrappedFn as (...a: unknown[]) => unknown
                      )(...args);
                      if (isGenerator(result)) {
                        return runCraftGenerator({
                          iterator: result,
                          injector: methodInjector,
                          hostScope: 'function',
                          invalidYieldErrorMessage:
                            INSERT_SELECT_INVALID_YIELD_ERROR_MESSAGE,
                          multipleAppStartErrorMessage:
                            INSERT_SELECT_APP_START_ERROR_MESSAGE,
                          onAppStartNotSupportedErrorMessage:
                            INSERT_SELECT_APP_START_ERROR_MESSAGE,
                        }).value;
                      }
                      return result;
                    });
                } else {
                  exposedAcc[key] = value;
                }
                return exposedAcc;
              },
              {} as Record<string, unknown>,
            );

            return {
              rawInsertionsOutput: {
                ...acc.rawInsertionsOutput,
                ...nextRawInsertions,
              },
              exposedInsertionsOutput: {
                ...acc.exposedInsertionsOutput,
                ...nextExposedInsertions,
              },
            };
          },
          {
            rawInsertionsOutput: {} as Record<string, unknown>,
            exposedInsertionsOutput: {} as Record<string, unknown>,
          },
        );

      const stateProxy = new Proxy(exposedInsertionsOutput, {
        get(target, property, receiver) {
          if (Reflect.has(target, property)) {
            return Reflect.get(target, property, receiver);
          }

          const stateValue = select(id);
          if (!stateValue || typeof stateValue !== 'object') {
            return undefined;
          }

          return Reflect.get(stateValue as object, property);
        },
      });

      selectedStateById.set(id, stateProxy);
      return stateProxy;
    };

    const items = () => {
      const currentState = state();
      if (!Array.isArray(currentState)) {
        return [];
      }

      return currentState.reduce<unknown[]>((acc, _unused, index) => {
        const selectedItem = selectItem(index);
        if (selectedItem !== undefined) {
          acc.push(selectedItem);
        }
        return acc;
      }, []);
    };

    const currentState = state();
    if (Array.isArray(currentState) && currentState.length > 0) {
      selectItem(0);
    }

    if (insertionSnapshotRegistry) {
      const destroyRef = inject(DestroyRef);
      insertionSnapshotRegistry.trigger$
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => {
          const rawState = state();
          if (!Array.isArray(rawState)) return;
          const snapshot = rawState.map((rawItem, i) => {
            const proxy = selectItem(i);
            return snapshotSelectProxy(proxy, rawItem);
          });
          insertionSnapshotRegistry.allInsertionSnapshot$.next({
            key: selectItemMethodName,
            value: snapshot,
          });
        });
    }

    return {
      [selectItemMethodName]: selectItem,
      items,
    };
  };
}

function createInsertSelectPropertyRuntime(
  propertyKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...propertyInsertions: InsertionsStateFactory<any, any, any>[]
) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
  ) => {
    const { state, update, insertions: previousInsertions } = context;
    const insertionSnapshotRegistry = inject(INSERTION_SNAPSHOT_REGISTRY, {
      optional: true,
    });
    const injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      `selectProperty:${propertyKey}`,
      [{ provide: INSERTION_SNAPSHOT_REGISTRY, useValue: null }],
    );
    let selectedPropertyProxy: unknown;
    const crossLayerSourcesByKey = new Map<string, SourceDollarType<unknown>>();
    const selectPropertyMethodName = `select${capitalize(propertyKey)}`;
    const inheritedInsertions =
      (previousInsertions as Record<string, unknown> | undefined) ?? {};

    const getOrCreateCrossLayerSource = (key: string) => {
      const sourceValue = crossLayerSourcesByKey.get(key);
      if (sourceValue) {
        return sourceValue;
      }
      const newSource = source$<unknown>();
      crossLayerSourcesByKey.set(key, newSource);
      return newSource;
    };

    const selectProperty = () => {
      const currentState = state();
      if (!currentState || typeof currentState !== 'object') {
        return undefined;
      }
      return (currentState as Record<string, unknown>)[propertyKey];
    };

    const setProperty = (newProperty: unknown) => {
      update((currentState: unknown) => {
        if (!currentState || typeof currentState !== 'object') {
          return currentState;
        }

        return {
          ...(currentState as Record<string, unknown>),
          [propertyKey]: newProperty,
        };
      });
      return newProperty;
    };

    const updateProperty = (
      updateFn: (currentProperty: unknown) => unknown,
    ) => {
      const nextProperty = updateFn(selectProperty());
      setProperty(nextProperty);
      return nextProperty;
    };

    const selectPropertyItem = () => {
      if (selectedPropertyProxy) {
        return selectedPropertyProxy;
      }

      const selectedPropertySignal = linkedSignal(() => selectProperty());

      const { rawInsertionsOutput, exposedInsertionsOutput } =
        propertyInsertions.reduce(
          (acc, insertion) => {
            const wrappedInsertion = runInInjectionContext(injector, () =>
              injectFnWrapper()(insertion),
            );
            const insertionContext = {
              state: selectedPropertySignal,
              set: setProperty,
              update: updateProperty,
              patch: (patchFn: (currentState: unknown) => Partial<unknown>) => {
                return updateProperty((current) => ({
                  ...(current as object),
                  ...patchFn(current),
                }));
              },
              insertions: {
                ...inheritedInsertions,
                ...acc.rawInsertionsOutput,
              } as never,
            };
            const insertionCallResult = wrappedInsertion(insertionContext);
            const nextRawInsertions = (
              isGenerator(insertionCallResult)
                ? runInInjectionContext(
                    injector,
                    () =>
                      runCraftGenerator({
                        iterator: insertionCallResult,
                        injector,
                        hostScope: 'function',
                        invalidYieldErrorMessage:
                          INSERT_SELECT_INVALID_YIELD_ERROR_MESSAGE,
                        multipleAppStartErrorMessage:
                          INSERT_SELECT_APP_START_ERROR_MESSAGE,
                        onAppStartNotSupportedErrorMessage:
                          INSERT_SELECT_APP_START_ERROR_MESSAGE,
                      }).value,
                  )
                : insertionCallResult
            ) as Record<string, unknown>;

            const nextExposedInsertions = Object.entries(
              nextRawInsertions,
            ).reduce(
              (exposedAcc, [key, value]) => {
                if (isSource(value)) {
                  return exposedAcc;
                }

                if (isSource$(value)) {
                  const localSource = value;
                  const crossLayerSource = getOrCreateCrossLayerSource(key);

                  localSource.subscribe((payload) => {
                    const propertyAtEmit = selectProperty();
                    if (isFlatCrossLayerEvent(payload)) {
                      crossLayerSource.emit({
                        payload: payload.payload,
                        path: [propertyKey, ...payload.path],
                        leaf: payload.leaf,
                      });
                      return;
                    }

                    crossLayerSource.emit({
                      payload,
                      path: [propertyKey],
                      leaf: {
                        item: propertyAtEmit,
                        index: propertyKey,
                      },
                    });
                  });

                  exposedAcc[key] = (payload: unknown) => {
                    localSource.emit(payload as never);
                  };
                  return exposedAcc;
                }

                if (typeof value === 'function' && !isSignal(value)) {
                  const methodInjector = ɵcreateHostTaggedInjector(
                    injector,
                    `method:${key}`,
                    [
                      ɵprovideStateMethodRuntimeContext(
                        insertionContext,
                        value as (...args: never[]) => unknown,
                      ),
                    ],
                  );
                  const wrappedFn = runInInjectionContext(methodInjector, () =>
                    injectFnWrapper()(value as (...args: unknown[]) => unknown),
                  );
                  exposedAcc[key] = (...args: unknown[]) =>
                    runInInjectionContext(methodInjector, () => {
                      const result = (
                        wrappedFn as (...a: unknown[]) => unknown
                      )(...args);
                      if (isGenerator(result)) {
                        return runCraftGenerator({
                          iterator: result,
                          injector: methodInjector,
                          hostScope: 'function',
                          invalidYieldErrorMessage:
                            INSERT_SELECT_INVALID_YIELD_ERROR_MESSAGE,
                          multipleAppStartErrorMessage:
                            INSERT_SELECT_APP_START_ERROR_MESSAGE,
                          onAppStartNotSupportedErrorMessage:
                            INSERT_SELECT_APP_START_ERROR_MESSAGE,
                        }).value;
                      }
                      return result;
                    });
                } else {
                  exposedAcc[key] = value;
                }
                return exposedAcc;
              },
              {} as Record<string, unknown>,
            );

            return {
              rawInsertionsOutput: {
                ...acc.rawInsertionsOutput,
                ...nextRawInsertions,
              },
              exposedInsertionsOutput: {
                ...acc.exposedInsertionsOutput,
                ...nextExposedInsertions,
              },
            };
          },
          {
            rawInsertionsOutput: {} as Record<string, unknown>,
            exposedInsertionsOutput: {} as Record<string, unknown>,
          },
        );

      selectedPropertyProxy = new Proxy(exposedInsertionsOutput, {
        get(target, property, receiver) {
          if (Reflect.has(target, property)) {
            return Reflect.get(target, property, receiver);
          }

          const currentProperty = selectProperty();
          if (!currentProperty || typeof currentProperty !== 'object') {
            return undefined;
          }

          return Reflect.get(currentProperty as object, property);
        },
      });

      return selectedPropertyProxy;
    };

    // Ensure cross-layer sources are available for subsequent state insertions.
    selectPropertyItem();

    if (insertionSnapshotRegistry) {
      const destroyRef = inject(DestroyRef);
      insertionSnapshotRegistry.trigger$
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => {
          const proxy = selectPropertyItem();
          const rawPropertyValue = state() as Record<string, unknown>;
          const rawPropValue =
            rawPropertyValue &&
            typeof rawPropertyValue === 'object' &&
            propertyKey in rawPropertyValue
              ? rawPropertyValue[propertyKey]
              : undefined;
          insertionSnapshotRegistry.allInsertionSnapshot$.next({
            key: selectPropertyMethodName,
            value: snapshotSelectProxy(proxy, rawPropValue),
          });
        });
    }

    return {
      [selectPropertyMethodName]: selectPropertyItem,
      ...Object.fromEntries(crossLayerSourcesByKey.entries()),
    };
  };
}

type IsArray<T> = T extends any[] ? true : false;

/**
 * Unified selector insertion for nested object properties and array items.
 *
 * `insertSelect` lets you compose nested insertions with the same API regardless
 * of whether the current state is an object or an array.
 *
 * You interact with the selected sub-state through generated methods like:
 * - `selectCell()` for object properties
 * - `selectCell(index)` for array items
 * The returned selection exposes both the original state fields and the
 * insertion methods/computed values.
 *
 * @example
 * ```ts
 * const board = state(
 *   {
 *     cell: { color: 'white', paintCount: 0 },
 *   },
 *   insertSelect('cell', ({ update }) => ({
 *     paintBlack: () =>
 *       update((cell) => ({
 *         ...cell,
 *         color: 'black',
 *         paintCount: cell.paintCount + 1,
 *       })),
 *   })),
 * );
 *
 * board.selectCell().paintBlack();
 * console.log(board.selectCell().color); // 'black'
 * ```
 *
 * @example
 * ```ts
 * const cells = state(
 *   [{ color: 'white', paintCount: 0 }],
 *   insertSelect('cell', ({ update }) => ({
 *     paint: () =>
 *       update((cell) => ({
 *         ...cell,
 *         color: 'black',
 *         paintCount: cell.paintCount + 1,
 *       })),
 *   })),
 * );
 *
 * cells.selectCell(0)?.paint();
 * console.log(cells.selectCell(0)?.paintCount); // 1
 * ```
 *
 * `insertSelect` accepts a SINGLE nested insertion. To attach several (or to
 * chain another `insertSelect` alongside other members), re-pass the selected
 * context through `craftPipe` — contextual typing is preserved at every
 * nesting level:
 *
 * @example
 * ```ts
 * insertSelect('grid', (gridContext) =>
 *   craftPipe(
 *     gridContext,
 *     ({ state, update }) => ({
 *       addRow: () => update((grid) => [...grid, createNextRow(grid)]),
 *       rowIndexes: computed(() => state().map((_row, index) => index)),
 *     }),
 *     insertSelect('row', ({ update }) => ({
 *       // ...
 *     })),
 *   ),
 * );
 * ```
 *
 * `insertSelect` itself also composes as a member of an `craftPipe` at the
 * primitive level:
 *
 * @example
 * ```ts
 * state(initialCells, (context) =>
 *   craftPipe(
 *     context,
 *     insertLocalStoragePersister({ storeName: 'app', key: 'cells' }),
 *     insertSelect('cell', ({ update }) => ({
 *       paint: () => update((cell) => ({ ...cell, painted: true })),
 *     })),
 *   ),
 * );
 * ```
 */
export function insertSelect<
  StateType,
  const Name extends AutoCompleteName & string,
  Insertions1 = {},
  PreviousInsertionsOutputs = {},
  Insertions1Yielded = never,
  AutoCompleteName = NoInfer<StateType> extends readonly object[]
    ? string
    : keyof NoInfer<StateType>,
>(
  name: Name,
  insertion1: InsertionsStateFactory<
    SelectedTarget<StateType, Name>,
    Insertions1,
    PreviousInsertionsOutputs,
    Insertions1Yielded
  >,
): InsertSelectReturn<StateType, Name, [Insertions1], PreviousInsertionsOutputs>;

export function insertSelect(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: InsertionsStateFactory<any, any, any>[]
): any {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
  ) => {
    const currentState = context.state();

    if (Array.isArray(currentState)) {
      return createInsertSelectItemRuntime(name, ...insertions)(context);
    }
    return createInsertSelectPropertyRuntime(name, ...insertions)(context);
  };
}
