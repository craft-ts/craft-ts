import { Effect } from 'effect';
import { craftException } from '@craft-ts/core';
import { effectServerMiddleware } from '@craft-ts/effect';
import { CurrentUser } from '../server/authentication';

/** Effect middleware: before/after hooks and server DI stay in the Effect adapter. */
export const effectAudit = effectServerMiddleware(
  'demo.effect-audit',
  ({ next, input }) =>
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
      const result = yield* Effect.exit(next());
      yield* Effect.log(
        `effect middleware after success=${result._tag === 'Success'}`,
      );
      return yield* result;
    }),
);
