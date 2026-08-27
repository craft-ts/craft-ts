import { Effect } from 'effect';
import { craftException } from '@craft-ts/core';
import { effectServerMiddleware } from '@craft-ts/effect';

/** Effect middleware: its value is yieldable and has no continuation hook. */
export const effectAudit = effectServerMiddleware(
  'demo.effect-audit',
  ({ input }) =>
    Effect.gen(function* () {
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
      yield* Effect.log('effect middleware before user request');
      return { value: undefined };
    }),
);
