import { TestBed } from '@angular/core/testing';
import {
  createExposedServiceValue,
  getServiceMetaData,
  SERVICE_RUNTIME_OVERRIDES,
} from './craft-service';
import { CRAFT_SERVICE_PROVIDER_BRAND } from './craft-service.shared';
import type {
  BrandedServiceProvider,
  CraftServiceProvider,
  GetInjectedServiceDependencies,
  GetServiceReferenceMeta,
  GetServiceTrackingMetadata,
  ResolvedServiceOutput,
  ServiceBindings,
  ServiceMetaData,
  ServiceReference,
  ServiceTrackingMetadata,
  ServiceYieldRequest,
} from './craft-service';
import type {
  CallableShell,
  ConcreteServiceScope,
  DependencyNodeScope,
  DependencyTreeChildren,
  MergeObjectUnion,
  RequirementScope,
  RootExposureKey,
  Simplify,
  UnionToTuple,
} from './craft-service.shared';
import type { ServiceResolutionStatus } from './to-register';

type TrackingYielded<Tracking> = Tracking extends ServiceTrackingMetadata<
  any,
  any,
  any,
  infer Yielded,
  any,
  any
>
  ? Yielded
  : never;

type TrackingDerivedPropertiesUsed<Tracking> =
  Tracking extends ServiceTrackingMetadata<any, any, any, any, infer Derived, any>
    ? Derived extends {
        derivedPropertiesUsed: infer Used extends object;
      }
      ? Used
      : {}
    : {};

type TrackingProvidedInput<Tracking> =
  Tracking extends ServiceTrackingMetadata<any, any, any, any, any, infer ProvidedInput>
    ? ProvidedInput
    : never;

type FlattenedDependencyOutputRecordsFromTracking<Tracking> = Simplify<
  MergeObjectUnion<
    Extract<TrackingYielded<Tracking>, ServiceYieldRequest<any, any, any>> extends infer Request
      ? Request extends ServiceYieldRequest<any, any, infer DependencyTracking>
        ? DependencyOutputRecordFromTracking<DependencyTracking> |
            FlattenedDependencyOutputRecordsFromTracking<DependencyTracking>
        : never
      : never
  >
>;

type DependencyOutputRecordFromTracking<Tracking> =
  Tracking extends ServiceTrackingMetadata<infer Name extends string, any, infer Output, any, any, any>
    ? {
        [Key in Name]: Output;
      }
    : never;

type FlattenedDependencyProviderInfoRecordsFromTracking<Tracking> = Simplify<
  MergeObjectUnion<
    Extract<TrackingYielded<Tracking>, ServiceYieldRequest<any, any, any>> extends infer Request
      ? Request extends ServiceYieldRequest<any, any, infer DependencyTracking>
        ? DependencyProviderInfoRecordFromTracking<DependencyTracking> |
            FlattenedDependencyProviderInfoRecordsFromTracking<DependencyTracking>
        : never
      : never
  >
>;

type DependencyProviderInfoRecordFromTracking<Tracking> =
  Tracking extends ServiceTrackingMetadata<
    infer Name extends string,
    infer Scope extends ConcreteServiceScope,
    any,
    any,
    any,
    any
  >
    ? {
        [Key in Name]: {
          scope: Scope;
          usesProvidedInput: [TrackingProvidedInput<Tracking>] extends [never]
            ? false
            : true;
        };
      }
    : never;

type DependencyOutputMap<Target extends ServiceReference> =
  FlattenedDependencyOutputRecordsFromTracking<GetServiceTrackingMetadata<Target>>;

type DependencyProviderInfoMap<Target extends ServiceReference> =
  FlattenedDependencyProviderInfoRecordsFromTracking<
    GetServiceTrackingMetadata<Target>
  >;

type GetServiceDependenciesTree<Target extends ServiceReference> =
  Target extends ServiceMetaData<any, any, any, any, infer Dependencies, any, any>
    ? Dependencies
    : GetInjectedServiceDependencies<Target>;

type RootServiceName<Target extends ServiceReference> = Extract<
  GetServiceReferenceMeta<Target>['name'],
  string
>;

type ServiceDependencyChildren<Target extends ServiceReference> =
  GetServiceDependenciesTree<Target> extends {
    dependencies: infer Dependencies extends object;
  }
    ? Dependencies
    : {};

