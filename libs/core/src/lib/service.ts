import {
  assertInInjectionContext,
  inject,
  InjectionToken,
  Injector,
  isSignal,
  Provider,
  Signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';

declare const SERVICE_HELPER_DEPENDENCIES: unique symbol;
declare const SERVICE_YIELD_METADATA: unique symbol;
declare const SERVICE_META_DATA_TYPE: unique symbol;

const SERVICE_EXPOSURE_TOKEN_MARKER = Symbol('service-exposure-token-marker');
const SERVICE_ROOT_EXPOSURE_KEY = '$self' as const;
const SERVICE_RUNTIME_DEFINITION = Symbol('service-runtime-definition');

type Simplify<ObjectType> = {
  [Key in keyof ObjectType]: ObjectType[Key];
} & {};

type DerivedPropertiesTracking<
  Used extends object = {},
  Exposed extends object = {},
> = {
  derivedPropertiesUsed: Simplify<Used>;
  derivedPropertiesExposed: Simplify<Exposed>;
};

export type ServiceDependencies<
  Scope = unknown,
  Dependencies = {},
  MustBeProvided = [],
  Derived = undefined,
> = Simplify<{
  scope: Scope;
  dependencies: Simplify<Dependencies>;
  mustBeProvided: MustBeProvided;
} & (Derived extends undefined ? {} : Derived)>;

type WithTrackedDependencies<
  Helper,
  Metadata,
> = Helper & {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: Metadata;
};

type ExtractTrackedMetadata<Helper> =
  Helper extends {
    readonly [SERVICE_HELPER_DEPENDENCIES]?: infer Metadata;
  }
    ? Metadata
    : never;

export type GetInjectedServiceDependencies<InjectService> =
  ResolveServiceTrackingMetadata<ExtractTrackedMetadata<InjectService>>;

export type GetToYieldServiceDependencies<ToYieldService> =
  ResolveServiceTrackingMetadata<ExtractTrackedMetadata<ToYieldService>>;

export type GetServiceOutput<ServiceHelper> =
  ExtractTrackedMetadata<ServiceHelper> extends ServiceTrackingMetadata<
    any,
    any,
    infer Output,
    any,
    any
  >
    ? Output
    : never;

type ConstantCase<
  Value extends string,
  IsStart extends boolean = true,
> = Value extends `${infer First}${infer Rest}`
  ? First extends Lowercase<First>
    ? `${Uppercase<First>}${ConstantCase<Rest, false>}`
    : First extends `${number}`
      ? `${First}${ConstantCase<Rest, false>}`
      : `${IsStart extends true ? '' : '_'}${First}${ConstantCase<
          Rest,
          false
        >}`
  : '';

type ServiceMetaDataKey<Name extends string> = `${ConstantCase<Name>}_META_DATA`;

type MetaDataTypeInfo<MetaData> = MetaData extends {
  readonly [SERVICE_META_DATA_TYPE]?: infer Info;
}
  ? Info
  : never;

type GetServiceMetaDataInputs<MetaData> = MetaDataTypeInfo<MetaData> extends {
  inputs: infer Inputs extends object;
}
  ? Inputs
  : {};

type GetServiceMetaDataOutput<MetaData> = MetaDataTypeInfo<MetaData> extends {
  output: infer Output;
}
  ? Output
  : never;

type GetServiceMetaDataDependencies<MetaData> =
  MetaDataTypeInfo<MetaData> extends {
    dependencies: infer Dependencies;
  }
    ? Dependencies
    : never;

const ABSTRACT_SERVICE_MARKER = Symbol('abstract-service-marker');
const SERVICE_REQUIREMENT_MARKER = Symbol('service-requirement-marker');
const SERVICE_YIELD_REQUEST_MARKER = Symbol('service-yield-request-marker');
const SERVICE_DEPENDENCY_ACCESS_MARKER = Symbol(
  'service-dependency-access-marker',
);

const PROVIDED_ELSEWHERE =
  'Provided elsewhere #warn-check-docs:inputs' as const;

type ConcreteServiceScope =
  | 'global'
  | 'toProvide'
  | 'manuallyProvidedAtRoot'
  | 'function';

type ServiceScope = ConcreteServiceScope | 'abstract';

type RequirementScope = 'toProvide' | 'manuallyProvidedAtRoot';

type AnyFactory = (...args: any[]) => any;

type ExtractHelperValue<HelperObject> = HelperObject[keyof HelperObject];

export type ServiceMetaData<
  Name extends string = string,
  Scope extends ConcreteServiceScope = ConcreteServiceScope,
  Inputs extends object = {},
  Output = unknown,
  Dependencies = ServiceDependencies,
  InjectHelper = (...args: any[]) => unknown,
> = Simplify<
  {
    readonly kind: 'service-meta-data';
    readonly name: Name;
    readonly scope: Scope;
    readonly inject: InjectHelper;
    readonly [SERVICE_META_DATA_TYPE]?: {
      inputs: Inputs;
      output: Output;
      dependencies: Dependencies;
    };
  } & (Scope extends 'toProvide' | 'manuallyProvidedAtRoot'
    ? { readonly provide: () => Provider }
    : {}) &
    (Scope extends 'manuallyProvidedAtRoot'
      ? { readonly token: InjectionToken<Output> }
      : {})
>;

type AnyServiceMetaData = ServiceMetaData<
  string,
  ConcreteServiceScope,
  any,
  any,
  any,
  any
>;

type InternalServiceMetaData = AnyServiceMetaData & {
  readonly [SERVICE_RUNTIME_DEFINITION]: ConcreteRuntimeDefinition;
};

type UnionToIntersection<Union> = (
  Union extends any ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

type GetUnionLast<Union> =
  UnionToIntersection<
    Union extends any ? () => Union : never
  > extends () => infer Last
    ? Last
    : never;

type UnionToTuple<Union, Tuple extends unknown[] = []> = [Union] extends [never]
  ? Tuple
  : UnionToTuple<
      Exclude<Union, GetUnionLast<Union>>,
      [GetUnionLast<Union>, ...Tuple]
    >;

type FactoryInputs<Factory> = Factory extends (...args: infer Args) => any
  ? Args extends []
    ? {}
    : Args[0] extends object
      ? Args[0]
      : {}
  : never;

type FactoryReturn<Factory> = Factory extends (...args: any[]) => infer Result
  ? Result
  : never;

type FactoryOutput<Factory> =
  FactoryReturn<Factory> extends Generator<any, infer Result, any>
    ? Result
    : FactoryReturn<Factory>;

type FactoryYields<Factory> =
  FactoryReturn<Factory> extends Generator<infer Yielded, any, any>
    ? Yielded
    : never;

type YieldedServiceScope<Yielded> =
  Yielded extends ServiceYieldRequest<infer Scope, any, any> ? Scope : never;

type ValidateFactoryScope<
  Scope extends ConcreteServiceScope,
  Factory extends AnyFactory,
> = ValidateYieldedScope<Scope, FactoryYields<Factory>, unknown>;

type ValidateRequirementFactory<
  Factory extends AnyFactory,
  Requirement extends ServiceRequirement<any, any>,
> =
  FactoryOutput<Factory> extends RequirementContract<Requirement>
    ? unknown
    : never;

type ValidateYieldedScope<
  Scope extends ConcreteServiceScope,
  Yielded,
  Value,
> = Scope extends 'global'
  ? Extract<YieldedServiceScope<Yielded>, 'toProvide'> extends never
    ? Value
    : never
  : Value;

type OptionalKeys<ObjectType extends object> = {
  [Key in keyof ObjectType]-?: {} extends Pick<ObjectType, Key> ? Key : never;
}[keyof ObjectType];

type RequiredKeys<ObjectType extends object> = Exclude<
  keyof ObjectType,
  OptionalKeys<ObjectType>
>;

type MissingInputKeys<Inputs extends object, Config> = Exclude<
  RequiredKeys<Inputs>,
  keyof NonNullable<Config>
>;

type MissingInputsMessage<Inputs extends object, Config> = [
  MissingInputKeys<Inputs, Config>,
] extends [never]
  ? never
  : `Inputs Error, ${MissingInputKeys<Inputs, Config> & string} is not provided`;

type MaybeErrorOutput<Inputs extends object, Config, Output> =
  MissingInputsMessage<Inputs, Config> extends never
    ? Output
    : MissingInputsMessage<Inputs, Config>;

type InputBindings<
  Inputs extends object,
  Scope extends ConcreteServiceScope,
> = keyof Inputs extends never
  ? {}
  : {
      [Key in keyof Inputs]: Inputs[Key] | AllowedProvidedElsewhere<Scope>;
    };

type AllowedProvidedElsewhere<Scope extends ConcreteServiceScope> =
  Scope extends 'global' | 'toProvide' | 'manuallyProvidedAtRoot'
    ? typeof PROVIDED_ELSEWHERE
    : never;

type SelectableOutput<Inputs extends object, Config, Output> =
  MaybeErrorOutput<Inputs, Config, Output> extends infer Result
    ? Result extends object
      ? Result
      : never
    : never;

type CallableShell<Value> = Value extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : never;

type RootExposureKey = typeof SERVICE_ROOT_EXPOSURE_KEY;

type PublicExposedOutput<Exposed> = Exposed extends object
  ? Omit<Exposed, RootExposureKey>
  : Exposed;

type ExposedOutput<Output, Exposed> = Output extends (...args: any[]) => any
  ? RootExposureKey extends keyof Exposed
    ? CallableShell<Output> & PublicExposedOutput<Exposed>
    : PublicExposedOutput<Exposed>
  : PublicExposedOutput<Exposed>;

type OutputDependencyKeys<Output extends object> = Extract<
  keyof Output,
  string
>;

type ExposureTokenMetadata<Key extends string = string, Value = unknown> = {
  key: Key;
  value: Value;
};

type DependencyToken<Key extends string, Value> = {
  (): Generator<ServiceDependencyAccessRequest<Key, Value>, Value, unknown>;
  readonly [SERVICE_EXPOSURE_TOKEN_MARKER]: ExposureTokenMetadata<Key, Value>;
};

type PropertyExposureTokens<Output extends object> = {
  [Key in OutputDependencyKeys<Output>]: DependencyToken<Key, Output[Key]>;
};

type CallableExposureRootToken<Output extends (...args: any[]) => any> = {
  /**
   * Root callable token for the exposed service.
   *
   * `yield* $self()` gives access to the original callable service without
   * exposing it publicly.
   *
   * Returning `$self` from the exposure object re-attaches that callable to
   * the root of the final exposed value.
   *
   * Example:
   * `return { $self, incrementCounter: increment }`
   *
   * The final result stays callable via `myRef()`, but never exposes a public
   * `myRef.$self` property.
   */
  $self: DependencyToken<RootExposureKey, Output>;
};

type ExposureTokens<Output extends object> = PropertyExposureTokens<Output> &
  (Output extends (...args: any[]) => any
    ? CallableExposureRootToken<Output>
    : {});

type ExposureTokenKeys<Output extends object> = Extract<
  keyof ExposureTokens<Output>,
  string
>;

type ExposureTokenValue<
  Output extends object,
  Key extends ExposureTokenKeys<Output>,
> = Key extends OutputDependencyKeys<Output>
  ? Output[Key]
  : Key extends RootExposureKey
    ? Output
    : never;

type TokenSourceKey<Value> =
  Value extends {
    readonly [SERVICE_EXPOSURE_TOKEN_MARKER]: ExposureTokenMetadata<
      infer Key,
      any
    >;
  }
    ? Key
    : never;

type TokenResolvedValue<Value> =
  Value extends {
    readonly [SERVICE_EXPOSURE_TOKEN_MARKER]: ExposureTokenMetadata<
      any,
      infer Resolved
    >;
  }
    ? Resolved
    : never;

type MaterializeExposureValue<Value> = [TokenResolvedValue<Value>] extends [
  never,
]
  ? Value
  : TokenResolvedValue<Value>;

type MaterializeExposureResult<Value> = Value extends object
  ? {
      [Key in keyof Value]: MaterializeExposureValue<Value[Key]>;
    }
  : MaterializeExposureValue<Value>;

type ServiceDependencyAccessRequest<Key extends string, Result> = Readonly<{
  [SERVICE_DEPENDENCY_ACCESS_MARKER]: true;
  key: Key;
  resolve: () => Result;
}>;

type ExposureYield<Output extends object> = {
  [Key in ExposureTokenKeys<Output>]: ServiceDependencyAccessRequest<
    Key,
    ExposureTokenValue<Output, Key>
  >;
}[ExposureTokenKeys<Output>];

type InvalidRootExposureAliases<Exposed extends object> = Extract<
  {
    [Key in keyof Exposed]-?: TokenSourceKey<Exposed[Key]> extends RootExposureKey
      ? Key extends RootExposureKey
        ? never
        : Key & string
      : never;
  }[keyof Exposed],
  string
>;

type ValidateRootExposure<Exposed extends object> = [
  InvalidRootExposureAliases<Exposed>,
] extends [never]
  ? Exposed
  : never;

type ExposureSelector<
  Output extends object,
  Exposed extends object,
  Yielded = never,
> = (
  dependencies: ExposureTokens<Output>,
) => ValidateRootExposure<Exposed> | Generator<
  Yielded,
  ValidateRootExposure<Exposed>,
  unknown
>;

type MergeObjectUnion<Union> = [Union] extends [never]
  ? {}
  : Simplify<UnionToIntersection<Union>>;

type ExposureSourceRecord<Value> = [TokenSourceKey<Value>] extends [never]
  ? never
  : {
      [Key in TokenSourceKey<Value>]: MaterializeExposureValue<Value>;
    };

type ExposureAliasRecord<Key extends PropertyKey, Value> =
  [TokenSourceKey<Value>] extends [never]
    ? never
    : Key extends string
      ? { [Property in Key]: MaterializeExposureValue<Value> }
      : never;

type DirectlyUsedProperties<Exposed extends object> = MergeObjectUnion<
  {
    [Key in keyof Exposed]-?: ExposureSourceRecord<Exposed[Key]>;
  }[keyof Exposed]
>;

type DirectlyExposedProperties<Exposed extends object> = MergeObjectUnion<
  {
    [Key in keyof Exposed]-?: ExposureAliasRecord<Key, Exposed[Key]>;
  }[keyof Exposed]
>;

type YieldedUsedProperties<Yielded> = MergeObjectUnion<
  Yielded extends ServiceDependencyAccessRequest<
    infer Key extends string,
    infer Result
  >
    ? { [Property in Key]: Result }
    : never
>;

type DerivedPropertiesForExposure<
  Exposed extends object,
  Yielded,
> = DerivedPropertiesTracking<
  DirectlyUsedProperties<Exposed> & YieldedUsedProperties<Yielded>,
  DirectlyExposedProperties<Exposed>
>;

type ServiceTrackingMetadata<
  Name extends string = string,
  Scope extends ConcreteServiceScope = ConcreteServiceScope,
  Output = unknown,
  Yielded = unknown,
  Derived = undefined,
> = {
  name: Name;
  scope: Scope;
  output: Output;
  yielded: Yielded;
  derived: Derived;
};

type AnyServiceTrackingMetadata = ServiceTrackingMetadata<
  string,
  ConcreteServiceScope,
  unknown,
  unknown,
  any
>;

type DependencyRequests<Yielded> = UnionToTuple<
  Extract<Yielded, ServiceYieldRequest<any, any, any>>
>;

type DependencyMetadata<Request> =
  Request extends ServiceYieldRequest<any, any, infer Metadata> ? Metadata : never;

type DependencyName<Request> = DependencyMetadata<Request> extends ServiceTrackingMetadata<
  infer Name,
  any,
  any,
  any,
  any
>
  ? Name
  : never;

type DependencyDefinition<Request> =
  ResolveServiceTrackingMetadata<DependencyMetadata<Request>>;

type ProvidedServiceEntry<Name extends string, Output> = {
  [Key in Name]: Output;
};

type ProvidedServiceEntryName<Entry> = Extract<keyof Entry, string>;

type ProvidedServiceNames<Entries extends object[]> = [Entries[number]] extends [
  never,
]
  ? never
  : ProvidedServiceEntryName<Entries[number]>;

type AppendUniqueProvidedService<
  Accumulator extends object[],
  Entry extends object,
> = ProvidedServiceEntryName<Entry> extends ProvidedServiceNames<Accumulator>
  ? Accumulator
  : [...Accumulator, Entry];

type MergeMustBeProvided<
  Values extends object[],
  Accumulator extends object[] = [],
> = Values extends [
  infer First extends object,
  ...infer Rest extends object[],
]
  ? MergeMustBeProvided<Rest, AppendUniqueProvidedService<Accumulator, First>>
  : Accumulator;

type FlattenDependencyMustBeProvided<
  Requests extends unknown[],
  Accumulator extends object[] = [],
> = Requests extends [infer First, ...infer Rest]
  ? FlattenDependencyMustBeProvided<
      Rest,
      [...Accumulator, ...Extract<DependencyMustBeProvided<First>, object[]>]
    >
  : Accumulator;

type InitialMustBeProvided<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Output,
> = Scope extends 'toProvide' | 'manuallyProvidedAtRoot'
  ? [ProvidedServiceEntry<Name, Output>]
  : [];

type ResolveMustBeProvided<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Output,
  Requests extends unknown[],
> = MergeMustBeProvided<
  FlattenDependencyMustBeProvided<
    Requests,
    InitialMustBeProvided<Name, Scope, Output>
  >
>;

type ResolveServiceMustBeProvided<Metadata> =
  Metadata extends ServiceTrackingMetadata<
    infer Name extends string,
    infer Scope extends ConcreteServiceScope,
    infer Output,
    infer Yielded,
    any
  >
    ? ResolveMustBeProvided<Name, Scope, Output, DependencyRequests<Yielded>>
    : [];

type DependencyMustBeProvided<Request> = ResolveServiceMustBeProvided<
  DependencyMetadata<Request>
>;

type DependencyRecord<Request> =
  DependencyMetadata<Request> extends ServiceTrackingMetadata<
    infer Name extends string,
    any,
    any,
    any,
    any
  >
    ? { [Key in Name]: DependencyDefinition<Request> }
    : {};

type ResolveServiceTrackingMetadata<Metadata> =
  Metadata extends ServiceTrackingMetadata<
    infer Name extends string,
    infer Scope extends ConcreteServiceScope,
    infer Output,
    infer Yielded,
    infer Derived
  >
    ? ServiceDependencies<
        Scope,
        BuildDependencyMap<DependencyRequests<Yielded>>,
        ResolveServiceMustBeProvided<Metadata>,
        Derived
      >
    : never;

type BuildDependencyMap<
  Requests extends unknown[],
  Accumulator extends object = {},
> = Requests extends [infer First, ...infer Rest]
  ? BuildDependencyMap<
      Rest,
      Simplify<Accumulator & DependencyRecord<First>>
    >
  : Simplify<Accumulator>;

type ServiceHelperMetadata<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Factory extends AnyFactory,
> = ServiceTrackingMetadata<
  Name,
  Scope,
  FactoryOutput<Factory>,
  FactoryYields<Factory>
>;

type WithDerivedProperties<
  Metadata extends AnyServiceTrackingMetadata,
  Exposed extends object,
  Yielded,
> = Metadata extends ServiceTrackingMetadata<
  infer Name extends string,
  infer Scope extends ConcreteServiceScope,
  infer Output,
  infer ChildYielded,
  any
>
  ? ServiceTrackingMetadata<
      Name,
      Scope,
      Output,
      ChildYielded,
      DerivedPropertiesForExposure<Exposed, Yielded>
    >
  : never;

type ServiceYieldRequest<
  Scope extends ConcreteServiceScope,
  Result,
  Metadata extends AnyServiceTrackingMetadata = AnyServiceTrackingMetadata,
> = Readonly<{
  [SERVICE_YIELD_REQUEST_MARKER]: true;
  readonly [SERVICE_YIELD_METADATA]?: Metadata;
  scope: Scope;
  resolve: (injector: Injector, hostScope: ConcreteServiceScope) => Result;
}>;

type AbstractMarker<Contract> = {
  readonly [ABSTRACT_SERVICE_MARKER]: () => Contract;
};

type RequirementContract<Requirement> =
  Requirement extends ServiceRequirement<infer Contract, any>
    ? Contract
    : never;

export type ServiceRequirement<Contract, Name extends string = string> = {
  readonly [SERVICE_REQUIREMENT_MARKER]: true;
  readonly token: InjectionToken<Contract>;
  readonly name: Name;
};

type InjectHelper<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Inputs extends object,
  Output,
  Metadata,
> = {
  [Key in `inject${Capitalize<Name>}`]: WithTrackedDependencies<
    {
      (): MaybeErrorOutput<Inputs, undefined, Output>;
      <Config extends Partial<InputBindings<Inputs, Scope>>>(
        bindings: Config,
      ): MaybeErrorOutput<Inputs, Config, Output>;
      <
        Exposed extends object,
        Yielded extends ExposureYield<
          SelectableOutput<Inputs, undefined, Output>
        > = never,
      >(
        bindings: undefined,
        expose: ExposureSelector<
          SelectableOutput<Inputs, undefined, Output>,
          Exposed,
          Yielded
        >,
      ): ExposedOutput<
        SelectableOutput<Inputs, undefined, Output>,
        MaterializeExposureResult<ValidateRootExposure<Exposed>>
      >;
      <
        Config extends Partial<InputBindings<Inputs, Scope>>,
        Exposed extends object,
        Yielded extends ExposureYield<
          SelectableOutput<Inputs, Config, Output>
        > = never,
      >(
        bindings: Config,
        expose: ExposureSelector<
          SelectableOutput<Inputs, Config, Output>,
          Exposed,
          Yielded
        >,
      ): ExposedOutput<
        SelectableOutput<Inputs, Config, Output>,
        MaterializeExposureResult<ValidateRootExposure<Exposed>>
      >;
    },
    Metadata
  >;
};

type YieldHelper<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Inputs extends object,
  Output,
  Metadata extends AnyServiceTrackingMetadata,
> = {
  [Key in `${Capitalize<Name>}ToYield`]: WithTrackedDependencies<
    {
      (): Generator<
        ServiceYieldRequest<
          Scope,
          MaybeErrorOutput<Inputs, undefined, Output>,
          Metadata
        >,
        MaybeErrorOutput<Inputs, undefined, Output>,
        unknown
      >;
      <Config extends Partial<InputBindings<Inputs, Scope>>>(
        bindings: Config,
      ): Generator<
        ServiceYieldRequest<
          Scope,
          MaybeErrorOutput<Inputs, Config, Output>,
          Metadata
        >,
        MaybeErrorOutput<Inputs, Config, Output>,
        unknown
      >;
      <
        Exposed extends object,
        Yielded extends ExposureYield<
          SelectableOutput<Inputs, undefined, Output>
        > = never,
      >(
        bindings: undefined,
        expose: ExposureSelector<
          SelectableOutput<Inputs, undefined, Output>,
          Exposed,
          Yielded
        >,
      ): Generator<
        | ServiceYieldRequest<
            Scope,
            SelectableOutput<Inputs, undefined, Output>,
            WithDerivedProperties<Metadata, Exposed, Yielded>
          >
        | ExposureYield<SelectableOutput<Inputs, undefined, Output>>,
        ExposedOutput<
          SelectableOutput<Inputs, undefined, Output>,
          MaterializeExposureResult<ValidateRootExposure<Exposed>>
        >,
        unknown
      >;
      <
        Config extends Partial<InputBindings<Inputs, Scope>>,
        Exposed extends object,
        Yielded extends ExposureYield<
          SelectableOutput<Inputs, Config, Output>
        > = never,
      >(
        bindings: Config,
        expose: ExposureSelector<
          SelectableOutput<Inputs, Config, Output>,
          Exposed,
          Yielded
        >,
      ): Generator<
        | ServiceYieldRequest<
            Scope,
            SelectableOutput<Inputs, Config, Output>,
            WithDerivedProperties<Metadata, Exposed, Yielded>
          >
        | ExposureYield<SelectableOutput<Inputs, Config, Output>>,
        ExposedOutput<
          SelectableOutput<Inputs, Config, Output>,
          MaterializeExposureResult<ValidateRootExposure<Exposed>>
        >,
        unknown
      >;
    },
    Metadata
  >;
};

type ProvideHelper<Name extends string> = {
  [Key in `provide${Capitalize<Name>}`]: () => Provider;
};

type ToProvideTokenHelper<Name extends string, Output> = {
  [Key in `${Capitalize<Name>}ToProvide`]: InjectionToken<Output>;
};

type RequirementHelper<Name extends string, Contract> = {
  [Key in `${Capitalize<Name>}Requirement`]: ServiceRequirement<Contract, Name>;
};

type ServiceMetaDataHelper<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Inputs extends object,
  Output,
  Metadata extends ServiceTrackingMetadata,
> = {
  [Key in ServiceMetaDataKey<Name>]: ServiceMetaData<
    Name,
    Scope,
    Inputs,
    Output,
    ResolveServiceTrackingMetadata<Metadata>,
    ExtractHelperValue<InjectHelper<Name, Scope, Inputs, Output, Metadata>>
  >;
};

type ConcreteServiceApi<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Inputs extends object,
  Output,
  Metadata extends ServiceTrackingMetadata,
> = InjectHelper<Name, Scope, Inputs, Output, Metadata> &
  YieldHelper<Name, Scope, Inputs, Output, Metadata> &
  ServiceMetaDataHelper<Name, Scope, Inputs, Output, Metadata> &
  (Scope extends 'toProvide' | 'manuallyProvidedAtRoot'
    ? ProvideHelper<Name>
    : {}) &
  (Scope extends 'manuallyProvidedAtRoot'
    ? ToProvideTokenHelper<Name, Output>
    : {});

type AbstractServiceApi<Name extends string, Contract> = {
  [Key in `inject${Capitalize<Name>}`]: () => Contract;
} & RequirementHelper<Name, Contract>;

type ConcreteRuntimeDefinition = {
  factory: AnyFactory;
  name: string;
  scope: ConcreteServiceScope;
  token?: InjectionToken<unknown>;
  requirement?: ServiceRequirement<unknown>;
  initialBindings?: Record<string, unknown>;
};

type RealCapableScope = 'toProvide' | 'manuallyProvidedAtRoot';

type DependencyTreeNode = ServiceDependencies<
  ConcreteServiceScope,
  any,
  any,
  any
>;

type DependencyTreeChildren<Node> = Node extends {
  dependencies: infer Dependencies extends object;
}
  ? Dependencies
  : {};

type DependencyTreeScope<Node> = Node extends { scope: infer Scope }
  ? Scope
  : never;

type FlattenDependencyTree<
  Tree extends object,
> = Simplify<
  MergeObjectUnion<
    {
      [Name in Extract<keyof Tree, string>]:
        | { [Key in Name]: Tree[Name] }
        | FlattenDependencyTree<DependencyTreeChildren<Tree[Name]>>;
    }[Extract<keyof Tree, string>]
  >
>;

type MockImplementation<Output> = Simplify<
  (Output extends object
    ? Partial<{
        [Key in Extract<keyof Output, string>]: Output[Key];
      }>
    : {}) &
    (Output extends (...args: any[]) => any
      ? { $self?: CallableShell<Output> }
      : {})
>;

type PublicMockShape<Implementation> = Implementation extends object
  ? Omit<Implementation, RootExposureKey>
  : {};

type MockPublicValue<Output, Implementation> = [Implementation] extends [
  undefined,
]
  ? {}
  : Output extends (...args: any[]) => any
    ? RootExposureKey extends keyof NonNullable<Implementation>
      ? CallableShell<Output> & PublicMockShape<NonNullable<Implementation>>
      : PublicMockShape<NonNullable<Implementation>>
    : PublicMockShape<NonNullable<Implementation>>;

type MockServiceOverride<
  MetaData extends AnyServiceMetaData,
  Implementation = undefined,
> = {
  readonly kind: 'mock';
  readonly meta: MetaData;
  readonly implementation: Implementation;
};

type UseValueServiceOverride<
  MetaData extends AnyServiceMetaData,
  Value = GetServiceMetaDataOutput<MetaData>,
> = {
  readonly kind: 'useValue';
  readonly meta: MetaData;
  readonly value: Value;
};

type RealServiceOverride<MetaData extends AnyServiceMetaData> = {
  readonly kind: 'real';
  readonly meta: MetaData;
};

type AnyServiceOverride =
  | MockServiceOverride<AnyServiceMetaData, any>
  | UseValueServiceOverride<AnyServiceMetaData, any>
  | RealServiceOverride<AnyServiceMetaData>;

type OverrideKind<Override> = Override extends { kind: infer Kind }
  ? Kind
  : never;

type OverrideForDependencyNode<Name extends string, Node> =
  | MockServiceOverride<
      ServiceMetaData<
        Name,
        Extract<DependencyTreeScope<Node>, ConcreteServiceScope>,
        any,
        any,
        Node,
        any
      >,
      any
    >
  | UseValueServiceOverride<
      ServiceMetaData<
        Name,
        Extract<DependencyTreeScope<Node>, ConcreteServiceScope>,
        any,
        any,
        Node,
        any
      >,
      any
    >
  | (DependencyTreeScope<Node> extends RealCapableScope
      ? RealServiceOverride<
          ServiceMetaData<
            Name,
            Extract<DependencyTreeScope<Node>, RealCapableScope>,
            any,
            any,
            Node,
            any
          >
        >
      : never);

type ServiceTestingDependencyTree<MetaData extends AnyServiceMetaData> =
  GetServiceMetaDataDependencies<MetaData> extends {
    dependencies: infer Dependencies extends object;
  }
    ? Dependencies
    : {};

type FlattenedServiceTestingDependencyTree<
  MetaData extends AnyServiceMetaData,
> = FlattenDependencyTree<ServiceTestingDependencyTree<MetaData>>;

type ServiceTestOverrides<MetaData extends AnyServiceMetaData> = Partial<{
  [Name in keyof FlattenedServiceTestingDependencyTree<MetaData> & string]:
    OverrideForDependencyNode<
    Name,
    FlattenedServiceTestingDependencyTree<MetaData>[Name]
  >;
}>;

type MissingCoverageForTree<Tree extends object, Overrides> = {
  [Name in Extract<keyof Tree, string>]: MissingCoverageForNode<
    Name,
    Tree[Name],
    Overrides
  >;
}[Extract<keyof Tree, string>];

type OverrideAtPath<Overrides, Name extends string> = Name extends keyof Overrides
  ? NonNullable<Overrides[Name]>
  : never;

type MissingCoverageForNode<
  Name extends string,
  Node,
  Overrides,
> = [OverrideAtPath<Overrides, Name>] extends [never]
  ? DependencyTreeScope<Node> extends RequirementScope
    ? Name
    : MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
  : OverrideKind<OverrideAtPath<Overrides, Name>> extends 'mock'
    ? never
    : OverrideKind<OverrideAtPath<Overrides, Name>> extends 'real' | 'useValue'
      ? MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
      : DependencyTreeScope<Node> extends RequirementScope
        ? Name
        : MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>;

type AssertServiceTestCoverage<
  MetaData extends AnyServiceMetaData,
  Overrides,
> = [MissingCoverageForTree<
  ServiceTestingDependencyTree<MetaData>,
  Overrides
>] extends [never]
  ? {}
  : {
      ERROR_missing_service_test_overrides: MissingCoverageForTree<
        ServiceTestingDependencyTree<MetaData>,
        Overrides
      >;
    };

type ResolvedMockValue<Override> =
  Override extends MockServiceOverride<infer MetaData, infer Implementation>
    ? MockPublicValue<GetServiceMetaDataOutput<MetaData>, Implementation>
    : Override extends UseValueServiceOverride<any, infer Value>
      ? Value
      : never;

type CreateAngularTestMocks<Overrides> = Simplify<{
  [Name in keyof Overrides as NonNullable<
    Overrides[Name]
  > extends MockServiceOverride<any, any> | UseValueServiceOverride<any, any>
    ? Name
    : never]: ResolvedMockValue<NonNullable<Overrides[Name]>>;
}>;

type ServiceTestBindings<MetaData extends AnyServiceMetaData> = Partial<
  InputBindings<
    GetServiceMetaDataInputs<MetaData>,
    Extract<MetaData['scope'], ConcreteServiceScope>
  >
>;

type RuntimeServiceTestOverride = {
  readonly kind: 'mock' | 'useValue';
  readonly value: unknown;
};

export type MaybeSignal<T> = T | Signal<T>;

const SERVICE_TEST_OVERRIDES = new InjectionToken<
  ReadonlyMap<ConcreteRuntimeDefinition, RuntimeServiceTestOverride>
>('service-test-overrides', {
  factory: () => new Map(),
});

export function toValue<T>(value: MaybeSignal<T>): T {
  return isSignal(value) ? value() : value;
}

export function abstract<Contract>(): AbstractMarker<Contract> {
  return {
    [ABSTRACT_SERVICE_MARKER]: () => undefined as Contract,
  } as AbstractMarker<Contract>;
}

export function mock<
  MetaData extends AnyServiceMetaData,
  Implementation extends
    MockImplementation<GetServiceMetaDataOutput<MetaData>> | undefined = undefined,
>(
  meta: MetaData,
  implementation?: Implementation,
): MockServiceOverride<MetaData, Implementation> {
  return {
    kind: 'mock',
    meta,
    implementation: implementation as Implementation,
  };
}

export function useValue<
  MetaData extends AnyServiceMetaData,
  Value extends GetServiceMetaDataOutput<MetaData>,
>(
  meta: MetaData,
  value: Value,
): UseValueServiceOverride<MetaData, Value> {
  return {
    kind: 'useValue',
    meta,
    value,
  };
}

export function real<
  MetaData extends ServiceMetaData<
    string,
    RealCapableScope,
    any,
    any,
    any,
    any
  >,
>(meta: MetaData): RealServiceOverride<MetaData> {
  return {
    kind: 'real',
    meta,
  };
}

export const provide = real;

export function createAngularTest<
  MetaData extends AnyServiceMetaData,
  const Overrides extends ServiceTestOverrides<MetaData>,
  Bindings extends ServiceTestBindings<MetaData> | undefined = undefined,
>(
  meta: MetaData,
  overrides: Overrides & AssertServiceTestCoverage<MetaData, Overrides>,
  options?: {
    bindings?: Bindings;
    providers?: Provider[];
  },
): {
  sut: MaybeErrorOutput<
    GetServiceMetaDataInputs<MetaData>,
    Bindings,
    GetServiceMetaDataOutput<MetaData>
  >;
  mocks: CreateAngularTestMocks<Overrides>;
} {
  const internalMetaData = meta as InternalServiceMetaData;
  const providers = [...(options?.providers ?? [])];
  const runtimeOverrides = new Map<
    ConcreteRuntimeDefinition,
    RuntimeServiceTestOverride
  >();
  const mocks: Record<string, unknown> = {};

  if (meta.scope === 'toProvide' || meta.scope === 'manuallyProvidedAtRoot') {
    if (!('provide' in meta) || typeof meta.provide !== 'function') {
      throw new Error(
        `Missing provide helper for service "${meta.name}" in createAngularTest.`,
      );
    }

    providers.push(meta.provide());
  }

  for (const [name, override] of Object.entries(overrides)) {
    if (!override) {
      continue;
    }

    const internalOverrideMetaData = override.meta as InternalServiceMetaData;

    if (override.kind === 'real') {
      if (
        !('provide' in override.meta) ||
        typeof override.meta.provide !== 'function'
      ) {
        throw new Error(
          `real(${override.meta.name}) is only supported for toProvide and manuallyProvidedAtRoot services.`,
        );
      }

      providers.push(override.meta.provide());
      continue;
    }

    const publicValue =
      override.kind === 'useValue'
        ? override.value
        : createServiceTestMockValue(override.implementation);

    runtimeOverrides.set(
      internalOverrideMetaData[SERVICE_RUNTIME_DEFINITION],
      {
        kind: override.kind,
        value: publicValue,
      },
    );
    mocks[name] = publicValue;
  }

  providers.push({
    provide: SERVICE_TEST_OVERRIDES,
    useValue: runtimeOverrides,
  });

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers,
  });

  return TestBed.runInInjectionContext(() => ({
    sut:
      options?.bindings === undefined
        ? internalMetaData.inject()
        : internalMetaData.inject(options.bindings),
    mocks,
  })) as {
    sut: MaybeErrorOutput<
      GetServiceMetaDataInputs<MetaData>,
      Bindings,
      GetServiceMetaDataOutput<MetaData>
    >;
    mocks: CreateAngularTestMocks<Overrides>;
  };
}

