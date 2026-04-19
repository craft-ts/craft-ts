import {
  assertInInjectionContext,
  inject,
  InjectionToken,
  Injector,
  isSignal,
  Provider,
  Signal,
} from '@angular/core';

declare const SERVICE_HELPER_DEPENDENCIES: unique symbol;
declare const SERVICE_YIELD_METADATA: unique symbol;

type Simplify<ObjectType> = {
  [Key in keyof ObjectType]: ObjectType[Key];
} & {};

export type ServiceDependencies<
  Scope = unknown,
  Dependencies = {},
  MustBeProvided = [],
> = {
  scope: Scope;
  dependencies: Simplify<Dependencies>;
  mustBeProvided: MustBeProvided;
};

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
  Yielded extends ServiceYieldRequest<infer Scope, any> ? Scope : never;

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

type ExposedOutput<Output, Exposed> = Output extends (...args: any[]) => any
  ? CallableShell<Output> & Exposed
  : Exposed;

type OutputDependencyKeys<Output extends object> = Extract<
  keyof Output,
  string
>;

type ServiceDependencyAccessRequest<Key extends string, Result> = Readonly<{
  [SERVICE_DEPENDENCY_ACCESS_MARKER]: true;
  key: Key;
  resolve: () => Result;
}>;

type DependencyAccessHelpers<Output extends object> = {
  [Key in OutputDependencyKeys<Output>]: () => Generator<
    ServiceDependencyAccessRequest<Key, Output[Key]>,
    Output[Key],
    unknown
  >;
};

type ExposureYield<Output extends object> = ServiceDependencyAccessRequest<
  OutputDependencyKeys<Output>,
  Output[OutputDependencyKeys<Output>]
>;

type ExposureSelector<Output extends object, Exposed> = (
  output: Output,
  dependencies: DependencyAccessHelpers<Output>,
) => Exposed | Generator<ExposureYield<Output>, Exposed, unknown>;

type ServiceTrackingMetadata<
  Name extends string = string,
  Scope extends ConcreteServiceScope = ConcreteServiceScope,
  Yielded = unknown,
> = {
  name: Name;
  scope: Scope;
  yielded: Yielded;
};

type DependencyRequests<Yielded> = UnionToTuple<
  Extract<Yielded, ServiceYieldRequest<any, any, ServiceTrackingMetadata>>
>;

type DependencyMetadata<Request> =
  Request extends ServiceYieldRequest<any, any, infer Metadata> ? Metadata : never;

type DependencyName<Request> = DependencyMetadata<Request> extends ServiceTrackingMetadata<
  infer Name,
  any,
  any
>
  ? Name
  : never;

type DependencyDefinition<Request> =
  ResolveServiceTrackingMetadata<DependencyMetadata<Request>>;

type DependencyMustBeProvided<Request> =
  DependencyDefinition<Request> extends ServiceDependencies<any, any, infer Must>
    ? Must
    : [];

type AppendUnique<
  Accumulator extends string[],
  Value extends string,
> = Value extends Accumulator[number] ? Accumulator : [...Accumulator, Value];

type MergeMustBeProvided<
  Values extends string[],
  Accumulator extends string[] = [],
> = Values extends [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? MergeMustBeProvided<Rest, AppendUnique<Accumulator, First>>
  : Accumulator;

type FlattenDependencyMustBeProvided<
  Requests extends unknown[],
  Accumulator extends string[] = [],
> = Requests extends [infer First, ...infer Rest]
  ? FlattenDependencyMustBeProvided<
      Rest,
      MergeMustBeProvided<
        [...Accumulator, ...Extract<DependencyMustBeProvided<First>, string[]>]
      >
    >
  : Accumulator;

type DependencyRecord<Request> =
  DependencyMetadata<Request> extends ServiceTrackingMetadata<
    infer Name extends string,
    any,
    any
  >
    ? { [Key in Name]: DependencyDefinition<Request> }
    : {};

type ResolveServiceTrackingMetadata<Metadata> =
  Metadata extends ServiceTrackingMetadata<
    infer Name extends string,
    infer Scope extends ConcreteServiceScope,
    infer Yielded
  >
    ? ServiceDependencies<
        Scope,
        BuildDependencyMap<DependencyRequests<Yielded>>,
        [
          ...SelfMustBeProvided<Name, Scope>,
          ...FlattenDependencyMustBeProvided<DependencyRequests<Yielded>>,
        ]
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

type SelfMustBeProvided<
  Name extends string,
  Scope extends ConcreteServiceScope,
> = Scope extends 'toProvide' | 'manuallyProvidedAtRoot' ? [Name] : [];

type ServiceHelperMetadata<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Factory extends AnyFactory,
> = ServiceTrackingMetadata<Name, Scope, FactoryYields<Factory>>;

type ServiceYieldRequest<
  Scope extends ConcreteServiceScope,
  Result,
  Metadata extends ServiceTrackingMetadata = ServiceTrackingMetadata,
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
      <Exposed>(
        bindings: undefined,
        expose: ExposureSelector<
          SelectableOutput<Inputs, undefined, Output>,
          Exposed
        >,
      ): ExposedOutput<SelectableOutput<Inputs, undefined, Output>, Exposed>;
      <Config extends Partial<InputBindings<Inputs, Scope>>, Exposed>(
        bindings: Config,
        expose: ExposureSelector<
          SelectableOutput<Inputs, Config, Output>,
          Exposed
        >,
      ): ExposedOutput<SelectableOutput<Inputs, Config, Output>, Exposed>;
    },
    Metadata
  >;
};

