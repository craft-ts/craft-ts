import {
  button,
  catchTag,
  craftComponent,
  div,
  h3,
  ifBlock,
  matchBlock,
  p,
  strong,
} from '@craft-ng/component';
import {
  craftComputed,
  craftException,
  craftGen,
  craftSleep,
  query,
  state,
} from '@craft-ng/core';

type Scenario = 'success' | 'not-found' | 'consent-missing' | 'forbidden';

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
      :scope p { margin: 0.5rem 0; }
    `,
  },
  function* () {
    const scenario = yield* state(
      'scenario',
      'success' as Scenario,
      ({ set }) => ({ select: (value: Scenario) => set(value) }),
    );
    const userQuery = yield* query('userQuery', {
      params: scenario,
      loader: craftGen(function* ({ params }) {
        yield* craftSleep(600);
        if (params === 'not-found') {
          return craftException(
            { code: 'UserNotFoundException' },
            { message: 'User does not exist' as const },
          );
        }
        if (params === 'consent-missing') {
          return craftException(
            { code: 'UserConsentMissingException' },
            { message: 'User consent is required' as const },
          );
        }
        if (params === 'forbidden') {
          return craftException(
            { code: 'UserAccessForbiddenException' },
            { message: 'Access forbidden' as const },
          );
        }
        return { id: 'user-1', name: 'John Doe', email: 'john@doe.dev' };
      }),
    });
    const hasUser = craftComputed('hasUser', () => userQuery.hasValue());
    const isLoading = craftComputed('isLoading', () => userQuery.isLoading());
    return { scenario, userQuery, hasUser, isLoading };
  },
  ({ scenario, userQuery, hasUser, isLoading }) => {
    const currentUser = () =>
      userQuery.value() as { id: string; name: string; email: string };
    return div([
      h3(() => `Query user with business exceptions (${userQuery.status()})`),
      div({ class: 'exception-actions' }, [
        button(
          {
            *click() {
              yield* scenario.select('success');
            },
          },
          'Success',
        ),
        button(
          {
            *click() {
              yield* scenario.select('not-found');
            },
          },
          'User not found',
        ),
        button(
          {
            *click() {
              yield* scenario.select('consent-missing');
            },
          },
          'Consent missing',
        ),
        button(
          {
            *click() {
              yield* scenario.select('forbidden');
            },
          },
          'Access forbidden',
        ),
      ]),
      ifBlock(
        hasUser,
        () =>
          div([
            p([
              strong('ID: '),
              () => currentUser().id,
            ]),
            p([
              strong('Name: '),
              () => currentUser().name,
            ]),
            p([
              strong('Email: '),
              () => currentUser().email,
            ]),
          ]),
        () => [
          matchBlock.exhaustive(() => userQuery.exceptions().loader, 'code', {
            UserNotFoundException: () =>
              p('⚠️ User not found (rendered by matchBlock.exhaustive)'),
            UserConsentMissingException: () =>
              p(
                '⚠️ User consent is required (rendered by matchBlock.exhaustive)',
              ),
            UserAccessForbiddenException: () =>
              p('⚠️ Access forbidden (rendered by matchBlock.exhaustive)'),
          }),
          ifBlock(isLoading, () => p('Loading user…')),
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
