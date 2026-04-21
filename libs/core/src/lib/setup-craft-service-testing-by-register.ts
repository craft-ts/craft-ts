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
  GetMergedServiceDependencyNodeMap,
  GetServiceReferenceMeta,
  GetServiceReferenceOutput,
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
} from './craft-service.shared';

type RegisterRealEntry = 'real';
type RegisterNotReachedEntry = 'notReached';

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
  Tracking extends ServiceTrackingMetadata<
    infer Name extends string,
    any,
    infer Output,
    any,
    any,
    any
  >
    ? {
        [Key in Name]: Output;
      }
    : never;

type GetServiceDependenciesTree<Target extends ServiceReference> =
  Target extends ServiceMetaData<any, any, any, any, infer Dependencies, any, any>
    ? Dependencies
    : GetInjectedServiceDependencies<Target>;

type RootServiceName<Target extends ServiceReference> = Extract<
  GetServiceReferenceMeta<Target>['name'],
  string
>;

type RootServiceScope<Target extends ServiceReference> = Extract<
  GetServiceReferenceMeta<Target>['scope'],
  ConcreteServiceScope
>;

type RootNodeRecord<Target extends ServiceReference> = {
  [Name in RootServiceName<Target>]: GetServiceDependenciesTree<Target>;
};

type RegisterNodeMap<Target extends ServiceReference> = Simplify<
  RootNodeRecord<Target> & GetMergedServiceDependencyNodeMap<Target>
>;

type RootOutputRecord<Target extends ServiceReference> = {
  [Name in RootServiceName<Target>]: GetServiceReferenceOutput<Target>;
};

type DependencyOutputMap<Target extends ServiceReference> = Simplify<
  RootOutputRecord<Target> &
    FlattenedDependencyOutputRecordsFromTracking<GetServiceTrackingMetadata<Target>>
>;

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

type CompleteMockImplementation<Output> = Simplify<
  (Output extends object
    ? {
        [Key in Extract<keyof Output, string>]-?: Output[Key];
      }
    : {}) &
    (Output extends (...args: any[]) => any
      ? { $self: CallableShell<Output> }
      : {})
>;

type DependencyNodeUsesWholeService<Node> = Node extends {
  usesWholeService: true;
}
  ? true
  : false;

type MockImplementationForNode<
  Target extends ServiceReference,
  Name extends string,
  Node,
> = DependencyNodeUsesWholeService<Node> extends true
  ? CompleteMockImplementation<DependencyOutputForName<Target, Name>>
  : Simplify<
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

type OpenMarkerForScope<Scope> = Extract<Scope, RequirementScope> extends never
  ? RegisterRealEntry
  : never;

type OpenRegisterEntryForNode<Name extends string, Node> =
  | ProviderOverrideForNode<Name, Node>
  | OpenMarkerForScope<DependencyNodeScope<Node>>;

type RegisterEntryForNode<
  Target extends ServiceReference,
  Name extends string,
  Node,
> =
  | OpenRegisterEntryForNode<Name, Node>
  | MockImplementationForNode<Target, Name, Node>
  | RegisterNotReachedEntry;

type RootRegisterEntry<
  Target extends ServiceReference,
  Name extends RootServiceName<Target>,
> = RootServiceScope<Target> extends RequirementScope
  ? ProviderOverrideForNode<Name, GetServiceDependenciesTree<Target>>
  : RegisterRealEntry;

type RegisterShapeForTarget<Target extends ServiceReference> = Simplify<{
  [Name in Extract<keyof RegisterNodeMap<Target>, string>]: Name extends RootServiceName<Target>
    ? RootRegisterEntry<Target, Extract<Name, RootServiceName<Target>>>
    : RegisterEntryForNode<Target, Name, RegisterNodeMap<Target>[Name]>;
}>;

type RegisterEntryKind<Entry> = Entry extends RegisterNotReachedEntry
  ? 'notReached'
  : Entry extends RegisterRealEntry
    ? 'real'
    : Entry extends BrandedServiceProvider<any, any>
      ? 'provider'
      : 'mock';

