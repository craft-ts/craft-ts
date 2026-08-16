import {
  createEnvironmentInjector,
  ErrorHandler,
  getCraftRootDefaultProviders,
  type EnvironmentInjector,
  inject,
  Injector,
  runInInjectionContext,
  ɵEffectScheduler,
  ɵINJECTOR_SCOPE,
} from './host/craft-compat';
import {
  createExposedServiceValue,
  getServiceMetaData,
  SERVICE_RUNTIME_OVERRIDES,
} from './craft-service';
import { CRAFT_SERVICE_PROVIDER_BRAND } from './craft-service.shared';
import { ɵcraftInjectorFromHost } from './host/angular-craft-injector-host';
import {
  createCraftInjector,
  type CraftInjector,
  type CraftProvider,
} from './host/craft-injector';
import type {
  BrandedServiceProvider,
  CraftServiceProvider,
  GetServiceDependencies,
  GetServiceReferenceOutput,
  ResolvedServiceOutput,
  ServiceBindings,
  ServiceMetaData,
  ServiceReference,
} from './craft-service';
import type {
  CallableShell,
  ConcreteServiceScope,
  DependencyNodeScope,
  DependencyTreeChildren,
  FlattenDependencyTree,
  RequirementScope,
  RootExposureKey,
  Simplify,
} from './craft-service.shared';

type GetServiceDependenciesTree<Target extends ServiceReference> =
  Target extends ServiceMetaData<
    any,
    any,
    any,
    any,
    infer Dependencies,
    any,
    any,
    any,
    any,
    any,
    boolean
  >
    ? Dependencies
    : GetServiceDependencies<Target>;

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

