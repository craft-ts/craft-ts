// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createCraftStyleRegistry } from './style-registry';

describe('CraftStyleRegistry', () => {
  beforeEach(() => document.body.replaceChildren());

  it('deduplicates sheets and removes them after the last release', () => {
    const registry = createCraftStyleRegistry();
    const first = registry.acquire(document, 'card', '.card { color: red }', 1);
    const second = registry.acquire(
      document,
      'card',
      '.card { color: red }',
      1,
    );

    expect(
      document.querySelectorAll('style[data-craft-sheet="card"]'),
    ).toHaveLength(1);
    first();
    expect(
      document.querySelector('style[data-craft-sheet="card"]'),
    ).not.toBeNull();
    second();
    expect(document.querySelector('style[data-craft-sheet="card"]')).toBeNull();
  });

  it('keeps registered sheets ordered by their order value', () => {
    const registry = createCraftStyleRegistry();
    registry.acquire(document, 'late', '.late {}', 2);
    registry.acquire(document, 'early', '.early {}', 1);
    expect(
      Array.from(
        document.querySelectorAll<HTMLStyleElement>('style[data-craft-sheet]'),
      ).map((element) => element.dataset.craftSheet),
    ).toEqual(['early', 'late']);
  });

  it('uses the prototype capability check instead of an instance expando', () => {
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      value: [],
    });
    const registry = createCraftStyleRegistry();
    registry.acquire(document, 'fallback', '.fallback {}', 0);
    expect(
      document.querySelector('style[data-craft-sheet="fallback"]'),
    ).not.toBeNull();
  });
});
