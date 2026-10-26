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
    `Reprends la session de debug ${sessionId} ${point}, en reprise guidée (invite MCP reprise-guidee, skill craft-ts-guided-resume).`,
    'Lis le point avec resume.request et session.*, ramène l’onglet de l’app au point avec app.launch puis app.diff, rends-moi la main avec app.handoff pour les identifiants, fige le point avec checkpoint.save, et écris tes étapes avec resume.say.',
    'Ces outils viennent des serveurs MCP de reprise (logs et registre) : charge-les s’ils ne sont pas encore listés.',
  ].join(' ');
}

/** Best effort: the notice shows the sentence too, for when the copy fails. */
export function copyResumePrompt(text: string): void {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard) void clipboard.writeText(text).catch(() => undefined);
}
