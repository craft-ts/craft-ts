import {
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadTeamOverview } from '../../shared/access-domain';
import { example } from '../../effect-demo.style';

/**
 * Demonstrates global and route-scoped Layers through a real business read.
 * The query returns a team overview; it never exposes the services used to
 * produce that overview as if they were server-state data.
 */
const EffectLayerScopeComponent = craftComponent(
  'EffectLayerScopeComponent',
  {},
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
    div({ class: example.card, 'data-exampleTint': 'green' }, [
      heading({ class: example.title }, 'Team overview'),
      p(
        { class: example.intro },
        'The page shows the members of the Support team visible to the signed-in user. The session comes from the application and the team comes from this route; the data shown is a real, mocked business view.',
      ),
      div({ class: example.panel }, [
        p({ class: example.panelTitle }, 'Active team'),
        ifNode(teamOverviewQuery.isLoading, () => p('Loading team overview…')),
        p({ class: example.row }, [
          strong('Team: '),
          teamOverviewQuery.teamName,
        ]),
        p({ class: example.row }, [
          strong('Signed-in user: '),
          teamOverviewQuery.viewerName,
        ]),
        p({ class: example.row }, [
          strong('Access level: '),
          teamOverviewQuery.viewerAccess,
        ]),
        p({ class: example.row }, [
          strong('Visible members: '),
          teamOverviewQuery.memberNames,
        ]),
      ]),
      p({ class: example.note, 'data-exampleNote': 'callout' }, [
        'The query loads ',
        span({ class: example.mono }, 'TeamOverview'),
        '. This data depends on two Effect services, but the services themselves remain internal dependencies of the business operation.',
      ]),
    ]),
);

export default EffectLayerScopeComponent;