type DependencyOutputForName<
  Target extends ServiceReference,
  Name extends string,
> = Name extends keyof DependencyOutputMap<Target>
  ? DependencyOutputMap<Target>[Name]
  : never;

type DependencyProviderInfoForName<
  Target extends ServiceReference,
  Name extends string,
> = Name extends keyof DependencyProviderInfoMap<Target>
  ? DependencyProviderInfoMap<Target>[Name]
  : never;

type DependencyNodeDerivedPropertiesUsed<Node> = Node extends {
  derivedPropertiesUsed: infer Used extends object;
}
  ? Used
  : {};

type RequiredUsedMockImplementation<
  UsedProperties extends object,
> = Simplify<{
  [Key in Extract<keyof UsedProperties, string>]-?: Key extends RootExposureKey
    ? UsedProperties[Key] extends (...args: any[]) => any
      ? CallableShell<UsedProperties[Key]>
      : never
    : UsedProperties[Key];
}>;

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

type MockImplementationForNode<
  Target extends ServiceReference,
  Name extends string,
  Node,
> = Simplify<
  MockImplementation<DependencyOutputForName<Target, Name>> &
    RequiredUsedMockImplementation<DependencyNodeDerivedPropertiesUsed<Node>>
>;

type ProviderOverrideForNode<Name extends string, Node> =
  DependencyNodeScope<Node> extends RequirementScope
    ? BrandedServiceProvider<
        Name,
        Extract<DependencyNodeScope<Node>, RequirementScope>
      >
    : never;

type TestingServiceMockDecision<Implementation extends object = object> = {
  readonly kind: 'mock';
  readonly implementation: Implementation;
};

type TestingServiceProvideDecision<
  Provider = undefined,
  Children extends object | undefined = undefined,
> = Simplify<
  {
    readonly kind: 'provide';
    readonly provider: Provider;
  } & ([Children] extends [undefined] ? {} : { readonly children: Children })
>;

type TestingServiceBranchDecision<
  Children extends object | undefined = undefined,
> = Simplify<
  {
    readonly kind: 'branch';
  } & ([Children] extends [undefined] ? {} : { readonly children: Children })
>;

type AnyTestingServiceDecision =
  | TestingServiceMockDecision<any>
  | TestingServiceProvideDecision<any, any>
  | TestingServiceBranchDecision<any>;

type TestingServiceProvideDecisionShape<
  Provider,
> =
  | TestingServiceProvideDecision<Provider>
  | TestingServiceProvideDecision<Provider, Record<string, unknown>>;

type TestingServiceBranchDecisionShape =
  | TestingServiceBranchDecision
  | TestingServiceBranchDecision<Record<string, unknown>>;

type ExtractDecisionChildren<Decision> = Decision extends {
  readonly children: infer Children extends object;
}
  ? Children
  : {};

type CanUseDefaultProvide<
  Target extends ServiceReference,
  Name extends string,
> = DependencyProviderInfoForName<Target, Name> extends {
  usesProvidedInput: true;
}
  ? false
  : true;

type AllowedDecisionForNode<
  Target extends ServiceReference,
  Name extends string,
  Node,
> =
  | TestingServiceMockDecision<MockImplementationForNode<Target, Name, Node>>
  | (DependencyNodeScope<Node> extends RequirementScope
      ? TestingServiceProvideDecisionShape<
          ProviderOverrideForNode<Name, Node> | undefined
        >
      : TestingServiceBranchDecisionShape);

type TestingServiceProvideDecisionBuilder<
  Target extends ServiceReference,
  Name extends string,
  Node,
  Provider,
> = TestingServiceProvideDecision<Provider> & {
  branch<const Decisions extends Record<string, unknown>>(
    define: (
      dependencies: TestingServiceBranchBuilderContext<
        Target,
        DependencyTreeChildren<Node>
      >,
    ) => Decisions,
  ): TestingServiceProvideDecision<Provider, Decisions>;
};

type RequirementProvideMethods<
  Target extends ServiceReference,
  Name extends string,
  Node,
