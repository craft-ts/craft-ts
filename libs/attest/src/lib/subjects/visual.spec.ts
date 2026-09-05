import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEvidenceStore } from '../evidence-store.js';
import {
  clusterByDiffShape,
  observeVisuals,
  storeVisual,
  visualEvidence,
  visualSubjectId,
} from './visual.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('visual subjects', () => {
  it('names a subject by component and scenario', () => {
    expect(
      visualSubjectId({ component: 'component:app.ts:Card', scenario: 'viewport=md' }),
    ).toBe('visual:component:app.ts:Card#viewport=md');
  });

  it('gives two identical digests the same evidence, whatever their key order', () => {
    expect(visualEvidence({ nodes: [], signature: { lines: {} } })).toBe(
      visualEvidence({ signature: { lines: {} }, nodes: [] }),
    );
  });

  it('observes a capture as a visual subject', () => {
    const [observation] = observeVisuals([
      {
        component: 'Card',
        scenario: 'base',
        digest: { nodes: [] },
        fingerprint: 'code-1',
      },
    ]);
    expect(observation).toMatchObject({
      subject: 'visual:Card#base',
      kind: 'visual',
      fingerprint: 'code-1',
    });
  });
});

describe('storeVisual', () => {
  it('stores the digest and the screenshot as separate objects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'craft-visual-'));
    directories.push(directory);
    const store = createEvidenceStore(directory);

    const stored = await storeVisual(store, {
      component: 'Card',
      scenario: 'base',
      digest: { nodes: [] },
      fingerprint: 'code-1',
      image: new Uint8Array([137, 80, 78, 71]),
    });

    expect(stored.subject).toBe('visual:Card#base');
    expect(await store.getText(stored.evidence, '.digest.json')).toContain('nodes');
    expect(stored.image).toBeTypeOf('string');
    expect(stored.image).not.toBe(stored.evidence);
  });
});

describe('clusterByDiffShape', () => {
  it('collapses identical deltas into one decision, largest first', () => {
    const clusters = clusterByDiffShape(
      [
        { subject: 'a', shape: 'radius 4→8' },
        { subject: 'b', shape: 'radius 4→8' },
        { subject: 'c', shape: 'padding 8→12' },
        { subject: 'd', shape: 'radius 4→8' },
      ],
      (item) => item.shape,
    );
    expect(clusters).toEqual([['a', 'b', 'd'], ['c']]);
  });
});
