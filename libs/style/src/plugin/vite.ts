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
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AtomicRule, RegisteredClass } from '../lib/styles.ts';
import type { CssVarDeclaration } from '../lib/css-vars.ts';
import { renderCss, styleDump, validateAtoms, type StyleDump } from './emit.ts';

/**
 * Re-exported so a consumer can build the graph dump without running a build —
 * a test that already imported the sheets has the registry in hand.
 */
export { renderCss, styleDump, validateAtoms, type StyleDump } from './emit.ts';

export const VIRTUAL_CSS_ID = 'virtual:craft-style.css';
const RESOLVED_CSS_ID = '\0' + VIRTUAL_CSS_ID;

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
}

interface Registry {
  readonly classes: readonly RegisteredClass[];
  readonly atoms: readonly AtomicRule[];
  readonly vars: readonly CssVarDeclaration[];
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
      `${imports}\nexport const evaluated = [${held}];\nexport { registeredAtoms, registeredClasses, registeredVars } from '@craft-ts/style';\n`,
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
    };
    return {
      classes: module.registeredClasses(),
      atoms: module.registeredAtoms(),
      vars: module.registeredVars(),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export interface EmitResult {
  readonly css: string;
  readonly dump: StyleDump;
}

export async function emitStyles(
  files: readonly string[],
  alias?: Readonly<Record<string, string>>,
): Promise<EmitResult> {
  const registry = await evaluateStyleModules(files, alias);
  validateAtoms(registry.atoms, files.join(', '));
  return {
    css: renderCss(registry.atoms, registry.vars),
    dump: styleDump(registry.classes, registry.atoms, registry.vars),
  };
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

  return {
    name: 'craft-style',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === VIRTUAL_CSS_ID ? RESOLVED_CSS_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_CSS_ID) return undefined;
      const files = await findStyleModules(
        root,
        options.suffix,
        options.ignore,
      );
      cached ??= await emitStyles(files, options.alias);
      if (options.dumpPath) {
        await writeFile(
          options.dumpPath,
          JSON.stringify(cached.dump, null, 2) + '\n',
        );
      }
      return cached.css;
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
