import {
  type InputSignal,
  type InputSignalWithTransform,
  type Type,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  createExposedServiceValue,
  getRegisteredAppStartServices,
  getServiceMetaData,
  runServiceAppStart,
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
  FlattenDependencyTree,
  MergeObjectUnion,
  RequirementScope,
  RootExposureKey,
  Simplify,
} from './craft-service.shared';

type RegisterRealEntry = 'real';
type RegisterNotReachedEntry = 'notReached';
type AppStartDecision = 'run' | 'ignore';

type TrackingYielded<Tracking> =
  Tracking extends ServiceTrackingMetadata<
    any,
    any,
    any,
    infer Yielded,
    any,
    any,
    any,
    any
  >
    ? Yielded
    : never;

type FlattenedDependencyOutputRecordsFromTracking<Tracking> = Simplify<
  MergeObjectUnion<
    Extract<
      TrackingYielded<Tracking>,
      ServiceYieldRequest<any, any, any>
    > extends infer Request
      ? Request extends ServiceYieldRequest<any, any, infer DependencyTracking>
        ?
            | DependencyOutputRecordFromTracking<DependencyTracking>
            | FlattenedDependencyOutputRecordsFromTracking<DependencyTracking>
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
    any,
    any,
    any
  >
    ? {
        [Key in Name]: Output;
      }
    : never;

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
    FlattenedDependencyOutputRecordsFromTracking<
      GetServiceTrackingMetadata<Target>
    >
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
> =
  DependencyNodeUsesWholeService<Node> extends true
    ? CompleteMockImplementation<DependencyOutputForName<Target, Name>>
    : Simplify<
        MockImplementation<DependencyOutputForName<Target, Name>> &
          RequiredUsedMockImplementation<
            DependencyNodeDerivedPropertiesUsed<Node>
          >
      >;

type ProviderOverrideForNode<Name extends string, Node> =
  DependencyNodeScope<Node> extends RequirementScope
    ? BrandedServiceProvider<
        Name,
        Extract<DependencyNodeScope<Node>, RequirementScope>
      >
    : never;

type OpenMarkerForScope<Scope> =
  Extract<Scope, RequirementScope> extends never ? RegisterRealEntry : never;

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
> =
  RootServiceScope<Target> extends RequirementScope
    ? ProviderOverrideForNode<Name, GetServiceDependenciesTree<Target>>
    : RegisterRealEntry;

