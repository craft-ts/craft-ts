/**
 * Where each file of an app belongs, computed from its imports.
 *
 * The layout follows two axes:
 *
 * - **Scope** — who uses the file. The app shell and every module loaded by a
 *   `loadChildren` are *zones*; a zone reaches what its entry imports,
 *   statically or through a `loadComponent`, without crossing into another
 *   zone. A file one zone reaches is that zone's own; a file several zones
 *   reach goes to the `shared/` of their closest common zone. Zones nest the
 *   way `loadChildren` calls nest, so a file only two sub-features use stays
 *   inside their parent feature.
 * - **Layer** — what the file is, read from its Craft nodes: `ui`, `state`,
 *   `data-access` or `util`, plus `wiring` for entries, routes and app
 *   configs. A shared folder is split by layer, and a file may only import a
 *   layer below its own.
 *
 * Inside a zone, a file that is the only way to reach at least
 * `groupMinFiles` files (itself included), one level below the zone's pages,
 * takes them into a sub-folder named after it.
 *
 * The same computation backs `craft organize` (which proposes the moves) and
 * the `folder-layout-placement` / `folder-layout-layers` architecture rules
 * (which keep the result in place).
 */
import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { DependencyGraph } from './dependency-graph.js';

export type LayoutScope =
  | 'feature-local'
  | 'parent-shared'
  | 'global-shared'
  | 'core'
  | 'unresolved';

export type LayoutLayer = 'wiring' | 'ui' | 'state' | 'data-access' | 'util';

/** Import order: a layer may import the layers below it, never above. */
export const LAYOUT_LAYER_RANK: Readonly<
  Record<Exclude<LayoutLayer, 'wiring'>, number>
> = {
  ui: 3,
  state: 2,
  'data-access': 1,
  util: 0,
};

export const DEFAULT_LAYOUT_GROUP_MIN_FILES = 3;

export type LayoutZone = {
  /** `app`, or the feature's name. */
  name: string;
  /** Entry file, relative to the target root. */
  entry: string;
  /** Name path of the parent zone, `null` for the app. */
  parent: string | null;
  /** Unique path of the zone: `app`, `sessions`, `admin/users`… */
  path: string;
  /** Folder of the zone's own files, relative to the target root. */
  folder: string;
  /** Folder of what several zones under this one share. */
  sharedFolder: string;
};

export type LayoutPlacement = {
  /** Source path relative to the target root. */
  file: string;
  /** Destination folder relative to the target root; `null` when unresolved. */
  folder: string | null;
  scope: LayoutScope;
  layer: LayoutLayer;
  /** Paths of the zones that reach the file. */
  zones: string[];
  /** Bundler entries stay where the build expects them. */
  entry: boolean;
  reasons: string[];
};

export type LayoutLayerViolation = {
  file: string;
  layer: LayoutLayer;
  imported: string;
  importedLayer: LayoutLayer;
};

export type LayoutDiagnostic = {
  code: string;
  message: string;
  file?: string;
};

export type FolderLayout = {
  /** Absolute source root: the folder every layout path is relative to. */
  sourceRoot: string;
  zones: LayoutZone[];
  placements: LayoutPlacement[];
  layerViolations: LayoutLayerViolation[];
  diagnostics: LayoutDiagnostic[];
};

export type FolderLayoutOptions = {
  rootDir: string;
  tsConfigFilePath: string;
  /** Defaults to the project's `src/` folder when present. */
  sourceRoot?: string;
  /** Craft nodes give each file its layer; without them every file is `util`. */
  graph?: Pick<DependencyGraph, 'nodes'>;
  groupMinFiles?: number;
};

const posix = (path: string): string => path.split('\\').join('/');

const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/;

/** Bundler entry points: they stay where the build configuration expects them. */
export function isLayoutEntryFile(path: string): boolean {
  return /^main(\.[\w-]+)?\.[cm]?[jt]sx?$/.test(basename(path));
}

