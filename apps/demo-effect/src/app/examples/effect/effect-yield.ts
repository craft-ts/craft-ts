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
import { craftComputed, state } from '@craft-ts/core';
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
    const request = yield* state(
      'request',
      { scenario: 'success' as ProfileScenario, attempt: 0 },
      ({ update }) => ({
        run: (scenario: ProfileScenario) =>
          update((previous) => ({
            scenario,
            attempt: previous.attempt + 1,
          })),
      }),
    );

    const profileQuery = yield* queryEffect(
      'profileQuery',
      {
        params: request,
        loader: ({ params }) => loadUserProfile(params.scenario),
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

    return { request, profileQuery };
  },
  ({ request, profileQuery }) =>
    div([
      heading(function* () {
        // `heading` is the reactive binding boundary for this title.
        // eslint-disable-next-line craft-ts/require-reactive-template-bindings
        return `Consulter un profil (${yield* profileQuery.status()})`;
      }),
      p(
        { class: 'intro' },
        'Une équipe support consulte le profil d’un utilisateur. Les quatre boutons représentent les résultats possibles d’une opération métier : profil trouvé, profil absent, session expirée ou panne technique.',
      ),
      div({ class: 'actions' }, [
        button(
          'profileButton',
          { type: 'button', *click() { yield* request.run('success'); } },
          'Profil disponible',
        ),
        button(
          'notFoundButton',
          { type: 'button', *click() { yield* request.run('not-found'); } },
          'Profil introuvable',
        ),
        button(
          'expiredButton',
          {
            type: 'button',
            *click() {
              yield* request.run('session-expired');
            },
          },
          'Session expirée',
        ),
        button(
          'databaseButton',
          {
            type: 'button',
            *click() {
              yield* request.run('database-down');
            },
          },
          'Panne de base de données',
        ),
      ]),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Résultat de la consultation'),
        ifBlock(profileQuery.isLoading, () => p('Consultation en cours…')),
        ifBlock(
          profileQuery.hasProfile,
          () =>
            p({ class: 'outcome' }, [
              strong('Profil chargé : '),
              profileQuery.profileName,
            ]),
          () =>
            matchBlock.exhaustive(
              profileQuery.exception as unknown as () => EffectException,
              '_tag',
              {
                UserNotFound: () =>
                  p({ class: 'outcome' }, [
                    strong('Profil introuvable : '),
                    'aucun profil ne correspond à la demande. ',
                    span({ class: 'mono' }, 'UserNotFound'),
                    ' est l’erreur métier propagée par Effect.',
                  ]),
                Unauthorized: () =>
                  p({ class: 'outcome' }, [
                    strong('Accès refusé : '),
                    'la session a expiré. ',
                    span({ class: 'mono' }, 'Unauthorized'),
                    ' est l’erreur métier propagée par Effect.',
                  ]),
              },
            ),
        ),
      ]),
      div({ class: 'note' }, [
        strong('Ce que montre la passerelle Effect : '),
        'un ',
        span({ class: 'mono' }, 'Effect.fail'),
        ' devient une exception métier Craft, tandis qu’un ',
        span({ class: 'mono' }, 'Effect.die'),
        ' reste une erreur technique et ne passe pas par les handlers métier.',
      ]),
    ]),
);

export default EffectYieldComponent;
