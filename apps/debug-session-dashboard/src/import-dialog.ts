import {
  button,
  content,
  craftComponent,
  div,
  input,
  p,
  textarea,
} from '@craft-ts/component';
import { ɵcomputed as computed } from '@craft-ts/core';
import { DocDialog } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import {
  closeImport,
  importPastedSession,
  importSelectedFile,
} from './replay-session';
import { importOpen, loadError, sessionText } from './replay-state';
import { eventValue, lit } from './view-helpers';

/** The sheet where a session is imported from a file or pasted as JSON. */
export const ImportDialog = craftComponent('ImportDialog', {}, () =>
  DocDialog({
    heading: lit('Importer une session'),
    dialogId: lit('import-session'),
    open: function* () {
      return importOpen();
    },
    dismiss: closeImport,
    body: content(() => [
      div({ class: ui.importFields }, [
        p(
          { class: ui.lede },
          'Un export JSON craft-debug-session. Les sessions tronquées restent consultables mais ne sont pas rejouables.',
        ),
        input('sessionFile', {
          type: 'file',
          accept: 'application/json,.json',
          'aria-label': 'Importer une session JSON',
          change: importSelectedFile,
        }),
        textarea('sessionJson', {
          class: ui.importText,
          rows: 8,
          placeholder: 'Ou colle un export craft-debug-session…',
          value: sessionText,
          input: (event: Event) => sessionText.set(eventValue(event)),
          'aria-label': 'Session JSON',
        }),
        p(
          {
            class: ui.importError,
            role: 'alert',
            hidden: computed(() => loadError() === undefined),
          },
          computed(() => loadError() ?? ''),
        ),
        div({ class: ui.importActions }, [
          button(
            'importSession',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'primary',
              click: importPastedSession,
            },
            'Valider la session',
          ),
        ]),
      ]),
    ]),
  }),
);
