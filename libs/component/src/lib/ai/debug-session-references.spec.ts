import { describe, expect, it } from 'vitest';
import {
  createDebugSessionReferenceRedactor,
  extractReferenceCandidates,
  getDebugSessionReferenceSalt,
  fingerprintDebugSessionReference,
  redactDebugSessionHeaders,
  redactDebugSessionReferences,
  redactDebugSessionUrl,
  redactDebugSessionUrlEncoded,
} from './debug-session-references';

describe('debug session reference handling', () => {
  it('finds UUIDs and opaque high-entropy values while ignoring ordinary values', () => {
    const candidates = extractReferenceCandidates({
      id: '7e5a7f20-1f9d-4e80-9e6d-1086cfe2bf60',
      token: 'sk_live_X8yZ4pQ7mN2vB6cD9fG3hJ5k',
      cartId: 'cart_7f1ab93cd5e2',
      date: '2026-10-24T12:30:00.000Z',
      count: 123,
      word: 'administrator',
    });

    expect(candidates.map(({ path }) => path)).toEqual([
      '$.id',
      '$.token',
      '$.cartId',
    ]);
  });

  it('uses stable session-scoped fingerprints and masks repeated values consistently', () => {
    const token = 'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op';
    const first = redactDebugSessionReferences(
      { token, again: token },
      'salt-a',
    );
    const second = redactDebugSessionReferences(token, 'salt-b');

    expect(first.value).toEqual({
      token: `craft-ref:${first.refs[0]?.fingerprint}`,
      again: `craft-ref:${first.refs[0]?.fingerprint}`,
    });
    expect(first.refs[0]?.fingerprint).toBe(
      fingerprintDebugSessionReference(token, 'salt-a'),
    );
    expect(second.refs[0]?.fingerprint).not.toBe(first.refs[0]?.fingerprint);
  });

  it('masks sensitive headers and templates URL reference segments', () => {
    const token = 'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op';
    const headers = redactDebugSessionHeaders(
      {
        Authorization: `Bearer ${token}`,
        'X-Session-Token': 'short',
      },
      'salt',
      'out',
    );
    const url = redactDebugSessionUrl(
      'https://api.example.test/carts/7e5a7f20-1f9d-4e80-9e6d-1086cfe2bf60?token=a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op',
      'salt',
    );

    expect(headers.headers['Authorization']).toMatch(/^craft-ref:/);
    expect(headers.refs[0]?.fingerprint).toBe(
      fingerprintDebugSessionReference(token, 'salt'),
    );
    expect(headers.refs).toHaveLength(2);
    expect(url.url).toContain('/carts/:ref');
    expect(url.url).not.toContain('a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op');
    expect(url.refs).toHaveLength(2);
  });

  it('masks references in form encoded parameters', () => {
    const token = 'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op';
    const result = redactDebugSessionUrlEncoded(
      `token=${token}&page=2`,
      'salt',
      'request.body',
      'out',
    );

    expect(result.value).toContain('token=craft-ref%3A');
    expect(result.value).toContain('page=2');
    expect(result.value).not.toContain(token);
    expect(result.refs).toHaveLength(1);
  });
});

describe('reference provenance', () => {
  const jwt =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsZW8ifQ.Qm9uam91ciBMw6lvLCBjZWNpIGVzdCB1bmUgc2lnbmF0dXJl';

  it('traces tokens in snake_case and camelCase fields', () => {
    const { refs } = redactDebugSessionReferences(
      { access_token: jwt, accessToken: 'short', clientSecret: 'x', client_secret: 'y' },
      'salt',
      'response.body',
      'in',
    );
    expect(refs.map(({ path }) => path)).toEqual([
      'response.body.access_token',
      'response.body.accessToken',
      'response.body.clientSecret',
      'response.body.client_secret',
    ]);
  });

  it('follows JSON encoded twice and encodes it back the same way', () => {
    const body = JSON.stringify(
      JSON.stringify({
        token: '1f7c6a2e-9b1d-4c3e-8f5a-2d4b6c8e0a1f',
        user: { id: 'leo', role: 'client' },
      }),
    );
    const redacted = redactDebugSessionReferences(
      JSON.parse(body),
      'salt',
      'response.body',
      'in',
    );
    expect(redacted.refs).toEqual([
      expect.objectContaining({ path: 'response.body.token', direction: 'in' }),
    ]);
    const decoded = JSON.parse(redacted.value as string) as Record<string, unknown>;
    expect(decoded['token']).toBe(`craft-ref:${redacted.refs[0]?.fingerprint}`);
    expect(decoded['user']).toEqual({ id: 'leo', role: 'client' });
  });

  it('never takes prose, slugs or code names for references outside identifier fields', () => {
    const { refs } = redactDebugSessionReferences(
      {
        description: 'Double espresso, grains du jour et lait velouté maison',
        owner: 'admin-overview-poll-with-a-long-slug',
        component: 'EcommerceCataloguePageWithLongName',
        id: 'flat-white',
        productId: 'croissant-pur-beurre-aop',
      },
      'salt',
      'response.body',
      'in',
    );
    expect(refs.map(({ path }) => path)).toEqual(['response.body.productId']);
  });
});

describe('reference redactor', () => {
  it('turns sensitive fields into session placeholders before the fallback runs', () => {
    const session = {};
    const { redactor, bind } = createDebugSessionReferenceRedactor(
      (value: unknown) => value,
    );
    const before = redactor({ token: 'abc' }, undefined);
    bind(session);
    const after = redactor({ token: 'abc', user: { id: 'leo' } }, undefined);

    expect(before).toEqual({ token: 'abc' });
    expect(after).toEqual({
      token: `craft-ref:${fingerprintDebugSessionReference('abc', getDebugSessionReferenceSalt(session))}`,
      user: { id: 'leo' },
    });
  });
});
