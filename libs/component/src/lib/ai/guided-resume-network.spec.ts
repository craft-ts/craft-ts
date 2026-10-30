import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveGuidedResumeScenarioReferences,
  resolveGuidedResumeServerFunctionMock,
  setGuidedResumeNetwork,
  type GuidedResumeNetwork,
} from './guided-resume-network';

const network: GuidedResumeNetwork = {
  mode: 'mocked',
  mocks: [
    {
      call: 'ecommerce.admin.overview',
      defaultCaseId: 'ready',
      cases: [
        { id: 'ready', kind: 'success', response: 'with-donut' },
        { id: 'deleted', kind: 'success', response: 'without-donut' },
        { id: 'offline', kind: 'failure', message: 'Offline' },
      ],
    },
    {
      call: 'ecommerce.product.delete',
      defaultCaseId: 'removed',
      cases: [
        {
          id: 'removed',
          kind: 'success',
          response: 'deleted',
          nextChoices: { 'ecommerce.admin.overview': 'deleted' },
        },
        { id: 'offline', kind: 'failure', message: 'Offline' },
      ],
    },
  ],
};

afterEach(() => setGuidedResumeNetwork(undefined));

describe('guided resume network mock transitions', () => {
  it('uses a success case transition for subsequent calls and resets on rearm', () => {
    const choices = {
      'ecommerce.admin.overview': 'ready',
      'ecommerce.product.delete': 'removed',
    };
    setGuidedResumeNetwork(network, choices);

    expect(
      resolveGuidedResumeServerFunctionMock('ecommerce.admin.overview', {}),
    ).toEqual({ active: true, value: 'with-donut' });
    expect(
      resolveGuidedResumeServerFunctionMock('ecommerce.product.delete', {
        id: 'donut',
      }),
    ).toEqual({ active: true, value: 'deleted' });
    expect(
      resolveGuidedResumeServerFunctionMock('ecommerce.admin.overview', {}),
    ).toEqual({ active: true, value: 'without-donut' });

    setGuidedResumeNetwork(network, choices);
    expect(
      resolveGuidedResumeServerFunctionMock('ecommerce.admin.overview', {}),
    ).toEqual({ active: true, value: 'with-donut' });
  });

  it('resolves a versioned scenario to its encoded transport response', async () => {
    const referenced: GuidedResumeNetwork = {
      mode: 'mocked',
      mocks: [{
        call: 'ecommerce.catalog',
        defaultCaseId: 'catalog',
        cases: [
          {
            id: 'catalog',
            kind: 'success',
            scenario: {
              operationId: 'ecommerce.catalog',
              scenarioId: 'catalog-with-seasonal-products',
              catalogVersion: 'v1',
            },
          },
          { id: 'offline', kind: 'failure', message: 'Offline' },
        ],
      }],
    };
    const resolved = await resolveGuidedResumeScenarioReferences(
      referenced,
      'http://localhost:4204',
      async (input) => {
        expect(String(input)).toContain('operationId=ecommerce.catalog');
        return Response.json({ catalogVersion: 'v1', category: 'success', response: '{"products":[]}' });
      },
    );
    expect(resolved.mocks[0]?.cases[0]).toMatchObject({
      id: 'catalog',
      kind: 'success',
      response: '{"products":[]}',
      scenario: { catalogVersion: 'v1' },
    });
  });

  it('rejects stale scenario references instead of selecting different data', async () => {
    const referenced: GuidedResumeNetwork = {
      mode: 'mocked',
      mocks: [{
        call: 'ecommerce.catalog',
        cases: [{
          id: 'catalog',
          kind: 'success',
          scenario: { operationId: 'ecommerce.catalog', scenarioId: 'catalog-with-seasonal-products', catalogVersion: 'v1' },
        }],
      }],
    };
    await expect(
      resolveGuidedResumeScenarioReferences(
        referenced,
        'http://localhost:4204',
        async () => Response.json({ catalogVersion: 'v2', category: 'success', response: '{}' }),
      ),
    ).rejects.toThrow('Référence périmée');
  });
});
