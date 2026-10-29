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

/**
 * A wrapper runs in the injector of each Craft factory it intercepts. A
 * dependency provided by an app config or with a root/global scope is
 * available throughout that app; narrower scopes need an explicit review.
 * This is intentionally a report-only rule by default because static graph
 * analysis cannot enumerate every runtime injector or indirect token lookup.
 */
export function fnWrapperDiFindings(
  graph: DependencyGraph,
): ArchitectureFinding[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rootProvided = new Set(
    graph.edges
      .filter((edge) => edge.kind === 'provides')
      .filter((edge) => nodesById.get(edge.from)?.kind === 'app-config')
      .map((edge) => edge.to),
  );
  const services = new Map(
    graph.nodes
      .filter((node) => node.kind === 'service')
      .map((node) => [node.id, node]),
  );
  const findings: ArchitectureFinding[] = [];

  for (const wrapper of graph.nodes) {
    if (wrapper.kind !== 'fn-wrapper') continue;
    const target = `fn-wrapper:${wrapper.label}`;
    if (wrapper.details?.['callbackResolved'] !== true) {
      findings.push({
        target,
        message:
          `Could not resolve the callback for ${wrapper.label} (${at(wrapper)}). ` +
          'Review its injected dependencies manually; only inline callbacks and local function declarations are analyzed.',
      });
      continue;
    }
    const unresolvedCalls = wrapper.details?.['unresolvedInjectionCalls'];
    if (Array.isArray(unresolvedCalls) && unresolvedCalls.length > 0) {
      findings.push({
        target,
        message:
          `${wrapper.label} uses injection helpers that the service graph cannot resolve ` +
          `(${unresolvedCalls.join(', ')}). Verify their tokens and scope manually (${at(wrapper)}).`,
      });
    }
    for (const edge of graph.edges) {
      if (edge.from !== wrapper.id || edge.kind !== 'depends-on') continue;
      const service = services.get(edge.to);
      if (!service) continue;
      const scope = service.details?.['scope'];
      if (
        scope === 'global' ||
        scope === 'root' ||
        rootProvided.has(service.id)
      ) {
        continue;
      }
      findings.push({
        target,
        message:
          `${wrapper.label} depends on ${service.label}` +
          `${typeof scope === 'string' ? ` (providedIn: '${scope}')` : ''}, ` +
          `which is neither global/root nor provided by a craftAppConfig. ` +
          `The wrapper runs in the injector of each wrapped factory, so verify ` +
          `that this dependency is available in every such context (${at(wrapper)}).`,
      });
    }
  }
  return findings;
}

function at(node: DependencyGraphNode): string {
  return [node.filePath, node.line].filter(Boolean).join(':') || node.label;
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
  ['fn-wrapper-di', fnWrapperDiFindings],
  ['prefer-path-param-navigation', routePathParamNavigationFindings],
] as const;
