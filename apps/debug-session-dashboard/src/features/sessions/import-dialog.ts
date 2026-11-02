import { i18n } from '../../shared/util/catalog';
import {
  button,
  content,
  craftComponent,
  div,
  input,
  p,
  textarea,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { DocDialog } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../shared/ui/dashboard.style';
import { ReplaySession } from '../../shared/state/replay-session';
import { importOpen, loadError, ReplayState } from '../../shared/state/replay-state';
import { eventValue, lit } from '../../shared/util/view-helpers';

/** The sheet where a session is imported from a file or pasted as JSON. */
export const ImportDialog = craftComponent('ImportDialog', {}, function* () {
  const replaySession = yield* ReplaySession();
  const { sessionText, setStates } = (yield* ReplayState()).imperative;
  const loadErrorHidden = yield* craftComputed(
    'loadErrorHidden',
    () => loadError() === undefined,
  );
  const loadErrorText = yield* craftComputed(
    'loadErrorText',
    () => loadError() ?? '',
  );
  return DocDialog({
    heading: lit('Importer une session'),
    dialogId: lit('import-session'),
    open: function* () {
      return importOpen();
    },
    dismiss: replaySession.closeImport,
    body: content(() => [
      div({ class: ui.importFields }, [
        p(
          { class: ui.lede },
          i18n.t("copy.copy022"),
        ),
        input('sessionFile', {
          type: 'file',
          accept: 'application/json,.json',
          'aria-label': i18n.t("copy.copy023"),
          change: replaySession.importSelectedFile,
        }),
        textarea('sessionJson', {
          class: ui.importText,
          rows: 8,
          placeholder: i18n.t("copy.copy024"),
          value: sessionText,
          input: (event: Event) =>
            setStates({ sessionText: eventValue(event) }),
          'aria-label': i18n.t("copy.copy025"),
        }),
        p(
          {
            class: ui.importError,
            role: 'alert',
            hidden: loadErrorHidden,
          },
          loadErrorText,
        ),
        div({ class: ui.importActions }, [
          button(
            'importSession',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'primary',
              click: replaySession.importPastedSession,
            },
            i18n.t("copy.copy026"),
          ),
        ]),
      ]),
    ]),
  });
});
