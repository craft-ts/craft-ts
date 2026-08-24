# Extensible architecture graph

The Craft architecture graph is extensible by **TypeScript backend**, without
making the graph engine import that backend. Use this when an application has
server-side concepts that the built-in Craft graph cannot express: services,
layers, message brokers, data classifications, external outputs, or another
dependency-injection system.

The extension has two separate parts:

- a type extension, which gives rules typed `kind` details;
- a runtime collector, which reads the TypeScript program and contributes
  nodes, relations, diagnostics, and source proofs.

Importing the types never activates a collector.

## 1. Extend the vocabulary

Add entries to the node and relation registries with module augmentation. The
augmentation must target the graph subpath:

```typescript
import type {
  DependencyGraphCollector,
  DependencyGraphEdgeRegistry,
  DependencyGraphNodeRegistry,
} from '@craft-ts/dev-tools/dependency-graph';
import { assertSensitiveOutputsProtected } from '@craft-ts/dev-tools/architecture-graph';

declare module '@craft-ts/dev-tools/dependency-graph' {
  interface DependencyGraphNodeRegistry {
    'repository-service': {
      runtime: 'repository';
      repositoryName: string;
    };
  }

  interface DependencyGraphEdgeRegistry {
    'requires-repository': {
      operation: string;
    };
  }
}
```

The registry determines the types of the public graph API:

```typescript
const repositories = graph.nodes('repository-service');
const name: string = repositories[0]!.details!.repositoryName;

const requirements = graph.edges('requires-repository');
const operation: string = requirements[0]!.details!.operation;
```

Keep a new node kind for a concept with its own semantics, renderer, or
architecture rules. Put incidental information in the typed `details` object
instead of creating a kind for every local symbol.

## 2. Write a collector

A collector receives the shared `ts-morph` project and the source files already
selected by the graph's tsconfig. It returns a contribution; it does not call
architecture rules or mutate a renderer.

```typescript
const repositoryCollector: DependencyGraphCollector = {
  name: 'repository-backend',

  collect({ rootDir, sourceFiles }) {
    const nodes = [];
    const edges = [];

    for (const sourceFile of sourceFiles) {
      // Inspect declarations and calls with ts-morph here.
      // Add a node or relation only when the syntax/type evidence is clear.
      void rootDir;
      void sourceFile;
    }

    return { nodes, edges };
  },
};
```

Every contributed node needs a stable `id`, a `kind`, and a human-readable
`label`. Every relation must point to nodes in the contribution or to nodes
already in the graph. A conflicting identity is rejected during the merge.

## 3. Attach source proofs

A collector should explain why a fact exists. Add a `proof` to relations when
possible:

```typescript
edges.push({
  from: handlerId,
  to: repositoryId,
  kind: 'requires-repository',
  evidence: 'ast',
  details: { operation: 'list' },
  proof: {
    filePath: sourceFile.getFilePath(),
    line: call.getStartLineNumber(),
    symbol: 'listUsers',
    pattern: 'repository.list()',
  },
});
```

Proofs are available through `graph.proofs(edge)` and are included in paths:

```typescript
const paths = graph.pathsBetween(handlerId, repositoryId);
for (const path of paths) {
  console.log(path.nodes.map((node) => node.label));
  console.log(path.proofs);
}
```

If a dependency cannot be resolved statically, emit a diagnostic or an
explicit unknown relation. Do not publish an unresolved dependency as if it
were proven.

## 4. Activate the collector explicitly

Register the collector in the application's graph loader:

```typescript
const graph = analyzeDependencyGraph({
  rootDir: workspaceRoot,
  tsConfigFilePath: 'apps/shop/tsconfig.graph.json',
  collectors: [repositoryCollector],
  middlewareCapabilities: {
    'shop.audit-sensitive-data': ['personal-data'],
  },
});

return createArchitectureGraph(graph, architectureCatalog);
```

This keeps runtime analysis separate from declaration merging. A type import
cannot accidentally enable an expensive backend analysis or its rules.

## Effect backend

The repository currently includes an Effect adapter. It recognizes Effect
`Context.Service` declarations and server-function requirements such as:

```typescript
export class UserRepository extends Context.Service<
  UserRepository,
  UserRepositoryShape
>()('demo/UserRepository') {}

export const listUsers = serverFunction('demo.users.list', inputSchema, {
  exposure: 'client',
}).handler(({ input }) =>
  Effect.gen(function* () {
    const repository = yield* UserRepository;
    return yield* repository.list(input.filter);
  }),
);
```

The graph exposes `effect-service`, `effect-operation`, and `effect-layer`
nodes, plus typed `requires-service`, `provided-by-layer`, and
`composes-layer` relations with source proofs. `Layer.succeed`, `Layer.sync`,
`Layer.effect`, `Layer.mergeAll`, and `Layer.provide` are followed only when
their relevant symbols are statically visible. Dynamic composition is marked
partial or unknown.

## Sensitive data and output policies

Effect Schema annotations can seed a conservative data-flow graph:

```typescript
const Email = Schema.String.pipe(
  Schema.annotations({ sensitivity: 'personal-data' }),
);
```

When an annotated schema is used as the output of a client-exposed server
function, the graph emits a `data-classification` node, an `external-output`
node, and an `exposes-data` relation carrying the classification and proof.
Classification is retained when propagation is uncertain; the analyser never
assumes that an arbitrary transform made data safe.

Repositories declare middleware capabilities beside the graph configuration:

```typescript
const graph = analyzeDependencyGraph({
  tsConfigFilePath: 'apps/shop/tsconfig.graph.json',
  middlewareCapabilities: {
    'shop.audit-sensitive-data': ['personal-data', 'secret'],
  },
});
```

Then enforce the policy with:

```typescript
assertSensitiveOutputsProtected(graph.graph, {
  categories: ['personal-data', 'secret'],
});
```

The rule reports the output, classification, expected capability, and source
proof when no attached server middleware provides the declared protection.
Unknown protection remains blocking unless `allowUnknown: true` is chosen
explicitly.

## Rendering and JSON compatibility

The JSON graph remains tolerant of kinds a renderer does not know. Generic
renderers display the kind and label as a fallback; they do not discard the
node. A backend-specific renderer or architecture rule can consume the typed
details through declaration merging.

When the vocabulary changes, regenerate the committed architecture catalog and
run the architecture suite:

```shell
npx craft-graph \
  --project apps/shop/tsconfig.graph.json \
  --root . \
  --out apps/shop/architecture/catalog \
  --format json

npx nx architecture shop
```

See [Architecture rules](/guide/testing/architecture) for the application
loader, catalog generation, and baseline rules.
