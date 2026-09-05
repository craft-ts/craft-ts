/**
 * `@craft-ts/style-testing` — what a component can look like, enumerated, and
 * what a person has already agreed to.
 *
 * Two tiers, and they are not in competition:
 *
 * - **the matrix** comes from the metadata the sheets already carry: an axis a
 *   class never crosses contributes nothing, and every point it does cross
 *   carries the driver that reaches it. Nothing here parses CSS.
 * - **the digest** is what a render actually produced — boxes, intrinsic
 *   sizes, a closed list of styles, and a handful of discrete facts. It is what
 *   a human judges, and what makes overflow, truncation, overlap and contrast
 *   decidable without one.
 *
 * The register that stores those judgements lives in `@craft-ts/attest` and
 * knows nothing about any of this. That direction is deliberate.
 */
export * from './lib/matrix.ts';
export * from './lib/drivers.ts';
export * from './lib/exhaustive.ts';
export * from './lib/determinism.ts';
export * from './lib/digest.ts';
export * from './lib/assertions.ts';
export * from './lib/transitions.ts';
export * from './lib/margin.ts';
export * from './lib/attest.ts';