> = CanUseDefaultProvide<Target, Name> extends true
  ? {
      provide(): TestingServiceProvideDecisionBuilder<
        Target,
        Name,
        Node,
        undefined
      >;
      provide(
        provider: ProviderOverrideForNode<Name, Node>,
      ): TestingServiceProvideDecisionBuilder<
        Target,
        Name,
        Node,
        ProviderOverrideForNode<Name, Node>
      >;
    }
  : {
      provide(
        provider: ProviderOverrideForNode<Name, Node>,
      ): TestingServiceProvideDecisionBuilder<
        Target,
        Name,
        Node,
        ProviderOverrideForNode<Name, Node>
      >;
    };

type TestingServiceDependencyBuilder<
  Target extends ServiceReference,
  Name extends string,
  Node,
> = {
  mock<Implementation extends MockImplementationForNode<Target, Name, Node>>(
    implementation: Implementation,
  ): TestingServiceMockDecision<Implementation>;
} & (DependencyNodeScope<Node> extends RequirementScope
  ? RequirementProvideMethods<Target, Name, Node>
  : {
      branch<const Decisions extends Record<string, unknown>>(
        define: (
          dependencies: TestingServiceBranchBuilderContext<
            Target,
            DependencyTreeChildren<Node>
          >,
        ) => Decisions,
      ): TestingServiceBranchDecision<Decisions>;
    });

type TestingServiceBranchBuilderContext<
  Target extends ServiceReference,
  Tree extends object,
> = Simplify<{
  [Name in Extract<keyof Tree, string>]: TestingServiceDependencyBuilder<
    Target,
    Name,
    Tree[Name]
  >;
}>;

type InvalidDecisionEntry<
  Target extends ServiceReference,
  Tree extends object,
  Name extends string,
  Decision,
> = [NonNullable<Decision>] extends [never]
  ? never
  : Name extends keyof Tree
    ? NonNullable<Decision> extends AllowedDecisionForNode<Target, Name, Tree[Name]>
      ? InvalidDecisionEntriesForTree<
          Target,
          DependencyTreeChildren<Tree[Name]>,
          ExtractDecisionChildren<NonNullable<Decision>>
        >
      : Name
    : Name;

type InvalidDecisionEntriesForTree<
  Target extends ServiceReference,
  Tree extends object,
  Decisions,
> = Decisions extends object
  ? {
      [Name in Extract<keyof Decisions, string>]: InvalidDecisionEntry<
        Target,
        Tree,
        Name,
        Decisions[Name]
      >;
    }[Extract<keyof Decisions, string>]
  : never;

type AssertValidTestingServiceDecisionShape<
  Target extends ServiceReference,
  Decisions,
> = [InvalidDecisionEntriesForTree<
  Target,
  ServiceDependencyChildren<Target>,
  Decisions
>] extends [never]
  ? {}
  : {
      ERROR_invalid_testing_service_decisions: InvalidDecisionEntriesForTree<
        Target,
        ServiceDependencyChildren<Target>,
        Decisions
      >;
    };

type FlattenDecisionNamesFromKeys<
  Decisions extends object,
  Keys extends readonly string[],
  Accumulator extends string[] = [],
