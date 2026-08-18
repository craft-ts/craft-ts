// ---------------------------------------------------------------------------
// ɵ EffectTS + CraftTS demo — yield* Effect in a Craft loader.
//
// What this page shows: a craft `query` whose loader is a plain generator that
// does `yield* runEffect(someEffect)`. The Effect bridge is installed once at
// application startup, so the loader stays focused on the domain operation.
//
// The three scenarios are three different channels, and they are NOT
// interchangeable:
//   Effect.succeed → the pump resumes the generator      → status "resolved"
//   Effect.fail    → the error `_tag` becomes a craft exception → status "exception"
//   Effect.die     → a defect, never a business exception → status "error"
// ---------------------------------------------------------------------------

import {
  button,
  craftComponent,
  div,
  heading,
  ifBlock,
  matchBlock,
  p,
  span,
  strong,
} from '@craft-ts/component';
/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import { craftComputed, query, state } from '@craft-ts/core';
import { runEffect } from '@craft-ts/effect';
import { Data, Effect } from 'effect';

// Effect's own tagged errors. Nothing craft-specific about them — that is the
// point: they come from a domain layer that has never heard of craft.
class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly reason: string;
}> {}

type Scenario = 'success' | 'not-found' | 'unauthorized' | 'defect';

type EffectException = {
  readonly _tag: 'UserNotFound' | 'Unauthorized';
};

type User = { id: string; name: string; email: string };

// The "domain layer": pure Effect, zero craft.
function loadUser(
  scenario: Scenario,
): Effect.Effect<User, UserNotFound | Unauthorized> {
  switch (scenario) {
    case 'not-found':
      return Effect.fail(new UserNotFound({ userId: 'u-42' }));
    case 'unauthorized':
      return Effect.fail(new Unauthorized({ reason: 'token expired' }));
    case 'defect':
      return Effect.die(new Error('the database connection exploded'));
    case 'success':
      return Effect.succeed({
        id: 'u-42',
        name: 'Ada Lovelace',
        email: 'ada@craft.dev',
      });
  }
}

