import { describe, expect, it } from 'vitest';
import {
  extractReferenceCandidates,
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
