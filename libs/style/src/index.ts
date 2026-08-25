/**
 * `@craft-ts/style` — the whole style vocabulary.
 *
 * Tokens, kinds, typed custom properties, the generated property table, axes,
 * sheets and context obligations. The core carries two opaque channels for it
 * and interprets neither; every piece of CSS meaning lives here.
 *
 * The build-time emitter is a separate entry point (`@craft-ts/style/vite`) so
 * that importing the vocabulary never drags Node APIs into the browser bundle.
 */
export * from './lib/tokens/index.ts';
export * from './lib/kinds.ts';
export * from './lib/css-vars.ts';
export * from './lib/props/index.ts';
export * from './lib/axes.ts';
export * from './lib/obligations.ts';
export * from './lib/styles.ts';