export function service<Name extends string, Contract>(
  options: { name: Name; scope: 'abstract' },
  marker: AbstractMarker<Contract>,
): AbstractServiceApi<Name, Contract>;
export function service<
  Name extends string,
  Scope extends RequirementScope,
  Requirement extends ServiceRequirement<any, any>,
  Factory extends AnyFactory,
>(
  options: {
    name: Name;
    scope: Scope;
    requirement: Requirement;
  },
  factory: Factory &
    ValidateFactoryScope<Scope, Factory> &
    ValidateRequirementFactory<Factory, Requirement>,
): ConcreteServiceApi<
  Name,
  Scope,
  FactoryInputs<Factory>,
  FactoryOutput<Factory>,
  ServiceHelperMetadata<Name, Scope, Factory>
>;
export function service<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Factory extends AnyFactory,
>(
  options: { name: Name; scope: Scope },
  factory: Factory & ValidateFactoryScope<Scope, Factory>,
): ConcreteServiceApi<
  Name,
  Scope,
  FactoryInputs<Factory>,
  FactoryOutput<Factory>,
  ServiceHelperMetadata<Name, Scope, Factory>
>;
export function service(
  options: {
    name: string;
    scope: ServiceScope;
    requirement?: ServiceRequirement<unknown>;
  },
  factoryOrMarker: AnyFactory | AbstractMarker<unknown>,
): unknown {
  const capitalizedName = capitalize(options.name);
  const injectName = `inject${capitalizedName}`;
  const provideName = `provide${capitalizedName}`;
  const toYieldName = `${capitalizedName}ToYield`;
  const requirementName = `${capitalizedName}Requirement`;
  const toProvideName = `${capitalizedName}ToProvide`;
  const metaDataName = toMetaDataPropertyName(options.name);

  if (options.scope === 'abstract') {
    assertAbstractMarker(factoryOrMarker);
    const token = new InjectionToken(`${capitalizedName}AbstractServiceToken`);
    const requirement: ServiceRequirement<unknown> = {
      [SERVICE_REQUIREMENT_MARKER]: true,
      token,
      name: options.name,
    };

    return {
      [injectName]: () => {
        assertInInjectionContext(abstractInject);
        return inject(token);
      },
      [requirementName]: requirement,
    };
  }

  const concreteFactory = factoryOrMarker as AnyFactory;
  const runtimeDefinition: ConcreteRuntimeDefinition = {
    factory: concreteFactory,
    name: options.name,
    scope: options.scope,
    requirement: options.requirement,
  };

  const token =
    options.scope === 'global'
      ? new InjectionToken(`${capitalizedName}ServiceToken`, {
          providedIn: 'root',
          factory: () =>
            createConcreteServiceInstance(runtimeDefinition, inject(Injector)),
        })
      : options.scope === 'function'
        ? undefined
        : new InjectionToken(
            options.scope === 'manuallyProvidedAtRoot'
              ? `${capitalizedName}ToProvide`
              : `${capitalizedName}ServiceToken`,
          );

  runtimeDefinition.token = token;

  const api: Record<string, unknown> = {
    [injectName]: (
      bindings?: Record<string, unknown>,
      expose?: RuntimeExposureSelector,
    ) => {
      assertInInjectionContext(concreteInject);
      const injector = inject(Injector);
      const serviceValue = resolveConcreteService(
        runtimeDefinition,
        injector,
        bindings,
      );
      return expose
        ? resolveExposedService(
            serviceValue,
            expose,
            injector,
            runtimeDefinition.scope,
          )
        : serviceValue;
    },
    [toYieldName]: function* (
      bindings?: Record<string, unknown>,
      expose?: RuntimeExposureSelector,
    ) {
      const serviceValue = (yield createYieldRequest(
        runtimeDefinition,
        bindings,
      )) as unknown;

      if (!expose) {
        return serviceValue;
      }

      return (yield* exposeServiceValue(serviceValue, expose)) as unknown;
    },
  };

  if (
    options.scope === 'toProvide' ||
    options.scope === 'manuallyProvidedAtRoot'
  ) {
    api[provideName] = () => createProviders(runtimeDefinition);
  }

  if (options.scope === 'manuallyProvidedAtRoot' && token) {
    api[toProvideName] = token;
  }

  api[metaDataName] = createServiceMetaData({
    name: options.name,
    scope: options.scope,
    inject: api[injectName] as (...args: any[]) => unknown,
    provide:
      options.scope === 'toProvide' || options.scope === 'manuallyProvidedAtRoot'
        ? (api[provideName] as (() => Provider) | undefined)
        : undefined,
    token:
      options.scope === 'manuallyProvidedAtRoot'
        ? (token as InjectionToken<unknown>)
        : undefined,
    runtimeDefinition,
  });

  return api;

  function abstractInject() {}
  function concreteInject() {}
}

