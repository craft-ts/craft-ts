/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  craftComponent,
  div,
  heading,
  ifBlock,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadTeamOverview } from '../../shared/access-domain';

/**
 * Demonstrates global and route-scoped Layers through a real business read.
 * The query returns a team overview; it never exposes the services used to
 * produce that overview as if they were server-state data.
 */
const EffectLayerScopeComponent = craftComponent(
  'EffectLayerScopeComponent',
  {
    styles: `
      :scope { display: block; max-width: 880px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #dcfce7; border-radius: 12px; color: #14532d; background: #f0fdf4; }
      :scope h1 { margin: 0 0 0.5rem; color: #14532d; }
      .intro { margin: 0 0 1.25rem; color: #166534; line-height: 1.55; }
      .panel { padding: 1rem 1.1rem; border: 1px solid #bbf7d0; border-radius: 8px; background: #fff; }
      .panel-title { margin: 0 0 0.65rem; color: #64748b; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      .row { margin: 0.65rem 0; line-height: 1.5; }
      .note { margin-top: 1.25rem; padding: 0.95rem 1.1rem; border-left: 3px solid #22c55e; border-radius: 0 8px 8px 0; background: #f0fdf4; color: #166534; font-size: 0.85rem; line-height: 1.6; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #dcfce7; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      .members { margin: 0.4rem 0 0; padding-left: 1.2rem; }
      button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    const teamOverviewQuery = yield* queryEffect(
      'teamOverviewQuery',
      {
        params: () => 'support',
        loader: () => loadTeamOverview,
      },
      ({ resource }) => ({
        teamName: craftComputed('teamName', function* () {
          return (yield* resource.value())?.teamName ?? '…';
        }),
        viewerName: craftComputed('viewerName', function* () {
          return (yield* resource.value())?.viewerName ?? '…';
        }),
        viewerAccess: craftComputed('viewerAccess', function* () {
          return (yield* resource.value())?.viewerAccess ?? '…';
        }),
        memberNames: craftComputed('memberNames', function* () {
          return (
            (yield* resource.value())?.members
              .map((member: { readonly name: string }) => member.name)
              .join(', ') ?? '…'
          );
        }),
      }),
    );

    return { teamOverviewQuery };
  },
  ({ teamOverviewQuery }) =>
    div([
      heading('Vue de l’équipe'),
      p(
        { class: 'intro' },
        'La page affiche les membres de l’équipe Support visibles par l’utilisateur connecté. La session vient de l’application et l’équipe vient de cette route ; la donnée affichée est une vraie vue métier mockée.',
      ),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Équipe active'),
        ifBlock(teamOverviewQuery.isLoading, () => p('Chargement de la vue équipe…')),
        p({ class: 'row' }, [strong('Équipe : '), teamOverviewQuery.teamName]),
        p({ class: 'row' }, [strong('Utilisateur connecté : '), teamOverviewQuery.viewerName]),
        p({ class: 'row' }, [strong('Niveau d’accès : '), teamOverviewQuery.viewerAccess]),
        p({ class: 'row' }, [strong('Membres visibles : '), teamOverviewQuery.memberNames]),
      ]),
      p({ class: 'note' }, [
        'La query charge ',
        span({ class: 'mono' }, 'TeamOverview'),
        '. Cette donnée dépend de deux services Effect, mais les services eux-mêmes restent des dépendances internes de l’opération métier.',
      ]),
    ]),
);

export default EffectLayerScopeComponent;