> = Keys extends [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? FlattenDecisionNamesFromKeys<
      Decisions,
      Rest,
      [
        ...Accumulator,
        First,
        ...FlattenDecisionNames<
          ExtractDecisionChildren<Decisions[First & keyof Decisions]>
        >,
      ]
    >
  : Accumulator;

type FlattenDecisionNames<Decisions> = Decisions extends object
  ? FlattenDecisionNamesFromKeys<
      Decisions,
      Extract<UnionToTuple<Extract<keyof Decisions, string>>, readonly string[]>
    >
  : [];

type FindDuplicateDecisionNames<
  Names extends readonly string[],
  Seen extends string = never,
  Duplicates extends string = never,
> = Names extends [infer First extends string, ...infer Rest extends string[]]
  ? FindDuplicateDecisionNames<
      Rest,
      Seen | First,
      Duplicates | (First extends Seen ? First : never)
    >
  : Duplicates;

type DuplicateDecisionNames<Decisions> = FindDuplicateDecisionNames<
  FlattenDecisionNames<Decisions>
>;

type AssertNoDuplicateTestingServiceDecisionNames<Decisions> = [
  DuplicateDecisionNames<Decisions>,
] extends [never]
  ? {}
  : {
      ERROR_conflicting_testing_service_decisions: DuplicateDecisionNames<Decisions>;
    };

type FlattenDecisionStatusPairsFromKeys<
  Decisions extends object,
  Keys extends readonly string[],
  Accumulator extends ReadonlyArray<readonly [string, ServiceResolutionStatus]> = [],
> = Keys extends [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? FlattenDecisionStatusPairsFromKeys<
      Decisions,
      Rest,
      [
        ...Accumulator,
        ...DecisionStatusPairsForEntry<
          First,
          Decisions[First & keyof Decisions]
        >,
        ...FlattenDecisionStatusPairs<
          ExtractDecisionChildren<Decisions[First & keyof Decisions]>
        >,
      ]
    >
  : Accumulator;

type DecisionStatusPairsForEntry<
  Name extends string,
  Decision,
> = Decision extends { readonly kind: 'mock' }
  ? [[Name, 'mocked']]
  : Decision extends { readonly kind: 'provide' }
    ? [[Name, 'provided']]
    : [];

type FlattenDecisionStatusPairs<Decisions> = Decisions extends object
  ? FlattenDecisionStatusPairsFromKeys<
      Decisions,
      Extract<UnionToTuple<Extract<keyof Decisions, string>>, readonly string[]>
    >
  : [];

type ExistingStatus<Map, Name extends string> = Name extends keyof Map
  ? Map[Name]
  : never;

type AppendStatusToMap<
  Map extends object,
  Name extends string,
  Status extends ServiceResolutionStatus,
> = Simplify<
  Omit<Map, Name> & {
    [Key in Name]: ExistingStatus<Map, Name> | Status;
  }
>;

type BuildDecisionStatusMap<
  Pairs extends ReadonlyArray<readonly [string, ServiceResolutionStatus]>,
  Accumulator extends object = {},
> = Pairs extends [
  infer First,
  ...infer Rest extends ReadonlyArray<readonly [string, ServiceResolutionStatus]>,
]
  ? First extends readonly [
      infer Name extends string,
      infer Status extends ServiceResolutionStatus,
    ]
    ? BuildDecisionStatusMap<Rest, AppendStatusToMap<Accumulator, Name, Status>>
    : BuildDecisionStatusMap<Rest, Accumulator>
  : Simplify<Accumulator>;

type DecisionStatusMap<Decisions> = BuildDecisionStatusMap<
  FlattenDecisionStatusPairs<Decisions>
>;

type MissingTestingServiceCoverageForTree<
  Tree extends object,
  Statuses extends object,
> = {
  [Name in Extract<keyof Tree, string>]: MissingTestingServiceCoverageForNode<
    Name,
    Tree[Name],
    Statuses
  >;
}[Extract<keyof Tree, string>];

type MissingTestingServiceCoverageForNode<
  Name extends string,
  Node,
  Statuses extends object,
> = Name extends keyof Statuses
  ? Statuses[Name] extends 'mocked'
    ? never
    : Statuses[Name] extends 'provided'
      ? MissingTestingServiceCoverageForTree<
          DependencyTreeChildren<Node>,
          Statuses
        >
      : Name
  : DependencyNodeScope<Node> extends RequirementScope
    ? Name
    : MissingTestingServiceCoverageForTree<DependencyTreeChildren<Node>, Statuses>;

type AssertTestingServiceCoverage<
  Target extends ServiceReference,
  Decisions,
> = [MissingTestingServiceCoverageForTree<
  ServiceDependencyChildren<Target>,
  DecisionStatusMap<Decisions>
>] extends [never]
  ? {}
  : {
      ERROR_missing_testing_service_decisions: MissingTestingServiceCoverageForTree<
        ServiceDependencyChildren<Target>,
        DecisionStatusMap<Decisions>
      >;
    };

type AssertResolvableTestingServiceRegister<
  _Target extends ServiceReference,
  _Decisions,
> = {};

type FlattenMockImplementationPairsFromKeys<
  Decisions extends object,
  Keys extends readonly string[],
  Accumulator extends ReadonlyArray<readonly [string, unknown]> = [],
> = Keys extends [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? FlattenMockImplementationPairsFromKeys<
      Decisions,
      Rest,
      [
        ...Accumulator,
        ...MockImplementationPairsForEntry<
          First,
          Decisions[First & keyof Decisions]
        >,
        ...FlattenMockImplementationPairs<
          ExtractDecisionChildren<Decisions[First & keyof Decisions]>
        >,
      ]
    >
  : Accumulator;

type MockImplementationPairsForEntry<
  Name extends string,
  Decision,
> = Decision extends {
  readonly kind: 'mock';
  readonly implementation: infer Implementation;
}
  ? [[Name, Implementation]]
  : [];

type FlattenMockImplementationPairs<Decisions> = Decisions extends object
  ? FlattenMockImplementationPairsFromKeys<
      Decisions,
      Extract<UnionToTuple<Extract<keyof Decisions, string>>, readonly string[]>
    >
  : [];

type AppendImplementationToMap<
  Map extends object,
  Name extends string,
  Implementation,
> = Simplify<
  Omit<Map, Name> & {
    [Key in Name]: Implementation;
  }
>;

type BuildMockImplementationMap<
  Pairs extends ReadonlyArray<readonly [string, unknown]>,
  Accumulator extends object = {},
> = Pairs extends [
  infer First,
  ...infer Rest extends ReadonlyArray<readonly [string, unknown]>,
]
  ? First extends readonly [
      infer Name extends string,
      infer Implementation,
    ]
    ? BuildMockImplementationMap<
        Rest,
        AppendImplementationToMap<Accumulator, Name, Implementation>
      >
    : BuildMockImplementationMap<Rest, Accumulator>
  : Simplify<Accumulator>;

type MockImplementationMap<Decisions> = BuildMockImplementationMap<
  FlattenMockImplementationPairs<Decisions>
>;

type PublicMockShape<Implementation> = Implementation extends object
  ? Omit<Implementation, RootExposureKey>
  : {};

type MockRootCallable<Implementation> = NonNullable<Implementation> extends {
  $self: infer Root extends (...args: any[]) => any;
}
  ? CallableShell<Root>
  : never;

type MockPublicValueFromImplementation<Implementation> = [Implementation] extends [
  undefined,
]
  ? {}
  : [MockRootCallable<Implementation>] extends [never]
    ? PublicMockShape<NonNullable<Implementation>>
    : MockRootCallable<Implementation> &
        PublicMockShape<NonNullable<Implementation>>;

type CreateTestingServiceMocks<Decisions> = Simplify<{
  [Name in Extract<keyof MockImplementationMap<Decisions>, string>]: MockPublicValueFromImplementation<
    MockImplementationMap<Decisions>[Name]
  >;
}>;

type RequirementProvidedNames<
  Target extends ServiceReference,
  Decisions,
> = RootServiceName<Target> | Extract<keyof DecisionStatusMap<Decisions>, string>;

type RequirementMockedNames<
  _Target extends ServiceReference,
  Decisions,
> = Extract<keyof DecisionStatusMap<Decisions>, string>;

type ExplicitMockedNames<Decisions> = Extract<
  keyof MockImplementationMap<Decisions>,
  string
>;

type AdditionalMockedNames<
  Target extends ServiceReference,
  Decisions,
> = Exclude<
  ExplicitMockedNames<Decisions>,
  RequirementMockedNames<Target, Decisions>
>;

type CreateTestingServiceRegister<
  Target extends ServiceReference,
  Decisions,
> = {
  provided: Array<{
    name: RequirementProvidedNames<Target, Decisions>;
    provider: unknown;
  }>;
  mocked: Array<{
    name:
      | RequirementMockedNames<Target, Decisions>
      | AdditionalMockedNames<Target, Decisions>;
    value: unknown;
  }>;
};

type RuntimeTestingServiceDecision =
  | {
      readonly kind: 'mock';
      readonly implementation: unknown;
    }
  | {
      readonly kind: 'provide';
      readonly provider?: BrandedServiceProvider<string, RequirementScope>;
      readonly children?: RuntimeTestingServiceDecisions;
    }
  | {
      readonly kind: 'branch';
      readonly children?: RuntimeTestingServiceDecisions;
    };

type RuntimeTestingServiceDecisions = Record<string, RuntimeTestingServiceDecision>;

type RuntimeTestingServiceBuilder = {
  mock(implementation: unknown): RuntimeTestingServiceDecision;
  provide(
    provider?: BrandedServiceProvider<string, RequirementScope>,
  ): RuntimeTestingServiceDecision & {
    branch(
      define: (dependencies: Record<string, RuntimeTestingServiceBuilder>) => RuntimeTestingServiceDecisions,
    ): RuntimeTestingServiceDecision;
  };
  branch(
    define: (dependencies: Record<string, RuntimeTestingServiceBuilder>) => RuntimeTestingServiceDecisions,
  ): RuntimeTestingServiceDecision;
};

const DEFAULT_PROVIDED_REGISTER_VALUE = { kind: 'instantiate' } as const;

function createMockPublicValue(implementation: unknown): unknown {
  return implementation === undefined
    ? {}
    : createExposedServiceValue(implementation);
}

function createRuntimeProvideDecision(
  provider?: BrandedServiceProvider<string, RequirementScope>,
): RuntimeTestingServiceDecision & {
  branch(
    define: (dependencies: Record<string, RuntimeTestingServiceBuilder>) => RuntimeTestingServiceDecisions,
  ): RuntimeTestingServiceDecision;
} {
  return {
    kind: 'provide',
    provider,
    branch: (
      define: (
        dependencies: Record<string, RuntimeTestingServiceBuilder>,
      ) => RuntimeTestingServiceDecisions,
    ) => ({
      kind: 'provide',
      provider,
      children: define(createRuntimeTestingServiceContext()),
    }),
  };
}

function createRuntimeTestingServiceBuilder(): RuntimeTestingServiceBuilder {
  return {
    mock: (implementation) => ({
      kind: 'mock',
      implementation,
    }),
    provide: (provider) => createRuntimeProvideDecision(provider),
    branch: (
      define: (
        dependencies: Record<string, RuntimeTestingServiceBuilder>,
      ) => RuntimeTestingServiceDecisions,
    ) => ({
      kind: 'branch',
      children: define(createRuntimeTestingServiceContext()),
    }),
  };
}

function createRuntimeTestingServiceContext() {
  const helpers = new Map<string, RuntimeTestingServiceBuilder>();

  return new Proxy<Record<string, RuntimeTestingServiceBuilder>>(
    {} as Record<string, RuntimeTestingServiceBuilder>,
    {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }

        let helper = helpers.get(property);

        if (!helper) {
          helper = createRuntimeTestingServiceBuilder();
          helpers.set(property, helper);
        }

        return helper;
      },
    },
  );
}

function getProviderOverrideMeta(
  value: unknown,
): { name: string; scope: RequirementScope } | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !(CRAFT_SERVICE_PROVIDER_BRAND in value)
  ) {
    return undefined;
  }

  return Reflect.get(
    value,
    CRAFT_SERVICE_PROVIDER_BRAND,
  ) as { name: string; scope: RequirementScope } | undefined;
}

