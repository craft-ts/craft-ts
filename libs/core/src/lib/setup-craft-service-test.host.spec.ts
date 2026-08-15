import { describe, expect, it } from 'vitest';
import { craftUse } from './craft-use';
import { craftService } from './craft-service';
import {
  craftToken,
  getCurrentCraftInjector,
  type CraftInjector,
} from './host/craft-injector';
import { setupCraftServiceTest } from './setup-craft-service-test';
import { state } from './state';

describe('setupCraftServiceTest without TestBed', () => {
  it('boots a craftService and reads its state', () => {
    let serviceInjector: CraftInjector | undefined;
    const { Counter } = craftService(
      { name: 'Counter', scope: 'global' },
      function* () {
        serviceInjector = getCurrentCraftInjector();
        const counter = yield* state('hostCounter', 7);
        return { read: () => craftUse(counter()) };
      },
    );

    const { injector, sut } = setupCraftServiceTest(Counter, {});

    expect(sut.read()).toBe(7);
    expect(serviceInjector).toBeDefined();
    expect(injector.run(() => getCurrentCraftInjector())).toBe(injector);
  });

  it('creates a native CraftInjector from Craft providers', () => {
    const Answer = craftToken<number>('Answer');

    const { injector } = setupCraftServiceTest({
      providers: [{ token: Answer, useValue: 42 }],
    });

    expect(injector.run(() => injector.get(Answer))).toBe(42);
  });
});