function createServiceMetaData(config: {
  name: string;
  scope: ConcreteServiceScope;
  inject: (...args: any[]) => unknown;
  provide?: () => Provider;
  token?: InjectionToken<unknown>;
  runtimeDefinition: ConcreteRuntimeDefinition;
}): AnyServiceMetaData {
  const metaData: Record<string, unknown> = {
    kind: 'service-meta-data',
    name: config.name,
    scope: config.scope,
    inject: config.inject,
  };

  if (config.provide) {
    metaData['provide'] = config.provide;
  }

  if (config.token) {
    metaData['token'] = config.token;
  }

  Object.defineProperty(metaData, SERVICE_RUNTIME_DEFINITION, {
    value: config.runtimeDefinition,
    enumerable: false,
    configurable: false,
  });

  return metaData as AnyServiceMetaData;
}

function createServiceTestMockValue(implementation: unknown): unknown {
  return implementation === undefined
    ? {}
    : createExposedServiceValue(implementation);
}

function createProviders(definition: ConcreteRuntimeDefinition): Provider {
  const concreteToken = definition.token;

  if (!concreteToken) {
    throw new Error(
      `service("${definition.name}") cannot create providers for scope "${definition.scope}".`,
    );
  }

  const providers: Provider[] = [
    {
      provide: concreteToken,
      useFactory: () =>
        createConcreteServiceInstance(definition, inject(Injector)),
    },
  ];

  if (definition.requirement) {
    providers.push({
      provide: definition.requirement.token,
      useExisting: concreteToken,
    });
  }

  return providers;
}

