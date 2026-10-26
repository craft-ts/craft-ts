/** The sentence to give the AI host for a resume point. */
export function resumePrompt(sessionId: string, beforeSequence?: number): string {
  return beforeSequence === undefined
    ? `Reprends la session de debug ${sessionId} à la fin de l’enregistrement (outil resume.request).`
    : `Reprends la session de debug ${sessionId} juste avant l’événement ${beforeSequence} (outil resume.request).`;
}

/** Best effort: the notice shows the sentence too, for when the copy fails. */
export function copyResumePrompt(text: string): void {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard) void clipboard.writeText(text).catch(() => undefined);
}
