import {
  craftComponent,
  div,
  forNode,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import { craftComputed, rawReactiveValue } from '@craft-ts/core';
import { ui } from './dashboard.style';
import { ResumeThread, type ResumeMessage } from './resume-thread.service';

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

/**
 * Progress from the agent's guided resume, shown beside the replay. The
 * person answers questions in the agent conversation where the prompt was pasted.
 */
export const ReplayResumeThread = craftComponent(
  'ReplayResumeThread',
  {},
  function* () {
    const resume = yield* ResumeThread();
    const threadValue = rawReactiveValue(resume.thread.value);

    const resumeMessages = yield* craftComputed(
      'resumeMessages',
      () => threadValue()?.messages ?? [],
    );
    const resumeEmptyText = yield* craftComputed('resumeEmptyText', () =>
      threadValue()?.requestId === undefined
        ? 'Aucune reprise demandée pour cette session. « Reprendre ici » en publie une pour l’IA.'
        : 'L’agent y publie les étapes et le résultat. Réponds à ses questions dans la conversation où tu as collé le prompt.',
    );
    const resumeEmptyHidden = yield* craftComputed(
      'resumeEmptyHidden',
      () => (threadValue()?.messages.length ?? 0) > 0,
    );
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

    return div({ class: ui.sideBody }, list);
  },
);
