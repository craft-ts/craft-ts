import type { Plugin } from 'vite';
import { compileModule, type ComponentCompilation } from './compiler.js';

export interface CraftCompilerOptions {
  /** Native DOM factories by default; opt into per-adapter blueprint cloning. */
  dom?: 'create' | 'clone';
  /** Also specialize statically proven single-component list factories (default true). */
  lists?: boolean;
  /** Receive decisions for every inspected module, including unsupported components. */
  onReport?: (
    filename: string,
    components: readonly ComponentCompilation[],
  ) => void;
}

/** Opt in by adding this plugin. Serve, tests, dependencies and SSR stay untouched. */
export function craftCompiler(options: CraftCompilerOptions = {}): Plugin {
  return {
    name: 'craft-optional-compiler',
    apply: (config, { command }) => command === 'build' && !config.build?.ssr,
    enforce: 'pre',
    transform(source, id, transformOptions) {
      if (
        transformOptions?.ssr ||
        this?.environment?.config.consumer === 'server' ||
        id.includes('node_modules') ||
        id.includes('?') ||
        !/\.[cm]?ts$/.test(id) ||
        !source.includes('@craft-ts/component')
      )
        return null;
      const result = compileModule(source, id, options);
      if (result.components.length) options.onReport?.(id, result.components);
      return result.components.some((c) => c.status === 'compiled')
        ? { code: result.code, map: result.map }
        : null;
    },
  };
}
