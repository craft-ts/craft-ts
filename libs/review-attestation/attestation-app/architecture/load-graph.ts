import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  analyzeDependencyGraph,
  architectureCatalogToTypeScript,
  buildArchitectureCatalog,
  createArchitectureGraph,
  mergeStyleDump,
} from '@craft-ts/dev-tools';
// By path, like the plugin in `vite.config.ts`: the evaluation is a Node
// build step, not app code.
import { loadStyleDump } from '../../../../libs/style/src/plugin/vite.ts';
import { architectureCatalog } from './catalog';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const catalogPath = join(import.meta.dirname, 'catalog.ts');

/**
 * The style modules are evaluated in Node by the same code the build plugin
 * runs; inside the monorepo they resolve the workspace sources, as in
 * `vite.config.ts`.
 */
const styleAlias = {
  '@craft-ts/style': join(workspaceRoot, 'libs/style/src/index.ts'),
  '@craft-ts/core': join(workspaceRoot, 'libs/core/src/index.ts'),
  '@craft-ts/component': join(workspaceRoot, 'libs/component/src/index.ts'),
};

let cached: ReturnType<typeof createArchitectureGraph> | undefined;

export async function loadArchitectureGraph() {
  if (cached) return cached;
  const graph = analyzeDependencyGraph({
    rootDir: workspaceRoot,
    tsConfigFilePath: 'libs/review-attestation/attestation-app/tsconfig.graph.json',
  });
  writeFileSync(
    catalogPath,
    `// Generated. Do not edit.\n${architectureCatalogToTypeScript(buildArchitectureCatalog(graph))}`,
  );
  // The catalog stays built from the code graph alone: its hash must not move
  // with the style dump, which the build regenerates.
  const styleDump = await loadStyleDump(
    join(workspaceRoot, 'libs/review-attestation/attestation-app/src'),
    {
      alias: styleAlias,
      include: [join(workspaceRoot, 'libs/component/src')],
    },
  );
  cached = createArchitectureGraph(
    mergeStyleDump(graph, styleDump),
    architectureCatalog,
  );
  return cached;
}
