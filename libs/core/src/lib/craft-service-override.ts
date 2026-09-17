import { inject } from './host/craft-compat';
import type { Provider } from './host/craft-compat';
import {
  getServiceMetaData,
  type GetServiceOutput,
  ɵgetServiceInjectionToken,
} from './craft-service';

/** Marks a provider that replaces a service instance with a wrapped one. */
export const CRAFT_SERVICE_TRANSFORM = Symbol('craft-service-transform');

export type CraftServiceTransform<Output = unknown> = Provider & {
  readonly [CRAFT_SERVICE_TRANSFORM]: {
    readonly serviceName: string;
    readonly output?: Output;
  };
};

/**
 * Wraps a service for one scope: the transform receives the instance the scope
 * above already resolved and returns the one this scope will hand out.
 *
 * The replacement must still answer the whole contract — a caller reached this
 * service through its own type, and a transform is not allowed to take a member
 * away from it. Adding members is fine: nobody can use them until the contract
 * they are declared in says so.
 */
export function overrideService<
  Service,
  const Result extends GetServiceOutput<Service>,
>(
  service: Service,
  transform: (base: GetServiceOutput<Service>) => Result,
): CraftServiceTransform<GetServiceOutput<Service>> {
  const metaData = getServiceMetaData(service);
  const token = ɵgetServiceInjectionToken(metaData);

  if (!token) {
    throw new Error(
      `overrideService() needs a service that is provided through a token. "${metaData.name}" cannot be wrapped in a local scope.`,
    );
  }

  const provider = {
    provide: token,
    // `skipSelf` is what makes this a *wrapping*: the base instance comes from
    // the scope that provided it, never from this one, which would recurse.
    useFactory: () =>
      transform(
        inject(token as never, { skipSelf: true }) as GetServiceOutput<Service>,
      ),
  } as CraftServiceTransform<GetServiceOutput<Service>>;

  Object.defineProperty(provider, CRAFT_SERVICE_TRANSFORM, {
    value: { serviceName: metaData.name },
    enumerable: false,
  });

  return provider;
}

export function isCraftServiceTransform(
  value: unknown,
): value is CraftServiceTransform {
  return (
    typeof value === 'object' &&
    value !== null &&
    CRAFT_SERVICE_TRANSFORM in value
  );
}
