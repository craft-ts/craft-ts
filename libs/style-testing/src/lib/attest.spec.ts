import { describe, expect, it } from 'vitest';
import { visualReport, VISUAL_REPORT_FORMAT } from './attest.ts';
import type { LayoutDigest } from './digest.ts';

const digest: LayoutDigest = {
  digestVersion: 1,
  nodes: [],
  signature: {
    columns: {},
    lines: {},
    wrapped: [],
    clipped: [],
    scrollbars: [],
    overlaps: [],
  },
};

describe('visualReport', () => {
  it('sorts portable captures into a stable report', () => {
    expect(
      visualReport([
        { component: 'Card', scenario: 'viewport=md', digest },
        { component: 'Card', scenario: 'base', digest },
      ]),
    ).toMatchObject({
      format: VISUAL_REPORT_FORMAT,
      version: 1,
      captures: [{ scenario: 'base' }, { scenario: 'viewport=md' }],
    });
  });

  it('refuses two captures for one subject', () => {
    expect(() =>
      visualReport([
        { component: 'Card', scenario: 'base', digest },
        { component: 'Card', scenario: 'base', digest },
      ]),
    ).toThrow(/duplicate subject/);
  });
});
