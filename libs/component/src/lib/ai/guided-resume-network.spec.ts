import { afterEach, describe, expect, it } from 'vitest';
import {
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
});
