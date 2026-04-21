import type {
  BrandedServiceProvider,
  GetInjectedServiceDependencies,
  GetMergedServiceDependencyNodeMap,
  GetServiceReferenceMeta,
  GetServiceReferenceOutput,
  GetServiceTrackingMetadata,
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

export type ServiceResolutionStatus = 'provided' | 'mocked';

export type RegisterRealEntry = 'real';
export type RegisterNotReachedEntry = 'notReached';

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

type ServiceDependencyChildren<Target extends ServiceReference> =
  GetServiceDependenciesTree<Target> extends {
    dependencies: infer Dependencies extends object;
  }
    ? Dependencies
    : {};

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
  ProviderOverrideForNode<Name, Node> | OpenMarkerForScope<DependencyNodeScope<Node>>;

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

export type AssertValidToRegister<
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

export type ToRegister<Target extends ServiceReference> =
  RegisterShapeForTarget<Target>;
