/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  catchTag,
  craftComponent,
  div,
  ifBlock,
  matchBlock,
  p,
  span,
  strong,
  heading,
} from '@craft-ts/component';
import {
  craftException,
  craftGen,
  craftSleep,
  query,
  craftComputed,
} from '@craft-ts/core';

type Scenario = 'success' | 'not-found' | 'consent-missing' | 'forbidden';
type UserExceptionLoader = {
  readonly _tag:
    | 'UserNotFoundException'
    | 'UserConsentMissingException'
    | 'UserAccessForbiddenException';
};

const ExceptionsComponent = craftComponent(
  'ExceptionsComponent',
  {
    styles: `
      :scope {
        display: block;
        max-width: 760px;
        margin: 2rem auto;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        color: #1e293b;
        background: #f8fafc;
      }
      :scope h3 { margin: 0 0 1rem; color: #0f172a; }
      :scope .exception-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      :scope .exception-actions button {
        padding: 0.5rem 1rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        color: #334155;
        background: #fff;
        cursor: pointer;
      }
      :scope .exception-actions button:hover { background: #f1f5f9; }
      :scope .exception-loading {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 1.25rem;
        margin: 0 0 1rem;
        color: #475569;
        font-size: 0.875rem;
      }
      :scope .exception-spinner {
        width: 0.8rem;
        height: 0.8rem;
        border: 2px solid #cbd5e1;
        border-top-color: #2563eb;
        border-radius: 50%;
        animation: ExceptionsComponent-exception-spin 0.7s linear infinite;
      }
      @keyframes ExceptionsComponent-exception-spin { to { transform: rotate(360deg); } }
      :scope p { margin: 0.5rem 0; }
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    const userQuery = yield* query(
      'userQuery',
      {
        method: (scenario: Scenario) => scenario,
        loader: craftGen(function* ({ params }) {
          yield* craftSleep(600);
          if (params === 'not-found') {
            return craftException(
              { _tag: 'UserNotFoundException' },
              { message: 'User does not exist' as const },
            );
          }
          if (params === 'consent-missing') {
            return craftException(
              { _tag: 'UserConsentMissingException' },
              { message: 'User consent is required' as const },
            );
          }
          if (params === 'forbidden') {
            return craftException(
              { _tag: 'UserAccessForbiddenException' },
              { message: 'Access forbidden' as const },
            );
          }
          return { id: 'user-1', name: 'John Doe', email: 'john@doe.dev' };
        }),
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
      }),
    );
    yield* userQuery.call('success'); // trigger first call
    return { userQuery };
  },
  ({ userQuery }) => {
    return div([
      heading(
        function* () {
          return `Query user with business exceptions (${yield* userQuery.status()})`;
        },
      ),
      div({ class: 'exception-actions' }, [
        button('success',
          { type: 'button',
            *click() {
              yield* userQuery.call('success');
            },
          },
          'Success',
        ),
        button('notFound',
          { type: 'button',
            *click() {
              yield* userQuery.call('not-found');
            },
          },
          'User not found',
        ),
        button('consentMissing',
          { type: 'button',
            *click() {
              yield* userQuery.call('consent-missing');
            },
          },
          'Consent missing',
        ),
        button('forbidden',
          { type: 'button',
            *click() {
              yield* userQuery.call('forbidden');
            },
          },
          'Access forbidden',
        ),
      ]),
      ifBlock(
        userQuery.userIsLoading,
        () =>
          div(
            {
              class: 'exception-loading',
              role: 'status',
              'aria-live': 'polite',
            },
            [
              span({ class: 'exception-spinner', 'aria-hidden': 'true' }),
              span('Loading user…'),
            ],
          ),
      ),
      ifBlock(
        userQuery.hasUser,
        () =>
          div([
            p([
              strong('ID: '),
              function* () {
                return ((yield* userQuery.value()) as { id: string }).id;
              },
            ]),
            p([
              strong('Name: '),
              function* () {
                return ((yield* userQuery.value()) as { name: string }).name;
              },
            ]),
            p([
              strong('Email: '),
              function* () {
                return ((yield* userQuery.value()) as { email: string }).email;
              },
            ]),
          ]),
        () => [
          matchBlock.exhaustive(
            userQuery.userExceptionLoader as unknown as () => UserExceptionLoader,
            '_tag',
            {
              UserNotFoundException: () =>
                p('⚠️ User not found (rendered by matchBlock.exhaustive)'),
              UserConsentMissingException: () =>
                p(
                  '⚠️ User consent is required (rendered by matchBlock.exhaustive)',
                ),
              UserAccessForbiddenException: () =>
                p('⚠️ Access forbidden (rendered by matchBlock.exhaustive)'),
            },
          ),
        ],
      ),
    ]);
  },
).pipe(
  catchTag.exhaustive({
    // The query exposes these exceptions as a signal; template rendering is
    // handled by matchBlock.exhaustive above.
    UserNotFoundException: function* () {
      return;
    },
    UserConsentMissingException: function* () {
      return;
    },
    UserAccessForbiddenException: function* () {
      return;
    },
  }),
);

export default ExceptionsComponent;