type EntryOpensBranch<Node, Entry> = DependencyNodeScope<Node> extends RequirementScope
  ? Entry extends BrandedServiceProvider<any, any>
    ? true
    : false
  : Entry extends RegisterRealEntry
    ? true
    : false;

type ReachableNamesForTree<
  Tree extends object,
  Register extends object,
> = {
  [Name in Extract<keyof Tree, string>]: ReachableNamesForNode<
    Name,
    Tree[Name],
    Register
  >;
}[Extract<keyof Tree, string>];

type ReachableNamesForNode<
  Name extends string,
  Node,
  Register extends object,
> =
  | Name
  | (EntryOpensBranch<
      Node,
      Name extends keyof Register ? Register[Name] : never
    > extends true
      ? ReachableNamesForTree<DependencyTreeChildren<Node>, Register>
      : never);

type ReachableRegisterNames<
  Target extends ServiceReference,
  Register extends object,
> = ReachableNamesForNode<
  RootServiceName<Target>,
  GetServiceDependenciesTree<Target>,
  Register
>;

type RegisterNames<Target extends ServiceReference> = Extract<
  keyof RegisterShapeForTarget<Target>,
  string
>;

type ReachableNotReachedNames<
  Target extends ServiceReference,
  Register extends object,
> = Extract<
  {
    [Name in Extract<ReachableRegisterNames<Target, Register>, string>]: Name extends keyof Register
      ? RegisterEntryKind<Register[Name]> extends 'notReached'
        ? Name
        : never
      : Name;
  }[Extract<ReachableRegisterNames<Target, Register>, string>],
  string
>;

type UnreachableNonNotReachedNames<
  Target extends ServiceReference,
  Register extends object,
> = Extract<
  {
    [Name in Exclude<
      RegisterNames<Target>,
      Extract<ReachableRegisterNames<Target, Register>, string>
    >]: Name extends keyof Register
      ? RegisterEntryKind<Register[Name]> extends 'notReached'
        ? never
        : Name
      : never;
  }[Exclude<
    RegisterNames<Target>,
    Extract<ReachableRegisterNames<Target, Register>, string>
  >],
  string
>;

type ExtraRegisterKeys<
  Target extends ServiceReference,
  Register extends object,
> = Exclude<Extract<keyof Register, string>, RegisterNames<Target>>;

type InvalidRootRegisterValue<
  Target extends ServiceReference,
  Register extends object,
> = RootServiceName<Target> extends keyof Register
  ? Register[RootServiceName<Target>] extends RootRegisterEntry<
        Target,
        RootServiceName<Target>
      >
    ? never
    : RootServiceName<Target>
  : RootServiceName<Target>;

type AssertValidRegister<
  Target extends ServiceReference,
  Register extends object,
> = [ExtraRegisterKeys<Target, Register>] extends [never]
  ? [InvalidRootRegisterValue<Target, Register>] extends [never]
    ? [ReachableNotReachedNames<Target, Register>] extends [never]
      ? [UnreachableNonNotReachedNames<Target, Register>] extends [never]
        ? {}
        : {
            ERROR_register_entries_must_be_notReached: UnreachableNonNotReachedNames<
              Target,
              Register
            >;
          }
      : {
          ERROR_register_entries_cannot_be_notReached: ReachableNotReachedNames<
            Target,
            Register
          >;
        }
    : {
        ERROR_invalid_root_register_value: InvalidRootRegisterValue<
          Target,
          Register
        >;
      }
  : {
      ERROR_invalid_register_keys: ExtraRegisterKeys<Target, Register>;
    };

type SetupTestingRegister<Target extends ServiceReference> =
  RegisterShapeForTarget<Target>;

type PublicMockShape<Implementation> = Implementation extends object
  ? Omit<Implementation, RootExposureKey>
  : {};

type MockRootCallable<Implementation> = NonNullable<Implementation> extends {
  $self: infer Root extends (...args: any[]) => any;
}
  ? Root
  : never;

