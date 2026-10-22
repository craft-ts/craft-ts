/**
 * The architecture rules about craft services.
 *
 * A service may be provided and carry state, but if nothing ever reads one of
 * its members or fires one of its actions it does nothing a reader can see.
 * ESLint sees one file and cannot tell; the graph carries, per service, how
 * many places read it (`accessCount`, counted from references — see
 * `collectServiceAccess`).
 */
import { dirname, relative } from 'node:path';
import type {
  DependencyGraph,
  DependencyGraphNode,
} from './dependency-graph.ts';
import type { ArchitectureFinding } from './architecture-style-rules.ts';
import { routePathParamNavigationFindings } from './route-path-param-navigation.ts';

export { routePathParamNavigationFindings };

/**
 * A service nothing reads.
 *
 * Judged on the application's own services only: a service declared outside
 * the project directory is a library's, and its readers are in other
 * applications. A service with `appStart` is read by the app starting, not by
 * a reference, and is never reported.
 */
export function unusedServiceFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  const projectDir = dirname(graph.tsConfigFilePath);
  return graph.nodes.flatMap((node) => {
    if (node.kind !== 'service' || !isUnused(node, projectDir)) return [];
    const where = node.filePath
      ? `${relative(graph.rootDir, node.filePath)}${node.line ? `:${node.line}` : ''}`
      : node.label;
    const provided = node.details?.['provideCount'];
    return [
      {
        target: `service:${node.label}`,
        message:
          `Service ${node.label} (${where}) is ` +
          `${typeof provided === 'number' && provided > 0 ? 'provided but' : 'declared and'} ` +
          `never used: nothing reads its members or triggers its actions. ` +
          `Use it, remove it, or waive it with { rule: 'no-unused-service', target: 'service:${node.label}', reason }.`,
      },
    ];
  });
}

function isUnused(node: DependencyGraphNode, projectDir: string): boolean {
  const details = node.details;
  if (!details || typeof details['accessCount'] !== 'number') return false;
  if (details['accessCount'] > 0 || details['appStart'] === true) return false;
  // Nothing to read it by: the binding the service is reached through is not
  // named, so a reference count says nothing.
  const helpers = details['helpers'];
  if (!Array.isArray(helpers) || helpers.length === 0) return false;
  return (
    node.filePath === undefined ||
    !relative(projectDir, node.filePath).startsWith('..')
  );
}

export const SERVICE_ARCHITECTURE_RULES = [
  ['no-unused-service', unusedServiceFindings],
  ['prefer-path-param-navigation', routePathParamNavigationFindings],
] as const;
