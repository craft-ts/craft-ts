/**
 * Angular's demo builder loads `.css` as text (`loader: { ".css": "text" }`).
 * Vite treats CSS as a stylesheet, so `import styles from './x.css' with { loader: 'text' }`
 * fails with "does not provide an export named 'default'". Rewrite those imports
 * to Vite's `?raw` query before esbuild sees the import attributes.
 */
const TEXT_LOADER_FROM =
  /\bfrom\s*(['"])([^'"]+)\1\s+with\s*\{\s*loader\s*:\s*(['"])text\3\s*\}/g;

export function rewriteTextLoaderImports(source) {
  return source.replace(
    TEXT_LOADER_FROM,
    (_match, quote, specifier) => {
      const withRaw = specifier.includes('?')
        ? /(?:^|[?&])raw(?:&|$)/.test(specifier.split('?')[1] ?? '')
          ? specifier
          : `${specifier}&raw`
        : `${specifier}?raw`;
      return `from ${quote}${withRaw}${quote}`;
    },
  );
}

export function craftTextLoaderPlugin() {
  return {
    name: 'craft-text-loader',
    enforce: 'pre',
    transform(code, id) {
      const filename = id.split('?', 1)[0];
      if (!/\.[cm]?[jt]sx?$/.test(filename)) {
        return null;
      }
      const next = rewriteTextLoaderImports(code);
      if (next === code) {
        return null;
      }
      return { code: next, map: null };
    },
  };
}
