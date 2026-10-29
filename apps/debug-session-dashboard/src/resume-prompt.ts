/** What to give the AI host for one exact guided-resume request. */
export function resumePrompt(
  input: Readonly<{
    sessionId: string;
    beforeSequence?: number;
    participantId?: string;
    requestId: string;
    appUrl: string;
    intent: string;
  }>,
): string {
  const point =
    input.beforeSequence === undefined
      ? 'à la fin de l’enregistrement'
      : `juste avant l’événement ${input.beforeSequence}`;
  const tab = input.appUrl
    ? `URL de l’onglet dédié : ${input.appUrl}.`
    : `Ouvre un onglet d’application dédié dont l’URL contient craft-resume-request=${input.requestId}.`;
  return [
    `Reprends la session de debug ${input.sessionId} ${point} pour la demande ${input.requestId}, en reprise guidée (skill craft-ts-guided-resume, invite MCP reprise-guidee).`,
    `Intention de la personne : ${JSON.stringify(input.intent)}. Utilise-la comme objectif de la reprise et pour préparer la recette si c’est pertinent. Ne redemande pas cette information ; pose une question complémentaire seulement si une ambiguïté ou un obstacle l’exige.`,
    `Lis cette demande exacte avec resume.request(requestId: "${input.requestId}") avant session.story, session.prerequisites et session.target.`,
    `${tab} Pilote l’onglet dont l’URL contient craft-resume-request=${input.requestId} ; laisse le dashboard de replay ouvert.`,
    'Ne duplique pas la question d’intention dans le dashboard. Utilise resume.doctor(requestId: "' +
      input.requestId +
      '") pour vérifier l’onglet cible.',
    input.participantId
      ? `Onglet enregistré à suivre : ${input.participantId}.`
      : '',
    'Les outils viennent des serveurs MCP de reprise (logs et registre) ; charge-les s’ils ne sont pas encore listés.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Best effort: the notice shows the sentence too, for when the copy fails. */
export function copyResumePrompt(text: string): void {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard) void clipboard.writeText(text).catch(() => undefined);
}
