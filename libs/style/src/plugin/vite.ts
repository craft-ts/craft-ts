/**
 * The Vite plugin: evaluate the style modules in Node, emit static CSS.
 *
 * The generation never goes through the typechecker API. The plugin imports the
 * modules and reads the values they registered — which is why a `*.style.ts` is
 * only allowed to import vocabulary (the `style-file-boundary` ESLint rule),
 * and why importing one in Node is safe: there is no application code in it to
 * run.
 *
 * Every style module is bundled into **one** synthetic entry before being
 * imported. Importing them one by one would give each its own copy of the
 * registry, and deduplication across files — the whole point of atomic
 * emission — would quietly stop working.
 *
 * The bundler is Vite's own `build()` in SSR mode rather than esbuild called
 * directly: Vite 8 no longer ships esbuild, and a plugin that reaches for a
 * bundler its host does not have is a plugin that breaks on the next upgrade.
 */
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AtomicRule, RegisteredClass } from '../lib/styles.ts';
import type { CssVarDeclaration } from '../lib/css-vars.ts';
import type { RegisteredKeyframes } from '../lib/animation.ts';
import type { RegisteredFont } from '../lib/font.ts';
import { CRAFT_BASE_VARS, type GlobalRule } from '../lib/global/index.ts';
import {
  fontHeadTags,
  globalVarReads,
  renderCss,
  renderHeadTags,
  styleDump,
  validateAtoms,
  validateFoundation,
  type HeadTag,
  type StyleDump,
} from './emit.ts';

/**
 * Re-exported so a consumer can build the graph dump without running a build —
 * a test that already imported the sheets has the registry in hand.
 */
export {
  fontFaces,
  fontHeadTags,
  renderCss,
  renderHeadTags,
  styleDump,
  validateAtoms,
  validateFoundation,
  type FoundationInput,
  type HeadTag,
  type StyleDump,
} from './emit.ts';

export const VIRTUAL_CSS_ID = 'virtual:craft-style.css';
const RESOLVED_CSS_ID = '\0' + VIRTUAL_CSS_ID;

/**
 * `import head from 'virtual:craft-style-head'` — the font `<link>` tags as an
 * HTML string, for a server renderer that writes `<head>` itself. A
 * client-rendered app needs nothing: the plugin injects the same tags into
 * `index.html`.
 */
export const VIRTUAL_HEAD_ID = 'virtual:craft-style-head';
const RESOLVED_HEAD_ID = '\0' + VIRTUAL_HEAD_ID;

const DEFAULT_IGNORED = ['node_modules', 'dist', '.git', '.nx', 'tmp'];

export interface CraftStyleOptions {
  /** File suffix that marks a style module. */
  readonly suffix?: string;
  /** Directory names never walked into. */
  readonly ignore?: readonly string[];
  /** Where to write the graph dump. Skipped when absent. */
  readonly dumpPath?: string;
  /** Module aliases for the Node evaluation, e.g. a workspace source path. */
  readonly alias?: Readonly<Record<string, string>>;
  /**
   * The craft-ts reset, in `craft.reset`. On by default: an app does not write
   * its own. `false` is a deliberate opt-out.
   */
  readonly reset?: boolean;
  /**
   * The craft-ts good defaults in `craft.base` — colour scheme, focus ring,
   * reduced motion, selection. On by default.
   */
  readonly base?: boolean;
  /**
   * Style modules to evaluate from outside the project root: package names
   * (`'@craft-ts/component'`, resolved from the root) or directories.
   *
   * A library that ships components ships their sheets too — the AI overlay,
   * the pending indicator. They live in `node_modules`, which the walk of the
   * project never enters, so without this their classes would reach the DOM
   * with no CSS behind them. `@craft-ts/component` is included by default
   * whenever it resolves; list it by path inside a monorepo, where it does not.
   */
  readonly include?: readonly string[];
}

/** Always looked for; a project that does not use it simply does not resolve it. */
export const DEFAULT_STYLE_PACKAGES = ['@craft-ts/component'] as const;

/**
 * Directories to walk for an `include` entry: the directory itself, or the
 * package's root when the entry is a package name. Undefined when a package
 * does not resolve — for a default entry that is fine, for an explicit one the
 * caller reports it.
 */
export function resolveStyleInclude(
  root: string,
  entry: string,
): string | undefined {
  const asPath = isAbsolute(entry) ? entry : resolve(root, entry);
  if (
    (entry.startsWith('.') || isAbsolute(entry)) &&
    existsSync(asPath) &&
    statSync(asPath).isDirectory()
  ) {
    return asPath;
  }
  try {
    const manifest = createRequire(join(root, 'package.json')).resolve(
      `${entry}/package.json`,
    );
    return dirname(manifest);
  } catch {
    return undefined;
  }
}

