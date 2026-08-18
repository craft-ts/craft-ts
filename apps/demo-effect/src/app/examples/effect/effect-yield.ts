// This page uses a concrete profile consultation to show how Effect outcomes
// cross the Craft query boundary.

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
/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import {
  loadUserProfile,
  type ProfileScenario,
  type Unauthorized,
  type UserNotFound,
} from '../../shared/access-domain';

type EffectException = UserNotFound | Unauthorized;

const EffectYieldComponent = craftComponent(
  'EffectYieldComponent',
  {
    styles: `
      :scope { display: block; max-width: 880px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b; background: #f8fafc; }
      :scope h1 { margin: 0 0 0.5rem; color: #0f172a; }
      .intro { margin: 0 0 1.25rem; color: #475569; line-height: 1.55; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
      .actions button { padding: 0.5rem 0.9rem; border: 1px solid #cbd5e1; border-radius: 6px; color: #334155; background: #fff; cursor: pointer; }
      .actions button:hover { background: #f1f5f9; }
      .panel { margin-bottom: 1rem; padding: 1rem 1.1rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
      .panel-title { margin: 0 0 0.75rem; color: #64748b; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      .outcome { margin: 0.4rem 0; line-height: 1.5; }
      .note { padding: 0.95rem 1.1rem; border-left: 3px solid #f59e0b; border-radius: 0 8px 8px 0; background: #fffbeb; color: #78350f; font-size: 0.85rem; line-height: 1.6; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #eef2f7; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      .note .mono { background: #fef3c7; }
      button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    const profileQuery = yield* queryEffect(
      'profileQuery',
      {
        method: (scenario: ProfileScenario) => scenario,
        loader: ({ params }) => loadUserProfile(params),
      },
      ({ resource, exceptions }) => ({
        hasProfile: craftComputed('hasProfile', () => resource.hasValue()),
        profileName: craftComputed('profileName', function* () {
          return (yield* resource.value())?.name ?? '…';
        }),
        exception: craftComputed('exception', function* () {
          return (yield* exceptions()).loader;
        }),
      }),
    );

    yield* profileQuery.call('success'); // trigger first call

    return { profileQuery };
  },
  ({ profileQuery }) =>
    div([
      heading(function* () {
        // `heading` is the reactive binding boundary for this title.
        // eslint-disable-next-line craft-ts/require-reactive-template-bindings
        return `View a profile (${yield* profileQuery.status()})`;
      }),
      p(
        { class: 'intro' },
        'A support team looks up a user profile. The four buttons represent the possible outcomes of a business operation: profile found, profile missing, session expired, or a technical outage.',
      ),
      div({ class: 'actions' }, [
        button(
          'profileButton',
          { type: 'button', *click() { yield* profileQuery.call('success'); } },
          'Profile available',
        ),
        button(
          'notFoundButton',
          { type: 'button', *click() { yield* profileQuery.call('not-found'); } },
          'Profile not found',
        ),
        button(
          'expiredButton',
          {
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
            type: 'button',
            *click() {
              yield* profileQuery.call('database-down');
            },
          },
          'Database outage',
        ),
      ]),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Lookup result'),
        ifBlock(profileQuery.isLoading, () => p('Looking up…')),
        ifBlock(
          profileQuery.hasProfile,
          () =>
            p({ class: 'outcome' }, [
              strong('Profile loaded: '),
              profileQuery.profileName,
            ]),
          () =>
            matchBlock.exhaustive(
              profileQuery.exception as unknown as () => EffectException,
              '_tag',
              {
                UserNotFound: () =>
                  p({ class: 'outcome' }, [
                    strong('Profile not found: '),
                    'no profile matches the request. ',
                    span({ class: 'mono' }, 'UserNotFound'),
                    ' is the business error propagated by Effect.',
                  ]),
                Unauthorized: () =>
                  p({ class: 'outcome' }, [
                    strong('Access denied: '),
                    'the session has expired. ',
                    span({ class: 'mono' }, 'Unauthorized'),
                    ' is the business error propagated by Effect.',
                  ]),
              },
            ),
        ),
      ]),
      div({ class: 'note' }, [
        strong('What the Effect bridge shows: '),
        'an ',
        span({ class: 'mono' }, 'Effect.fail'),
        ' becomes a Craft business exception, while an ',
        span({ class: 'mono' }, 'Effect.die'),
        ' remains a technical error and does not go through business handlers.',
      ]),
    ]),
);

export default EffectYieldComponent;
