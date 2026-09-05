import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalJson,
  createEvidenceStore,
  evidenceHash,
  evidenceHashOf,
} from './evidence-store.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const store = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'craft-evidence-'));
  directories.push(directory);
  return createEvidenceStore(directory);
};

describe('canonicalJson', () => {
  it('does not depend on the order keys were filled in', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(evidenceHashOf({ b: 1, a: 2 })).toBe(evidenceHashOf({ a: 2, b: 1 }));
  });

  it('does depend on the order of an array', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('drops undefined members rather than emitting them', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('evidence store', () => {
  it('addresses by content, so identical evidence is one object', async () => {
    const evidence = await store();
    const first = await evidence.put('{"a":1}');
    const second = await evidence.put('{"a":1}');
    expect(first).toBe(second);
    expect(await evidence.list()).toEqual([first]);
  });

  it('round-trips text and bytes', async () => {
    const evidence = await store();
    const text = await evidence.put('hello');
    expect(await evidence.getText(text)).toBe('hello');

    const png = await evidence.put(new Uint8Array([1, 2, 3]), '.png');
    expect([...((await evidence.get(png, '.png')) ?? [])]).toEqual([1, 2, 3]);
  });

  it('is silent about a hash it does not hold', async () => {
    const evidence = await store();
    expect(await evidence.get(evidenceHash('absent'))).toBeUndefined();
    expect(await evidence.has(evidenceHash('absent'))).toBe(false);
  });

  it('reports an empty listing rather than throwing on a missing directory', async () => {
    expect(await createEvidenceStore('/definitely/not/here').list()).toEqual([]);
  });
});