/**
 * Every style module the project emits: its own, and those of the included
 * packages. Published packages ship `*.style.js`, sources ship `*.style.ts`.
 */
export async function findProjectStyleModules(
  root: string,
  options: Pick<CraftStyleOptions, 'suffix' | 'ignore' | 'include'> = {},
): Promise<readonly string[]> {
  const own = await findStyleModules(root, options.suffix, options.ignore);
  const included: string[] = [];
  const explicit = options.include ?? [];
  for (const entry of [...DEFAULT_STYLE_PACKAGES, ...explicit]) {
    const directory = resolveStyleInclude(root, entry);
    if (!directory) {
      if (explicit.includes(entry)) {
        throw new Error(
          `craft-style: '${entry}' in include resolves to no directory and no package. Pass a directory path, or a package installed from ${root}.`,
        );
      }
      continue;
    }
    for (const suffix of ['.style.ts', '.style.js']) {
      included.push(
        ...(await findStyleModules(directory, suffix, options.ignore)),
      );
    }
  }
  return [...new Set([...own, ...included])].sort();
}

interface Registry {
  readonly classes: readonly RegisteredClass[];
  readonly atoms: readonly AtomicRule[];
  readonly vars: readonly CssVarDeclaration[];
  readonly globals: readonly GlobalRule[];
  readonly keyframes: readonly RegisteredKeyframes[];
  readonly fonts: readonly RegisteredFont[];
}

/** Sorted, so that two runs on the same tree evaluate in the same order. */
export async function findStyleModules(
  root: string,
  suffix = '.style.ts',
  ignore: readonly string[] = DEFAULT_IGNORED,
): Promise<readonly string[]> {
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignore.includes(entry.name) && !entry.name.startsWith('.')) {
          await walk(path);
        }
      } else if (entry.name.endsWith(suffix)) {
        found.push(path);
      }
    }
  };
  await walk(root);
  return found.sort();
}

