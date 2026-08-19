import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  DependencyGraphProof,
} from './dependency-graph';

export interface EffectServiceNodeDetails {
  readonly runtime: 'effect';
  readonly tag: string;
  readonly serviceName: string;
}

export interface EffectServiceRequirementDetails {
  readonly runtime: 'effect';
  readonly selection: 'whole-service' | 'member';
  readonly member?: string;
}

export interface EffectOperationNodeDetails {
  readonly runtime: 'effect';
  readonly operationName: string;
  readonly resolution: 'static' | 'partial' | 'unknown';
}

export interface EffectLayerNodeDetails {
  readonly runtime: 'effect';
  readonly layerName: string;
  readonly providedServices: readonly string[];
  readonly requiredServices: readonly string[];
  readonly compositions: readonly string[];
  readonly resolution: 'complete' | 'partial' | 'unknown';
}

export interface EffectLayerRelationDetails {
  readonly runtime: 'effect';
  readonly service: string;
  readonly resolution: 'complete' | 'partial' | 'unknown';
}

declare module './dependency-graph' {
  interface DependencyGraphNodeRegistry {
    'effect-service': EffectServiceNodeDetails;
    'effect-operation': EffectOperationNodeDetails;
    'effect-layer': EffectLayerNodeDetails;
  }

  interface DependencyGraphEdgeRegistry {
    'requires-service': EffectServiceRequirementDetails;
    'provided-by-layer': EffectLayerRelationDetails;
    'composes-layer': { readonly runtime: 'effect' };
  }
}

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
const effectServiceId = (name: string) => `effect-service:${name}`;
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

export type EffectOperationOwner = {
  readonly name: string;
  readonly node: DependencyGraphNode;
  readonly start: number;
  readonly end: number;
  readonly filePath: string;
};

const operationId = (filePath: string, name: string) =>
  `effect-operation:${filePath}#${name}`;

/**
 * Finds named Effect operations around direct service reads. This is the
 * missing owner for standalone functions such as `checkUserAccess`: they are
 * not Craft services or components, but they still form a meaningful graph
 * boundary.
 */
export function collectEffectOperationOwners(
  sourceFiles: readonly SourceFile[],
  services: ReadonlyMap<string, EffectServiceInfo>,
): Map<string, EffectOperationOwner> {
  const owners = new Map<string, EffectOperationOwner>();

  for (const sourceFile of sourceFiles) {
    const candidates = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.YieldExpression),
      ...sourceFile
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((call) => {
          const callee = call.getExpression().getText();
          return callee === 'effectService' || callee.endsWith('.effectService');
        }),
    ].filter((candidate) => {
      if (Node.isYieldExpression(candidate)) {
        const expression = candidate.getExpression();
        return (
          expression !== undefined &&
          Node.isIdentifier(expression) &&
          services.has(expression.getText())
        );
      }
      return true;
    });

    for (const candidate of candidates) {
      const declaration = namedOperationDeclaration(candidate);
      if (!declaration) continue;
      const name = declaration.getName();
      if (!name) continue;
      const id = operationId(sourceFile.getFilePath(), name);
      if (owners.has(id)) continue;
      const node: DependencyGraphNode = {
        id,
        kind: 'effect-operation',
        label: name,
        filePath: sourceFile.getFilePath(),
        line: declaration.getStartLineNumber(),
        details: {
          runtime: 'effect',
          operationName: name,
          resolution: 'static',
        },
      };
      owners.set(id, {
        name,
        node,
        start: declaration.getStart(),
        end: declaration.getEnd(),
        filePath: sourceFile.getFilePath(),
      });
    }
  }

  return owners;
}

function namedOperationDeclaration(
  node: Node,
): import('ts-morph').VariableDeclaration | import('ts-morph').FunctionDeclaration | undefined {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isVariableDeclaration(current) && current.getName()) {
      const initializer = current.getInitializer();
      if (
        (Node.isCallExpression(initializer) &&
          initializer.getExpression().getText() === 'Effect.gen') ||
        initializer?.getDescendantsOfKind(SyntaxKind.CallExpression).some(
          (call) => call.getExpression().getText() === 'Effect.gen',
        )
      ) {
        return current;
      }
    }
    if (Node.isFunctionDeclaration(current) && current.getName()) {
      return current;
    }
    current = current.getParent();
  }
  return undefined;
}

