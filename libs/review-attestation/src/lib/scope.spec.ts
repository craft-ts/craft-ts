import { describe, expect, it } from 'vitest';
import { visibleBandOf, type CaptureScope } from './digest.ts';
import { metadataFromScope } from './attest.ts';

const scope = (overrides: Partial<CaptureScope> = {}): CaptureScope => ({
  root: { x: 64, y: 288, width: 247, height: 1582 },
  rootMatched: true,
  viewport: { width: 375, height: 900 },
  region: { x: 0, y: 0, width: 375, height: 916 },
  attested: ['host', 'host/a', 'host/b'],
  offScreen: ['host/b'],
  occluded: [{ path: 'host/a', by: 'button.clear-cache-btn' }],
  ...overrides,
});

describe('visibleBandOf', () => {
  it('places the viewport in the image own coordinates', () => {
    expect(visibleBandOf(scope())).toEqual({
      x: 0,
      y: 0,
      width: 375,
      height: 900,
    });
  });

  it('offsets the band when the capture starts above the viewport', () => {
    const band = visibleBandOf(
      scope({ region: { x: -20, y: -40, width: 400, height: 1000 } }),
    );
    expect(band).toMatchObject({ x: 20, y: 40 });
  });

  it('does not hand back a negated zero', () => {
    // `-0` compares equal to `0` everywhere except `Object.is`, so a band at
    // the origin would test unequal to itself.
    expect(Object.is(visibleBandOf(scope()).x, 0)).toBe(true);
  });
});

describe('metadataFromScope', () => {
  it('carries the origin, without which nothing can be mapped onto the image', () => {
    expect(metadataFromScope(scope()).origin).toEqual({ x: 0, y: 0 });
  });

  it('states the gap between what is attested and what could be looked at', () => {
    expect(metadataFromScope(scope()).coverage).toEqual({
      attested: 3,
      offScreen: 1,
      occluded: 1,
    });
  });

  it('names what covered a node, not just how many', () => {
    expect(metadataFromScope(scope()).occluded).toEqual([
      { path: 'host/a', by: 'button.clear-cache-btn' },
    ]);
  });

  it('leaves the lists out when there is nothing to report', () => {
    const clean = metadataFromScope(scope({ offScreen: [], occluded: [] }));
    expect(clean.offScreen).toBeUndefined();
    expect(clean.occluded).toBeUndefined();
    expect(clean.coverage).toEqual({ attested: 3, offScreen: 0, occluded: 0 });
  });
});
