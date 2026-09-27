import { describe, expect, it } from 'vitest';
import { TIERS } from '@craft-ts/style-testing/review/frame';
import { tierColours } from './tier-legend.style';

describe('the tier legend', () => {
  it('draws each swatch in the colour the replay paints the outline in', () => {
    const replay = new Map(Object.entries(TIERS));
    expect(Object.keys(tierColours.border).sort()).toEqual(
      [...replay.keys()].sort(),
    );
    for (const [name, swatch] of Object.entries(tierColours.border)) {
      expect(swatch.css, name).toBe(replay.get(name)?.colour);
    }
  });

  it('marks as dotted exactly the tiers the replay dots', () => {
    const dotted = Object.entries(TIERS)
      .filter(([, value]) => value.style === 'dotted')
      .map(([name]) => name);
    expect(dotted).toEqual(['occluded']);
  });
});
