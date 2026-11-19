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
import { DocIcon, type IconName } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import {
  errorCount,
  ReplayState,
  sidePanelOpen,
  sideTab,
  toggleSideTab,
  type SideTab,
} from '../../../shared/state/replay-state';
import { ui } from '../../../shared/ui/dashboard.style';
import { i18n } from '../../../shared/util/catalog';
import { lit } from '../../../shared/util/view-helpers';
import { ReplayDetails } from './replay-details';
import { ReplayJournal } from './replay-journal';
import { ReplayResumes } from './replay-resumes';
import { ReplayReview } from './replay-review';
import { ReplaySidePanelViewModel } from './replay-side-panel-view-model.service';

const TAB_TITLES: Readonly<Record<SideTab, string>> = {
  journal: i18n.t('tabJournalTitle'),
  review: i18n.t('tabReviewTitle'),
  resumes: i18n.t('tabResumesTitle'),
  details: i18n.t('tabDetailsTitle'),
};

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
    const head = div({ class: ui.sideHead }, [
      heading({ class: ui.sideTitle }, function* () {
        return yield* (yield* ReplaySidePanelViewModel()).panelTitle();
      }),
      button(
        'closeSidePanel',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          'aria-label': i18n.t('copy.copy127'),
          click: function* () {
            (yield* ReplayState()).imperative.setStates({ sidePanelOpen: false });
          },
        },
        i18n.t('copy.copy128'),
      ),
    ]);

    return section(
      {
        class: ui.side,
        id: 'replay-side-panel',
        'data-lab': 'side',
        'aria-label': 'Panneau du replay',
        hidden: function* () {
          return yield* (yield* ReplaySidePanelViewModel()).panelClosed();
        },
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
      function* () {
        return yield* (yield* ReplaySidePanelViewModel()).reviewCount();
      },
      function* () {
        return yield* (yield* ReplaySidePanelViewModel()).reviewAlert();
      },
      'Là où le replay s’est écarté de l’enregistrement, et ses notes.',
    ),
    railButton(
      'resumes',
      'Reprises',
      'branch',
      function* () {
        return yield* (yield* ReplaySidePanelViewModel()).resumeCount();
      },
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
