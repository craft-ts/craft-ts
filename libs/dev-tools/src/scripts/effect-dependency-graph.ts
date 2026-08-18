import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph';

// ---------------------------------------------------------------------------
// Task 3.3 — fine edges for Effect services.
//
// The graph already draws `Consumer -> Service.member` for craft services, via
// the injectX.property() shortcuts. This does the same for Effect ones, so that
// selecting `({ byId }) => ({ byId })` shows up as `UserStore -> UserApi.byId`
// rather than the useless `UserStore -> UserApi`.
//
// What the edge does NOT mean. A `Layer` builds the whole service regardless;
// nothing here reduces what Effect constructs at runtime. The edge records what
// a consumer actually *reaches for*, which is what makes the graph worth
// reading — and it is the only reason task 3.1's selection exists at all.
// ---------------------------------------------------------------------------

export type EffectServiceInfo = {
  /** The class name, which is also the Context tag's identity. */
  readonly name: string;
  /** The string key given to Context.Service()(...). */
  readonly key: string;
  readonly filePath: string;
  readonly line: number;
};

export type EffectGraphContribution = {
  readonly nodes: readonly DependencyGraphNode[];
  readonly edges: readonly DependencyGraphEdge[];
};

const serviceId = (name: string) => `service:effect:${name}`;
const memberId = (name: string, member: string) =>
  `property:${serviceId(name)}:${member}`;

/**
 * `class UserApi extends Context.Service<UserApi, Shape>()('UserApi') {}`
 *
 * Matched on the *shape* of the heritage clause rather than on an import,
 * because the tag is routinely re-exported through a barrel.
 */
export function collectEffectServices(
  sourceFiles: readonly SourceFile[],
): Map<string, EffectServiceInfo> {
  const services = new Map<string, EffectServiceInfo>();

  for (const sourceFile of sourceFiles) {
    for (const declaration of sourceFile.getClasses()) {
      const heritage = declaration.getExtends();
      if (!heritage) continue;

      const expression = heritage.getExpression();
      if (!Node.isCallExpression(expression)) continue;

      // The outer call is `Context.Service<...>()('Name')`; its callee is the
      // inner `Context.Service<...>()` call.
      const inner = expression.getExpression();
      if (!Node.isCallExpression(inner)) continue;
      if (!/\bContext\.Service\b/.test(inner.getExpression().getText())) continue;

      const name = declaration.getName();
      if (!name) continue;

      const keyArgument = expression.getArguments()[0];
      const key =
        keyArgument && Node.isStringLiteral(keyArgument)
          ? keyArgument.getLiteralValue()
          : name;

      services.set(name, {
        name,
        key,
        filePath: sourceFile.getFilePath(),
        line: declaration.getStartLineNumber(),
      });
    }
  }

  return services;
}

/** The member names a selector picks: `({ byId }) => ({ byId })` -> ['byId']. */
export function selectedMemberNames(selector: Node): readonly string[] {
  if (!Node.isArrowFunction(selector) && !Node.isFunctionExpression(selector)) {
    return [];
  }

  const names = new Set<string>();

  // Preferred reading: the keys of the returned object literal, which is what
  // the consumer will actually destructure.
  const body = Node.isArrowFunction(selector) ? selector.getBody() : undefined;
  const returned =
    body && Node.isParenthesizedExpression(body)
      ? body.getExpression()
      : body && Node.isObjectLiteralExpression(body)
        ? body
        : undefined;

  if (returned && Node.isObjectLiteralExpression(returned)) {
    for (const property of returned.getProperties()) {
      if (
        Node.isPropertyAssignment(property) ||
        Node.isShorthandPropertyAssignment(property)
      ) {
        const nameNode = property.getNameNode();
        if (Node.isIdentifier(nameNode)) names.add(nameNode.getText());
      }
    }
  }

  // Fallback: the destructured parameter, for selectors that rename on the way
  // out (`({ byId }) => ({ fetchUser: byId })`).
  if (names.size === 0) {
    const parameter = selector.getParameters()[0];
    const binding = parameter?.getNameNode();
    if (binding && Node.isObjectBindingPattern(binding)) {
      for (const element of binding.getElements()) {
        const propertyName = element.getPropertyNameNode() ?? element.getNameNode();
        if (Node.isIdentifier(propertyName)) names.add(propertyName.getText());
      }
    }
  }

  return [...names];
}

/**
 * Walks `effectService(Tag, selector?)` calls and produces the nodes and edges
 * they justify. `ownerIdOf` maps a call site to the consumer node that should
 * own the edge; a call outside any known consumer is skipped rather than
 * attached to something arbitrary.
 */
export function collectEffectServiceUsage(
  sourceFiles: readonly SourceFile[],
  services: Map<string, EffectServiceInfo>,
  ownerIdOf: (node: Node) => string | undefined,
): EffectGraphContribution {
  const nodes = new Map<string, DependencyGraphNode>();
  const edges = new Map<string, DependencyGraphEdge>();

  const addNode = (node: DependencyGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (edge: DependencyGraphEdge) => {
    const key = `${edge.from}:${edge.kind}:${edge.to}`;
    if (!edges.has(key)) edges.set(key, edge);
  };

  for (const [, service] of services) {
    addNode({
      id: serviceId(service.name),
      kind: 'service',
      label: service.name,
      filePath: service.filePath,
      line: service.line,
      details: { runtime: 'effect', tag: service.key },
    });
  }

  for (const sourceFile of sourceFiles) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      const callee = call.getExpression().getText();
      if (callee !== 'effectService' && !callee.endsWith('.effectService')) {
        continue;
      }

      const [tagArgument, selectorArgument] = call.getArguments();
      if (!tagArgument) continue;

      const service = services.get(tagArgument.getText());
      if (!service) continue;

      const ownerId = ownerIdOf(call);
      if (!ownerId) continue;

      const members = selectorArgument
        ? selectedMemberNames(selectorArgument)
        : [];

      if (members.length === 0) {
        // Whole-service dependency: coarse edge, which is the honest drawing
        // when the consumer took the whole thing.
        addEdge({
          from: ownerId,
          to: serviceId(service.name),
          kind: 'depends-on',
          evidence: 'ast',
          details: { runtime: 'effect', selection: 'whole-service' },
        });
        continue;
      }

      for (const member of members) {
        addNode({
          id: memberId(service.name, member),
          kind: 'property',
          label: `${service.name}.${member}`,
          filePath: service.filePath,
          line: call.getStartLineNumber(),
          details: { runtime: 'effect', member },
        });
        addEdge({
          from: serviceId(service.name),
          to: memberId(service.name, member),
          kind: 'contains',
          evidence: 'ast',
          details: { member },
        });
        addEdge({
          from: ownerId,
          to: memberId(service.name, member),
          kind: 'uses-property',
          evidence: 'ast',
          details: { runtime: 'effect', property: member },
        });
      }
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
