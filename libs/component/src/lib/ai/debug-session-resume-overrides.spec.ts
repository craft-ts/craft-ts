import { describe, expect, it, vi } from 'vitest';
import {
  applyDebugSessionResumeOverride,
  applyResumeJsonPatch,
  isDebugSessionResumeOverrideList,
  validateDebugSessionResumeOverrides,
} from './debug-session-resume-overrides';

describe('debug session resume overrides', () => {
  it('accepts only unique frozen call overrides with one effect', () => {
    expect(
      isDebugSessionResumeOverrideList([
        {
          call: 'ecommerce.auth.me',
          response: { role: 'admin' },
          frozen: true,
        },
        { call: 'GET /catalog', patch: { items: [] }, frozen: true },
      ]),
    ).toBe(true);
    expect(
      isDebugSessionResumeOverrideList([
        { call: 'ecommerce.auth.me', response: {}, frozen: false },
      ]),
    ).toBe(false);
    expect(
      isDebugSessionResumeOverrideList([
        { call: 'GET /catalog', response: {}, patch: {}, frozen: true },
      ]),
    ).toBe(false);
    expect(
      isDebugSessionResumeOverrideList([
        { call: 'GET /catalog', response: {}, status: 599, frozen: true },
      ]),
    ).toBe(true);
    for (const status of [199, 600, 403.5, '403'])
      expect(
        isDebugSessionResumeOverrideList([
          { call: 'GET /catalog', response: {}, status, frozen: true },
        ]),
      ).toBe(false);
    expect(
      isDebugSessionResumeOverrideList([
        { call: 'GET /catalog', response: {}, frozen: true },
        { call: 'GET /catalog', patch: {}, frozen: true },
      ]),
    ).toBe(false);
  });

  it('applies recursive JSON merge patch and removes null-valued keys', () => {
    expect(
      applyResumeJsonPatch(
        { user: { id: 'old', role: 'client' }, obsolete: true, tags: ['a'] },
        { user: { id: 'new', role: null }, obsolete: null, tags: ['b'] },
      ),
    ).toEqual({ user: { id: 'new' }, tags: ['b'] });
  });

  it('replaces a server-function response by its exact function id', async () => {
    const request = new Request('http://local.test/__server-functions', {
      method: 'POST',
      body: JSON.stringify({ id: 'ecommerce.auth.me', input: {} }),
    });
    const nativeFetch = vi.fn<typeof fetch>();
    const result = await applyDebugSessionResumeOverride(request, nativeFetch, [
      {
        call: 'ecommerce.auth.me',
        response: { user: { role: 'admin' } },
        frozen: true,
      },
    ]);

    expect(nativeFetch).not.toHaveBeenCalled();
    expect(result?.override?.call).toBe('ecommerce.auth.me');
    expect(await result?.response.json()).toEqual({
      user: { role: 'admin' },
    });
  });

  it('can freeze a business rejection with its recorded HTTP status', async () => {
    const request = new Request('http://local.test/__server-functions', {
      method: 'POST',
      body: JSON.stringify({ id: 'ecommerce.admin.updateProduct', input: {} }),
    });
    const nativeFetch = vi.fn<typeof fetch>();
    const result = await applyDebugSessionResumeOverride(request, nativeFetch, [
      {
        call: 'ecommerce.admin.updateProduct',
        response: { message: 'Action réservée aux administrateurs.' },
        status: 403,
        frozen: true,
      },
    ]);

    expect(nativeFetch).not.toHaveBeenCalled();
    expect(result?.response.status).toBe(403);
    expect(await result?.response.json()).toEqual({
      message: 'Action réservée aux administrateurs.',
    });
  });

  it('patches a live JSON response and preserves its status', async () => {
    const request = new Request('http://local.test/catalog');
    const nativeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ count: 2, labels: ['old'] }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await applyDebugSessionResumeOverride(request, nativeFetch, [
      { call: 'GET /catalog', patch: { count: 3 }, frozen: true },
    ]);

    expect(nativeFetch).toHaveBeenCalledOnce();
    expect(result?.override?.call).toBe('GET /catalog');
    expect(result?.response.status).toBe(202);
    expect(await result?.response.json()).toEqual({
      count: 3,
      labels: ['old'],
    });
  });

  it('can force a status while patching a live JSON response', async () => {
    const request = new Request('http://local.test/catalog');
    const nativeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'ok' }), { status: 200 }),
      );
    const result = await applyDebugSessionResumeOverride(request, nativeFetch, [
      {
        call: 'GET /catalog',
        patch: { message: 'denied' },
        status: 403,
        frozen: true,
      },
    ]);

    expect(result?.response.status).toBe(403);
    expect(await result?.response.json()).toEqual({ message: 'denied' });
  });

  it('validates replacement and patch shapes against the recorded response', () => {
    const archive = {
      events: [
        {
          id: 'request',
          sequence: 1,
          timestamp: 1,
          kind: 'http',
          phase: 'started',
          operationId: 'request-1',
          payload: {
            source: 'browser-fetch',
            method: 'POST',
            url: 'http://local.test/__server-functions',
            body: JSON.stringify({ id: 'ecommerce.auth.me' }),
          },
        },
        {
          id: 'response',
          sequence: 2,
          timestamp: 2,
          kind: 'http',
          phase: 'succeeded',
          operationId: 'request-1',
          response: {
            status: 200,
            body: JSON.stringify({ user: { id: 'one', role: 'client' } }),
          },
        },
      ],
    } as unknown as import('@craft-ts/core').SendContextReplayExport;

    expect(
      validateDebugSessionResumeOverrides(archive, [
        {
          call: 'ecommerce.auth.me',
          response: { user: { id: 'two', role: 'admin' } },
          frozen: true,
        },
        {
          call: 'ecommerce.auth.me',
          patch: { user: { role: 'admin' } },
          frozen: true,
        },
      ]),
    ).toEqual([]);
    expect(
      validateDebugSessionResumeOverrides(archive, [
        {
          call: 'ecommerce.auth.me',
          response: { user: { id: 'two' }, extra: true },
          frozen: true,
        },
      ]),
    ).toEqual([
      { call: 'ecommerce.auth.me', reason: 'response-shape-mismatch' },
    ]);
    expect(
      validateDebugSessionResumeOverrides(archive, [
        { call: 'GET /missing', response: {}, frozen: true },
      ]),
    ).toEqual([{ call: 'GET /missing', reason: 'missing-recorded-response' }]);
  });

  it('pairs captured schemas by participant when operation ids repeat', () => {
    const archive = {
      events: ['buyer', 'admin'].flatMap((participantId, index) => [
        {
          id: `${participantId}-request`,
          sequence: index * 2 + 1,
          timestamp: index * 2 + 1,
          participantId,
          kind: 'http',
          phase: 'started',
          operationId: 'fetch-1',
          payload: {
            method: 'GET',
            url: `http://local.test/${participantId}`,
          },
        },
        {
          id: `${participantId}-response`,
          sequence: index * 2 + 2,
          timestamp: index * 2 + 2,
          participantId,
          kind: 'http',
          phase: 'succeeded',
          operationId: 'fetch-1',
          response: {
            body: JSON.stringify(
              participantId === 'buyer' ? { user: 'buyer' } : { role: 'admin' },
            ),
          },
        },
      ]),
    } as unknown as import('@craft-ts/core').SendContextReplayExport;

    expect(
      validateDebugSessionResumeOverrides(archive, [
        {
          call: 'GET /admin',
          response: { role: 'manager' },
          frozen: true,
        },
      ]),
    ).toEqual([]);
  });

  it('leaves calls without an exact override to the barrier', async () => {
    const nativeFetch = vi.fn<typeof fetch>();
    const result = await applyDebugSessionResumeOverride(
      new Request('http://local.test/catalog/42'),
      nativeFetch,
      [{ call: 'GET /catalog', response: {}, frozen: true }],
    );

    expect(result).toBeUndefined();
    expect(nativeFetch).not.toHaveBeenCalled();
  });
});
