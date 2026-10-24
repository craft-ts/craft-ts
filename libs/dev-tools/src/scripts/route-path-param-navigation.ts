import { relative } from 'node:path';
import { Node, SyntaxKind } from 'ts-morph';
import type {
  DependencyGraph,
  DependencyGraphCollector,
  DependencyGraphNode,
} from './dependency-graph.js';
import type {
  CallExpression,
  ObjectLiteralExpression,
  SourceFile,
} from 'ts-morph';

declare module './dependency-graph.js' {
  interface DependencyGraphNodeRegistry {
    'route-navigation': {
      targetPath: string;
      ownerServiceId?: string;
      scope: 'route' | 'outside' | 'ambiguous';
      currentParamNames: readonly string[];
      params: readonly { name: string; expression: string }[];
      navigationOptions: readonly string[];
    };
  }
}

/**
 * Adds static CraftRouter navigation sites to the dependency graph so
 * architecture rules can compare their target route with their DI owner.
 */
export const collectRouteNavigations: DependencyGraphCollector = {
  name: 'craft-router-navigations',
  collect({ sourceFiles, graph }) {
    const routeNodes = graph.nodes.filter((node) => node.kind === 'route');
    const nodes: DependencyGraphNode[] = [];

    for (const sourceFile of sourceFiles) {
      const routerNames = craftRouterImportNames(sourceFile);
      if (routerNames.size === 0) continue;
      const routerBindings = craftRouterBindings(sourceFile, routerNames);
      if (routerBindings.size === 0) continue;

      for (const call of sourceFile.getDescendantsOfKind(
        SyntaxKind.CallExpression,
      )) {
        const access = call.getExpression();
        if (
          !Node.isPropertyAccessExpression(access) ||
          access.getName() !== 'navigate' ||
          !Node.isIdentifier(access.getExpression()) ||
          !routerBindings.has(access.getExpression().getText())
        ) {
          continue;
        }

        const input = call.getArguments()[0];
        if (!input || !Node.isObjectLiteralExpression(input)) continue;
        const targetPath = staticStringProperty(input, 'to');
        const paramsInitializer = objectProperty(input, 'params')?.getInitializer();
        if (
          !targetPath ||
          !paramsInitializer ||
          !Node.isObjectLiteralExpression(paramsInitializer)
        ) {
          continue;
        }

        const params = parameterProperties(paramsInitializer);
        const routeParamNames = pathParamNames(targetPath);
        const currentParamNames = params
          .filter(
            ({ name, property }) =>
              routeParamNames.has(name) &&
              expressionReadsPathParam(property.getInitializer(), name),
          )
          .map(({ name }) => name);
        if (currentParamNames.length === 0) continue;

        const navigationOptions = input
          .getProperties()
          .map((property) => propertyName(property))
          .filter((name): name is string => name !== undefined);
        if (
          navigationOptions.some(
            (name) =>
              ![
                'to',
                'params',
                'replaceUrl',
                'skipLocationChange',
                'state',
                'viewTransition',
              ].includes(name),
          )
        ) {
          continue;
        }

        const owner = ownerServiceForCall(graph.nodes, sourceFile, call);
        const ownership = routeScopeForService(
          graph.nodes,
          graph.edges,
          owner,
          routeNodes,
          targetPath,
        );
        nodes.push({
          id: `route-navigation:${sourceFile.getFilePath()}:${call.getStart()}`,
          kind: 'route-navigation',
          label: `${targetPath} (${currentParamNames.join(', ')})`,
          filePath: sourceFile.getFilePath(),
          line: call.getStartLineNumber(),
          endLine: call.getEndLineNumber(),
          details: {
            targetPath,
            ownerServiceId: owner?.id,
            scope: ownership,
            currentParamNames,
            params: params.map(({ name, property }) => ({
              name,
              expression: property.getInitializer()?.getText() ?? '',
            })),
            navigationOptions,
          },
        });
      }
    }

    return { nodes };
  },
};

