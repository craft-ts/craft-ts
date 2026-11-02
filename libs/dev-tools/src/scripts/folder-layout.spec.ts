import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { DependencyGraph } from './dependency-graph';
import { applyFolderLayoutProposal } from './apply-folder-layout';
import { GraphStore, organizeProject } from './folder-layout';
import {
  computeFolderLayout,
  folderLayoutLayerFindings,
  folderLayoutPlacementFindings,
} from './folder-layout-rule';

/**
 * A shop: the shell, a `shop` feature with a nested `cart`, an `admin`
 * feature, and what they share.
 */
function layoutFixture(
  place: (name: string) => string = (name) => name,
): { root: string; graphFile: string; project: string; graph: DependencyGraph } {
  const root = mkdtempSync(join(tmpdir(), 'craft-layout-'));
  const src = join(root, 'src');
  const at = (name: string) => join(src, place(name));
  const to = (from: string, name: string) => {
    const path = relative(dirname(at(from)), at(name)).split('\\').join('/');
    return (path.startsWith('.') ? path : `./${path}`).replace(/\.ts$/, '');
  };
  const files: Record<string, (from: string) => string> = {
    'main.ts': (f) => `import '${to(f, 'app.config.ts')}';\n`,
    'app.config.ts': (f) =>
      `import { routes } from '${to(f, 'app.routes.ts')}';\nimport { Shell } from '${to(f, 'shell.ts')}';\nexport const config = { routes, Shell };\n`,
    'app.routes.ts': (f) =>
      `export const routes = [\n  { path: 'shop', loadChildren: () => import('${to(f, 'shop.routes.ts')}') },\n  { path: 'admin', loadChildren: () => import('${to(f, 'admin.routes.ts')}') },\n];\n`,
    'shell.ts': (f) =>
      `import { Header } from '${to(f, 'header.ts')}';\nexport const Shell = Header;\n`,
    'header.ts': () => 'export const Header = {};\n',
    'shop.routes.ts': (f) =>
      `export const shopRoutes = [\n  { path: '', loadComponent: () => import('${to(f, 'shop-page.ts')}') },\n  { path: 'cart', loadChildren: () => import('${to(f, 'cart.routes.ts')}') },\n];\n`,
    'shop-page.ts': (f) =>
      `import { Gallery } from '${to(f, 'shop-gallery.ts')}';\nimport { Price } from '${to(f, 'price.ts')}';\nimport { api } from '${to(f, 'api.ts')}';\nexport const ShopPage = { Gallery, Price, api };\n`,
    'shop-gallery.ts': (f) =>
      `import { Item } from '${to(f, 'gallery-item.ts')}';\nimport { Zoom } from '${to(f, 'gallery-zoom.ts')}';\nexport const Gallery = { Item, Zoom };\n`,
    'gallery-item.ts': () => 'export const Item = {};\n',
    'gallery-zoom.ts': () => 'export const Zoom = {};\n',
    'cart.routes.ts': (f) =>
      `export const cartRoutes = [{ path: '', loadComponent: () => import('${to(f, 'cart-page.ts')}') }];\n`,
    'cart-page.ts': (f) =>
      `import { Price } from '${to(f, 'price.ts')}';\nexport const CartPage = Price;\n`,
    'price.ts': () => 'export const Price = {};\n',
    'admin.routes.ts': (f) =>
      `export const adminRoutes = [{ path: '', loadComponent: () => import('${to(f, 'admin-page.ts')}') }];\n`,
    'admin-page.ts': (f) =>
      `import { api } from '${to(f, 'api.ts')}';\nimport { store } from '${to(f, 'store.ts')}';\nexport const AdminPage = { api, store };\n`,
    'store.ts': (f) =>
      `import { Badge } from '${to(f, 'badge.ts')}';\nexport const store = { Badge };\n`,
    'badge.ts': () => 'export const Badge = {};\n',
    'api.ts': (f) =>
      `import { format } from '${to(f, 'format.ts')}';\nexport const api = { format };\n`,
    // A type-only import carries no ownership: the shell stays the shell's.
    'format.ts': (f) =>
      `import type { Shell } from '${to(f, 'shell.ts')}';\nexport const format = (shell?: typeof Shell) => shell;\n`,
    'orphan.ts': () => 'export const orphan = {};\n',
  };
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(at(name)), { recursive: true });
    writeFileSync(at(name), content(name));
  }
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
  type Kind = DependencyGraph['nodes'][number]['kind'];
  const node = (name: string, kind: Kind) => ({
    id: `${kind}:${name}`,
    kind,
    label: name,
    filePath: at(name),
  });
  const graph: DependencyGraph = {
    version: 1,
    rootDir: root,
    tsConfigFilePath: project,
    nodes: [
      node('app.config.ts', 'app-config'),
      node('app.routes.ts', 'route'),
      node('shop.routes.ts', 'route'),
      node('cart.routes.ts', 'route'),
      node('admin.routes.ts', 'route'),
      ...[
        'shell.ts',
        'header.ts',
        'shop-page.ts',
        'shop-gallery.ts',
        'gallery-item.ts',
        'gallery-zoom.ts',
        'cart-page.ts',
        'price.ts',
        'admin-page.ts',
        'badge.ts',
      ].map((name) => node(name, 'component')),
      node('store.ts', 'service'),
      node('api.ts', 'http-endpoint'),
    ],
    edges: [],
  };
  const graphFile = join(root, 'craft-dependency-graph.json');
  writeFileSync(graphFile, `${JSON.stringify(graph)}\n`);
  return { root, graphFile, project, graph };
}

