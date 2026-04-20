import { TestBed } from '@angular/core/testing';
import {
  createExposedServiceValue,
  getServiceMetaData,
  SERVICE_RUNTIME_OVERRIDES,
} from './craft-service';
import type { CraftServiceProvider } from './craft-service';
import type {
  CallableShell,
  ConcreteServiceScope,
  DependencyNodeScope,
  DependencyTreeChildren,
  FlattenDependencyTree,
  RealCapableScope,
  RequirementScope,
  RootExposureKey,
  Simplify,
} from './craft-service.shared';
import type {
  GetInjectedServiceDependencies,
  GetServiceReferenceOutput,
  ResolvedServiceOutput,
  ServiceBindings,
  ServiceMetaData,
  ServiceReference,
  ServiceRuntimeOverride,
} from './craft-service';

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

type DerivedMockImplementationForNode<Node> = Simplify<
  Record<string, unknown> &
    RequiredUsedMockImplementation<DependencyNodeDerivedPropertiesUsed<Node>>
>;

type MockImplementationForNode<Node> = Simplify<
  [keyof DependencyNodeDerivedPropertiesUsed<Node>] extends [never]
    ? Record<string, unknown>
    : DerivedMockImplementationForNode<Node>
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

type ImplicitMockServiceOverride<Implementation extends object> = {
  readonly kind: 'mock';
  readonly implementation: Implementation;
  readonly reference?: undefined;
};

type ExplicitMockServiceOverride<
  Reference extends ServiceReference = ServiceReference,
  Implementation extends object = object,
> = {
  readonly kind: 'mock';
  readonly reference: Reference;
  readonly implementation: Implementation;
};

type AnyMockServiceOverride =
  | ImplicitMockServiceOverride<any>
  | ExplicitMockServiceOverride<any, any>;

type ImplicitRealServiceOverride = {
  readonly kind: 'provide';
  readonly reference?: undefined;
};

type ExplicitRealServiceOverride<
  Reference extends ServiceReference<string, RealCapableScope> =
    ServiceReference<string, RealCapableScope>,
> = {
  readonly kind: 'provide';
  readonly reference: Reference;
};

type AnyRealServiceOverride =
  | ImplicitRealServiceOverride
  | ExplicitRealServiceOverride<any>;

type AnyServiceOverride = AnyMockServiceOverride | AnyRealServiceOverride;

type OverrideKind<Override> = Override extends { kind: infer Kind }
  ? Kind
  : never;

type OverrideForDependencyNode<Name extends string, Node> =
  | ImplicitMockServiceOverride<MockImplementationForNode<Node>>
  | ExplicitMockServiceOverride<
      ServiceReference<Name, Extract<DependencyNodeScope<Node>, ConcreteServiceScope>>,
      MockImplementationForNode<Node>
    >
  | (DependencyNodeScope<Node> extends RealCapableScope
      ? | ImplicitRealServiceOverride
        | ExplicitRealServiceOverride<
            ServiceReference<
              Name,
              Extract<DependencyNodeScope<Node>, RealCapableScope>
            >
          >
      : never);

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

type InvalidOverrideEntry<
  Target extends ServiceReference,
  Name extends string,
  Override,
> = [NonNullable<Override>] extends [never]
  ? never
  : Name extends keyof FlattenedServiceTestingDependencyTree<Target>
    ? NonNullable<Override> extends OverrideForDependencyNode<
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

type MissingCoverageForNode<
  Name extends string,
  Node,
  Overrides,
> = [OverrideAtPath<Overrides, Name>] extends [never]
  ? DependencyNodeScope<Node> extends RequirementScope
    ? Name
    : MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
  : OverrideKind<OverrideAtPath<Overrides, Name>> extends 'mock'
    ? never
    : OverrideKind<OverrideAtPath<Overrides, Name>> extends 'provide'
      ? MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
      : DependencyNodeScope<Node> extends RequirementScope
        ? Name
        : MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>;

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

type ResolvedMockValueForNode<_Node, Override> =
  Override extends ImplicitMockServiceOverride<infer Implementation>
    ? MockPublicValueFromImplementation<Implementation>
    : Override extends ExplicitMockServiceOverride<any, infer Implementation>
      ? MockPublicValueFromImplementation<Implementation>
      : never;

type ExtractMockOverride<Override> = Extract<
  NonNullable<Override>,
  AnyMockServiceOverride
>;

type CreateAngularTestMocks<
  Target extends ServiceReference,
  Overrides,
> = Simplify<{
  [Name in keyof Overrides as [ExtractMockOverride<Overrides[Name]>] extends [
    never,
  ]
    ? never
    : Name]: Name extends keyof FlattenedServiceTestingDependencyTree<Target>
    ? ResolvedMockValueForNode<
        FlattenedServiceTestingDependencyTree<Target>[Name],
        ExtractMockOverride<Overrides[Name]>
      >
    : never;
}>;