function createYieldRequest(
  definition: ConcreteRuntimeDefinition,
  bindings?: Record<string, unknown>,
): ServiceYieldRequest<ConcreteServiceScope, unknown> {
  return {
    [SERVICE_YIELD_REQUEST_MARKER]: true,
    scope: definition.scope,
    resolve: (injector, hostScope) => {
      assertDependencyScope(hostScope, definition.scope, definition.name);
      return resolveConcreteService(definition, injector, bindings);
    },
  };
}

function resolveConcreteService(
  definition: ConcreteRuntimeDefinition,
  injector: Injector,
  bindings?: Record<string, unknown>,
): unknown {
  const serviceOverride = getServiceTestOverride(injector, definition);

  if (serviceOverride) {
    return serviceOverride.value;
  }

  if (definition.scope === 'function') {
    return createConcreteServiceInstance(definition, injector, bindings);
  }

  if (bindings !== undefined && definition.initialBindings === undefined) {
    definition.initialBindings = bindings;
  }

  return injector.get(definition.token!);
}

function getServiceTestOverride(
  injector: Injector,
  definition: ConcreteRuntimeDefinition,
): RuntimeServiceTestOverride | undefined {
  return injector.get(SERVICE_TEST_OVERRIDES).get(definition);
}

function createConcreteServiceInstance(
  definition: ConcreteRuntimeDefinition,
  injector: Injector,
  bindingsOverride?: Record<string, unknown>,
): unknown {
  const bindings = bindingsOverride ?? definition.initialBindings ?? {};
  const inputs = createInputProxy(bindings);
  const result =
    definition.factory.length > 0
      ? definition.factory(inputs)
      : definition.factory();

  return isGenerator(result)
    ? runGeneratorFactory(result, injector, definition.scope)
    : result;
}

