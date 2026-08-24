declare module '*.css' {
  const css: string;
  export default css;
}

/**
 * The stylesheet the build emits from every `*.style.ts`. Imported once, at the
 * entry: from there on no component injects CSS at runtime.
 */
declare module 'virtual:craft-style.css';
