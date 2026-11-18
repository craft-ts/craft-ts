import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from './host/craft-compat';
import {
  DEFAULT_CRAFT_SECURITY_POLICY,
  provideCraftSecurityPolicy,
  ɵinjectCraftSecurityPolicy,
} from './craft-security';

/** Counts every `Error` built while `run` executes, whoever catches it. */
function countErrorsBuilt(run: () => void): number {
  const original = globalThis.Error;
  let built = 0;
  globalThis.Error = new Proxy(original, {
    construct(target, args, newTarget) {
      built += 1;
      return Reflect.construct(target, args, newTarget);
    },
    apply(target, thisArg, args) {
      built += 1;
      return Reflect.apply(target, thisArg, args);
    },
  });
  try {
    run();
  } finally {
    globalThis.Error = original;
  }
  return built;
}

describe('the security policy an injector resolves', () => {
  it('is the default without an error being built when none is provided', () => {
    const injector = Injector.create({
      providers: [],
      parent: Injector.create({ providers: [] }),
    });
    let policy: unknown;

    const built = countErrorsBuilt(() => {
      policy = runInInjectionContext(injector, ɵinjectCraftSecurityPolicy);
    });

    expect(policy).toBe(DEFAULT_CRAFT_SECURITY_POLICY);
    expect(built).toBe(0);
  });

  it('is the one an ancestor injector provides', () => {
    const injector = Injector.create({
      providers: [],
      parent: Injector.create({
        providers: [
          provideCraftSecurityPolicy({
            dom: { allowedResourceOrigins: ['https://cdn.example.test'] },
          }),
        ],
      }),
    });

    const policy = runInInjectionContext(injector, ɵinjectCraftSecurityPolicy);

    expect(policy).not.toBe(DEFAULT_CRAFT_SECURITY_POLICY);
    expect(policy.dom.allowedResourceOrigins).toContain(
      'https://cdn.example.test',
    );
  });

  it('is the default outside any injection context', () => {
    expect(ɵinjectCraftSecurityPolicy()).toBe(DEFAULT_CRAFT_SECURITY_POLICY);
  });
});
