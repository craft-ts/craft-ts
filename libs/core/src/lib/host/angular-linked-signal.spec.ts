import { EnvironmentInjector, inject } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { setupCraftServiceTest } from '../setup-craft-service-test';
import { angularLinkedSignal } from './angular-linked-signal';
import { craftSignal } from './craft-signal';

describe('angularLinkedSignal', () => {
  it('stops watching Craft sources when DestroyRef destroys', () => {
    const { injector } = setupCraftServiceTest();
    const source = craftSignal(0);
    const linked = injector.run(() =>
      angularLinkedSignal({
        source: () => source(),
        computation: (current) => current,
      }),
    );

    expect(linked()).toBe(0);
    source.set(1);
    expect(linked()).toBe(1);

    injector.run(() => inject(EnvironmentInjector).destroy());

    source.set(2);
    expect(linked()).toBe(1);
  });
});
