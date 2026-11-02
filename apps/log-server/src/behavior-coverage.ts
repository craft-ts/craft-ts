/**
 * The coverage page of the dashboard: which behaviours of an app no test
 * proves, and which of those the debug sessions on this machine show.
 *
 * Each app's architecture suite writes `.craft/behavior-coverage.json` (the
 * catalog, the proofs, the waivers, the mutant verdicts, and how a session
 * shows each obligation). This module reads it and looks through the stored
 * sessions, normalised like the e2e references, for the steps that name each
 * obligation — so that a behaviour seen once by hand can become a test
 * written from that very session.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { SessionTraceStep } from '@craft-ts/session-trace';

export const BEHAVIOR_COVERAGE_FILE = '.craft/behavior-coverage.json';

/** Written by `behaviorCoverage` of `@craft-ts/dev-tools`, read structurally. */
export type BehaviorStepMatch =
  | Readonly<{ step: 'invocation'; outcome: 'succeeded'; target: string }>
  | Readonly<{ step: 'invocation'; outcome: 'failed'; exception: string }>
  | Readonly<{ step: 'route'; path: string }>
  | Readonly<{ step: 'server-fn'; id: string }>;

export type BehaviorCoverageEntry = Readonly<{
  id: string;
  kind: string;
  file?: string;
  status: 'proven' | 'waived' | 'unproven';
  provenBy: readonly string[];
  waiver?: string;
  mutant?: 'killed' | 'survived' | 'not-reached';
  match?: BehaviorStepMatch;
}>;

export type BehaviorObservation = Readonly<{
  sessionId: string;
  createdAt: string;
  /** The event the step starts at: the replay can open there. */
  eventId: string;
}>;

export type AppBehaviorCoverage = Readonly<{
  app: string;
  behaviors: readonly (BehaviorCoverageEntry & {
    /** The latest sessions that show it, newest first; unproven ones only. */
    observations: readonly BehaviorObservation[];
  })[];
}>;

/** A stored session, reduced to what the search reads. */
export type SessionSteps = Readonly<{
  id: string;
  createdAt: string;
  steps: readonly Pick<SessionTraceStep, 'key' | 'kind' | 'detail' | 'eventId'>[];
}>;

const MAX_OBSERVATIONS = 3;

export function readBehaviorCoverage(appDir: string): Readonly<{
  app: string;
  behaviors: readonly BehaviorCoverageEntry[];
}> | undefined {
  const path = join(resolve(appDir), BEHAVIOR_COVERAGE_FILE);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      version?: unknown;
      app?: unknown;
      behaviors?: unknown;
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.behaviors)) return undefined;
    return {
      app: typeof parsed.app === 'string' ? parsed.app : basename(resolve(appDir)),
      behaviors: parsed.behaviors as BehaviorCoverageEntry[],
    };
  } catch {
    return undefined;
  }
}

/**
 * `service:cart / method:add` → `cart.add`: the primitive is the last tag, its
 * owner the nearest service or component before it. The same reading as
 * `behaviorProofSteps` in `@craft-ts/dev-tools`, which wrote the matches.
 */
function invocationTarget(address: string): string | undefined {
  const tags = address.split(' / ');
  const host = tags[tags.length - 1];
  const name = host?.slice(host.indexOf(':') + 1);
  const owner = [...tags.slice(0, -1)]
    .reverse()
    .find((tag) => tag.startsWith('service:') || tag.startsWith('component:'));
  if (!name || !owner) return undefined;
  return `${owner.slice(owner.indexOf(':') + 1)}.${name}`;
}

export function stepShowsBehavior(
  match: BehaviorStepMatch,
  step: SessionSteps['steps'][number],
): boolean {
  if (match.step === 'invocation') {
    if (step.kind !== 'invocation' || !step.key.startsWith('invocation:')) return false;
    if (step.detail['outcome'] !== match.outcome) return false;
    return 'target' in match
      ? invocationTarget(step.key.slice('invocation:'.length)) === match.target
      : String(step.detail['exception']) === match.exception;
  }
  if (match.step === 'route')
    return (
      step.kind === 'route' &&
      step.key === `route-activation:${match.path}` &&
      step.detail['outcome'] === 'activated'
    );
  return (
    step.kind === 'http' &&
    step.key === `server-fn:${match.id}` &&
    step.detail['outcome'] === 'ok'
  );
}

/** The coverage of each app, with the sessions that show its unproven behaviours. */
export function behaviorCoverageWithObservations(
  apps: readonly NonNullable<ReturnType<typeof readBehaviorCoverage>>[],
  sessions: readonly SessionSteps[],
): AppBehaviorCoverage[] {
  const newestFirst = [...sessions].sort((left, right) =>
    left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0,
  );
  return apps.map((app) => ({
    app: app.app,
    behaviors: app.behaviors.map((behavior) => {
      const observations: BehaviorObservation[] = [];
      if (behavior.status !== 'proven' && behavior.match) {
        for (const session of newestFirst) {
          const step = session.steps.find((candidate) =>
            stepShowsBehavior(behavior.match as BehaviorStepMatch, candidate),
          );
          if (step)
            observations.push({ sessionId: session.id, createdAt: session.createdAt, eventId: step.eventId });
          if (observations.length === MAX_OBSERVATIONS) break;
        }
      }
      return { ...behavior, observations };
    }),
  }));
}