function runGeneratorFactory(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  hostScope: ConcreteServiceScope,
): unknown {
  let current = iterator.next();

  while (!current.done) {
    const yielded = current.value;

    if (isServiceYieldRequest(yielded)) {
      const resolved = yielded.resolve(injector, hostScope);
      current = iterator.next(resolved);
      continue;
    }

    if (isServiceDependencyAccessRequest(yielded)) {
      current = iterator.next(yielded.resolve());
      continue;
    }

    throw new Error(
      'service generators can only yield service dependencies or exposed dependency helpers.',
    );
  }

  return current.value;
}

function createInputProxy(
  bindings: Record<string, unknown>,
): Record<string, unknown> {
  return new Proxy<Record<string, unknown>>({} as Record<string, unknown>, {
    get(_target, property) {
      if (typeof property !== 'string') {
        return undefined;
      }

      if (!Object.prototype.hasOwnProperty.call(bindings, property)) {
        throw new Error(`Inputs Error, ${property} is not provided`);
      }

      const value = bindings[property];

      if (value === PROVIDED_ELSEWHERE) {
        throw new Error(`Inputs Error, ${property} is not provided`);
      }

      return value;
    },
  });
}

function resolveExposedService(
  serviceValue: unknown,
  expose: RuntimeExposureSelector,
  injector: Injector,
  hostScope: ConcreteServiceScope,
): unknown {
  const exposure = expose(createExposureTokens(serviceValue));
  const resolvedExposure = isGenerator(exposure)
    ? runGeneratorFactory(exposure, injector, hostScope)
    : exposure;

  return createExposedServiceValue(resolvedExposure);
}

