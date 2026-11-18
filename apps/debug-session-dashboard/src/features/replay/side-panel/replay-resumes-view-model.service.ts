import { craftComputed, craftService } from '@craft-ts/core';
import { ResumeThread } from '../../../shared/data-access/resume-thread.service';
import { SessionArchive } from '../../../shared/data-access/session-archive.service';
import { routeSessionId } from '../../../shared/state/replay-state';
import {
  derivedSessionsOf,
  recipeName,
} from '../../../shared/util/session-lineage';
import { sessionDate } from '../../../shared/util/replay-labels';

/** Reactive data and derived presentation state for the replay resume panel. */
export const { ReplayResumesViewModel } = craftService(
  { name: 'replayResumesViewModel', providedIn: 'global' },
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
              createdAtLabel: sessionDate.format(new Date(session.createdAt)),
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
    const hasNoMessages = yield* craftComputed('hasNoMessages', function* () {
      return (yield* messages()).length === 0;
    });
    const checkpointCount = yield* craftComputed(
      'checkpointCount',
      function* () {
        return (yield* checkpoints()).length;
      },
    );
    const recipeCount = yield* craftComputed(
      'recipeCount',
      function* () {
        return (yield* recipes()).length;
      },
    );
    const derivedSessionCount = yield* craftComputed(
      'derivedSessionCount',
      function* () {
        return (yield* derived()).length;
      },
    );
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
          yield* hasNoMessages(),
          yield* checkpointCount(),
          yield* recipeCount(),
          yield* derivedSessionCount(),
        ];
      return (
        currentNotice === undefined &&
        currentMessages &&
        currentCheckpoints === 0 &&
        currentRecipes === 0 &&
        currentDerived === 0
      );
    });

  },
);
