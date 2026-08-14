import { describe, expect, it } from 'vitest';
import {
  assertCraftUnique,
  craftUniqueViolations,
} from '@craft-ng/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertCraftUnique', () => {
  it('accepts distinct craftUnique identities across several entities', () => {
    const graph = loadArchitectureFixture('app');

    expect(graph.catalog.uniques).toEqual([
      '{"key":"cart","storeName":"shop"}',
      '{"key":"user-detail","storeName":"shop"}',
      '{"key":"user-list","storeName":"shop"}',
    ]);
    expect(graph.unique('{"key":"cart","storeName":"shop"}').kind).toBe(
      'unique',
    );
    expect(graph.unique('{"key":"user-detail","storeName":"shop"}').kind).toBe(
      'unique',
    );
    expect(graph.unique('{"key":"user-list","storeName":"shop"}').kind).toBe(
      'unique',
    );
    expect(graph.uniques()).toHaveLength(3);
    expect(() => assertCraftUnique(graph.graph)).not.toThrow();
    expect(craftUniqueViolations(graph.graph)).toEqual([]);
  });

  it('rejects the same identity used by two entities, even with swapped keys', () => {
    const graph = loadArchitectureFixture('duplicate-unique');

    expect(graph.catalog.uniques).toEqual(['{"key":"user","storeName":"shop"}']);
    expect(
      graph.unique('{"key":"user","storeName":"shop"}').details?.['callSites'],
    ).toHaveLength(2);

    const violations = craftUniqueViolations(graph.graph);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe('duplicate');
    expect(violations[0]?.label).toBe('{"key":"user","storeName":"shop"}');
    expect(violations[0]?.callSites.map((site) => site.filePath).sort()).toEqual(
      ['user-detail.ts', 'user-list.ts'],
    );

    expect(() => assertCraftUnique(graph.graph)).toThrow(
      /Duplicate craftUnique \{"key":"user","storeName":"shop"\} used twice/,
    );
  });

  it('allows the same key under two different store names', () => {
    const graph = loadArchitectureFixture('same-key-different-store');

    expect(graph.catalog.uniques).toEqual([
      '{"key":"user","storeName":"admin"}',
      '{"key":"user","storeName":"shop"}',
    ]);
    expect(graph.uniques()).toHaveLength(2);
    expect(() => assertCraftUnique(graph.graph)).not.toThrow();
  });

  it('rejects a non-literal craftUnique argument that cannot be verified', () => {
    const graph = loadArchitectureFixture('non-static-unique');

    expect(graph.uniques()).toHaveLength(1);
    expect(graph.uniques()[0]?.details?.['static']).toBe(false);
    expect(craftUniqueViolations(graph.graph)[0]?.kind).toBe('non-static');
    expect(() => assertCraftUnique(graph.graph)).toThrow(
      /Non-static craftUnique argument cannot be verified/,
    );
  });
});
