import type { TestProject } from 'vitest/node';
// The review server is this app's boundary: the tests prove the app through
// the API it really answers, not through code they may reach into.
import { startReviewServer } from '../../src/lib/review/server';
import { reviewScenarios, type ReviewScenario } from './review-scenarios';

/**
 * One review server per scenario, each on its own cards: a test file talks
 * to its scenario's server only, so the decisions it records reach no other.
 */
export default async function setup(project: TestProject) {
  const running = await Promise.all(
    Object.entries(reviewScenarios).map(async ([name, options]) => {
      const server = await startReviewServer({ port: 0, ...options });
      return [name, server] as const;
    }),
  );
  project.provide(
    'reviewServers',
    Object.fromEntries(running.map(([name, server]) => [name, server.url])) as Record<
      ReviewScenario,
      string
    >,
  );
  return async () => {
    await Promise.all(running.map(([, server]) => server.close()));
  };
}
