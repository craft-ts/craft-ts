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
  DependencyNodeScope,
  DependencyTreeChildren,
  FlattenDependencyTree,
  MergeObjectUnion,
  RequirementScope,
  RootExposureKey,
  Simplify,
} from './craft-service.shared';

type TrackingYielded<Tracking> = Tracking extends ServiceTrackingMetadata<
  any,
  any,
  any,
  infer Yielded,
  any
>
  ? Yielded
  : never;

type TrackingDerivedPropertiesUsed<Tracking> =
  Tracking extends ServiceTrackingMetadata<any, any, any, any, infer Derived>
    ? Derived extends {
        derivedPropertiesUsed: infer Used extends object;
      }
      ? Used
      : {}
    : {};

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
  Tracking extends ServiceTrackingMetadata<infer Name extends string, any, infer Output, any, any>
    ? {
        [Key in Name]: Output;
      }
    : never;

type DependencyOutputMap<Target extends ServiceReference> =
  FlattenedDependencyOutputRecordsFromTracking<GetServiceTrackingMetadata<Target>>;

type GetServiceDependenciesTree<Target extends ServiceReference> =
  Target extends ServiceMetaData<any, any, any, any, infer Dependencies, any, any>
    ? Dependencies
    : GetInjectedServiceDependencies<Target>;

type ServiceDependencyChildren<Target extends ServiceReference> =
  GetServiceDependenciesTree<Target> extends {
    dependencies: infer Dependencies extends object;
  }
    ? Dependencies
    : {};

type FlattenedServiceTestingDependencyTree<Target extends ServiceReference> =
  FlattenDependencyTree<ServiceDependencyChildren<Target>>;

type DependencyOutputForName<
  Target extends ServiceReference,
  Name extends string,
> = Name extends keyof DependencyOutputMap<Target>
  ? DependencyOutputMap<Target>[Name]
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

type OverrideForDependencyNode<
  Target extends ServiceReference,
  Name extends string,
  Node,
> =
  | MockImplementationForNode<Target, Name, Node>
  | ProviderOverrideForNode<Name, Node>;

type SetupTestDependencyBuilder<
  Target extends ServiceReference,
  Name extends string,
  Node,
> = {
  mock<Implementation extends MockImplementationForNode<Target, Name, Node>>(
    implementation: Implementation,
  ): Implementation;
};

type SetupTestDependencyBuildersForTree<
  Target extends ServiceReference,
  Tree extends object,
> = Simplify<{
  [Name in Extract<keyof Tree, string>]: SetupTestDependencyBuilder<
    Target,
    Name,
    Tree[Name]
  >;
}>;

type NestedSetupTestDependencyBuilders<Target extends ServiceReference> = Omit<
  SetupTestDependencyBuildersForTree<
    Target,
    FlattenedServiceTestingDependencyTree<Target>
  >,
  keyof ServiceDependencyChildren<Target>
>;

type SetupTestDependencyBuilderContext<
  Target extends ServiceReference,
> = Simplify<
  SetupTestDependencyBuildersForTree<Target, ServiceDependencyChildren<Target>> & {
    _nestedDeps: Simplify<NestedSetupTestDependencyBuilders<Target>>;
  }
>;

type OverrideAtPath<Overrides, Name extends string> = Name extends keyof Overrides
  ? NonNullable<Overrides[Name]>
  : never;

type InvalidOverrideEntry<
  Target extends ServiceReference,
  Name extends string,
  Override,
> = [NonNullable<Override>] extends [never]
  ? never
  : Name extends keyof FlattenedServiceTestingDependencyTree<Target>
    ? NonNullable<Override> extends OverrideForDependencyNode<
        Target,
        Name,
        FlattenedServiceTestingDependencyTree<Target>[Name]
      >
      ? never
      : Name
    : Name;

type InvalidOverrideEntries<
  Target extends ServiceReference,
  Overrides,
