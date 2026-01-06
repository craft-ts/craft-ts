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
  context: Partial<ContextConstraints>
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
  StandaloneContextOutputs extends {}
> = (
  cloudProxy: CloudProxy<MergeContexts<Context>['_cloudProxy']>,
  storeConfig: StoreConfig
) => (<HostStoreConfig extends StoreConfigConstraints>(
  contextData: ContextInput<MergeContexts<Context>>,
  injector: Injector,
  storeConfig: StoreConfig, // do not use HostStoreConfig
  cloudProxy: MergeContexts<Context>['_cloudProxy']
) => CraftActionOutputs) & {
  standaloneOutputs?: StandaloneContextOutputs;
};

export type CraftFactoryUtility<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  CraftActionOutputs extends ContextConstraints,
  StandaloneOutputs extends {} = {}
> = (
  cloudProxy: CloudProxySource,
  storeConfig: StoreConfig
) => (<HostStoreConfig extends StoreConfigConstraints>(
  contextData: ContextInput<Context>,
  injector: Injector,
  storeConfig: HostStoreConfig,
  cloudProxy: Context['_cloudProxy']
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
  StoreConfig extends StoreConfigConstraints
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
  MethodsConnected
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
          : {}
      ]
    >
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
  MethodsConnected extends MethodsToConnect = MethodsToConnect
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
          : {}
      ]
    >
  >(
    pluggableConfig?: (
      configFactory: CraftFactoryEntries<HostContext>
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
    >
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
  StoreConfig extends StoreConfigConstraints
> = {
  [key in `${Capitalize<StoreConfig['name']>}Craft`]: InjectionToken<
    Prettify<RemoveIndexSignature<Context['props'] & Context['methods']>>
  >;
};

type META_CONTEXT<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints
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
      >
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

type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
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
  ...infer Rest
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
  B extends ContextConstraints
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
  ToImplementContract
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
  >
): ToCraftOutputs<
  [outputs1, outputs2, outputs3, outputs4],
  [
    standaloneOutputs1,
    standaloneOutputs2,
    standaloneOutputs3,
    standaloneOutputs4
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
  ToImplementContract
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
  >
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
  ToImplementContract
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
  >
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
  ToImplementContract
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
  >
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
    (acc, factoryWithStandalone) => {
      acc = {
        ...acc,
        ...(factoryWithStandalone(_cloudProxy, storeConfig) ?? {}),
      };
      return acc;
    },
    {} as Record<string, unknown>
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
        Object.keys((context as ContextConstraints)._inputs)
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
          {} as Record<string, unknown>
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
      }
    ) => {
      return (
          hostCloud: CloudProxy<Record<string, unknown>>,
          storeConfig: StoreConfigConstraints
        ) =>
        (
          contextData: ContextInput<ContextConstraints>,
          injector: Injector,
          storeConfig: StoreConfigConstraints,
          _cloudProxy: CloudProxy<Record<string, unknown>>
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
            Object.keys((storeContext as ContextConstraints)._inputs)
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
              {} as Record<string, unknown>
            );
            if (hasInputs) {
              pluggableInputs.$patch(inputs as ContextConstraints['_inputs']);
            }
          }

          Object.assign(hostCloud, _cloudProxy);

          // todo if provided global use the injected one, otherwise trigger manuually
          return Object.assign(
            storeContext as ContextConstraints,
            extractedStandaloneOutputs
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
        _cloudProxy
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
    }
  );
}