function isLayoutFile(file: string): boolean {
  const normalized = posix(file).toLowerCase();
  return (
    !normalized.endsWith('.d.ts') &&
    !/(^|\/)(generated|server|backend)(\/|$)/.test(normalized) &&
    !/\.(spec|test)\.[cm]?[jt]sx?$/.test(normalized) &&
    !normalized.endsWith('.stories.ts')
  );
}

export function slugLayoutName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `sessions.routes.ts` → `sessions`; `shop-routes.ts` → `shop`. */
function zoneName(entry: string): string {
  const name = basename(entry)
    .replace(SOURCE_EXTENSION, '')
    .replace(/[.-]routes?$/, '');
  return slugLayoutName(name) || 'feature';
}

/** `replay-stage.ts` in zone `replay` → `stage`. */
function groupName(file: string, zone: string): string {
  const name = slugLayoutName(basename(file).split('.')[0] ?? '');
  const stripped = name.startsWith(`${zone}-`)
    ? name.slice(zone.length + 1)
    : name;
  return stripped || name;
}

type SourceImports = {
  /** Runtime static imports (`import type` left out). */
  static: string[];
  /** `import()` outside a `loadChildren`: part of the importer's zone. */
  lazy: string[];
  /** `import()` inside a `loadChildren`: entries of child zones. */
  children: string[];
};

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  return (
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function insideLoadChildren(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (ts.isPropertyAssignment(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isShorthandPropertyAssignment(current)) &&
      (ts.isIdentifier(current.name) || ts.isStringLiteral(current.name)) &&
      current.name.text === 'loadChildren'
    )
      return true;
    if (ts.isSourceFile(current)) return false;
  }
  return false;
}