export function routePathParamNavigationFindings(
  graph: DependencyGraph,
): { target: string; message: string }[] {
  return graph.nodes.flatMap((node) => {
    if (
      node.kind !== 'route-navigation' ||
      node.details?.['scope'] !== 'route'
    ) {
      return [];
    }
    const targetPath = String(node.details['targetPath']);
    const params = node.details['params'];
    const currentParamNames = node.details['currentParamNames'];
    if (!Array.isArray(params) || !Array.isArray(currentParamNames)) return [];
    const paramNames = currentParamNames.filter(
      (name): name is string => typeof name === 'string',
    );
    if (paramNames.length === 0) return [];
    const owner = graph.nodes.find(
      (candidate) => candidate.id === node.details?.['ownerServiceId'],
    );
    const paramNamesText = paramNames.map((name) => `:${name}`).join(', ');
    const at = node.filePath
      ? `${relative(graph.rootDir, node.filePath)}:${node.line ?? 0}`
      : targetPath;
    return [
      {
        target: at,
        message:
          `CraftRouter.navigate at ${at} in route-provided service ${owner?.label ?? 'unknown'} ` +
          `targets its own route '${targetPath}' to update ${paramNamesText}. ` +
          `Declare pathParams for that route, put the update on the pathParam insertion, ` +
          `and call the generated route helper. Keep CraftRouter.navigate for ` +
          `app-level or ambiguous navigation contexts.`,
      },
    ];
  });
}

function expressionReadsPathParam(
  expression: Node | undefined,
  name: string,
  visited = new Set<Node>(),
): boolean {
  if (!expression || visited.has(expression)) return false;
  visited.add(expression);
  if (Node.isIdentifier(expression)) {
    if (expression.getText() === name) return true;
    for (const declaration of expression.getSymbol()?.getDeclarations() ?? []) {
      if (
        Node.isVariableDeclaration(declaration) &&
        expressionReadsPathParam(declaration.getInitializer(), name, visited)
      ) {
        return true;
      }
      if (
        Node.isBindingElement(declaration) &&
        declaration.getName() === name
      ) {
        return true;
      }
    }
  }
  return expression
    .getChildren()
    .some((child) => expressionReadsPathParam(child, name, visited));
}

function craftRouterImportNames(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== '@craft-ts/core') continue;
    for (const specifier of declaration.getNamedImports()) {
      if (specifier.getName() === 'CraftRouter') {
        names.add(specifier.getAliasNode()?.getText() ?? 'CraftRouter');
      }
    }
  }
  return names;
}

function craftRouterBindings(
  sourceFile: SourceFile,
  routerNames: ReadonlySet<string>,
): Set<string> {
  const bindings = new Set<string>();
  for (const declaration of sourceFile.getDescendantsOfKind(
    SyntaxKind.VariableDeclaration,
  )) {
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isIdentifier(declaration.getNameNode())) continue;
    const factoryCall = initializer
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => {
        const expression = call.getExpression();
        return (
          Node.isIdentifier(expression) && routerNames.has(expression.getText())
        );
      });
    if (factoryCall) bindings.add(declaration.getName());
  }
  return bindings;
}

function staticStringProperty(
  object: ObjectLiteralExpression,
  name: string,
): string | undefined {
  const initializer = objectProperty(object, name)?.getInitializer();
  return initializer && Node.isStringLiteral(initializer)
    ? initializer.getLiteralValue()
    : undefined;
}

function objectProperty(
  object: ObjectLiteralExpression,
  name: string,
): import('ts-morph').PropertyAssignment | undefined {
  return object.getProperties().find((property) => {
    return (
      Node.isPropertyAssignment(property) && propertyName(property) === name
    );
  }) as import('ts-morph').PropertyAssignment | undefined;
}

