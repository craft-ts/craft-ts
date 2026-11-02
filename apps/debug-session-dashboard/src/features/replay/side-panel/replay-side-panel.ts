import { i18n } from '../../../shared/util/catalog';
import {
  button,
  craftComponent,
  div,
  heading,
  nav,
  section,
  span,
  type CraftNodeChild,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { DocIcon, type IconName } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../../shared/ui/dashboard.style';
import { ReplayDetails } from './replay-details';
import { ReplayJournal } from './replay-journal';
import { ReplayResumes } from './replay-resumes';
import { ReplayReview } from './replay-review';
import {
  errorCount,
  isReplayErrorNote,
  pendingWarnings,
  replayDifferences,
  replayWarnings,
  ReplayState,
  routeSessionId,
  sidePanelOpen,
  sideTab,
  toggleSideTab,
  type SideTab,
} from '../../../shared/state/replay-state';
import {
  SessionArchive,
  type ResumeCheckpointSummary,
  type ResumeRecipeSummary,
  type SessionSummary,
} from '../../../shared/data-access/session-archive.service';
import { derivedSessionsOf } from '../../../shared/util/session-lineage';
import { lit } from '../../../shared/util/view-helpers';

const TAB_TITLES: Readonly<Record<SideTab, string>> = {
  journal: 'Journal de l’enregistrement',
  review: 'Écarts avec l’enregistrement',
  resumes: 'Reprises de cette session',
  details: 'Détails et réglages du replay',
};

/** What the « Reprises » view lists for a session: points, recipes, derived sessions. */
function resumeItemCount(
  sessionId: string | undefined,
  checkpoints: readonly ResumeCheckpointSummary[],
  recipes: readonly ResumeRecipeSummary[],
  sessions: readonly SessionSummary[],
): number {
  if (!sessionId) return 0;
  return (
    checkpoints.filter((checkpoint) => !checkpoint.expired).length +
    recipes.filter((recipe) => recipe.sessionId === sessionId).length +
    derivedSessionsOf(sessionId, sessions, recipes).length
  );
}

/** The view of the panel that one tab shows; the others stay built, hidden. */
function tabPanel(tab: SideTab, body: CraftNodeChild) {
  return div(
    {
      class: ui.sidePanelBody,
      role: 'region',
      'aria-label': TAB_TITLES[tab],
      'data-side-tab': tab,
      hidden: function* () {
        return sideTab() !== tab;
      },
    },
    body,
  );
}

/** The panel at the side of the stage: one of the four views of the rail. */
export const ReplaySidePanel = craftComponent(
  'ReplaySidePanel',
  {},
  function* () {
    const { setStates, sidePanelOpen: panelOpen } =
      (yield* ReplayState()).imperative;
    const closed = yield* craftComputed('closed', function* () {
      return !(yield* panelOpen());
    });
    const title = yield* craftComputed('title', () => TAB_TITLES[sideTab()]);

    const head = div({ class: ui.sideHead }, [
      heading({ class: ui.sideTitle }, title),
      button(
        'closeSidePanel',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          'aria-label': i18n.t("copy.copy127"),
          click: () => setStates({ sidePanelOpen: false }),
        },
        i18n.t("copy.copy128"),
      ),
    ]);

    return section(
      {
        class: ui.side,
        id: 'replay-side-panel',
        'data-lab': 'side',
        'aria-label': 'Panneau du replay',
        hidden: closed,
      },
      [
        head,
        tabPanel('journal', ReplayJournal({})),
        tabPanel('review', ReplayReview({})),
        tabPanel('resumes', ReplayResumes({})),
        tabPanel('details', ReplayDetails({})),
      ],
    );
  },
);

/**
 * The rail at the edge of the stage: the four views of the panel, each with
 * what it holds. A view with something to look at says so with a tone; a
 * press opens it, the same press closes it.
 */
export const ReplayRail = craftComponent('ReplayRail', {}, function* () {
  const archive = yield* SessionArchive();
  const savedSessions = rawReactiveValue(archive.savedSessions);
  const savedRecipes = rawReactiveValue(archive.resumeRecipeList);
  const checkpoints = rawReactiveValue(archive.resumeCheckpointList);

  const reviewCount = yield* craftComputed(
    'reviewCount',
    () => replayDifferences().length + replayWarnings().length,
  );
  const reviewAlert = yield* craftComputed(
    'reviewAlert',
    () =>
      replayDifferences().length > 0 ||
      pendingWarnings().length > 0 ||
      replayWarnings().some(isReplayErrorNote),
  );
  const resumeCount = yield* craftComputed('resumeCount', () =>
    resumeItemCount(
      routeSessionId(),
      checkpoints(),
      savedRecipes(),
      savedSessions(),
    ),
  );

  const railButton = (
    tab: SideTab,
    label: string,
    icon: IconName,
    count: () => Generator<unknown, number, unknown>,
    alert: () => Generator<unknown, boolean, unknown>,
    tip: string,
  ) =>
    button(
      'openSideTab',
      {
        type: 'button',
        class: ui.railButton,
        'data-lab': `rail-${tab}`,
        'aria-label': label,
        'aria-expanded': function* () {
          return sidePanelOpen() && sideTab() === tab ? 'true' : 'false';
        },
        'aria-controls': 'replay-side-panel',
        'data-rail-active': function* () {
          return sidePanelOpen() && sideTab() === tab ? 'true' : undefined;
        },
        'data-rail-alert': function* () {
          return (yield* alert()) ? 'true' : undefined;
        },
        'data-tooltip': tip,
        click: () => toggleSideTab(tab),
      },
      [
        DocIcon({ name: lit(icon), size: lit('sm') }),
        span({ class: ui.railLabel, 'aria-hidden': 'true' }, label),
        span(
          {
            class: ui.railCount,
            'aria-hidden': 'true',
            'data-rail-alert': function* () {
              return (yield* alert()) ? 'true' : undefined;
            },
            hidden: function* () {
              return (yield* count()) === 0;
            },
          },
          function* () {
            return String(yield* count());
          },
        ),
      ],
    );

  return nav({ class: ui.rail, 'aria-label': 'Vues du replay' }, [
    railButton(
      'journal',
      'Journal',
      'menu',
      function* () {
        return errorCount();
      },
      function* () {
        return errorCount() > 0;
      },
      'Les erreurs de l’enregistrement (requêtes, navigations…), ou tous ses événements.',
    ),
    railButton(
      'review',
      'Écarts',
      'warning',
      reviewCount,
      reviewAlert,
      'Là où le replay s’est écarté de l’enregistrement, et ses notes.',
    ),
    railButton(
      'resumes',
      'Reprises',
      'branch',
      resumeCount,
      function* () {
        return false;
      },
      'Les points de reprise, recettes et sessions nés de cette session.',
    ),
    railButton(
      'details',
      'Détails',
      'info',
      function* () {
        return 0;
      },
      function* () {
        return false;
      },
      'L’enregistrement, la fenêtre, l’URL rejouée et l’export.',
    ),
  ]);
});
