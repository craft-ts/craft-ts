import { describe, expect, it } from 'vitest';
import { scopeIdFor } from './scope-id';

describe('Craft scopes', () => {
  it('returns the same id for a definition and rejects duplicate names', () => {
    const definition = {};
    expect(scopeIdFor(definition, 'Card')).toBe('Card');
    expect(scopeIdFor(definition, 'Card')).toBe('Card');
    expect(() => scopeIdFor({}, 'Card')).toThrow(/already used/);
  });
});
