import { describe, expect, it } from 'vitest';
import { CraftPrimitiveRegistry } from '../src/lib/craft-primitive-registry';
import {
  captureCraftTransferSnapshot,
  primeCraftTransferSnapshot,
} from '../src/lib/craft-transfer-snapshot';
import {
  CraftSecurityError,
  DEFAULT_CRAFT_SECURITY_POLICY,
} from '../src/lib/craft-security';
import { createServer } from '../src/lib/server';
import { serverFunction } from '../src/lib/server-function';
import type { StandardSchemaV1 } from '../src/lib/standard-schema';

const anySchema: StandardSchemaV1<unknown, unknown> = {
  '~standard': {
    version: 1,
    vendor: 'security-test',
    types: undefined,
    validate: (value) => ({ value }),
  },
};

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://craft.test/__server-functions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('core security runtime', () => {
  it('denies unlisted transfer entries and validates client snapshots', () => {
    const registry = new CraftPrimitiveRegistry();
    registry.register('state:public', {
      kind: 'state', name: 'public', hostTags: [], read: () => 'ok', write: () => undefined,
    });
    registry.register('state:secret', {
      kind: 'state', name: 'secret', hostTags: [], transfer: false, read: () => 'nope', write: () => undefined,
    });
    const snapshot = captureCraftTransferSnapshot(registry, {
      policy: { mode: 'allowlist', allow: ['state:public#1'], maxDepth: 2 },
    });
    expect(snapshot.values).toEqual({ 'state:public#1': 'ok' });
    expect(() => primeCraftTransferSnapshot(registry, {
      version: 1,
      values: { 'state:public#1': { a: { b: { c: 1 } } } },
      queries: {},
    }, { mode: 'allowlist', maxDepth: 2 })).toThrow(CraftSecurityError);
  });

  it('transfers nothing under the default policy', () => {
    const registry = new CraftPrimitiveRegistry();
    // Ce que pose le framework pour une primitive ordinaire.
    registry.register('state:userEmail', {
      kind: 'state', name: 'userEmail', hostTags: [], transfer: true,
      read: () => 'romain@example.com', write: () => undefined,
    });
    const snapshot = captureCraftTransferSnapshot(registry, {
      policy: DEFAULT_CRAFT_SECURITY_POLICY.transfer,
    });
    expect(snapshot.values).toEqual({});
  });

  it('limits server-function bodies and hides unexpected errors', async () => {
    const fn = serverFunction('security.echo', anySchema).handler(() => {
      throw new Error('private database details');
    });
    const server = createServer({
      functions: [fn],
      runtimeOptions: { maxBodyBytes: 128, timeoutMs: 50 },
    });
    const oversized = await server.handle(
      jsonRequest({ id: 'security.echo', input: 'x'.repeat(300) }),
    );
    expect(oversized.status).toBe(413);
    const failed = await server.handle(
      jsonRequest({ id: 'security.echo', input: null }),
    );
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({
      error: { code: 'CRAFT_SERVER_FUNCTION_INTERNAL', message: 'The server function failed.' },
    });
    expect(failed.headers.get('cache-control')).toBe('no-store');
    expect(failed.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects cross-site invocations of the server-function protocol', async () => {
    let called = false;
    const fn = serverFunction('security.delete', anySchema).handler(() => {
      called = true;
      return 'deleted';
    });
    const server = createServer({ functions: [fn] });

    // Requête « simple » d'un formulaire tiers : pas de préflight CORS.
    const simple = await server.handle(
      new Request('https://craft.test/__server-functions', {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://evil.test' },
        body: JSON.stringify({ id: 'security.delete', input: null }),
      }),
    );
    expect(simple.status).toBe(415);

    const crossOrigin = await server.handle(
      jsonRequest({ id: 'security.delete', input: null }, { origin: 'https://evil.test' }),
    );
    expect(crossOrigin.status).toBe(403);

    const crossSite = await server.handle(
      jsonRequest({ id: 'security.delete', input: null }, { 'sec-fetch-site': 'cross-site' }),
    );
    expect(crossSite.status).toBe(403);
    expect(called).toBe(false);

    const sameOrigin = await server.handle(
      jsonRequest({ id: 'security.delete', input: null }, { origin: 'https://craft.test' }),
    );
    expect(sameOrigin.status).toBe(200);
    expect(called).toBe(true);
  });

  it('does not let an unknown function id be distinguished', async () => {
    const fn = serverFunction('security.known', anySchema).handler(() => 'ok');
    const server = createServer({ functions: [fn] });
    const unknown = await server.handle(jsonRequest({ id: 'security.unknown', input: null }));
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toEqual({
      error: { code: 'CRAFT_SERVER_FUNCTION_REQUEST_INVALID' },
    });
  });

  it('refuses a chunked body larger than the limit without buffering it', async () => {
    const fn = serverFunction('security.echo', anySchema).handler(() => 'ok');
    const server = createServer({
      functions: [fn],
      runtimeOptions: { maxBodyBytes: 1_024 },
    });
    let produced = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1;
        // Un client hostile n'annonce pas Content-Length et ne s'arrête pas.
        controller.enqueue(new TextEncoder().encode('x'.repeat(512)));
        if (produced > 1_000) controller.close();
      },
    });
    const response = await server.handle(
      new Request('https://craft.test/__server-functions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // @ts-expect-error duplex fait partie de la requête streamée
        duplex: 'half',
      }),
    );
    expect(response.status).toBe(413);
    expect(produced).toBeLessThan(10);
  });

  it('keeps tagged failures private when a public catalogue is declared', async () => {
    const failing = serverFunction('security.tagged', anySchema).handler(() => {
      throw Object.assign(new Error('boom'), {
        _tag: 'InternalRepositoryError',
        connectionString: 'postgres://user:password@db/internal',
      });
    });
    const server = createServer({
      functions: [failing],
      publicErrors: { KnownDomainError: { code: 'KNOWN', status: 422 } },
    });
    const response = await server.handle(
      jsonRequest({ id: 'security.tagged', input: null }),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('postgres://');
  });
});
