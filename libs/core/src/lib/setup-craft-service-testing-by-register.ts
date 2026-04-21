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
  ResolvedServiceOutput,
  ServiceBindings,
  ServiceReference,
} from './craft-service';
import type { RequirementScope, RootExposureKey, Simplify } from './craft-service.shared';
import type { AssertValidToRegister, RegisterNotReachedEntry, RegisterRealEntry, ToRegister } from './to-register';

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
        `setupCraftServiceTestingByRegister requires a real provider for the SUT "${rootName}".`,
      );
    }

    assertProviderOverrideName(rootName, entry);
    return;
  }

  if (entry !== 'real') {
    throw new Error(
      `setupCraftServiceTestingByRegister requires "${rootName}" to be marked as "real".`,
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
  const Register extends ToRegister<Target>,
  Bindings extends ServiceBindings<Target> | undefined = undefined,
>(
  target: Target,
  register: Register & AssertValidToRegister<Target, Register>,
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