function propertyName(property: Node): string | undefined {
  if (!Node.isPropertyAssignment(property)) return undefined;
  const name = property.getNameNode();
  if (Node.isIdentifier(name) || Node.isStringLiteral(name)) {
    return name.getText().replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

function parameterProperties(
  object: ObjectLiteralExpression,
): { name: string; property: import('ts-morph').PropertyAssignment }[] {
  return object.getProperties().flatMap((property) => {
    if (!Node.isPropertyAssignment(property)) return [];
    const name = propertyName(property);
    return name === undefined ? [] : [{ name, property }];
  });
}

function pathParamNames(path: string): Set<string> {
  return new Set(
    path
      .split('/')
      .filter((segment) => segment.startsWith(':'))
      .map((segment) => segment.slice(1).replace(/\?$/, '')),
  );
}

function ownerServiceForCall(
  nodes: readonly DependencyGraphNode[],
  sourceFile: SourceFile,
  call: CallExpression,
): DependencyGraphNode | undefined {
  const ownerPrimitive = nodes
    .filter(
      (node) =>
        node.kind === 'primitive' &&
        node.filePath === sourceFile.getFilePath() &&
        node.details?.['primitive'] === 'craftMethod' &&
        typeof node.details?.['ownerId'] === 'string' &&
        sourceRangeContains(node, call.getStartLineNumber()),
    )
    .sort((left, right) => sourceRangeSize(left) - sourceRangeSize(right))[0];
  const serviceId = ownerPrimitive?.details?.['ownerId'];
  if (typeof serviceId === 'string') {
    return nodes.find((node) => node.id === serviceId);
  }
  return nodes
    .filter(
      (node) =>
        node.kind === 'service' &&
        node.filePath === sourceFile.getFilePath() &&
        sourceRangeContains(node, call.getStartLineNumber()) &&
        (node.details?.['scope'] === 'toProvide' ||
          node.details?.['scope'] === 'function'),
    )
    .sort((left, right) => sourceRangeSize(left) - sourceRangeSize(right))[0];
}

function sourceRangeContains(node: DependencyGraphNode, line: number): boolean {
  return (
    typeof node.line === 'number' &&
    node.line <= line &&
    (typeof node.endLine !== 'number' || line <= node.endLine)
  );
}

function sourceRangeSize(node: DependencyGraphNode): number {
  return typeof node.endLine === 'number' && typeof node.line === 'number'
    ? node.endLine - node.line
    : Number.MAX_SAFE_INTEGER;
}

function routeScopeForService(
  nodes: readonly DependencyGraphNode[],
  edges: readonly { from: string; to: string; kind: string }[],
  service: DependencyGraphNode | undefined,
  routes: readonly DependencyGraphNode[],
  targetPath: string,
): 'route' | 'outside' | 'ambiguous' {
  if (!service) return 'outside';
  if (service.details?.['scope'] !== 'toProvide') return 'outside';
  if (
    typeof service.details?.['unownedAccessCount'] === 'number' &&
    service.details['unownedAccessCount'] > 0
  ) {
    return 'ambiguous';
  }

  const providers = edges.filter(
    (edge) => edge.kind === 'provides' && edge.to === service.id,
  );
  const providedRouteIds = new Set<string>();
  for (const provider of providers) {
    const providerNode = nodes.find((node) => node.id === provider.from);
    if (providerNode?.kind === 'route') {
      providedRouteIds.add(providerNode.id);
      continue;
    }
    if (providerNode?.kind !== 'component') continue;
    if (
      edges.some(
        (edge) => edge.kind === 'renders' && edge.to === providerNode.id,
      )
    ) {
      return 'ambiguous';
    }
    for (const edge of edges) {
      if (
        edge.kind === 'loads' &&
        edge.to === providerNode.id &&
        routes.some((route) => route.id === edge.from)
      ) {
        providedRouteIds.add(edge.from);
      }
    }
  }

  if (providedRouteIds.size !== 1) {
    return providedRouteIds.size === 0 ? 'outside' : 'ambiguous';
  }
  const ownerRoute = routes.find((route) => route.id === [...providedRouteIds][0]);
  return ownerRoute?.details?.['path'] === targetPath ? 'route' : 'outside';
}