function assertProviderOverrideName(name: string, provider: unknown) {
  const metaData = getProviderOverrideMeta(provider);

  if (!metaData) {
    throw new Error(
      `Expected a raw provider returned by provide${name}(...).`,
    );
  }

  if (metaData.name !== name) {
    throw new Error(
      `Testing service decision "${name}" does not match provider value for "${metaData.name}".`,
    );
  }
}

function findProviderOverrideByName(
  providers: CraftServiceProvider[],
  name: string,
): BrandedServiceProvider<string, RequirementScope> | undefined {
  return providers.find((provider) => getProviderOverrideMeta(provider)?.name === name) as
    | BrandedServiceProvider<string, RequirementScope>
    | undefined;
}

function collectRuntimeTestingServiceDecisions(
  decisions: RuntimeTestingServiceDecisions,
  state: {
    readonly seen: Set<string>;
    readonly providers: CraftServiceProvider[];
    readonly runtimeOverrides: Map<
      string,
      { kind: 'useValue'; value: unknown } | { kind: 'instantiate'; instance?: unknown }
    >;
    readonly mocks: Record<string, unknown>;
    readonly register: {
      provided: Array<{ name: string; provider: unknown }>;
      mocked: Array<{ name: string; value: unknown }>;
    };
  },
) {
  for (const [name, decision] of Object.entries(decisions)) {
    if (state.seen.has(name)) {
      throw new Error(
        `setupTestingService cannot resolve "${name}" more than once across branches.`,
      );
    }

    state.seen.add(name);

    if (decision.kind === 'mock') {
      const publicValue = createMockPublicValue(decision.implementation);

      state.runtimeOverrides.set(name, {
        kind: 'useValue',
        value: publicValue,
      });
      state.mocks[name] = publicValue;
      state.register.mocked.push({
        name,
        value: publicValue,
      });
      continue;
    }

    if (decision.kind === 'provide') {
      if (decision.provider !== undefined) {
        assertProviderOverrideName(name, decision.provider);
        state.providers.push(decision.provider);
        state.register.provided.push({
          name,
          provider: decision.provider,
        });
      } else {
        state.runtimeOverrides.set(name, { kind: 'instantiate' });
        state.register.provided.push({
          name,
          provider: DEFAULT_PROVIDED_REGISTER_VALUE,
        });
      }

      if (decision.children) {
        collectRuntimeTestingServiceDecisions(decision.children, state);
      }

      continue;
    }

    if (decision.children) {
      collectRuntimeTestingServiceDecisions(decision.children, state);
    }
  }
}