type MockPublicValueFromImplementation<Implementation> = [Implementation] extends [
  undefined,
]
  ? {}
  : [MockRootCallable<Implementation>] extends [never]
    ? PublicMockShape<NonNullable<Implementation>>
    : MockRootCallable<Implementation> &
        PublicMockShape<NonNullable<Implementation>>;

type MockedRegisterKeys<Register extends object> = Extract<
  {
    [Name in Extract<keyof Register, string>]: Register[Name] extends
      | RegisterRealEntry
      | RegisterNotReachedEntry
      | BrandedServiceProvider<any, any>
      ? never
      : Name;
  }[Extract<keyof Register, string>],
  string
>;

type CreateRegisterMocks<Register extends object> = Simplify<{
  [Name in MockedRegisterKeys<Register>]: MockPublicValueFromImplementation<
    Register[Name]
  >;
}>;

type RuntimeRegisterEntry =
  | BrandedServiceProvider<string, RequirementScope>
  | Record<string, unknown>
  | RegisterRealEntry
  | RegisterNotReachedEntry;

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

  return Reflect.get(
    value,
    CRAFT_SERVICE_PROVIDER_BRAND,
  ) as { name: string; scope: RequirementScope } | undefined;
}

function isProviderOverride(
  value: unknown,
): value is BrandedServiceProvider<string, RequirementScope> {
  return getProviderOverrideMeta(value) !== undefined;
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
      `Register entry "${name}" does not match provider value for "${metaData.name}".`,
    );
  }
}

function assertRootRuntimeEntry(
  rootName: string,
  rootScope: string,
  entry: RuntimeRegisterEntry,
) {
  if (rootScope === 'toProvide' || rootScope === 'manuallyProvidedAtRoot') {
    if (!isProviderOverride(entry)) {
      throw new Error(
        `setupTestingService requires a real provider for the SUT "${rootName}".`,
      );
    }

    assertProviderOverrideName(rootName, entry);
    return;
  }

  if (entry !== 'real') {
    throw new Error(
      `setupTestingService requires "${rootName}" to be marked as "real".`,
    );
  }
}

/**
 * Sets up a crafted service from an explicit flat register derived from its full
 * dependency graph.
 *
 * Each dependency must be present in the register and resolved as one of:
 * - a real provider for `toProvide` / `manuallyProvidedAtRoot`
 * - the literal `"real"` for non-provider scopes
 * - a raw mock object
 * - the literal `"notReached"` when the node is fully pruned by mocked ancestors
 */
export function setupCraftServiceTestingByRegister<
  Target extends ServiceReference,
  const Register extends SetupTestingRegister<Target>,
  Bindings extends ServiceBindings<Target> | undefined = undefined,
>(
  target: Target,
  register: Register & AssertValidRegister<Target, Register>,
  options?: {
    bindings?: Bindings;
    providers?: CraftServiceProvider[];
  },
): {
  sut: ResolvedServiceOutput<Target, Bindings>;
  mocks: CreateRegisterMocks<Register>;
} {
  const internalMetaData = getServiceMetaData(target);
  const providers = [...(options?.providers ?? [])];
  const runtimeOverrides = new Map<string, { kind: 'useValue'; value: unknown }>();
  const mocks: Record<string, unknown> = {};
  const rootEntry = register[
    internalMetaData.name as keyof Register
  ] as RuntimeRegisterEntry;

  assertRootRuntimeEntry(
    internalMetaData.name,
    internalMetaData.scope,
    rootEntry,
  );

  for (const [name, entry] of Object.entries(register) as Array<
    [string, RuntimeRegisterEntry]
  >) {
    if (name === internalMetaData.name) {
      if (isProviderOverride(entry)) {
        providers.push(entry);
      }

      continue;
    }

    if (entry === 'real' || entry === 'notReached') {
      continue;
    }

    if (isProviderOverride(entry)) {
      assertProviderOverrideName(name, entry);
      providers.push(entry);
      continue;
    }

    const publicValue = createMockPublicValue(entry);

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
    mocks: CreateRegisterMocks<Register>;
  };
}

export const setupTestingService = setupCraftServiceTestingByRegister;