type YieldHelper<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Inputs extends object,
  Output,
  Metadata extends ServiceTrackingMetadata,
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
      <Exposed>(
        bindings: undefined,
        expose: ExposureSelector<
          SelectableOutput<Inputs, undefined, Output>,
          Exposed
        >,
      ): Generator<
        | ServiceYieldRequest<
            Scope,
            SelectableOutput<Inputs, undefined, Output>,
            Metadata
          >
        | ExposureYield<SelectableOutput<Inputs, undefined, Output>>,
        ExposedOutput<SelectableOutput<Inputs, undefined, Output>, Exposed>,
        unknown
      >;
      <Config extends Partial<InputBindings<Inputs, Scope>>, Exposed>(
        bindings: Config,
        expose: ExposureSelector<
          SelectableOutput<Inputs, Config, Output>,
          Exposed
        >,
      ): Generator<
        | ServiceYieldRequest<
            Scope,
            SelectableOutput<Inputs, Config, Output>,
            Metadata
          >
        | ExposureYield<SelectableOutput<Inputs, Config, Output>>,
        ExposedOutput<SelectableOutput<Inputs, Config, Output>, Exposed>,
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

type ConcreteServiceApi<
  Name extends string,
  Scope extends ConcreteServiceScope,
  Inputs extends object,
  Output,
  Metadata extends ServiceTrackingMetadata,
> = InjectHelper<Name, Scope, Inputs, Output, Metadata> &
  YieldHelper<Name, Scope, Inputs, Output, Metadata> &
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

export type MaybeSignal<T> = T | Signal<T>;

export function toValue<T>(value: MaybeSignal<T>): T {
  return isSignal(value) ? value() : value;
}

export function abstract<Contract>(): AbstractMarker<Contract> {
  return {
    [ABSTRACT_SERVICE_MARKER]: () => undefined as Contract,
  } as AbstractMarker<Contract>;
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

  return api;

  function abstractInject() {}
  function concreteInject() {}
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
  if (definition.scope === 'function') {
    return createConcreteServiceInstance(definition, injector, bindings);
  }

  if (bindings !== undefined && definition.initialBindings === undefined) {
    definition.initialBindings = bindings;
  }

  return injector.get(definition.token!);
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
  const exposure = expose(
    serviceValue as object,
    createDependencyAccessHelpers(serviceValue),
  );
  const resolvedExposure = isGenerator(exposure)
    ? runGeneratorFactory(exposure, injector, hostScope)
    : exposure;

  return createExposedServiceValue(serviceValue, resolvedExposure);
}

function* exposeServiceValue(
  serviceValue: unknown,
  expose: RuntimeExposureSelector,
): Generator<
  ServiceDependencyAccessRequest<string, unknown>,
  unknown,
  unknown
> {
  const exposure = expose(
    serviceValue as object,
    createDependencyAccessHelpers(serviceValue),
  );
  const resolvedExposure = isGenerator(exposure)
    ? yield* exposure as Generator<
        ServiceDependencyAccessRequest<string, unknown>,
        unknown,
        unknown
      >
    : exposure;

  return createExposedServiceValue(serviceValue, resolvedExposure);
}

function createDependencyAccessHelpers(
  serviceValue: unknown,
): Record<
  string,
  () => Generator<
    ServiceDependencyAccessRequest<string, unknown>,
    unknown,
    unknown
  >
> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }

        return function* () {
          return (yield createDependencyAccessRequest(
            serviceValue,
            property,
          )) as unknown;
        };
      },
    },
  );
}

function createDependencyAccessRequest(
  serviceValue: unknown,
  key: string,
): ServiceDependencyAccessRequest<string, unknown> {
  return {
    [SERVICE_DEPENDENCY_ACCESS_MARKER]: true,
    key,
    resolve: () => Reflect.get(Object(serviceValue), key),
  };
}

function createExposedServiceValue(
  serviceValue: unknown,
  exposedValue: unknown,
): unknown {
  if (typeof serviceValue !== 'function' || !isObjectLike(exposedValue)) {
    return exposedValue;
  }

  return createCallableExposureProxy(
    serviceValue as (...args: any[]) => unknown,
    exposedValue,
  );
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

type RuntimeExposureSelector = (
  output: object,
  dependencies: Record<
    string,
    () => Generator<
      ServiceDependencyAccessRequest<string, unknown>,
      unknown,
      unknown
    >
  >,
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
