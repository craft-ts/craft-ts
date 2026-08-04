import { HOST_TAG_LIST } from './host-tag';
import {
  getServiceMetaData,
  type GetServiceReferenceMeta,
  type GetServiceReferenceOutput,
  type ServiceReference,
} from './craft-service';
import {
  CRAFT_REGISTRATION_TARGET,
  createRegisterForRegistry,
  REGISTER_FOR_REGISTRY,
  registerResolvedService,
  type CraftRegistrationTarget,
  type RegisterForEntry,
  type RegisterForRegistry,
  type RegisterForSignal,
  type RegisterForTargetDescriptor,
} from './craft-register-for-runtime';
import {
  isGenerator,
  provideServiceYieldWrapper,
} from './craft-generator-runtime';
import { provideCraftTargetWrapper } from './craft-target-runtime';
import {
  assertInInjectionContext,
  inject,
  InjectionToken,
  Injector,
  type Provider,
} from '@angular/core';

export {
  CRAFT_REGISTRATION_TARGET,
  REGISTER_FOR_REGISTRY,
  type CraftRegistrationTarget,
  type RegisterForEntry,
  type RegisterForRegistry,
  type RegisterForSignal,
};

export type RegisterForOptions = Readonly<{
  /** Track global services resolved below this register. Defaults to true. */
  includeGlobal?: boolean;
}>;

export type RegisterForExposureTokens<Value> = Readonly<{
  /** The complete live signal for the selected register group. */
  $self: RegisterForSignal<Value>;
}>;

export type RegisterForExposureSelector<Value, Exposed> = (
  tokens: RegisterForExposureTokens<Value>,
) => Exposed | Generator<unknown, Exposed, unknown>;

type AnyRegisterTarget = ServiceReference | CraftRegistrationTarget;

type TargetName<Target> = Target extends ServiceReference
  ? GetServiceReferenceMeta<Target>['name']
  : Target extends CraftRegistrationTarget<infer Name, any, any>
    ? Name
    : never;

type TargetReference<Target> = Target extends ServiceReference
  ? GetServiceReferenceOutput<Target>
  : Target extends CraftRegistrationTarget<any, any, infer Instance>
    ? Instance
    : never;

type TargetNames<Targets extends readonly AnyRegisterTarget[]> = Extract<
  TargetName<Targets[number]>,
  string
>;

type GroupKey<Name extends string> = Capitalize<Name>;

type SignalForTarget<Target> = RegisterForSignal<TargetReference<Target>>;

type RegisterForProjectionResult<Result> =
  Result extends Generator<infer Yielded, infer Output, unknown>
    ? { yielded: Yielded; output: Output }
    : { yielded: never; output: Result };

type RegisterForDirectValue<Value, Derived> = RegisterForSignal<Value> &
  ([Derived] extends [never] ? {} : Derived);

type RegisterForTargetHelper<Value, Derived = never> = {
  (): Generator<never, RegisterForDirectValue<Value, Derived>, unknown>;
  <Projection extends (tokens: RegisterForExposureTokens<Value>) => unknown>(
    bindings: undefined,
    expose: Projection,
  ): Generator<
    RegisterForProjectionResult<ReturnType<Projection>>['yielded'],
    RegisterForProjectionResult<ReturnType<Projection>>['output'],
    unknown
  >;
};

type RegisterForAdditionalGroups<Targets extends readonly AnyRegisterTarget[]> =
  Targets extends readonly [AnyRegisterTarget, ...infer Rest]
    ? {
        [Name in TargetNames<
          readonly [Extract<Rest[number], AnyRegisterTarget>]
        > as GroupKey<Name>]: RegisterForTargetHelper<
          TargetReference<
            TargetForKey<
              Extract<Rest[number], AnyRegisterTarget>[],
              GroupKey<Name>
            >
          >
        >;
      }
    : Record<never, never>;

type TargetForKey<
  Targets extends readonly AnyRegisterTarget[],
  Key extends string,
> = Targets[number] extends infer Target
  ? Target extends AnyRegisterTarget
    ? GroupKey<Extract<TargetName<Target>, string>> extends Key
      ? Target
      : never
    : never
  : never;

export type RegisterForGroups<Targets extends readonly AnyRegisterTarget[]> = {
  [Name in TargetNames<Targets> as GroupKey<Name>]: SignalForTarget<
    TargetForKey<Targets, GroupKey<Name>>
  >;
};

type RegisterForDerivedHelper<Derived> = [Derived] extends [never]
  ? Record<never, never>
  : {
      [Name in Extract<keyof Derived, string>]: () => Generator<
        never,
        Derived[Name],
        unknown
      >;
    };

type RegisterForHelper<
  Targets extends readonly AnyRegisterTarget[],
  Derived = never,
> = Targets extends readonly [infer Primary, ...unknown[]]
  ? Primary extends AnyRegisterTarget
    ? RegisterForTargetHelper<TargetReference<Primary>, Derived> &
        RegisterForAdditionalGroups<Targets> &
        RegisterForDerivedHelper<Derived>
    : never
  : never;

