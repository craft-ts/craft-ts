import { serverFunction } from '@craft-ts/core';
import { craftException } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { UserRepository, UserSchema } from '../server/database';
import { effectAudit } from './effect-middleware-list.mw-serveur';

const inputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    filter: Schema.String,
    simulateError: Schema.Union([
      Schema.Literal('none'),
      Schema.Literal('middleware'),
      Schema.Literal('handler'),
    ]),
  }),
);
const outputSchema = Schema.toStandardSchemaV1(Schema.Array(UserSchema));

/** End-to-end Effect middleware example, exposed through the normal registry. */
export const effectMiddlewareListUsers = serverFunction(
  'demo.users.effect-middleware-list',
  inputSchema,
  { exposure: 'client', output: outputSchema },
)
  .use(effectAudit)
  .handler(({ input }) =>
    Effect.gen(function* () {
      yield* Effect.sleep('400 millis');
      if (input.simulateError === 'handler') {
        return yield* Effect.fail(
          craftException(
            { _tag: 'DemoHandlerFailure' },
            {
              message: 'The Effect server handler failed on request.',
              operation: 'UserRepository.list',
            },
          ),
        );
      }
      const users = yield* UserRepository;
      return yield* users.list(input.filter);
    }),
  )
    .exposeErrors({
      DemoMiddlewareFailure: (_errorPayload) => ({
        code: 'DEMO_MIDDLEWARE_FAILURE',
        status: 422,
      }),
      DemoHandlerFailure: (_errorPayload) => ({
        code: 'DEMO_HANDLER_FAILURE',
        status: 422,
      }),
    });
