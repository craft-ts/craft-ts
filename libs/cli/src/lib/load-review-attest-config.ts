import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ReviewAttestConfig,
  ReviewAttestConfigInput,
} from '@craft-ts/style-testing';
import { loadCraftTypeScriptModule } from './load-config.js';

export type LoadedReviewAttestConfig =
  | { readonly file: string; readonly config: ReviewAttestConfig }
  | { readonly file: null; readonly config: undefined };

/**
 * Loads the opt-in project config. Absence is deliberately not an error so
 * older projects can continue using the lower-level attest commands.
 */
export async function loadReviewAttestConfig(options: {
  readonly rootDir: string;
  readonly config?: string;
  readonly explicit?: boolean;
}): Promise<LoadedReviewAttestConfig> {
  const file = resolve(
    options.rootDir,
    options.config ?? 'review-attest.config.ts',
  );
  if (!existsSync(file)) {
    if (options.explicit) {
      throw new Error(`review-attest.config: '${file}' does not exist.`);
    }
    return { file: null, config: undefined };
  }
  try {
    const { defineReviewAttestConfig } = await import(
      '@craft-ts/style-testing'
    );
    const module = (await loadCraftTypeScriptModule(file)) as {
      readonly default?: unknown;
      readonly reviewAttestConfig?: unknown;
    };
    const value = module.default ?? module.reviewAttestConfig;
    if (value === undefined) {
      throw new Error(
        ` '${file}' must export reviewAttestConfig or a default config.`,
      );
    }
    return {
      file,
      config: defineReviewAttestConfig(value as ReviewAttestConfigInput),
    };
  } catch (error) {
    throw new Error(
      `review-attest.config: could not load '${file}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
