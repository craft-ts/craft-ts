/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
// ---------------------------------------------------------------------------
// ɵ WAVE-0 EFFECT PROTOTYPE — THROWAWAY (plan task 0.1).
//
// What this page shows: a craft `query` whose loader is a plain generator that
// does `yield* someEffect`. Pick a scenario, read the trace panel — every line
// is a real step of the craft program pump, pushed by the bridge itself.
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
  each,
  heading,
  ifBlock,
  li,
  matchBlock,
  p,
  span,
  strong,
  ul,
} from '@craft-ts/component';
import { craftComputed, query, state } from '@craft-ts/core';
import { Data, Effect } from 'effect';
import {
  installEffectBridge,
  onEffectTrace,
  resetEffectTrace,
  type EffectTraceEntry,
} from './effect-bridge';

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
  readonly code: 'UserNotFound' | 'Unauthorized';
};

type User = { id: string; name: string; email: string };

// The "domain layer": pure Effect, zero craft.
function loadUser(scenario: Scenario) {
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
      :scope .effect-trace { margin: 0; padding: 0; list-style: none; }
      :scope .effect-trace li {
        display: flex;
        gap: 0.85rem;
        align-items: baseline;
        padding: 0.4rem 0;
        border-bottom: 1px dashed #e2e8f0;
        font-size: 0.85rem;
        line-height: 1.45;
      }
      :scope .effect-trace li:last-child { border-bottom: none; }
      :scope .effect-step {
        flex: none;
        min-width: 9.5rem;
        color: #1e40af;
        font-family: ui-monospace, monospace;
        font-size: 0.72rem;
        letter-spacing: 0.04em;
      }
      :scope .effect-detail { color: #334155; }
      :scope .effect-empty { margin: 0; color: #94a3b8; font-size: 0.85rem; }
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
    installEffectBridge();

    const traceEntries = yield* state(
      'traceEntries',
      [] as readonly EffectTraceEntry[],
      ({ set }) => ({
        replace: (value: readonly EffectTraceEntry[]) => set(value),
      }),
    );
    // `attempt` is a re-run nonce: clicking the scenario you are already on
    // still changes the params, so the loader always runs and the trace always
    // refills. Without it, re-picking the current scenario would clear the
    // trace and leave it empty.
    const request = yield* state(
      'request',
      { scenario: 'success' as Scenario, attempt: 0 },
      ({ update }) => ({
        run: (scenario: Scenario) =>
          update((previous) => ({ scenario, attempt: previous.attempt + 1 })),
      }),
    );

    onEffectTrace((entries) => {
      void traceEntries.replace(entries);
    });

    const userQuery = yield* query(
      'userQuery',
      {
        params: request,
        // A plain craft generator. The only unusual line is the `yield*`, and
        // it reads exactly like every other craft yield.
        loader: function* ({ params }) {
          const user = yield* loadUser((params as { scenario: Scenario }).scenario);
          return user as User;
        },
      },
      ({ resource }) => ({
        hasUser: craftComputed('hasUser', () => resource.hasValue()),
      }),
    );

    const userExceptionLoader = craftComputed(
      'userExceptionLoader',
      function* () {
        return (yield* userQuery.exceptions()).loader;
      },
    );
    const userIsLoading = craftComputed('userIsLoading', function* () {
      const status = yield* userQuery.status();
      return status === 'loading' || status === 'reloading';
    });

    const run = function* (next: Scenario) {
      resetEffectTrace();
      yield* request.run(next);
    };

    return {
      request,
      run,
      traceEntries,
      userQuery,
      userExceptionLoader,
      userIsLoading,
    };
  },
  ({ run, traceEntries, userQuery, userExceptionLoader, userIsLoading }) => {
    return div([
      heading(function* () {
        return `yield* Effect in a craft loader (${yield* userQuery.status()})`;
      }),
      p(
        { class: 'effect-intro' },
        'The loader below is an ordinary craft generator. It yields an Effect built by a domain layer that knows nothing about craft. Pick a scenario and read the trace: those lines are the actual steps of the craft program pump.',
      ),

      div({ class: 'effect-actions' }, [
        button(
          'successButton',
          {
            type: 'button',
            *click() {
              yield* run('success');
            },
          },
          'Effect.succeed',
        ),
        button(
          'notFoundButton',
          {
            type: 'button',
            *click() {
              yield* run('not-found');
            },
          },
          'Effect.fail — UserNotFound',
        ),
        button(
          'unauthorizedButton',
          {
            type: 'button',
            *click() {
              yield* run('unauthorized');
            },
          },
          'Effect.fail — Unauthorized',
        ),
        button(
          'defectButton',
          {
            type: 'button',
            *click() {
              yield* run('defect');
            },
          },
          'Effect.die — defect',
        ),
      ]),

      div({ class: 'effect-panel' }, [
        p({ class: 'effect-panel-title' }, 'What the pump did'),
        ul(
          { class: 'effect-trace' },
          each(
            traceEntries,
            {
              track: (entry: EffectTraceEntry) => entry.id,
              empty: () => p({ class: 'effect-empty' }, 'Pick a scenario above.'),
            },
            (entry) =>
              li([
                span({ class: 'effect-step' }, function* () {
                  return (yield* entry()).label;
                }),
                span({ class: 'effect-detail' }, function* () {
                  return (yield* entry()).detail;
                }),
              ]),
          ),
        ),
      ]),

      div({ class: 'effect-panel' }, [
        p({ class: 'effect-panel-title' }, 'What craft ended up with'),
        ifBlock(userIsLoading, () => p({ class: 'effect-outcome' }, 'Loading…')),
        ifBlock(
          userQuery.hasUser,
          () =>
            p({ class: 'effect-outcome' }, [
              strong('Resolved: '),
              function* () {
                // `hasUser` can still be true for one tick while the value has
                // already been cleared by a reload — read defensively.
                const user = (yield* userQuery.value()) as User | undefined;
                return user?.name ?? '…';
              },
            ]),
          () => [
            matchBlock.exhaustive(
              userExceptionLoader as unknown as () => EffectException,
              'code',
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
        strong('What this page still does the old way. '),
        'The loader above uses a bare ',
        span({ class: 'mono' }, 'yield* effect'),
        ', which works at runtime but declares nothing to the type system: ',
        span({ class: 'mono' }, 'userQuery.exception()'),
        ' is statically ',
        span({ class: 'mono' }, 'undefined'),
        ' even though an exception is provably sitting in it — which is why the ',
        span({ class: 'mono' }, 'matchBlock'),
        ' above needs a cast. Wrapping the yield in ',
        span({ class: 'mono' }, 'runEffect(...)'),
        ' from ',
        span({ class: 'mono' }, '@craft-ts/effect'),
        ' closes that: the error tags then reach craft\'s exception channel at compile time, and a route that forgets one no longer compiles. The bare form is kept here on purpose, to show the difference.',
      ]),
    ]);
  },
);

export default EffectYieldComponent;