function readImports(
  file: string,
  options: ts.CompilerOptions,
  inventory: ReadonlySet<string>,
): SourceImports {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const result: SourceImports = {
    static: [],
    lazy: [],
    children: [],
  };
  const local = (specifier: string): string | undefined => {
    const resolved = ts.resolveModuleName(specifier, file, options, ts.sys)
      .resolvedModule?.resolvedFileName;
    const absolute = resolved ? resolve(resolved) : undefined;
    return absolute && inventory.has(absolute) ? absolute : undefined;
  };
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const typeOnly = ts.isImportDeclaration(node)
        ? isTypeOnlyImport(node)
        : node.isTypeOnly;
      if (!typeOnly) {
        const target = local(node.moduleSpecifier.text);
        if (target) result.static.push(target);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const target = local(node.arguments[0].text);
      if (target)
        (insideLoadChildren(node) ? result.children : result.lazy).push(
          target,
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

const WIRING_KINDS = new Set(['route', 'route-hook', 'route-check', 'app-config']);
const UI_KINDS = new Set(['component', 'template-element', 'styled-element']);
const DATA_ACCESS_KINDS = new Set(['http-endpoint', 'server-function-client']);
const STATE_KINDS = new Set([
  'service',
  'primitive',
  'source',
  'property',
  'unique',
  'fn-wrapper',
]);

function layerOf(
  file: string,
  kinds: ReadonlySet<string>,
  zoneEntry: boolean,
): LayoutLayer {
  const has = (set: ReadonlySet<string>) =>
    [...kinds].some((kind) => set.has(kind));
  if (zoneEntry || has(WIRING_KINDS)) return 'wiring';
  if (has(UI_KINDS) || /\.style\.[cm]?[jt]sx?$/.test(file)) return 'ui';
  if (has(DATA_ACCESS_KINDS)) return 'data-access';
  if (has(STATE_KINDS)) return 'state';
  return 'util';
}

function parseProject(tsConfigFilePath: string): ts.ParsedCommandLine {
  const read = ts.readConfigFile(tsConfigFilePath, ts.sys.readFile);
  if (read.error)
    throw new Error(
      `folder layout: invalid tsconfig ${tsConfigFilePath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`,
    );
  return ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(tsConfigFilePath),
  );
}

/** The project's `src/` folder when present, else the tsconfig's folder. */
export function defaultLayoutSourceRoot(tsConfigFilePath: string): string {
  const candidate = join(dirname(tsConfigFilePath), 'src');
  return existsSync(candidate) ? candidate : dirname(tsConfigFilePath);
}

/**
 * Immediate dominators of a graph rooted at `root` (Cooper, Harvey and
 * Kennedy): `idom.get(n)` is the last node every path from the root to `n`
 * goes through.
 */
function dominators(
  root: string,
  successors: ReadonlyMap<string, readonly string[]>,
): Map<string, string> {
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (node: string): void => {
    seen.add(node);
    for (const next of successors.get(node) ?? [])
      if (!seen.has(next)) walk(next);
    order.push(node);
  };
  walk(root);
  const postIndex = new Map(order.map((node, index) => [node, index]));
  const reversed = [...order].reverse();
  const predecessors = new Map<string, string[]>();
  for (const node of order)
    for (const next of successors.get(node) ?? [])
      if (postIndex.has(next))
        predecessors.set(next, [...(predecessors.get(next) ?? []), node]);
  const idom = new Map<string, string>([[root, root]]);
  const intersect = (left: string, right: string): string => {
    let a = left;
    let b = right;
    while (a !== b) {
      while ((postIndex.get(a) ?? 0) < (postIndex.get(b) ?? 0))
        a = idom.get(a) as string;
      while ((postIndex.get(b) ?? 0) < (postIndex.get(a) ?? 0))
        b = idom.get(b) as string;
    }
    return a;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of reversed) {
      if (node === root) continue;
      const processed = (predecessors.get(node) ?? []).filter((p) =>
        idom.has(p),
      );
      const [first, ...rest] = processed;
      if (first === undefined) continue;
      const next = rest.reduce(intersect, first);
      if (idom.get(node) !== next) {
        idom.set(node, next);
        changed = true;
      }
    }
  }
  return idom;
}

export function computeFolderLayout(options: FolderLayoutOptions): FolderLayout {
  const rootDir = resolve(options.rootDir);
  const tsConfigFilePath = resolve(rootDir, options.tsConfigFilePath);
  const sourceRoot = options.sourceRoot
    ? resolve(rootDir, options.sourceRoot)
    : defaultLayoutSourceRoot(tsConfigFilePath);
  const groupMinFiles = options.groupMinFiles ?? DEFAULT_LAYOUT_GROUP_MIN_FILES;
  const parsed = parseProject(tsConfigFilePath);
  const diagnostics: LayoutDiagnostic[] = [];
  const toTarget = (file: string) => posix(relative(sourceRoot, file));

  const files = parsed.fileNames
    .map((file) => resolve(file))
    .filter(
      (file) =>
        isLayoutFile(file) &&
        !relative(sourceRoot, file).startsWith('..') &&
        existsSync(file),
    )
    .sort();
  const inventory = new Set(files);
  const imports = new Map(
    files.map((file) => [
      file,
      readImports(file, parsed.options, inventory),
    ]),
  );
  const kinds = new Map<string, Set<string>>();
  for (const node of options.graph?.nodes ?? []) {
    if (!node.filePath) continue;
    const file = resolve(node.filePath);
    if (!inventory.has(file)) continue;
    const set = kinds.get(file) ?? new Set<string>();
    set.add(node.kind);
    kinds.set(file, set);
  }

  // ─── zones ────────────────────────────────────────────────────────────────
  const appEntries = files.filter(
    (file) => isLayoutEntryFile(file) && dirname(file) === sourceRoot,
  );
  if (appEntries.length === 0)
    diagnostics.push({
      code: 'LAYOUT_NO_ENTRY',
      message: `No main.ts at ${posix(relative(rootDir, sourceRoot))}: nothing is reached, so nothing can be placed.`,
    });
  const childImporters = new Map<string, Set<string>>();
  for (const [file, found] of imports)
    for (const child of found.children) {
      const set = childImporters.get(child) ?? new Set<string>();
      set.add(file);
      childImporters.set(child, set);
    }
  const featureEntries = [...childImporters.keys()]
    .filter((file) => !appEntries.includes(file))
    .sort();
  const boundaries = new Set([...appEntries, ...featureEntries]);
  const reachFrom = (starts: readonly string[]): Set<string> => {
    const seen = new Set<string>();
    const stack = [...starts];
    while (stack.length) {
      const file = stack.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const found = imports.get(file);
      for (const next of [...(found?.static ?? []), ...(found?.lazy ?? [])])
        if (!boundaries.has(next)) stack.push(next);
    }
    return seen;
  };
  const APP = '#app';
  const reach = new Map<string, Set<string>>([[APP, reachFrom(appEntries)]]);
  for (const entry of featureEntries) reach.set(entry, reachFrom([entry]));

  const parentOf = new Map<string, string>();
  const ancestors = (zone: string): string[] => {
    const chain = [zone];
    for (
      let current = parentOf.get(zone);
      current !== undefined;
      current = parentOf.get(current)
    ) {
      if (chain.includes(current)) break;
      chain.push(current);
    }
    return chain;
  };
  const commonZone = (zones: readonly string[]): string => {
    const [first, ...rest] = zones;
    if (first === undefined) return APP;
    const chains = rest.map(ancestors);
    return (
      ancestors(first).find((zone) =>
        chains.every((chain) => chain.includes(zone)),
      ) ?? APP
    );
  };
  const resolving = new Set<string>();
  const resolveParent = (entry: string): string => {
    const known = parentOf.get(entry);
    if (known !== undefined) return known;
    if (resolving.has(entry)) return APP;
    resolving.add(entry);
    const loaders = [...(childImporters.get(entry) ?? [])];
    const candidates = [...reach.keys()].filter(
      (zone) =>
        zone !== entry &&
        loaders.some((loader) => reach.get(zone)?.has(loader)),
    );
    for (const candidate of candidates)
      if (candidate !== APP) resolveParent(candidate);
    const parent = candidates.length ? commonZone(candidates) : APP;
    if (candidates.length === 0)
      diagnostics.push({
        code: 'LAYOUT_UNREACHED_FEATURE',
        message: 'Loaded by a loadChildren that no zone reaches; placed under the app.',
        file: toTarget(entry),
      });
    parentOf.set(entry, parent);
    resolving.delete(entry);
    return parent;
  };
  for (const entry of featureEntries) resolveParent(entry);

  const zones = new Map<string, LayoutZone>();
  zones.set(APP, {
    name: 'app',
    entry: appEntries.map(toTarget)[0] ?? 'main.ts',
    parent: null,
    path: 'app',
    folder: 'app',
    sharedFolder: 'shared',
  });
  const zoneOf = (entry: string): LayoutZone => {
    const known = zones.get(entry);
    if (known) return known;
    const parent = zoneOf(parentOf.get(entry) ?? APP);
    let name = zoneName(entry);
    const siblings = [...zones.values()].filter(
      (zone) => zone.parent === parent.path,
    );
    if (name === 'shared' || siblings.some((zone) => zone.name === name)) {
      diagnostics.push({
        code: 'LAYOUT_ZONE_NAME_COLLISION',
        message: `Feature name "${name}" is taken under ${parent.path}; rename the routes file.`,
        file: toTarget(entry),
      });
      let index = 2;
      while (siblings.some((zone) => zone.name === `${name}-${index}`))
        index += 1;
      name = `${name}-${index}`;
    }
    const isApp = parent.path === 'app';
    const zone: LayoutZone = {
      name,
      entry: toTarget(entry),
      parent: parent.path,
      path: isApp ? name : `${parent.path}/${name}`,
      folder: isApp ? `features/${name}` : `${parent.folder}/${name}`,
      sharedFolder: isApp
        ? `features/${name}/shared`
        : `${parent.folder}/${name}/shared`,
    };
    zones.set(entry, zone);
    return zone;
  };
  for (const entry of featureEntries) zoneOf(entry);

  // ─── placements ───────────────────────────────────────────────────────────
  const ownersOf = (file: string) =>
    [...reach.entries()]
      .filter(([, reached]) => reached.has(file))
      .map(([zone]) => zone);
  const placementByFile = new Map<string, LayoutPlacement>();
  const ownFiles = new Map<string, string[]>();
  for (const file of files) {
    const owners = ownersOf(file);
    const layer = layerOf(
      file,
      kinds.get(file) ?? new Set(),
      featureEntries.includes(file),
    );
    const zonePaths = owners
      .map((zone) => (zones.get(zone) as LayoutZone).path)
      .sort();
    const base = {
      file: toTarget(file),
      layer,
      zones: zonePaths,
      entry: false,
    };
    if (appEntries.includes(file)) {
      placementByFile.set(file, {
        ...base,
        folder: posix(relative(sourceRoot, dirname(file))) || '.',
        scope: 'core',
        entry: true,
        reasons: ['bundler entry point stays in place'],
      });
      continue;
    }
    if (owners.length === 0) {
      placementByFile.set(file, {
        ...base,
        folder: null,
        scope: 'unresolved',
        reasons: ['no entry reaches this file'],
      });
      continue;
    }
    const owner = commonZone(owners);
    const zone = zones.get(owner) as LayoutZone;
    if (owners.length === 1) {
      placementByFile.set(file, {
        ...base,
        folder: zone.folder,
        scope: owner === APP ? 'core' : 'feature-local',
        reasons: [
          owner === APP
            ? 'reached by the app shell only'
            : `reached by feature ${zone.path} only`,
        ],
      });
      ownFiles.set(owner, [...(ownFiles.get(owner) ?? []), file]);
      continue;
    }
    placementByFile.set(file, {
      ...base,
      folder: `${zone.sharedFolder}/${layer}`,
      scope: owner === APP ? 'global-shared' : 'parent-shared',
      reasons: [
        `reached by ${zonePaths.join(', ')}; shared under ${zone.path}`,
        `layer ${layer}`,
      ],
    });
  }

  // ─── groups: one sub-folder per file that alone reaches enough others ───
  for (const [owner, own] of ownFiles) {
    const zone = zones.get(owner) as LayoutZone;
    const members = new Set(own);
    const ROOT = '#root';
    const successors = new Map<string, string[]>();
    const entries =
      owner === APP ? appEntries : [owner].filter((file) => members.has(file));
    successors.set(ROOT, entries);
    for (const file of [...members, ...appEntries]) {
      const found = imports.get(file);
      successors.set(
        file,
        [...(found?.static ?? []), ...(found?.lazy ?? [])].filter((next) =>
          members.has(next),
        ),
      );
    }
    const idom = dominators(ROOT, successors);
    const depth = (file: string): number => {
      let count = 0;
      for (
        let current = file;
        current !== ROOT;
        current = idom.get(current) ?? ROOT
      )
        count += 1;
      return count;
    };
    const children = new Map<string, string[]>();
    for (const [node, parent] of idom)
      if (node !== ROOT)
        children.set(parent, [...(children.get(parent) ?? []), node]);
    const subtree = (file: string): string[] => [
      file,
      ...(children.get(file) ?? []).flatMap(subtree),
    ];
    // Depth 1 is the zone's entry, depth 2 its pages: a group starts below.
    const heads = [...idom.keys()]
      .filter((file) => file !== ROOT && depth(file) === 3)
      .filter((file) => subtree(file).length >= groupMinFiles)
      .sort();
    const taken = new Set([
      'shared',
      ...[...zones.values()]
        .filter((child) => child.parent === zone.path)
        .map((child) => child.name),
    ]);
    for (const head of heads) {
      const name = groupName(head, zone.name);
      if (taken.has(name)) {
        diagnostics.push({
          code: 'LAYOUT_GROUP_NAME_COLLISION',
          message: `Group "${name}" would collide with another folder of ${zone.folder}; its files stay in the zone folder.`,
          file: toTarget(head),
        });
        continue;
      }
      taken.add(name);
      for (const file of subtree(head)) {
        const placement = placementByFile.get(file);
        if (!placement || placement.entry) continue;
        placement.folder = `${zone.folder}/${name}`;
        placement.reasons.push(`only reached through ${toTarget(head)}`);
      }
    }
  }

  // ─── layers: imports point down ───────────────────────────────────────────
  const layerViolations: LayoutLayerViolation[] = [];
  for (const file of files) {
    const from = placementByFile.get(file) as LayoutPlacement;
    if (from.layer === 'wiring') continue;
    for (const imported of new Set(imports.get(file)?.static ?? [])) {
      const to = placementByFile.get(imported);
      if (!to || to.layer === 'wiring') continue;
      if (LAYOUT_LAYER_RANK[to.layer] > LAYOUT_LAYER_RANK[from.layer])
        layerViolations.push({
          file: from.file,
          layer: from.layer,
          imported: to.file,
          importedLayer: to.layer,
        });
    }
  }

  return {
    sourceRoot,
    zones: [...zones.values()].sort((a, b) => a.path.localeCompare(b.path)),
    placements: [...placementByFile.values()].sort((a, b) =>
      a.file.localeCompare(b.file),
    ),
    layerViolations: layerViolations.sort((a, b) =>
      `${a.file}\0${a.imported}`.localeCompare(`${b.file}\0${b.imported}`),
    ),
    diagnostics,
  };
}

// ─── architecture rules ─────────────────────────────────────────────────────

type LayoutFinding = { readonly target: string; readonly message: string };

const layoutCache = new WeakMap<object, FolderLayout | undefined>();

/**
 * The layout of a graph's project, computed once per graph. A graph whose
 * tsconfig is gone (a literal graph in a spec) has no files to place: the rules
 * then report nothing rather than everything.
 */
function graphLayout(graph: DependencyGraph): FolderLayout | undefined {
  if (layoutCache.has(graph)) return layoutCache.get(graph);
  const layout = existsSync(graph.tsConfigFilePath)
    ? computeFolderLayout({
        rootDir: graph.rootDir,
        tsConfigFilePath: graph.tsConfigFilePath,
        graph,
      })
    : undefined;
  layoutCache.set(graph, layout);
  return layout;
}

const fromRoot = (graph: DependencyGraph, layout: FolderLayout, file: string) =>
  posix(relative(graph.rootDir, join(layout.sourceRoot, file)));

/** `folder-layout-placement`: every file sits in the folder its imports give it. */
export function folderLayoutPlacementFindings(
  graph: DependencyGraph,
): LayoutFinding[] {
  const layout = graphLayout(graph);
  if (!layout) return [];
  return layout.placements.flatMap((placement) => {
    if (placement.entry) return [];
    const path = fromRoot(graph, layout, placement.file);
    const current = posix(dirname(placement.file));
    if (placement.folder === null)
      return [
        {
          target: `file:${path}`,
          message: `${path}: no entry reaches this file; delete it or import it.`,
        },
      ];
    if (current === placement.folder) return [];
    return [
      {
        target: `file:${path}`,
        message:
          `${path}: belongs in ${fromRoot(graph, layout, placement.folder)}/ ` +
          `(${placement.scope}, ${placement.reasons.join('; ')}). ` +
          'Run `craft organize` to propose the move.',
      },
    ];
  });
}

/** `folder-layout-layers`: ui → state → data-access → util, never upward. */
export function folderLayoutLayerFindings(
  graph: DependencyGraph,
): LayoutFinding[] {
  const layout = graphLayout(graph);
  if (!layout) return [];
  return layout.layerViolations.map((violation) => {
    const path = fromRoot(graph, layout, violation.file);
    return {
      target: `file:${path}`,
      message:
        `${path} (${violation.layer}) imports ` +
        `${fromRoot(graph, layout, violation.imported)} (${violation.importedLayer}): ` +
        `a ${violation.layer} file may only import a layer below it (ui → state → data-access → util).`,
    };
  });
}

export const FOLDER_LAYOUT_ARCHITECTURE_RULES = [
  ['folder-layout-placement', folderLayoutPlacementFindings],
  ['folder-layout-layers', folderLayoutLayerFindings],
] as const;
