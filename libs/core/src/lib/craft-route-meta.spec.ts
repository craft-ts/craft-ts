import { describe, expect, it } from 'vitest';
import { CRAFT_ROUTE_META, getCraftRouteMeta, type CraftRouteMeta } from './craft-route-meta';

describe('getCraftRouteMeta', () => {
  const meta: CraftRouteMeta = {
    handleExceptions: {},
    guardDataSink: null,
    resolveDataSink: null,
    exceptionSinks: {},
    reactiveGuards: true,
  };

  it('reads the meta stashed under CRAFT_ROUTE_META', () => {
    const data = { [CRAFT_ROUTE_META]: meta };
    expect(getCraftRouteMeta(data)).toBe(meta);
  });

  it('returns undefined when data is null', () => {
    expect(getCraftRouteMeta(null)).toBeUndefined();
  });

  it('returns undefined when data is undefined', () => {
    expect(getCraftRouteMeta(undefined)).toBeUndefined();
  });

  it('returns undefined when the symbol key is absent', () => {
    expect(getCraftRouteMeta({ someOtherKey: 'value' })).toBeUndefined();
  });

  it('does not confuse a string key with the symbol key', () => {
    const data = { [CRAFT_ROUTE_META.toString()]: meta };
    expect(getCraftRouteMeta(data)).toBeUndefined();
  });
});
