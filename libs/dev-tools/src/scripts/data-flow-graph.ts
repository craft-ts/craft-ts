import {
  Node,
  SyntaxKind,
  type CallExpression,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  DependencyGraphProof,
} from './dependency-graph';

export interface DataClassificationNodeDetails {
  readonly classification: string;
  readonly source: 'schema-annotation';
  readonly schemaName: string;
}

export interface ExternalOutputNodeDetails {
  readonly boundary: 'server-function-response';
  readonly serverFunctionId?: string;
  readonly schemaName?: string;
  readonly classifications: readonly string[];
}

export interface DataFlowRelationDetails {
  readonly classification: string;
  readonly resolution: 'static' | 'unknown';
}

declare module './dependency-graph' {
  interface DependencyGraphNodeRegistry {
    'data-classification': DataClassificationNodeDetails;
    'external-output': ExternalOutputNodeDetails;
  }

  interface DependencyGraphEdgeRegistry {
    'exposes-data': DataFlowRelationDetails;
    'flows-data': DataFlowRelationDetails;
  }
}

type SchemaInfo = {
  readonly declaration: VariableDeclaration;
  readonly filePath: string;
  readonly name: string;
  readonly classifications: Set<string>;
};

const classificationId = (filePath: string, name: string, value: string) =>
  `data-classification:${filePath}#${name}:${value}`;

const outputId = (filePath: string, line: number) =>
  `external-output:${filePath}:${line}`;

/**
 * Extracts schema annotations and server-function response boundaries. The
 * propagation is intentionally conservative: only statically named schema
 * variables are followed, and no transform is assumed to remove sensitivity.
 */
export function collectDataFlowGraph(
  sourceFiles: readonly SourceFile[],
): { nodes: DependencyGraphNode[]; edges: DependencyGraphEdge[] } {
  const nodes = new Map<string, DependencyGraphNode>();
  const edges = new Map<string, DependencyGraphEdge>();
  const schemas = new Map<string, SchemaInfo>();
  const schemaByName = new Map<string, SchemaInfo[]>();

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
      if (!initializer || !containsSchema(initializer)) continue;
      const name = declaration.getName();
      const info: SchemaInfo = {
        declaration,
        filePath: sourceFile.getFilePath(),
        name,
        classifications: new Set(findSchemaAnnotations(initializer)),
      };
      schemas.set(`${sourceFile.getFilePath()}#${name}`, info);
      schemaByName.set(name, [...(schemaByName.get(name) ?? []), info]);
    }
  }

  const classifications = new Map<string, { schema: SchemaInfo; value: string; node: Node }>();
  for (const info of schemas.values()) {
    for (const value of info.classifications) {
      const annotation = findSchemaAnnotation(info.declaration.getInitializer(), value);
      if (!annotation) continue;
      classifications.set(`${info.filePath}#${info.name}:${value}`, {
        schema: info,
        value,
        node: annotation,
      });
      addNode({
        id: classificationId(info.filePath, info.name, value),
        kind: 'data-classification',
        label: `${info.name} [${value}]`,
        filePath: info.filePath,
        line: info.declaration.getStartLineNumber(),
        details: {
          classification: value,
          source: 'schema-annotation',
          schemaName: info.name,
        },
      });
    }
  }

  const classificationsFor = (info: SchemaInfo, seen = new Set<string>()): Set<string> => {
    const key = `${info.filePath}#${info.name}`;
    if (seen.has(key)) return new Set();
    const nextSeen = new Set([...seen, key]);
    const result = new Set(info.classifications);
    const initializer = info.declaration.getInitializer();
    if (!initializer) return result;
    for (const identifier of initializer.getDescendantsOfKind(SyntaxKind.Identifier)) {
      for (const target of schemaByName.get(identifier.getText()) ?? []) {
        for (const value of classificationsFor(target, nextSeen)) result.add(value);
      }
    }
    return result;
  };

  for (const sourceFile of sourceFiles) {
    if (!sourceFile.getBaseName().endsWith('.fn-serveur.ts')) continue;
    const serverFunction = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getExpression().getText() === 'serverFunction');
    if (!serverFunction) continue;
    const id = serverFunction
      .getArguments()[0]
      ?.asKind(SyntaxKind.StringLiteral)
      ?.getLiteralValue();
    const options = serverFunction
      .getArguments()[2]
      ?.asKind(SyntaxKind.ObjectLiteralExpression);
    const output = options
      ?.getProperty('output')
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer();
    if (!output) continue;
    const schemaName = output.asKind(SyntaxKind.Identifier)?.getText();
    const schema = schemaName
      ? [...(schemaByName.get(schemaName) ?? [])][0]
      : undefined;
    const values = schema ? [...classificationsFor(schema)] : [];
    const outputNode: DependencyGraphNode = {
      id: outputId(sourceFile.getFilePath(), serverFunction.getStartLineNumber()),
      kind: 'external-output',
      label: `${id ?? 'server-function'} response`,
      filePath: sourceFile.getFilePath(),
      line: serverFunction.getStartLineNumber(),
      details: {
        boundary: 'server-function-response',
        ...(id === undefined ? {} : { serverFunctionId: id }),
        ...(schemaName === undefined ? {} : { schemaName }),
        classifications: values,
      },
    };
    addNode(outputNode);

    for (const value of values) {
      const source = [...classifications.values()].find(
        (candidate) => candidate.value === value &&
          classificationsFor(candidate.schema).has(value),
      );
      if (!source) continue;
      addEdge({
        from: classificationId(source.schema.filePath, source.schema.name, value),
        to: outputNode.id,
        kind: 'exposes-data',
        evidence: 'ast',
        details: { classification: value, resolution: 'static' },
        proof: proof(output, `server function output: ${schemaName ?? 'unknown schema'}`),
      });
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function containsSchema(node: Node): boolean {
  return [
    ...(Node.isCallExpression(node) ? [node] : []),
    ...node.getDescendantsOfKind(SyntaxKind.CallExpression),
  ].some((call) => call.getExpression().getText().startsWith('Schema.'));
}

function findSchemaAnnotations(node: Node): string[] {
  const values = new Set<string>();
  for (const call of [
    ...(Node.isCallExpression(node) ? [node] : []),
    ...node.getDescendantsOfKind(SyntaxKind.CallExpression),
  ]) {
    const value = readSensitivity(call);
    if (value) values.add(value);
  }
  return [...values];
}

function findSchemaAnnotation(node: Node | undefined, value: string): Node | undefined {
  if (!node) return undefined;
  return [
    ...(Node.isCallExpression(node) ? [node] : []),
    ...node.getDescendantsOfKind(SyntaxKind.CallExpression),
  ].find((call) => readSensitivity(call) === value);
}

function readSensitivity(call: CallExpression): string | undefined {
  // Effect expose l'annotation en méthode (`Schema.String.annotate({ … })`) ;
  // `annotations` reste accepté pour les variantes qui l'orthographient ainsi.
  const callee = call.getExpression().getText();
  if (!callee.endsWith('annotate') && !callee.endsWith('annotations')) {
    return undefined;
  }
  const object = call
    .getArguments()[0]
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  return object
    ?.getProperty('sensitivity')
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.asKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}
