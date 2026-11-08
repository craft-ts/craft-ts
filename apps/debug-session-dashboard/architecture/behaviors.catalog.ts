// Generated. Do not edit: the architecture suite rewrites it with `vitest -u`.
export const behaviorCatalog = {
  "version": 1,
  "behaviors": [
    {
      "id": "command:behaviorCoverageArchive.coverage#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/behavior-coverage.service.ts"
    },
    {
      "id": "command:e2eComparison.comparison#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/e2e-comparison.service.ts"
    },
    {
      "id": "command:e2eReplayRoute.sourceSession#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/features/e2e-replay/e2e-replay-route.service.ts"
    },
    {
      "id": "command:goldenSuiteArchive.suiteRun#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/golden-suite.service.ts"
    },
    {
      "id": "command:resumeThread.thread#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/resume-thread.service.ts"
    },
    {
      "id": "command:sessionArchive.archived#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "command:sessionArchive.recipeCatalog#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "command:sessionArchive.recipeDetail#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "command:sessionArchive.resumeCheckpoints#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "command:sessionArchive.sessions#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "command:thumbnailArchive.thumbnailManifest#success",
      "kind": "command",
      "file": "apps/debug-session-dashboard/src/shared/data-access/thumbnail-archive.service.ts"
    },
    {
      "id": "mutation:sessionArchive.deleteSession#success",
      "kind": "mutation",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "mutation:sessionArchive.deleteSessions#success",
      "kind": "mutation",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "mutation:sessionArchive.pruneSessions#success",
      "kind": "mutation",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "mutation:sessionArchive.resumeRequest#success",
      "kind": "mutation",
      "file": "apps/debug-session-dashboard/src/shared/data-access/session-archive.service.ts"
    },
    {
      "id": "mutation:thumbnailArchive.prepareThumbnails#success",
      "kind": "mutation",
      "file": "apps/debug-session-dashboard/src/shared/data-access/thumbnail-archive.service.ts"
    },
    {
      "id": "route:comparison:",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/comparison/comparison.routes.ts"
    },
    {
      "id": "route:coverage:",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/coverage/coverage.routes.ts"
    },
    {
      "id": "route:e2e-replay:",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/e2e-replay/e2e-replay.routes.ts"
    },
    {
      "id": "route:recipes:",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/recipes/recipes.routes.ts"
    },
    {
      "id": "route:recipes::recipeId",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/recipes/recipes.routes.ts"
    },
    {
      "id": "route:replay:",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/replay/replay.routes.ts"
    },
    {
      "id": "route:replay::sessionId",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/replay/replay.routes.ts"
    },
    {
      "id": "route:sessions:",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/sessions/sessions.routes.ts"
    },
    {
      "id": "route:suite:",
      "kind": "route",
      "file": "apps/debug-session-dashboard/src/features/suite/suite.routes.ts"
    }
  ]
} as const;
export type BehaviorCatalogType = typeof behaviorCatalog;