type RegisterShapeForTarget<Target extends ServiceReference> = Simplify<{
  [Name in Extract<
    keyof RegisterNodeMap<Target>,
    string
  >]: Name extends RootServiceName<Target>
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

type EntryOpensBranch<Node, Entry> =
  DependencyNodeScope<Node> extends RequirementScope
    ? Entry extends BrandedServiceProvider<any, any>
      ? true
      : false
    : Entry extends RegisterRealEntry
      ? true
      : false;

type ReachableNamesForTree<Tree extends object, Register extends object> = {
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

type DependencyNodeAppStart<Node> = Node extends {
  appStart: infer AppStart extends boolean;
}
  ? true extends AppStart
    ? true
    : false
  : false;

type RealReachableAppStartNames<
  ReachableNames extends string,
  NodeMap extends object,
  Register extends object,
> = Extract<
  {
    [Name in ReachableNames]: Name extends keyof NodeMap
      ? DependencyNodeAppStart<NodeMap[Name]> extends true
        ? Name extends keyof Register
          ? Name extends MockedRegisterKeys<Register>
            ? never
            : RegisterEntryKind<Register[Name]> extends 'notReached'
              ? never
              : Name
          : never
        : never
      : never;
  }[ReachableNames],
  string
>;

type RealReachableServiceAppStartNames<
  Target extends ServiceReference,
  Register extends object,
> = RealReachableAppStartNames<
  Extract<ReachableRegisterNames<Target, Register>, string>,
  RegisterNodeMap<Target>,
  Register
>;

type AppStartDecisionRecord<Names extends string> = Simplify<{
  [Name in Names]-?: AppStartDecision;
}>;

type ReachableNotReachedNames<
  Target extends ServiceReference,
  Register extends object,
> = Extract<
  {
    [Name in Extract<
      ReachableRegisterNames<Target, Register>,
      string
    >]: Name extends keyof Register
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
> =
  RootServiceName<Target> extends keyof Register
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

type ComponentDepsMap<Input> = Input extends { deps: infer Deps extends object }
  ? Deps
  : {};

type ComponentPropertiesDepsMap<Input> = Input extends {
  propertiesDeps: infer PropertiesDeps extends object;
}
  ? PropertiesDeps
  : {};

type ComponentPublicPropertiesMap<Input> = Input extends {
  publicProperties: infer PublicProperties extends object;
}
  ? PublicProperties
  : {};

type ComponentInputValue<Value> =
  Value extends InputSignalWithTransform<any, infer WriteT>
    ? WriteT
    : Value extends InputSignal<infer ReadT>
      ? ReadT
      : Value;

type ComponentTestingInputs<ComponentDeps extends object> = Partial<{
  [Name in Extract<
    keyof ComponentPublicPropertiesMap<ComponentDeps>,
    string
  >]: ComponentInputValue<ComponentPublicPropertiesMap<ComponentDeps>[Name]>;
}>;

type IsComponentGenDepsDependency<Dependency> = Dependency extends {
  deps: infer _Deps extends object;
  provided: infer _Provided extends object;
}
  ? true
  : false;

type IsTrackedDependencyNode<Dependency> = Dependency extends {
  scope: infer _Scope;
  dependencies: infer _Dependencies extends object;
}
  ? true
  : false;

type DependencyMapValue<Dependency> = Dependency extends object
  ? Dependency[Extract<keyof Dependency, string>]
  : never;

type ContainsNestedTestingDependencyEntries<Dependency> = [
  Extract<
    DependencyMapValue<Dependency>,
    | {
        scope: unknown;
        dependencies: object;
      }
    | {
        deps: object;
        provided: object;
      }
  >,
] extends [never]
  ? false
  : true;

type ComponentTestingDependencyTreeFromEntry<Name extends string, Dependency> =
  IsTrackedDependencyNode<Dependency> extends true
    ? { [Key in Name]: Dependency }
    : IsComponentGenDepsDependency<Dependency> extends true
      ? ComponentTestingDependencyTree<Extract<Dependency, object>>
      : Dependency extends object
        ? ContainsNestedTestingDependencyEntries<Dependency> extends true
          ? ComponentTestingDependencyTreeFromDepsMap<Dependency>
          : {}
        : {};

type ComponentTestingDependencyTreeFromDepsMap<Deps extends object> = Simplify<
  MergeObjectUnion<
    {
      [Name in Extract<
        keyof Deps,
        string
      >]: ComponentTestingDependencyTreeFromEntry<Name, Deps[Name]>;
    }[Extract<keyof Deps, string>]
  >
>;

type ComponentTestingDependencyTreeFromPropertiesDeps<
  ComponentDeps extends object,
> = Simplify<
  MergeObjectUnion<
    {
      [PropertyName in Extract<
        keyof ComponentPropertiesDepsMap<ComponentDeps>,
        string
      >]: ComponentPropertiesDepsMap<ComponentDeps>[PropertyName] extends object
        ? ComponentTestingDependencyTreeFromDepsMap<
            ComponentPropertiesDepsMap<ComponentDeps>[PropertyName]
          >
        : {};
    }[Extract<keyof ComponentPropertiesDepsMap<ComponentDeps>, string>]
  >
>;

type ComponentTestingDependencyTree<ComponentDeps extends object> = Simplify<
  ComponentTestingDependencyTreeFromDepsMap<ComponentDepsMap<ComponentDeps>> &
    ComponentTestingDependencyTreeFromPropertiesDeps<ComponentDeps>
>;

type ComponentRegisterNodeMap<ComponentDeps extends object> =
  FlattenDependencyTree<ComponentTestingDependencyTree<ComponentDeps>>;

type ComponentMockImplementationForNode<Node> = Simplify<
  [keyof DependencyNodeDerivedPropertiesUsed<Node>] extends [never]
    ? Record<string, unknown>
    : MockImplementation<unknown> &
        RequiredUsedMockImplementation<
          DependencyNodeDerivedPropertiesUsed<Node>
        >
>;

type ComponentRegisterEntryForNode<Name extends string, Node> =
  | OpenRegisterEntryForNode<Name, Node>
  | ComponentMockImplementationForNode<Node>
  | RegisterNotReachedEntry;

type ComponentRegisterShape<ComponentDeps extends object> = Simplify<{
  [Name in Extract<
    keyof ComponentRegisterNodeMap<ComponentDeps>,
    string
  >]: ComponentRegisterEntryForNode<
    Name,
    ComponentRegisterNodeMap<ComponentDeps>[Name]
  >;
}>;

type ComponentRegisterNames<ComponentDeps extends object> = Extract<
  keyof ComponentRegisterShape<ComponentDeps>,
  string
>;

type ReachableComponentRegisterNames<
  ComponentDeps extends object,
  Register extends object,
> = ReachableNamesForTree<
  ComponentTestingDependencyTree<ComponentDeps>,
  Register
>;

type RealReachableComponentAppStartNames<
  ComponentDeps extends object,
  Register extends object,
> = RealReachableAppStartNames<
  Extract<ReachableComponentRegisterNames<ComponentDeps, Register>, string>,
  ComponentRegisterNodeMap<ComponentDeps>,
  Register
>;

type ReachableComponentNotReachedNames<
  ComponentDeps extends object,
  Register extends object,
> = Extract<
  {
    [Name in Extract<
      ReachableComponentRegisterNames<ComponentDeps, Register>,
      string
    >]: Name extends keyof Register
      ? RegisterEntryKind<Register[Name]> extends 'notReached'
        ? Name
        : never
      : Name;
  }[Extract<ReachableComponentRegisterNames<ComponentDeps, Register>, string>],
  string
>;

type UnreachableComponentNonNotReachedNames<
  ComponentDeps extends object,
  Register extends object,
> = Extract<
  {
    [Name in Exclude<
      ComponentRegisterNames<ComponentDeps>,
      Extract<ReachableComponentRegisterNames<ComponentDeps, Register>, string>
    >]: Name extends keyof Register
      ? RegisterEntryKind<Register[Name]> extends 'notReached'
        ? never
        : Name
      : never;
  }[Exclude<
    ComponentRegisterNames<ComponentDeps>,
    Extract<ReachableComponentRegisterNames<ComponentDeps, Register>, string>
  >],
  string
>;

type ExtraComponentRegisterKeys<
  ComponentDeps extends object,
  Register extends object,
> = Exclude<
  Extract<keyof Register, string>,
  ComponentRegisterNames<ComponentDeps>
>;

type AssertValidComponentRegister<
  ComponentDeps extends object,
  Register extends object,
> = [ExtraComponentRegisterKeys<ComponentDeps, Register>] extends [never]
  ? [ReachableComponentNotReachedNames<ComponentDeps, Register>] extends [never]
    ? [
        UnreachableComponentNonNotReachedNames<ComponentDeps, Register>,
      ] extends [never]
      ? {}
      : {
          ERROR_register_entries_must_be_notReached: UnreachableComponentNonNotReachedNames<
            ComponentDeps,
            Register
          >;
        }
    : {
        ERROR_register_entries_cannot_be_notReached: ReachableComponentNotReachedNames<
          ComponentDeps,
          Register
        >;
      }
  : {
      ERROR_invalid_register_keys: ExtraComponentRegisterKeys<
        ComponentDeps,
        Register
      >;
    };

type SetupComponentTestingRegister<ComponentDeps extends object> =
  ComponentRegisterShape<ComponentDeps>;

type PublicMockShape<Implementation> = Implementation extends object
  ? Omit<Implementation, RootExposureKey>
  : {};

type MockRootCallable<Implementation> =
  NonNullable<Implementation> extends {
    $self: infer Root extends (...args: any[]) => any;
  }
    ? Root
    : never;

type MockPublicValueFromImplementation<Implementation> = [
  Implementation,
] extends [undefined]
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

type BaseServiceTestingByRegisterOptions<
  Bindings extends ServiceBindings<any> | undefined,
> = {
  bindings?: Bindings;
  providers?: CraftServiceProvider[];
  appStart?: Record<string, AppStartDecision>;
};

type ServiceTestingByRegisterOptionsParameter<
  Target extends ServiceReference,
  Register extends object,
  Bindings extends ServiceBindings<Target> | undefined,
> = [RealReachableServiceAppStartNames<Target, Register>] extends [never]
  ? [options?: BaseServiceTestingByRegisterOptions<Bindings>]
  : [
      options: BaseServiceTestingByRegisterOptions<Bindings> & {
        appStart: AppStartDecisionRecord<
          RealReachableServiceAppStartNames<Target, Register>
        >;
      },
    ];

type BaseComponentTestingByRegisterOptions<ComponentDeps extends object> = {
  providers?: CraftServiceProvider[];
  imports?: unknown[];
  inputs?: ComponentTestingInputs<ComponentDeps>;
  detectChanges?: boolean;
  appStart?: Record<string, AppStartDecision>;
};

type ComponentTestingByRegisterOptionsParameter<
  ComponentDeps extends object,
  Register extends object,
> = [RealReachableComponentAppStartNames<ComponentDeps, Register>] extends [
  never,
]
  ? [options?: BaseComponentTestingByRegisterOptions<ComponentDeps>]
  : [
      options: BaseComponentTestingByRegisterOptions<ComponentDeps> & {
        appStart: AppStartDecisionRecord<
          RealReachableComponentAppStartNames<ComponentDeps, Register>
        >;
      },
    ];

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

  return Reflect.get(value, CRAFT_SERVICE_PROVIDER_BRAND) as
    | { name: string; scope: RequirementScope }
    | undefined;
}

function isProviderOverride(
  value: unknown,
): value is BrandedServiceProvider<string, RequirementScope> {
  return getProviderOverrideMeta(value) !== undefined;
}

function assertProviderOverrideName(name: string, provider: unknown) {
  const metaData = getProviderOverrideMeta(provider);

  if (!metaData) {
    throw new Error(`Expected a raw provider returned by provide${name}(...).`);
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
  entry: RuntimeRegisterEntry | undefined,
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

function isRealRuntimeRegisterEntry(entry: RuntimeRegisterEntry | undefined) {
  return entry === 'real' || isProviderOverride(entry);
}

function isPrunedOrMockedRuntimeRegisterEntry(
  entry: RuntimeRegisterEntry | undefined,
) {
  return (
    entry === undefined ||
    entry === 'notReached' ||
    (entry !== 'real' && !isProviderOverride(entry))
  );
}

function createRegisterTestingContext(
  register: Record<string, RuntimeRegisterEntry>,
  optionsProviders: CraftServiceProvider[] | undefined,
  root?: { name: string; scope: string },
) {
  const providers = [...(optionsProviders ?? [])];
  const runtimeOverrides = new Map<
    string,
    { kind: 'useValue'; value: unknown }
  >();
  const mocks: Record<string, unknown> = {};

  if (root) {
    const rootEntry = register[root.name];

    assertRootRuntimeEntry(root.name, root.scope, rootEntry);
  }

  for (const [name, entry] of Object.entries(register)) {
    if (root && name === root.name) {
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

  return {
    providers,
    mocks,
  };
}

async function runConfiguredAppStartHooks(
  register: Record<string, RuntimeRegisterEntry>,
  appStart: Record<string, AppStartDecision> | undefined,
  helperName: string,
) {
  const appStartReferences = new Map(
    getRegisteredAppStartServices().map((reference) => {
      const metaData = getServiceMetaData(reference);
      return [metaData.name, reference] as const;
    }),
  );
  const missingDecisions = Array.from(appStartReferences)
    .filter(([name]) => isRealRuntimeRegisterEntry(register[name]))
    .filter(([name]) => appStart?.[name] === undefined)
    .map(([name]) => name);

  if (missingDecisions.length > 0) {
    throw new Error(
      `${helperName} requires options.appStart decisions for: ${missingDecisions.join(
        ', ',
      )}.`,
    );
  }

  if (!appStart) {
    return;
  }

  await TestBed.runInInjectionContext(async () => {
    for (const [name, decision] of Object.entries(appStart)) {
      if (decision !== 'run' && decision !== 'ignore') {
        throw new Error(
          `Invalid appStart decision for "${name}". Expected "run" or "ignore".`,
        );
      }

      const registerEntry = register[name];

      if (isPrunedOrMockedRuntimeRegisterEntry(registerEntry)) {
        continue;
      }

      const reference = appStartReferences.get(name);

      if (!reference) {
        throw new Error(
          `Register entry "${name}" is not a craftService configured with appStart: true.`,
        );
      }

      if (decision === 'ignore') {
        continue;
      }

      const metaData = getServiceMetaData(reference);
      const instance = metaData.inject();
      await waitForAppStartResult(runServiceAppStart(reference, instance));
    }
  });
}

async function waitForAppStartResult(result: unknown): Promise<void> {
  if (isPromiseLike(result)) {
    await result;
    return;
  }

  if (isObservableLike(result)) {
    await new Promise<void>((resolve, reject) => {
      let subscription: unknown;
      const complete = () => {
        if (subscription && typeof subscription === 'object') {
          const unsubscribe = Reflect.get(subscription, 'unsubscribe');
          if (typeof unsubscribe === 'function') {
            Reflect.apply(unsubscribe, subscription, []);
          }
        }

        resolve();
      };

      subscription = result.subscribe({
        error: reject,
        complete,
      });
    });
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function isObservableLike(value: unknown): value is {
  subscribe: (observer: {
    error: (error: unknown) => void;
    complete: () => void;
  }) => unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'subscribe' in value &&
    typeof value.subscribe === 'function'
  );
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
 *
 * The returned `sut` is the resolved root service. The returned `mocks` object
 * only contains entries for dependencies that were actually mocked with raw
 * objects.
 *
 * @example
 * ```ts
 * const { sut, mocks } = await setupCraftServiceTestingByRegister(
 *   injectCounterConsumer,
 *   {
 *     CounterConsumer: provideCounterConsumer(),
 *     Counter: {
 *       $self: vi.fn(() => 41),
 *       increment: vi.fn(),
 *     },
 *   },
 * );
 *
 * expect(sut.read()).toBe(41);
 * expect(mocks.Counter.increment).toBeDefined();
 * ```
 */
export async function setupCraftServiceTestingByRegister<
  Target extends ServiceReference,
  const Register extends SetupTestingRegister<Target>,
  Bindings extends ServiceBindings<Target> | undefined = undefined,
>(
  target: Target,
  register: Register & AssertValidRegister<Target, Register>,
  ...[options]: ServiceTestingByRegisterOptionsParameter<
    Target,
    Register,
    Bindings
  >
): Promise<{
  sut: ResolvedServiceOutput<Target, Bindings>;
  mocks: CreateRegisterMocks<Register>;
}> {
  const internalMetaData = getServiceMetaData(target);
  const runtimeRegister = register as Record<string, RuntimeRegisterEntry>;
  const { providers, mocks } = createRegisterTestingContext(
    runtimeRegister,
    options?.providers,
    {
      name: internalMetaData.name,
      scope: internalMetaData.scope,
    },
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers,
  });

  const result = TestBed.runInInjectionContext(() => ({
    sut:
      options?.bindings === undefined
        ? internalMetaData.inject()
        : internalMetaData.inject(options.bindings),
    mocks,
  })) as {
    sut: ResolvedServiceOutput<Target, Bindings>;
    mocks: CreateRegisterMocks<Register>;
  };

  await runConfiguredAppStartHooks(
    runtimeRegister,
    options?.appStart,
    'setupCraftServiceTestingByRegister',
  );

  return result;
}

export async function setupCraftComponentTestingByRegister<
  ComponentInstance,
  ComponentDeps extends object,
  const Register extends SetupComponentTestingRegister<ComponentDeps>,
>(
  componentType: Type<ComponentInstance>,
  _componentDeps: ComponentDeps,
  register: Register & AssertValidComponentRegister<ComponentDeps, Register>,
  ...[options]: ComponentTestingByRegisterOptionsParameter<
    ComponentDeps,
    Register
  >
): Promise<{
  fixture: ComponentFixture<ComponentInstance>;
  component: ComponentInstance;
  nativeElement: HTMLElement;
  mocks: CreateRegisterMocks<Register>;
}> {
  const runtimeRegister = register as Record<string, RuntimeRegisterEntry>;
  const { providers, mocks } = createRegisterTestingContext(
    runtimeRegister,
    options?.providers,
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [componentType, ...(options?.imports ?? [])],
    providers,
  });

  await runConfiguredAppStartHooks(
    runtimeRegister,
    options?.appStart,
    'setupCraftComponentTestingByRegister',
  );

  const fixture = TestBed.createComponent(componentType);

  for (const [name, value] of Object.entries(options?.inputs ?? {})) {
    fixture.componentRef.setInput(name, value);
  }

  if (options?.detectChanges ?? true) {
    fixture.detectChanges();
  }

  return {
    fixture,
    component: fixture.componentInstance,
    nativeElement: fixture.nativeElement as HTMLElement,
    mocks: mocks as CreateRegisterMocks<Register>,
  };
}

/** Backward-compatible alias for `setupCraftServiceTestingByRegister`. */
export const setupTestingService = setupCraftServiceTestingByRegister;
