import { linkedSignal } from '@angular/core';
import { InsertionsStateFactory } from './query.core';
import { MergeObject } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { wrapExceptionAwareMethods } from './business-exception';
import { Source$ as SourceDollarType, source$ } from './source$';
import { isSource } from './util/util';

type ParallelStateId = string | number | symbol;
type SelectableState = readonly object[] | Record<ParallelStateId, object>;
type SelectableStateItem<
  StateType,
  GroupIdentifier extends ParallelStateId,
> = StateType extends readonly (infer Item)[]
  ? Item
  : StateType extends Record<GroupIdentifier, infer Item>
    ? Item
    : never;

export type ParallelStateItemOutput<StateType, Insertions> = MergeObject<
  StateType,
  MergeObject<
    IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>,
    {
      [K in keyof FilterSource<Insertions> as FilterSource<Insertions>[K] extends SourceDollarType<
        any
      >
        ? K
        : never]: FilterSource<Insertions>[K] extends SourceDollarType<
        infer SourceType
      >
        ? Source$Method<SourceType>
        : never;
    }
  >
>;

type Source$Method<SourceType> = [SourceType] extends [void]
  ? () => void
  : (value: SourceType) => void;

type SourceKeys<Insertions> = {
  [K in keyof Insertions]-?: Insertions[K] extends SourceDollarType<any>
    ? K
    : never;
}[keyof Insertions];

type FlatCrossLayerEvent<
  Payload,
  LeafItem,
  PathId extends ParallelStateId,
  LeafId extends ParallelStateId = PathId,
> = {
  payload: Payload;
  path: PathId[];
  leaf: {
    item: LeafItem;
    index: LeafId;
  };
};

type FlatCrossLayerEventFromSource<
  SourceType,
  SelectedStateType extends object,
  GroupIdentifier extends ParallelStateId,
> = SourceType extends FlatCrossLayerEvent<
  infer SourcePayload,
  infer SourceLeafItem,
  infer SourcePathId,
  infer SourceLeafId
>
  ? FlatCrossLayerEvent<
      SourcePayload,
      SourceLeafItem,
      GroupIdentifier | SourcePathId,
      SourceLeafId
    >
  : FlatCrossLayerEvent<SourceType, SelectedStateType, GroupIdentifier>;

type CrossLayerSourceOutput<
  Insertions,
  SelectedStateType extends object,
  GroupIdentifier extends ParallelStateId,
> = {
  [K in SourceKeys<Insertions>]: Insertions[K] extends SourceDollarType<
    infer SourceType
  >
    ? SourceDollarType<
        FlatCrossLayerEventFromSource<
          SourceType,
          SelectedStateType,
          GroupIdentifier
        >
      >
    : never;
};

type InsertSelectItemOutput<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId,
  ItemOutput,
> = {
  select: (
    id: GroupIdentifier,
  ) => Extract<SelectableStateItem<StateType, GroupIdentifier>, object> | undefined;
  selectItem: (id: GroupIdentifier) => ItemOutput | undefined;
  items: () => Array<ItemOutput>;
};

type SelectedItem<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId,
> = Extract<SelectableStateItem<StateType, GroupIdentifier>, object>;

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
): value is FlatCrossLayerEvent<unknown, unknown, ParallelStateId> {
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

/**
 * Adds item-level selection helpers for array/record states:
 * - `select(id)` to read the raw item
 * - `selectItem(id)` to read an item proxy with insertion methods/computed values
 * - `items()` to get all proxied items
 *
 * @example
 * ```ts
 * const cells = state(
 *   [{ color: 'white', paintCount: 0 }],
 *   insertSelectItem(({ update }) => ({
 *     paint: () =>
 *       update((cell) => ({
 *         ...cell,
 *         color: 'black',
 *         paintCount: cell.paintCount + 1,
 *       })),
 *   })),
 * );
 *
 * cells.selectItem(0)?.paint();
 * ```
 */
export function insertSelectItem<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId = StateType extends readonly unknown[]
    ? number
    : keyof StateType & ParallelStateId,
  Insertions1 = {},
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
): InsertionsStateFactory<
  StateType,
  MergeObject<
    InsertSelectItemOutput<
      StateType,
      GroupIdentifier,
      ParallelStateItemOutput<SelectedItem<StateType, GroupIdentifier>, Insertions1>
    >,
    CrossLayerSourceOutput<
      Insertions1,
      SelectedItem<StateType, GroupIdentifier>,
      GroupIdentifier
    >
  >,
  PreviousInsertionsOutputs
