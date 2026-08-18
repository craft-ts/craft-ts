import { describe, expect, it } from 'vitest';
import {
  assertInteractiveElementNamed,
  interactiveElementNamedViolations,
} from '@craft-ts/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertInteractiveElementNamed', () => {
  it('accepts an app whose interactive elements have unique literal names', () => {
    const graph = loadArchitectureFixture('named-interactive-elements');
    expect(interactiveElementNamedViolations(graph.graph)).toEqual([]);
    expect(() => assertInteractiveElementNamed(graph.graph)).not.toThrow();
  });

  it('rejects an interactive helper without a literal local name', () => {
    const graph = loadArchitectureFixture('missing-interactive-name');
    expect(interactiveElementNamedViolations(graph.graph)[0]?.kind).toBe(
      'missing',
    );
    expect(() => assertInteractiveElementNamed(graph.graph)).toThrow(
      /Interactive button is missing a literal data-craft-name/,
    );
  });

  it('rejects the same data-craft-name used twice in the app', () => {
    const graph = loadArchitectureFixture('duplicate-interactive-name');
    expect(interactiveElementNamedViolations(graph.graph)[0]?.kind).toBe(
      'duplicate',
    );
    expect(() => assertInteractiveElementNamed(graph.graph)).toThrow(
      /Duplicate data-craft-name "save" used twice/,
    );
  });
});
