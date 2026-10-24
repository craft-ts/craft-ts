import { button, craftComponent, div, p, section } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { DocTabs } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ReplayDetails } from './replay-details';
import { ReplayJournal } from './replay-journal';
import { plural } from './replay-model';
import { errorCount, sidePanelOpen } from './replay-state';
import { lit } from './view-helpers';

/** The panel at the side: the journal of errors, then the details. */
export const ReplaySidePanel = craftComponent(
  'ReplaySidePanel',
  {},
  function* () {
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

    const tabs = DocTabs({
      group: lit('side'),
      surface: lit<'page'>('page'),
      items: lit([
        { id: 'journal', label: 'Journal', render: () => ReplayJournal({}) },
        { id: 'details', label: 'Détails', render: () => ReplayDetails({}) },
      ]),
    });

    return section(
      {
        class: ui.side,
        'data-lab': 'side',
        'aria-label': 'Journal et détails',
        hidden: closed,
      },
      [head, div({ class: ui.sideTabs }, [tabs])],
    );
  },
);
