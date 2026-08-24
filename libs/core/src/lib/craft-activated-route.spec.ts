// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CraftActivatedRoute } from './craft-activated-route';
import {
  createEnvironmentInjector,
  inject,
  Injector,
} from './host/craft-compat';
import { ActivatedRoute } from './host/craft-router-types';

describe('CraftActivatedRoute', () => {
  it('exposes a runtime DI token', () => {
    expect(ActivatedRoute).toBeDefined();
    expect(typeof ActivatedRoute).not.toBe('undefined');
    expect(
      (ActivatedRoute as { debugName?: string }).debugName,
    ).toBe('ActivatedRoute');
  });

  it('resolves the provided route through inject()', () => {
    const route = {
      snapshot: { params: { id: '1' } },
      pathFromRoot: [],
    } as unknown as ActivatedRoute;
    const injector = createEnvironmentInjector(
      [{ provide: ActivatedRoute, useValue: route }],
      Injector.NULL,
    );
    const resolved = injector.run(() => inject(ActivatedRoute));
    expect(resolved).toBe(route);
  });

  it('is a yieldable helper', () => {
    expect(typeof CraftActivatedRoute).toBe('function');
  });
});