> = {
  [Name in Extract<keyof Overrides, string>]: InvalidOverrideEntry<
    Target,
    Name,
    Overrides[Name]
  >;
}[Extract<keyof Overrides, string>];

type AssertValidServiceTestOverrides<
  Target extends ServiceReference,
  Overrides,
> = [InvalidOverrideEntries<Target, Overrides>] extends [never]
  ? {}
  : {
      ERROR_invalid_service_test_overrides: InvalidOverrideEntries<
        Target,
        Overrides
      >;
    };

type MissingCoverageForTree<Tree extends object, Overrides> = {
  [Name in Extract<keyof Tree, string>]: MissingCoverageForNode<
    Name,
    Tree[Name],
    Overrides
  >;
}[Extract<keyof Tree, string>];

type MissingCoverageForNode<
  Name extends string,
  Node,
  Overrides,
> = [OverrideAtPath<Overrides, Name>] extends [never]
  ? DependencyNodeScope<Node> extends RequirementScope
    ? Name
    : MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
  : OverrideAtPath<Overrides, Name> extends ProviderOverrideForNode<Name, Node>
    ? MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
    : never;

type AssertServiceTestCoverage<
  Target extends ServiceReference,
  Overrides,
> = [MissingCoverageForTree<
  ServiceDependencyChildren<Target>,
  Overrides
>] extends [never]
  ? {}
  : {
      ERROR_missing_service_test_overrides: MissingCoverageForTree<
        ServiceDependencyChildren<Target>,
        Overrides
      >;
    };

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

type CreateAngularTestMocks<
  Target extends ServiceReference,
  Overrides,
> = Simplify<{
  [Name in keyof Overrides as [NonNullable<Overrides[Name]>] extends [never]
    ? never
    : Name extends keyof FlattenedServiceTestingDependencyTree<Target>
      ? NonNullable<Overrides[Name]> extends ProviderOverrideForNode<
            Extract<Name, string>,
            FlattenedServiceTestingDependencyTree<Target>[Name]
          >
        ? never
        : Name
      : never]: MockPublicValueFromImplementation<NonNullable<Overrides[Name]>>;
}>;

type RuntimeSetupTestDependencyBuilder = {
  mock<Implementation>(implementation: Implementation): Implementation;
};

function createMockPublicValue(implementation: unknown): unknown {
  return implementation === undefined
    ? {}
    : createExposedServiceValue(implementation);
}

function createRuntimeDependencyBuilder(): RuntimeSetupTestDependencyBuilder {
  return {
    mock: <Implementation>(implementation: Implementation) => implementation,
  };
}

function createRuntimeDependencyBuildersProxy() {
  const helpers = new Map<string, RuntimeSetupTestDependencyBuilder>();

  return new Proxy<Record<string, RuntimeSetupTestDependencyBuilder>>(
    {} as Record<string, RuntimeSetupTestDependencyBuilder>,
    {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }

        let helper = helpers.get(property);

        if (!helper) {
          helper = createRuntimeDependencyBuilder();
          helpers.set(property, helper);
        }

        return helper;
      },
    },
  );
}