const EffectYieldComponent = craftComponent(
  'EffectYieldComponent',
  {
    styles: `
      :scope {
        display: block;
        max-width: 880px;
        margin: 2rem auto;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        color: #1e293b;
        background: #f8fafc;
      }
      :scope h1, :scope h2, :scope h3 { margin: 0 0 0.5rem; color: #0f172a; }
      :scope .effect-intro {
        margin: 0 0 1.25rem;
        color: #475569;
        font-size: 0.9rem;
        line-height: 1.55;
      }
      :scope .effect-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 1.25rem;
      }
      :scope .effect-actions button {
        padding: 0.5rem 0.9rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        color: #334155;
        background: #fff;
        font-family: ui-monospace, monospace;
        font-size: 0.8rem;
        cursor: pointer;
      }
      :scope .effect-actions button:hover { background: #f1f5f9; }
      :scope .effect-panel {
        margin-bottom: 1rem;
        padding: 1rem 1.1rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
      }
      :scope .effect-panel-title {
        margin: 0 0 0.75rem;
        color: #64748b;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      :scope .effect-outcome { margin: 0.4rem 0; line-height: 1.5; }
      :scope .effect-gap {
        margin-top: 1.25rem;
        padding: 0.95rem 1.1rem;
        border-left: 3px solid #f59e0b;
        border-radius: 0 8px 8px 0;
        background: #fffbeb;
        color: #78350f;
        font-size: 0.85rem;
        line-height: 1.6;
      }
      :scope .mono {
        padding: 0.05rem 0.3rem;
        border-radius: 3px;
        background: #eef2f7;
        font-family: ui-monospace, monospace;
        font-size: 0.8rem;
      }
      :scope .effect-gap .mono { background: #fef3c7; }

      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    // `attempt` is a re-run nonce: clicking the scenario you are already on
    // still changes the params, so the loader always runs.
    const request = yield* state(
      'request',
      { scenario: 'success' as Scenario, attempt: 0 },
      ({ update }) => ({
        run: (scenario: Scenario) =>
          update((previous) => ({ scenario, attempt: previous.attempt + 1 })),
      }),
    );

    const userQuery = yield* query(
      'userQuery',
      {
        params: request,
        // A plain craft generator. `runEffect` is the only adapter needed at
        // the boundary between the Effect domain layer and CraftTS.
        loader: function* ({ params }) {
          return yield* runEffect(loadUser(params.scenario));
        },
      },
      ({ resource, exceptions }) => ({
        hasUser: craftComputed('hasUser', () => resource.hasValue()),
        userExceptionLoader: craftComputed(
          'userExceptionLoader',
          function* () {
            return (yield* exceptions()).loader;
          },
        ),
        userIsLoading: craftComputed('userIsLoading', function* () {
          const status = yield* resource.status();
          return status === 'loading' || status === 'reloading';
        }),
        userName: craftComputed('userName', function* () {
          const user = (yield* resource.value()) as User | undefined;
          return user?.name ?? '…';
        }),
      }),
    );

    return {
      request,
      userQuery,
    };
  },
  ({
    request,
    userQuery,
  }) => {
    return div([
      heading(function* () {
        // `heading` is itself the reactive binding boundary for this title.
        // The rule cannot infer that through the helper's generator overload.
        // eslint-disable-next-line craft-ts/require-reactive-template-bindings
        return `yield* Effect in a craft loader (${yield* userQuery.status()})`;
      }),
      p(
        { class: 'effect-intro' },
        'The loader below is an ordinary craft generator. It yields an Effect built by a domain layer that knows nothing about craft. Pick a scenario and inspect how success, typed failures, and defects reach CraftTS.',
      ),

      div({ class: 'effect-actions' }, [
        button(
          'successButton',
          {
            type: 'button',
            *click() {
              yield* request.run('success');
            },
          },
          'Effect.succeed',
        ),
        button(
          'notFoundButton',
          {
            type: 'button',
            *click() {
              yield* request.run('not-found');
            },
          },
          'Effect.fail — UserNotFound',
        ),
        button(
          'unauthorizedButton',
          {
            type: 'button',
            *click() {
              yield* request.run('unauthorized');
            },
          },
          'Effect.fail — Unauthorized',
        ),
        button(
          'defectButton',
          {
            type: 'button',
            *click() {
              yield* request.run('defect');
            },
          },
          'Effect.die — defect',
        ),
      ]),

      div({ class: 'effect-panel' }, [
        p({ class: 'effect-panel-title' }, 'What craft ended up with'),
        ifBlock(userQuery.userIsLoading, () =>
          p({ class: 'effect-outcome' }, 'Loading…'),
        ),
        ifBlock(
          userQuery.hasUser,
          () =>
            p({ class: 'effect-outcome' }, [
              strong('Resolved: '),
              userQuery.userName,
            ]),
          () => [
            matchBlock.exhaustive(
              userQuery.userExceptionLoader as unknown as () => EffectException,
              '_tag',
              {
                UserNotFound: () =>
                  p({ class: 'effect-outcome' }, [
                    strong('Exception — '),
                    'the Effect error tag ',
                    span({ class: 'mono' }, 'UserNotFound'),
                    ' arrived intact on ',
                    span({ class: 'mono' }, 'userQuery.exception()'),
                    ', and is matched here by discriminant.',
                  ]),
                Unauthorized: () =>
                  p({ class: 'effect-outcome' }, [
                    strong('Exception — '),
                    'the Effect error tag ',
                    span({ class: 'mono' }, 'Unauthorized'),
                    ' arrived intact on ',
                    span({ class: 'mono' }, 'userQuery.exception()'),
                    ', and is matched here by discriminant.',
                  ]),
              },
            ),
          ],
        ),
        p({ class: 'effect-outcome' }, [
          strong('On the defect scenario '),
          'nothing is matched above, on purpose: a defect is not a business exception. It goes to the error channel and stays out of ',
          span({ class: 'mono' }, 'handleExceptions'),
          '.',
        ]),
      ]),

      div({ class: 'effect-gap' }, [
        strong('The application-level bridge. '),
        'The Effect bridge is installed once in ',
        span({ class: 'mono' }, 'app.config.ts'),
        '. Each loader only wraps its boundary yield with ',
        span({ class: 'mono' }, 'runEffect(...)'),
        ': ',
        span({ class: 'mono' }, 'userQuery.exception()'),
        " receives Effect's typed failures without a local trace hook, provider, or adapter object. The domain function remains pure Effect code.",
      ]),
    ]);
  },
);

export default EffectYieldComponent;
