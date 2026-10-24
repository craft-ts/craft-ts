import { describe, expect, it } from 'vitest';
import { craftSession, parseCraftSessionAnnotation } from './contract.js';
import { resolveCraftSessionMode } from './mode.js';

describe('craft-session contract', () => {
  it('round trips a valid annotation with defaults', () => {
    expect(parseCraftSessionAnnotation([craftSession({ id: 'cart.checkout-promo' })])).toEqual({
      id: 'cart.checkout-promo', keep: 1, capture: 'required',
    });
  });

  it.each([
    [{ id: 'Upper' }, 'id'],
    [{ id: 'valid', keep: 0 }, 'keep'],
    [{ id: 'valid', keep: 11 }, 'keep'],
    [{ id: 'valid', keep: 2 }, 'reason'],
    [{ id: 'valid', capture: 'sometimes' }, 'capture'],
  ])('rejects invalid options %#', (options, field) => {
    expect(() => parseCraftSessionAnnotation([craftSession(options as never)], 'mon test')).toThrow(field);
  });

  it('requires exactly one annotation and includes the test title', () => {
    expect(() => parseCraftSessionAnnotation([], 'commande')).toThrow('commande');
  });
});

describe('resolveCraftSessionMode', () => {
  it.each([
    [{ CRAFT_SESSIONS: 'off' }, {}, 'off'],
    [{ CRAFT_SESSIONS: 'update', CI: '1' }, {}, 'update'],
    [{ CI: '1' }, {}, 'compare'],
    [{}, {}, 'update'],
    [{}, { update: 'never' }, 'compare'],
  ] as const)('resolves %j', (env, options, expected) => {
    expect(resolveCraftSessionMode(env, options)).toBe(expected);
  });
});
