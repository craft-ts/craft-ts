import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftMiddleware,
  craftUse,
  flattenClientMiddlewares,
  runClientMiddlewareChain,
  TestBed,
} from '@craft-ts/core';

const trace: string[] = [];

const session = craftMiddleware('client.session').client(function* () {
  trace.push('session');
  return { userId: 'u-1' };
});

const workspace = craftMiddleware('client.workspace')
  .use(session)
  .client(function* () {
    const current = yield* session;
    trace.push(`workspace:${current.userId}`);
    return { workspaceId: `ws-${current.userId}` };
  });

describe('yieldable client middleware', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    trace.length = 0;
  });

  it('returns direct fragments and memoizes a yielded dependency', () => {
    const context = craftUse(
      runClientMiddlewareChain([workspace], { filter: 'ada' }),
    );
    expect(context).toEqual({ userId: 'u-1', workspaceId: 'ws-u-1' });
    expect(trace).toEqual(['session', 'workspace:u-1']);
  });

  it('flattens dependencies and rejects duplicate implementations', () => {
    expect(flattenClientMiddlewares([workspace]).map(({ id }) => id)).toEqual([
      'client.session',
      'client.workspace',
    ]);
    const duplicate = craftMiddleware('client.session').client(function* () {
      return { userId: 'other' };
    });
    expect(() => flattenClientMiddlewares([session, duplicate])).toThrow(
      'Duplicate middleware id "client.session"',
    );
  });
});

// @ts-expect-error next is intentionally absent from the client middleware API.
craftMiddleware('client.no-next').client(function* ({ next }) {
  return next;
});
