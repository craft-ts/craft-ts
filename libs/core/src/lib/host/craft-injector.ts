import {
  createEnvironmentInjector,
  InjectionToken,
  Injector,
  runInInjectionContext,
  type EnvironmentInjector,
  type Provider,
} from '@angular/core';

declare const CraftTokenBrand: unique symbol;

export type CraftToken<T> = {
  readonly debugName: string;
  readonly [CraftTokenBrand]: T;
};

export type CraftProvider<T = unknown> =
  | { token: CraftToken<T>; useValue: T }
  | { token: CraftToken<T>; useFactory: (injector: CraftInjector) => T };

export interface CraftInjector {
  get<T>(token: CraftToken<T>): T;
  getOptional<T>(token: CraftToken<T>): T | null;
  run<T>(fn: () => T): T;
  createChild(providers: readonly CraftProvider[]): CraftInjector;
}

const angularTokens = new WeakMap<object, InjectionToken<unknown>>();
const activeInjectors: CraftInjector[] = [];
const craftInjectors = new WeakMap<Injector, CraftInjector>();

export function craftToken<T>(debugName: string): CraftToken<T> {
  const token = { debugName } as CraftToken<T>;
  angularTokens.set(token, new InjectionToken<T>(debugName));
  return token;
}

export function createCraftInjector(
  providers: readonly CraftProvider[],
): CraftInjector {
  const injectorRef = {} as { current: CraftInjector };
  const angularInjector = Injector.create({
    providers: toAngularProviders(providers, () => injectorRef.current),
    name: 'CraftInjector',
  });
  injectorRef.current = ɵcraftInjectorFromHost(angularInjector);
  return injectorRef.current;
}

export function getCurrentCraftInjector(): CraftInjector {
  const injector = activeInjectors[activeInjectors.length - 1];
  if (!injector) {
    throw new Error(
      'getCurrentCraftInjector() must be called inside injector.run().',
    );
  }
  return injector;
}

function createAngularBackedCraftInjector(
  angularInjector: Injector,
): CraftInjector {
  const craftInjector: CraftInjector = {
    get<T>(token: CraftToken<T>): T {
      return angularInjector.get(getAngularToken(token));
    },
    getOptional<T>(token: CraftToken<T>): T | null {
      return angularInjector.get(getAngularToken(token), null);
    },
    run<T>(fn: () => T): T {
      activeInjectors.push(craftInjector);
      try {
        return runInInjectionContext(angularInjector, fn);
      } finally {
        activeInjectors.pop();
      }
    },
    createChild(providers: readonly CraftProvider[]): CraftInjector {
      const childRef = {} as { current: CraftInjector };
      const childInjector = createEnvironmentInjector(
        toAngularProviders(providers, () => childRef.current),
        angularInjector as EnvironmentInjector,
        'CraftInjectorChild',
      );
      childRef.current = ɵcraftInjectorFromHost(childInjector);
      return childRef.current;
    },
  };
  return craftInjector;
}

export function ɵcraftInjectorFromHost(hostInjector: object): CraftInjector {
  const angularInjector = hostInjector as Injector;
  const existing = craftInjectors.get(angularInjector);
  if (existing) {
    return existing;
  }
  const craftInjector = createAngularBackedCraftInjector(angularInjector);
  craftInjectors.set(angularInjector, craftInjector);
  return craftInjector;
}

export function ɵcreateAngularChildInjector(
  parent: Injector,
  providers: readonly Provider[],
  debugName: string,
): EnvironmentInjector {
  return createEnvironmentInjector(
    [...providers],
    parent as EnvironmentInjector,
    debugName,
  );
}

function getAngularToken<T>(token: CraftToken<T>): InjectionToken<T> {
  const angularToken = angularTokens.get(token);
  if (!angularToken) {
    throw new Error(`Unknown Craft token "${token.debugName}".`);
  }
  return angularToken as InjectionToken<T>;
}

function toAngularProviders(
  providers: readonly CraftProvider[],
  getInjector: () => CraftInjector,
): Provider[] {
  return providers.map((provider) =>
    'useValue' in provider
      ? {
          provide: getAngularToken(provider.token),
          useValue: provider.useValue,
        }
      : {
          provide: getAngularToken(provider.token),
          useFactory: () => provider.useFactory(getInjector()),
        },
  );
}
