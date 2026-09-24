import {
  button,
  catchTag,
  craftComponent,
  div,
  ifNode,
  matchNode,
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
import { example } from '../../shared/example.style';

type Scenario = 'success' | 'not-found' | 'consent-missing' | 'forbidden';
const ExceptionsComponent = craftComponent(
  'ExceptionsComponent',
  {},
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
              { message: 'User does not exist' },
            );
          }
          if (params === 'consent-missing') {
            return craftException(
              { _tag: 'UserConsentMissingException' },
              { message: 'User consent is required' },
            );
          }
          if (params === 'forbidden') {
            return craftException(
              { _tag: 'UserAccessForbiddenException' },
              { message: 'Access forbidden' },
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
        userStatusLabel: craftComputed('userStatusLabel', function* () {
          return yield* resource.status();
        }),
        userId: craftComputed('userId', function* () {
          return (yield* resource.value())?.id ?? '';
        }),
        userName: craftComputed('userName', function* () {
          return (yield* resource.value())?.name ?? '';
        }),
        userEmail: craftComputed('userEmail', function* () {
          return (yield* resource.value())?.email ?? '';
        }),
        typedUserExceptionLoader: craftComputed(
          'typedUserExceptionLoader',
          function* () {
            return (yield* exceptions()).loader;
          },
        ),
      }),
    );
    yield* userQuery.call('success'); // trigger first call
    return { userQuery };
  },
  ({ userQuery }) => {
    return div({ class: example.card }, [
      heading({ class: example.title }, [
        'Query user with business exceptions (',
        userQuery.userStatusLabel,
        ')',
      ]),
      div({ class: example.row }, [
        button('success',
          { class: example.button, type: 'button',
            *click() {
              yield* userQuery.call('success');
            },
          },
          'Success',
        ),
        button('notFound',
          { class: example.button, type: 'button',
            *click() {
              yield* userQuery.call('not-found');
            },
          },
          'User not found',
        ),
        button('consentMissing',
          { class: example.button, type: 'button',
            *click() {
              yield* userQuery.call('consent-missing');
            },
          },
          'Consent missing',
        ),
        button('forbidden',
          { class: example.button, type: 'button',
            *click() {
              yield* userQuery.call('forbidden');
            },
          },
          'Access forbidden',
        ),
      ]),
      ifNode(
        userQuery.userIsLoading,
        () =>
          div(
            {
              class: example.row,
              role: 'status',
              'aria-live': 'polite',
            },
            [
              span({ class: example.spinner, 'aria-hidden': 'true' }),
              span('Loading user…'),
            ],
          ),
      ),
      ifNode(
        userQuery.hasUser,
        () =>
          div([
            p([
              strong('ID: '),
              userQuery.userId,
            ]),
            p([
              strong('Name: '),
              userQuery.userName,
            ]),
            p([
              strong('Email: '),
              userQuery.userEmail,
            ]),
          ]),
        () => [
          matchNode.exhaustive(
            userQuery.typedUserExceptionLoader,
            '_tag',
            {
              UserNotFoundException: () =>
                p('⚠️ User not found (rendered by matchNode.exhaustive)'),
              UserConsentMissingException: () =>
                p(
                  '⚠️ User consent is required (rendered by matchNode.exhaustive)',
                ),
              UserAccessForbiddenException: () =>
                p('⚠️ Access forbidden (rendered by matchNode.exhaustive)'),
            },
          ),
        ],
      ),
    ]);
  },
).pipe(
  catchTag.exhaustive({
    // The query exposes these exceptions as a signal; template rendering is
    // handled by matchNode.exhaustive above.
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
