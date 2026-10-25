import { describe, expect, it, vi } from 'vitest';
import { executeCraftSessionResume } from './debug-session-resume-runtime';

describe('executeCraftSessionResume shared resources', () => {
  it('skips reacquisition when the leader already supplied the resource', async () => {
    const acquire = vi.fn(() => ({ id: 'local-cart' }));
    const entry = {
      address: 'Cart#1 / mutation:create',
      resume: { resource: 'cart', role: 'provides', acquire },
    };
    const resources = new Map([['cart', { id: 'leader-cart' }]]);
    const onResourceAcquired = vi.fn();
    const report = await executeCraftSessionResume({
      plan: {
        format: 'craft-debug-session-resume-plan',
        version: 1,
        targetElapsedMs: 0,
        status: 'ready',
        steps: [
          {
            id: 'acquire-cart',
            kind: 'acquire',
            resource: 'cart',
            primitive: entry.address,
            persona: 'client',
            blocking: true,
          },
        ],
        problems: [],
        expectedCalls: [],
        substitutions: [],
      },
      manifest: {
        format: 'craft-debug-session-resume-manifest',
        version: 1,
        entries: [],
        checklistMarkdown: '',
      },
      snapshot: {
        format: 'craft-debug-app-snapshot',
        version: 1,
        route: '/',
        primitives: {},
        storage: [],
        warnings: [],
      },
      injector: {} as never,
      registry: { list: () => [entry] } as never,
      personas: [],
      preflightAdapter: { readFacts: async () => [] },
      sharedResources: resources,
      onResourceAcquired,
    });

    expect(acquire).not.toHaveBeenCalled();
    expect(onResourceAcquired).not.toHaveBeenCalled();
    expect(report.steps).toEqual([
      expect.objectContaining({
        id: 'acquire-cart',
        status: 'conformant',
        detail: 'Ressource reçue de l’onglet de tête.',
      }),
    ]);
  });
});
