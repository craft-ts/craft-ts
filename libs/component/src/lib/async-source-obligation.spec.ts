import { describe, expectTypeOf, it } from 'vitest';
import {
  craftComputed,
  pendingProbe,
  query,
  type CraftPendingProbeSignal,
  type CraftResourceStatus,
} from '@craft-ng/core';
import { craftComponent, div, pendingBlock, span } from '../index';
const _telemetryFactory = function* () {
  const telemetry = yield* query('telemetry', {
    params: () => true,
    loader: async (): Promise<{ ok: true }> => ({ ok: true }),
  });
  return { telemetry };
};

describe('async source obligation', () => {
  it('requires a loading acknowledgement for every yielded async source', () => {
    craftComponent(
      'unacknowledgedAsyncSource',
      {},
      function* () {
        const users = yield* query('users', {
          params: () => true,
          loader: async (): Promise<{ name: string }> => ({ name: 'Ada' }),
        });
        return { users };
      },
      // @ts-expect-error the yielded users source has no loading acknowledgement
      () => div(),
    );
  });

  it('accepts an exhaustive pending boundary', () => {
    craftComponent(
      'exhaustiveAsyncSource',
      {},
      function* () {
        const users = yield* query('users', {
          params: () => true,
          loader: async (): Promise<{ name: string }> => ({ name: 'Ada' }),
        });
        return { users };
      },
      ({ users }) =>
        div({ 'data-value': users.settledValue }, []).pipe(
          pendingBlock.exhaustive({ users: () => span('Loading') }),
        ),
    );
  });

  it('accepts a status probe passed by reference through a prop', () => {
    craftComponent(
      'probedAsyncSource',
      {},
      function* () {
        const users = yield* query('users', {
          params: () => true,
          loader: async (): Promise<{ name: string }> => ({ name: 'Ada' }),
        });
        return { users };
      },
      ({ users }) => div({ 'data-loading': users.status }, []),
    );
  });

  it('carries a pending probe through a craftComputed generator', () => {
    const status = (() => 'idle') as CraftPendingProbeSignal<
      CraftResourceStatus,
      'users'
    >;
    if (false) {
      const resolved = craftComputed('resolved', function* () {
        const current = yield* pendingProbe({ status });
        return () => current() === 'resolved';
      });

      expectTypeOf(resolved).toMatchTypeOf<
        CraftPendingProbeSignal<boolean, 'users'>
      >();
    }
  });

  it('allows an explicitly unmanaged source and rejects unknown names', () => {
    craftComponent(
      'unmanagedAsyncSource',
      { unmanagedAsyncSources: ['telemetry'] as const },
      _telemetryFactory,
      () => div(),
    );

    craftComponent(
      'unknownUnmanagedAsyncSource',
      { unmanagedAsyncSources: ['telemetry'] as const },
      () => ({ users: 1 }),
      // @ts-expect-error telemetry is not yielded by this factory
      () => div(),
    );
  });
});
