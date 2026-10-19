import { button, craftComponent, div, p, section } from '@craft-ts/component';
import { ɵcomputed as computed } from '@craft-ts/core';
import { DocTabs } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ReplayDetails } from './replay-details';
import { ReplayJournal } from './replay-journal';
import { plural } from './replay-model';
import { errorCount, sidePanelOpen } from './replay-state';
import { lit } from './view-helpers';

/** The panel at the side: the journal of errors, then the details. */
export const ReplaySidePanel = craftComponent('ReplaySidePanel', {}, function* () {
  const head = div({ class: ui.sideHead }, [
    p(
      { class: ui.factLabel },
      computed(() =>
        errorCount() > 0
          ? plural(errorCount(), 'erreur enregistrée', 'erreurs enregistrées')
          : 'Rien à signaler',
      ),
    ),
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

  const closed = computed(() => !sidePanelOpen());

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
    [head, tabs],
  );
});