function* exposeServiceValue(
  serviceValue: unknown,
  expose: RuntimeExposureSelector,
): Generator<
  ServiceDependencyAccessRequest<string, unknown>,
  unknown,
  unknown
> {
  const exposure = expose(createExposureTokens(serviceValue));
  const resolvedExposure = isGenerator(exposure)
    ? yield* exposure as Generator<
        ServiceDependencyAccessRequest<string, unknown>,
        unknown,
        unknown
      >
    : exposure;

  return createExposedServiceValue(resolvedExposure);
}

type RuntimeExposureToken = (() => Generator<
  ServiceDependencyAccessRequest<string, unknown>,
  unknown,
  unknown
>) & {
  [SERVICE_EXPOSURE_TOKEN_MARKER]: {
    key: string;
    resolve: () => unknown;
  };
};

function createExposureTokens(
  serviceValue: unknown,
): Record<string, RuntimeExposureToken> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }

        if (
          property === SERVICE_ROOT_EXPOSURE_KEY &&
          typeof serviceValue !== 'function'
        ) {
          return undefined;
        }

        return createExposureToken(serviceValue, property);
      },
    },
  );
}

function createExposureToken(
  serviceValue: unknown,
  key: string,
): RuntimeExposureToken {
  const resolve =
    key === SERVICE_ROOT_EXPOSURE_KEY
      ? () => serviceValue
      : () => Reflect.get(Object(serviceValue), key);
  const token = function* () {
    return (yield createDependencyAccessRequest(key, resolve)) as unknown;
  } as RuntimeExposureToken;

  Object.defineProperty(token, SERVICE_EXPOSURE_TOKEN_MARKER, {
    value: {
      key,
      resolve,
    },
    enumerable: false,
    configurable: false,
  });

  return token;
}

