import { describe, expect, it } from 'vitest';
import { craftUse } from './craft-use';
import { craftService } from './craft-service';
import {
  getCurrentCraftInjector,
  type CraftInjector,
} from './host/craft-injector';
import { setupCraftServiceTest } from './setup-craft-service-test';
import { state } from './state';
import { craftPrivate, craftExpose } from './craft-primitive-gen';

describe('setupCraftServiceTest without TestBed', () => {
  it('boots a craftService and reads its state', () => {
    let serviceInjector: CraftInjector | undefined;
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'global' },
      function* () {
        serviceInjector = getCurrentCraftInjector();
        const counter = yield* craftPrivate(state('hostCounter', 7));
        yield* craftExpose('read', () => craftUse(counter()));
      },
    );

    const { injector, sut } = setupCraftServiceTest(Counter, {});

    expect(sut.read()).toBe(7);
    expect(serviceInjector).toBeDefined();
    expect(injector.run(() => getCurrentCraftInjector())).toBe(injector);
  });

  it('boots state from a host injector without TestBed', () => {
    const { injector } = setupCraftServiceTest();
    const count = injector.run(() => {
      const counter = craftUse(state('boot', 3));
      return craftUse(counter());
    });
    expect(count).toBe(3);
  });

  it('creates a native CraftInjector from Craft providers', () => {
    const Answer = { debugName: 'Answer' };

    const { injector } = setupCraftServiceTest({
      providers: [{ token: Answer, useValue: 42 }],
    });

    expect(injector.run(() => injector.get(Answer))).toBe(42);
  });
});