function createRuntimeOverrideFactoryContext() {
  const directDependencies = createRuntimeDependencyBuildersProxy();
  const nestedDependencies = createRuntimeDependencyBuildersProxy();

  return new Proxy<Record<string, unknown>>(
    {} as Record<string, unknown>,
    {
      get(_target, property) {
        if (property === '_nestedDeps') {
          return nestedDependencies;
        }

        if (typeof property !== 'string') {
          return undefined;
        }

        return Reflect.get(
          directDependencies,
          property,
          directDependencies,
        ) as RuntimeSetupTestDependencyBuilder | undefined;
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

function isProviderOverride(
  override: unknown,
): override is BrandedServiceProvider<string, RequirementScope> {
  return getProviderOverrideMeta(override) !== undefined;
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
      `Test override "${name}" does not match provider value for "${metaData.name}".`,
    );
  }
}

export function setupTest<
  Target extends ServiceReference,
  const Overrides extends Record<string, unknown>,
  Bindings extends ServiceBindings<Target> | undefined = undefined,
>(
  target: Target,
  overrides: Overrides &
    AssertValidServiceTestOverrides<Target, Overrides> &
    AssertServiceTestCoverage<Target, Overrides>,
  options?: {
    bindings?: Bindings;
    providers?: CraftServiceProvider[];
  },
): {
  sut: ResolvedServiceOutput<Target, Bindings>;
  mocks: CreateAngularTestMocks<Target, Overrides>;
};
export function setupTest<
  Target extends ServiceReference,
  const Overrides extends Record<string, unknown>,
  Bindings extends ServiceBindings<Target> | undefined = undefined,
>(
  target: Target,
  overridesFactory: (
    dependencies: SetupTestDependencyBuilderContext<Target>,
  ) => Overrides &
    AssertValidServiceTestOverrides<Target, Overrides> &
    AssertServiceTestCoverage<Target, Overrides>,
  options?: {
    bindings?: Bindings;
    providers?: CraftServiceProvider[];
  },
): {
  sut: ResolvedServiceOutput<Target, Bindings>;
  mocks: CreateAngularTestMocks<Target, Overrides>;
};
export function setupTest<
  Target extends ServiceReference,
  const Overrides extends Record<string, unknown>,
  Bindings extends ServiceBindings<Target> | undefined = undefined,
>(
  target: Target,
  overridesOrFactory:
    | (Overrides &
        AssertValidServiceTestOverrides<Target, Overrides> &
        AssertServiceTestCoverage<Target, Overrides>)
    | ((
        dependencies: SetupTestDependencyBuilderContext<Target>,
      ) => Overrides &
        AssertValidServiceTestOverrides<Target, Overrides> &
        AssertServiceTestCoverage<Target, Overrides>),
  options?: {
    bindings?: Bindings;
    providers?: CraftServiceProvider[];
  },
): {
  sut: ResolvedServiceOutput<Target, Bindings>;
  mocks: CreateAngularTestMocks<Target, Overrides>;
} {
  const internalMetaData = getServiceMetaData(target);
  const providers = [...(options?.providers ?? [])];
  const overrides =
    typeof overridesOrFactory === 'function'
      ? overridesOrFactory(
          createRuntimeOverrideFactoryContext() as SetupTestDependencyBuilderContext<Target>,
        )
      : overridesOrFactory;
  const runtimeOverrides = new Map<string, { kind: 'useValue'; value: unknown }>();
  const mocks: Record<string, unknown> = {};
  const hasExplicitTargetProvider = providers.some(
    (provider) => getProviderOverrideMeta(provider)?.name === internalMetaData.name,
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
        `Missing provide helper for craftService/craftDependency "${internalMetaData.name}" in setupTest.`,
      );
    }

    if (!hasExplicitTargetProvider) {
      if (Reflect.get(internalMetaData, 'usesProvidedInput') === true) {
        throw new Error(
          `setupTest requires an explicit provider for "${internalMetaData.name}" because it uses $provided.`,
        );
      }

      providers.push(internalMetaData.provide());
    }
  }

  for (const [name, override] of Object.entries(overrides) as Array<
    [string, unknown]
  >) {
    if (override === undefined) {
      continue;
    }

    if (isProviderOverride(override)) {
      assertProviderOverrideName(name, override);
      providers.push(override);
      continue;
    }

    const publicValue = createMockPublicValue(override);

    runtimeOverrides.set(name, {
      kind: 'useValue',
      value: publicValue,
    });
    mocks[name] = publicValue;
  }

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
  })) as {
    sut: ResolvedServiceOutput<Target, Bindings>;
    mocks: CreateAngularTestMocks<Target, Overrides>;
  };
}
