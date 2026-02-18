import { linkedSignal } from '@angular/core';
import { InsertionsStateFactory } from './query.core';
import { MergeObject } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { wrapExceptionAwareMethods } from './business-exception';

type SelectPropertyMethodName<PropertyKey extends string> =
  `select${Capitalize<PropertyKey>}`;

export type PropertyModifierOutput<PropertyType, Insertions> = MergeObject<
  PropertyType,
  IsEmptyObject<Insertions> extends true ? {} : FilterSource<Insertions>
>;

/**
 * Adds a `select<Property>()` accessor on an object state to work on one nested property
 * with insertion methods/computed values while keeping direct property reads available.
 *
 * Useful to compose nested behavior without creating a separate state primitive.
 *
 * @example
 * ```ts
 * const board = state(
 *   { cell: { color: 'white', paintCount: 0 } },
 *   insertSelectProperty('cell', ({ update }) => ({
 *     paint: () =>
 *       update((cell) => ({
 *         ...cell,
 *         color: 'black',
 *         paintCount: cell.paintCount + 1,
 *       })),
 *   })),
 * );
 *
 * board.selectCell().paint();
 * ```
 */
export function insertSelectProperty<
  StateType extends Record<string, unknown>,
  PropertyKey extends keyof StateType & string,
  Insertions1 = {},
  PreviousInsertionsOutputs = {},
>(
  propertyKey: PropertyKey,
  insertion1: InsertionsStateFactory<
    Extract<StateType[PropertyKey], object>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
): InsertionsStateFactory<
  StateType,
  {
    [K in SelectPropertyMethodName<PropertyKey>]: () => PropertyModifierOutput<
      Extract<StateType[PropertyKey], object>,
      Insertions1
    >;
  },
  PreviousInsertionsOutputs
>;
export function insertSelectProperty<
  StateType extends Record<string, unknown>,
  PropertyKey extends keyof StateType & string,
  Insertions1 = {},
  Insertions2 = {},
  PreviousInsertionsOutputs = {},
>(
  propertyKey: PropertyKey,
  insertion1: InsertionsStateFactory<
    Extract<StateType[PropertyKey], object>,
    Insertions1,
    PreviousInsertionsOutputs
  >,
  insertion2: InsertionsStateFactory<
    Extract<StateType[PropertyKey], object>,
    Insertions2,
    PreviousInsertionsOutputs & Insertions1
  >,
): InsertionsStateFactory<
  StateType,
  {
    [K in SelectPropertyMethodName<PropertyKey>]: () => PropertyModifierOutput<
      Extract<StateType[PropertyKey], object>,
      Insertions1 & Insertions2
    >;
  },
  PreviousInsertionsOutputs
>;
export function insertSelectProperty<
  StateType extends Record<string, unknown>,
  PropertyKey extends keyof StateType & string,
  PreviousInsertionsOutputs = {},
>(
  propertyKey: PropertyKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...propertyInsertions: InsertionsStateFactory<
    Extract<StateType[PropertyKey], object>,
    any,
    any
  >[]
): InsertionsStateFactory<
  StateType,
  {
    [K in SelectPropertyMethodName<PropertyKey>]: () => unknown;
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
    let selectedPropertyProxy: unknown;
    type PropertyType = Extract<StateType[PropertyKey], object>;
    const selectPropertyMethodName =
      `select${propertyKey[0].toUpperCase()}${propertyKey.slice(1)}` as SelectPropertyMethodName<PropertyKey>;
    const inheritedInsertions =
      (previousInsertions as unknown as Record<string, unknown>) ?? {};

    const selectProperty = () => state()[propertyKey] as PropertyType;

    const setProperty = (newProperty: PropertyType) => {
      update((currentState) => ({
        ...currentState,
        [propertyKey]: newProperty,
      }));
      return newProperty;
    };

    const updateProperty = (
      updateFn: (currentProperty: PropertyType) => PropertyType,
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

      const insertionsOutput = propertyInsertions.reduce(
        (acc, insertion) => ({
          ...acc,
          ...wrapExceptionAwareMethods(
            insertion({
              state: selectedPropertySignal,
              set: setProperty,
              update: updateProperty,
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

      selectedPropertyProxy = new Proxy(insertionsOutput, {
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

    return {
      [selectPropertyMethodName]: selectPropertyItem,
    } as {
      [K in SelectPropertyMethodName<PropertyKey>]: () => unknown;
    };
  };
}
