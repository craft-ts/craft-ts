import { sessionDate } from './replay-labels';
import type {
  ResumeRecipeSummary,
  SessionSummary,
} from '../data-access/session-archive.service';

/**
 * How the archive's records hang together. A person records a session; asking
 * the AI to resume it leaves points and recipes on it, and every guided resume
 * or recipe run is recorded as a session of its own. These helpers name those
 * links so the pages can show them both ways: from a recording to what came
 * out of it, and from a derived session back to its source.
 */

/** The query parameters the resume tooling adds to an address: noise to a reader. */
const TOOLING_PARAM = /^craft-/;

/** An address as a person reads it: the host, then the page without the tooling. */
export function readableUrl(url: string): Readonly<{
  host: string;
  path: string;
}> {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (TOOLING_PARAM.test(key)) parsed.searchParams.delete(key);
    }
    const search = parsed.searchParams.toString();
    return {
      host: parsed.host,
      path: `${parsed.pathname}${search ? `?${search}` : ''}${parsed.hash}`,
    };
  } catch {
    return { host: '', path: url };
  }
}

/** `localhost:4204/admin`, without the resume tooling. */
export function shortUrl(url: string): string {
  const readable = readableUrl(url);
  return readable.host ? `${readable.host}${readable.path}` : readable.path;
}

/** The recording a derived session came from, when the archive can tell. */
export function sourceSessionIdOf(
  session: SessionSummary,
  recipes: readonly ResumeRecipeSummary[],
): string | undefined {
  const resume = session.resume;
  if (!resume) return undefined;
  if (resume.sourceSessionId) return resume.sourceSessionId;
  if (resume.kind === 'recipe-run') {
    return recipes.find((recipe) => recipe.id === resume.recipeId)?.sessionId;
  }
  return undefined;
}

/** A session recorded by a guided resume or a recipe run, not by a person. */
export function isDerivedSession(session: SessionSummary): boolean {
  return session.resume !== undefined;
}

/**
 * Where a session picks up from: the same browser's previous one, which ended
 * after a pause. Empty when it began on its own.
 */
export function continuationLabel(
  session: SessionSummary,
  sessions: readonly SessionSummary[],
): string {
  if (!session.continuesFrom) return '';
  const previous = sessions.find((item) => item.id === session.continuesFrom);
  return previous
    ? `Suite de la session du ${sessionDate.format(new Date(previous.createdAt))}`
    : 'Suite d’une session supprimée';
}

/** The sessions recorded while resuming this one, newest first. */
export function derivedSessionsOf(
  sessionId: string,
  sessions: readonly SessionSummary[],
  recipes: readonly ResumeRecipeSummary[],
): readonly SessionSummary[] {
  return sessions.filter(
    (session) => sourceSessionIdOf(session, recipes) === sessionId,
  );
}

export function recipeName(
  recipe: Readonly<{ name?: string; objective: Readonly<{ goal: string }> }>,
): string {
  return recipe.name?.trim() || recipe.objective.goal;
}

/** One line: how a derived session came to be. Empty for a recording. */
export function derivationLabel(
  session: SessionSummary,
  sessions: readonly SessionSummary[],
  recipes: readonly ResumeRecipeSummary[],
): string {
  const resume = session.resume;
  if (!resume) return '';
  const sourceId = sourceSessionIdOf(session, recipes);
  const source = sessions.find((item) => item.id === sourceId);
  const from = source
    ? ` de la session du ${sessionDate.format(new Date(source.createdAt))}`
    : sourceId
      ? ` d’une session supprimée`
      : '';
  const moment =
    resume.beforeSequence === undefined
      ? ''
      : `, avant l’événement ${resume.beforeSequence}`;
  if (resume.kind === 'guided-resume') {
    return `Reprise guidée${from}${moment}`;
  }
  const recipe = recipes.find((item) => item.id === resume.recipeId);
  return `Exécution de la recette « ${recipe ? recipeName(recipe) : resume.recipeId.slice(0, 8)} »${from}${moment}`;
}

export const RECIPE_VALIDATION_LABEL: Readonly<
  Record<ResumeRecipeSummary['validation']['status'], string>
> = {
  verified: 'Vérifiée',
  'validation-failed': 'Prévalidation échouée',
  draft: 'Brouillon',
};

/** The badge tone of a recipe's state: green once verified, red once it failed. */
export function recipeValidationTone(
  status: ResumeRecipeSummary['validation']['status'],
): 'tip' | 'danger' | 'info' {
  return status === 'verified'
    ? 'tip'
    : status === 'validation-failed'
      ? 'danger'
      : 'info';
}

export const RECIPE_RUN_STATUS: Readonly<Record<string, string>> = {
  running: 'en cours',
  'waiting-human': 'attend une action',
  'waiting-ai': 'attend l’IA',
  completed: 'réussie',
  failed: 'en échec',
  cancelled: 'annulée',
};
