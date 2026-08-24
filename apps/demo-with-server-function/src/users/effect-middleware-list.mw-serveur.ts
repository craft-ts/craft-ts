import { Effect } from 'effect';
import { craftException, craftMiddleware } from '@craft-ts/core';
import { effectServerMiddleware } from '@craft-ts/effect';
import { CurrentUser } from '../server/authentication';

/** Effect middleware: its value is yieldable and has no continuation hook. */
export const effectAudit = effectServerMiddleware(
  'demo.effect-audit',
  ({ input }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      if (
        typeof input === 'object' &&
        input !== null &&
        (input as { readonly simulateError?: unknown }).simulateError ===
          'middleware'
      ) {
        return yield* Effect.fail(
          craftException(
            { _tag: 'DemoMiddlewareFailure' },
            {
              message: 'The Effect middleware rejected this request.',
              layer: 'effectAudit',
            },
          ),
        );
      }
      yield* Effect.log(`effect middleware before user=${user.id}`);
      return { value: undefined };
    }),
);
