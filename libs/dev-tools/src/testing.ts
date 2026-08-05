/**
 * Type-level testing helpers.
 *
 * Re-exported from `test-type` so applications get them from a published
 * package instead of an internal path:
 *
 * ```ts
 * import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
 * ```
 *
 * These are types only — nothing is emitted at runtime.
 */
export type { Equal, Expect, PrettifyEqual } from 'test-type';