>;
export function insertSelectItem<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId = StateType extends readonly unknown[]
    ? number
    : keyof StateType & ParallelStateId,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
  insertion3: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions3,
    PreviousInsertionsOutputs & Insertions1 & Insertions2
  >,
): InsertionsStateFactory<
  StateType,
  MergeObject<
    InsertSelectItemOutput<
      StateType,
      GroupIdentifier,
      ParallelStateItemOutput<
        SelectedItem<StateType, GroupIdentifier>,
        Insertions1 & Insertions2 & Insertions3
      >
    >,
    MergeObject<
      CrossLayerSourceOutput<
        Insertions1,
        SelectedItem<StateType, GroupIdentifier>,
        GroupIdentifier
      >,
      MergeObject<
        CrossLayerSourceOutput<
          Insertions2,
          SelectedItem<StateType, GroupIdentifier>,
          GroupIdentifier
        >,
        CrossLayerSourceOutput<
          Insertions3,
          SelectedItem<StateType, GroupIdentifier>,
          GroupIdentifier
        >
      >
    >
  >,
  PreviousInsertionsOutputs
>;
export function insertSelectItem<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId = StateType extends readonly unknown[]
    ? number
    : keyof StateType & ParallelStateId,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  Insertions4 = {},
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
  insertion3: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions3,
    PreviousInsertionsOutputs & Insertions1 & Insertions2
  >,
  insertion4: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions4,
    PreviousInsertionsOutputs & Insertions1 & Insertions2 & Insertions3
  >,
): InsertionsStateFactory<
  StateType,
  MergeObject<
    InsertSelectItemOutput<
      StateType,
      GroupIdentifier,
      ParallelStateItemOutput<
        SelectedItem<StateType, GroupIdentifier>,
        Insertions1 & Insertions2 & Insertions3 & Insertions4
      >
    >,
    MergeObject<
      CrossLayerSourceOutput<
        Insertions1,
        SelectedItem<StateType, GroupIdentifier>,
        GroupIdentifier
      >,
      MergeObject<
        CrossLayerSourceOutput<
          Insertions2,
          SelectedItem<StateType, GroupIdentifier>,
          GroupIdentifier
        >,
        MergeObject<
          CrossLayerSourceOutput<
            Insertions3,
            SelectedItem<StateType, GroupIdentifier>,
            GroupIdentifier
          >,
          CrossLayerSourceOutput<
            Insertions4,
            SelectedItem<StateType, GroupIdentifier>,
            GroupIdentifier
          >
        >
      >
    >
  >,
  PreviousInsertionsOutputs
>;
export function insertSelectItem<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId = StateType extends readonly unknown[]
    ? number
    : keyof StateType & ParallelStateId,
  Insertions1 = {},
  Insertions2 = {},
  Insertions3 = {},
  Insertions4 = {},
  Insertions5 = {},
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
  insertion3: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions3,
    PreviousInsertionsOutputs & Insertions1 & Insertions2
  >,
  insertion4: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions4,
    PreviousInsertionsOutputs & Insertions1 & Insertions2 & Insertions3
  >,
  insertion5: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions5,
    PreviousInsertionsOutputs &
      Insertions1 &
      Insertions2 &
      Insertions3 &
      Insertions4
  >,
): InsertionsStateFactory<
  StateType,
  MergeObject<
    InsertSelectItemOutput<
      StateType,
      GroupIdentifier,
      ParallelStateItemOutput<
        SelectedItem<StateType, GroupIdentifier>,
        Insertions1 & Insertions2 & Insertions3 & Insertions4 & Insertions5
      >
    >,
    MergeObject<
      CrossLayerSourceOutput<
        Insertions1,
        SelectedItem<StateType, GroupIdentifier>,
        GroupIdentifier
      >,
      MergeObject<
        CrossLayerSourceOutput<
          Insertions2,
          SelectedItem<StateType, GroupIdentifier>,
          GroupIdentifier
        >,
        MergeObject<
          CrossLayerSourceOutput<
            Insertions3,
            SelectedItem<StateType, GroupIdentifier>,
            GroupIdentifier
          >,
          MergeObject<
            CrossLayerSourceOutput<
              Insertions4,
              SelectedItem<StateType, GroupIdentifier>,
              GroupIdentifier
            >,
            CrossLayerSourceOutput<
              Insertions5,
              SelectedItem<StateType, GroupIdentifier>,
              GroupIdentifier
            >
          >
        >
      >
    >
  >,
  PreviousInsertionsOutputs
