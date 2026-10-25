import { describe, expect, it } from 'vitest';
import {
  compareResumeOutcome,
  resumeCallNameOf,
  resumeCallNamesOf,
  resumePlaceholdersOf,
  substituteResumePlaceholders,
} from './debug-session-resume-calls';

describe('resume call names', () => {
  it('names a craft server function by its id, from the header or the body', () => {
    expect(
      resumeCallNamesOf('POST', '/rpc', '{}', undefined, {
        'X-Craft-Function-Id': 'shop.cart.get',
      }),
    ).toEqual(['shop.cart.get', 'function:shop.cart.get', 'POST /rpc']);
    expect(
      resumeCallNameOf('POST', '/rpc', JSON.stringify({ id: 'shop.catalog', input: {} })),
    ).toBe('shop.catalog');
  });

  it('names any other backend by method and path template', () => {
    expect(
      resumeCallNameOf('get', '/carts/7e5a7f20-1f9d-4e80-9e6d-1086cfe2bf60?full=1'),
    ).toBe('GET /carts/:ref');
    // A JSON body that is not the craft protocol does not invent an id.
    expect(resumeCallNameOf('POST', '/orders', JSON.stringify({ id: 'o-1' }))).toBe(
      'POST /orders',
    );
  });
});

describe('resume placeholders', () => {
  it('replaces the placeholders it can resolve and reports the others', () => {
    const text = '{"token":"craft-ref:aabbccddeeff0011","cart":"craft-ref:1100ffeeddccbbaa"}';
    expect(resumePlaceholdersOf(text)).toEqual(['aabbccddeeff0011', '1100ffeeddccbbaa']);
    expect(
      substituteResumePlaceholders(text, (fingerprint) =>
        fingerprint === 'aabbccddeeff0011' ? 'fresh' : undefined,
      ),
    ).toEqual({
      text: '{"token":"fresh","cart":"craft-ref:1100ffeeddccbbaa"}',
      missing: ['1100ffeeddccbbaa'],
    });
  });
});

describe('compareResumeOutcome', () => {
  it('compares the status, then the declared paths of the answer', () => {
    expect(compareResumeOutcome({ status: 403 }, { status: 403, body: '' })).toEqual({
      matched: true,
      detail: '403 attendu, 403 obtenu',
    });
    expect(compareResumeOutcome({ status: 403 }, { status: 200, body: '' }).matched).toBe(
      false,
    );
    const recordedBody = JSON.stringify(JSON.stringify({ error: { code: 'FORBIDDEN' } }));
    expect(
      compareResumeOutcome(
        { status: 403, match: [['error', 'code']], recordedBody },
        { status: 403, body: JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }) },
      ),
    ).toEqual({
      matched: false,
      detail: 'error.code : ["FORBIDDEN"] attendu, ["AUTH_REQUIRED"] obtenu',
    });
  });
});
