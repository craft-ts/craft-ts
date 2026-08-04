import {
  HOST_TAG_LIST,
} from './host-tag';
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
import { provideServiceYieldWrapper } from './craft-generator-runtime';
import {
  assertInInjectionContext,
  inject,
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

type RegisterForGroups<Targets extends readonly AnyRegisterTarget[]> = {
  [Name in TargetNames<Targets> as GroupKey<Name>]: SignalForTarget<
    TargetForKey<Targets, GroupKey<Name>>
  >;
};

type RegisterForHelper<Targets extends readonly AnyRegisterTarget[]> = {
  (): Generator<never, RegisterForGroups<Targets>, unknown>;
} & {
  [Name in TargetNames<Targets> as GroupKey<Name>]: () => Generator<
    never,
    SignalForTarget<TargetForKey<Targets, GroupKey<Name>>>,
    unknown
  >;
};

export type CraftRegisterForApi<
  Targets extends readonly AnyRegisterTarget[],
> = Readonly<{
  RegisterFor: RegisterForHelper<Targets>;
  provideRegisterFor: () => readonly Provider[];
}>;

/**
 * Creates a typed, DI-scoped view of live Craft service/component/directive
 * instances. The returned helper is yieldable from Craft factories.
 */
export function craftRegisterFor<
  const Targets extends readonly AnyRegisterTarget[],
>(
  targets: Targets,
  options: RegisterForOptions = {},
): CraftRegisterForApi<Targets> {
  const descriptors = targets.map(toDescriptor);
  assertUniqueDescriptorKeys(descriptors);
  const includeGlobal = options.includeGlobal ?? true;
  const registryToken = REGISTER_FOR_REGISTRY;

  const all = function* () {
    const registry = requireRegistry();
    const groups = {} as Record<string, RegisterForSignal>;
    for (const descriptor of descriptors) {
      groups[descriptor.key] = registry.signalFor(descriptor.key);
    }
    return groups;
  };

  const helper = all as RegisterForHelper<Targets>;
  for (const descriptor of descriptors) {
    const targetHelper = function* () {
      return requireRegistry().signalFor(descriptor.key);
    };
    Object.defineProperty(helper, descriptor.key, {
      value: targetHelper,
      enumerable: false,
    });
  }

  const provideRegisterFor = () => {
    const registryProvider: Provider = {
      provide: registryToken,
      useFactory: () =>
        createRegisterForRegistry(descriptors, { includeGlobal }),
    };
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

    return [registryProvider, yieldWrapper] as const;
  };

  return { RegisterFor: helper, provideRegisterFor };

  function requireRegistry(): RegisterForRegistry {
    throwIfNoInjectionContext();
    const registry = currentInjector().get(registryToken, null);
    if (registry === null) {
      throw new Error(
        'RegisterFor requires provideRegisterFor() in the current Craft injector.',
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
        return (
          isServiceCandidate(candidate) && candidate.name === service.name
        );
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