/** Where the layout puts each fixture file, relative to `src/`. */
const EXPECTED_LAYOUT: Readonly<Record<string, string>> = {
  'main.ts': 'main.ts',
  'app.config.ts': 'app/app.config.ts',
  'app.routes.ts': 'app/app.routes.ts',
  'shell.ts': 'app/shell.ts',
  'header.ts': 'app/header.ts',
  'shop.routes.ts': 'features/shop/shop.routes.ts',
  'shop-page.ts': 'features/shop/shop-page.ts',
  'shop-gallery.ts': 'features/shop/gallery/shop-gallery.ts',
  'gallery-item.ts': 'features/shop/gallery/gallery-item.ts',
  'gallery-zoom.ts': 'features/shop/gallery/gallery-zoom.ts',
  'cart.routes.ts': 'features/shop/cart/cart.routes.ts',
  'cart-page.ts': 'features/shop/cart/cart-page.ts',
  'price.ts': 'features/shop/shared/ui/price.ts',
  'admin.routes.ts': 'features/admin/admin.routes.ts',
  'admin-page.ts': 'features/admin/admin-page.ts',
  'store.ts': 'features/admin/store.ts',
  'badge.ts': 'features/admin/badge.ts',
  'api.ts': 'shared/data-access/api.ts',
  'format.ts': 'shared/util/format.ts',
  'orphan.ts': 'orphan.ts',
};