type RequiredUsedMockImplementation<UsedProperties extends object> = Simplify<{
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

type MockRootCallable<Implementation> =
  NonNullable<Implementation> extends {
    $self: infer Root extends (...args: any[]) => any;
  }
    ? CallableShell<Root>
    : never;

type MockPublicValueFromImplementation<Implementation> = [
  Implementation,
] extends [undefined]
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

type AnyServiceOverride =
  | AnyMockServiceOverride
  | BrandedServiceProvider<string, RequirementScope>;

type OverrideForDependencyNode<Name extends string, Node> =
  | ImplicitMockServiceOverride<MockImplementationForNode<Node>>
  | ExplicitMockServiceOverride<
      ServiceReference<
        Name,
        Extract<DependencyNodeScope<Node>, ConcreteServiceScope>
      >,
      MockImplementationForNode<Node>
    >
  | (DependencyNodeScope<Node> extends RequirementScope
      ? BrandedServiceProvider<
          Name,
          Extract<DependencyNodeScope<Node>, RequirementScope>
        >
      : never);

type MissingCoverageForTree<Tree extends object, Overrides> = {
  [Name in Extract<keyof Tree, string>]: MissingCoverageForNode<
    Name,
    Tree[Name],
    Overrides
  >;
}[Extract<keyof Tree, string>];

type OverrideAtPath<
  Overrides,
  Name extends string,
> = Name extends keyof Overrides ? NonNullable<Overrides[Name]> : never;

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

type InvalidOverrideEntries<Target extends ServiceReference, Overrides> = {
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

type MissingCoverageForNode<Name extends string, Node, Overrides> = [
  OverrideAtPath<Overrides, Name>,
] extends [never]
  ? DependencyNodeScope<Node> extends RequirementScope
    ? Name
    : MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
  : OverrideAtPath<Overrides, Name> extends AnyMockServiceOverride
    ? never
    : OverrideAtPath<Overrides, Name> extends BrandedServiceProvider<
          Name,
          RequirementScope
        >
      ? MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>
      : DependencyNodeScope<Node> extends RequirementScope
        ? Name
        : MissingCoverageForTree<DependencyTreeChildren<Node>, Overrides>;

type AssertServiceTestCoverage<Target extends ServiceReference, Overrides> = [
  MissingCoverageForTree<ServiceDependencyChildren<Target>, Overrides>,
] extends [never]
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

  return Reflect.get(value, CRAFT_SERVICE_PROVIDER_BRAND) as
    | { name: string; scope: RequirementScope }
    | undefined;
}

function assertOverrideReferenceName(name: string, reference: unknown) {
  const metaData = getServiceMetaData(reference);

  if (metaData.name !== name) {
    throw new Error(
      `Test override "${name}" does not match craftService/toCraftService reference "${metaData.name}".`,
    );
  }
}

function assertProviderOverrideName(name: string, provider: unknown) {
  const metaData = getProviderOverrideMeta(provider);

  if (!metaData) {
    throw new Error(`Expected a raw provider returned by provide${name}(...).`);
  }

  if (metaData.name !== name) {
    throw new Error(
      `Test override "${name}" does not match provider value for "${metaData.name}".`,
    );
  }
}

function isMockServiceOverride(
  override: AnyServiceOverride,
): override is AnyMockServiceOverride {
  return (
    typeof override === 'object' &&
    override !== null &&
    'kind' in override &&
    override.kind === 'mock'
  );
}

export function mock<Implementation extends object>(
  implementation: Implementation,
): ImplicitMockServiceOverride<Implementation>;
export function mock<
  Reference extends ServiceReference,
  Implementation extends MockImplementation<
    GetServiceReferenceOutput<Reference>
  >,
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

/**
 * Sets up a `craftService` or `toCraftService` in an isolated injector with
 * typed dependency coverage.
 *
 * `setupCraftServiceTest` reads the runtime metadata attached to an inject helper
 * or a metadata object and instantiates the target inside an isolated injection
 * context. Its type system checks the dependency tree so required child services
 * are either:
 *
 * - mocked through `mock(...)`
 * - covered by the real raw provider returned by `provideX(...)`
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
 *   Router: provideAppRouter(),
 * });
 * ```
 */
function createAngularHostCraftInjector(
  extraProviders: readonly CraftServiceProvider[] = [],
): { injector: CraftInjector; environmentInjector: EnvironmentInjector } {
  const environmentInjector = createEnvironmentInjector(
    [
      ...getCraftRootDefaultProviders(),
      { provide: ɵINJECTOR_SCOPE, useValue: 'root' },
      { provide: ErrorHandler, useClass: ErrorHandler },
      ...extraProviders,
    ],
    Injector.NULL as EnvironmentInjector,
    'setupCraftServiceTest',
  );
  return {
    environmentInjector,
    injector: ɵcraftInjectorFromHost(environmentInjector),
  };
}

/** Flush queued microtasks and the host effect scheduler without TestBed.tick(). */
export async function flushCraftTest(injector: CraftInjector): Promise<void> {
  const flushScheduler = () => {
    injector.run(() => {
      inject(ɵEffectScheduler).flush();
    });
  };
  for (let index = 0; index < 5; index += 1) {
    flushScheduler();
    await Promise.resolve();
  }
  flushScheduler();
}

export function setupCraftServiceTest(): { injector: CraftInjector };
export function setupCraftServiceTest(options: {
  providers: readonly CraftProvider[];
}): { injector: CraftInjector };
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
  injector: CraftInjector;
};
export function setupCraftServiceTest(
  targetOrOptions?: ServiceReference | { providers: readonly CraftProvider[] },
  overrides?: Record<string, unknown>,
  options?: {
    bindings?: ServiceBindings<ServiceReference>;
    providers?: CraftServiceProvider[];
  },
):
  | {
      injector: CraftInjector;
    }
  | {
      sut: unknown;
      mocks: Record<string, unknown>;
      injector: CraftInjector;
    } {
  if (arguments.length === 0) {
    return {
      injector: createAngularHostCraftInjector().injector,
    };
  }

  if (arguments.length === 1) {
    const nativeOptions = targetOrOptions as {
      providers: readonly CraftProvider[];
    };
    return {
      injector: createCraftInjector(nativeOptions.providers),
    };
  }

  const target = targetOrOptions as ServiceReference;
  const internalMetaData = getServiceMetaData(target);
  const providers: CraftServiceProvider[] = [...(options?.providers ?? [])];
  const runtimeOverrides = new Map<
    string,
    { kind: 'useValue'; value: unknown }
  >();
  const mocks: Record<string, unknown> = {};
  const hasExplicitTargetProvider = providers.some(
    (provider) =>
      getProviderOverrideMeta(provider)?.name === internalMetaData.name,
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
        `Missing provide helper for craftService/toCraftService "${internalMetaData.name}" in setupCraftServiceTest.`,
      );
    }

    if (!hasExplicitTargetProvider) {
      if (Reflect.get(internalMetaData, 'usesProvidedInput') === true) {
        throw new Error(
          `setupCraftServiceTest requires an explicit provider for "${internalMetaData.name}" because it uses $provided.`,
        );
      }

      providers.push(internalMetaData.provide());
    }
  }

  for (const [name, override] of Object.entries(overrides ?? {}) as Array<
    [string, AnyServiceOverride | undefined]
  >) {
    if (!override) {
      continue;
    }

    if (!isMockServiceOverride(override)) {
      assertProviderOverrideName(name, override);
      providers.push(override);
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

  const { environmentInjector, injector } =
    createAngularHostCraftInjector(providers);

  return injector.run(() =>
    runInInjectionContext(environmentInjector, () => ({
      sut:
        options?.bindings === undefined
          ? internalMetaData.inject()
          : internalMetaData.inject(options.bindings),
      mocks,
      injector,
    })),
  ) as {
    sut: unknown;
    mocks: Record<string, unknown>;
    injector: CraftInjector;
  };
}
