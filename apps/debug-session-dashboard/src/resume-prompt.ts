/**
 * What to give the AI host for a resume point. It names the method and its
 * tools: an AI that only read the point would stop at looking at the app.
 */
export function resumePrompt(sessionId: string, beforeSequence?: number): string {
  const point =
    beforeSequence === undefined
      ? 'à la fin de l’enregistrement'
      : `juste avant l’événement ${beforeSequence}`;
  return [
    `Reprends la session de debug ${sessionId} ${point}, en reprise guidée (skill craft-ts-guided-resume, invite MCP reprise-guidee).`,
    'Commence par lire le point (resume.request, session.*) puis demande-moi ce que je veux y observer avant d’agir ; vérifie la mise en place avec resume.doctor.',
    'Ces outils viennent des serveurs MCP de reprise (logs et registre) : charge-les s’ils ne sont pas encore listés.',
  ].join(' ');
}

/** Best effort: the notice shows the sentence too, for when the copy fails. */
export function copyResumePrompt(text: string): void {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard) void clipboard.writeText(text).catch(() => undefined);
}
