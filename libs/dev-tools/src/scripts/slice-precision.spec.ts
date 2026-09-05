import { describe, expect, it } from 'vitest';
import {
  compareRevisions,
  measureSlicePrecision,
  summarise,
  type RevisionSlices,
} from './slice-precision';

const revision = (
  commit: string,
  slices: Record<string, Record<string, string>>,
): RevisionSlices => ({
  commit,
  slices: new Map(
    Object.entries(slices).map(([root, leaves]) => [
      root,
      {
        root,
        nodes: Object.keys(leaves).sort(),
        // The fingerprint is stubbed as the concatenation of the leaves: the
        // comparison under test is about which slices moved, not about the
        // merkle, which has its own spec.
        fingerprint: Object.entries(leaves)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, hash]) => `${id}=${hash}`)
          .join('|'),
        leaves,
      },
    ]),
  ),
});

describe('compareRevisions', () => {
  it('counts a slice as invalidated when its fingerprint moves', () => {
    const before = revision('a', {
      Card: { '<root>/card.ts#Card': '1', '<root>/card.ts#title': '1' },
      Other: { '<root>/other.ts#Other': '1' },
    });
    const after = revision('b', {
      Card: { '<root>/card.ts#Card': '1', '<root>/card.ts#title': '2' },
      Other: { '<root>/other.ts#Other': '1' },
    });

    const measure = compareRevisions(before, after, ['<root>/card.ts']);
    expect(measure.invalidated).toBe(1);
    expect(measure.slices).toBe(2);
    expect(measure.rate).toBe(0.5);
    expect(measure.falseNegatives).toEqual([]);
  });

  it('reports a slice that shares a file with the change but not a node', () => {
    const before = revision('a', {
      Card: { '<root>/app.ts#Card': '1' },
    });
    const after = revision('b', {
      Card: { '<root>/app.ts#Card': '1' },
    });

    // `app.ts` changed, but nothing inside the closure did: this is the
    // precision the node-level hash exists to buy, not a miss.
    const measure = compareRevisions(before, after, ['<root>/app.ts']);
    expect(measure.invalidated).toBe(0);
    expect(measure.falseNegatives).toEqual([]);
    expect(measure.fileScopedNonInvalidations).toEqual(['Card']);
  });

  it('flags a still fingerprint over a changed closure node as a false negative', () => {
    const before = revision('a', { Card: { '<root>/card.ts#title': '1' } });
    const after: RevisionSlices = {
      commit: 'b',
      slices: new Map([
        [
          'Card',
          {
            root: 'Card',
            nodes: ['<root>/card.ts#title'],
            // The defect being detected: a hash moved and the fingerprint did
            // not, which is only ever an implementation bug.
            fingerprint: before.slices.get('Card')?.fingerprint ?? '',
            leaves: { '<root>/card.ts#title': '2' },
          },
        ],
      ]),
    };

    const measure = compareRevisions(before, after, ['<root>/card.ts']);
    expect(measure.falseNegatives).toEqual(['Card']);
  });

  it('leaves slices that exist on one side only out of the rate', () => {
    const before = revision('a', { Card: { x: '1' } });
    const after = revision('b', { Card: { x: '1' }, Added: { y: '1' } });
    const measure = compareRevisions(before, after, []);
    expect(measure.slices).toBe(1);
    expect(measure.appeared).toBe(1);
    expect(measure.disappeared).toBe(0);
  });
});

describe('summarise', () => {
  it('is within budget on a low median with no false negative', () => {
    const report = summarise([
      { ...empty, rate: 0.1 },
      { ...empty, rate: 0.05 },
      { ...empty, rate: 0.4 },
    ]);
    expect(report.medianInvalidationRate).toBeCloseTo(0.1);
    expect(report.maxInvalidationRate).toBeCloseTo(0.4);
    expect(report.withinBudget).toBe(true);
  });

  it('is out of budget on a single false negative, whatever the rate', () => {
    const report = summarise([
      { ...empty, rate: 0.01, falseNegatives: ['Card'] },
    ]);
    expect(report.withinBudget).toBe(false);
    expect(report.falseNegatives).toBe(1);
  });

  it('is out of budget above the invalidation threshold', () => {
    const report = summarise([
      { ...empty, rate: 0.9 },
      { ...empty, rate: 0.8 },
    ]);
    expect(report.withinBudget).toBe(false);
  });
});

describe('measureSlicePrecision', () => {
  it('walks the history oldest first and compares consecutive revisions', () => {
    const asked: string[] = [];
    const report = measureSlicePrecision({
      commits: 2,
      git: (args) => {
        if (args[0] === 'log') return 'c3\nc2\nc1\n';
        if (args[0] === 'diff') return 'apps/demo/src/app.ts\n';
        throw new Error(`unexpected git ${args.join(' ')}`);
      },
      slicesAt: (commit) => {
        asked.push(commit);
        return revision(commit, {
          Card: { '<root>/apps/demo/src/app.ts#Card': commit },
        });
      },
    });

    expect(asked).toEqual(['c1', 'c2', 'c3']);
    expect(report.commits.map((commit) => commit.commit)).toEqual(['c2', 'c3']);
    expect(report.medianInvalidationRate).toBe(1);
  });
});

const empty = {
  commit: 'x',
  changedFiles: [] as readonly string[],
  slices: 10,
  invalidated: 1,
  rate: 0.1,
  falseNegatives: [] as readonly string[],
  fileScopedNonInvalidations: [] as readonly string[],
  appeared: 0,
  disappeared: 0,
};
