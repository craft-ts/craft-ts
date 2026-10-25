import { describe, expect, it } from 'vitest';
import type { SendContextReplayExport } from '@craft-ts/core';
import { buildDebugSessionResumeManifest } from './debug-session-resume-manifest';

describe('buildDebugSessionResumeManifest', () => {
  it('exports only session-local fingerprints for references', () => {
    const manifest = buildDebugSessionResumeManifest(
      {
        format: 'craft-debug-session-resume-plan',
        version: 1,
        targetElapsedMs: 10,
        status: 'ready',
        steps: [],
        problems: [],
        expectedCalls: ['GET /account'],
        substitutions: [],
      },
      {
        format: 'craft-debug-session',
        version: 7,
        referenceCaptureVersion: 1,
        startUrl: 'http://localhost/',
        exportedAt: 0,
        truncated: false,
        events: [{
          id: 'account-response',
          sequence: 1,
          timestamp: 0,
          globalElapsedMs: 5,
          kind: 'http',
          phase: 'succeeded',
          refs: [{ path: '$.token', fingerprint: '0123456789abcdef', direction: 'in' }],
        }],
        clips: [],
      } as SendContextReplayExport,
    );

    expect(manifest.entries.map((entry) => entry.name)).toContain('0123456789abcdef');
    expect(manifest.entries).toContainEqual(
      expect.objectContaining({
        kind: 'reference',
        name: '0123456789abcdef',
        level: 'informational',
      }),
    );
    expect(manifest.checklistMarkdown).toContain('GET /account');
    expect(manifest.checklistMarkdown).not.toContain('secret-token');
  });
});

describe('manifest entities from declarations', () => {
  const plan = {
    format: 'craft-debug-session-resume-plan' as const,
    version: 1 as const,
    targetElapsedMs: 50,
    status: 'ready' as const,
    steps: [
      {
        id: 'acquire:session',
        kind: 'acquire' as const,
        resource: 'session',
        persona: 'client',
        personaId: 'leo',
        blocking: true,
      },
      {
        id: 'acquire:cart',
        kind: 'acquire' as const,
        resource: 'cart',
        unneeded: true,
        blocking: false,
      },
    ],
    problems: [],
    expectedCalls: [],
    substitutions: [],
    entities: [
      { primitive: 'service:cart / state:cartLines#1', role: 'restores' as const, kind: 'product', path: '$[*].productId' },
      {
        primitive: 'route:catalogue / query:storeQuery#1',
        role: 'provides' as const,
        kind: 'product',
        path: '$.products[*].id',
        calls: ['shop.catalog'],
      },
    ],
  };
  const archive = {
    format: 'craft-debug-session',
    version: 7,
    referenceCaptureVersion: 1,
    startUrl: 'http://localhost/',
    exportedAt: 0,
    truncated: false,
    events: [
      {
        id: 'catalog-started',
        sequence: 1,
        timestamp: 1,
        globalElapsedMs: 1,
        kind: 'http',
        phase: 'started',
        operationId: 'op-1',
        payload: { method: 'POST', url: '/__server-functions', body: JSON.stringify({ id: 'shop.catalog', input: {} }) },
      },
      {
        id: 'catalog-answered',
        sequence: 2,
        timestamp: 2,
        globalElapsedMs: 2,
        kind: 'http',
        phase: 'succeeded',
        operationId: 'op-1',
        response: { status: 200, body: JSON.stringify(JSON.stringify({ products: [{ id: 'espresso' }, { id: 'croissant' }] })) },
      },
      {
        id: 'cart-lines',
        sequence: 3,
        timestamp: 3,
        globalElapsedMs: 3,
        kind: 'primitive',
        phase: 'emitted',
        name: 'primitive-change',
        payload: { address: 'service:cart / state:cartLines#1', primitiveKind: 'state' },
        state: { 'service:cart / state:cartLines#1': [{ productId: 'espresso', quantity: 1 }] },
      },
    ],
    clips: [],
  } as unknown as SendContextReplayExport;

  it('requires the entities of restored state and only expects those of server lists', () => {
    const manifest = buildDebugSessionResumeManifest(plan, archive);
    const entities = manifest.entries.filter((entry) => entry.kind === 'entity');
    expect(entities).toEqual([
      { level: 'required', kind: 'entity', name: 'espresso', detail: 'product' },
      { level: 'expected', kind: 'entity', name: 'croissant', detail: 'product' },
    ]);
  });

  it('requires a persona for each acquisition that runs', () => {
    const manifest = buildDebugSessionResumeManifest(plan, archive);
    expect(manifest.entries.filter((entry) => entry.kind === 'persona')).toEqual([
      { level: 'required', kind: 'persona', name: 'client', detail: 'leo' },
    ]);
  });
});
