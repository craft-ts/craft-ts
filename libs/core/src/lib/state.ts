import {
  assertInInjectionContext,
  DestroyRef,
  inject,
  Injector,
  isSignal,
  isWritableSignal,
  linkedSignal,
  runInInjectionContext,
  Signal,
  WritableSignal,
} from './host/craft-compat';
import { takeUntilDestroyed } from './host/craft-compat';

const UNSET_ANGULAR_STATE = Symbol('unset-angular-state');
import {
  craftComputed,
  craftLinkedSignal,
  craftSignal,
  isCraftSignal,
  type CraftSignal,
  type CraftWritableSignal,
} from './host/craft-signal';
import {
  InsertionsStateFactory,
  InsertionStateFactoryContext,
} from './query.core';
import {
  createNamedPrimitiveGen,
  createPrimitiveGen,
  type CraftPrimitiveGen,
  type NamedPrimitive,
} from './craft-primitive-gen';
import { isGenerator, runCraftGenerator } from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import type {
  BrandedServiceProvider,
  MergeServiceDependencyMaps,
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromValues,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import {
  APP_SNAPSHOT_REGISTRY,
  INSERTION_SNAPSHOT_REGISTRY,
  InsertionSnapshotRegistry,
  triggerAndCollectInsertions,
} from './take-app-snapshot';
import { Source$ as SourceDollarType } from './source$';
import { MergeObject } from './util/types/util.type';
import { FilterSource, IsEmptyObject } from './util/util.type';
import { isSource } from './util/util';
import { ɵprovideStateMethodRuntimeContext } from './state-method-runtime-context';
import {
  createYieldableInsertionMethod,
  isNonYieldableInsertionMethod,
  yieldableInvocation,
  type BrandReactiveProperties,
  type YieldableInsertionMethods,
} from './yieldable';
import type {
  StandardSchemaV1InferInput,
  StandardSchemaV1InferOutput,
} from './standard-schema';
import {
  decideSchemaValidation,
  type CraftSchema,
  type SchemaValidationOperation,
  type SchemaValidationPolicy,
  type SchemaValidationStage,
  parseSchema,
  useSchemaValidationPolicy,
} from './schema-validation';
import type { AnyCraftException } from './craft-exception';
import {
  createYieldableReactiveFacade,
  createYieldableReactiveValue,
  deepYieldable,
  hasDeepYieldableInsertion,
  DEEP_YIELDABLE_INSERTION,
  isYieldableReactiveValue,
  nameInsertedReactiveValue,
  type DeepYieldableReaderOf,
  type YieldableReactiveValue,
} from './reactive-read';

type ResolveGeneratorResult<Result> =
  Result extends Generator<any, infer Output, unknown> ? Output : Result;

type Source$Method<SourceType> = [SourceType] extends [void]
  ? () => Generator<never, void, unknown>
  : (value: SourceType) => Generator<never, void, unknown>;

type AnyGeneratorFunction = (
  ...args: never[]
) => Generator<unknown, unknown, unknown>;

const createLinkedSignalWithOptions = craftLinkedSignal as unknown as <
  T,
>(options: {
  source: () => unknown;
  computation: () => T;
  equal?: (a: T, b: T) => boolean;
}) => CraftWritableSignal<T>;

const createAngularLinkedSignalWithOptions = linkedSignal as unknown as <
  T,
>(options: {
  source: () => unknown;
  computation: () => T;
  equal?: (a: T, b: T) => boolean;
}) => WritableSignal<T>;

export type ExposedStateInsertions<Insertions> = YieldableInsertionMethods<
  MergeObject<
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
  >
>;

type StateReader<
  StateType,
  Insertions,
  Deep extends boolean = false,
  Name extends string = string,
> = Deep extends true
  ? DeepYieldableReaderOf<YieldableReactiveValue<StateType, Name>>
  : Insertions extends {
        readonly [DEEP_YIELDABLE_INSERTION]: true;
      }
    ? DeepYieldableReaderOf<YieldableReactiveValue<StateType, Name>>
    : YieldableReactiveValue<StateType, Name>;

export type StateOutput<
  StateType,
  Insertions,
  Dependencies = {},
  HasSchema extends boolean = false,
  Deep extends boolean = false,
  Name extends string = string,
> = HasSchema extends true
  ? MergeObject<
      StateReader<StateType, Insertions, Deep, Name>,
      MergeObject<
        BrandReactiveProperties<ExposedStateInsertions<Insertions>>,
        {
          readonly hasSchema: YieldableReactiveValue<true, 'hasSchema'>;
          readonly hasException: YieldableReactiveValue<
            boolean,
            'hasException'
          >;
          readonly exceptions: YieldableReactiveValue<
            {
              list: AnyCraftException[];
              parse: { state?: AnyCraftException };
            },
            'exceptions'
          >;
          readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
        }
      >
    >
  : MergeObject<
      StateReader<StateType, Insertions, Deep, Name>,
      MergeObject<
        BrandReactiveProperties<ExposedStateInsertions<Insertions>>,
        { readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies }
      >
    >;

export type StateSchemaConfig<Schema extends CraftSchema> = {
  readonly $self:
    | StandardSchemaV1InferInput<Schema>
    | Signal<StandardSchemaV1InferInput<Schema>>;
  readonly schema: Schema;
  readonly providers?: readonly import('@angular/core').Provider[];
  readonly schemaValidationPolicy?: SchemaValidationPolicy;
};

type StateConfig<State> = State | Signal<State> | CraftSignal<State>;
type StateGeneratorFactory<State, Yielded = never> = () => Generator<
  Yielded,
  StateConfig<State>,
  unknown
>;
type ResolvedStateType<StateInput> = StateInput extends {
  readonly $self: infer V;
}
  ? ResolvedStateType<V>
  : StateInput extends Signal<infer State>
    ? State
    : StateInput extends CraftSignal<infer State>
      ? State
      : StateInput extends (
            ...args: any[]
          ) => Generator<any, infer Output, unknown>
        ? ResolvedStateType<Output>
        : StateInput;
type StateConfigYielded<StateInput> = StateInput extends {
  readonly $self: infer V;
}
  ? StateConfigYielded<V>
  : StateInput extends (
        ...args: any[]
      ) => Generator<infer Yielded, any, unknown>
    ? Yielded
    : never;
type StateInputProviderNames<StateInput> = StateInput extends {
  readonly $self: any;
  readonly providers: readonly (infer P)[];
}
  ? P extends BrandedServiceProvider<infer Name, any, any>
    ? Name
    : never
  : never;
type SatisfyDependencies<Deps, SatisfiedNames extends string> = {
  [K in keyof Deps as K extends SatisfiedNames ? never : K]: Deps[K];
};
type StateTrackedDependencies<
  StateInput = never,
  InsertionsYielded = never,
  Insertions = never,
> = [StateInputProviderNames<StateInput>] extends [never]
  ? MergeServiceDependencyMaps<
      ServiceDependencyMapFromYielded<
        StateConfigYielded<StateInput> | InsertionsYielded
      >,
      ServiceDependencyMapFromValues<Insertions>
    >
  : SatisfyDependencies<
      MergeServiceDependencyMaps<
        ServiceDependencyMapFromYielded<
          StateConfigYielded<StateInput> | InsertionsYielded
        >,
        ServiceDependencyMapFromValues<Insertions>
      >,
      StateInputProviderNames<StateInput>
    >;

const STATE_INVALID_YIELD_ERROR_MESSAGE =
  'state generators can only yield craftService dependencies or exposed dependency helpers.';
const STATE_APP_START_ERROR_MESSAGE =
  'state generators do not support onAppStart(...).';

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

function isGeneratorFunction(value: unknown): value is AnyGeneratorFunction {
  return (
    typeof value === 'function' &&
    (value.constructor?.name === 'GeneratorFunction' ||
      Object.prototype.toString.call(value) === '[object GeneratorFunction]')
  );
}

function executeStateFactory<This, Args extends unknown[], Result>(
  factory: (this: This, ...args: Args) => Result,
  thisArg: This,
  getInjector: () => Injector | object,
  ...args: Args
): ResolveGeneratorResult<Result> {
  const injector = getInjector();
  const wrappedFactory = runInInjectionContext(injector, () =>
    injectFnWrapper()(factory),
  );
  const result = wrappedFactory.apply(thisArg, args);

  if (!isGenerator(result)) {
    return result as ResolveGeneratorResult<Result>;
  }

  return runInInjectionContext(injector, () => {
    return runCraftGenerator({
      iterator: result,
      injector,
      hostScope: 'function',
      invalidYieldErrorMessage: STATE_INVALID_YIELD_ERROR_MESSAGE,
      multipleAppStartErrorMessage: STATE_APP_START_ERROR_MESSAGE,
      onAppStartNotSupportedErrorMessage: STATE_APP_START_ERROR_MESSAGE,
    }).value as ResolveGeneratorResult<Result>;
  });
}

/**
 * Creates a signal state with an optional insertion for adding methods and computed properties.
 *
 * The `state` function allows you to create a Signal-based state that can be extended with custom
 * methods and properties through an insertion. The insertion receives a context object with
 * `state`, `set` and `update` methods. Compose several insertions with
 * `insertStatePipe(insertion1, insertion2)`.
 *
 * @remarks
 * For the best TypeScript inference, pass Angular `Signal` values (e.g. `signal`, `linkedSignal`)
 * rather than manually widening to `WritableSignal`. This avoids some overload inference limits
 * and keeps the public state read-only.
 *
 * @param name - The state name. Used for host tagging and reactive branding
 * (`const counter = yield* state('counter', 0)`) and as the injector host
 * tag (`state:counter`), so the state is precisely locatable in snapshots and logs.
 * @param stateConfig - The initial state value or a Signal (e.g., linkedSignal)
 * @param insertion1 - Optional single insertion factory to extend the state with methods and properties
 * @returns A single-use primitive generator resolving to the state Signal
 * merged with all insertion properties
 * and methods. Consume it with `yield*`
 * inside a generator host (craftService factory, craftGen, …) or with
 * `craftUse(...)` elsewhere (typically a component field).
 *
 * @example
 * // Simple state with a primitive value (component field)
 * const counter = craftUse(state('counter', 0));
 * console.log(counter()); // 0
 *
 * @example
 * // Inside a craftService generator factory
 * const { Counter } = craftService(
 *   { name: 'Counter', scope: 'global' },
 *   function* () {
 *     const counter = yield* state('counter', 0);
 *     return { counter };
 *   },
 * );
 *
 * @example
 * // State with a computed
 * const origin = signal(5);
 * const doubled = craftUse(state('doubled', computed(() => origin() * 2)));
 * console.log(doubled()); // 10
 *
 * @example
 * // State with insertions to add methods (Method-based)
 * const origin = signal(5);
 * const counter = craftUse(state(
 *   'counter',
 *   computed(() => origin() * 2),
 *   ({ update, set }) => ({
 *     increment: () => update((current) => current + 1),
 *     reset: () => set(0),
 *   })
 * ));
 * console.log(counter()); // 10
 * craftUse(counter.increment());
 * console.log(counter()); // 11
 * craftUse(counter.reset());
 * console.log(counter()); // 0
 *
 * @example
 * // State with multiple insertions, composed with insertStatePipe
 * const origin = signal(5);
 * const counterDouble = craftUse(state(
 *   'counterDouble',
 *   computed(() => origin() * 2),
 *   insertStatePipe(
 *       ({ update, set }) => ({
 *         increment: () => update((current) => current + 1),
 *         reset: () => set(0),
 *       }),
 *       ({ state }) => ({
 *         isOdd: computed(() => state() % 2 === 1),
 *       }),
 *     ),
 * ));
 * console.log(counterDouble()); // 10
 * console.log(counterDouble.isOdd()); // false
 * craftUse(counterDouble.increment());
 * console.log(counterDouble()); // 11
 * console.log(counterDouble.isOdd()); // true
 *
 * @example
 * // State with source binding (Event-based)
 * const increment = source$<void>('increment');
 * const reset = source$<void>('reset');
 * const myState = craftUse(state('myState', 0, ({ update, set }) => ({
 *   setValue: on$(increment, () => update(value => value + 1)),
 *   reset: () => on$(reset, () => set(0)),
 * })));
 * console.log(myState()); // 0
 * // Note: setValue is not exposed on myState, only used internally
 * increment.emit();
 * console.log(myState()); // 34
 * reset.emit();
 * console.log(myState()); // 0
 */
export function state<StateInput>(
  stateConfig: StateInput,
): CraftPrimitiveGen<
  StateOutput<
    ResolvedStateType<StateInput>,
    {},
    StateTrackedDependencies<StateInput>
  >
>;
export function state<Name extends string, Schema extends CraftSchema>(
  name: Name,
  stateConfig: StateSchemaConfig<Schema>,
): CraftPrimitiveGen<
  NamedPrimitive<
    Name,
    StateOutput<StandardSchemaV1InferOutput<Schema>, {}, {}, true, false, Name>
  >
>;
export function state<Name extends string, StateInput>(
  name: Name,
  stateConfig: StateInput,
): CraftPrimitiveGen<
  NamedPrimitive<
    Name,
    StateOutput<
      ResolvedStateType<StateInput>,
      {},
      StateTrackedDependencies<StateInput>,
      false,
      false,
      Name
    >
  >
>;
export function state<
  Name extends string,
  StateInput,
  Insertion1,
  Insertion1Yielded = never,
>(
  name: Name,
  stateConfig: StateInput,
  insertion1: InsertionsStateFactory<
    NoInfer<ResolvedStateType<StateInput>>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): CraftPrimitiveGen<
  NamedPrimitive<
    Name,
    StateOutput<
      ResolvedStateType<StateInput>,
      Insertion1,
      StateTrackedDependencies<StateInput, Insertion1Yielded, Insertion1>,
      false,
      false,
      Name
    >
  >
>;
export function state(
  nameOrStateConfig: string | unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateConfig?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const isNamed =
    typeof nameOrStateConfig === 'string' && arguments.length >= 2;
  const name = isNamed ? nameOrStateConfig : 'state';
  const config = isNamed ? stateConfig : nameOrStateConfig;
  const ref = createStateRef(name, config, ...(isNamed ? insertions : []));
  return isNamed ? createNamedPrimitiveGen(name, ref) : createPrimitiveGen(ref);
}

function createStateRef<StateType>(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateConfig: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const insertionSnapshotRegistry = new InsertionSnapshotRegistry();
  const hasSelfConfig =
    typeof stateConfig === 'object' &&
    stateConfig !== null &&
    '$self' in stateConfig;
  const extraProviders = hasSelfConfig ? (stateConfig.providers ?? []) : [];
  const rawConfig = hasSelfConfig ? stateConfig.$self : stateConfig;
  const schema: CraftSchema | undefined = hasSelfConfig
    ? stateConfig.schema
    : undefined;
  const localSchemaPolicy: SchemaValidationPolicy | undefined = hasSelfConfig
    ? stateConfig.schemaValidationPolicy
    : undefined;
  let baseInjector: Injector | undefined;
  try {
    baseInjector = inject(Injector);
  } catch {
    // A state can still be constructed outside an injection context when no
    // generator/schema work needs the injector until it is read.
  }
  const getBaseInjector = () =>
    (baseInjector ??= (() => {
      assertInInjectionContext(state);
      return inject(Injector);
    })());
  let injector: Injector | undefined;
  const getInjector = () => {
    injector ??= ɵcreateHostTaggedInjector(getBaseInjector(), `state:${name}`, [
      {
        provide: INSERTION_SNAPSHOT_REGISTRY,
        useValue: insertionSnapshotRegistry,
      },
      ...extraProviders,
    ]);
    return injector;
  };
  const resolvedStateConfig = isGeneratorFunction(rawConfig)
    ? executeStateFactory(rawConfig, undefined, getInjector)
    : rawConfig;
  const isSignalState =
    isCraftSignal(resolvedStateConfig) || isSignal(resolvedStateConfig);
  const isAngularSignalState =
    isSignal(resolvedStateConfig) && !isCraftSignal(resolvedStateConfig);
  const isCraftWritableState =
    isCraftSignal(resolvedStateConfig) &&
    typeof Reflect.get(resolvedStateConfig, 'set') === 'function';
  const readResolvedState = () => (resolvedStateConfig as () => unknown)();
  const wrapAngularReadonlyState = () => {
    const override = craftSignal<StateType | typeof UNSET_ANGULAR_STATE>(
      UNSET_ANGULAR_STATE,
    );
    const value = (() => {
      const local = override();
      return local === UNSET_ANGULAR_STATE
        ? (readResolvedState() as StateType)
        : (local as StateType);
    }) as CraftWritableSignal<StateType>;
    value.set = (next) => {
      override.set(next);
    };
    value.update = (updateFn) => value.set(updateFn(value()));
    value.asReadonly = () => value;
    return value;
  };
  let lastValidState: StateType | undefined;
  let latestStateException: AnyCraftException | undefined;
  let skipInitialSourceValidation = isSignalState;
  const applySchema = (
    value: unknown,
    operation: SchemaValidationOperation,
  ): StateType => {
    if (!schema) {
      return value as StateType;
    }
    if (operation === 'source' && skipInitialSourceValidation) {
      skipInitialSourceValidation = false;
      return lastValidState as StateType;
    }

    const parsed = parseSchema<StateType>(schema, value, {
      primitive: 'state',
      name,
      stage: 'state' satisfies SchemaValidationStage,
      operation,
    });
    if (parsed instanceof Promise) {
      // Signals are synchronous. Async Standard Schema implementations are
      // supported by the resource primitives, but cannot safely publish a
      // pending state value.
      return lastValidState as StateType;
    }

    const decision = decideSchemaValidation(
      parsed,
      {
        primitive: 'state',
        name,
        stage: 'state',
        operation,
      },
      useSchemaValidationPolicy(getInjector(), localSchemaPolicy),
    );
    if (!decision.accepted) {
      latestStateException = decision.exception;
      return lastValidState as StateType;
    }

    latestStateException = undefined;
    lastValidState = decision.value as StateType;
    return lastValidState;
  };

  const initialStateValue = applySchema(
    isSignalState ? readResolvedState() : resolvedStateConfig,
    'initial',
  );
  const stateSignal =
    !schema && isSignalState
      ? isWritableSignal(resolvedStateConfig) || isCraftWritableState
        ? (resolvedStateConfig as
            | WritableSignal<StateType>
            | CraftWritableSignal<StateType>)
        : isAngularSignalState
          ? wrapAngularReadonlyState()
          : craftLinkedSignal({
              source: readResolvedState,
              computation: () => readResolvedState() as StateType,
            })
      : isSignalState
        ? isAngularSignalState
          ? createAngularLinkedSignalWithOptions({
              source: readResolvedState,
              computation: () => applySchema(readResolvedState(), 'source'),
              equal: () => false,
            })
          : createLinkedSignalWithOptions({
              source: readResolvedState,
              computation: () => applySchema(readResolvedState(), 'source'),
              equal: () => false,
            })
        : craftSignal(initialStateValue);
  const readonlyStateSignal =
    isAngularSignalState &&
    !(isWritableSignal(resolvedStateConfig) || isCraftWritableState)
      ? (stateSignal as Signal<StateType>)
      : isCraftSignal(stateSignal)
        ? craftComputed(() => stateSignal())
        : 'asReadonly' in stateSignal &&
            typeof (stateSignal as { asReadonly?: unknown }).asReadonly ===
              'function'
          ? (stateSignal as CraftWritableSignal<StateType>).asReadonly()
          : (stateSignal as Signal<StateType>);
  const publicStateReader = createYieldableReactiveValue(
    readonlyStateSignal as Signal<StateType>,
    name,
    { primitive: 'state', path: name },
  );
  const originalSet = stateSignal.set.bind(stateSignal);
  const setState = (newState: StateType) => {
    if (!schema) {
      originalSet(newState);
      return newState;
    }
    const next = applySchema(newState, 'set');
    if (!latestStateException) {
      originalSet(next);
    }
    return next;
  };
  const updateState = (updateFn: (currentState: StateType) => StateType) => {
    if (!schema) {
      const next = updateFn(stateSignal());
      originalSet(next);
      return next;
    }
    const next = applySchema(updateFn(stateSignal()), 'update');
    if (!latestStateException) {
      originalSet(next);
    }
    return next;
  };
  if (schema) {
    stateSignal.set = setState;
    stateSignal.update = updateState;
  }
  const insertionsOutput = (
    insertions as InsertionsStateFactory<StateType, {}>[]
  ).reduce(
    (acc, insert) => {
      const insertionContext = {
        state: publicStateReader,
        set: (newState: StateType) => yieldableInvocation(setState(newState)),
        update: (updateFn: (currentState: StateType) => StateType) =>
          yieldableInvocation(updateState(updateFn)),
        patch: (patchFn: (currentState: StateType) => Partial<StateType>) =>
          yieldableInvocation(
            updateState((current) => ({
              ...current,
              ...patchFn(current),
            })),
          ),
        insertions: Object.entries(acc.rawInsertionsOutput).reduce(
          (previous, [key, value]) => {
            if (isSource$(value)) previous[key] = value;
            return previous;
          },
          { ...acc.exposedInsertionsOutput } as Record<string, unknown>,
        ) as {},
      } as InsertionStateFactoryContext<StateType, {}>;
      const nextRawInsertions = executeStateFactory(
        insert,
        undefined,
        getBaseInjector,
        insertionContext,
      ) as Record<string, unknown>;

      const nextExposedInsertions = Object.entries(nextRawInsertions).reduce(
        (exposedAcc, [key, value]) => {
          if (isSource(value)) {
            return exposedAcc;
          }

          if (isSource$(value)) {
            const localSource = value;
            const sourceInjector = ɵcreateHostTaggedInjector(
              getInjector(),
              `source:${key}`,
            );
            const wrappedEmit = runInInjectionContext(sourceInjector, () =>
              injectFnWrapper()((payload: unknown) =>
                localSource.emit(payload as never),
              ),
            );
            exposedAcc[key] = createYieldableInsertionMethod(
              (payload: unknown) => wrappedEmit(payload),
              {
                injector: sourceInjector,
                invalidYieldErrorMessage: STATE_INVALID_YIELD_ERROR_MESSAGE,
                multipleAppStartErrorMessage: STATE_APP_START_ERROR_MESSAGE,
                onAppStartNotSupportedErrorMessage:
                  STATE_APP_START_ERROR_MESSAGE,
              },
            );
            return exposedAcc;
          }

          if (isYieldableReactiveValue(value)) {
            exposedAcc[key] = nameInsertedReactiveValue(
              value,
              key,
              'state',
              `${name}.${key}`,
            );
            return exposedAcc;
          }

          if (
            typeof value === 'function' &&
            !isCraftSignal(value) &&
            !isSignal(value) &&
            !isYieldableReactiveValue(value) &&
            !isNonYieldableInsertionMethod(value)
          ) {
            const methodInjector = ɵcreateHostTaggedInjector(
              getInjector(),
              `method:${key}`,
              [
                ɵprovideStateMethodRuntimeContext(
                  insertionContext as never,
                  value as (...args: never[]) => unknown,
                ),
              ],
            );
            const wrappedFn = runInInjectionContext(methodInjector, () =>
              injectFnWrapper()(value as (...args: unknown[]) => unknown),
            );
            exposedAcc[key] = createYieldableInsertionMethod(wrappedFn, {
              injector: methodInjector,
              invalidYieldErrorMessage: STATE_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: STATE_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage: STATE_APP_START_ERROR_MESSAGE,
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

  const stateOutput = Object.assign(
    readonlyStateSignal,
    insertionsOutput.exposedInsertionsOutput,
    {
      hasSchema: craftSignal(schema !== undefined),
      exceptions: craftComputed(() => {
        // Keep the exception signal reactive when a derived source changes.
        stateSignal();
        const parse = latestStateException
          ? { state: latestStateException }
          : {};
        return { list: Object.values(parse), parse };
      }),
      hasException: craftComputed(() => {
        stateSignal();
        return latestStateException !== undefined;
      }),
    },
  ) as unknown as StateOutput<StateType, {}>;

  const snapshotRegistry = injector
    ? injector.get(APP_SNAPSHOT_REGISTRY, null)
    : (() => {
        try {
          return inject(APP_SNAPSHOT_REGISTRY, { optional: true });
        } catch {
          return null;
        }
      })();

  const hostTagList: readonly string[] = injector
    ? (injector.get(ɵHOST_TAG_LIST, null) ?? [])
    : (() => {
        try {
          return inject(ɵHOST_TAG_LIST, { optional: true }) ?? [];
        } catch {
          return [];
        }
      })();

  const destroyRef = injector
    ? injector.get(DestroyRef, null)
    : (() => {
        try {
          return inject(DestroyRef, { optional: true });
        } catch {
          return null;
        }
      })();

  if (snapshotRegistry && destroyRef) {
    snapshotRegistry.triggerSnapshot$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        const insertionSnapshots = triggerAndCollectInsertions(
          insertionSnapshotRegistry,
        );
        let stateSnapshot: unknown;
        try {
          stateSnapshot = {
            value: stateSignal(),
            ...(insertionSnapshots ? { insertions: insertionSnapshots } : {}),
          };
        } catch (error) {
          stateSnapshot = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
        snapshotRegistry.allSnapShot$.next({
          source: 'state',
          from: hostTagList,
          state: stateSnapshot,
        });
      });
  }

  const publicState = createYieldableReactiveFacade(stateOutput, {
    name,
    primitive: 'state',
    path: name,
  });
  return hasDeepYieldableInsertion(insertions)
    ? deepYieldable(publicState)
    : publicState;
}