>;
export function insertSelectItem<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId = StateType extends readonly unknown[]
    ? number
    : keyof StateType & ParallelStateId,
  Insertions1 = {},
  Insertions2 = {},
  PreviousInsertionsOutputs = {},
>(
  insertion1: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
): InsertionsStateFactory<
  StateType,
  MergeObject<
    InsertSelectItemOutput<
      StateType,
      GroupIdentifier,
      ParallelStateItemOutput<
        SelectedItem<StateType, GroupIdentifier>,
        Insertions1 & Insertions2
      >
    >,
    MergeObject<
      CrossLayerSourceOutput<
        Insertions1,
        SelectedItem<StateType, GroupIdentifier>,
        GroupIdentifier
      >,
      CrossLayerSourceOutput<
        Insertions2,
        SelectedItem<StateType, GroupIdentifier>,
        GroupIdentifier
      >
    >
  >,
  PreviousInsertionsOutputs
>;
export function insertSelectItem<
  StateType extends SelectableState,
  GroupIdentifier extends ParallelStateId = StateType extends readonly unknown[]
    ? number
    : keyof StateType & ParallelStateId,
  PreviousInsertionsOutputs = {},
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...itemInsertions: InsertionsStateFactory<
    Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
    any,
    any
  >[]
): InsertionsStateFactory<
  StateType,
  {
    select: (id: GroupIdentifier) => unknown;
    selectItem: (id: GroupIdentifier) => unknown;
    items: () => unknown[];
  } & Record<string, unknown>,
  PreviousInsertionsOutputs
