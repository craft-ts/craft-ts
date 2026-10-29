import {
  button,
  craftComponent,
  div,
  p,
  section,
  type CraftNodeChild,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { DocTabs } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ReplayDetails } from './replay-details';
import { ReplayJournal } from './replay-journal';
import { ReplayRecipes } from './replay-recipes';
import { plural } from './replay-model';
import { ReplayResumeThread } from './replay-resume-thread';
import { errorCount, routeSessionId, sidePanelOpen } from './replay-state';
import { lit } from './view-helpers';
import { SessionArchive } from './session-archive.service';

/** The panel at the side: the journal of errors, the details, the resume thread. */
export const ReplaySidePanel = craftComponent(
  'ReplaySidePanel',
  {},
  function* () {
    const archive = yield* SessionArchive();
    const savedRecipes = rawReactiveValue(archive.resumeRecipeList);
    const errorSummary = yield* craftComputed('errorSummary', () =>
      errorCount() > 0
        ? plural(errorCount(), 'erreur enregistrée', 'erreurs enregistrées')
        : 'Rien à signaler',
    );
    const closed = yield* craftComputed('closed', () => !sidePanelOpen());

    const head = div({ class: ui.sideHead }, [
      p({ class: ui.factLabel }, errorSummary),
      button(
        'closeJournal',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          'aria-label': 'Fermer le journal',
          click: () => sidePanelOpen.set(false),
        },
        'Fermer',
      ),
    ]);

    const tabs = yield* craftComputed('replaySideTabs', () => {
      const items: {
        id: string;
        label: string;
        render: () => CraftNodeChild;
      }[] = [
        { id: 'journal', label: 'Journal', render: () => ReplayJournal({}) },
        { id: 'details', label: 'Détails', render: () => ReplayDetails({}) },
      ];
      if (
        savedRecipes().some(
          (recipe) => recipe.sessionId === routeSessionId(),
        )
      ) {
        items.push({
          id: 'recipes',
          label: 'Recettes',
          render: () => ReplayRecipes({}),
        });
      }
      items.push({
        id: 'resume',
        label: 'Reprise',
        render: () => ReplayResumeThread({}),
      });
      return items;
    });

    const tabView = DocTabs({
      group: lit('side'),
      surface: lit<'page'>('page'),
      items: tabs,
    });

    return section(
      {
        class: ui.side,
        'data-lab': 'side',
        'aria-label': 'Journal et détails',
        hidden: closed,
      },
      [head, div({ class: ui.sideTabs }, [tabView])],
    );
  },
);
