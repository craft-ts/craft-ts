import type { HttpServer } from './http-server';

export type CraftWorkerFetch<Env = unknown, ExecutionContext = unknown> = (
  request: Request,
  env: Env,
  context: ExecutionContext,
) => Response | Promise<Response>;

/**
 * Adapts the portable Craft Web application to a Worker `fetch` export.
 * Platform bindings stay in the application layers; this adapter only keeps
 * the Worker entry point free of runtime-specific routing and business logic.
 */
export function createCraftWorkerFetch<
  Env = unknown,
  ExecutionContext = unknown,
>(
  application: Pick<HttpServer, 'handle'>,
): CraftWorkerFetch<Env, ExecutionContext> {
  return (request) => application.handle(request);
}