function createMockPublicValue(implementation: unknown): unknown {
  return implementation === undefined
    ? {}
    : createExposedServiceValue(implementation);
}

function assertOverrideReferenceName(name: string, reference: unknown) {
  const metaData = getServiceMetaData(reference);

  if (metaData.name !== name) {
    throw new Error(
      `Test override "${name}" does not match craftService/craftDependency reference "${metaData.name}".`,
    );
  }
}

export function mock<
  Implementation extends object,
>(
  implementation: Implementation,
): ImplicitMockServiceOverride<Implementation>;
export function mock<
  Reference extends ServiceReference,
  Implementation extends MockImplementation<GetServiceReferenceOutput<Reference>>,
>(
  reference: Reference,
  implementation: Implementation,
): ExplicitMockServiceOverride<Reference, Implementation>;
export function mock(
  referenceOrImplementation: unknown,
  implementation?: unknown,
): AnyMockServiceOverride {
  if (implementation === undefined) {
    return {
      kind: 'mock',
      implementation: referenceOrImplementation as object,
    };
  }

  return {
    kind: 'mock',
    reference: referenceOrImplementation as ServiceReference,
    implementation: implementation as object,
  };
}

export function provide(): ImplicitRealServiceOverride;
export function provide<
  Reference extends ServiceReference<string, RealCapableScope>,
>(reference: Reference): ExplicitRealServiceOverride<Reference>;
export function provide(reference?: unknown): AnyRealServiceOverride {
  return reference === undefined
    ? { kind: 'provide' }
    : {
        kind: 'provide',
        reference: reference as ServiceReference<string, RealCapableScope>,
      };
}

/**
 * Sets up a `craftService` or `craftDependency` in Angular's `TestBed` with typed
 * dependency coverage.
 *
 * `setupCraftServiceTest` reads the runtime metadata attached to an inject helper
 * or a metadata object and instantiates the target inside an Angular injection
 * context. Its type system checks the dependency tree so required child services
 * are either:
 *
 * - mocked through `mock(...)`
 * - explicitly provided through `provide(...)`
 * - or pruned by mocking one of their ancestors
 *
 * Global dependencies remain optional to override, but can still be mocked. For
 * real Angular providers such as `provideRouter(...)`, use the `options.providers`
 * array.
 *
 * The returned `sut` is the fully injected service output. The returned `mocks`
 * object contains the public mock values actually injected into the test tree.
 *
 * @example
 * Mock a required child service
 * ```ts
 * const { sut, mocks } = setupCraftServiceTest(CounterExtended, {
 *   Counter: mock({
 *     $self: vi.fn(() => 41),
 *     increment: vi.fn(),
 *   }),
 * });
 *
 * sut.incrementCounter();
 * expect(mocks.Counter.increment).toHaveBeenCalledTimes(1);
 * ```
 *
 * @example
 * Use the real router while keeping explicit Angular providers in the test setup
 * ```ts
 * const { sut } = setupCraftServiceTest(Navigation, {}, {
 *   providers: [provideRouter([])],
 * });
 * ```
 *
 * @example
 * Force explicit coverage for a manually provided dependency
 * ```ts
 * const { sut } = setupCraftServiceTest(Navigation, {
 *   Router: provide(),
 * }, {
 *   providers: [provideRouter([])],
 * });
 * ```
 */
export function setupCraftServiceTest<
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
} {
  const internalMetaData = getServiceMetaData(target);
  const providers = [...(options?.providers ?? [])];
  const runtimeOverrides = new Map<string, ServiceRuntimeOverride>();
  const mocks: Record<string, unknown> = {};

  if (
    internalMetaData.scope === 'toProvide' ||
    internalMetaData.scope === 'manuallyProvidedAtRoot'
  ) {
    if (
      !('provide' in internalMetaData) ||
      typeof internalMetaData.provide !== 'function'
    ) {
      throw new Error(
        `Missing provide helper for craftService/craftDependency "${internalMetaData.name}" in setupCraftServiceTest.`,
      );
    }

    providers.push(internalMetaData.provide());
  }

  for (const [name, override] of Object.entries(overrides) as Array<
    [string, AnyServiceOverride | undefined]
  >) {
    if (!override) {
      continue;
    }

    if (override.kind === 'provide') {
      if (override.reference) {
        assertOverrideReferenceName(name, override.reference);
      }

      runtimeOverrides.set(name, {
        kind: 'instantiate',
      });
      continue;
    }

    if (override.reference) {
      assertOverrideReferenceName(name, override.reference);
    }

    const publicValue = createMockPublicValue(override.implementation);

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
