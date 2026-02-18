import { linkedSignal } from '@angular/core';
import { InsertionsStateFactory } from './query.core';
import { MergeObject } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { wrapExceptionAwareMethods } from './business-exception';

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
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>
>;

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
  {
    select: (
      id: GroupIdentifier,
    ) =>
      | Extract<SelectableStateItem<StateType, GroupIdentifier>, object>
      | undefined;
    selectItem: (
      id: GroupIdentifier,
    ) =>
      | ParallelStateItemOutput<
          Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
          Insertions1
        >
      | undefined;
    items: () => Array<
      ParallelStateItemOutput<
        Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
        Insertions1
      >
    >;
  },
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
  {
    select: (
      id: GroupIdentifier,
    ) =>
      | Extract<SelectableStateItem<StateType, GroupIdentifier>, object>
      | undefined;
    selectItem: (
      id: GroupIdentifier,
    ) =>
      | ParallelStateItemOutput<
          Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
          Insertions1 & Insertions2
        >
      | undefined;
    items: () => Array<
      ParallelStateItemOutput<
        Extract<SelectableStateItem<StateType, GroupIdentifier>, object>,
        Insertions1 & Insertions2
      >
    >;
  },
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
  },
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
    const inheritedInsertions =
      (previousInsertions as unknown as Record<string, unknown>) ?? {};
    const select = (id: GroupIdentifier) => {
      const currentState = state();
      if (Array.isArray(currentState)) {
        return currentState[id as number] as
          | SelectableStateItem<StateType, GroupIdentifier>
          | undefined;
      }

      return (currentState as Record<ParallelStateId, unknown>)[id] as
        | SelectableStateItem<StateType, GroupIdentifier>
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

      const insertionsOutput = itemInsertions.reduce(
        (acc, insertion) => ({
          ...acc,
          ...wrapExceptionAwareMethods(
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
              insertions: { ...inheritedInsertions, ...acc } as never,
              exceptions,
              raiseException,
              clearException,
              clearExceptionScope,
              clearExceptions,
            }) as Record<string, unknown>,
            raiseException,
          ),
        }),
        {} as Record<string, unknown>,
      );

      const stateProxy = new Proxy(insertionsOutput, {
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

    return { select, selectItem, items };
  };
}