function createDependencyAccessRequest(
  key: string,
  resolve: () => unknown,
): ServiceDependencyAccessRequest<string, unknown> {
  return {
    [SERVICE_DEPENDENCY_ACCESS_MARKER]: true,
    key,
    resolve,
  };
}

type RuntimeCallable = (...args: any[]) => unknown;

type RuntimeMaterializedExposure = {
  value: unknown;
  rootCallable?: RuntimeCallable;
};

function createExposedServiceValue(exposedValue: unknown): unknown {
  const materializedExposure = materializeExposedValue(exposedValue);

  if (!materializedExposure.rootCallable) {
    return materializedExposure.value;
  }

  if (
    !isNonCallableObject(materializedExposure.value) ||
    Reflect.ownKeys(materializedExposure.value).length === 0
  ) {
    return materializedExposure.rootCallable;
  }

  return createCallableExposureProxy(
    materializedExposure.rootCallable,
    materializedExposure.value,
  );
}

function materializeExposedValue(
  exposedValue: unknown,
): RuntimeMaterializedExposure {
  if (isRuntimeExposureToken(exposedValue)) {
    const resolvedValue = exposedValue[SERVICE_EXPOSURE_TOKEN_MARKER].resolve();

    return isRootRuntimeExposureToken(exposedValue) &&
      typeof resolvedValue === 'function'
      ? {
          value: resolvedValue,
          rootCallable: resolvedValue as RuntimeCallable,
        }
      : { value: resolvedValue };
  }

  if (!isNonCallableObject(exposedValue)) {
    return { value: exposedValue };
  }

  const materialized: Record<PropertyKey, unknown> = {};
  let rootCallable: RuntimeCallable | undefined;

  for (const key of Reflect.ownKeys(exposedValue)) {
    const resolvedValue = unwrapDirectExposureToken(
      Reflect.get(exposedValue, key, exposedValue),
    );

    if (
      key === SERVICE_ROOT_EXPOSURE_KEY &&
      typeof resolvedValue === 'function'
    ) {
      rootCallable = resolvedValue as RuntimeCallable;
      continue;
    }

    materialized[key] = resolvedValue;
  }

  if (rootCallable && Reflect.ownKeys(materialized).length === 0) {
    return {
      value: rootCallable,
      rootCallable,
    };
  }

  return {
    value: materialized,
    rootCallable,
  };
}

