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
  craftService,
  craftException,
  craftGen,
  craftSleep,
  query,
  craftComputed,
  state,
} from '@craft-ts/core';
import { example } from '../../shared/example.style';

type Scenario = 'success' | 'not-found' | 'consent-missing' | 'forbidden';
export const { ExceptionsView, provideExceptionsView } = craftService(
  { name: 'exceptionsView', providedIn: 'toProvide' },
  function* () {
    yield* state(
      'lastHandledException',
      '',
      ({ set }) => ({ record: (tag: string) => set(tag) }),
    );

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
      function* ({ resource, exceptions }) {
        return {
          hasUser: yield* craftComputed('hasUser', () => resource.hasValue()),
          userExceptionLoader: yield* craftComputed(
            'userExceptionLoader',
            function* () {
              return (yield* exceptions()).loader;
            },
          ),
          userIsLoading: yield* craftComputed('userIsLoading', function* () {
            const status = yield* resource.status();
            return status === 'loading' || status === 'reloading';
          }),
          userStatusLabel: yield* craftComputed('userStatusLabel', function* () {
            return yield* resource.status();
          }),
          userId: yield* craftComputed('userId', function* () {
            return (yield* resource.value())?.id ?? '';
          }),
          userName: yield* craftComputed('userName', function* () {
            return (yield* resource.value())?.name ?? '';
          }),
          userEmail: yield* craftComputed('userEmail', function* () {
            return (yield* resource.value())?.email ?? '';
          }),
          typedUserExceptionLoader: yield* craftComputed(
            'typedUserExceptionLoader',
            function* () {
              return (yield* exceptions()).loader;
            },
          ),
        };
      },
    );
    yield* userQuery.call('success'); // trigger first call
  },
);

const ExceptionsComponent = craftComponent(
  'ExceptionsComponent',
  {
    providers: [provideExceptionsView()],
  },
  () => div({ class: example.card }, [
        heading({ class: example.title }, [
          'Query user with business exceptions (',
          ExceptionsView.userQuery.userStatusLabel,
          ')',
        ]),
        div({ class: example.row }, [
          button(
            'success',
            {
              class: example.button,
              type: 'button',
              *click() {
                yield* ExceptionsView.userQuery.call('success');
              },
            },
            'Success',
          ),
          button(
            'notFound',
            {
              class: example.button,
              type: 'button',
              *click() {
                yield* ExceptionsView.userQuery.call('not-found');
              },
            },
            'User not found',
          ),
          button(
            'consentMissing',
            {
              class: example.button,
              type: 'button',
              *click() {
                yield* ExceptionsView.userQuery.call('consent-missing');
              },
            },
            'Consent missing',
          ),
          button(
            'forbidden',
            {
              class: example.button,
              type: 'button',
              *click() {
                yield* ExceptionsView.userQuery.call('forbidden');
              },
            },
            'Access forbidden',
          ),
        ]),
        ifNode(ExceptionsView.userQuery.userIsLoading, () =>
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
          ExceptionsView.userQuery.hasUser,
          () =>
            div([
              p([strong('ID: '), ExceptionsView.userQuery.userId]),
              p([strong('Name: '), ExceptionsView.userQuery.userName]),
              p([strong('Email: '), ExceptionsView.userQuery.userEmail]),
            ]),
          () => [
            matchNode.exhaustive(ExceptionsView.userQuery.typedUserExceptionLoader, '_tag', {
              UserNotFoundException: () =>
                p('⚠️ User not found (rendered by matchNode.exhaustive)'),
              UserConsentMissingException: () =>
                p(
                  '⚠️ User consent is required (rendered by matchNode.exhaustive)',
                ),
              UserAccessForbiddenException: () =>
                p('⚠️ Access forbidden (rendered by matchNode.exhaustive)'),
            }),
          ],
        ),
        ifNode(ExceptionsView.userQuery.hasException, () =>
          p({ class: example.hint, role: 'status' }, [
            'Handled ',
            ExceptionsView.lastHandledException,
            ' and rendered the matching message below.',
          ]),
        ),
      ]),
).pipe(
  catchTag.exhaustive({
    // matchNode renders the details; record that each exception reached the
    // component's local UI boundary rather than disappearing silently.
    UserNotFoundException: function* () {
      yield* ExceptionsView.lastHandledException.record('UserNotFoundException');
    },
    UserConsentMissingException: function* () {
      yield* ExceptionsView.lastHandledException.record(
        'UserConsentMissingException',
      );
    },
    UserAccessForbiddenException: function* () {
      yield* ExceptionsView.lastHandledException.record(
        'UserAccessForbiddenException',
      );
    },
  }),
);

export default ExceptionsComponent;
