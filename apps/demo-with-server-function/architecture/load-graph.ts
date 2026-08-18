import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  architectureCatalogToTypeScript,
  buildArchitectureCatalog,
  createArchitectureGraph,
} from '@craft-ts/dev-tools/architecture-graph';
import { analyzeDependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import { architectureCatalog } from './catalog';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const catalogPath = join(import.meta.dirname, 'catalog.ts');

let cached: ReturnType<typeof createArchitectureGraph> | undefined;

export function loadArchitectureGraph() {
  if (cached) return cached;
  const graph = analyzeDependencyGraph({
    rootDir: workspaceRoot,
    tsConfigFilePath: 'apps/demo-with-server-function/tsconfig.graph.json',
  });
  writeFileSync(
    catalogPath,
    `// Generated. Do not edit.\n${architectureCatalogToTypeScript(buildArchitectureCatalog(graph))}`,
  );
  cached = createArchitectureGraph(graph, architectureCatalog);
  return cached;
}
