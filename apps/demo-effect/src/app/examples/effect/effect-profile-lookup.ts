// This page uses a concrete profile consultation to show how Effect outcomes
// cross the Craft query boundary.

import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  matchNode,
  p,
  span,
  strong,
} from '@craft-ts/component';
import {
  craftService,
  craftComputed,
  craftUse,
  craftExpose,
} from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import {
  loadUserProfile,
  type ProfileScenario,
} from '../../shared/access-domain';
import { example } from '../../effect-demo.style';

export const { EffectYieldView, provideEffectYieldView } = craftService(
  { name: 'effectYieldView', providedIn: 'toProvide' },
  function* () {
    const profileQuery = yield* queryEffect(
      'profileQuery',
      {
        method: (scenario: ProfileScenario) => scenario,
        loader: ({ params }) => loadUserProfile(params),
      },
      ({ resource }) => ({
        hasProfile: craftUse(
          craftComputed('hasProfile', () => resource.hasValue()),
        ),
        profileName: craftUse(
          craftComputed('profileName', function* () {
            return (yield* resource.value())?.name ?? '…';
          }),
        ),
        headingText: craftUse(
          craftComputed('headingText', function* () {
            return `View a profile (${yield* resource.status()})`;
          }),
        ),
      }),
    );

    yield* profileQuery.call('success'); // trigger first call

    yield* craftExpose('headingText', profileQuery.headingText);
  },
);

const EffectYieldComponent = craftComponent(
  'EffectYieldComponent',
  {
    providers: [provideEffectYieldView()],
  },
  function* () {
    return div({ class: example.card }, [
      heading({ class: example.title }, function* () {
        return (yield* EffectYieldView()).headingText;
      }),
      p(
        { class: example.intro },
        'A support team looks up a user profile. The four buttons represent the possible outcomes of a business operation: profile found, profile missing, session expired, or a technical outage.',
      ),
      div({ class: example.actions }, [
        button(
          'profileButton',
          {
            class: example.button,
            type: 'button',
            *click() {
              yield* (yield* EffectYieldView()).profileQuery.call('success');
            },
          },
          'Profile available',
        ),
        button(
          'notFoundButton',
          {
            class: example.button,
            type: 'button',
            *click() {
              yield* (yield* EffectYieldView()).profileQuery.call('not-found');
            },
          },
          'Profile not found',
        ),
        button(
          'expiredButton',
          {
            class: example.button,
            type: 'button',
            *click() {
              yield* (yield* EffectYieldView()).profileQuery.call(
                'session-expired',
              );
            },
          },
          'Session expired',
        ),
        button(
          'databaseButton',
          {
            class: example.button,
            type: 'button',
            *click() {
              yield* (yield* EffectYieldView()).profileQuery.call(
                'database-down',
              );
            },
          },
          'Database outage',
        ),
      ]),
      div({ class: example.panel }, [
        p({ class: example.panelTitle }, 'Lookup result'),
        ifNode(
          'profile-loading',
          function* () {
            return yield* (yield* EffectYieldView()).profileQuery.isLoading();
          },
          () => p('Looking up…'),
        ),
        ifNode(
          'profile-has-profile',
          function* () {
            return yield* (yield* EffectYieldView()).profileQuery.hasProfile();
          },
          () =>
            p({ class: example.row }, [
              strong('Profile loaded: '),
              function* () {
                return yield* (yield* EffectYieldView()).profileQuery.profileName();
              },
            ]),
          () =>
            matchNode.exhaustive(
              function* () {
                return (yield* (yield* EffectYieldView()).profileQuery.exceptions())
                  .loader;
              },
              '_tag',
              {
                UserNotFound: () =>
                  p({ class: example.row }, [
                    strong('Profile not found: '),
                    'no profile matches the request. ',
                    span({ class: example.mono }, 'UserNotFound'),
                    ' is the business error propagated by Effect.',
                  ]),
                Unauthorized: () =>
                  p({ class: example.row }, [
                    strong('Access denied: '),
                    'the session has expired. ',
                    span({ class: example.mono }, 'Unauthorized'),
                    ' is the business error propagated by Effect.',
                  ]),
              },
            ),
        ),
      ]),
      div({ class: example.note, 'data-exampleNote': 'callout' }, [
        strong('What the Effect bridge shows: '),
        'an ',
        span({ class: example.mono }, 'Effect.fail'),
        ' becomes a Craft business exception, while an ',
        span({ class: example.mono }, 'Effect.die'),
        ' remains a technical error and does not go through business handlers.',
      ]),
    ]);
  },
);

export default EffectYieldComponent;
