import { describe, expect, it } from 'vitest';
import { en, fr } from './order-catalog';

describe('guide/i18n/catalog.md', () => {
  it('keeps the key set closed and the locales in parity', () => {
    expect(Object.keys(en.catalog['order'] as object).sort()).toEqual([
      'items',
      'total',
    ]);
    expect(Object.keys(fr.catalog['order'] as object).sort()).toEqual([
      'items',
      'total',
    ]);
  });

  it('carries the plural categories each locale requires', () => {
    for (const locale of [en, fr]) {
      const items = (
        locale.catalog['order'] as unknown as Record<
          string,
          { branches: object }
        >
      )['items'];
      expect(Object.keys(items.branches).sort()).toEqual(['one', 'other']);
    }
  });
});