/** Bundles the given style modules and reads the registry they filled. */
export async function evaluateStyleModules(
  files: readonly string[],
  alias: Readonly<Record<string, string>> = {},
): Promise<Registry> {
  const { build } = await import('vite');
  const directory = await mkdtemp(join(tmpdir(), 'craft-style-'));
  try {
    const entry = join(directory, 'entry.mjs');
    // Each module is imported as a **namespace** and re-exported, not imported
    // for its side effects. `@craft-ts/style` is marked `sideEffects: false`,
    // so a bare side-effect import lets the bundler drop the very calls the
    // registry is built from — silently, and only for some of them.
    const sorted = [...files].sort();
    const imports = sorted
      .map(
        (file, index) =>
          `import * as module${index} from ${JSON.stringify(pathToFileURL(file).href)};`,
      )
      .join('\n');
    const held = sorted.map((_, index) => `module${index}`).join(', ');
    await writeFile(
      entry,
      `${imports}\nexport const evaluated = [${held}];\nexport { registeredAtoms, registeredClasses, registeredVars, registeredGlobalRules, registeredKeyframes, registeredFonts } from '@craft-ts/style';\n`,
    );

    await build({
      configFile: false,
      logLevel: 'silent',
      resolve: { alias: { ...alias } },
      // Nothing may stay external: an externalised `@craft-ts/style` would be
      // resolved again at import time and hand back a second, empty registry.
      ssr: { noExternal: true },
      build: {
        ssr: entry,
        outDir: directory,
        emptyOutDir: false,
        minify: false,
        write: true,
        rollupOptions: {
          output: { format: 'cjs', entryFileNames: 'bundle.cjs' },
        },
      },
    });

    // Loaded through `require` rather than `import()`: a test runner sitting on
    // top of this module intercepts dynamic imports and resolves them against
    // its own module graph, where a file in a temp directory does not exist.
    // `require` goes to the filesystem, in the runner and in a real build alike.
    const module = createRequire(import.meta.url)(
      join(directory, 'bundle.cjs'),
    ) as {
      registeredClasses(): readonly RegisteredClass[];
      registeredAtoms(): readonly AtomicRule[];
      registeredVars(): readonly CssVarDeclaration[];
      registeredGlobalRules(): readonly GlobalRule[];
      registeredKeyframes(): readonly RegisteredKeyframes[];
      registeredFonts(): readonly RegisteredFont[];
    };
    return {
      classes: module.registeredClasses(),
      atoms: module.registeredAtoms(),
      vars: module.registeredVars(),
      globals: module.registeredGlobalRules(),
      keyframes: module.registeredKeyframes(),
      fonts: module.registeredFonts(),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export interface EmitResult {
  readonly css: string;
  readonly dump: StyleDump;
  /** The font `<link>` tags for `<head>`. */
  readonly head: readonly HeadTag[];
}

export interface EmitOptions {
  readonly reset?: boolean;
  readonly base?: boolean;
}

export async function emitStyles(
  files: readonly string[],
  alias?: Readonly<Record<string, string>>,
  options: EmitOptions = {},
): Promise<EmitResult> {
  const registry = await evaluateStyleModules(files, alias);
  const source = files.join(', ');
  const foundation = {
    reset: options.reset ?? true,
    base: options.base ?? true,
    globals: registry.globals,
    keyframes: registry.keyframes,
    fonts: registry.fonts,
  };
  validateAtoms(registry.atoms, source);
  validateFoundation(foundation, source);
  // The foundation's variables are declared by the emitter, not by a sheet;
  // the dump lists them so that a sheet reading `craftBase.accent` does not
  // look like it reads an undeclared variable.
  const vars = foundation.base
    ? [...registry.vars, ...CRAFT_BASE_VARS]
    : registry.vars;
  return {
    css: renderCss(registry.atoms, registry.vars, foundation),
    dump: {
      ...styleDump(registry.classes, registry.atoms, vars),
      globalReads: globalVarReads(foundation),
    },
    head: fontHeadTags(registry.fonts),
  };
}

/**
 * The style dump of a project, without a Vite server: every `*.style.ts`
 * under `rootDir`, evaluated in Node.
 *
 * What an architecture spec merges into its graph
 * (`mergeStyleDump(graph, await loadStyleDump(appDir))`), so the style rules
 * read the same picture the build emits.
 */
export async function loadStyleDump(
  rootDir: string,
  options: Pick<
    CraftStyleOptions,
    'suffix' | 'ignore' | 'alias' | 'reset' | 'base' | 'include'
  > = {},
): Promise<StyleDump> {
  const files = await findProjectStyleModules(rootDir, options);
  if (files.length === 0) {
    return { version: 2, classes: [], atoms: [], vars: [], globalReads: [] };
  }
  const { dump } = await emitStyles(files, options.alias, {
    reset: options.reset,
    base: options.base,
  });
  return dump;
}

/**
 * Minimal shape of the Vite plugin object, declared here rather than imported.
 *
 * `vite` is a peer, not a dependency: a consumer building with something else
 * can still call `emitStyles` without pulling Vite's types in.
 */
export interface CraftStylePlugin {
  readonly name: string;
  readonly enforce?: 'pre' | 'post';
  configResolved?(config: { readonly root: string }): void;
  resolveId?(id: string): string | undefined;
  load?(id: string): Promise<string | undefined>;
  transformIndexHtml?(): Promise<HeadTag[]>;
  handleHotUpdate?(context: {
    readonly file: string;
    readonly server: {
      readonly ws: {
        send(message: {
          readonly type: 'full-reload';
          readonly path: '*';
        }): void | Promise<void>;
      };
    };
  }): void;
}

/**
 * `import 'virtual:craft-style.css'` once, at the app entry, and the whole
 * stylesheet arrives — built, not computed. No class is ever assembled at
 * runtime, so what the browser gets is what the emitter proved.
 */
export function craftStyle(options: CraftStyleOptions = {}): CraftStylePlugin {
  let root = process.cwd();
  let cached: EmitResult | undefined;

  const emitted = async (): Promise<EmitResult> => {
    if (cached) return cached;
    const files = await findProjectStyleModules(root, options);
    cached = await emitStyles(files, options.alias, {
      reset: options.reset,
      base: options.base,
    });
    if (options.dumpPath) {
      await writeFile(
        options.dumpPath,
        JSON.stringify(cached.dump, null, 2) + '\n',
      );
    }
    return cached;
  };

  return {
    name: 'craft-style',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === VIRTUAL_CSS_ID) return RESOLVED_CSS_ID;
      if (id === VIRTUAL_HEAD_ID) return RESOLVED_HEAD_ID;
      return undefined;
    },
    async load(id) {
      if (id === RESOLVED_CSS_ID) return (await emitted()).css;
      if (id === RESOLVED_HEAD_ID) {
        return `export default ${JSON.stringify(renderHeadTags((await emitted()).head))};\n`;
      }
      return undefined;
    },
    async transformIndexHtml() {
      return [...(await emitted()).head];
    },
    handleHotUpdate(context) {
      // A style module changed: the whole sheet is re-derived rather than
      // patched. Atomic output is small and the emission is one bundle away —
      // an incremental path here would be a second source of truth. The
      // stylesheet is a virtual module imported once by the app entry, so
      // invalidating the cache alone would leave the browser on old CSS.
      if (context.file.endsWith(options.suffix ?? '.style.ts')) {
        cached = undefined;
        context.server.ws.send({ type: 'full-reload', path: '*' });
      }
    },
  };
}
