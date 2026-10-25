import { describe, expect, it } from 'vitest';
import type { SendContextEvent } from '@craft-ts/core';
import { buildDebugSessionProvenance } from './debug-session-provenance';

function event(
  values: Partial<SendContextEvent> &
    Pick<SendContextEvent, 'id' | 'sequence' | 'kind' | 'phase'>,
): SendContextEvent {
  return {
    timestamp: values.sequence,
    ...values,
  } as SendContextEvent;
}

describe('debug session provenance', () => {
  it('connects a response reference to storage and a later request', () => {
    const events = [
      event({
        id: 'login',
        sequence: 1,
        kind: 'http',
        phase: 'succeeded',
        name: 'ecommerce.auth.login',
        refs: [
          {
            path: 'response.body.token',
            fingerprint: 'fp-token',
            direction: 'in',
          },
        ],
      }),
      event({
        id: 'storage',
        sequence: 2,
        kind: 'storage',
        phase: 'emitted',
        name: 'atelier.session.v1',
        refs: [
          {
            path: 'localStorage.session.token',
            fingerprint: 'fp-token',
            direction: 'in',
          },
        ],
      }),
      event({
        id: 'overview',
        sequence: 3,
        kind: 'http',
        phase: 'started',
        name: 'ecommerce.admin.overview',
        refs: [
          {
            path: 'headers.authorization',
            fingerprint: 'fp-token',
            direction: 'out',
          },
        ],
      }),
    ];

    expect(buildDebugSessionProvenance(events)).toEqual([
      {
        fingerprint: 'fp-token',
        producers: [
          {
            eventId: 'login',
            sequence: 1,
            name: 'ecommerce.auth.login',
            path: 'response.body.token',
          },
        ],
        holders: [
          {
            eventId: 'storage',
            sequence: 2,
            name: 'atelier.session.v1',
            path: 'localStorage.session.token',
          },
        ],
        consumers: [
          {
            eventId: 'overview',
            sequence: 3,
            name: 'ecommerce.admin.overview',
            path: 'headers.authorization',
          },
        ],
        edges: [
          {
            from: {
              eventId: 'login',
              sequence: 1,
              name: 'ecommerce.auth.login',
              path: 'response.body.token',
            },
            to: {
              eventId: 'storage',
              sequence: 2,
              name: 'atelier.session.v1',
              path: 'localStorage.session.token',
            },
          },
          {
            from: {
              eventId: 'login',
              sequence: 1,
              name: 'ecommerce.auth.login',
              path: 'response.body.token',
            },
            to: {
              eventId: 'overview',
              sequence: 3,
              name: 'ecommerce.admin.overview',
              path: 'headers.authorization',
            },
          },
        ],
      },
    ]);
  });
});
