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
import { DocDialog } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../shared/ui/dashboard.style';
import { ReplaySession } from '../../shared/state/replay-session';
import { ReplayState } from '../../shared/state/replay-state';
import { eventValue, lit } from '../../shared/util/view-helpers';

/** The sheet where a session is imported from a file or pasted as JSON. */
export const ImportDialog = craftComponent('ImportDialog', {}, () =>
  DocDialog({
    heading: lit('Importer une session'),
    dialogId: lit('import-session'),
    open: function* () {
      return yield* (yield* ReplayState()).imperative.importOpen();
    },
    dismiss: function* () {
      return (yield* ReplaySession()).closeImport;
    },
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
          change: function* (event: Event) {
            (yield* ReplaySession()).importSelectedFile(event);
          },
        }),
        textarea('sessionJson', {
          class: ui.importText,
          rows: 8,
          placeholder: i18n.t("copy.copy024"),
          value: function* () {
            return yield* (yield* ReplayState()).sessionText();
          },
          input: function* (event: Event) {
            (yield* ReplayState()).imperative.setStates({
              sessionText: eventValue(event),
            });
          },
          'aria-label': i18n.t("copy.copy025"),
        }),
        p(
          {
            class: ui.importError,
            role: 'alert',
            hidden: function* () {
              return (
                yield* (yield* ReplayState()).imperative.loadError()
              ) === undefined;
            },
          },
          function* () {
            return (yield* (yield* ReplayState()).imperative.loadError()) ?? '';
          },
        ),
        div({ class: ui.importActions }, [
          button(
            'importSession',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'primary',
              click: function* () {
                (yield* ReplaySession()).importPastedSession();
              },
            },
            i18n.t("copy.copy026"),
          ),
        ]),
      ]),
    ]),
  }),
);