describe('craft organize', () => {
  it('places files by zone, then shares them by layer under the closest common zone', () => {
    const setup = layoutFixture();
    const result = organizeProject({
      rootDir: setup.root,
      project: setup.project,
      graph: setup.graphFile,
      out: 'proposal',
    });
    const destination = Object.fromEntries(
      result.proposal.placements.map((placement) => [
        placement.sourcePath.replace(/^src\//, ''),
        placement.proposedPath?.replace(/^src\//, '') ?? placement.sourcePath,
      ]),
    );
    expect(destination).toEqual(
      Object.fromEntries(
        Object.entries(EXPECTED_LAYOUT).map(([name, path]) => [
          name,
          name === 'orphan.ts' ? 'src/orphan.ts' : path,
        ]),
      ),
    );
    const scope = (name: string) =>
      result.proposal.placements.find(
        (placement) => placement.sourcePath === `src/${name}`,
      );
    expect(scope('main.ts')?.action).toBe('keep-at-root');
    expect(scope('price.ts')).toMatchObject({
      scope: 'parent-shared',
      layer: 'ui',
      routeAnchors: ['shop', 'shop/cart'],
    });
    expect(scope('api.ts')).toMatchObject({
      scope: 'global-shared',
      layer: 'data-access',
    });
    expect(scope('orphan.ts')).toMatchObject({
      scope: 'unresolved',
      action: 'delete',
    });
    expect(result.analysis.zones.map((zone) => zone.path)).toEqual([
      'admin',
      'app',
      'shop',
      'shop/cart',
    ]);
    expect(result.analysis.layerViolations).toEqual([
      {
        file: 'store.ts',
        layer: 'state',
        imported: 'badge.ts',
        importedLayer: 'ui',
      },
    ]);
    expect(result.report).toContain('## Layer violations');
  });

  it('keeps a sub-folder only for a file that alone leads to enough files', () => {
    const setup = layoutFixture();
    const layout = computeFolderLayout({
      rootDir: setup.root,
      tsConfigFilePath: setup.project,
      graph: setup.graph,
      groupMinFiles: 4,
    });
    expect(
      layout.placements.find((placement) => placement.file === 'gallery-item.ts')
        ?.folder,
    ).toBe('features/shop');
  });

  it('reports misplaced files and upward imports as architecture findings', () => {
    const flat = layoutFixture();
    expect(folderLayoutPlacementFindings(flat.graph)).toContainEqual({
      target: 'file:src/shop-page.ts',
      message: expect.stringContaining('belongs in src/features/shop/'),
    });
    const placed = layoutFixture((name) => EXPECTED_LAYOUT[name] ?? name);
    expect(folderLayoutPlacementFindings(placed.graph)).toEqual([
      {
        target: 'file:src/orphan.ts',
        message: expect.stringContaining('no entry reaches this file'),
      },
    ]);
    expect(folderLayoutLayerFindings(placed.graph)).toEqual([
      {
        target: 'file:src/features/admin/store.ts',
        message: expect.stringContaining(
          '(state) imports src/features/admin/badge.ts (ui)',
        ),
      },
    ]);
  });

  it('applies a proposal and keeps dotted file names in rewritten imports', () => {
    const setup = layoutFixture();
    const { proposal } = organizeProject({
      rootDir: setup.root,
      project: setup.project,
      graph: setup.graphFile,
      out: '.organize',
    });
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: setup.root });
    git('init', '-q');
    git('add', 'src');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
    // Git reports the real path (`/private/var/…` on macOS): every path
    // handed to `apply` has to use it.
    const root = realpathSync(setup.root);
    applyFolderLayoutProposal({
      rootDir: root,
      project: join(root, 'tsconfig.graph.json'),
      proposal: {
        ...proposal,
        placements: proposal.placements.filter(
          (placement) => placement.action !== 'delete',
        ),
      },
    });
    // `./app.config` names `app.config.ts`: `.config` is no extension.
    expect(readFileSync(join(setup.root, 'src', 'main.ts'), 'utf8')).toBe(
      "import './app/app.config';\n",
    );
    expect(
      readFileSync(join(setup.root, 'src', 'app', 'app.config.ts'), 'utf8'),
    ).toContain("from './app.routes'");
  });

  it('is deterministic and independent from historical folder names', () => {
    const first = layoutFixture();
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
    ).toBe('new-root/shared/data-access/api.ts');
  });

  it('refuses an obsolete graph without rebuilding it', () => {
    const setup = layoutFixture();
    const future = new Date(Date.now() + 5_000);
    utimesSync(join(setup.root, 'src', 'shop-page.ts'), future, future);
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
    const setup = layoutFixture();
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
    const setup = layoutFixture();
    const original = readFileSync(
      join(setup.root, 'src', 'shop-page.ts'),
      'utf8',
    );
    const result = organizeProject({
      rootDir: setup.root,
      project: setup.project,
      graph: setup.graphFile,
      out: 'proposal',
    });
    expect(
      readFileSync(join(setup.root, 'src', 'shop-page.ts'), 'utf8'),
    ).toBe(original);
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
