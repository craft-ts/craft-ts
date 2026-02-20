import { linkedSignal } from '@angular/core';
import { InsertionsStateFactory } from './query.core';
import { MergeObject } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { wrapExceptionAwareMethods } from './business-exception';
import { Source$ as SourceDollarType, source$ } from './source$';
import { isSource } from './util/util';

type SelectPropertyMethodName<PropertyKey extends string> =
  `select${Capitalize<PropertyKey>}`;
type PathSegment = string | number | symbol;
type TuplePath = readonly PathSegment[];
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

type PrependPath<
  Seg extends PathSegment,
  Path extends TuplePath,
> = [Seg, ...Path];

type ToFlatAtLayer<
  SourceType,
  CurrentItem,
  CurrentSeg extends PathSegment,
  CurrentLeafIndex extends PathSegment = CurrentSeg,
> = SourceType extends FlatCrossLayerEvent<
  infer Payload,
  infer LeafItem,
  infer LeafIndex extends PathSegment,
  infer Path extends TuplePath
>
  ? FlatCrossLayerEvent<
      Payload,
      LeafItem,
      LeafIndex,
      PrependPath<CurrentSeg, Path>
    >
  : FlatCrossLayerEvent<SourceType, CurrentItem, CurrentLeafIndex, [CurrentSeg]>;

type ExposedPropertyInsertions<Insertions> = MergeObject<
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
>;

export type PropertyModifierOutput<PropertyType, Insertions> = MergeObject<
  PropertyType,
  ExposedPropertyInsertions<Insertions>
>;

type CrossLayerSourceOutput<
  Insertions,
  PropertyType extends object,
  PropertyKey extends string,
> = {
  [K in SourceKeys<Insertions>]: Insertions[K] extends SourceDollarType<
    infer SourceType
  >
    ? SourceDollarType<
        ToFlatAtLayer<SourceType, PropertyType, PropertyKey, PropertyKey>
      >
    : never;
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
  MergeObject<
    {
      [K in SelectPropertyMethodName<PropertyKey>]: () => PropertyModifierOutput<
        Extract<StateType[PropertyKey], object>,
        Insertions1
      >;
    },
    MergeObject<
      {
        selectProperty: <K extends PropertyKey>(
          key: K,
        ) => PropertyModifierOutput<Extract<StateType[K], object>, Insertions1>;
        selectPropertyByKey: <K extends PropertyKey>(
          key: K,
        ) => PropertyModifierOutput<Extract<StateType[K], object>, Insertions1>;
      },
      CrossLayerSourceOutput<
        Insertions1,
        Extract<StateType[PropertyKey], object>,
        PropertyKey
      >
    >
  >,
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
  MergeObject<
    {
      [K in SelectPropertyMethodName<PropertyKey>]: () => PropertyModifierOutput<
        Extract<StateType[PropertyKey], object>,
        Insertions1 & Insertions2
      >;
    },
    MergeObject<
      {
        selectProperty: <K extends PropertyKey>(
          key: K,
        ) => PropertyModifierOutput<
          Extract<StateType[K], object>,
          Insertions1 & Insertions2
        >;
        selectPropertyByKey: <K extends PropertyKey>(
          key: K,
        ) => PropertyModifierOutput<
          Extract<StateType[K], object>,
          Insertions1 & Insertions2
        >;
      },
      MergeObject<
        CrossLayerSourceOutput<
          Insertions1,
          Extract<StateType[PropertyKey], object>,
          PropertyKey
        >,
        CrossLayerSourceOutput<
          Insertions2,
          Extract<StateType[PropertyKey], object>,
          PropertyKey
        >
      >
    >
  >,
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
  } & {
    selectProperty: (key: PropertyKey) => unknown;
    selectPropertyByKey: (key: PropertyKey) => unknown;
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
    let selectedPropertyProxy: unknown;
    type PropertyType = Extract<StateType[PropertyKey], object>;
    const crossLayerSourcesByKey = new Map<string, SourceDollarType<unknown>>();
    const selectPropertyMethodName =
      `select${propertyKey[0].toUpperCase()}${propertyKey.slice(1)}` as SelectPropertyMethodName<PropertyKey>;
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

      const { exposedInsertionsOutput } = propertyInsertions.reduce(
          (acc, insertion) => {
            const nextRawInsertions = wrapExceptionAwareMethods(
              insertion({
                state: selectedPropertySignal,
                set: setProperty,
                update: updateProperty,
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

    const selectPropertyByKey = <K extends PropertyKey>(key: K) => {
      if (key !== propertyKey) {
        return undefined as unknown;
      }
      return selectPropertyItem() as unknown;
    };

    // Ensure cross-layer sources are available for subsequent state insertions.
    selectPropertyItem();

    return {
      [selectPropertyMethodName]: selectPropertyItem,
      selectProperty: selectPropertyByKey,
      selectPropertyByKey,
      ...Object.fromEntries(crossLayerSourcesByKey.entries()),
    } as {
      [K in SelectPropertyMethodName<PropertyKey>]: () => unknown;
    } & {
      selectProperty: (key: PropertyKey) => unknown;
      selectPropertyByKey: (key: PropertyKey) => unknown;
    } & Record<string, unknown>;
  };
}
