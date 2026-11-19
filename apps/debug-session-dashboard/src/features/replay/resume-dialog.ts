import {
  button,
  content,
  craftComponent,
  div,
  label,
  li,
  ol,
  p,
  textarea,
} from '@craft-ts/component';
import { DocDialog } from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';
import {
  ReplayState,
  resumeIntent,
} from '../../shared/state/replay-state';
import { ui } from '../../shared/ui/dashboard.style';
import { i18n } from '../../shared/util/catalog';
import { eventValue, lit } from '../../shared/util/view-helpers';
import { ResumeRequest } from './resume-request.service';

/**
 * « Reprendre ici », asked properly: what the agent will do, what is already
 * there at this moment, and what the person wants from it — before a tab
 * opens and a prompt lands in the clipboard.
 */
export const ResumeDialog = craftComponent('ResumeDialog', {}, function* () {
  return DocDialog({
    heading: lit('Reprendre avec un agent IA'),
    dialogId: lit('resume-here'),
    open: function* () {
      return yield* (yield* ReplayState()).imperative.resumeDialogOpen();
    },
    dismiss: function* () {
      yield* (yield* ResumeRequest()).close();
    },
    body: content(() => [
      div({ class: ui.importFields }, [
        p({ class: ui.lede, 'data-lab': 'resume-moment' }, function* () {
          return yield* (yield* ResumeRequest()).momentText();
        }),
        ol({ class: ui.howToSteps }, [
          li('Un onglet de l’application s’ouvre, réservé à l’agent.'),
          li(
            'Le prompt est copié : collez-le dans la conversation de votre agent (Claude Code…).',
          ),
          li(
            'L’agent rouvre ce moment avec de vraies données et laisse un point de reprise. Sa progression s’affiche dans « Reprises ».',
          ),
        ]),
        p(
          {
            class: ui.dialogNote,
            'data-lab': 'resume-existing',
            hidden: function* () {
              return (yield* (yield* ResumeRequest()).existingText()) === '';
            },
          },
          function* () {
            return yield* (yield* ResumeRequest()).existingText();
          },
        ),
        label(
          { class: ui.fieldLabel, for: 'resume-intent' },
          i18n.t('copy.copy158'),
        ),
        textarea('resumeIntent', {
          id: 'resume-intent',
          'aria-label': i18n.t('copy.copy159'),
          class: ui.importText,
          rows: 4,
          placeholder: i18n.t('copy.copy160'),
          value: resumeIntent,
          *input(event: Event) {
            (yield* ReplayState()).imperative.setStates({
              resumeIntent: eventValue(event),
            });
          },
        }),
        p(
          {
            class: ui.importError,
            role: 'alert',
            hidden: function* () {
              return yield* (yield* ResumeRequest()).failedHidden();
            },
          },
          i18n.t('copy.copy161'),
        ),
        div({ class: ui.importActions }, [
          button(
            'cancelResume',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: function* () {
                yield* (yield* ResumeRequest()).close();
              },
            },
            i18n.t('copy.copy162'),
          ),
          button(
            'confirmResume',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'primary',
              'data-lab': 'confirm-resume',
              disabled: function* () {
                return yield* (yield* ResumeRequest()).submitDisabled();
              },
              click: function* () {
                yield* (yield* ResumeRequest()).submit();
              },
            },
            i18n.t('copy.copy163'),
          ),
        ]),
      ]),
    ]),
  });
});