export type CraftRegisterForApi<
  RegistryName extends string,
  Targets extends readonly AnyRegisterTarget[],
  Derived = never,
> = Readonly<
  {
    [Name in `RegisterFor${Capitalize<RegistryName>}`]: RegisterForHelper<
      Targets,
      Derived
    >;
  } & {
    [Name in `provideRegisterFor${Capitalize<RegistryName>}`]: () => Provider[];
  }
>;

export type RegisterForDerivedSelector<
  Targets extends readonly AnyRegisterTarget[],
  Derived extends object,
> = (groups: RegisterForGroups<Targets>) => Derived;

/**
 * Creates a typed, DI-scoped view of live Craft service/component/directive
 * instances. The returned helper is yieldable from Craft factories.
 */
export function craftRegisterFor<
  const RegistryName extends string,
  const Targets extends readonly AnyRegisterTarget[],
  const Derived extends object,
>(
  registryName: RegistryName,
  targets: Targets,
  derive: RegisterForDerivedSelector<Targets, Derived>,
): CraftRegisterForApi<RegistryName, Targets, Derived>;
export function craftRegisterFor<
  const RegistryName extends string,
  const Target extends AnyRegisterTarget,
  const Derived extends object,
>(
  registryName: RegistryName,
  target: Target,
  derive: RegisterForDerivedSelector<readonly [Target], Derived>,
): CraftRegisterForApi<RegistryName, readonly [Target], Derived>;
export function craftRegisterFor<
  const RegistryName extends string,
  const Targets extends readonly AnyRegisterTarget[],
>(
  registryName: RegistryName,
  targets: Targets,
  options?: RegisterForOptions,
): CraftRegisterForApi<RegistryName, Targets>;
export function craftRegisterFor<
  const RegistryName extends string,
  const Target extends AnyRegisterTarget,
>(
  registryName: RegistryName,
  target: Target,
  options?: RegisterForOptions,
): CraftRegisterForApi<RegistryName, readonly [Target]>;
export function craftRegisterFor(
  registryName: string,
  targetsOrTarget: readonly AnyRegisterTarget[] | AnyRegisterTarget,
  optionsOrDerive:
    | RegisterForOptions
    | ((groups: Record<string, RegisterForSignal>) => object) = {},
): CraftRegisterForApi<string, readonly AnyRegisterTarget[], object> {
  const targets: readonly AnyRegisterTarget[] = Array.isArray(targetsOrTarget)
    ? targetsOrTarget
    : [targetsOrTarget];
  return createCraftRegisterFor(registryName, targets, optionsOrDerive);
}

