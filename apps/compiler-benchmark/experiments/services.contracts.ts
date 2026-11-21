// Copied into each isolated Core root by services.mjs, then run against that root.
import { describe, it, expect } from 'vitest';
import { Injector, signal } from './host/craft-compat';
import { craftService } from './craft-service';
import { craftUse } from './craft-use';
import { craftExpose } from './craft-primitive-gen';
import { markNamedReactiveProperties, isYieldableValue } from './yieldable';
import {
  resolveCraftGeneratorYield,
  SERVICE_YIELD_REQUEST_MARKER,
  SERVICE_YIELD_WRAPPER,
} from './craft-generator-runtime';

describe('performance campaign service contracts', () => {
  it.each([false, true])(
    'preserves metadata getter order, resolver receiver and wrappers (%s)',
    (wrapped) => {
      const order: string[] = [];
      const request = {
        [SERVICE_YIELD_REQUEST_MARKER]: true,
        get name() {
          order.push('name');
          return 'Campaign';
        },
        get providedIn() {
          order.push('scope');
          return 'global';
        },
        resolve(injector: unknown, hostScope: string) {
          expect(this).toBe(request);
          expect(injector).toBe(owner);
          expect(hostScope).toBe('function');
          order.push('resolve');
          return 42;
        },
      };
      const owner = Injector.create({
        providers: wrapped
          ? [
              {
                provide: SERVICE_YIELD_WRAPPER,
                useValue: [
                  function* (context: any, next: any) {
                    expect(context.name).toBe('Campaign');
                    expect(context.providedIn).toBe('global');
                    order.push('before');
                    const value = yield* next();
                    order.push('after');
                    return value;
                  },
                ],
              },
            ]
          : [],
      });
      expect(resolveCraftGeneratorYield(request, owner, 'function')).toEqual({
        handled: true,
        value: 42,
      });
      expect(order).toEqual(
        wrapped
          ? ['name', 'scope', 'before', 'resolve', 'after']
          : ['name', 'scope', 'resolve'],
      );
      owner.destroy();
    },
  );

  it('propagates metadata failures before calling the resolver', () => {
    const failure = new Error('metadata');
    let called = false;
    const owner = Injector.create({ providers: [] });
    expect(() =>
      resolveCraftGeneratorYield(
        {
          [SERVICE_YIELD_REQUEST_MARKER]: true,
          get name() {
            throw failure;
          },
          resolve() {
            called = true;
          },
        },
        owner,
        'function',
      ),
    ).toThrow(failure);
    expect(called).toBe(false);
    owner.destroy();
  });

  it('keeps extracted request/exposure resolvers receiver independent', () => {
    const { CampaignService } = craftService(
      { name: 'CampaignService', providedIn: 'global' },
      function* () {
        yield* craftExpose('value', { deep: 17 });
      },
    );
    const owner = Injector.create({ providers: [] });
    owner.run(() => {
      const request: any = CampaignService().next().value;
      const resolve = request.resolve;
      const value: any = resolve.call({ unrelated: true }, owner, 'function');
      expect(value.value.deep).toBe(17);
      expect(resolve.length).toBe(2);
      const shortcut: any = CampaignService.value().next().value;
      const expose = shortcut.exposure.resolve;
      expect(expose.call(null, value)).toEqual({ deep: 17 });
      expect(expose.length).toBe(1);
      expect(craftUse(CampaignService())).toBe(value);
    });
    owner.destroy();
  });

  it('marks added and replaced reactive members of mutable objects', () => {
    const value: any = { first: signal(1) };
    markNamedReactiveProperties(value);
    value.later = signal(2);
    value.first = signal(3);
    markNamedReactiveProperties(value);
    expect(isYieldableValue(value.later)).toBe(true);
    expect(isYieldableValue(value.first)).toBe(true);
  });

  it('re-reads accessors even on frozen objects', () => {
    let reads = 0;
    let current = signal(1);
    const value = Object.freeze({
      get reactive() {
        reads++;
        return current;
      },
    });
    markNamedReactiveProperties(value);
    current = signal(2);
    markNamedReactiveProperties(value);
    expect(reads).toBe(2);
    expect(isYieldableValue(current)).toBe(true);
  });

  it('retains observable proxy access on repeated marking', () => {
    let keys = 0;
    const value = new Proxy(Object.freeze({ reactive: signal(1) }), {
      ownKeys(target) {
        keys++;
        return Reflect.ownKeys(target);
      },
    });
    markNamedReactiveProperties(value);
    markNamedReactiveProperties(value);
    expect(keys).toBe(2);
  });
});
