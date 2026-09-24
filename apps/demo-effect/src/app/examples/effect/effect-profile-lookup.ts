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
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import {
  loadUserProfile,
  type ProfileScenario,
} from '../../shared/access-domain';
import { example } from '../../effect-demo.style';

const EffectYieldComponent = craftComponent(
  'EffectYieldComponent',
  {},
  function* () {
    const profileQuery = yield* queryEffect(
      'profileQuery',
      {
        method: (scenario: ProfileScenario) => scenario,
        loader: ({ params }) => loadUserProfile(params),
      },
      ({ resource }) => ({
        hasProfile: craftComputed('hasProfile', () => resource.hasValue()),
        profileName: craftComputed('profileName', function* () {
          return (yield* resource.value())?.name ?? '…';
        }),
        headingText: craftComputed('headingText', function* () {
          return `View a profile (${yield* resource.status()})`;
        }),
      }),
    );

    yield* profileQuery.call('success'); // trigger first call

    return { headingText: profileQuery.headingText, profileQuery };
  },
  ({ headingText, profileQuery }) =>
    div({ class: example.card }, [
      heading({ class: example.title }, headingText),
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
              yield* profileQuery.call('success');
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
              yield* profileQuery.call('not-found');
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
              yield* profileQuery.call('session-expired');
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
              yield* profileQuery.call('database-down');
            },
          },
          'Database outage',
        ),
      ]),
      div({ class: example.panel }, [
        p({ class: example.panelTitle }, 'Lookup result'),
        ifNode(profileQuery.isLoading, () => p('Looking up…')),
        ifNode(
          profileQuery.hasProfile,
          () =>
            p({ class: example.row }, [
              strong('Profile loaded: '),
              profileQuery.profileName,
            ]),
          () =>
            matchNode.exhaustive(profileQuery.exceptions.loader, '_tag', {
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
            }),
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
    ]),
);

export default EffectYieldComponent;
