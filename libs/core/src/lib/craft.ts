import { Prettify } from './util/util.type';
import {
  MergeObject,
  MergeObjects,
  UnionToTuple,
} from './util/types/util.type';
import {
  assertInInjectionContext,
  effect,
  inject,
  InjectionToken,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { createSignalProxy, SignalProxy } from './signal-proxy';
import {
  ExcludeCommonKeys,
  HasKeys,
  RemoveIndexSignature,
  ReplaceStoreConfigToken,
  ToConnectableMethodFromInject,
} from './util/util.type';

//todo craft inouts should not accepts other params
// todo filter private fields and methods ?

// ! when adding standalone outputs make sure to assign like this: const c = Object.assign(() => true, {a: 5}) (function first)

// todo find a way to simplify that, props exposed everywhere, _props only in stores and __props only in current store ?
// todo doc about cloudProxy (it store all standalones methods automatically)
export type ContextConstraints = {
  props: {};
  methods: Record<string, Function>; //? (editable in injectCraft/craftCraft)
  _inputs: {}; //? (editable in injectCraft/craftCraft)
  _injections: {};
  _queryParams: {};
  _sources: {}; //? (editable in injectCraft/craftCraft)
  _mutation: {};
  _query: {};
  _asyncMethods: {};
  _cloudProxy: {}; // A proxy that is used to share data between the injectable context and standalone outputs functions, composed store merge this proxy values
  _dependencies: {}; // todo implements composition alias and implements it
  _error: {};
};

// ! do not expose it
type _EmptyContext = {
  props: {};
  methods: Record<string, Function>;
  _inputs: {};
  _queryParams: {};
  _sources: {};
  _injections: {};
  _asyncMethods: {};
  _mutation: {};
  _query: {};
  _cloudProxy: {};
  _dependencies: {};
  _error: {};
};

export const EmptyContext = {
  props: {},
  methods: {},
  _inputs: {},
  _queryParams: {},
  _sources: {},
  _injections: {},
  _asyncMethods: {},
  _mutation: {},
  _query: {},
  _cloudProxy: {},
  _dependencies: {},
  _error: {},
};

export type EmptyContext = typeof EmptyContext;

export function contract<Implement>() {
  return {} as Implement;
}

type EmptyStandaloneContext = {};

export function partialContext(
  context: Partial<ContextConstraints>,
): ContextConstraints {
  return {
    props: context.props ?? {},
    methods: context.methods ?? {},
    _inputs: context._inputs ?? {},
    _injections: context._injections ?? {},
    _queryParams: context._queryParams ?? {},
    _sources: context._sources ?? {},
    _asyncMethods: context._asyncMethods ?? {},
    _mutation: context._mutation ?? {},
    _query: context._query ?? {},
    _cloudProxy: context._cloudProxy ?? {},
    _dependencies: context._dependencies ?? {},
    _error: context._error ?? {},
  };
}

export type PartialContext<Context extends Partial<ContextConstraints>> = {
  props: [unknown] extends Context['props'] ? {} : Context['props'];
  methods: [unknown] extends Context['methods'] ? {} : Context['methods'];
  _inputs: [unknown] extends Context['_inputs'] ? {} : Context['_inputs'];
  _injections: [unknown] extends Context['_injections']
    ? {}
    : Context['_injections'];
  _queryParams: [unknown] extends Context['_queryParams']
    ? {}
    : Context['_queryParams'];
  _sources: [unknown] extends Context['_sources'] ? {} : Context['_sources'];
  _asyncMethods: [unknown] extends Context['_asyncMethods']
    ? {}
    : Context['_asyncMethods'];
  _mutation: [unknown] extends Context['_mutation'] ? {} : Context['_mutation'];
  _query: [unknown] extends Context['_query'] ? {} : Context['_query'];
  _cloudProxy: [unknown] extends Context['_cloudProxy']
    ? {}
    : Context['_cloudProxy'];
  _dependencies: [unknown] extends Context['_dependencies']
    ? {}
    : Context['_dependencies'];
  _error: [unknown] extends Context['_error'] ? {} : Context['_error'];
};

export type CloudProxy<T> = T;
export type CloudProxySource = Record<string, unknown>;

export type CraftFactoryEntries<Context extends ContextConstraints> =
  Context['_inputs'] &
    Context['_injections'] &
    Context['_sources'] &
    Context['props'] &
    Context['_asyncMethods'];

export const craftFactoryEntries = (contextData: {
  context: ContextConstraints;
}) => ({
  ...contextData.context._inputs,
  ...contextData.context._injections,
  ...contextData.context._sources,
  ...contextData.context.props,
  ...contextData.context._asyncMethods,
  ...contextData.context._mutation,
});

export type ContextInput<Context extends ContextConstraints> = {
  context: Context;
};

/**
 * ! Do not use it to generate the output of utilities like (craftQuery, craftMutation, etc..),
 * ! the context is not correctly inferred (use CraftFactoryUtility instead)
 */
//todo _cloud should extends stadalone outputs _cloud
export type CraftFactory<
  Context extends ContextConstraints[],
  StoreConfig,
  CraftActionOutputs extends ContextConstraints,
  StandaloneContextOutputs extends {},
> = (
  cloudProxy: CloudProxy<MergeContexts<Context>['_cloudProxy']>,
  storeConfig: StoreConfig,
) => (<HostStoreConfig extends StoreConfigConstraints>(
  contextData: ContextInput<MergeContexts<Context>>,
  injector: Injector,
  storeConfig: StoreConfig, // do not use HostStoreConfig
  cloudProxy: MergeContexts<Context>['_cloudProxy'],
) => CraftActionOutputs) & {
  standaloneOutputs?: StandaloneContextOutputs;
};

export type CraftFactoryUtility<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  CraftActionOutputs extends ContextConstraints,
  StandaloneOutputs extends {} = {},
> = (
  cloudProxy: CloudProxySource,
  storeConfig: StoreConfig,
) => (<HostStoreConfig extends StoreConfigConstraints>(
  contextData: ContextInput<Context>,
  injector: Injector,
  storeConfig: HostStoreConfig,
  cloudProxy: Context['_cloudProxy'],
) => CraftActionOutputs) & {
  standaloneOutputs?: StandaloneOutputs;
};
export const EXTERNALLY_PROVIDED = 'EXTERNALLY_PROVIDED' as const;

type EnableInputsToBeExternallyProvided<Inputs, Enable> = {
  [key in keyof Inputs]: Enable extends true
    ? Inputs[key] | typeof EXTERNALLY_PROVIDED
    : Inputs[key];
};

type IsNotFeature<ProvidedIn extends ProvidedInOption> =
  ProvidedIn extends 'feature' ? false : true;

type ReplaceStandaloneStoreToken<
  StandaloneOutputs extends StandaloneOutputsConstraints,
  StoreConfig extends StoreConfigConstraints,
> = {
  [K in keyof StandaloneOutputs as ReplaceStoreConfigToken<
    K & string,
    StoreConfig
  >]: StandaloneOutputs[K];
};
type InjectCraftOutput<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  HasInputs,
  InputsToPlugin,
  HasMethods,
  MethodsConnected,
> = {
  [key in `inject${Capitalize<StoreConfig['name']>}Craft`]: <
    Config extends MergeObjects<
      [
        HasInputs extends true
          ? {
              inputs: InputsToPlugin;
            }
          : {},
        HasMethods extends true
          ? {
              methods?: Prettify<MethodsConnected>;
            }
          : {},
      ]
    >,
  >(
    ...args: HasInputs extends true
      ? [pluggableConfig: Config]
      : [pluggableConfig?: Config]
  ) => Prettify<
    RemoveIndexSignature<
      Context['props'] &
        ExcludeCommonKeys<
          Context['methods'],
          'methods' extends keyof Config ? Config['methods'] : {}
        >
    >
  >;
};

type CraftCompositionOutput<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  HasInputs,
  InputsToPlugin,
  HasMethods,
  StandaloneOutputs,
  MethodsToConnect,
  MethodsConnected extends MethodsToConnect = MethodsToConnect,
> = {
  [key in `craft${Capitalize<StoreConfig['name']>}`]: <
    HostContext extends ContextConstraints,
    HostStoreConfig extends StoreConfigConstraints,
    Config extends MergeObjects<
      [
        HasInputs extends true
          ? {
              inputs: Partial<InputsToPlugin>;
            }
          : {},
        HasMethods extends true
          ? {
              methods?: MethodsConnected;
            }
          : {},
      ]
    >,
  >(
    pluggableConfig?: (
      configFactory: CraftFactoryEntries<HostContext>,
    ) => MergeObject<
      MergeObject<
        Config,
        Exclude<
          'methods' extends keyof Config ? keyof Config['methods'] : never,
          keyof MethodsToConnect
        > extends infer NotKnownMethodsUnion
          ? [NotKnownMethodsUnion] extends [undefined]
            ? {}
            : {
                errorMethodMsg: `Error: You are trying to add methods that are not defined in the connected store (${StoreConfig['name']}): ${UnionToTuple<NotKnownMethodsUnion> &
                  string}`;
              }
          : {}
      >,
      Exclude<
        'inputs' extends keyof Config ? keyof Config['inputs'] : never,
        keyof InputsToPlugin
      > extends infer NotKnownInputsUnion
        ? [NotKnownInputsUnion] extends [undefined]
          ? {}
          : {
              errorInputsMsg: `Error: You are trying to add inputs that are not defined in the connected store (${StoreConfig['name']}): ${UnionToTuple<NotKnownInputsUnion> &
                string}`;
            }
        : {}
    >,
  ) => CraftFactoryUtility<
    HostContext,
    HostStoreConfig,
    {
      props: Context['props'];
      methods: ExcludeCommonKeys<
        Context['methods'],
        'methods' extends keyof Config ? Config['methods'] : {}
      >;
      _inputs: ExcludeCommonKeys<
        Context['_inputs'],
        'inputs' extends keyof Config ? Config['inputs'] : {}
      >;
      _queryParams: Context['_queryParams'];
      _sources: Context['_sources'];
      _injections: Context['_injections'];
      _asyncMethods: Context['_asyncMethods'];
      _mutation: Context['_mutation'];
      _query: Context['_query'];
      _cloudProxy: Context['_cloudProxy'];
      _dependencies: Context['_dependencies'] & {
        [key in StoreConfig['name']]: {
          storeConfig: StoreConfig;
          context: Context;
        };
      };
      _error: Context['_error'];
    },
    [StandaloneOutputs] extends [{}] ? StandaloneOutputs : {}
  >;
};

type CraftToken<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
> = {
  [key in `${Capitalize<StoreConfig['name']>}Craft`]: InjectionToken<
    Prettify<RemoveIndexSignature<Context['props'] & Context['methods']>>
  >;
};

type META_CONTEXT<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
> = {
  [k in `_${Uppercase<StoreConfig['name']>}_META_STORE_CONTEXT`]: {
    storeConfig: StoreConfig;
    context: Prettify<Context>;
  };
};

// ! Plugged methods are not exposed in the final store (at type level, at runtime they exists and they are not hiding)
type ToCraftOutputs<
  Context extends ContextConstraints[],
  StandaloneContextOutputs extends StandaloneOutputsConstraints[],
  StoreConfig extends StoreConfigConstraints,
  MergedContext extends ContextConstraints = MergeContexts<Context>,
  StandaloneOutputs = ReplaceStandaloneStoreToken<
    MergeStandaloneContexts<StandaloneContextOutputs>,
    StoreConfig
  >,
  InputsToPlugin = EnableInputsToBeExternallyProvided<
    MergedContext['_inputs'],
    IsNotFeature<StoreConfig['providedIn']>
  >,
  HasError = HasKeys<MergedContext['_error']>,
  HasInputs = keyof InputsToPlugin extends never ? false : true,
  MethodsToConnect = ToConnectableMethodFromInject<MergedContext['methods']>,
  HasMethods = keyof MethodsToConnect extends never ? false : true,
  HasContractToImplements = [unknown] extends [StoreConfig['implements']]
    ? false
    : true,
  RespectContract = HasContractToImplements extends false
    ? true
    : IsEqual<
        RemoveIndexSignature<MergedContext['props'] & MergedContext['methods']>,
        NonNullable<StoreConfig['implements']>
      >,
> = (HasError extends false
  ? RespectContract extends true
    ? InjectCraftOutput<
        MergedContext,
        StoreConfig,
        HasInputs,
        InputsToPlugin,
        HasMethods,
        MethodsToConnect
      > &
        CraftCompositionOutput<
          MergedContext,
          StoreConfig,
          HasInputs,
          InputsToPlugin,
          HasMethods,
          StandaloneOutputs,
          MethodsToConnect
        > &
        CraftToken<MergedContext, StoreConfig> &
        StandaloneOutputs
    : {
        error: NonNullable<StoreConfig['implements']> extends Function
          ? 'Contract Implementation Error: The current contract is not called properly. Did you forget to call it as a function? i.e., contract<...>()'
          : 'Contract Implementation Error: The current contract is not respected.';
      }
  : {
      error: MergedContext['_error'];
    }) &
  META_CONTEXT<MergedContext, StoreConfig>;

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
      ? true
      : false
    : false;

type Diff<A, B> = {
  added: Exclude<keyof B, keyof A>;
  removed: Exclude<keyof A, keyof B>;
  changed: ChangedKeys<A, B>;
};

type ChangedKeys<A, B> = {
  [K in keyof A & keyof B]: A[K] extends B[K]
    ? B[K] extends A[K]
      ? never
      : K
    : K;
}[keyof A & keyof B];

type ProvidedInOption = 'root' | 'scoped' | 'feature';
// todo handle feature to not expose the inject and the provide but only the using...
export type StoreConfigConstraints = {
  providedIn: ProvidedInOption;
  name: string;
  implements?: unknown;
};

type MergeContexts<C extends ContextConstraints[]> = C extends [
  infer First,
  ...infer Rest,
]
  ? First extends ContextConstraints
    ? Rest extends ContextConstraints[]
      ? MergeTwoContexts<First, MergeContexts<Rest>>
      : First
    : never
  : _EmptyContext;

type MergeStandaloneContexts<C extends StandaloneOutputsConstraints[]> =
  C extends [infer First, ...infer Rest]
    ? First extends StandaloneOutputsConstraints
      ? Rest extends StandaloneOutputsConstraints[]
        ? First & MergeStandaloneContexts<Rest>
        : First
      : never
    : _EmptyContext;

export type MergeTwoContexts<
  A extends ContextConstraints,
  B extends ContextConstraints,
> = {
  methods: A['methods'] & B['methods'];
  props: A['props'] & B['props'];
  _inputs: A['_inputs'] & B['_inputs'];
  _injections: A['_injections'] & B['_injections'];
  _mutation: A['_mutation'] & B['_mutation'];
  _query: A['_query'] & B['_query'];
  _queryParams: A['_queryParams'] & B['_queryParams'];
  _sources: A['_sources'] & B['_sources'];
  _asyncMethods: A['_asyncMethods'] & B['_asyncMethods'];
  _cloudProxy: A['_cloudProxy'] & B['_cloudProxy'];
  _dependencies: A['_dependencies'] & B['_dependencies'];
  _error: A['_error'] & B['_error'];
};

type StandaloneOutputsConstraints = {};

/**
 * Creates a type-safe, composable state management store with Angular dependency injection.
 *
 * This is the core function for building craft stores. It enables:
 * - **Type-safe composition**: Chain multiple craft utilities (craftState, craftQuery, craftMutation, etc.)
 * - **Dependency injection**: Choose between root-level or feature-level provision
 * - **Smart naming**: Auto-generates injection and composition functions based on store name
 * - **Store composition**: Connect stores together via craftX functions with input/method binding
 * - **Standalone methods**: Export methods that can be called outside injection context
 * - **Contract enforcement**: Optional type contracts for store implementation
 * - **Error detection**: Type-level errors for configuration mistakes
 *
 * @remarks
 * **Naming Convention:**
 * Based on the `options.name` parameter, craft automatically generates:
 * - **Injection function**: `inject{Name}Craft()` - Injects the store instance
 * - **Composition function**: `craft{Name}(config?)` - Composes this store into another
 * - **Injection token**: `{Name}Craft` - Angular injection token for the store
 * - **Metadata**: `_{UPPERCASE_NAME}_META_STORE_CONTEXT` - Type metadata for the store
 *
 * Examples:
 * - `name: 'counter'` → `injectCounterCraft()`, `craftCounter()`
 * - `name: 'userAuth'` → `injectUserAuthCraft()`, `craftUserAuth()`
 * - `name: 'dataPagination'` → `injectDataPaginationCraft()`, `craftDataPagination()`
 *
 * **ProvidedIn Strategy:**
 * The `providedIn` option controls how Angular provides the store:
 *
 * - **`'root'`** (Global singleton):
 *   - Single instance shared across the entire application
 *   - Survives route changes and component destruction
 *   - Ideal for: global state, authentication, app configuration
 *   - When composed into other stores, the same instance is reused
 *
 * - **`'feature'`** (Scoped instances):
 *   - New instance created per injection context
 *   - Does not survive outside its injection scope
 *   - Ideal for: component-specific state, route-scoped data, isolated features
 *   - When composed into other stores, each host gets its own instance
 *
 * **Store Composition:**
 * Use the generated `craft{Name}()` function to compose one store into another:
 * - Access another store's state, methods, and capabilities
 * - Bind inputs from host store to composed store
 * - Connect host methods to composed store sources
 * - Unbound inputs/methods are automatically propagated to the host
 * - Type-safe with error detection for invalid bindings
 *
 * **Injection with Input/Method Binding:**
 * The `inject{Name}Craft()` function accepts a configuration object to:
 * - **Bind inputs**: Pass signals or values to store inputs
 * - **Connect methods to sources**: Replace methods with source emissions
 * - Enable dynamic configuration at injection time
 * - Reduce boilerplate when the store is used
 *
 * **Error Detection:**
 * The type system provides compile-time errors for:
 * - **`errorMethodMsg`**: When connecting methods that don't exist in the composed store
 * - **`errorInputsMsg`**: When binding inputs that aren't defined in the composed store
 * - **Contract violations**: When the store doesn't satisfy its `implements` contract
 * - These errors appear as properties on the configuration object with descriptive messages
 *
 * **Standalone Methods:**
 * Craft utilities (craftSources, craftMutations, etc.) can expose standalone methods:
 * - These are returned directly from `craft()` and can be destructured
 * - Can be called outside Angular's injection context
 * - Useful for event handlers, callbacks, external integrations
 * - Examples: `setReset()`, `setPaginationQueryParams()`
 *
 * @template Context - The craft store context type containing all store capabilities
 * @template StoreConfig - The store configuration type with name and providedIn
 * @template ProvidedIn - The Angular injection scope ('root' or 'feature')
 * @template Name - The store name used for generating function names
 * @template ToImplementContract - Optional contract type the store must satisfy
 *
 * @param options - Store configuration object
 * @param options.name - Store name (camelCase recommended). Used to generate function names.
 * @param options.providedIn - Angular injection scope. 'root' for global singleton, 'feature' for scoped instances.
 * @param options.implements - Optional contract type. Use `contract<YourType>()` to enforce implementation.
 * @param factories - Variable number of craft utility functions (craftState, craftQuery, craftSources, etc.)
 *   Each factory receives the accumulated context from previous factories.
 *
 * @returns An object containing:
 *   - **`inject{Name}Craft`**: Function to inject the store with optional input/method binding
 *   - **`craft{Name}`**: Function to compose this store into another store
 *   - **`{Name}Craft`**: Angular injection token for manual injection
 *   - **`_{UPPERCASE_NAME}_META_STORE_CONTEXT`**: Type metadata (for advanced use cases)
 *   - **Standalone methods**: Any standalone outputs from craft utilities (e.g., `setReset()`)
 *
 * @example
 * Basic counter store with sources and state
 * ```ts
 * const { injectCounterCraft, setIncrement, setDecrement, setReset } = craft(
 *   { name: 'counter', providedIn: 'root' },
 *   craftSources({
 *     increment: source<void>(),
 *     decrement: source<void>(),
 *     reset: source<void>(),
 *   }),
 *   craftState('count', ({ increment, decrement, reset }) =>
 *     state(
 *       0,
 *       ({ state, set }) => ({
 *         increment: afterRecomputation(increment, () => set(state() + 1)),
 *         decrement: afterRecomputation(decrement, () => set(state() - 1)),
 *         reset: afterRecomputation(reset, () => set(0)),
 *       })
 *     )
 *   )
 * );
 *
 * // In a component
 * const store = injectCounterCraft();
 * console.log(store.count()); // 0
 * store.setIncrement(); // count: 1
 * store.setDecrement(); // count: 0
 * store.setReset(); // count: 0
 *
 * // Standalone methods work outside injection context
 * document.addEventListener('click', () => {
 *   setIncrement(); // Works!
 * });
 * ```
 *
 * @example
 * Store with inputs for dynamic configuration
 * ```ts
 * const { injectTimerCraft } = craft(
 *   { name: 'timer', providedIn: 'feature' }, // Feature-scoped
 *   craftInputs({
 *     initialValue: undefined as number | undefined,
 *     step: undefined as number | undefined,
 *   }),
 *   craftSources({
 *     tick: source<void>(),
 *   }),
 *   craftState('time', ({ initialValue, step, tick }) =>
 *     state(
 *       linkedSignal(() => initialValue() ?? 0),
 *       ({ state, set }) => ({
 *         tick: afterRecomputation(tick, () => {
 *           set(state() + (step() ?? 1));
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * // Inject with input binding
 * const timer1 = injectTimerCraft({
 *   inputs: {
 *     initialValue: signal(100),
 *     step: signal(5),
 *   },
 * });
 *
 * const timer2 = injectTimerCraft({
 *   inputs: {
 *     initialValue: signal(0),
 *     step: signal(1),
 *   },
 * });
 *
 * // Each instance is independent (feature-scoped)
 * timer1.time(); // 100
 * timer2.time(); // 0
 * ```
 *
 * @example
 * Store composition with root-level singleton
 * ```ts
 * // Global authentication store
 * const { craftAuth } = craft(
 *   { name: 'auth', providedIn: 'root' }, // Global singleton
 *   craftState('user', () =>
 *     state(
 *       { id: null, name: '' },
 *       ({ set }) => ({
 *         login: (user: { id: number; name: string }) => set(user),
 *         logout: () => set({ id: null, name: '' }),
 *       })
 *     )
 *   )
 * );
 *
 * // Dashboard store uses auth
 * const { injectDashboardCraft } = craft(
 *   { name: 'dashboard', providedIn: 'root' },
 *   craftAuth(), // No config needed, uses shared instance
 *   craftState('dashboardData', ({ user }) =>
 *     state(
 *       linkedSignal(() => `Dashboard for ${user().name}`),
 *       () => ({})
 *     )
 *   )
 * );
 *
 * // Profile store also uses auth
 * const { injectProfileCraft } = craft(
 *   { name: 'profile', providedIn: 'root' },
 *   craftAuth(), // Same auth instance
 *   craftState('profileData', ({ user }) =>
 *     state(
 *       linkedSignal(() => `Profile: ${user().name}`),
 *       () => ({})
 *     )
 *   )
 * );
 *
 * // Both stores share the same auth instance
 * const dashboard = injectDashboardCraft();
 * const profile = injectProfileCraft();
 *
 * dashboard.userLogin({ id: 1, name: 'Alice' });
 * console.log(dashboard.user().name); // 'Alice'
 * console.log(profile.user().name); // 'Alice' (same instance!)
 * ```
 *
 * @example
 * Store composition with feature-level scoping
 * ```ts
 * // Reusable pagination store
 * const { craftPagination } = craft(
 *   { name: 'pagination', providedIn: 'feature' }, // Scoped instance
 *   craftInputs({
 *     pageSize: undefined as number | undefined,
 *   }),
 *   craftState('page', ({ pageSize }) =>
 *     state(
 *       { current: 1, size: linkedSignal(() => pageSize() ?? 10) },
 *       ({ state, set }) => ({
 *         nextPage: () => set({ ...state(), current: state().current + 1 }),
 *         prevPage: () => set({ ...state(), current: state().current - 1 }),
 *       })
 *     )
 *   )
 * );
 *
 * // Users table with pagination
 * const { injectUsersTableCraft } = craft(
 *   { name: 'usersTable', providedIn: 'root' },
 *   craftPagination(() => ({
 *     inputs: { pageSize: signal(20) },
 *   })),
 *   craftState('users', () => state([], () => ({})))
 * );
 *
 * // Products table with pagination
 * const { injectProductsTableCraft } = craft(
 *   { name: 'productsTable', providedIn: 'root' },
 *   craftPagination(() => ({
 *     inputs: { pageSize: signal(50) },
 *   })),
 *   craftState('products', () => state([], () => ({})))
 * );
 *
 * // Each table has its own pagination instance
 * const usersTable = injectUsersTableCraft();
 * const productsTable = injectProductsTableCraft();
 *
 * usersTable.page().size; // 20
 * productsTable.page().size; // 50
 * usersTable.pageNextPage();
 * usersTable.page().current; // 2
 * productsTable.page().current; // 1 (independent!)
 * ```
 *
 * @example
 * Binding methods to sources during composition
 * ```ts
 * const { craftLogger } = craft(
 *   { name: 'logger', providedIn: 'root' },
 *   craftSources({
 *     log: source<string>(),
 *   }),
 *   craftState('logs', ({ log }) =>
 *     state(
 *       [] as string[],
 *       ({ state, set }) => ({
 *         addLog: afterRecomputation(log, (message) => {
 *           set([...state(), message]);
 *         }),
 *         clear: () => set([]),
 *       })
 *     )
 *   )
 * );
 *
 * const { injectAppCraft } = craft(
 *   { name: 'app', providedIn: 'root' },
 *   craftSources({
 *     appError: source<string>(),
 *   }),
 *   craftState('errorCount', ({ appError }) =>
 *     state(
 *       0,
 *       ({ state, set }) => ({
 *         onError: afterRecomputation(appError, () => set(state() + 1)),
 *       })
 *     )
 *   ),
 *   // Connect appError source to logger's clear method
 *   craftLogger(({ appError }) => ({
 *     methods: {
 *       logsClear: appError, // When appError emits, call logsClear
 *     },
 *   }))
 * );
 *
 * const app = injectAppCraft();
 * app.setLog('User logged in');
 * app.logs().length; // 1
 *
 * app.setAppError('Something went wrong');
 * // -> errorCount incremented
 * // -> logs cleared (logsClear called via appError)
 * app.logs().length; // 0
 * app.errorCount(); // 1
 * ```
 *
 * @example
 * Input/method binding with EXTERNALLY_PROVIDED
 * ```ts
 * const { craftTheme } = craft(
 *   { name: 'theme', providedIn: 'root' },
 *   craftInputs({
 *     initialTheme: undefined as 'light' | 'dark' | undefined,
 *   }),
 *   craftState('theme', ({ initialTheme }) =>
 *     state(
 *       linkedSignal(() => initialTheme() ?? 'light'),
 *       ({ set }) => ({
 *         setTheme: (theme: 'light' | 'dark') => set(theme),
 *       })
 *     )
 *   )
 * );
 *
 * // Host store binds the input
 * const { injectAppCraft } = craft(
 *   { name: 'app', providedIn: 'root' },
 *   craftState('appTheme', () => state('dark' as 'light' | 'dark', () => ({}))),
 *   craftTheme(({ appTheme }) => ({
 *     inputs: {
 *       initialTheme: appTheme, // Bind input
 *     },
 *   }))
 * );
 *
 * // Another host provides the input externally
 * const { craftOtherApp } = craft(
 *   { name: 'otherApp', providedIn: 'root' },
 *   // Input is not bound here, marked as EXTERNALLY_PROVIDED
 *   craftTheme(() => ({
 *     inputs: {
 *       initialTheme: 'EXTERNALLY_PROVIDED',
 *     },
 *   }))
 * );
 *
 * // When composing otherApp, initialTheme must be provided
 * const { injectFinalCraft } = craft(
 *   { name: 'final', providedIn: 'root' },
 *   craftOtherApp(() => ({
 *     inputs: {
 *       initialTheme: signal('light'), // Must provide this
 *     },
 *   }))
 * );
 * ```
 *
 * @example
 * Query and mutation with automatic reactivity
 * ```ts
 * const { injectTodosCraft } = craft(
 *   { name: 'todos', providedIn: 'root' },
 *   craftQuery('todoList', () =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         const response = await fetch('/api/todos');
 *         return response.json();
 *       },
 *     })
 *   ),
 *   craftMutations(() => ({
 *     addTodo: mutation({
 *       method: (text: string) => ({ text }),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/todos', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *       onSuccess: ({ helpers }) => {
 *         // Invalidate query on success
 *         helpers.invalidateQueries(['todoList']);
 *       },
 *     }),
 *   }))
 * );
 *
 * const todos = injectTodosCraft();
 * todos.mutateAddTodo('Buy milk'); // Mutation
 * // -> todoList query auto-refreshes after mutation succeeds
 * ```
 *
 * @example
 * Query params for URL synchronization
 * ```ts
 * const { injectSearchCraft, setSearchQueryParams } = craft(
 *   { name: 'search', providedIn: 'root' },
 *   craftQueryParam('search', () =>
 *     queryParam({
 *       state: {
 *         query: {
 *           fallbackValue: '',
 *           parse: (value) => value,
 *           serialize: (value) => value,
 *         },
 *         page: {
 *           fallbackValue: 1,
 *           parse: (value) => parseInt(value, 10),
 *           serialize: (value) => String(value),
 *         },
 *       },
 *     })
 *   ),
 *   craftQuery('results', ({ searchQuery, searchPage }) =>
 *     query({
 *       params: linkedSignal(() => ({
 *         q: searchQuery(),
 *         page: searchPage(),
 *       })),
 *       loader: async ({ params }) => {
 *         const response = await fetch(
 *           `/api/search?q=${params.q}&page=${params.page}`
 *         );
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const search = injectSearchCraft();
 *
 * // Change query params (syncs to URL)
 * setSearchQueryParams({ query: 'angular', page: 2 });
 * // -> URL updates to ?query=angular&page=2
 * // -> results query auto-refreshes with new params
 * ```
 *
 * @example
 * Async methods for side effects
 * ```ts
 * const { injectNotificationsCraft } = craft(
 *   { name: 'notifications', providedIn: 'root' },
 *   craftState('messages', () =>
 *     state(
 *       [] as string[],
 *       ({ state, set }) => ({
 *         addMessage: (msg: string) => set([...state(), msg]),
 *         clear: () => set([]),
 *       })
 *     )
 *   ),
 *   craftAsyncMethods(() => ({
 *     showNotification: asyncMethod({
 *       method: (message: string, duration: number) => ({ message, duration }),
 *       loader: async ({ params, helpers }) => {
 *         helpers.methods.messagesAddMessage(params.message);
 *         await new Promise((resolve) => setTimeout(resolve, params.duration));
 *         // Auto-remove after duration
 *         const current = helpers.props.messages();
 *         helpers.methods.messagesClear();
 *         return 'done';
 *       },
 *     }),
 *   }))
 * );
 *
 * const notifications = injectNotificationsCraft();
 * notifications.showNotificationExecute('Hello!', 3000);
 * // Message appears, then disappears after 3 seconds
 * ```
 *
 * @example
 * Contract enforcement for type safety
 * ```ts
 * type CounterContract = {
 *   count: Signal<number>;
 *   increment: () => void;
 *   decrement: () => void;
 * };
 *
 * // This store satisfies the contract
 * const { injectCounterCraft } = craft(
 *   {
 *     name: 'counter',
 *     providedIn: 'root',
 *     implements: contract<CounterContract>(),
 *   },
 *   craftState('count', () =>
 *     state(
 *       0,
 *       ({ state, set }) => ({
 *         increment: () => set(state() + 1),
 *         decrement: () => set(state() - 1),
 *       })
 *     )
 *   )
 * );
 *
 * // This would cause a type error (missing decrement)
 * const { injectBadCounterCraft } = craft(
 *   {
 *     name: 'badCounter',
 *     providedIn: 'root',
 *     implements: contract<CounterContract>(), // Error!
 *   },
 *   craftState('count', () =>
 *     state(
 *       0,
 *       ({ state, set }) => ({
 *         increment: () => set(state() + 1),
 *         // Missing decrement!
 *       })
 *     )
 *   )
 * );
 * ```
 *
 * @example
 * Error detection for invalid composition
 * ```ts
 * const { craftLogger } = craft(
 *   { name: 'logger', providedIn: 'root' },
 *   craftState('logs', () =>
 *     state(
 *       [] as string[],
 *       ({ set }) => ({
 *         clear: () => set([]),
 *       })
 *     )
 *   )
 * );
 *
 * const { injectAppCraft } = craft(
 *   { name: 'app', providedIn: 'root' },
 *   craftLogger(() => ({
 *     methods: {
 *       logsClear: signal<void>(), // OK
 *       logsInvalidMethod: signal<void>(), // Type error!
 *       // errorMethodMsg: "Error: You are trying to add methods that are not
 *       // defined in the connected store (logger): logsInvalidMethod"
 *     },
 *     inputs: {
 *       nonExistentInput: signal(5), // Type error!
 *       // errorInputsMsg: "Error: You are trying to add inputs that are not
 *       // defined in the connected store (logger): nonExistentInput"
 *     },
 *   }))
 * );
 * ```
 *
 * @example
 * Complex multi-store composition
 * ```ts
 * // Shared auth store
 * const { craftAuth } = craft(
 *   { name: 'auth', providedIn: 'root' },
 *   craftState('user', () =>
 *     state({ id: null, role: 'guest' }, ({ set }) => ({
 *       login: (user: { id: number; role: string }) => set(user),
 *       logout: () => set({ id: null, role: 'guest' }),
 *     }))
 *   )
 * );
 *
 * // Pagination feature
 * const { craftPagination } = craft(
 *   { name: 'pagination', providedIn: 'feature' },
 *   craftInputs({ pageSize: undefined as number | undefined }),
 *   craftState('page', ({ pageSize }) =>
 *     state({ current: 1, size: pageSize() ?? 10 }, ({ state, set }) => ({
 *       next: () => set({ ...state(), current: state().current + 1 }),
 *       prev: () => set({ ...state(), current: state().current - 1 }),
 *     }))
 *   )
 * );
 *
 * // Admin panel combines both
 * const { injectAdminPanelCraft } = craft(
 *   { name: 'adminPanel', providedIn: 'root' },
 *   craftAuth(), // Shared auth
 *   craftPagination(({ user }) => ({
 *     // Feature pagination with dynamic pageSize based on role
 *     inputs: {
 *       pageSize: linkedSignal(() => (user().role === 'admin' ? 100 : 20)),
 *     },
 *   })),
 *   craftQuery('adminData', ({ user, page }) =>
 *     query({
 *       params: linkedSignal(() => ({
 *         userId: user().id,
 *         page: page().current,
 *       })),
 *       loader: async ({ params }) => {
 *         // Fetch data...
 *       },
 *     })
 *   )
 * );
 *
 * const admin = injectAdminPanelCraft();
 * admin.userLogin({ id: 1, role: 'admin' });
 * admin.page().size; // 100 (admin gets larger page size)
 * admin.pageNext();
 * // -> adminData query refreshes automatically
 * ```
 */
export function craft<
  outputs1 extends ContextConstraints,
  outputs2 extends ContextConstraints,
  outputs3 extends ContextConstraints,
  outputs4 extends ContextConstraints,
  standaloneOutputs1 extends StandaloneOutputsConstraints,
  standaloneOutputs2 extends StandaloneOutputsConstraints,
  standaloneOutputs3 extends StandaloneOutputsConstraints,
  standaloneOutputs4 extends StandaloneOutputsConstraints,
  const ProvidedIn extends ProvidedInOption,
  const Name extends string,
  ToImplementContract,
>(
  options: {
    providedIn: ProvidedIn;
    name: Name;
    implements?: ToImplementContract;
  },
  factory1: CraftFactory<
    [_EmptyContext],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs1,
    standaloneOutputs1
  >,
  factory2: CraftFactory<
    [outputs1],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs2,
    standaloneOutputs2
  >,
  factory3: CraftFactory<
    [outputs1, outputs2],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs3,
    standaloneOutputs3
  >,
  factory4: CraftFactory<
    [outputs1, outputs2, outputs3],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs4,
    standaloneOutputs4
  >,
): ToCraftOutputs<
  [outputs1, outputs2, outputs3, outputs4],
  [
    standaloneOutputs1,
    standaloneOutputs2,
    standaloneOutputs3,
    standaloneOutputs4,
  ],
  {
    providedIn: NoInfer<ProvidedIn>;
    name: NoInfer<Name>;
    implements?: ToImplementContract;
  }
>;
export function craft<
  outputs1 extends ContextConstraints,
  outputs2 extends ContextConstraints,
  outputs3 extends ContextConstraints,
  standaloneOutputs1 extends StandaloneOutputsConstraints,
  standaloneOutputs2 extends StandaloneOutputsConstraints,
  standaloneOutputs3 extends StandaloneOutputsConstraints,
  const Name extends string,
  const ProvidedIn extends ProvidedInOption,
  ToImplementContract,
>(
  options: {
    providedIn: ProvidedIn;
    name: Name;
    implements?: ToImplementContract;
  },
  factory1: CraftFactory<
    [_EmptyContext],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs1,
    standaloneOutputs1
  >,
  factory2: CraftFactory<
    [outputs1],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs2,
    standaloneOutputs2
  >,
  factory3: CraftFactory<
    [outputs1, outputs2],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs3,
    standaloneOutputs3
  >,
): ToCraftOutputs<
  [outputs1, outputs2, outputs3],
  [standaloneOutputs1, standaloneOutputs2, standaloneOutputs3],
  {
    providedIn: NoInfer<ProvidedIn>;
    name: NoInfer<Name>;
    implements?: ToImplementContract;
  }
>;
export function craft<
  outputs1 extends ContextConstraints,
  outputs2 extends ContextConstraints,
  standaloneOutputs1 extends StandaloneOutputsConstraints,
  standaloneOutputs2 extends StandaloneOutputsConstraints,
  const ProvidedIn extends ProvidedInOption,
  const Name extends string,
  ToImplementContract,
>(
  options: {
    providedIn: ProvidedIn;
    name: Name;
    implements?: ToImplementContract;
  },
  factory1: CraftFactory<
    [_EmptyContext],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs1,
    standaloneOutputs1
  >,
  factory2: CraftFactory<
    [outputs1],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs2,
    standaloneOutputs2
  >,
): ToCraftOutputs<
  [outputs1, outputs2],
  [standaloneOutputs1, standaloneOutputs2],
  {
    providedIn: NoInfer<ProvidedIn>;
    name: NoInfer<Name>;
    implements?: ToImplementContract;
  }
>;
export function craft<
  outputs1 extends ContextConstraints,
  standaloneOutputs1 extends StandaloneOutputsConstraints,
  const ProvidedIn extends ProvidedInOption,
  const Name extends string,
  ToImplementContract,
>(
  options: {
    providedIn: ProvidedIn;
    name: Name;
    implements?: ToImplementContract;
  },
  factory1: CraftFactory<
    [_EmptyContext],
    {
      providedIn: NoInfer<ProvidedIn>;
      name: NoInfer<Name>;
    },
    outputs1,
    standaloneOutputs1
  >,
): ToCraftOutputs<
  [outputs1],
  [standaloneOutputs1],
  {
    providedIn: NoInfer<ProvidedIn>;
    name: NoInfer<Name>;
    implements?: ToImplementContract;
  }
>;
export function craft(
  options: StoreConfigConstraints,
  ...factoriesList: CraftFactory<
    [_EmptyContext],
    {
      providedIn: ProvidedInOption;
      name: string;
    },
    ContextConstraints,
    {}
  >[]
): ToCraftOutputs<
  _EmptyContext[],
  EmptyStandaloneContext[],
  {
    name: string;
    providedIn: ProvidedInOption;
    implements?: unknown;
  }
> {
  const providedIn =
    options.providedIn && ['scoped', 'feature'].includes(options.providedIn)
      ? null
      : 'root';
  const storeConfig: StoreConfigConstraints = {
    providedIn: options?.providedIn,
    name: options?.name,
    implements: options?.implements,
  };

  const _cloudProxy = new Proxy({}, {});

  const extractedStandaloneOutputs = factoriesList.reduce(
    (acc, factoryWithStandalone, index) => {
      const r = factoryWithStandalone(_cloudProxy, storeConfig) ?? {};
      acc = {
        ...acc,
        ...r,
      };
      return acc;
    },
    {} as Record<string, unknown>,
  );

  // _cloudProxy will now have all the standalone outputs assigned to it
  Object.assign(_cloudProxy, extractedStandaloneOutputs);

  // used to share context, when providedIn is not root and also used with 'inject' and with 'using'
  let sharedContext: ContextConstraints | undefined = undefined;
  const pluggableInputs = createSignalProxy(signal({}));
  let inputsKeysSet: Set<string> | undefined = undefined;
  const token = new InjectionToken('CraftStore', {
    providedIn,
    factory: () => {
      const injector = inject(Injector);
      const { propsAndMethods, context } = mergeContextAndProps({
        factoriesList,
        pluggableInputs,
        injector,
        storeConfig,
        _cloudProxy,
      });
      inputsKeysSet = new Set(
        Object.keys((context as ContextConstraints)._inputs),
      );
      sharedContext = context;

      return propsAndMethods;
    },
  });
  const name = options?.name ?? '';
  const capitalizedName = name
    ? name.charAt(0).toUpperCase() + name.slice(1)
    : '';
  const injectNameCraft = `inject${capitalizedName}Craft`;
  const craftNameCraft = `craft${capitalizedName}`;

  const injectCraft = () => injectNameCraft;

  return {
    [injectNameCraft]: (entries?: {
      inputs?: Record<string, unknown>;
      methods?: Record<string, unknown>;
      implements?: unknown;
    }) => {
      assertInInjectionContext(injectCraft);
      const tokenValue = inject(token); // inject will enable to set inputsKeysSet
      const entriesInputs = entries?.inputs;
      if (entriesInputs) {
        let hasInputs = false;
        const inputs = Array.from(inputsKeysSet ?? []).reduce(
          (acc, inputKey) => {
            if (inputKey in entriesInputs) {
              hasInputs = true;
              const value = (entriesInputs as any)[inputKey];
              if (value !== EXTERNALLY_PROVIDED) {
                acc[inputKey] = (entries as any)['inputs'][inputKey];
              }
              return acc;
            }
            return acc;
          },
          {} as Record<string, unknown>,
        );
        if (hasInputs) {
          pluggableInputs.$patch(inputs as ContextConstraints['_inputs']);
        }
      }

      // for each methods associated to a source, trigger the targeted method when the source change
      const entriesMethods = entries?.methods;
      if (entriesMethods) {
        Object.entries(entriesMethods).forEach(([methodName, source]) => {
          effect(() => {
            const newValue = (source as Function)();
            untracked(() => {
              if (newValue !== undefined) {
                (tokenValue as any)[methodName](newValue);
              }
            });
          });
        });
      }

      return tokenValue;
    },
    [craftNameCraft]: (
      pluggableConfig?: (context: ContextConstraints) => {
        inputs?: Record<string, unknown>;
        methods?: Record<string, Function>;
      },
    ) => {
      return (
          hostCloud: CloudProxy<Record<string, unknown>>,
          storeConfig: StoreConfigConstraints,
        ) =>
        (
          contextData: ContextInput<ContextConstraints>,
          injector: Injector,
          storeConfig: StoreConfigConstraints,
          _cloudProxy: CloudProxy<Record<string, unknown>>,
        ) => {
          const entries =
            pluggableConfig?.({
              ...contextData.context._inputs,
              ...contextData.context._injections,
              ...contextData.context._sources,
              ...contextData.context.props,
            } as any) ?? {};
          const entriesInputs = entries?.inputs;

          let storeContext: ContextConstraints | undefined = undefined;

          if (options?.providedIn !== 'root') {
            const { context } = mergeContextAndProps({
              factoriesList,
              pluggableInputs,
              injector,
              storeConfig,
              _cloudProxy,
            });
            storeContext = context;
          } else {
            const _getOrGenerateStore = inject(token);
            storeContext = sharedContext;
          }

          inputsKeysSet = new Set(
            Object.keys((storeContext as ContextConstraints)._inputs),
          );
          if (entriesInputs) {
            let hasInputs = false;
            const inputs = Array.from(inputsKeysSet ?? []).reduce(
              (acc, inputKey) => {
                if (inputKey in entriesInputs) {
                  hasInputs = true;
                  const value = (entriesInputs as any)[inputKey];
                  if (value !== EXTERNALLY_PROVIDED) {
                    acc[inputKey] = (entriesInputs as any)[inputKey];
                  }
                  return acc;
                }
                return acc;
              },
              {} as Record<string, unknown>,
            );
            if (hasInputs) {
              pluggableInputs.$patch(inputs as ContextConstraints['_inputs']);
            }
          }

          Object.assign(hostCloud, _cloudProxy);

          // todo if provided global use the injected one, otherwise trigger manuually
          return Object.assign(
            storeContext as ContextConstraints,
            extractedStandaloneOutputs,
          );
        };
    },
    [`${capitalizedName}Craft`]: token,
    ...extractedStandaloneOutputs,
  } as ToCraftOutputs<
    _EmptyContext[],
    EmptyStandaloneContext[],
    {
      name: string;
      providedIn: ProvidedInOption;
    }
  >;
}

function mergeContextAndProps({
  factoriesList,
  pluggableInputs,
  injector,
  storeConfig,
  _cloudProxy,
}: {
  factoriesList: CraftFactory<
    [ContextConstraints],
    StoreConfigConstraints,
    any,
    any
  >[];
  pluggableInputs: SignalProxy<{}, true>;
  injector: Injector;
  storeConfig: StoreConfigConstraints;
  _cloudProxy: CloudProxy<Record<string, unknown>>;
}): { propsAndMethods: any; context: any } {
  return factoriesList.reduce(
    (acc, factory) => {
      const result = (
        factory as CraftFactory<
          [ContextConstraints],
          StoreConfigConstraints,
          ContextConstraints,
          StandaloneOutputsConstraints
        >
      )(_cloudProxy, storeConfig)(
        {
          context: { ...acc.context, _inputs: pluggableInputs },
        },
        injector,
        storeConfig,
        _cloudProxy,
      );
      Object.entries(result._inputs).forEach(([key, value]) => {
        const hasValue = pluggableInputs.$ref(key as never);
        if (!hasValue) {
          pluggableInputs.$patch({ [key]: value } as any);
        }
      });

      Object.assign(_cloudProxy, result._cloudProxy);
      return {
        context: {
          _inputs: { ...acc.context._inputs, ...result._inputs },
          _injections: {
            ...acc.context._injections,
            ...result._injections,
          },
          props: {
            ...acc.context.props,
            ...result.props,
          },
          methods: {
            ...acc.context.methods,
            ...result.methods,
          },
          _query: {
            ...acc.context._query,
            ...result._query,
          },
          _mutation: {
            ...acc.context._mutation,
            ...result._mutation,
          },
          _queryParams: {
            ...acc.context._queryParams,
            ...result._queryParams,
          },
          _sources: {
            ...acc.context._sources,
            ...result._sources,
          },
          _asyncMethods: {
            ...acc.context._asyncMethods,
            ...result._asyncMethods,
          },
          _cloudProxy: {
            ...acc.context._cloudProxy,
            ...result._cloudProxy,
          },
          _dependencies: {
            ...acc.context._dependencies,
            ...result._dependencies,
          },
          _error: {
            ...acc.context._error,
            ...result._error,
          },
        },
        propsAndMethods: {
          ...acc.propsAndMethods,
          ...result.props,
          ...result.methods,
        },
      };
    },
    {
      context: {
        props: {},
        methods: {},
        _inputs: {}, // passing pluggableInputs here seems to not works
        _queryParams: {},
        _sources: {},
        _injections: {},
        _mutation: {},
        _query: {},
        _asyncMethods: {},
        _cloudProxy: {},
        _dependencies: {},
        _error: {},
      } as _EmptyContext,
      propsAndMethods: {},
    } as {
      context: _EmptyContext;
      propsAndMethods: {};
    },
  );
}