/**
 * Sets up a crafted service through a strict branch-oriented dependency builder.
 *
 * Required provider-capable dependencies must be decided explicitly with
 * `mock(...)` or `provide(...)`. Optional dependencies can be ignored, mocked,
 * or traversed through `branch(...)` to resolve deeper required descendants.
 */
export function setupTestingService<
  Target extends ServiceReference,
  const Decisions extends Record<string, unknown>,
  Bindings extends ServiceBindings<Target> | undefined = undefined,
>(
  target: Target,
  define: (
    dependencies: TestingServiceBranchBuilderContext<
      Target,
      ServiceDependencyChildren<Target>
    >,
  ) => Decisions &
    AssertValidTestingServiceDecisionShape<Target, Decisions> &
    AssertNoDuplicateTestingServiceDecisionNames<Decisions> &
    AssertTestingServiceCoverage<Target, Decisions> &
    AssertResolvableTestingServiceRegister<Target, Decisions>,
  options?: {
    bindings?: Bindings;
    providers?: CraftServiceProvider[];
  },
): {
  sut: ResolvedServiceOutput<Target, Bindings>;
  mocks: CreateTestingServiceMocks<Decisions>;
  register: CreateTestingServiceRegister<Target, Decisions>;
} {
  const internalMetaData = getServiceMetaData(target);
  const providers = [...(options?.providers ?? [])];
  const runtimeOverrides = new Map<
    string,
    { kind: 'useValue'; value: unknown } | { kind: 'instantiate'; instance?: unknown }
  >();
  const mocks: Record<string, unknown> = {};
  const register = {
    provided: [] as Array<{ name: string; provider: unknown }>,
    mocked: [] as Array<{ name: string; value: unknown }>,
  };
  const decisions =
    define(
      createRuntimeTestingServiceContext() as unknown as TestingServiceBranchBuilderContext<
        Target,
        ServiceDependencyChildren<Target>
      >,
    ) ?? {};
  const explicitTargetProvider = findProviderOverrideByName(
    providers,
    internalMetaData.name,
  );

  if (
    internalMetaData.scope === 'toProvide' ||
    internalMetaData.scope === 'manuallyProvidedAtRoot'
  ) {
    if (
      !('provide' in internalMetaData) ||
      typeof internalMetaData.provide !== 'function'
    ) {
      throw new Error(
        `Missing provide helper for craftService/craftDependency "${internalMetaData.name}" in setupTestingService.`,
      );
    }

    if (explicitTargetProvider) {
      register.provided.push({
        name: internalMetaData.name,
        provider: explicitTargetProvider,
      });
    } else {
      if (Reflect.get(internalMetaData, 'usesProvidedInput') === true) {
        throw new Error(
          `setupTestingService requires an explicit provider for "${internalMetaData.name}" because it uses $provided.`,
        );
      }

      const provider = internalMetaData.provide();
      providers.push(provider);
      register.provided.push({
        name: internalMetaData.name,
        provider,
      });
    }
  }

  collectRuntimeTestingServiceDecisions(
    decisions as RuntimeTestingServiceDecisions,
    {
      seen: new Set<string>(),
      providers,
      runtimeOverrides,
      mocks,
      register,
    },
  );

  providers.push({
    provide: SERVICE_RUNTIME_OVERRIDES,
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
    register,
  })) as {
    sut: ResolvedServiceOutput<Target, Bindings>;
    mocks: CreateTestingServiceMocks<Decisions>;
    register: CreateTestingServiceRegister<Target, Decisions>;
  };
}