export type EffectLayerContribution = EffectGraphContribution;

const layerId = (filePath: string, name: string) =>
  `effect-layer:${filePath}#${name}`;

/** Collects only Layer forms whose service and composition are statically visible. */
export function collectEffectLayers(
  sourceFiles: readonly SourceFile[],
  services: ReadonlyMap<string, EffectServiceInfo>,
): EffectLayerContribution {
  const nodes = new Map<string, DependencyGraphNode>();
  const edges = new Map<string, DependencyGraphEdge>();
  const layerDeclarations = new Map<string, import('ts-morph').VariableDeclaration>();
  const layerNames = new Map<string, string>();

  const addNode = (node: DependencyGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (edge: DependencyGraphEdge) => {
    const key = `${edge.from}:${edge.kind}:${edge.to}`;
    if (!edges.has(key)) edges.set(key, edge);
  };
  const proof = (node: Node, pattern: string): DependencyGraphProof => ({
    filePath: node.getSourceFile().getFilePath(),
    line: node.getStartLineNumber(),
    pattern,
  });

  for (const sourceFile of sourceFiles) {
    for (const declaration of sourceFile.getVariableDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer || !containsLayerCall(initializer)) continue;
      const name = declaration.getName();
      const id = layerId(sourceFile.getFilePath(), name);
      layerDeclarations.set(id, declaration);
      layerNames.set(name, id);
    }
  }

  for (const [id, declaration] of layerDeclarations) {
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    const provided: { name: string; node: Node }[] = [];
    const required: { name: string; node: Node }[] = [];
    const compositions: { id: string; node: Node }[] = [];
    const calls = [
      ...(Node.isCallExpression(initializer) ? [initializer] : []),
      ...initializer.getDescendantsOfKind(SyntaxKind.CallExpression),
    ];

    for (const call of calls) {
      const callee = call.getExpression().getText();
      const method = callee.match(/^Layer\.(succeed|sync|effect|scoped)$/)?.[1];
      if (method) {
        const argument = call.getArguments()[0];
        if (argument && Node.isIdentifier(argument)) {
          const service = services.get(argument.getText());
          if (service) provided.push({ name: service.name, node: call });
        }
      }
      if (callee === 'Layer.provide' || callee.endsWith('.provide')) {
        const argument = call.getArguments()[0];
        if (argument && Node.isIdentifier(argument)) {
          const target = layerNames.get(argument.getText());
          if (target) compositions.push({ id: target, node: argument });
        }
      }
    }

    for (const yielded of initializer.getDescendantsOfKind(SyntaxKind.YieldExpression)) {
      const expression = yielded.getExpression();
      if (!expression || !Node.isIdentifier(expression)) continue;
      const service = services.get(expression.getText());
      if (service && !provided.some((item) => item.name === service.name)) {
        required.push({ name: service.name, node: yielded });
      }
    }

    const resolution =
      provided.length > 0 &&
      required.length === 0 &&
      [...initializer.getDescendantsOfKind(SyntaxKind.CallExpression)].every(
        (call) => !isUnknownLayerCall(call),
      )
        ? 'complete'
        : provided.length > 0 || required.length > 0
          ? 'partial'
          : 'unknown';
    const node: DependencyGraphNode = {
      id,
      kind: 'effect-layer',
      label: declaration.getName(),
      filePath: declaration.getSourceFile().getFilePath(),
      line: declaration.getStartLineNumber(),
      details: {
        runtime: 'effect',
        layerName: declaration.getName(),
        providedServices: [...new Set(provided.map((item) => item.name))],
        requiredServices: [...new Set(required.map((item) => item.name))],
        compositions: [...new Set(compositions.map((item) => item.id))],
        resolution,
      },
    };
    addNode(node);

    for (const item of provided) {
      const target = effectServiceId(item.name);
      addNode({
        id: target,
        kind: 'effect-service',
        label: item.name,
        filePath: services.get(item.name)?.filePath,
        line: services.get(item.name)?.line,
        details: {
          runtime: 'effect',
          tag: services.get(item.name)?.key ?? item.name,
          serviceName: item.name,
        },
      });
      addEdge({
        from: target,
        to: id,
        kind: 'provided-by-layer',
        evidence: 'ast',
        details: { runtime: 'effect', service: item.name, resolution },
        proof: proof(item.node, `Layer provides ${item.name}`),
      });
    }
    for (const item of required) {
      const target = effectServiceId(item.name);
      addEdge({
        from: id,
        to: target,
        kind: 'requires-service',
        evidence: 'ast',
        details: { runtime: 'effect', selection: 'whole-service' },
        proof: proof(item.node, `yield* ${item.name}`),
      });
    }
    for (const item of compositions) {
      addEdge({
        from: id,
        to: item.id,
        kind: 'composes-layer',
        evidence: 'ast',
        details: { runtime: 'effect' },
        proof: proof(item.node, `Layer provides ${item.id}`),
      });
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function containsLayerCall(node: Node): boolean {
  return [
    ...(Node.isCallExpression(node) ? [node] : []),
    ...node.getDescendantsOfKind(SyntaxKind.CallExpression),
  ].some((call) => call.getExpression().getText().startsWith('Layer.'));
}

function isUnknownLayerCall(call: import('ts-morph').CallExpression): boolean {
  const callee = call.getExpression().getText();
  return callee.startsWith('Layer.') &&
    !/^Layer\.(succeed|sync|effect|scoped|mergeAll|provide)$/.test(callee);
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
  includeBackendRelations = false,
): EffectGraphContribution {
  const nodes = new Map<string, DependencyGraphNode>();
  const edges = new Map<string, DependencyGraphEdge>();

  const addNode = (node: DependencyGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEffectServiceNode = (service: EffectServiceInfo) => {
    addNode({
      id: effectServiceId(service.name),
      kind: 'effect-service',
      label: service.name,
      filePath: service.filePath,
      line: service.line,
      details: {
        runtime: 'effect',
        tag: service.key,
        serviceName: service.name,
      },
    });
  };
  const proofFor = (node: Node, pattern: string): DependencyGraphProof => ({
    filePath: node.getSourceFile().getFilePath(),
    line: node.getStartLineNumber(),
    pattern,
  });
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
    addEffectServiceNode(service);
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
          details: {
            runtime: 'effect',
            selection: 'whole-service',
            ...(isInsideLoader(call) ? { resourceRole: 'loader' } : {}),
          },
        });
        if (includeBackendRelations) {
          addEdge({
            from: ownerId,
            to: effectServiceId(service.name),
            kind: 'requires-service',
            evidence: 'ast',
            details: {
              runtime: 'effect',
              selection: 'whole-service',
            },
            proof: proofFor(call, call.getExpression().getText()),
          });
        }
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
          details: {
            runtime: 'effect',
            property: member,
            ...(isInsideLoader(call) ? { resourceRole: 'loader' } : {}),
          },
        });
        if (includeBackendRelations) {
          addEdge({
            from: ownerId,
            to: effectServiceId(service.name),
            kind: 'requires-service',
            evidence: 'ast',
            details: {
              runtime: 'effect',
              selection: 'member',
              member,
            },
            proof: proofFor(call, call.getExpression().getText()),
          });
        }
      }
    }

    for (const yielded of includeBackendRelations
      ? sourceFile.getDescendantsOfKind(SyntaxKind.YieldExpression)
      : []) {
      const expression = yielded.getExpression();
      if (!expression || !Node.isIdentifier(expression)) continue;
      const service = services.get(expression.getText());
      if (!service) continue;
      const ownerId = ownerIdOf(yielded);
      if (!ownerId) continue;
      addEdge({
        from: ownerId,
        to: effectServiceId(service.name),
        kind: 'requires-service',
        evidence: 'ast',
        details: { runtime: 'effect', selection: 'whole-service' },
        proof: proofFor(yielded, `yield* ${service.name}`),
      });
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function isInsideLoader(node: Node): boolean {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isPropertyAssignment(current) && current.getName() === 'loader') {
      return true;
    }
    current = current.getParent();
  }
  return false;
}
