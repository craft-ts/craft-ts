import { craftComputed, craftService } from '@craft-ts/core';
import { ResumeThread } from '../../../shared/data-access/resume-thread.service';
import { SessionArchive } from '../../../shared/data-access/session-archive.service';
import { routeSessionId } from '../../../shared/state/replay-state';
import {
  derivedSessionsOf,
  recipeName,
} from '../../../shared/util/session-lineage';

/** Reactive data and derived presentation state for the replay resume panel. */
export const { ReplayResumesViewModel } = craftService(
  { name: 'replayResumesViewModel', providedIn: 'function' },
  function* () {
    const archive = yield* SessionArchive();
    const resume = yield* ResumeThread();
    const savedCheckpoints = archive.resumeCheckpoints.resumeCheckpointList;
    const savedRecipes = archive.recipeCatalog.resumeRecipeList;
    const savedSessions = archive.sessions.savedSessions;
    const thread = resume.thread.value;
    const resumeNotice = archive.resumeNotice;

    const checkpoints = yield* craftComputed('checkpoints', function* () {
      const values = yield* savedCheckpoints();
      return values.filter((checkpoint) => !checkpoint.expired);
    });
    const recipes = yield* craftComputed('recipes', function* () {
      const sessionId = routeSessionId();
      const values = yield* savedRecipes();
      return sessionId
        ? values.filter((recipe) => recipe.sessionId === sessionId)
        : [];
    });
    const derived = yield* craftComputed('derived', function* () {
      const sessionId = routeSessionId();
      const [sessions, recipes] = [
        yield* savedSessions(),
        yield* savedRecipes(),
      ];
      return sessionId
        ? derivedSessionsOf(sessionId, sessions, recipes).map((session) => {
            const resume = session.resume;
            const recipe =
              resume?.kind === 'recipe-run'
                ? recipes.find(
                    (candidate) => candidate.id === resume.recipeId,
                  )
                : undefined;
            return {
              session,
              resumeDescription:
                session.resume?.kind === 'guided-resume'
                  ? undefined
                  : recipe
                    ? recipeName(recipe)
                    : '?',
            };
          })
        : [];
    });
    const messages = yield* craftComputed('messages', function* () {
      return (yield* thread())?.messages ?? [];
    });
    const noticeHere = yield* craftComputed('noticeHere', function* () {
      const notice = yield* resumeNotice();
      return notice !== undefined && notice.sessionId === routeSessionId()
        ? notice
        : undefined;
    });
    yield* craftComputed('nothingYet', function* () {
      const [currentNotice, currentMessages, currentCheckpoints, currentRecipes, currentDerived] =
        [
          yield* noticeHere(),
          yield* messages(),
          yield* checkpoints(),
          yield* recipes(),
          yield* derived(),
        ];
      return (
        currentNotice === undefined &&
        currentMessages.length === 0 &&
        currentCheckpoints.length === 0 &&
        currentRecipes.length === 0 &&
        currentDerived.length === 0
      );
    });

  },
);
