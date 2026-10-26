import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpCheckpoint,
  fillTemplate,
  runProbes,
  validateCheckpoint,
} from './guided-resume-checkpoints';

const state = {
  'service:session#3 / query:signInProcess#1': { token: 'tok-123', user: { id: 'u-7' } },
  'component:ProductEditor#2 / state:productId': 'p-9034',
};
const registry = { capture: () => state };

function checkpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    origin: location.origin,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ttlReason: 'jeton valable une heure',
    snapshot: {},
    probes: [
      {
        url: '/api/products/{{state component:ProductEditor / state:productId .}}',
        headers: { authorization: 'Bearer {{state service:session / query:signInProcess token}}' },
        expect: { status: 200, match: ['Flat white'] },
      },
    ],
    created: [
      {
        kind: 'product',
        id: 'p-9034',
        cleanup: { method: 'DELETE', url: '/api/products/p-9034', expect: { status: 204 } },
      },
    ],
    ...overrides,
  };
}

describe('resume checkpoints in the tab', () => {
  const nativeFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = nativeFetch;
  });

  it('fills probes from the live state', () => {
    expect(
      fillTemplate(
        {
          id: '{{state component:ProductEditor / state:productId .}}',
          user: '{{state service:session / query:signInProcess user}}',
          note: 'pour {{state service:session / query:signInProcess user.id}}',
        },
        state,
      ),
    ).toEqual({ id: 'p-9034', user: { id: 'u-7' }, note: 'pour u-7' });
    expect(() => fillTemplate('{{state component:Nope / state:x .}}', state)).toThrow('no live state');
  });

  it('runs probes as the tab and tells which one fails', async () => {
    const seen: Array<[string, string | null]> = [];
    let product = 'Flat white';
    globalThis.fetch = async (input, init) => {
      seen.push([String(input), new Headers(init?.headers).get('authorization')]);
      return new Response(JSON.stringify({ name: product }), { status: 200 });
    };

    await expect(validateCheckpoint(checkpoint(), registry)).resolves.toMatchObject({ valid: true });
    expect(seen[0]).toEqual([`${location.origin}/api/products/p-9034`, 'Bearer tok-123']);

    product = 'Espresso';
    await expect(validateCheckpoint(checkpoint(), registry)).resolves.toMatchObject({
      valid: false,
      probes: [{ ok: false, missing: ['Flat white'] }],
    });
  });

  it('never probes another origin, an expired point or one taken elsewhere', async () => {
    globalThis.fetch = async () => new Response('', { status: 200 });
    await expect(
      runProbes([{ url: 'https://api.example.com/me', expect: {} }], registry),
    ).resolves.toEqual([expect.objectContaining({ ok: false, error: expect.stringContaining('l’app elle-même') })]);
    await expect(
      validateCheckpoint(checkpoint({ expiresAt: '2001-01-01T00:00:00Z' }), registry),
    ).resolves.toMatchObject({ valid: false, expired: true, probes: [] });
    await expect(
      validateCheckpoint(checkpoint({ origin: 'https://staging.example.com' }), registry),
    ).resolves.toMatchObject({ valid: false, originMatches: false });
  });

  it('cleans up what the resume created', async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push(`${init?.method} ${String(input)}`);
      return new Response(null, { status: 204 });
    };
    await expect(cleanUpCheckpoint(checkpoint(), registry)).resolves.toEqual([
      expect.objectContaining({ kind: 'product', id: 'p-9034', ok: true, status: 204 }),
    ]);
    expect(calls).toEqual([`DELETE ${location.origin}/api/products/p-9034`]);
  });
});
