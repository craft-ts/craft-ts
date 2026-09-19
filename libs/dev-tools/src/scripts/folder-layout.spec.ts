import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { DependencyGraph } from './dependency-graph';
import { GraphStore, organizeProject } from './folder-layout';

function fixture(): {
  root: string;
  graph: DependencyGraph;
  graphFile: string;
  project: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'craft-organize-'));
  const src = join(root, 'src');
  mkdirSync(src, { recursive: true });
  const files: Record<string, string> = {
    'shop.routes.ts': 'export const routes = [];\n',
    'shop.ts':
      "import './plain.ts'; import './api.ts'; export const Shop = {};\n",
    'admin.routes.ts': 'export const routes = [];\n',
    'admin.ts': "import './api.ts'; export const Admin = {};\n",
    'api.ts': 'export const api = {};\n',
    'plain.ts': 'export const helper = {};\n',
    'global-hook.ts': 'export const hook = {};\n',
    'route-provider.ts': 'export const provider = {};\n',
    'unresolved.ts': 'export const unresolved = {};\n',
  };
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(src, name), content);
  const project = join(root, 'tsconfig.graph.json');
  writeFileSync(
    project,
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        target: 'ES2022',
        moduleResolution: 'Bundler',
      },
      include: ['src/**/*.ts'],
    }),
  );
  const file = (name: string) => join(src, name);
  const node = (
    id: string,
    kind: DependencyGraph['nodes'][number]['kind'],
    name: string,
    filePath: string,
    details: Record<string, unknown> = {},
  ) => ({ id, kind, label: name, filePath, details });
  const nodes: DependencyGraph['nodes'] = [
    node('route:shop', 'route', 'shop:/shop', file('shop.routes.ts'), {
      collection: 'shop',
      path: '/shop',
    }),
    node('route:admin', 'route', 'admin:/admin', file('admin.routes.ts'), {
      collection: 'admin',
      path: '/admin',
    }),
    node('component:shop', 'component', 'Shop', file('shop.ts')),
    node('component:admin', 'component', 'Admin', file('admin.ts')),
    node('service:api', 'service', 'Api', file('api.ts')),
    node('hook:global', 'route-hook', 'GlobalHook', file('global-hook.ts')),
    node(
      'provider:route',
      'service',
      'RouteProvider',
      file('route-provider.ts'),
    ),
  ];
  const edge = (
    from: string,
    to: string,
    kind: DependencyGraph['edges'][number]['kind'],
  ): DependencyGraph['edges'][number] => ({
    from,
    to,
    kind,
    evidence: kind === 'loads' ? 'ast' : 'type',
    proof: { filePath: file('shop.ts'), line: 1, pattern: kind },
  });
  const graph: DependencyGraph = {
    version: 1,
    rootDir: root,
    tsConfigFilePath: project,
    nodes,
    edges: [
      edge('route:shop', 'component:shop', 'loads'),
      edge('route:admin', 'component:admin', 'loads'),
      edge('component:shop', 'service:api', 'depends-on'),
      edge('component:admin', 'service:api', 'depends-on'),
      edge('route:shop', 'hook:global', 'loads'),
      edge('route:admin', 'hook:global', 'loads'),
      edge('route:shop', 'provider:route', 'provides'),
    ],
  };
  const graphFile = join(root, 'craft-dependency-graph.json');
  writeFileSync(graphFile, `${JSON.stringify(graph)}\n`);
  return { root, graph, graphFile, project };
}

describe('craft organize', () => {
  it('projects routes, shared services, hooks, providers and import-only files', () => {
    const setup = fixture();
    const result = organizeProject({
      rootDir: setup.root,
      project: setup.project,
      graph: setup.graphFile,
      out: 'proposal',
    });
    const bySource = new Map(
      result.proposal.placements.map((placement) => [
        placement.sourcePath,
        placement,
      ]),
    );

    expect(bySource.get('src/shop.ts')?.scope).toBe('feature-local');
    expect(bySource.get('src/api.ts')?.scope).toBe('global-shared');
    expect(bySource.get('src/global-hook.ts')?.scope).toBe('core');
    expect(bySource.get('src/route-provider.ts')?.scope).toBe('feature-local');
    expect(bySource.get('src/plain.ts')?.confidence).toBeLessThan(0.5);
    expect(bySource.get('src/plain.ts')?.routeAnchors).toContain('shop/shop');
    expect(result.analysis.sourceGraphHash).toBeTruthy();
    expect(
      readFileSync(
        join(setup.root, 'proposal', 'FOLDER_LAYOUT_REPORT.md'),
        'utf8',
      ),
    ).toContain('File-by-file decisions');
  });

  it('is deterministic and independent from historical folder names', () => {
    const first = fixture();
    const a = organizeProject({
      rootDir: first.root,
      project: first.project,
      graph: first.graphFile,
      out: 'a',
      targetRoot: 'new-root',
    });
    const b = organizeProject({
      rootDir: first.root,
      project: first.project,
      graph: first.graphFile,
      out: 'b',
      targetRoot: 'new-root',
    });
    expect(a.proposal).toEqual(b.proposal);
    expect(a.analysis.fileNodes).toEqual(b.analysis.fileNodes);
    expect(
      a.proposal.placements.find(
        (placement) => placement.sourcePath === 'src/api.ts',
      )?.proposedPath,
    ).toContain('new-root/shared');
  });

  it('refuses an obsolete graph without rebuilding it', () => {
    const setup = fixture();
    const future = new Date(Date.now() + 5_000);
    utimesSync(join(setup.root, 'src', 'shop.ts'), future, future);
    expect(() =>
      organizeProject({
        rootDir: setup.root,
        project: setup.project,
        graph: setup.graphFile,
        out: 'proposal',
      }),
    ).toThrow(/graph is stale/);
  });

  it('rejects invalid and unknown graph versions', () => {
    const setup = fixture();
    writeFileSync(
      setup.graphFile,
      JSON.stringify({ version: 2, nodes: [], edges: [] }),
    );
    expect(() =>
      new GraphStore({
        rootDir: setup.root,
        graphFile: setup.graphFile,
        tsConfigFilePath: setup.project,
      }).get(),
    ).toThrow(/version 1/);
  });

  it('keeps source files untouched and emits all required artifacts', () => {
    const setup = fixture();
    const original = readFileSync(join(setup.root, 'src', 'shop.ts'), 'utf8');
    const result = organizeProject({
      rootDir: setup.root,
      project: setup.project,
      graph: setup.graphFile,
      out: 'proposal',
    });
    expect(readFileSync(join(setup.root, 'src', 'shop.ts'), 'utf8')).toBe(
      original,
    );
    expect(
      readFileSync(
        join(result.outputDir, 'folder-layout-analysis.json'),
        'utf8',
      ),
    ).toContain('sourceGraphHash');
    expect(
      readFileSync(
        join(result.outputDir, 'folder-layout-proposal.json'),
        'utf8',
      ),
    ).toContain('placements');
  });
});
