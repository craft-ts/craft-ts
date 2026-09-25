// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  CraftActivatedRoute,
  provideCraftActivatedRoute,
} from './craft-activated-route';
import type { ActivatedRoute } from './host/craft-router-types';
import { craftService } from './craft-service';
import { setupCraftServiceTest } from './setup-craft-service-test';

describe('CraftActivatedRoute', () => {
  it('resolves the provided route through its Craft service helper', () => {
    const route = {
      snapshot: { params: { id: '1' } },
      pathFromRoot: [],
    } as unknown as ActivatedRoute;
    const { RouteProbe } = craftService(
      { name: 'RouteProbe', providedIn: 'function' },
      function* () {
        return { route: yield* CraftActivatedRoute() };
      },
    );
    const { sut } = setupCraftServiceTest(
      RouteProbe,
      {},
      { providers: [provideCraftActivatedRoute(route)] },
    );
    expect(sut.route).toBe(route);
  });

  it('is a yieldable helper', () => {
    expect(typeof CraftActivatedRoute).toBe('function');
  });
});
