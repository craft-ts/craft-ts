import { signal } from '@angular/core';
import {
  button,
  catchTag,
  craftComponent,
  div,
  h3,
  p,
  strong,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftException,
  provideHostName,
  query,
} from '@craft-ng/core';

type Scenario = 'success' | 'not-found' | 'consent-missing' | 'forbidden';

const ExceptionsComponent = craftComponent(
  'ExceptionsComponent',
  {
    providers: [provideHostName('component:ExceptionsComponent')],
    styles:
      '.exception-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.exception-actions button{padding:8px 16px}',
  },
  function* () {
    componentMonitoring();
    const scenario = signal<Scenario>('success');
    const { userQuery } = yield* query('userQuery', {
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
    return { scenario, userQuery };
  },
  ({ scenario, userQuery }) => {
    const exception = userQuery.exceptions().loader;
    const user = userQuery.safeValue();
    return [
      h3(`Query user with business exceptions (${userQuery.status()})`),
      div({ class: 'exception-actions' }, [
        button({ click: () => scenario.set('success') }, 'Success'),
        button({ click: () => scenario.set('not-found') }, 'User not found'),
        button(
          { click: () => scenario.set('consent-missing') },
          'Consent missing',
        ),
        button({ click: () => scenario.set('forbidden') }, 'Access forbidden'),
      ]),
      user
        ? div([
            p([strong('ID: '), user.id]),
            p([strong('Name: '), user.name]),
            p([strong('Email: '), user.email]),
          ])
        : exception
          ? p(`⚠️ ${exception.code}`)
          : p('Loading user…'),
    ];
  },
).pipe(
  catchTag.exhaustive({
    UserNotFoundException: () =>
      p('⚠️ User not found (handled by catchTag.exhaustive)'),
    UserConsentMissingException: () =>
      p('⚠️ User consent is required (handled by catchTag.exhaustive)'),
    UserAccessForbiddenException: () =>
      p('⚠️ Access forbidden (handled by catchTag.exhaustive)'),
  }),
);

export default ExceptionsComponent;
