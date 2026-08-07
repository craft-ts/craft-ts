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
import { craftComputed, craftException, query, state } from '@craft-ng/core';

type Scenario = 'success' | 'not-found' | 'consent-missing' | 'forbidden';

const ExceptionsComponent = craftComponent(
  'ExceptionsComponent',
  {
    styles:
      '.exception-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.exception-actions button{padding:8px 16px}',
  },
  function* () {
    const scenario = yield* state(
      'scenario',
      'success' as Scenario,
      ({ set }) => ({ select: (value: Scenario) => set(value) }),
    );
    const userQuery = yield* query('userQuery', {
      params: scenario,
      loader: async ({ params }) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
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
      },
    });
    const hasUser = craftComputed('hasUser', () => userQuery.hasValue());
    const isLoading = craftComputed('isLoading', () => userQuery.isLoading());
    return { scenario, userQuery, hasUser, isLoading };
  },
  ({ scenario, userQuery, hasUser, isLoading }) => {
    return [
      h3(`Query user with business exceptions (${userQuery.status()})`),
      div({ class: 'exception-actions' }, [
        button({ click: () => scenario.select('success') }, 'Success'),
        button({ click: () => scenario.select('not-found') }, 'User not found'),
        button(
          { click: () => scenario.select('consent-missing') },
          'Consent missing',
        ),
        button(
          { click: () => scenario.select('forbidden') },
          'Access forbidden',
        ),
      ]),
      ifBlock(
        hasUser,
        () => {
          const user = userQuery.value() as {
            id: string;
            name: string;
            email: string;
          };
          return div([
            p([strong('ID: '), user.id]),
            p([strong('Name: '), user.name]),
            p([strong('Email: '), user.email]),
          ]);
        },
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
    ];
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