function createCraftRegisterFor(
  registryName: string,
  targets: readonly AnyRegisterTarget[],
  optionsOrDerive:
    | RegisterForOptions
    | ((groups: Record<string, RegisterForSignal>) => object),
): CraftRegisterForApi<string, readonly AnyRegisterTarget[], object> {
  if (!registryName) {
    throw new Error('craftRegisterFor requires a non-empty registry name.');
  }
  if (targets.length === 0) {
    throw new Error('craftRegisterFor requires at least one target.');
  }

  const descriptors = targets.map(toDescriptor);
  assertUniqueDescriptorKeys(descriptors);
  const derive =
    typeof optionsOrDerive === 'function' ? optionsOrDerive : undefined;
  const options = typeof optionsOrDerive === 'function' ? {} : optionsOrDerive;
  const includeGlobal = options.includeGlobal ?? true;
  const registryToken = new InjectionToken<RegisterForRegistry>(
    `REGISTER_FOR_REGISTRY_${registryName}`,
  );
  const registerForName = `RegisterFor${capitalize(registryName)}`;
  const provideRegisterForName = `provideRegisterFor${capitalize(
    registryName,
  )}`;
  const derivedByInjector = new WeakMap<Injector, Record<string, unknown>>();

  const createTargetHelper = (
    descriptor: RegisterForTargetDescriptor,
    exposeDerived: boolean,
  ) =>
    function* (
      _bindings?: undefined,
      expose?: (tokens: RegisterForExposureTokens<unknown>) => unknown,
    ) {
      const value = requireRegistry().signalFor(descriptor.key);
      if (expose === undefined) {
        return exposeDerived ? extendWithDerived(value) : value;
      }

      const exposed = expose({ $self: value });
      if (isGenerator(exposed)) {
        return yield* exposed as Generator<unknown, unknown, unknown>;
      }
      return exposed;
    };

  const helper = createTargetHelper(descriptors[0]!, true) as RegisterForHelper<
    readonly [AnyRegisterTarget],
    object
  >;
  for (const descriptor of descriptors.slice(1)) {
    Object.defineProperty(helper, descriptor.key, {
      value: createTargetHelper(descriptor, false),
      enumerable: false,
    });
  }

  const registerFor = new Proxy(helper, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (
        value !== undefined ||
        typeof property !== 'string' ||
        derive === undefined ||
        property === 'then'
      ) {
        return value;
      }

      return function* () {
        const derived = getDerivedForCurrentInjector();
        if (!Object.prototype.hasOwnProperty.call(derived, property)) {
          throw new Error(`Unknown RegisterFor property "${property}".`);
        }
        return derived[property];
      };
    },
  }) as RegisterForHelper<readonly [AnyRegisterTarget], object>;

  function extendWithDerived<Value>(
    value: RegisterForSignal<Value>,
  ): RegisterForDirectValue<Value, object> {
    if (derive === undefined) {
      return value as RegisterForDirectValue<Value, object>;
    }

    const derived = getDerivedForCurrentInjector();
    return new Proxy(value, {
      get(target, property, receiver) {
        if (
          typeof property === 'string' &&
          Object.prototype.hasOwnProperty.call(derived, property)
        ) {
          return derived[property];
        }
        return Reflect.get(target, property, receiver);
      },
    }) as RegisterForDirectValue<Value, object>;
  }

  const provideRegisterFor = (): Provider[] => {
    const registryProvider: Provider = {
      provide: registryToken,
      useFactory: () =>
        createRegisterForRegistry(descriptors, { includeGlobal }),
    };
    const registryCollectionProvider: Provider = {
      provide: REGISTER_FOR_REGISTRY,
      useExisting: registryToken,
      multi: true,
    };
    const targetWrapper = provideCraftTargetWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (context, next) {
        const registry = context.injector.get(registryToken, null);
        if (registry === null) {
          return yield* next();
        }

        const release = registry.registerTarget(
          context.target,
          context.ref,
          context.hostName,
        );
        const downstreamRelease = yield* next();

        return () => {
          downstreamRelease();
          release();
        };
      },
    );
    const yieldWrapper = provideServiceYieldWrapper(
      'Register Craft service yields for craftRegisterFor.',
      function* (context, next) {
        const ref = yield* next();
        if (context.scope !== 'global' || includeGlobal) {
          const hostTags = context.injector.get(HOST_TAG_LIST, []);
          registerResolvedService(
            context.injector,
            context.name,
            ref,
            hostTags[hostTags.length - 1] ?? `service:${context.name}`,
            context.scope,
          );
        }
        return ref;
      },
    );

    return [
      registryProvider,
      registryCollectionProvider,
      targetWrapper,
      yieldWrapper,
    ];
  };

  return {
    [registerForName]: registerFor,
    [provideRegisterForName]: provideRegisterFor,
  } as unknown as CraftRegisterForApi<
    string,
    readonly AnyRegisterTarget[],
    object
  >;

  function getDerivedForCurrentInjector(): Record<string, unknown> {
    if (derive === undefined) {
      return {};
    }

    const injector = currentInjector();
    const cached = derivedByInjector.get(injector);
    if (cached !== undefined) {
      return cached;
    }

    const groups = {} as Record<string, RegisterForSignal>;
    const registry = requireRegistry();
    for (const descriptor of descriptors) {
      groups[descriptor.key] = registry.signalFor(descriptor.key);
    }

    const derived = derive(groups);
    if (isGenerator(derived)) {
      throw new Error(
        'craftRegisterFor derived properties must be returned synchronously.',
      );
    }

    const result = derived as Record<string, unknown>;
    derivedByInjector.set(injector, result);
    return result;
  }

  function requireRegistry(): RegisterForRegistry {
    throwIfNoInjectionContext();
    const registry = currentInjector().get(registryToken, null);
    if (registry === null) {
      throw new Error(
        `${registerForName} requires ${provideRegisterForName}() in the current Craft injector.`,
      );
    }
    return registry;
  }
}

function toDescriptor(target: AnyRegisterTarget): RegisterForTargetDescriptor {
  try {
    const service = getServiceMetaData(target);
    return {
      key: capitalize(service.name),
      matches(candidate) {
        return isServiceCandidate(candidate) && candidate.name === service.name;
      },
    };
  } catch {
    const metadata = (
      target as {
        readonly [CRAFT_REGISTRATION_TARGET]?: {
          readonly name: string;
        };
      }
    )[CRAFT_REGISTRATION_TARGET];
    if (!metadata) {
      throw new Error(
        'craftRegisterFor only accepts Craft services, components, and directives.',
      );
    }

    return {
      key: capitalize(metadata.name),
      matches(candidate) {
        return candidate === target;
      },
    };
  }
}

function assertUniqueDescriptorKeys(
  descriptors: readonly RegisterForTargetDescriptor[],
): void {
  const seen = new Set<string>();
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.key)) {
      throw new Error(
        `craftRegisterFor cannot contain duplicate group name "${descriptor.key}".`,
      );
    }
    seen.add(descriptor.key);
  }
}

function isServiceCandidate(
  candidate: unknown,
): candidate is { readonly kind: 'service'; readonly name: string } {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    Reflect.get(candidate, 'kind') === 'service' &&
    typeof Reflect.get(candidate, 'name') === 'string'
  );
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function throwIfNoInjectionContext(): void {
  assertInInjectionContext(throwIfNoInjectionContext);
}

function currentInjector() {
  return inject(Injector);
}