> {
  return ({
    state,
    update,
    insertions: previousInsertions,
    exceptions,
    raiseException,
    clearException,
    clearExceptionScope,
    clearExceptions,
  }) => {
    type SelectedStateType = Extract<
      SelectableStateItem<StateType, GroupIdentifier>,
      object
    >;
    const selectedStateById = new Map<GroupIdentifier, unknown>();
    const crossLayerSourcesByKey = new Map<string, SourceDollarType<unknown>>();
    const inheritedInsertions =
      (previousInsertions as unknown as Record<string, unknown>) ?? {};
    const getOrCreateCrossLayerSource = (key: string) => {
      const sourceValue = crossLayerSourcesByKey.get(key);
      if (sourceValue) {
        return sourceValue;
      }
      const newSource = source$<unknown>();
      crossLayerSourcesByKey.set(key, newSource);
      return newSource;
    };
    const select = (id: GroupIdentifier): SelectedStateType | undefined => {
      const currentState = state();
      if (Array.isArray(currentState)) {
        return currentState[id as number] as SelectedStateType | undefined;
      }

      return (currentState as Record<ParallelStateId, unknown>)[id] as
        | SelectedStateType
        | undefined;
    };

    const selectItem = (id: GroupIdentifier) => {
      const selectedState = selectedStateById.get(id);
      if (selectedState) {
        return selectedState;
      }

      const selectedStateValue = select(id);
      if (selectedStateValue === undefined) {
        return undefined;
      }

      const selectedStateSignal = linkedSignal(
        () => select(id) as SelectedStateType,
      );

      const { rawInsertionsOutput, exposedInsertionsOutput } = itemInsertions
        .reduce(
          (acc, insertion) => {
            const nextRawInsertions = wrapExceptionAwareMethods(
              insertion({
                state: selectedStateSignal,
                set: (newState: SelectedStateType) => {
                  update((currentState) => {
                    if (Array.isArray(currentState)) {
                      const currentIndex = id as number;
                      if (
                        currentIndex < 0 ||
                        currentIndex >= currentState.length ||
                        !Number.isInteger(currentIndex)
                      ) {
                        return currentState;
                      }
                      const nextState = [...currentState];
                      nextState[currentIndex] = newState;
                      return nextState as unknown as StateType;
                    }

                    return {
                      ...(currentState as Record<ParallelStateId, unknown>),
                      [id]: newState,
                    } as StateType;
                  });
                  return newState;
                },
                update: (
                  updateFn: (currentState: SelectedStateType) => SelectedStateType,
                ) => {
                  const currentSelectedState = select(id);
                  if (currentSelectedState === undefined) {
                    return currentSelectedState as unknown as SelectedStateType;
                  }

                  const nextState = updateFn(
                    currentSelectedState as SelectedStateType,
                  );
                  update((currentState) => {
                    if (Array.isArray(currentState)) {
                      const currentIndex = id as number;
                      if (
                        currentIndex < 0 ||
                        currentIndex >= currentState.length ||
                        !Number.isInteger(currentIndex)
                      ) {
                        return currentState;
                      }
                      const nextRootState = [...currentState];
                      nextRootState[currentIndex] = nextState;
                      return nextRootState as unknown as StateType;
                    }

                    return {
                      ...(currentState as Record<ParallelStateId, unknown>),
                      [id]: nextState,
                    } as StateType;
                  });

                  return nextState;
                },
                insertions: {
                  ...inheritedInsertions,
                  ...acc.rawInsertionsOutput,
                } as never,
                exceptions,
                raiseException,
                clearException,
                clearExceptionScope,
                clearExceptions,
              }) as Record<string, unknown>,
              raiseException,
            );

            const nextExposedInsertions = Object.entries(nextRawInsertions).reduce(
              (exposedAcc, [key, value]) => {
                if (isSource(value)) {
                  return exposedAcc;
                }

                if (isSource$(value)) {
                  const localSource = value;
                  const crossLayerSource = getOrCreateCrossLayerSource(key);
                  localSource.subscribe((payload) => {
                    const itemAtEmit = select(id);
                    if (itemAtEmit !== undefined) {
                      if (isFlatCrossLayerEvent(payload)) {
                        crossLayerSource.emit({
                          payload: payload.payload,
                          path: [id, ...(payload.path as GroupIdentifier[])],
                          leaf: payload.leaf,
                        });
                        return;
                      }

                      crossLayerSource.emit({
                        payload,
                        path: [id],
                        leaf: {
                          item: itemAtEmit,
                          index: id,
                        },
                      });
                    }
                  });
                  exposedAcc[key] = (payload: unknown) => {
                    localSource.emit(payload as never);
                  };
                  return exposedAcc;
                }

                exposedAcc[key] = value;
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
      if (Array.isArray(currentState)) {
        return currentState.reduce<unknown[]>((acc, _unused, index) => {
          const selectedItem = selectItem(index as GroupIdentifier);
          if (selectedItem !== undefined) {
            acc.push(selectedItem);
          }
          return acc;
        }, []);
      }

      return Reflect.ownKeys(currentState).reduce<unknown[]>((acc, key) => {
        if (typeof key !== 'string' && typeof key !== 'symbol') {
          return acc;
        }
        const selectedItem = selectItem(key as GroupIdentifier);
        if (selectedItem !== undefined) {
          acc.push(selectedItem);
        }
        return acc;
      }, []);
    };

    const currentState = state();
    if (Array.isArray(currentState)) {
      if (currentState.length > 0) {
        selectItem(0 as GroupIdentifier);
      }
    } else {
      const firstKey = Reflect.ownKeys(currentState).find(
        (key) => typeof key === 'string' || typeof key === 'symbol',
      );
      if (firstKey !== undefined) {
        selectItem(firstKey as GroupIdentifier);
      }
    }

    return {
      select,
      selectItem,
      items,
      ...Object.fromEntries(crossLayerSourcesByKey.entries()),
    };
  };
}
