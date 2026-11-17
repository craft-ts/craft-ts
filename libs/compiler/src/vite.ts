import type { Plugin } from 'vite';
import { ImportedComponentGraph } from './import-graph.js';
import { compileModule, type ComponentCompilation } from './compiler.js';

export interface CraftCompilerOptions {
  /** Native DOM factories by default; opt into per-adapter blueprint cloning. */
  dom?: 'create' | 'clone';
  /** Also specialize statically proven single-component list factories (default true). */
  lists?: boolean;
  /** Opt in to build-graph proof of direct named component imports (default false). */
  imports?: boolean;
  /**
   * Light instances (opt-in trade-off): a compiled instance renders in its
   * parent's injector, receives its inputs as given, has no replay record nor
   * registry entry, and mounts anew when a parent passes it other inputs.
   */
  lean?: boolean;
  /** With `lean`: rewrite binding generators into plain functions (default true). */
  lower?: boolean;
  /** Receive decisions for every inspected module, including unsupported components. */
  onReport?: (
    filename: string,
    components: readonly ComponentCompilation[],
  ) => void;
}

/** Opt in by adding this plugin. Serve, tests, dependencies and SSR stay untouched. */
export function craftCompiler(options: CraftCompilerOptions = {}): Plugin {
  const graph = options.imports ? new ImportedComponentGraph() : undefined;
  return {
    buildStart() {
      graph?.clear();
    },
    name: 'craft-optional-compiler',
    apply: (config, { command }) => command === 'build' && !config.build?.ssr,
    enforce: 'pre',
    transform(source, id, transformOptions) {
      if (
        transformOptions?.ssr ||
        this?.environment?.config.consumer === 'server' ||
        id.includes('node_modules') ||
        id.includes('?') ||
        !/\.[cm]?ts$/.test(id)
      )
        return null;
      graph?.record(id, source);
      if (!source.includes('@craft-ts/component')) return null;
      const result = compileModule(source, id, options);
      graph?.record(id, source, result.compiledExports);
      const finish = (result: ReturnType<typeof compileModule>) => {
        if (result.components.length) options.onReport?.(id, result.components);
        return result.optimizedLists ||
          result.components.some((c) => c.status === 'compiled')
          ? { code: result.code, map: result.map }
          : null;
      };
      if (
        graph &&
        options.lists !== false &&
        result.hasForNode &&
        this?.resolve &&
        this?.load
      ) {
        return graph
          .prove(
            id,
            async (specifier, importer) => {
              const resolved = await this.resolve(specifier, importer, {
                skipSelf: true,
              });
              return resolved && !resolved.external ? resolved.id : undefined;
            },
            async (moduleId) => {
              await this.load({ id: moduleId });
            },
            (moduleId) => this.addWatchFile?.(moduleId),
          )
          .catch(() => [])
          .then((proofs) =>
            finish(
              proofs.length
                ? compileModule(source, id, {
                    ...options,
                    importedComponents: proofs,
                  })
                : result,
            ),
          );
      }
      return finish(result);
    },
  };
}
