/**
 * `@craft-ts/style-testing` — what a component can look like, enumerated.
 *
 * The matrix comes from the metadata the sheets already carry: an axis a class
 * never crosses contributes nothing, and every point it does cross carries the
 * driver that reaches it. Nothing here parses CSS or re-derives the design
 * system; it reads the same registry the emitter reads.
 */
export * from './lib/matrix.ts';
export * from './lib/drivers.ts';
export * from './lib/exhaustive.ts';
