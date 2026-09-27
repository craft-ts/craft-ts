import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
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

/** An app shell with nested routes, a lazily loaded collection and shared UI. */
function appFixture(): { root: string; graphFile: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), 'craft-organize-app-'));
  const src = join(root, 'src');
  mkdirSync(src, { recursive: true });
  const files: Record<string, string> = {
    'main.ts': "import './app.config.ts';\n",
    'app.config.ts':
      "import './app.ts'; import './error-screen.ts'; export const config = {};\n",
    'app.ts': "import './app.routes.ts'; export const App = {};\n",
    'app.routes.ts':
      "import './catalog.ts'; import './detail.ts'; import './reviews.ts'; import './cart.ts'; import './account.routes.ts'; export const routes = [];\n",
    'error-screen.ts': 'export const ErrorScreen = {};\n',
    'shell.ts': 'export const Shell = {};\n',
    'header.ts': 'export const Header = {};\n',
    'catalog.ts': 'export const Catalog = {};\n',
    'detail.ts': 'export const Detail = {};\n',
    'reviews.ts': 'export const Reviews = {};\n',
    'badge.ts': 'export const Badge = {};\n',
    'price.ts': 'export const Price = {};\n',
    'cart.ts': 'export const Cart = {};\n',
    'button.ts': 'export const Button = {};\n',
    'account.routes.ts':
      "import './settings.ts'; export const accountRoutes = [];\n",
    'settings.ts': 'export const Settings = {};\n',
  };
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(src, name), content);
  const project = join(root, 'tsconfig.graph.json');
  writeFileSync(
    project,
    JSON.stringify({
      compilerOptions: { module: 'ESNext', target: 'ES2022' },
      include: ['src/**/*.ts'],
    }),
  );
  const file = (name: string) => join(src, name);
  type Kind = DependencyGraph['nodes'][number]['kind'];
  const node = (
    id: string,
    kind: Kind,
    name: string,
    details: Record<string, unknown> = {},
  ) => ({ id, kind, label: id, filePath: file(name), details });
  const route = (id: string, name: string, collection: string, path: string) =>
    node(id, 'route', name, { collection, path });
  const nodes: DependencyGraph['nodes'] = [
    node('config', 'app-config', 'app.config.ts'),
    node('App', 'component', 'app.ts'),
    route('route:catalog', 'app.routes.ts', 'app', 'catalog'),
    route('route:detail', 'app.routes.ts', 'app', 'catalog/detail/:id'),
    route('route:reviews', 'app.routes.ts', 'app', 'catalog/reviews'),
    route('route:cart', 'app.routes.ts', 'app', 'cart'),
    route('route:account', 'app.routes.ts', 'app', 'account'),
    route('route:settings', 'account.routes.ts', 'account', 'settings'),
    node('ErrorScreen', 'component', 'error-screen.ts'),
    node('Shell', 'component', 'shell.ts'),
    node('Header', 'component', 'header.ts'),
    node('Catalog', 'component', 'catalog.ts'),
    node('Detail', 'component', 'detail.ts'),
    node('Reviews', 'component', 'reviews.ts'),
    node('Badge', 'component', 'badge.ts'),
    node('Price', 'component', 'price.ts'),
    node('Cart', 'component', 'cart.ts'),
    node('Button', 'component', 'button.ts'),
    node('Settings', 'component', 'settings.ts'),
  ];
  const edge = (
    from: string,
    to: string,
    kind: DependencyGraph['edges'][number]['kind'],
  ): DependencyGraph['edges'][number] => ({
    from,
    to,
    kind,
    evidence: 'ast',
    proof: { filePath: file('app.routes.ts'), line: 1, pattern: kind },
  });
  const graph: DependencyGraph = {
    version: 1,
    rootDir: root,
    tsConfigFilePath: project,
    nodes,
    edges: [
      edge('config', 'ErrorScreen', 'provides'),
      { ...edge('config', 'Shell', 'renders'), details: { role: 'root' } },
      edge('Shell', 'Header', 'renders'),
      edge('route:catalog', 'Catalog', 'loads'),
      edge('route:detail', 'Detail', 'loads'),
      edge('route:reviews', 'Reviews', 'loads'),
      edge('route:cart', 'Cart', 'loads'),
      edge('route:account', 'route:settings', 'loads'),
      edge('route:settings', 'Settings', 'loads'),
      edge('Catalog', 'Badge', 'renders'),
      edge('Detail', 'Badge', 'renders'),
      edge('Detail', 'Price', 'renders'),
      edge('Reviews', 'Price', 'renders'),
      edge('Catalog', 'Button', 'renders'),
      edge('Cart', 'Button', 'renders'),
    ],
  };
  const graphFile = join(root, 'craft-dependency-graph.json');
  writeFileSync(graphFile, `${JSON.stringify(graph)}\n`);
  return { root, graphFile, project };
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
    expect(bySource.get('src/shop.ts')?.proposedPath).toBe(
      'src/features/shop/shop.ts',
    );
    expect(bySource.get('src/api.ts')?.scope).toBe('global-shared');
    expect(bySource.get('src/global-hook.ts')?.scope).toBe('core');
    expect(bySource.get('src/route-provider.ts')?.scope).toBe('feature-local');
    expect(bySource.get('src/plain.ts')?.confidence).toBeLessThan(0.5);
    expect(bySource.get('src/plain.ts')?.routeAnchors).toEqual(['shop']);
    expect(bySource.get('src/unresolved.ts')?.scope).toBe('unresolved');
    expect(result.analysis.sourceGraphHash).toBeTruthy();
    expect(
      readFileSync(
        join(setup.root, 'proposal', 'FOLDER_LAYOUT_REPORT.md'),
        'utf8',
      ),
    ).toContain('File-by-file decisions');
  });

  it('places files feature first: shell in core, shared only across top-level features', () => {
    const setup = appFixture();
    const result = organizeProject({
      rootDir: setup.root,
      project: setup.project,
      graph: setup.graphFile,
      out: 'proposal',
    });
    const destination = new Map(
      result.proposal.placements.map((placement) => [
        placement.sourcePath,
        [placement.scope, placement.proposedPath] as const,
      ]),
    );

    expect(destination.get('src/main.ts')).toEqual(['core', 'src/main.ts']);
    expect(destination.get('src/app.ts')).toEqual(['core', 'src/core/app.ts']);
    expect(destination.get('src/app.config.ts')).toEqual([
      'core',
      'src/core/app.config.ts',
    ]);
    // The root routes table spans every feature, yet it is the shell's.
    expect(destination.get('src/app.routes.ts')).toEqual([
      'core',
      'src/core/app.routes.ts',
    ]);
    // provideCraftRootComponent(Shell): the root is the shell whatever its
    // file name, and so is what only it renders.
    expect(destination.get('src/shell.ts')).toEqual([
      'core',
      'src/core/shell.ts',
    ]);
    expect(
      result.proposal.placements.find(
        (placement) => placement.sourcePath === 'src/shell.ts',
      )?.reasons[0],
    ).toBe('root component (provideCraftRootComponent)');
    expect(destination.get('src/header.ts')).toEqual([
      'core',
      'src/core/header.ts',
    ]);
    expect(destination.get('src/error-screen.ts')).toEqual([
      'core',
      'src/core/error-screen.ts',
    ]);
    expect(destination.get('src/catalog.ts')).toEqual([
      'feature-local',
      'src/features/catalog/catalog.ts',
    ]);
    // Route params are not folders.
    expect(destination.get('src/detail.ts')).toEqual([
      'feature-local',
      'src/features/catalog/detail/detail.ts',
    ]);
    // Used by a route and its ancestor: the deepest route owns it.
    expect(destination.get('src/badge.ts')).toEqual([
      'feature-local',
      'src/features/catalog/detail/badge.ts',
    ]);
    // Used by sibling sub-features: their parent feature, not shared.
    expect(destination.get('src/price.ts')).toEqual([
      'parent-shared',
      'src/features/catalog/price.ts',
    ]);
    // A collection loaded by a route nests under that route.
    expect(destination.get('src/settings.ts')).toEqual([
      'feature-local',
      'src/features/account/settings/settings.ts',
    ]);
    // A routes table stays with the route that loads it.
    expect(destination.get('src/account.routes.ts')).toEqual([
      'parent-shared',
      'src/features/account/account.routes.ts',
    ]);
    // Only what several top-level features use is shared.
    expect(destination.get('src/button.ts')).toEqual([
      'global-shared',
      'src/shared/button.ts',
    ]);
    expect(
      result.proposal.placements.filter(
        (placement) => placement.scope === 'global-shared',
      ),
    ).toHaveLength(1);
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
