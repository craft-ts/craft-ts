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
export * from './lib/tokens';
export * from './lib/kinds';
export * from './lib/css-vars';
export * from './lib/props';
export * from './lib/axes';
export * from './lib/obligations';
export * from './lib/styles';