function unwrapDirectExposureToken(value: unknown): unknown {
  return isRuntimeExposureToken(value)
    ? value[SERVICE_EXPOSURE_TOKEN_MARKER].resolve()
    : value;
}

function createCallableExposureProxy(
  serviceValue: (...args: any[]) => unknown,
  exposedValue: object,
) {
  const exposedKeys = new Set(Reflect.ownKeys(exposedValue));
  const forwardedTargetKeys = new Set<PropertyKey>(
    Reflect.ownKeys(serviceValue).filter(
      (key) =>
        typeof key === 'symbol' ||
        Reflect.getOwnPropertyDescriptor(serviceValue, key)?.configurable ===
          false,
    ),
  );

  return new Proxy(serviceValue, {
    get(target, property, receiver) {
      if (exposedKeys.has(property)) {
        return Reflect.get(exposedValue, property, exposedValue);
      }

      if (
        forwardedTargetKeys.has(property) ||
        (typeof property === 'string' && property in Function.prototype)
      ) {
        return Reflect.get(target, property, receiver);
      }

      return undefined;
    },
    has(_target, property) {
      return (
        exposedKeys.has(property) ||
        forwardedTargetKeys.has(property) ||
        (typeof property === 'string' && property in Function.prototype)
      );
    },
    ownKeys() {
      return Array.from(
        new Set([
          ...Array.from(forwardedTargetKeys),
          ...Reflect.ownKeys(exposedValue),
        ]),
      ) as Array<string | symbol>;
    },
    getOwnPropertyDescriptor(target, property) {
      if (exposedKeys.has(property)) {
        return (
          Reflect.getOwnPropertyDescriptor(exposedValue, property) ?? {
            configurable: true,
            enumerable: true,
            writable: true,
            value: Reflect.get(exposedValue, property, exposedValue),
          }
        );
      }

      if (forwardedTargetKeys.has(property)) {
        return Reflect.getOwnPropertyDescriptor(target, property);
      }

      return undefined;
    },
  });
}

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

function isNonCallableObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

type RuntimeExposureSelector = (
  dependencies: Record<string, RuntimeExposureToken>,
) => unknown;

function isGenerator(
  value: unknown,
): value is Generator<unknown, unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'next' in value &&
    typeof value.next === 'function'
  );
}

function isServiceYieldRequest(
  value: unknown,
): value is ServiceYieldRequest<ConcreteServiceScope, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    SERVICE_YIELD_REQUEST_MARKER in value
  );
}

function isServiceDependencyAccessRequest(
  value: unknown,
): value is ServiceDependencyAccessRequest<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    SERVICE_DEPENDENCY_ACCESS_MARKER in value
  );
}

function isRuntimeExposureToken(value: unknown): value is RuntimeExposureToken {
  return (
    typeof value === 'function' &&
    SERVICE_EXPOSURE_TOKEN_MARKER in value
  );
}

function isRootRuntimeExposureToken(
  value: RuntimeExposureToken,
): boolean {
  return value[SERVICE_EXPOSURE_TOKEN_MARKER].key === SERVICE_ROOT_EXPOSURE_KEY;
}

function assertAbstractMarker(
  value: unknown,
): asserts value is AbstractMarker<unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !(ABSTRACT_SERVICE_MARKER in value)
  ) {
    throw new Error('service scope "abstract" expects abstract<T>().');
  }
}

function assertDependencyScope(
  hostScope: ConcreteServiceScope,
  dependencyScope: ConcreteServiceScope,
  dependencyName: string,
) {
  if (hostScope === 'global' && dependencyScope === 'toProvide') {
    throw new Error(
      `Global service cannot depend on toProvide service "${dependencyName}".`,
    );
  }
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function toMetaDataPropertyName(value: string): string {
  return `${value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase()}_META_DATA`;
}
