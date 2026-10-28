import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  p,
  span,
  textarea,
  ul,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { ResumeThread, type ResumeMessage } from './resume-thread.service';
import { SessionArchive } from './session-archive.service';
import { routeSessionId } from './replay-state';
import { eventValue } from './view-helpers';

const KIND_LABELS: Readonly<Record<ResumeMessage['kind'], string>> = {
  step: 'Étape',
  question: 'Question',
  handoff: 'À vous',
  done: 'Terminé',
  reply: 'Réponse',
};

const timeLabel = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function messageMeta(message: ResumeMessage): string {
  const who = message.from === 'ai' ? 'IA' : 'Vous';
  return `${who} · ${KIND_LABELS[message.kind]} · ${timeLabel.format(new Date(message.at))}`;
}

const RUN_STATUS: Readonly<Record<string, string>> = {
  running: 'en cours',
  'waiting-human': 'à vous',
  'waiting-ai': 'en attente de l’IA',
  completed: 'terminée',
  failed: 'en échec',
  cancelled: 'annulée',
};

/**
 * The guided resume, followed from the replay: what the AI says it does
 * (`resume.say`), and a field to answer it without leaving the dashboard.
 */
export const ReplayResumeThread = craftComponent(
  'ReplayResumeThread',
  {},
  function* () {
    const resume = yield* ResumeThread();
    const archive = yield* SessionArchive();
    const threadValue = rawReactiveValue(resume.thread.value);
    const draft = rawReactiveValue(resume.draft);
    const savedRecipes = rawReactiveValue(archive.resumeRecipeList);

    const resumeMessages = yield* craftComputed(
      'resumeMessages',
      () => threadValue()?.messages ?? [],
    );
    const noResumeRequest = yield* craftComputed(
      'noResumeRequest',
      () => threadValue()?.requestId === undefined,
    );
    const resumeEmptyText = yield* craftComputed('resumeEmptyText', () =>
      threadValue()?.requestId === undefined
        ? 'Aucune reprise demandée pour cette session. « Reprendre ici » en publie une pour l’IA.'
        : 'Reprise demandée : l’IA écrira ici ses étapes et ce qu’elle attend de vous.',
    );
    const resumeEmptyHidden = yield* craftComputed(
      'resumeEmptyHidden',
      () => (threadValue()?.messages.length ?? 0) > 0,
    );
    const resumeSendDisabled = yield* craftComputed(
      'resumeSendDisabled',
      () => threadValue()?.requestId === undefined || draft().trim() === '',
    );
    const recipes = yield* craftComputed('sessionResumeRecipes', () =>
      routeSessionId() ? savedRecipes() : [],
    );
    const recipesEmpty = yield* craftComputed('resumeRecipesEmpty', () => recipes().length === 0);

    const recipeHistory = div({ class: ui.scroll }, [
      heading({ class: ui.factLabel }, 'Recettes enregistrées'),
      p({ class: ui.lede, hidden: yield* craftComputed('noRecipesHidden', () => !recipesEmpty()) },
        'Aucune recette pour cette session.'),
      ul(
        { class: ui.events, 'data-lab': 'resume-recipes' },
        forNode(recipes, { track: (recipe) => recipe.id }, (recipe) =>
          li({ class: ui.event }, [
            div({ class: ui.eventInfo }, [
              span({ class: ui.eventName }, function* () { return (yield* recipe()).objective.goal; }),
              span({ class: ui.eventMeta }, function* () {
                const runs = (yield* recipe()).runs;
                const latest = runs[0];
                return `${(yield* recipe()).strategy === 'autonomous' ? 'Autonome' : 'Donnée existante'} · ${runs.length} exécution(s)${latest ? ` · dernière ${RUN_STATUS[latest.status] ?? latest.status}` : ''}`;
              }),
            ]),
          ]),
        ),
      ),
    ]);

    const list = div({ class: ui.scroll }, [
      p({ class: ui.lede, hidden: resumeEmptyHidden }, resumeEmptyText),
      ul(
        { class: ui.events, 'data-lab': 'resume-thread' },
        forNode(resumeMessages, { track: (message) => message.id }, (message) =>
          li(
            {
              class: ui.event,
              'data-from': function* () {
                return (yield* message()).from;
              },
            },
            [
              div({ class: ui.eventInfo }, [
                span({ class: ui.eventName }, function* () {
                  return (yield* message()).text;
                }),
                span({ class: ui.eventMeta }, function* () {
                  return messageMeta(yield* message());
                }),
              ]),
            ],
          ),
        ),
      ),
    ]);

    const answer = div({ class: ui.importFields, hidden: noResumeRequest }, [
      textarea('resumeReply', {
        class: ui.importText,
        rows: 3,
        placeholder: 'Répondre à l’IA…',
        value: resume.draft,
        input: (event: Event) => resume.draft.write(eventValue(event)),
        'aria-label': 'Réponse à l’IA',
      }),
      div({ class: ui.importActions }, [
        button(
          'sendResumeReply',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            'data-lab': 'send-resume-reply',
            disabled: resumeSendDisabled,
            click: () => resume.send(),
          },
          'Envoyer',
        ),
      ]),
    ]);

    return div({ class: ui.sideBody }, [list, answer, recipeHistory]);
  },
);
